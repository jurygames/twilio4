// pages/api/send.js
import { sendSMS, sendWhatsApp, makeCall } from '../../lib/twilioClient';
import { resolveVoiceFrom } from '../../lib/resolveVoiceFrom';

function e164(n) {
  if (!n) return '';
  const trimmed = String(n).trim();
  if (!trimmed) return '';
  return trimmed.startsWith('+') ? trimmed : '+' + trimmed.replace(/\D/g, '');
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
    let { type, content, mediaUrl } = template;
    const typeNorm = String(type || '').trim().toLowerCase();
    const fromRaw = template.from ?? template.from_number ?? template.fromNumber ?? template.sender ?? null;
    let successCount = 0;
    const errors = [];
    const successes = [];

    // Pre-validate sender
    const fromE164 = e164(fromRaw);
    if (!fromE164) { console.error('Missing from in template', { keys: Object.keys(template || {}), templateFrom: template?.from, fromRaw });
      return res.status(400).json({ message: `Template '${template.name || 'unknown'}' is missing a valid 'from' number` });
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
            const statusCallback = `${process.env.PUBLIC_BASE_URL || ''}/api/voice/status` || undefined;
            const r = await makeCall(to, fromE164, mediaUrl, statusCallback);
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

    return res.status(200).json({
      message: `${successCount} ${type || typeNorm}${successCount !== 1 ? 's' : ''} sent`,
      successes,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
