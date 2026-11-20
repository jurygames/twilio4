const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Twilio = require('twilio');
const security = require('../lib/security');
const { normalizePhoneNumber, groupInternationalRecipients } = require('../lib/phoneNumbers');
const { createCustomList } = require('../lib/customLists');
const { SummonsMessagingApiError, getSummonsMessagingShows, getSummonsShowRecipients } = require('../lib/summonsMessagingApi');
const { validateSendGroup } = require('../lib/sendGroupAuthorization');

const sender = '+447700900123';

test('operator access comes from the current Summons Defendant qualification, not metadata', async () => {
  const { resolveMessagingRole } = await import('../lib/messagingAuth.js');
  const calls = [];
  const clientFactory = token => {
    assert.equal(token, 'verified-access-token');
    return { rpc: async name => {
      calls.push(name);
      return { data: 'operator', error: null };
    } };
  };
  assert.equal(await resolveMessagingRole('verified-access-token', clientFactory), 'operator');
  assert.deepEqual(calls, ['get_jg_messaging_role']);

  const unqualified = await resolveMessagingRole('verified-access-token', () => ({
    rpc: async () => ({ data: null, error: null })
  }));
  assert.equal(unqualified, null);
  assert.equal(await resolveMessagingRole('', () => { throw new Error('must_not_connect'); }), null);
  await assert.rejects(resolveMessagingRole('verified-access-token', () => ({
    rpc: async () => ({ data: null, error: new Error('details are not exposed') })
  })), /messaging_auth_unavailable/);
  assert.equal(security.roleMeetsRequirement('operator', 'admin'), false);
  assert.equal(security.roleMeetsRequirement('admin', 'operator'), true);
});

test('international phone normalization requires explicit international context and flags unresolved countries', () => {
  const uk = normalizePhoneNumber('+442070313000');
  assert.equal(uk.status, 'valid');
  assert.equal(uk.e164, '+442070313000');
  assert.equal(uk.callingCode, '+44');
  assert.equal(uk.countryName, 'United Kingdom');
  assert.equal(Object.hasOwn(uk, 'original'), false, 'valid numbers need no stored correction copy');

  const national = normalizePhoneNumber('020 7031 3000');
  assert.equal(national.status, 'needs_review');
  assert.equal(national.reason, 'invalid_number');
  assert.equal(national.original, '020 7031 3000');

  const nonGeographic = normalizePhoneNumber('+80012345678');
  assert.equal(nonGeographic.status, 'needs_review');
  assert.equal(nonGeographic.reason, 'country_unresolved');
  assert.equal(nonGeographic.callingCode, '+800');
});

test('shared calling codes group by code without claiming a unique country; duplicates normalize to one E.164', () => {
  const grouped = groupInternationalRecipients([
    { number: '+1 202-555-0100', roles: ['lead_booker'], sources: ['calendar'], consentStatus: 'not_recorded' },
    { number: '+12025550100', roles: ['attendee'], sources: ['contact_form'], consentStatus: 'not_recorded' },
    { number: '+1 416 555 0100', roles: ['attendee'], sources: ['contact_form'], consentStatus: 'not_recorded' },
    { number: '+442079460018', roles: ['booking_contact'], sources: ['legacy_sheet'], consentStatus: 'not_recorded' },
    { number: '+80012345678', roles: ['booking_contact'], sources: ['legacy_sheet'], consentStatus: 'not_recorded' },
    { number: '020 7031 3000', roles: ['booking_contact'], sources: ['legacy_sheet'], consentStatus: 'not_recorded' },
    { number: '', roles: ['attendee'], sources: ['contact_form'], consentStatus: 'not_recorded' },
    { number: '+442070313000', roles: ['unclassified'], sources: ['legacy_sheet'], consentStatus: 'not_recorded', reviewRequired: true },
  ], 1);
  const nanp = grouped.groups.find(group => group.callingCode === '+1');
  assert(nanp);
  assert.equal(nanp.count, 2);
  assert.equal(nanp.label.includes('shared code (+1)'), true);
  assert.deepEqual(nanp.countries, ['Canada', 'United States']);
  assert.deepEqual(nanp.numbers.map(value => value.e164).sort(), ['+12025550100', '+14165550100']);

  const uk = grouped.groups.find(group => group.callingCode === '+44');
  assert(uk);
  assert.equal(uk.count, 1);
  assert.equal(uk.label.includes('shared code (+44)'), true);
  assert.equal(grouped.missingNumberCount, 2);
  assert.equal(grouped.needsReviewCount, 3);
  assert.deepEqual(grouped.needsReview.map(item => item.reason).sort(), ['country_unresolved', 'invalid_number', 'source_review_required']);
  assert.equal(grouped.consentStatus, 'not_recorded');
});

test('custom lists use authoritative show expiry or require a short standalone expiry', () => {
  const now = Date.parse('2026-11-19T12:00:00.000Z');
  const show = {
    showId: 'synthetic-show-id', name: 'Synthetic show', status: 'ready',
    startsAt: '2026-11-20T19:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z',
    contactsExpireAt: '2026-11-22T21:00:00.000Z', deliveryType: 'private',
    bookingDistinction: 'Private DMN'
  };
  const showScoped = createCustomList({ name: '  Manual guests  ', numbers: '+1 202-555-0100, +12025550100', show }, now);
  assert.equal(showScoped.ok, true);
  assert.equal(showScoped.group.name, 'Manual guests');
  assert.equal(showScoped.group.showId, 'synthetic-show-id');
  assert.equal(showScoped.group.expiresAtIso, show.contactsExpireAt);
  assert.deepEqual(showScoped.group.list, ['+12025550100']);

  assert.equal(createCustomList({ name: 'Standalone', numbers: '+12025550100' }, now).error, 'standalone_expiry_required');
  const standalone = createCustomList({ name: 'Standalone', numbers: '+12025550100', expiryHours: 24 }, now);
  assert.equal(standalone.ok, true);
  assert.equal(Date.parse(standalone.group.expiresAtIso), now + 24 * 60 * 60 * 1000);
  assert.equal(standalone.group.showId, null);

  const invalid = createCustomList({ name: 'Needs correction', numbers: '020 7031 3000', show }, now);
  assert.equal(invalid.error, 'numbers_need_review');
  assert.equal(invalid.needsReview[0].original, '020 7031 3000');
  assert.equal(createCustomList({ name: 'Cancelled', numbers: '+12025550100', show: { ...show, status: 'cancelled' } }, now).error, 'show_not_sendable');
});

test('Summons messaging proxy sends only the short-lived bearer token and exact show ID', async () => {
  const env = { NODE_ENV: 'test', SUMMONS_MESSAGING_API_BASE_URL: 'https://summons.example.invalid/' };
  let request;
  const fetchImpl = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      showId: 'calendar-event-1', status: 'ready', recipients: [{ number: '+12025550100' }], warnings: []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await getSummonsShowRecipients('short-lived-user-token', 'calendar-event-1', { env, fetchImpl });
  assert.equal(result.showId, 'calendar-event-1');
  assert.equal(request.url, 'https://summons.example.invalid/api/messaging/recipients?show_id=calendar-event-1');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.headers.Authorization, 'Bearer short-lived-user-token');

  await assert.rejects(getSummonsMessagingShows('short-lived-user-token', {
    env: { NODE_ENV: 'test' }, fetchImpl
  }), error => error instanceof SummonsMessagingApiError && error.status === 503);
});

test('Summons recipient proxy rejects a mismatched show identity and sanitizes upstream errors', async () => {
  const options = {
    env: { NODE_ENV: 'test', SUMMONS_MESSAGING_API_BASE_URL: 'https://summons.example.invalid' },
    fetchImpl: async () => new Response(JSON.stringify({ showId: 'another-show', recipients: [] }), { status: 200 }),
  };
  await assert.rejects(getSummonsShowRecipients('short-lived-user-token', 'requested-show', options),
    error => error instanceof SummonsMessagingApiError && error.code === 'show_source_unavailable');

  await assert.rejects(getSummonsShowRecipients('short-lived-user-token', 'requested-show', {
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ error: 'private database details' }), { status: 403 }),
  }), error => error instanceof SummonsMessagingApiError && error.code === 'messaging_role_required' && !/private database/.test(error.message));
});

test('unauthenticated or under-privileged API requests stop before protected work', async () => {
  const makeResponse = () => ({
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });
  let protectedWork = 0;
  const noSessionGuard = security.createRoleGuard(async () => null);
  const anonymousResponse = makeResponse();
  const anonymous = await noSessionGuard({}, anonymousResponse, 'operator');
  if (anonymous) protectedWork += 1;
  assert.equal(anonymous, null);
  assert.equal(anonymousResponse.code, 401);

  const operatorGuard = security.createRoleGuard(async () => ({ role: 'operator' }));
  const adminResponse = makeResponse();
  const operator = await operatorGuard({}, adminResponse, 'admin');
  if (operator) protectedWork += 1;
  assert.equal(operator, null);
  assert.equal(adminResponse.code, 403);
  assert.equal(protectedWork, 0);

  const unavailableGuard = security.createRoleGuard(async () => { throw new Error('auth backend offline'); });
  const unavailableResponse = makeResponse();
  assert.equal(await unavailableGuard({}, unavailableResponse, 'operator'), null);
  assert.equal(unavailableResponse.code, 503);
});

test('cookie parsing is bounded and rejects malformed encodings', () => {
  assert.equal(security.parseCookie('other=x; jg_messaging_session=abc%2Edef'), 'abc.def');
  assert.equal(security.parseCookie('jg_messaging_session=%E0%A4%A'), null);
  assert.equal(security.parseCookie('jg_messaging_session=' + 'x'.repeat(4097)), null);
  assert.match(security.buildRefreshCookie('refresh-only', false), /Path=\/api\/auth\/session;.*HttpOnly; SameSite=Strict/);
});

test('a verified Supabase JWT must identify the current user and a bounded session lifetime', () => {
  const userId = '6a9bd14c-53be-4f4c-a78e-1a2327dded5e';
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: 100, exp: 1000 })).toString('base64url');
  const token = `header.${payload}.signature`;
  assert.equal(security.sessionExpiresAt(token, userId, 0), 1000 * 1000);
  assert.equal(security.sessionExpiresAt(token, userId, 900 * 1000), 1000 * 1000);
  assert.equal(security.sessionExpiresAt(token, 'other-user', 0), null);
  const shortPayload = Buffer.from(JSON.stringify({ sub: userId, exp: 2000 })).toString('base64url');
  assert.equal(security.sessionExpiresAt(`header.${shortPayload}.signature`, userId, 5000), 905000);
});

test('send mutations require same-origin and the application request header', () => {
  const env = { PUBLIC_BASE_URL: 'https://messages.example.test' };
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://messages.example.test', 'x-jurygames-request': '1' } }, env), true);
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://attacker.example', 'x-jurygames-request': '1' } }, env), false);
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://messages.example.test' } }, env), false);
});

test('send request accepts only a bounded E.164 list and ignores caller-supplied template fields', () => {
  const expiry = '2026-11-22T21:00:00.000Z';
  const showGroup = {
    name: 'Synthetic show group',
    list: [sender, sender, '+14155550123'],
    kind: 'automatic',
    scope: 'show',
    showId: 'synthetic-calendar-event',
    showStartsAt: '2026-11-20T19:00:00.000Z',
    showEndsAt: '2026-11-20T21:00:00.000Z',
    showName: 'Synthetic Jury Duty',
    showLocation: 'Synthetic venue',
    deliveryType: 'private',
    bookingDistinction: 'Private DMN',
    expiresAtIso: expiry,
  };
  const request = security.parseSendRequest({
    group: showGroup,
    templateId: 'approved-template-id',
    requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
    template: { content: 'attacker-controlled', from: '+19995550123', media_url: 'https://evil.example/audio.mp3' },
  });
  assert.equal(request.ok, true);
  assert.deepEqual(request.recipients, [sender, '+14155550123']);
  assert.equal(request.showId, 'synthetic-calendar-event');
  assert.equal(request.expiresAtIso, expiry);
  assert.equal(Object.hasOwn(request, 'template'), false);
  assert.equal(security.parseSendRequest({ group: { ...showGroup, list: ['020 7946 0018'] }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).error, 'recipient_number_invalid');
  assert.equal(security.parseSendRequest({ group: { ...showGroup, list: [sender] }, template: { content: 'only client template' } }).error, 'send_request_invalid');
  assert.equal(security.parseSendRequest({ group: { ...showGroup, list: Array(51).fill(sender) }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).error, 'recipient_limit_exceeded');
  assert.equal(security.parseSendRequest({ group: { ...showGroup, showId: 'other-show' }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).showId, 'other-show');
  assert.equal(security.parseSendRequest({ group: { ...showGroup, showStartsAt: 'invalid' }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).error, 'show_time_identity_invalid');
  assert.equal(security.parseSendRequest({ group: { ...showGroup, expiresAtIso: '2026-11-19T12:00:00.000Z' }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }, Date.parse('2026-11-19T12:00:00.000Z')).error, 'send_group_expiry_invalid');

  const standalone = security.parseSendRequest({
    group: { name: 'Short list', list: [sender], kind: 'custom', scope: 'standalone', expiresAtIso: '2026-11-20T12:00:00.000Z' },
    templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
  }, Date.parse('2026-11-19T12:00:00.000Z'));
  assert.equal(standalone.ok, true);
  assert.equal(standalone.showId, null);
  assert.equal(security.parseSendRequest({
    group: { name: 'Long list', list: [sender], kind: 'custom', scope: 'standalone', expiresAtIso: '2026-11-20T13:00:00.000Z' },
    templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
  }, Date.parse('2026-11-19T12:00:00.000Z')).error, 'standalone_expiry_invalid');
});

test('an existing idempotency claim never dispatches a second provider operation', () => {
  assert.equal(security.isNewSendClaim({ claimed: true, status: 'processing' }), true);
  assert.equal(security.isNewSendClaim({ claimed: false, status: 'accepted' }), false);
  assert.equal(security.isNewSendClaim({ claimed: false, status: 'processing' }), false);
  assert.equal(security.isNewSendClaim(null), false);
});

test('partial provider outcomes are counted without returning recipient details', () => {
  const summary = security.summarizeProviderOutcomes([
    { accepted: true, providerStatus: 'queued' },
    { accepted: false, providerStatus: 'provider_error' },
    { accepted: true, providerStatus: 'accepted' },
  ]);
  assert.deepEqual(summary, {
    acceptedCount: 2,
    failedCount: 1,
    providerStatuses: { queued: 1, provider_error: 1, accepted: 1 },
  });
  assert.equal(Object.hasOwn(summary, 'recipients'), false);
});

test('template senders and media are restricted to server configuration', () => {
  const env = { DEFAULT_FROM_NUMBER_UK: sender, TWILIO_ALLOWED_MEDIA_HOSTS: 'media.jurygames.test' };
  assert.equal(security.validateTemplateForSend({ type: 'SMS', from_number: sender, content: 'Hello' }, env).ok, true);
  assert.equal(security.validateTemplateForSend({ type: 'WhatsApp', from_number: sender, content: 'Hello' }, env).error, 'whatsapp_content_template_required');
  assert.equal(security.validateTemplateDraft({ name: 'x', type: 'WhatsApp', show: 'x', from_number: sender, content: 'Hello' }, env).error, 'whatsapp_content_template_required');
  assert.equal(security.validateTemplateForSend({ type: 'SMS', from_number: '+19995550123', content: 'Hello' }, env).error, 'template_sender_not_allowed');
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'https://media.jurygames.test/approved.mp3' }, env).ok, true);
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'https://evil.example/audio.mp3' }, env).error, 'template_media_not_allowed');
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'http://media.jurygames.test/audio.mp3' }, env).error, 'template_media_not_allowed');
  assert.equal(security.validateTemplateDraft({ name: 'x', type: 'SMS', show: 'x', from_number: sender, content: '', from: '+19995550123' }, env).error, 'template_field_invalid');
});

test('WhatsApp transport refuses free-form bodies until an approved Content SID path exists', async () => {
  const { sendWhatsApp } = await import('../lib/twilioClient.js');
  assert.throws(() => sendWhatsApp('+14155550123', sender, 'free-form body'), /whatsapp_content_template_required/);
});

test('sending remains disabled until every safety switch and the approval secret are configured', () => {
  assert.equal(security.canSend({ MESSAGING_SEND_ENABLED: 'true' }), false);
  assert.equal(security.canSend({ MESSAGING_CONSENT_REVIEWED: 'true' }), false);
  const env = {
    MESSAGING_SEND_ENABLED: 'true',
    MESSAGING_CONSENT_REVIEWED: 'true',
    MESSAGING_MANUAL_LISTS_REVIEWED: 'true',
    MESSAGING_APPROVAL_SECRET: 'test-approval-secret-0123456789abcdef',
  };
  assert.equal(security.canSend({ ...env, MESSAGING_MANUAL_LISTS_REVIEWED: undefined }), false);
  assert.equal(security.canSend({ ...env, MESSAGING_APPROVAL_SECRET: 'short' }), false);
  assert.equal(security.canSend(env), true);
});

test('approval tokens bind the operator, exact recipients, template, sender, group, and short expiry', () => {
  const env = { MESSAGING_APPROVAL_SECRET: 'test-approval-secret-0123456789abcdef' };
  const request = {
    actorId: 'operator-user-id',
    requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
    templateId: 'approved-template-id',
    groupName: 'Friday Jury',
    groupKind: 'automatic',
    groupScope: 'show',
    showId: 'synthetic-calendar-event',
    showStartsAt: '2026-11-20T19:00:00.000Z',
    showEndsAt: '2026-11-20T21:00:00.000Z',
    showName: 'Synthetic Jury Duty',
    showLocation: 'Synthetic venue',
    deliveryType: 'private',
    bookingDistinction: 'Private DMN',
    expiresAtIso: '2026-11-22T21:00:00.000Z',
    recipients: [sender, '+14155550123'],
    template: { id: 'approved-template-id', name: 'Call time', show: 'Jury Duty', type: 'SMS', from_number: sender, content: 'Doors at seven', summary: 'Arrival time' },
    resolvedFrom: sender,
    consentAcknowledged: true,
  };
  const token = security.createApprovalToken(request, env, 1000);
  assert.equal(typeof token, 'string');
  assert.equal(token.includes(sender), false);
  assert.equal(security.createApprovalToken({ ...request, consentAcknowledged: false }, env, 1000), null);
  assert.equal(security.verifyApprovalToken(token, request, env, 2000), true);
  assert.equal(security.verifyApprovalToken(token, { ...request, recipients: [sender] }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, groupName: 'Other group' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, showId: 'parallel-show' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, showEndsAt: '2026-11-21T21:00:00.000Z' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, expiresAtIso: '2026-11-23T21:00:00.000Z' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, resolvedFrom: '+14155550123' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, consentAcknowledged: false }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, request, env, 122000), false);

  const previewInput = { ...request, consentAcknowledged: false };
  const previewToken = security.createPreviewToken(previewInput, env, 1000);
  assert.equal(security.verifyPreviewToken(previewToken, previewInput, env, 2000), true);
  assert.equal(security.verifyPreviewToken(previewToken, { ...previewInput, template: { ...request.template, content: 'changed after preview' } }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(previewToken, request, env, 2000), false);
});

test('send-group authorization binds an exact current show and automatic recipients to Summons', async () => {
  const now = Date.parse('2026-11-19T12:00:00.000Z');
  const syntheticRecipient = '+12025550100'; // Fiction-only 555-0100 range.
  const show = {
    showId: 'synthetic-calendar-event', name: 'Synthetic Jury Duty',
    startsAt: '2026-11-20T19:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z',
    contactsExpireAt: '2026-11-22T21:00:00.000Z', source: 'dmn',
    deliveryType: 'private', bookingDistinction: 'Private DMN', status: 'ready', location: 'Synthetic venue'
  };
  const recipientShow = {
    id: show.showId, name: show.name, startsAt: show.startsAt, endsAt: show.endsAt,
    source: show.source, deliveryType: show.deliveryType, location: show.location
  };
  const parsed = security.parseSendRequest({
    group: {
      name: 'Synthetic Jury Duty recipients', list: [syntheticRecipient], kind: 'automatic', scope: 'show',
      showId: show.showId, showStartsAt: show.startsAt, showEndsAt: show.endsAt,
      showName: show.name, showLocation: show.location, deliveryType: show.deliveryType,
      bookingDistinction: show.bookingDistinction, expiresAtIso: show.contactsExpireAt
    }, templateId: 'template', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751'
  }, now);
  assert.equal(parsed.ok, true);
  const allowed = await validateSendGroup(parsed, 'synthetic-token', {
    now,
    listShows: async () => ({ shows: [show] }),
    readRecipients: async token => {
      assert.equal(token, 'synthetic-token');
      return { showId: show.showId, status: 'ready', show: recipientShow, expiresAtIso: show.contactsExpireAt, recipients: [{ number: syntheticRecipient, reviewRequired: false }] };
    }
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.show.showId, show.showId);

  const wrongPerformance = await validateSendGroup({ ...parsed, showId: 'another-same-time-show' }, 'synthetic-token', {
    now, listShows: async () => ({ shows: [show] }), readRecipients: async () => { throw new Error('must_not_read_other_show'); }
  });
  assert.equal(wrongPerformance.error, 'show_not_sendable');

  const changedTime = await validateSendGroup({ ...parsed, showStartsAt: '2026-11-20T20:00:00.000Z' }, 'synthetic-token', {
    now, listShows: async () => ({ shows: [show] }), readRecipients: async () => { throw new Error('must_not_read_changed_show'); }
  });
  assert.equal(changedTime.error, 'show_not_sendable');

  const removedRecipient = await validateSendGroup(parsed, 'synthetic-token', {
    now, listShows: async () => ({ shows: [show] }),
    readRecipients: async () => ({ showId: show.showId, status: 'ready', show: recipientShow, expiresAtIso: show.contactsExpireAt, recipients: [] })
  });
  assert.equal(removedRecipient.error, 'recipient_group_changed');

  const parallel = { ...show, showId: 'parallel-performance', location: 'Other synthetic venue' };
  const selectedParallel = security.parseSendRequest({
    group: {
      name: 'Parallel performance recipients', list: [syntheticRecipient], kind: 'automatic', scope: 'show',
      showId: parallel.showId, showStartsAt: parallel.startsAt, showEndsAt: parallel.endsAt,
      showName: parallel.name, showLocation: parallel.location, deliveryType: parallel.deliveryType,
      bookingDistinction: parallel.bookingDistinction, expiresAtIso: parallel.contactsExpireAt
    }, templateId: 'template', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751'
  }, now);
  const leakedSnapshot = await validateSendGroup(selectedParallel, 'synthetic-token', {
    now, listShows: async () => ({ shows: [show, parallel] }),
    readRecipients: async () => ({ showId: show.showId, status: 'ready', show: recipientShow, expiresAtIso: show.contactsExpireAt, recipients: [{ number: syntheticRecipient, reviewRequired: false }] })
  });
  assert.equal(leakedSnapshot.error, 'show_changed_during_read');

  await assert.rejects(validateSendGroup(parsed, 'synthetic-token', {
    now, listShows: async () => { throw new Error('synthetic Calendar outage'); },
    readRecipients: async () => { throw new Error('must_not_read_when_calendar_is_unavailable'); }
  }), /synthetic Calendar outage/);
});

test('show-scoped custom groups require current Summons show identity, while standalone lists require a short expiry', async () => {
  const now = Date.parse('2026-11-19T12:00:00.000Z');
  const syntheticRecipient = '+12025550100'; // Fiction-only 555-0100 range.
  const show = {
    showId: 'synthetic-calendar-event', name: 'Synthetic Jury Duty',
    startsAt: '2026-11-20T19:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z',
    contactsExpireAt: '2026-11-22T21:00:00.000Z', source: 'dmn',
    deliveryType: 'private', bookingDistinction: 'Private DMN', status: 'ready', location: null
  };
  const custom = {
    groupKind: 'custom', groupScope: 'show', showId: show.showId,
    showStartsAt: show.startsAt, showEndsAt: show.endsAt, showName: show.name,
    showLocation: null, deliveryType: show.deliveryType, bookingDistinction: show.bookingDistinction,
    expiresAtIso: show.contactsExpireAt, recipients: [syntheticRecipient]
  };
  const allowed = await validateSendGroup(custom, 'token', {
    now, listShows: async () => ({ shows: [show] }),
    readRecipients: async () => { throw new Error('manual_lists_do_not_copy_contact_sources'); }
  });
  assert.equal(allowed.ok, true);
  const invalidDestination = await validateSendGroup({ ...custom, recipients: [sender] }, 'token', {
    now, listShows: async () => { throw new Error('invalid numbers must be rejected before source reads'); }
  });
  assert.equal(invalidDestination.error, 'recipient_number_invalid');

  const moved = await validateSendGroup({ ...custom, showEndsAt: '2026-11-21T21:00:00.000Z' }, 'token', {
    now, listShows: async () => ({ shows: [show] }), readRecipients: async () => { throw new Error('must_not_read'); }
  });
  assert.equal(moved.error, 'show_not_sendable');

  const standalone = await validateSendGroup({ groupKind: 'custom', groupScope: 'standalone', showId: null, expiresAtIso: '2026-11-20T12:00:00.000Z', recipients: [syntheticRecipient] }, 'token', { now });
  assert.equal(standalone.ok, true);
  const tooLong = await validateSendGroup({ groupKind: 'custom', groupScope: 'standalone', showId: null, expiresAtIso: '2026-11-20T13:00:00.000Z', recipients: [syntheticRecipient] }, 'token', { now });
  assert.equal(tooLong.error, 'standalone_expiry_invalid');
});

test('voice callbacks use only the configured HTTPS origin', () => {
  assert.equal(security.callbackUrl('/api/voice/status', 'https://messages.example.test'), 'https://messages.example.test/api/voice/status');
  assert.equal(security.callbackUrl('//attacker.example/api/voice/status', 'https://messages.example.test'), null);
  assert.equal(security.callbackUrl('/api/voice/status', 'http://messages.example.test'), null);
});

test('Twilio callback signatures bind the exact HTTPS URL and form parameters', () => {
  const token = 'test-only-auth-token';
  const url = 'https://messages.example.test/api/voice/status';
  const params = { CallSid: 'CA00000000000000000000000000000000', CallStatus: 'completed' };
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url, params), true);
  assert.equal(security.verifyTwilioSignature(Twilio, 'wrong-token', signature, url, params), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url + '?changed=1', params), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url, { ...params, CallStatus: 'failed' }), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, '', url, params), false);
});

test('login throttling caps repeated attempts within the window', () => {
  const key = `security-test-${Math.random()}`;
  for (let i = 0; i < 8; i += 1) assert.equal(security.takeLoginAttempt(key, 1000 + i), true);
  assert.equal(security.takeLoginAttempt(key, 1010), false);
  assert.equal(security.takeLoginAttempt(key, 62_000), true);
});

test('send dispatch helper never runs more than two provider calls concurrently', async () => {
  let active = 0;
  let highest = 0;
  const result = await security.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    highest = Math.max(highest, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.equal(highest, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test('database clients use an authenticated user token and never require a service-role key', () => {
  const clientSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'supabaseClient.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'messagingAuth.js'), 'utf8');
  const sendSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'api', 'send.js'), 'utf8');
  const templatesSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'api', 'templates', 'index.js'), 'utf8');
  assert.match(clientSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(clientSource, /SUPABASE_SERVICE_ROLE_KEY|getServiceSupabaseClient/);
  assert.doesNotMatch(authSource + sendSource + templatesSource, /getServiceSupabaseClient|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(authSource, /getSupabaseClient\(\)\.auth\.getUser\(token\)/);
  assert.doesNotMatch(authSource, /is_jg_messaging_session_active/);
  assert.match(sendSource, /userClient = messagingUserClient\(session\)/);
  assert.match(sendSource, /userClient\.rpc\('claim_jg_message_send'/);
  assert.match(templatesSource, /\.from\('jg_messaging_templates'\)/);
});
