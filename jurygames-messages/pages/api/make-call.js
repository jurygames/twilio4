
import { makeCall } from '../../lib/twilioClient';
export default async function handler(req, res) {
  await makeCall('+1234567890', process.env.DEFAULT_FROM_NUMBER_UK, 
    'https://img1.wsimg.com/blobby/go/a1fcfcf6-ebb3-42af-900f-bac6da508cb5/downloads/2649e7ca-7852-40f1-b3f1-fd2a9094f0d1/ti-sally-call.mp3?ver=1751047203736'
  );
  res.status(200).json({ message: 'Call initiated' });
}
