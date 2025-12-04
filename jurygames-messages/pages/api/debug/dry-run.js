// pages/api/debug/dry-run.js
import { normalizePhone } from '../../../lib/normalizePhone';

export default function handler(req, res) {
  try {
    const template = req.body?.template || {};
    const type = template.type;
    const typeNorm = String(type || '').toLowerCase();
    const fromRaw = template.from ?? template.from_number ?? template.fromNumber ?? template.sender ?? null;
    const fromE164 = normalizePhone(fromRaw);
    const mediaUrl = template.mediaUrl ?? template.mp3Url ?? template.media_url ?? template.url ?? null;
    res.status(200).json({ route: typeNorm, fromRaw, fromE164, mediaUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
