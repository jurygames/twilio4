import Twilio from 'twilio';

let client;

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('twilio_not_configured');
  }
  if (!client) client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

export const sendSMS = (to, from, body) => getClient().messages.create({ to, from, body });

// Do not send free-form WhatsApp bodies. Outbound sends must be re-enabled
// only with a Twilio Content SID verified as WhatsApp-approved.
export const sendWhatsApp = () => {
  throw new Error('whatsapp_content_template_required');
};

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export const makeCall = async (to, from, mediaUrl, statusCallback) => {
  const twiml = `<Response><Play>${escapeXml(mediaUrl)}</Play></Response>`;
  const payload = { to, from, twiml };
  if (statusCallback) {
    payload.statusCallback = statusCallback;
    payload.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
  }
  return getClient().calls.create(payload);
};
