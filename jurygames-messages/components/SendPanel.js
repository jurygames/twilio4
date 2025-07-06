// components/SendPanel.js
import { useState, useEffect } from 'react';
import templatesData from '../data/templates.js';

export default function SendPanel({ groups, onLog }) {
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedShow, setSelectedShow] = useState('Harry Briggs');
  const [showOptions, setShowOptions] = useState([]);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const shows = Array.from(new Set(templatesData.map(t => t.show)));
    setShowOptions(shows);
    if (shows.includes('Harry Briggs')) {
      setSelectedShow('Harry Briggs');
    } else {
      setSelectedShow(shows[0] || '');
    }
  }, []);

  useEffect(() => {
    const list = templatesData.filter(t => t.show === selectedShow);
    setFilteredTemplates(list);
    setSelectedTemplateIndex(0);
  }, [selectedShow]);

  const send = async () => {
    setStatus('Sending...');
    try {
      const group = groups[selectedGroupIndex];
      const template = filteredTemplates[selectedTemplateIndex];
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Send failed');
      setStatus('Sent successfully');
      onLog({
        time: new Date(),
        type: template.type,
        template: template.name,
        groupName: group.name
      });
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      onLog({
        time: new Date(),
        type: 'Error',
        message: err.message
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
          <option key={i} value={i}>{g.name} ({g.list.length} {g.list.length === 1 ? 'number' : 'numbers'})</option>
        ))}
      </select>

      <label className="block text-sm mb-1">Select Show</label>
      <select
        className="w-full mb-2 p-2 bg-gray-800 rounded"
        value={selectedShow}
        onChange={e => setSelectedShow(e.target.value)}
      >
        {showOptions.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
      </select>

      <label className="block text-sm mb-1">Select Template</label>
      <select
        className="w-full mb-2 p-2 bg-gray-800 rounded"
        value={selectedTemplateIndex}
        onChange={e => setSelectedTemplateIndex(Number(e.target.value))}
      >
        {filteredTemplates.map((t, i) => (
          <option key={i} value={i}>{t.name} ({t.type})</option>
        ))}
      </select>

      <button className="bg-green-500 px-4 py-2 rounded" onClick={send}>
        Send
      </button>

      <p className="mt-2 text-gray-300">{status}</p>
    </div>
);
}
