
// components/TemplateManager.js
import { useState, useEffect } from 'react';
import templatesData from '../data/templates.js';

export default function TemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [shows, setShows] = useState([]);
  const [filterShow, setFilterShow] = useState('');
  const [newShow, setNewShow] = useState('');

  useEffect(() => {
    setTemplates(templatesData);
    const uniqueShows = Array.from(new Set(templatesData.map(t => t.show)));
    setShows(uniqueShows);
  }, []);

  const saveTemplate = (idx, updated) => {
    const updatedList = templates.map((tpl, i) =>
      i === idx ? { ...tpl, ...updated } : tpl
    );
    setTemplates(updatedList);
  };

  const deleteTemplate = idx => {
    setTemplates(templates.filter((_, i) => i !== idx));
  };

  const addTemplate = () => {
    if (!filterShow) return;
    setTemplates([
      ...templates,
      {
        name: '',
        type: 'SMS',
        show: filterShow,
        from: '+447723453049',
        content: '',
        mediaUrl: '',
      }
    ]);
  };

  const addShow = () => {
    if (newShow && !shows.includes(newShow)) {
      setShows([...shows, newShow]);
      setFilterShow(newShow);
      setNewShow('');
    }
  };

  const visibleTemplates = filterShow
    ? templates.filter(t => t.show === filterShow)
    : [];

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Manage Templates</h2>

      <div className="flex mb-4 items-center">
        <label className="mr-2">Filter by Show:</label>
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
        <div key={idx} className="mb-4 p-4 bg-gray-800 rounded">
          <input
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.name}
            onChange={e => saveTemplate(idx, { name: e.target.value })}
            placeholder="Template Name"
          />
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.type}
            onChange={e => saveTemplate(idx, { type: e.target.value })}
          >
            <option>SMS</option>
            <option>WhatsApp</option>
            <option>Call</option>
          </select>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.show}
            onChange={e => saveTemplate(idx, { show: e.target.value })}
          >
            {shows.map((s, i) => (
              <option key={i} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.from}
            onChange={e => saveTemplate(idx, { from: e.target.value })}
          >
            <option>+447723453049</option>
            <option>+447480780992</option>
            <option>+18448997279</option>
          </select>
          {tpl.type === 'Call' ? (
            <input
              className="w-full p-2 bg-gray-900 rounded mb-2"
              value={tpl.mediaUrl}
              onChange={e => saveTemplate(idx, { mediaUrl: e.target.value })}
              placeholder="MP3 URL"
            />
          ) : (
            <textarea
              className="w-full p-2 bg-gray-900 rounded mb-2"
              rows="2"
              value={tpl.content}
              onChange={e => saveTemplate(idx, { content: e.target.value })}
              placeholder="Message Content"
            />
          )}
          <button
            className="bg-red-600 px-3 py-1 rounded"
            onClick={() => deleteTemplate(idx)}
          >
            Delete
          </button>
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

      {/* Add Show at bottom */}
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
