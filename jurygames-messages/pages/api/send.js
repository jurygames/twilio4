// pages/api/send.js
import { sendSMS, sendWhatsApp, makeCall } from '../../lib/twilioClient';
import { resolveAnyVoiceFrom } from '../../lib/resolveVoiceFrom';

function e164(n) {
  if (!n) return '';
  const trimmed = String(n).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+44${digits.slice(1)}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { group, template } = req.body;
    if (!group || !Array.isArray(group.list) || !template) {
      return res.status(400).json({ message: 'Invalid request body' });
    }

    // Normalize type and media keys
    let { type, content } = template;
    const typeNorm = String(type || '').toLowerCase();
    const mediaUrl = template.mediaUrl ?? template.mp3Url ?? template.media_url ?? template.url ?? null;

    let successCount = 0;
    const errors = [];
    const successes = [];

    // Resolve 'from' across common keys
    const fromRaw = template.from ?? template.from_number ?? template.fromNumber ?? template.sender ?? null;
    const fromE164 = e164(fromRaw);
    if (!fromE164) {
      return res.status(400).json({ message: `Template '${template.name || 'unknown'}' is missing a valid 'from' number` });
    }

    console.log('SEND_DIAG', { type, typeNorm, fromRaw, fromE164, hasMedia: !!mediaUrl });

    let callFrom = fromE164;
    let statusCallback;
    if (typeNorm === 'call') {
      callFrom = await resolveAnyVoiceFrom(fromE164);
      const base = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
      statusCallback = /^https?:\/\//i.test(base) ? `${base}/api/voice/status` : undefined;
      if (!statusCallback) {
        console.warn('SEND_DIAG: PUBLIC_BASE_URL missing/invalid; voice status callbacks disabled');
      }
    }

    await Promise.all(
      group.list.map(async (toRaw) => {
        const to = e164(toRaw);
        if (!to) {
          errors.push({ to: toRaw, error: 'Invalid recipient number' });
          return;
        }
        try {
          if (typeNorm === 'sms') {
            const r = await sendSMS(to, fromE164, content);
            successes.push({ to, sid: r.sid });
          } else if (typeNorm === 'whatsapp') {
            const r = await sendWhatsApp(to, fromE164, content);
            successes.push({ to, sid: r.sid });
          } else if (typeNorm === 'call') {
            if (!mediaUrl) throw new Error('Call template missing mediaUrl');
            const r = await makeCall(to, callFrom, mediaUrl, statusCallback);
            successes.push({ to, sid: r.sid });
          } else {
            throw new Error(`Unsupported message type: ${type}`);
          }
          successCount++;
        } catch (err) {
          errors.push({ to, error: err.message });
        }
      })
    );

    const errorCount = errors.length;
    const responseStatus = successCount === 0 ? 400 : (errorCount > 0 ? 207 : 200);

    return res.status(responseStatus).json({
      diag: {
        route: typeNorm,
        fromRequested: fromE164,
        fromUsed: typeNorm === 'call' ? callFrom : fromE164,
        mediaUrlUsed: mediaUrl
      },
      message: `${successCount} ${type || typeNorm}${successCount !== 1 ? 's' : ''} sent${errorCount ? `, ${errorCount} failed` : ''}`,
      successes,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
