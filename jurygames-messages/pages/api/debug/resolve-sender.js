// pages/api/debug/resolve-sender.js
export default function handler(req, res) {
  try {
    const template = req.body?.template || {};
    const fromRaw = template.from ?? template.from_number ?? template.fromNumber ?? template.sender ?? null;
    const normalized = typeof fromRaw === 'string'
      ? (fromRaw.startsWith('+') ? fromRaw : ('+' + fromRaw.replace(/\D/g, '')))
      : null;
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
