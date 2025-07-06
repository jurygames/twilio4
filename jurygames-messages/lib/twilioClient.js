
import Twilio from 'twilio';
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
export const sendSMS = async (to, from, body) => {
  return client.messages.create({ to, from, body });
};
export const sendWhatsApp = async (to, from, body) => {
  return client.messages.create({ to: 'whatsapp:'+to, from: 'whatsapp:'+from, body });
};
export const makeCall = async (to, from, url) => {
  return client.calls.create({ to, from, url });
};
