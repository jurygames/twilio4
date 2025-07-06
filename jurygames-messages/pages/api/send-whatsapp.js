
import { sendWhatsApp } from '../../lib/twilioClient';
export default async function handler(req, res) {
  await sendWhatsApp('+1234567890', process.env.DEFAULT_FROM_NUMBER_UK, 'Test WhatsApp');
  res.status(200).json({ message: 'WhatsApp sent' });
}
