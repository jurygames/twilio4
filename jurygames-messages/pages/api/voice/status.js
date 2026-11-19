import Twilio from 'twilio';
import security from '../../../lib/security';

const { callbackUrl, verifyTwilioSignature } = security;

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signatureHeader = req.headers['x-twilio-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const url = callbackUrl(req.url);
  if (!authToken || !url) return res.status(503).end();
  if (!verifyTwilioSignature(Twilio, authToken, signature, url, req.body || {})) {
    return res.status(403).end();
  }

  // Callback parameters can contain customer numbers; never log or persist them here.
  return res.status(204).end();
}
