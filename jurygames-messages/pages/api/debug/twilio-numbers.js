// pages/api/debug/twilio-numbers.js
import Twilio from 'twilio';
export default async function handler(req, res) {
  try {
    const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const nums = await client.incomingPhoneNumbers.list({ limit: 50 });
    const rows = nums.map(n => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      capabilities: n.capabilities,
      friendlyName: n.friendlyName
    }));
    res.status(200).json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
