
import { sendSMS } from '../../lib/twilioClient';
export default async function handler(req, res) {
  // expecting { to, templateName } in req.body
  // for demo, send to fixed number
  await sendSMS('+1234567890', process.env.DEFAULT_FROM_NUMBER_UK, 'Test SMS');
  res.status(200).json({ message: 'SMS sent' });
}
