// lib/normalizePhone.js

/**
 * Convert loose phone input into E.164-ish format with light country inference.
 * - Strips spaces, dashes, parentheses and other non-digits/plus characters.
 * - Preserves a leading + when present (e.g. (+1)234567 -> +1234567).
 * - If the number starts with 00, treat it as an international prefix and swap for +.
 * - If the number starts with 07, assume UK and convert to +44 dropping the leading 0.
 * - If the number matches a known calling code, prefix with + and return it unchanged.
 * - If a defaultCountryCode is supplied, prepend that (dropping one local-leading 0 when present).
 * - If the number starts with 1, assume US/NANP and prefix with +.
 * - Otherwise, just prefix with + and the remaining digits.
 */
import { callingCodes } from '../data/callingCodes';

const knownCallingCodes = callingCodes
  .map(({ code }) => code)
  .sort((a, b) => b.length - a.length);

export function normalizePhone(raw, options = {}) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  const { defaultCountryCode } = options;
  const hasLeadingPlus = /^\s*\+/.test(trimmed) || /^\s*\(\s*\+/.test(trimmed);
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (hasLeadingPlus) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);

  // Explicitly treat UK local-style 07 numbers before checking generic calling codes
  if (digits.startsWith('07')) return '+44' + digits.slice(1);

  // Respect numbers that already start with an international calling code (even if + is missing)
  const knownPrefix = knownCallingCodes.find(code => digits.startsWith(code));
  if (knownPrefix) return '+' + digits;

  // If a default country code is provided, prepend it (dropping one leading 0 if present)
  if (defaultCountryCode) {
    const normalizedCode = String(defaultCountryCode).replace(/\D/g, '');
    if (normalizedCode) {
      const digitsWithoutTrunk = digits.startsWith('0') ? digits.slice(1) : digits;
      return `+${normalizedCode}${digitsWithoutTrunk}`;
    }
  }

  if (digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}
