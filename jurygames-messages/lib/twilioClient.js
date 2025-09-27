
// lib/twilioClient.js
import Twilio from 'twilio';
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendSMS = (to, from, body) => {
  return client.messages.create({ to, from, body });
};

export const sendWhatsApp = (to, from, body) => {
  return client.messages.create({ to: 'whatsapp:' + to, from: 'whatsapp:' + from, body });
};

export const makeCall = async (to, from, mediaUrl) => {
  const twiml = `<Response><Play>${mediaUrl}</Play></Response>`;
  return client.calls.create({ to, from, twiml });
};
