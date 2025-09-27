// pages/api/voice/status.js
// Twilio will POST call lifecycle events here.
// Configure PUBLIC_BASE_URL in Vercel (e.g., https://twilio4-messenger.vercel.app)
export default async function handler(req, res) {
  try {
    const log = {
      timestamp: new Date().toISOString(),
      event: req.body?.CallStatus || req.body?.CallStatus?.toString(),
      from: req.body?.From,
      to: req.body?.To,
      sid: req.body?.CallSid,
      raw: req.body
    };
    console.log("Twilio Voice Status:", JSON.stringify(log));
    // 200 OK so Twilio stops retrying
    res.status(200).end();
  } catch (e) {
    console.error("voice/status error", e);
    res.status(200).end();
  }
}
