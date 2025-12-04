// pages/api/debug/resolve-sender.js
import { normalizePhone } from '../../../lib/normalizePhone';

export default function handler(req, res) {
  try {
    const template = req.body?.template || {};
    const fromRaw = template.from ?? template.from_number ?? template.fromNumber ?? template.sender ?? null;
    const normalized = normalizePhone(fromRaw) || null;
    res.status(200).json({
      hasFromProp: Object.prototype.hasOwnProperty.call(template, 'from'),
      fromRaw,
      normalized,
      keys: Object.keys(template || {})
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
