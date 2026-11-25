const { createHash, createHmac, randomBytes, timingSafeEqual } = require('crypto');

const SESSION_COOKIE = 'jg_messaging_session';
const REFRESH_COOKIE = 'jg_messaging_refresh';
const MAX_RECIPIENTS = 50;
const SEND_CONCURRENCY = 2;
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|z|([+-])(\d{2}):(\d{2}))$/;
const SESSION_TTL_SECONDS = 15 * 60;
// Browsers cap persistent cookies at roughly 400 days. Rotate on use.
const REFRESH_TTL_SECONDS = 400 * 24 * 60 * 60;
const APPROVAL_TTL_MS = 2 * 60 * 1000;
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginBuckets = new Map();

function roleMeetsRequirement(role, requiredRole) {
  return role === 'admin' || (requiredRole === 'operator' && role === 'operator');
}

function createRoleGuard(resolveSession) {
  return async function requireRole(req, res, requiredRole = 'operator') {
    let session;
    try { session = await resolveSession(req); }
    catch {
      res.status(503).json({ error: 'authentication_unavailable' });
      return null;
    }
    if (!session) {
      res.status(401).json({ error: 'authentication_required' });
      return null;
    }
    if (!roleMeetsRequirement(session.role, requiredRole)) {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    return session;
  };
}

function parseCookie(cookieHeader, name = SESSION_COOKIE) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 16384) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    if (!value.length || value.length > 4096) return null;
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return null;
}

function isValidE164(value) {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}

function parseRecipients(input) {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'recipient_list_required' };
  if (input.length > MAX_RECIPIENTS) return { ok: false, error: 'recipient_limit_exceeded' };
  const unique = new Set();
  for (const raw of input) {
    if (typeof raw !== 'string') return { ok: false, error: 'recipient_number_invalid' };
    const recipient = raw.trim();
    if (!isValidE164(recipient)) return { ok: false, error: 'recipient_number_invalid' };
    unique.add(recipient);
  }
  if (unique.size === 0) return { ok: false, error: 'recipient_list_required' };
  return { ok: true, recipients: [...unique] };
}

function parseRfc3339Timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (day < 1 || day > daysInMonth) return null;

  let offsetMinutes = 0;
  if (offsetSign) {
    const offsetHour = Number(offsetHourText), offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 23 || offsetMinute > 59) return null;
    const magnitude = offsetHour * 60 + offsetMinute;
    offsetMinutes = offsetSign === '+' ? magnitude : -magnitude;
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (!Number.isFinite(local.getTime()) || local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return null;
  const utcSecondMilliseconds = local.getTime() - offsetMinutes * 60_000;
  const utcSecond = new Date(utcSecondMilliseconds);
  if (!Number.isFinite(utcSecondMilliseconds) || utcSecond.getUTCFullYear() < 0 || utcSecond.getUTCFullYear() > 9999) return null;

  const fractionalNanoseconds = BigInt((fraction || '0').padEnd(9, '0'));
  const fractionalText = fractionalNanoseconds % 1_000_000n === 0n
    ? (fractionalNanoseconds / 1_000_000n).toString().padStart(3, '0')
    : fractionalNanoseconds.toString().padStart(9, '0').replace(/0+$/, '');
  const canonical = `${utcSecond.toISOString().slice(0, 19)}.${fractionalText}Z`;
  const epochNanoseconds = BigInt(utcSecondMilliseconds) * 1_000_000n + fractionalNanoseconds;
  return { canonical, epochNanoseconds, epochMilliseconds: Number(epochNanoseconds) / 1_000_000 };
}

function canonicalTimestamp(value) {
  return parseRfc3339Timestamp(value)?.canonical || null;
}

function timestampNanoseconds(value) {
  return parseRfc3339Timestamp(value)?.epochNanoseconds ?? null;
}

function sameInstant(left, right) {
  const a = timestampNanoseconds(left), b = timestampNanoseconds(right);
  return a !== null && b !== null && a === b;
}

function nowNanoseconds(now) {
  if (!Number.isFinite(now)) return null;
  return BigInt(Math.trunc(now)) * 1_000_000n;
}

function canonicalExpiry(value) {
  return parseRfc3339Timestamp(value)?.epochMilliseconds ?? null;
}

function parseSendRequest(body, now = Date.now()) {
  const group = body?.group;
  const templateId = typeof body?.templateId === 'string' ? body.templateId : '';
  const requestId = body?.requestId;
  if (!group || typeof group !== 'object' || Array.isArray(group) || typeof group.name !== 'string' || group.name.trim().length < 1 || group.name.length > 80 || !templateId || templateId.length > 128 || !isUuid(requestId)) {
    return { ok: false, error: 'send_request_invalid' };
  }
  const parsed = parseRecipients(group.list);
  if (!parsed.ok) return parsed;
  if (!['automatic', 'custom'].includes(group.kind) || !['show', 'standalone'].includes(group.scope)) {
    return { ok: false, error: 'send_group_scope_invalid' };
  }
  const expiresAtIso = canonicalTimestamp(group.expiresAtIso);
  const expiresAtNanoseconds = timestampNanoseconds(group.expiresAtIso);
  const nowNs = nowNanoseconds(now);
  if (!expiresAtIso || expiresAtNanoseconds === null || nowNs === null || expiresAtNanoseconds <= nowNs) {
    return { ok: false, error: 'send_group_expiry_invalid' };
  }
  const showId = group.showId;
  const showStartsAt = group.scope === 'show' ? canonicalTimestamp(group.showStartsAt) : null;
  const showEndsAt = group.scope === 'show' ? canonicalTimestamp(group.showEndsAt) : null;
  const showName = group.showName;
  const showLocation = group.showLocation;
  const deliveryType = group.deliveryType;
  const bookingDistinction = group.bookingDistinction;
  if (group.scope === 'show') {
    if (typeof showId !== 'string' || !showId.trim() || showId.length > 256) return { ok: false, error: 'show_id_required' };
    const startNanoseconds = timestampNanoseconds(showStartsAt);
    const endNanoseconds = timestampNanoseconds(showEndsAt);
    if (!showStartsAt || !showEndsAt || startNanoseconds === null || endNanoseconds === null || endNanoseconds <= startNanoseconds) {
      return { ok: false, error: 'show_time_identity_invalid' };
    }
    if (typeof showName !== 'string' || !showName.trim() || showName.length > 120 ||
        (showLocation !== undefined && showLocation !== null && (typeof showLocation !== 'string' || showLocation.length > 500)) ||
        !['private', 'public', 'direct_booking', 'unknown'].includes(deliveryType) ||
        !['Private DMN', 'Public DMN', 'Direct booking', 'DMN booking'].includes(bookingDistinction)) {
      return { ok: false, error: 'show_identity_invalid' };
    }
  } else {
    if (group.kind !== 'custom' || (showId !== undefined && showId !== null && showId !== '') ||
        expiresAtNanoseconds > nowNs + 24n * 60n * 60n * 1_000_000_000n) {
      return { ok: false, error: 'standalone_expiry_invalid' };
    }
  }
  if (group.scope === 'show' && group.kind === 'automatic' && !showId) return { ok: false, error: 'show_id_required' };
  return {
    ok: true,
    requestId,
    templateId,
    groupName: group.name.trim(),
    groupKind: group.kind,
    groupScope: group.scope,
    showId: group.scope === 'show' ? showId.trim() : null,
    showStartsAt: group.scope === 'show' ? showStartsAt : null,
    showEndsAt: group.scope === 'show' ? showEndsAt : null,
    showName: group.scope === 'show' ? showName.trim() : null,
    showLocation: group.scope === 'show' ? (showLocation || null) : null,
    deliveryType: group.scope === 'show' ? deliveryType : null,
    bookingDistinction: group.scope === 'show' ? bookingDistinction : null,
    expiresAtIso,
    recipients: parsed.recipients
  };
}

function allowedSenders(env = process.env) {
  const configured = [
    ...(env.TWILIO_ALLOWED_FROM_NUMBERS || '').split(','),
    env.DEFAULT_FROM_NUMBER_UK,
    env.DEFAULT_FROM_NUMBER_UK_ALT,
    env.DEFAULT_FROM_NUMBER_US,
    env.TWILIO_VOICE_FALLBACK_FROM,
  ];
  return [...new Set(configured.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(isValidE164))];
}

function allowedMediaHosts(env = process.env) {
  return new Set((env.TWILIO_ALLOWED_MEDIA_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean));
}

function isAllowedMediaUrl(rawUrl, env = process.env) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return false;
  const hosts = allowedMediaHosts(env);
  if (!hosts.size) return false;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) return false;
    return hosts.has(hostname);
  } catch {
    return false;
  }
}

function validateTemplateForSend(template, env = process.env) {
  if (!template || typeof template !== 'object') return { ok: false, error: 'template_invalid' };
  const type = String(template.type || '').trim().toLowerCase();
  if (!['sms', 'whatsapp', 'call'].includes(type)) return { ok: false, error: 'template_type_invalid' };
  if (type === 'whatsapp') return { ok: false, error: 'whatsapp_content_template_required' };
  const from = template.from_number ?? template.from ?? template.fromNumber ?? template.sender;
  if (!isValidE164(from) || !allowedSenders(env).includes(from)) return { ok: false, error: 'template_sender_not_allowed' };
  const content = typeof template.content === 'string' ? template.content : '';
  if (type !== 'call' && (!content.trim() || content.length > 1600)) return { ok: false, error: 'template_content_invalid' };
  const mediaUrl = template.media_url ?? template.mediaUrl ?? template.mp3Url ?? '';
  if (type === 'call' && !isAllowedMediaUrl(mediaUrl, env)) return { ok: false, error: 'template_media_not_allowed' };
  return { ok: true, template: { type, from, content, ...(type === 'call' ? { mediaUrl } : {}) } };
}

function validateTemplateDraft(input, env = process.env, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'template_invalid' };
  const allowed = new Set(['name', 'type', 'show', 'from_number', 'content', 'media_url', 'summary']);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'template_field_invalid' };
  const merged = { ...existing, ...input };
  const name = typeof merged.name === 'string' ? merged.name.trim() : '';
  const show = typeof merged.show === 'string' ? merged.show.trim() : '';
  const type = String(merged.type || '').trim().toLowerCase();
  const from = merged.from_number;
  const content = typeof merged.content === 'string' ? merged.content : '';
  const mediaUrl = typeof merged.media_url === 'string' ? merged.media_url.trim() : '';
  const summary = typeof merged.summary === 'string' ? merged.summary : '';
  if (!name || name.length > 120 || !show || show.length > 120) return { ok: false, error: 'template_name_or_show_invalid' };
  if (!['sms', 'whatsapp', 'call'].includes(type)) return { ok: false, error: 'template_type_invalid' };
  if (type === 'whatsapp') return { ok: false, error: 'whatsapp_content_template_required' };
  if (!isValidE164(from) || !allowedSenders(env).includes(from)) return { ok: false, error: 'template_sender_not_allowed' };
  if (content.length > 1600 || summary.length > 500) return { ok: false, error: 'template_content_invalid' };
  if (type === 'call' && mediaUrl && !isAllowedMediaUrl(mediaUrl, env)) return { ok: false, error: 'template_media_not_allowed' };
  if (type !== 'call' && mediaUrl) return { ok: false, error: 'template_media_not_allowed' };
  return { ok: true, template: { name, type: type === 'whatsapp' ? 'WhatsApp' : type === 'call' ? 'Call' : 'SMS', show, from_number: from, content, media_url: mediaUrl, summary } };
}

function isTrustedMutation(req, env = process.env) {
  if (req?.headers?.['x-jurygames-request'] !== '1') return false;
  const origin = req?.headers?.origin;
  if (typeof origin !== 'string') return false;
  try {
    const originUrl = new URL(origin);
    if (env.PUBLIC_BASE_URL) return originUrl.origin === new URL(env.PUBLIC_BASE_URL).origin;
    const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
    const proto = req?.headers?.['x-forwarded-proto'] || (host?.startsWith('localhost') ? 'http' : 'https');
    return typeof host === 'string' && originUrl.origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNewSendClaim(claim) {
  return Boolean(claim && claim.claimed === true);
}

function summarizeProviderOutcomes(outcomes) {
  if (!Array.isArray(outcomes)) throw new Error('invalid_provider_outcomes');
  let acceptedCount = 0;
  const providerStatuses = {};
  for (const outcome of outcomes) {
    if (!outcome || typeof outcome.accepted !== 'boolean' || typeof outcome.providerStatus !== 'string' ||
        !/^[A-Za-z0-9_-]{1,32}$/.test(outcome.providerStatus)) throw new Error('invalid_provider_outcome');
    if (outcome.accepted) acceptedCount += 1;
    providerStatuses[outcome.providerStatus] = (providerStatuses[outcome.providerStatus] || 0) + 1;
  }
  return { acceptedCount, failedCount: outcomes.length - acceptedCount, providerStatuses };
}

function readAccessTokenClaims(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

function sessionExpiresAt(token, expectedUserId, now = Date.now()) {
  const claims = readAccessTokenClaims(token);
  if (claims?.sub !== expectedUserId || !Number.isSafeInteger(claims.exp)) return null;
  const issuedAt = Number.isSafeInteger(claims.iat) ? claims.iat * 1000 : now;
  return Math.min(claims.exp * 1000, issuedAt + SESSION_TTL_SECONDS * 1000);
}

function canSend(env = process.env) {
  const approvalSecret = env.MESSAGING_APPROVAL_SECRET;
  return env.MESSAGING_SEND_ENABLED === 'true' && env.MESSAGING_CONSENT_REVIEWED === 'true' &&
    env.MESSAGING_MANUAL_LISTS_REVIEWED === 'true' &&
    typeof approvalSecret === 'string' && Buffer.byteLength(approvalSecret, 'utf8') >= 32;
}

function templateFingerprint(template) {
  const approvedFields = {
    id: String(template?.id ?? ''),
    name: String(template?.name ?? ''),
    show: String(template?.show ?? ''),
    type: String(template?.type ?? '').toLowerCase(),
    from: String(template?.from_number ?? template?.from ?? template?.fromNumber ?? template?.sender ?? ''),
    content: typeof template?.content === 'string' ? template.content : '',
    mediaUrl: String(template?.media_url ?? template?.mediaUrl ?? template?.mp3Url ?? ''),
    summary: typeof template?.summary === 'string' ? template.summary : '',
  };
  return createHash('sha256').update(JSON.stringify(approvedFields)).digest('base64url');
}

function recipientFingerprint(secret, recipients) {
  const canonical = [...new Set(recipients)].sort().join('\n');
  return createHmac('sha256', secret).update('recipients\0').update(canonical).digest('base64url');
}

function createSignedReviewToken(input, purpose, consentAcknowledged, env = process.env, now = Date.now()) {
  const secret = env.MESSAGING_APPROVAL_SECRET;
  const expiresAtIso = canonicalTimestamp(input?.expiresAtIso);
  const expiresAtNanoseconds = timestampNanoseconds(input?.expiresAtIso);
  const nowNs = nowNanoseconds(now);
  const showStartsAt = input?.groupScope === 'show' ? canonicalTimestamp(input.showStartsAt) : null;
  const showEndsAt = input?.groupScope === 'show' ? canonicalTimestamp(input.showEndsAt) : null;
  const startNanoseconds = timestampNanoseconds(showStartsAt);
  const endNanoseconds = timestampNanoseconds(showEndsAt);
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      typeof input?.actorId !== 'string' || !input.actorId || !isUuid(input.requestId) ||
      typeof input.templateId !== 'string' || !input.templateId ||
      typeof input.groupName !== 'string' || !input.groupName.trim() ||
      !['automatic', 'custom'].includes(input.groupKind) || !['show', 'standalone'].includes(input.groupScope) ||
      !expiresAtIso || expiresAtNanoseconds === null || nowNs === null || expiresAtNanoseconds <= nowNs ||
      (input.groupScope === 'show' && (typeof input.showId !== 'string' || !input.showId.trim() || input.showId.length > 256)) ||
      (input.groupScope === 'show' && (!showStartsAt || !showEndsAt || startNanoseconds === null || endNanoseconds === null || endNanoseconds <= startNanoseconds)) ||
      (input.groupScope === 'show' && (typeof input.showName !== 'string' || !input.showName.trim() || input.showName.length > 120 ||
        (input.showLocation !== null && input.showLocation !== undefined && (typeof input.showLocation !== 'string' || input.showLocation.length > 500)) ||
        !['private', 'public', 'direct_booking', 'unknown'].includes(input.deliveryType) ||
        !['Private DMN', 'Public DMN', 'Direct booking', 'DMN booking'].includes(input.bookingDistinction))) ||
      (input.groupScope === 'standalone' && (input.groupKind !== 'custom' || (input.showId !== null && input.showId !== undefined) ||
        expiresAtNanoseconds > nowNs + 24n * 60n * 60n * 1_000_000_000n)) ||
      input.consentAcknowledged !== consentAcknowledged ||
      !Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > MAX_RECIPIENTS ||
      input.recipients.some((recipient) => !isValidE164(recipient)) || typeof input.resolvedFrom !== 'string' ||
      !isValidE164(input.resolvedFrom) || !input.template || typeof input.template !== 'object') return null;

  const payload = {
    version: 2,
    purpose,
    actorId: input.actorId,
    requestId: input.requestId,
    templateId: input.templateId,
    groupName: input.groupName.trim(),
    groupKind: input.groupKind,
    groupScope: input.groupScope,
    showId: input.groupScope === 'show' ? input.showId.trim() : null,
    showStartsAt,
    showEndsAt,
    showName: input.groupScope === 'show' ? input.showName.trim() : null,
    showLocation: input.groupScope === 'show' ? (input.showLocation || null) : null,
    deliveryType: input.groupScope === 'show' ? input.deliveryType : null,
    bookingDistinction: input.groupScope === 'show' ? input.bookingDistinction : null,
    expiresAtIso,
    consentAcknowledged,
    recipientFingerprint: recipientFingerprint(secret, input.recipients),
    templateFingerprint: templateFingerprint(input.template),
    resolvedFrom: input.resolvedFrom,
    expiresAt: now + APPROVAL_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function createPreviewToken(input, env = process.env, now = Date.now()) {
  return createSignedReviewToken({ ...input, consentAcknowledged: false }, 'preview', false, env, now);
}

function createApprovalToken(input, env = process.env, now = Date.now()) {
  return createSignedReviewToken(input, 'approved', true, env, now);
}

function verifyReviewToken(token, expected, purpose, consentAcknowledged, env = process.env, now = Date.now()) {
  const secret = env.MESSAGING_APPROVAL_SECRET;
  const expectedExpiresAtIso = canonicalTimestamp(expected?.expiresAtIso);
  const expectedShowStartsAt = expected?.groupScope === 'show' ? canonicalTimestamp(expected.showStartsAt) : null;
  const expectedShowEndsAt = expected?.groupScope === 'show' ? canonicalTimestamp(expected.showEndsAt) : null;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32 ||
      typeof token !== 'string' || token.length > 2048 || !expected?.template ||
      !Array.isArray(expected.recipients) || expected.recipients.length < 1 || expected.recipients.length > MAX_RECIPIENTS ||
      expected.recipients.some((recipient) => !isValidE164(recipient))) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{1,1800}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const expectedSignature = createHmac('sha256', secret).update(parts[0]).digest();
  const receivedSignature = Buffer.from(parts[1], 'base64url');
  if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual(expectedSignature, receivedSignature)) return false;

  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { return false; }
  return payload?.version === 2 && payload.purpose === purpose && payload.actorId === expected.actorId && payload.requestId === expected.requestId &&
    payload.templateId === expected.templateId && payload.groupName === expected.groupName?.trim() &&
    payload.groupKind === expected.groupKind && payload.groupScope === expected.groupScope &&
    payload.showId === (expected.groupScope === 'show' ? expected.showId : null) && payload.expiresAtIso === expectedExpiresAtIso &&
    payload.showStartsAt === expectedShowStartsAt &&
    payload.showEndsAt === expectedShowEndsAt &&
    payload.showName === (expected.groupScope === 'show' ? expected.showName : null) &&
    payload.showLocation === (expected.groupScope === 'show' ? (expected.showLocation || null) : null) &&
    payload.deliveryType === (expected.groupScope === 'show' ? expected.deliveryType : null) &&
    payload.bookingDistinction === (expected.groupScope === 'show' ? expected.bookingDistinction : null) &&
    payload.consentAcknowledged === consentAcknowledged && expected.consentAcknowledged === consentAcknowledged &&
    payload.resolvedFrom === expected.resolvedFrom && Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt > now && payload.expiresAt <= now + APPROVAL_TTL_MS &&
    typeof payload.nonce === 'string' && /^[A-Za-z0-9_-]{22}$/.test(payload.nonce) &&
    payload.recipientFingerprint === recipientFingerprint(secret, expected.recipients) &&
    payload.templateFingerprint === templateFingerprint(expected.template);
}

function verifyPreviewToken(token, expected, env = process.env, now = Date.now()) {
  return verifyReviewToken(token, expected, 'preview', false, env, now);
}

function verifyApprovalToken(token, expected, env = process.env, now = Date.now()) {
  return verifyReviewToken(token, expected, 'approved', true, env, now);
}

function takeLoginAttempt(key, now = Date.now()) {
  const entries = (loginBuckets.get(key) || []).filter((time) => now - time < LOGIN_WINDOW_MS);
  if (entries.length >= LOGIN_MAX_ATTEMPTS) {
    loginBuckets.set(key, entries);
    return false;
  }
  entries.push(now);
  loginBuckets.set(key, entries);
  if (loginBuckets.size > 1000) {
    for (const [bucket, times] of loginBuckets) {
      if (!times.some((time) => now - time < LOGIN_WINDOW_MS)) loginBuckets.delete(bucket);
    }
  }
  return true;
}

function buildCookie(token, secure = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

function buildRefreshCookie(token, secure = process.env.NODE_ENV === 'production') {
  return `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/session; Max-Age=${REFRESH_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

function clearCookie(secure = process.env.NODE_ENV === 'production') {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

function clearRefreshCookie(secure = process.env.NODE_ENV === 'production') {
  return `${REFRESH_COOKIE}=; Path=/api/auth/session; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

function callbackUrl(requestPath, publicBaseUrl = process.env.PUBLIC_BASE_URL) {
  if (typeof publicBaseUrl !== 'string') return null;
  try {
    const base = new URL(publicBaseUrl);
    if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) return null;
    const path = typeof requestPath === 'string' && requestPath.startsWith('/') && !requestPath.startsWith('//') ? requestPath : null;
    if (!path) return null;
    const resolved = new URL(path, base);
    return resolved.origin === base.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function verifyTwilioSignature(twilio, authToken, signature, url, params) {
  if (!authToken || typeof signature !== 'string' || !url || !params || typeof params !== 'object' ||
      typeof twilio?.validateRequest !== 'function') return false;
  try { return Boolean(twilio.validateRequest(authToken, signature, url, params)); }
  catch { return false; }
}

async function mapWithConcurrency(items, limit, work) {
  if (!Array.isArray(items) || !Number.isInteger(limit) || limit < 1) throw new Error('invalid_concurrency');
  const results = new Array(items.length);
  let next = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

module.exports = {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  SESSION_TTL_SECONDS,
  MAX_RECIPIENTS,
  SEND_CONCURRENCY,
  roleMeetsRequirement,
  createRoleGuard,
  parseCookie,
  isValidE164,
  parseRecipients,
  canonicalTimestamp,
  canonicalExpiry,
  timestampNanoseconds,
  sameInstant,
  nowNanoseconds,
  parseSendRequest,
  allowedSenders,
  isAllowedMediaUrl,
  validateTemplateForSend,
  validateTemplateDraft,
  isTrustedMutation,
  isUuid,
  isNewSendClaim,
  summarizeProviderOutcomes,
  readAccessTokenClaims,
  sessionExpiresAt,
  canSend,
  APPROVAL_TTL_MS,
  createPreviewToken,
  createApprovalToken,
  verifyPreviewToken,
  verifyApprovalToken,
  takeLoginAttempt,
  buildCookie,
  buildRefreshCookie,
  clearCookie,
  clearRefreshCookie,
  callbackUrl,
  verifyTwilioSignature,
  mapWithConcurrency,
};
