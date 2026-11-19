const { groupInternationalRecipients, normalizePhoneNumber } = require('./phoneNumbers');

const STANDALONE_EXPIRY_HOURS = [1, 2, 4, 8, 24];

function createCustomList({ name, numbers, show = null, expiryHours } = {}, now = Date.now()) {
  const groupName = typeof name === 'string' ? name.trim() : '';
  if (!groupName || groupName.length > 80) return { ok: false, error: 'group_name_invalid' };
  if (typeof numbers !== 'string' || numbers.length > 10000) return { ok: false, error: 'number_input_invalid' };
  const submitted = numbers.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean);
  if (!submitted.length) return { ok: false, error: 'number_list_required' };
  if (submitted.length > 200) return { ok: false, error: 'number_input_too_large' };

  const normalized = submitted.map(original => ({ original, value: normalizePhoneNumber(original) }));
  const needsReview = normalized.filter(item => item.value.status !== 'valid').map(item => ({
    original: item.original,
    reason: item.value.reason || 'number_invalid',
    ...(item.value.callingCode ? { callingCode: item.value.callingCode } : {})
  }));
  if (needsReview.length) return { ok: false, error: 'numbers_need_review', needsReview };

  const grouped = groupInternationalRecipients(normalized.map(item => ({
    number: item.original,
    roles: ['manual'],
    sources: ['custom_list'],
    consentStatus: 'not_recorded'
  })));
  const list = grouped.groups.flatMap(group => group.numbers.map(contact => contact.e164));
  if (!list.length) return { ok: false, error: 'number_list_required' };
  if (list.length > 50) return { ok: false, error: 'recipient_limit_exceeded' };

  if (show) {
    if (show.status !== 'ready' || typeof show.showId !== 'string' || !show.showId) {
      return { ok: false, error: 'show_not_sendable' };
    }
    const expiresAt = Date.parse(show.contactsExpireAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return { ok: false, error: 'show_contact_window_expired' };
    return {
      ok: true,
      group: {
        name: groupName,
        list,
        kind: 'custom',
        scope: 'show',
        showId: show.showId,
        showName: show.name || 'Selected performance',
        showStartsAt: show.startsAt,
        showEndsAt: show.endsAt,
        showLocation: show.location,
        deliveryType: show.deliveryType,
        bookingDistinction: show.bookingDistinction,
        showStatus: show.status,
        expiresAtIso: new Date(expiresAt).toISOString(),
        countryGroups: grouped.groups.map(({ label, count }) => ({ label, count })),
        consentStatus: 'not_recorded'
      }
    };
  }

  if (!STANDALONE_EXPIRY_HOURS.includes(Number(expiryHours))) {
    return { ok: false, error: 'standalone_expiry_required' };
  }
  return {
    ok: true,
    group: {
      name: groupName,
      list,
      kind: 'custom',
      scope: 'standalone',
      showId: null,
      showName: null,
      showStartsAt: null,
      showEndsAt: null,
      showLocation: null,
      deliveryType: null,
      bookingDistinction: null,
      showStatus: null,
      expiresAtIso: new Date(now + Number(expiryHours) * 60 * 60 * 1000).toISOString(),
      countryGroups: grouped.groups.map(({ label, count }) => ({ label, count })),
      consentStatus: 'not_recorded'
    }
  };
}

module.exports = { createCustomList, STANDALONE_EXPIRY_HOURS };
