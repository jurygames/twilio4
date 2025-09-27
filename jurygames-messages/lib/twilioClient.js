
// lib/twilioClient.js
import Twilio from 'twilio';
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendSMS = (to, from, body) => {
  return client.messages.create({ to, from, body });
};

export const sendWhatsApp = (to, from, body) => {
  return client.messages.create({ to: 'whatsapp:' + to, from: 'whatsapp:' + from, body });
};

export const makeCall = async (to, from, mediaUrl, statusCallback) => {
  const twiml = `<Response><Play>${mediaUrl}</Play></Response>`;
  const payload = { to, from, twiml };
  if (statusCallback) { payload.statusCallback = statusCallback; payload.statusCallbackEvent = ['initiated','ringing','answered','completed']; }
  return client.calls.create(payload);
};
