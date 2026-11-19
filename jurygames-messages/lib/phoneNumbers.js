const {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} = require('libphonenumber-js/max');

const regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });
const countriesByCallingCode = new Map();
for (const country of getCountries()) {
  const callingCode = `+${getCountryCallingCode(country)}`;
  const countries = countriesByCallingCode.get(callingCode) || [];
  countries.push(country);
  countriesByCallingCode.set(callingCode, countries);
}

function countryName(country) {
  try {
    return regionNames.of(country) || country;
  } catch {
    return country;
  }
}

function normalizePhoneNumber(input) {
  const original = typeof input === 'string' ? input.trim() : '';
  if (!original) return { status: 'missing', reason: 'number_missing' };

  let phone;
  try {
    // Deliberately omit defaultCountry: national-format values need human review.
    phone = parsePhoneNumberFromString(original);
  } catch {
    phone = undefined;
  }
  if (!phone || !phone.isPossible() || !phone.isValid()) {
    return { status: 'needs_review', reason: 'invalid_number', original };
  }

  const callingCode = `+${phone.countryCallingCode}`;
  const possibleCountries = phone.getPossibleCountries();
  const resolvedCountry = phone.country || (possibleCountries.length === 1 ? possibleCountries[0] : undefined);
  if (!resolvedCountry) {
    return {
      status: 'needs_review',
      reason: possibleCountries.length > 1 ? 'ambiguous_country' : 'country_unresolved',
      original,
      e164: phone.number,
      callingCode,
      possibleCountries: possibleCountries.map(countryName),
    };
  }

  const callingCodeCountries = countriesByCallingCode.get(callingCode) || [];
  const sharedCallingCode = callingCodeCountries.length > 1;
  return {
    status: 'valid',
    e164: phone.number,
    callingCode,
    country: resolvedCountry,
    countryName: countryName(resolvedCountry),
    sharedCallingCode,
  };
}

function labelForCallingCode(callingCode, countries) {
  const names = [...countries].sort((a, b) => a.localeCompare(b));
  const allCountries = countriesByCallingCode.get(callingCode) || [];
  if (allCountries.length <= 1 && names.length === 1) return `${names[0]} (${callingCode})`;
  if (names.length) return `${names.join('/')}; shared code (${callingCode})`;
  return `Shared calling code (${callingCode})`;
}

function groupInternationalRecipients(recipients, missingNumberCount = 0) {
  const normalizedByNumber = new Map();
  const reviewByKey = new Map();
  let missingCount = Number.isSafeInteger(missingNumberCount) && missingNumberCount > 0 ? missingNumberCount : 0;

  for (const recipient of Array.isArray(recipients) ? recipients : []) {
    const input = recipient && typeof recipient.number === 'string' ? recipient.number : '';
    const normalized = normalizePhoneNumber(input);
    if (normalized.status === 'missing') {
      missingCount += 1;
      continue;
    }
    if (normalized.status !== 'valid') {
      const key = normalized.e164 || normalized.original;
      if (!reviewByKey.has(key)) {
        reviewByKey.set(key, {
          ...(normalized.e164 ? { number: normalized.e164 } : {}),
          ...(normalized.callingCode ? { callingCode: normalized.callingCode } : {}),
          original: normalized.original,
          reason: normalized.reason,
          roles: [],
          sources: [],
        });
      }
      const review = reviewByKey.get(key);
      review.roles = [...new Set([...review.roles, ...(recipient.roles || [])])].sort();
      review.sources = [...new Set([...review.sources, ...(recipient.sources || [])])].sort();
      continue;
    }

    const existing = normalizedByNumber.get(normalized.e164) || {
      ...normalized,
      roles: [],
      sources: [],
      consentStatuses: [],
      reviewRequired: false,
    };
    existing.roles = [...new Set([...existing.roles, ...(recipient.roles || [])])].sort();
    existing.sources = [...new Set([...existing.sources, ...(recipient.sources || [])])].sort();
    existing.consentStatuses = [...new Set([...existing.consentStatuses, recipient.consentStatus || 'not_recorded'])].sort();
    existing.reviewRequired ||= Boolean(recipient.reviewRequired);
    normalizedByNumber.set(normalized.e164, existing);
  }

  const byCode = new Map();
  for (const recipient of normalizedByNumber.values()) {
    if (recipient.reviewRequired) {
      const key = recipient.e164;
      reviewByKey.set(key, {
        number: recipient.e164,
        callingCode: recipient.callingCode,
        reason: 'source_review_required',
        roles: recipient.roles,
        sources: recipient.sources,
      });
      continue;
    }
    const group = byCode.get(recipient.callingCode) || { callingCode: recipient.callingCode, countries: new Set(), contacts: [] };
    group.countries.add(recipient.countryName);
    group.contacts.push(recipient);
    byCode.set(recipient.callingCode, group);
  }

  const groups = [...byCode.values()]
    .sort((a, b) => Number(a.callingCode.slice(1)) - Number(b.callingCode.slice(1)))
    .map(group => ({
      callingCode: group.callingCode,
      label: labelForCallingCode(group.callingCode, group.countries),
      count: group.contacts.length,
      countries: [...group.countries].sort(),
      numbers: group.contacts.map(({ e164, roles, sources, consentStatuses }) => ({ e164, roles, sources, consentStatuses })),
    }));

  const needsReview = [...reviewByKey.values()];
  return {
    groups,
    needsReview,
    missingNumberCount: missingCount,
    needsReviewCount: needsReview.length,
    consentStatus: 'not_recorded',
  };
}

module.exports = { normalizePhoneNumber, groupInternationalRecipients };
