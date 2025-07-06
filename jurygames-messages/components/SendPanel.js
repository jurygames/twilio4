
import { useState } from 'react';

export default function SendPanel({ selectedShow, selectedGroup, selectedTemplate }) {
  const [status, setStatus] = useState('');

  const sendMessage = async (type) => {
    setStatus('Sending...');
    try {
      const response = await fetch(`/api/send-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show: selectedShow,
          group: selectedGroup,
          template: selectedTemplate
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Send failed');
      }
      setStatus(`${type.charAt(0).toUpperCase() + type.slice(1)} sent successfully`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">Send</h2>
      <button
        className="bg-green-500 px-4 py-2 rounded mr-2"
        onClick={() => sendMessage('sms')}
      >
        SMS
      </button>
      <button
        className="bg-green-500 px-4 py-2 rounded mr-2"
        onClick={() => sendMessage('whatsapp')}
      >
        WhatsApp
      </button>
      <button
        className="bg-green-500 px-4 py-2 rounded"
        onClick={() => sendMessage('call')}
      >
        Call
      </button>
      <p className="mt-2 text-sm text-gray-300">{status}</p>
    </div>
  );
}
