// pages/api/send.js
import { sendSMS, sendWhatsApp, makeCall } from '../../lib/twilioClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { group, template } = req.body;
    if (!group || !Array.isArray(group.list) || !template) {
      return res.status(400).json({ message: 'Invalid request body' });
    }
    const { type, from, content, mediaUrl } = template;
    let successCount = 0;
    const errors = [];

    // Process each destination number in parallel
    console.log('SEND_DIAG', { type, typeNorm, fromRaw, fromE164, hasMedia: !!mediaUrl });

    await Promise.all(
      group.list.map(async (to) => {
        try {
          if (type === 'SMS') {
            await sendSMS(to, from, content);
          } else if (type === 'WhatsApp') {
            await sendWhatsApp(to, from, content);
          } else if (type === 'Call') {
            await makeCall(to, from, mediaUrl);
          } else {
            throw new Error(`Unsupported message type: ${type}`);
          }
          successCount++;
        } catch (err) {
          errors.push({ to, error: err.message });
        }
      })
    );

    return res.status(200).json({ diag: { route: typeNorm, from: fromE164, mediaUrlUsed: mediaUrl },
      message: `${successCount} ${type}${successCount !== 1 ? 's' : ''} sent`,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}
