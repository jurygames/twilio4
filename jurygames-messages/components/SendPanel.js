// components/SendPanel.js
import { useState, useEffect } from 'react';

export default function SendPanel({ groups, onLog }) {
  const [templates, setTemplates] = useState([]);
  const [showOptions, setShowOptions] = useState([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedShow, setSelectedShow] = useState('');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState({ group: null, template: null });

  // Fetch templates from API
  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    if (!res.ok) {
      console.error('Failed to fetch templates');
      return;
    }
    const data = await res.json();
    setTemplates(data);
    const shows = Array.from(new Set(data.map(t => t.show)));
    setShowOptions(shows);
    // Initialize selectedShow on first load
    if (!selectedShow) {
      setSelectedShow(shows.includes('Harry Briggs') ? 'Harry Briggs' : shows[0] || '');
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Update filtered templates when show changes
  const filteredTemplates = templates.filter(t => t.show === selectedShow);

  // Open confirmation modal
  const openConfirm = () => {
    const group = groups[selectedGroupIndex];
    const template = filteredTemplates[selectedTemplateIndex];
    setPendingData({ group, template });
    setConfirmOpen(true);
  };

  // Send after confirmation
  const confirmSend = async () => {
    setConfirmOpen(false);
    setStatus('Sending...');
    try {
      const { group, template } = pendingData;
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Send failed');
      const okCount = (data.successes || []).length;
      const errCount = (data.errors || []).length;
      setStatus(`Sent: ${okCount} success, ${errCount} error${errCount===1?'':'s'}`);
      if (data.errors && data.errors.length) { console.warn('Errors:', data.errors); }
      if (data.successes && data.successes.length) { console.log('Successes:', data.successes); }
      onLog({
        time: new Date(),
        type: template.type,
        template: template.name,
        groupName: group.name,
      });
    } catch (err) {
      setStatus('Error: ' + err.message);
      onLog({
        time: new Date(),
        type: 'Error',
        message: err.message,
      });
    }
  };

  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">📤📲 Send Message or Call</h2>

      <label className="block text-sm mb-1">Select Group</label>
      <select
        className="w-full mb-2 p-2 bg-gray-800 rounded"
        value={selectedGroupIndex}
        onChange={e => setSelectedGroupIndex(Number(e.target.value))}
      >
        {groups.map((g, i) => (
          <option key={i} value={i}>
            {g.name} ({g.list.length} {g.list.length === 1 ? 'number' : 'numbers'})
          </option>
        ))}
      </select>

      <label className="block text-sm mb-1">Select Show</label>
      <select
        className="w-full mb-2 p-2 bg-gray-800 rounded"
        value={selectedShow}
        onChange={e => {
          setSelectedShow(e.target.value);
          setSelectedTemplateIndex(0);
        }}
      >
        {showOptions.map((s, idx) => (
          <option key={idx} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label className="block text-sm mb-1">Select Template</label>
      <select
        className="w-full mb-2 p-2 bg-gray-800 rounded"
        value={selectedTemplateIndex}
        onChange={e => setSelectedTemplateIndex(Number(e.target.value))}
      >
        {filteredTemplates.map((t, i) => (
          <option key={i} value={i}>
            {t.name} ({t.type})
          </option>
        ))}
      </select>

      <button className="bg-green-500 px-4 py-2 rounded" onClick={openConfirm}>
        Send
      </button>

      <p className="mt-2 text-gray-300">{status}</p>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">Confirm Send</h3>
            <p className="mb-2">
              This will send <strong>{pendingData.template.name}</strong> to <strong>{pendingData.group.name}</strong>.
            </p>
            <p className="mb-4">
              Summary: <em>{pendingData.template.summary}</em>
            </p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-green-600 text-white rounded"
                onClick={confirmSend}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
);
}
