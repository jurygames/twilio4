// lib/resolveVoiceFrom.js
import Twilio from 'twilio';

/**
 * Ensure the provided 'from' number is voice-capable on this Twilio account.
 * If not, fall back to TWILIO_VOICE_FALLBACK_FROM (must be E.164, voice-capable).
 * Returns the E.164 string to use as 'from'.
 */
export async function resolveVoiceFrom(preferredFrom) {
  const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  const normalize = (n) => (n?.startsWith('+') ? n : (n ? '+' + String(n).replace(/\D/g, '') : ''));
  const want = normalize(preferredFrom);
  const found = numbers.find(n => n.phoneNumber === want);
  if (found && found.capabilities && found.capabilities.voice) {
    return want;
  }
  const fallback = normalize(process.env.TWILIO_VOICE_FALLBACK_FROM);
  if (!fallback) {
    throw new Error(`Preferred voice 'from' ${want || '(empty)'} is not voice-capable and no TWILIO_VOICE_FALLBACK_FROM is set`);
  }
  const fb = numbers.find(n => n.phoneNumber === fallback);
  if (!fb || !fb.capabilities?.voice) {
    throw new Error(`TWILIO_VOICE_FALLBACK_FROM ${fallback} is not owned or not voice-capable`);
  }
  return fallback;
}


export async function resolveAnyVoiceFrom(preferred) {
  const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  const normalize = (n) => (n?.startsWith('+') ? n : (n ? '+' + String(n).replace(/\D/g, '') : ''));
  const pref = normalize(preferred) || normalize(process.env.TWILIO_VOICE_FALLBACK_FROM);
  if (pref) {
    const found = numbers.find(n => n.phoneNumber === pref && n.capabilities?.voice);
    if (found) return pref;
  }
  const firstVoice = numbers.find(n => n.capabilities?.voice);
  if (firstVoice) return firstVoice.phoneNumber;
  throw new Error('No voice-capable number found on this account');
}
