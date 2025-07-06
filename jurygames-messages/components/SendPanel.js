
import { useState } from 'react';
import twilioClient from '../lib/twilioClient';
export default function SendPanel() {
  const [status, setStatus] = useState('');
  const send = async (type) => {
    setStatus('Sending...');
    const res = await fetch(`/api/send-${type.toLowerCase()}`, { method: 'POST' });
    const json = await res.json();
    setStatus(json.message);
  };
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">Send</h2>
      <button className="bg-green-500 px-4 py-2 rounded mr-2" onClick={()=>send('sms')}>SMS</button>
      <button className="bg-green-500 px-4 py-2 rounded mr-2" onClick={()=>send('whatsapp')}>WhatsApp</button>
      <button className="bg-green-500 px-4 py-2 rounded" onClick={()=>send('call')}>Call</button>
      <p className="mt-2">{status}</p>
    </div>
  );
}
