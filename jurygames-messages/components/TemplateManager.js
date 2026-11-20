// components/TemplateManager.js
import { useState, useEffect } from 'react';

export default function TemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [originalTemplates, setOriginalTemplates] = useState([]);
  const [shows, setShows] = useState([]);
  const [senders, setSenders] = useState([]);
  const [filterShow, setFilterShow] = useState('');
  const [error, setError] = useState('');

  // Fetch templates on mount and refresh
  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.templates)) {
      setError(data.error || 'Templates are unavailable.');
      return;
    }
    const rows = data.templates;
    const cloned = rows.map(t => ({ ...t }));
    setTemplates(cloned);
    setOriginalTemplates(cloned.map(t => ({ ...t })));
    setSenders(Array.isArray(data.allowedFromNumbers) ? data.allowedFromNumbers : []);
    const uniqueShows = Array.from(new Set(rows.map(t => t.show)));
    setShows(uniqueShows);
    setError('');
    if (!filterShow && uniqueShows.length > 0) {
      setFilterShow(uniqueShows[0]);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const updateLocal = (index, field, value) => {
    setTemplates(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const saveTemplate = async (index) => {
    const tpl = templates[index];
    const { id, ...fields } = tpl;
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      await fetchTemplates();
    } else {
      const err = await res.json();
      alert('Save failed: ' + err.error);
    }
  };

  const revertTemplate = (index) => {
    const original = originalTemplates[index];
    setTemplates(prev => {
      const updated = [...prev];
      updated[index] = { ...original };
      return updated;
    });
  };

  const deleteTemplate = async (index) => {
    const tpl = templates[index];
    if (!confirm('Are you sure you want to PERMANENTLY delete this template?')) {
      return;
    }
    const res = await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE', headers: { 'x-jurygames-request': '1' } });
    if (!res.ok) {
      setError('Template deletion failed.');
      return;
    }
    setTemplates(prev => prev.filter((_, i) => i !== index));
    setOriginalTemplates(prev => prev.filter((_, i) => i !== index));
  };

  const addTemplate = async () => {
    if (!filterShow) return;
    if (!senders.length) {
      setError('No approved sender numbers are configured.');
      return;
    }
    const newTpl = {
      name: 'New message template',
      type: 'SMS',
      show: filterShow,
      from_number: senders[0],
      content: '',
      media_url: '',
      summary: ''
    };
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
      body: JSON.stringify(newTpl),
    });
    if (res.ok) {
      await fetchTemplates();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Template creation failed.');
    }
  };

  const visible = templates
    .map((tpl, idx) => ({ tpl, idx }))
    .filter(({ tpl }) => tpl.show === filterShow);

  return (
    <div>
      <h2 className="text-2xl font-bold uppercase mb-4">🛠️ Template Management</h2>
      <div className="flex mb-4 items-center">
        <label className="mr-2 uppercase">Show</label>
        <select
          className="p-2 bg-gray-800 rounded"
          value={filterShow}
          onChange={e => setFilterShow(e.target.value)}
        >
          <option value="">-- Select a show --</option>
          {shows.map((s, i) => (
            <option key={i} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {error ? <p role="alert" className="mb-3 text-sm text-amber-300">{error}</p> : null}

      {/* Add Template button at top */}
      <div className="mb-4">
        <button
          className="bg-green-500 px-4 py-2 rounded"
          onClick={addTemplate}
          disabled={!filterShow}
        >
          Add Template for "{filterShow}"
        </button>
      </div>

      {visible.map(({ tpl, idx }) => (
        <div key={idx} className="mb-4 p-4 bg-gray-800 rounded">
          {/* Show label */}
          <div className="text-sm text-gray-400 mb-1">Show: {tpl.show}</div>
          <input
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.name}
            onChange={e => updateLocal(idx, 'name', e.target.value)}
            placeholder="Template Name"
          />
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.type}
            onChange={e => updateLocal(idx, 'type', e.target.value)}
          >
            <option>SMS</option>
            <option disabled value="WhatsApp">WhatsApp — approved Twilio Content template required</option>
            <option>Call</option>
          </select>
          <p className="mb-2 text-xs text-gray-400">WhatsApp outbound remains unavailable until an approved Twilio Content SID and sender are configured.</p>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.from_number}
            onChange={e => updateLocal(idx, 'from_number', e.target.value)}
          >
            {senders.map(sender => <option key={sender} value={sender}>{sender}</option>)}
          </select>
          {tpl.type === 'Call' ? (
            <input
              className="w-full p-2 bg-gray-900 rounded mb-2 resize-none"
              value={tpl.media_url || ''}
              onChange={e => updateLocal(idx, 'media_url', e.target.value)}
              placeholder="MP3 URL"
            />
          ) : (
            <textarea
              className="w-full p-2 bg-gray-900 rounded mb-2 resize-none overflow-hidden"
              rows={1}
              value={tpl.content || ''}
              onChange={e => {
                updateLocal(idx, 'content', e.target.value);
                const ta = e.target;
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
              }}
              placeholder="Message Content"
            />
          )}
          <textarea
            className="w-full p-2 bg-gray-900 rounded mb-2 resize-none overflow-hidden"
            rows={1}
            value={tpl.summary || ''}
            onChange={e => {
              updateLocal(idx, 'summary', e.target.value);
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = ta.scrollHeight + 'px';
            }}
            placeholder="Summary of this template"
          />
          <div className="flex space-x-2">
            <button
              className="bg-yellow-500 px-3 py-1 rounded"
              onClick={() => revertTemplate(idx)}
            >
              Revert
            </button>
            <button
              className="bg-green-500 px-3 py-1 rounded"
              onClick={() => saveTemplate(idx)}
            >
              Save
            </button>
            <button
              className="bg-red-600 px-3 py-1 rounded"
              onClick={() => deleteTemplate(idx)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
