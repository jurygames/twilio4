const { getSummonsMessagingShows, getSummonsShowRecipients } = require('./summonsMessagingApi');
const { groupInternationalRecipients, normalizePhoneNumber } = require('./phoneNumbers');
const { canonicalTimestamp, timestampNanoseconds, sameInstant, nowNanoseconds } = require('./security');

function sameShowIdentity(listed, recipientShow) {
  return Boolean(listed && recipientShow && listed.showId && recipientShow.id === listed.showId &&
    sameInstant(listed.startsAt, recipientShow.startsAt) && sameInstant(listed.endsAt, recipientShow.endsAt) &&
    listed.source === recipientShow.source && listed.deliveryType === recipientShow.deliveryType);
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
  const requestedExpiryNanoseconds = timestampNanoseconds(request?.expiresAtIso);
  const nowNs = nowNanoseconds(now);
  if (!request || !['automatic', 'custom'].includes(request.groupKind) ||
      !['show', 'standalone'].includes(request.groupScope) || requestedExpiryNanoseconds === null || nowNs === null) {
    return { ok: false, status: 400, error: 'send_group_invalid' };
  }
  if (requestedExpiryNanoseconds <= nowNs) return { ok: false, status: 409, error: 'send_group_expired' };
  if (!Array.isArray(request.recipients) || request.recipients.length < 1 || request.recipients.length > 50 ||
      request.recipients.some(number => {
        const parsed = normalizePhoneNumber(number);
        return parsed.status !== 'valid' || parsed.e164 !== number;
      })) {
    return { ok: false, status: 400, error: 'recipient_number_invalid' };
  }

  if (request.groupScope === 'standalone') {
    if (request.groupKind !== 'custom' || request.showId ||
        requestedExpiryNanoseconds > nowNs + 24n * 60n * 60n * 1_000_000_000n) {
      return { ok: false, status: 400, error: 'standalone_expiry_invalid' };
    }
    return {
      ok: true,
      show: null,
      expiresAtIso: canonicalTimestamp(request.expiresAtIso),
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
  const listedStart = canonicalTimestamp(listed?.startsAt);
  const listedEnd = canonicalTimestamp(listed?.endsAt);
  const listedExpiry = canonicalTimestamp(listed?.contactsExpireAt);
  const requestStart = canonicalTimestamp(request.showStartsAt);
  const requestEnd = canonicalTimestamp(request.showEndsAt);
  const startNanoseconds = timestampNanoseconds(listedStart);
  const endNanoseconds = timestampNanoseconds(listedEnd);
  const listedExpiryNanoseconds = timestampNanoseconds(listed?.contactsExpireAt);
  if (!listed || listed.status !== 'ready' || !listedStart || !listedEnd || !listedExpiry ||
      startNanoseconds === null || endNanoseconds === null || endNanoseconds <= startNanoseconds ||
      listedExpiryNanoseconds === null || listedExpiryNanoseconds <= nowNs || listed.deliveryType === 'unknown' ||
      !requestStart || !requestEnd || !sameInstant(listedStart, requestStart) || !sameInstant(listedEnd, requestEnd) ||
      listed.name !== request.showName || (listed.location || null) !== request.showLocation ||
      listed.deliveryType !== request.deliveryType || listed.bookingDistinction !== request.bookingDistinction) {
    return { ok: false, status: 409, error: 'show_not_sendable' };
  }
  const canonicalListed = { ...listed, startsAt: listedStart, endsAt: listedEnd, contactsExpireAt: listedExpiry };

  if (request.groupKind === 'custom') {
    if (canonicalTimestamp(request.expiresAtIso) !== listedExpiry) {
      return { ok: false, status: 409, error: 'show_changed_during_read' };
    }
    return {
      ok: true,
      show: canonicalListed,
      expiresAtIso: listedExpiry,
      countryGroups: recipientSummary(request.recipients),
      exclusions: { source: 'manual_list', missingNumberCount: 0, needsReviewCount: 0 }
    };
  }

  const snapshot = await readRecipients(accessToken, request.showId);
  const snapshotExpiryNanoseconds = timestampNanoseconds(snapshot?.expiresAtIso);
  if (!snapshot || snapshot.showId !== request.showId || !['ready', 'incomplete'].includes(snapshot.status) ||
      !Array.isArray(snapshot.recipients) || snapshotExpiryNanoseconds === null ||
      requestedExpiryNanoseconds !== snapshotExpiryNanoseconds || requestedExpiryNanoseconds > listedExpiryNanoseconds ||
      !sameShowIdentity(canonicalListed, snapshot.show)) {
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
    show: canonicalListed,
    expiresAtIso: canonicalTimestamp(snapshot.expiresAtIso),
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
