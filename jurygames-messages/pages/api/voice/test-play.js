// pages/api/voice/test-play.js
import Twilio from 'twilio';
import { resolveAnyVoiceFrom } from '../../../lib/resolveVoiceFrom';

export default async function handler(req, res) {
  try {
    const to = req.query.to || req.body?.to;
    const url = req.query.url || req.body?.url;
    if (!to || !url) return res.status(400).json({ error: "Provide ?to=+E164&url=https://..." });
    const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const from = await resolveAnyVoiceFrom(req.query.from || req.body?.from);
    const r = await client.calls.create({
      to,
      from,
      twiml: `<Response><Play>${url}</Play></Response>`,
      statusCallback: `${process.env.PUBLIC_BASE_URL || ''}/api/voice/status`,
      statusCallbackEvent: ['initiated','ringing','answered','completed']
    });
    res.status(200).json({ ok: true, sid: r.sid, from, to, url });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
}
