// components/TemplateManager.js
import { useState, useEffect } from 'react';

export default function TemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [shows, setShows] = useState([]);
  const [filterShow, setFilterShow] = useState('');
  const [newShow, setNewShow] = useState('');

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    const data = await res.json();
    setTemplates(data);
    const uniqueShows = Array.from(new Set(data.map(t => t.show)));
    setShows(uniqueShows);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const saveTemplate = async (idx, updatedFields) => {
    const tpl = templates[idx];
    const res = await fetch(`/api/templates/${tpl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields),
    });
    const updated = await res.json();
    setTemplates(templates.map((t, i) => (i === idx ? updated : t)));
  };

  const deleteTemplate = async (idx) => {
    const tpl = templates[idx];
    await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
    setTemplates(templates.filter((_, i) => i !== idx));
  };

  const addTemplate = async () => {
    if (!filterShow) return;
    const newTpl = { name: '', type: 'SMS', show: filterShow, from_number: '+447723453049', content: '', media_url: '', summary: '' };
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTpl),
    });
    const created = await res.json();
    setTemplates([...templates, created]);
  };

  const addShow = () => {
    if (newShow && !shows.includes(newShow)) {
      setShows([...shows, newShow]);
      setFilterShow(newShow);
      setNewShow('');
    }
  };

  const visibleTemplates = filterShow ? templates.filter(t => t.show === filterShow) : [];

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

      {visibleTemplates.map((tpl, idx) => (
        <div key={tpl.id} className="mb-4 p-4 bg-gray-800 rounded">
          <input
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.name}
            onChange={e => {
              const updated = [...templates];
              updated[idx].name = e.target.value;
              setTemplates(updated);
            }}
            placeholder="Template Name"
          />
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.type}
            onChange={e => {
              const updated = [...templates];
              updated[idx].type = e.target.value;
              setTemplates(updated);
            }}
          >
            <option>SMS</option>
            <option>WhatsApp</option>
            <option>Call</option>
          </select>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.from_number}
            onChange={e => {
              const updated = [...templates];
              updated[idx].from_number = e.target.value;
              setTemplates(updated);
            }}
          >
            <option>+447723453049</option>
            <option>+447480780992</option>
            <option>+18448997279</option>
          </select>
          {tpl.type === 'Call' ? (
            <input
              className="w-full p-2 bg-gray-900 rounded mb-2"
              value={tpl.media_url || ''}
              onChange={e => {
                const updated = [...templates];
                updated[idx].media_url = e.target.value;
                setTemplates(updated);
              }}
              placeholder="MP3 URL"
            />
          ) : (
            <textarea
              className="w-full p-2 bg-gray-900 rounded mb-2"
              rows="2"
              value={tpl.content || ''}
              onChange={e => {
                const updated = [...templates];
                updated[idx].content = e.target.value;
                setTemplates(updated);
              }}
              placeholder="Message Content"
            />
          )}
          <textarea
            className="w-full p-2 bg-gray-900 rounded mb-2"
            rows="2"
            value={tpl.summary || ''}
            onChange={e => {
              const updated = [...templates];
              updated[idx].summary = e.target.value;
              setTemplates(updated);
            }}
            placeholder="Summary of this template"
          />
          <div className="flex space-x-2">
            <button
              className="bg-green-500 px-3 py-1 rounded"
              onClick={() =>
                saveTemplate(idx, {
                  name: tpl.name,
                  type: tpl.type,
                  show: tpl.show,
                  from_number: tpl.from_number,
                  content: tpl.content,
                  media_url: tpl.media_url,
                  summary: tpl.summary,
                })
              }
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

      <div className="mt-4">
        <button
          className="bg-green-500 px-4 py-2 rounded"
          onClick={addTemplate}
          disabled={!filterShow}
        >
          Add Template
        </button>
      </div>

      <div className="mt-6 flex items-center">
        <input
          className="p-2 bg-gray-800 rounded mr-2"
          placeholder="New Show Name"
          value={newShow}
          onChange={e => setNewShow(e.target.value)}
        />
        <button
          className="bg-blue-500 px-3 py-1 rounded"
          onClick={addShow}
        >
          Add Show
        </button>
      </div>
    </div>
  );
}
