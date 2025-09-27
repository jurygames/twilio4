// pages/api/voice/status.js
export default async function handler(req, res) {
  try {
    console.log('Twilio Voice Status:', JSON.stringify({
      timestamp: new Date().toISOString(),
      CallSid: req.body?.CallSid,
      From: req.body?.From,
      To: req.body?.To,
      CallStatus: req.body?.CallStatus
    }));
    res.status(200).end();
  } catch (e) {
    console.error('voice/status error', e);
    res.status(200).end();
  }
}
