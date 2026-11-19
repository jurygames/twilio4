const { getSummonsMessagingShows, getSummonsShowRecipients } = require('./summonsMessagingApi');
const { groupInternationalRecipients, normalizePhoneNumber } = require('./phoneNumbers');

function sameShowIdentity(listed, recipientShow) {
  return Boolean(listed && recipientShow && listed.showId && recipientShow.id === listed.showId &&
    listed.startsAt === recipientShow.startsAt && listed.endsAt === recipientShow.endsAt &&
    listed.source === recipientShow.source && listed.deliveryType === recipientShow.deliveryType);
}

function isCanonicalIso(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  try { return new Date(timestamp).toISOString() === value; }
  catch { return false; }
}

function recipientSummary(recipients) {
  const grouped = groupInternationalRecipients(recipients.map(number => ({ number })));
  return grouped.groups.map(group => ({ label: group.label, count: group.count }));
}

async function validateSendGroup(request, accessToken, {
  listShows = getSummonsMessagingShows,
  readRecipients = getSummonsShowRecipients,
  now = Date.now(),
} = {}) {
  if (!request || !['automatic', 'custom'].includes(request.groupKind) ||
      !['show', 'standalone'].includes(request.groupScope) || !isCanonicalIso(request.expiresAtIso)) {
    return { ok: false, status: 400, error: 'send_group_invalid' };
  }
  const requestedExpiry = Date.parse(request.expiresAtIso);
  if (requestedExpiry <= now) return { ok: false, status: 409, error: 'send_group_expired' };
  if (!Array.isArray(request.recipients) || request.recipients.length < 1 || request.recipients.length > 50 ||
      request.recipients.some(number => {
        const parsed = normalizePhoneNumber(number);
        return parsed.status !== 'valid' || parsed.e164 !== number;
      })) {
    return { ok: false, status: 400, error: 'recipient_number_invalid' };
  }

  if (request.groupScope === 'standalone') {
    if (request.groupKind !== 'custom' || request.showId || requestedExpiry > now + 24 * 60 * 60 * 1000) {
      return { ok: false, status: 400, error: 'standalone_expiry_invalid' };
    }
    return {
      ok: true,
      show: null,
      expiresAtIso: request.expiresAtIso,
      countryGroups: recipientSummary(request.recipients),
      exclusions: { source: 'manual_list', missingNumberCount: 0, needsReviewCount: 0 }
    };
  }

  if (typeof request.showId !== 'string' || !request.showId.trim() || request.showId.length > 256) {
    return { ok: false, status: 400, error: 'show_id_required' };
  }

  const listing = await listShows(accessToken);
  if (!listing || !Array.isArray(listing.shows)) throw new Error('show_source_unavailable');
  const listed = listing.shows.find(show => show.showId === request.showId);
  if (!listed || listed.status !== 'ready' || !isCanonicalIso(listed.contactsExpireAt) ||
      Date.parse(listed.contactsExpireAt) <= now || listed.deliveryType === 'unknown' ||
      listed.startsAt !== request.showStartsAt || listed.endsAt !== request.showEndsAt ||
      listed.name !== request.showName || (listed.location || null) !== request.showLocation ||
      listed.deliveryType !== request.deliveryType || listed.bookingDistinction !== request.bookingDistinction) {
    return { ok: false, status: 409, error: 'show_not_sendable' };
  }

  if (request.groupKind === 'custom') {
    if (request.expiresAtIso !== listed.contactsExpireAt) {
      return { ok: false, status: 409, error: 'show_changed_during_read' };
    }
    return {
      ok: true,
      show: listed,
      expiresAtIso: listed.contactsExpireAt,
      countryGroups: recipientSummary(request.recipients),
      exclusions: { source: 'manual_list', missingNumberCount: 0, needsReviewCount: 0 }
    };
  }

  const snapshot = await readRecipients(accessToken, request.showId);
  if (!snapshot || snapshot.showId !== request.showId || !['ready', 'incomplete'].includes(snapshot.status) ||
      !Array.isArray(snapshot.recipients) || !isCanonicalIso(snapshot.expiresAtIso) ||
      requestedExpiry !== Date.parse(snapshot.expiresAtIso) || requestedExpiry > Date.parse(listed.contactsExpireAt) ||
      !sameShowIdentity(listed, snapshot.show)) {
    return { ok: false, status: 409, error: 'show_changed_during_read' };
  }

  const currentRecipients = new Set();
  for (const recipient of snapshot.recipients) {
    if (!recipient || typeof recipient.number !== 'string' || recipient.reviewRequired) continue;
    const parsed = normalizePhoneNumber(recipient.number);
    if (parsed.status === 'valid') currentRecipients.add(parsed.e164);
  }
  if (request.recipients.some(number => !currentRecipients.has(number))) {
    return { ok: false, status: 409, error: 'recipient_group_changed' };
  }
  return {
    ok: true,
    show: listed,
    expiresAtIso: snapshot.expiresAtIso,
    countryGroups: recipientSummary(request.recipients),
    exclusions: {
      source: 'summons',
      missingNumberCount: Number.isSafeInteger(snapshot.missingNumberCount) ? snapshot.missingNumberCount : 0,
      needsReviewCount: Number.isSafeInteger(snapshot.needsReviewCount) ? snapshot.needsReviewCount : 0,
      warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.filter(value => typeof value === 'string').slice(0, 10) : []
    }
  };
}

module.exports = { validateSendGroup };
