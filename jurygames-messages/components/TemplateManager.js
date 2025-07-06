// components/TemplateManager.js
import { useState, useEffect } from 'react';
import templatesData from '../data/templates.js';

export default function TemplateManager() {
  // State for full templates + shows list
  const [templates, setTemplates] = useState([]);
  const [shows, setShows] = useState([]);
  
  // UI state
  const [filterShow, setFilterShow] = useState('');
  const [newShow, setNewShow] = useState('');

  // Load templates & show list on mount
  useEffect(() => {
    setTemplates(templatesData);
    const uniqueShows = Array.from(new Set(templatesData.map(t => t.show)));
    setShows(uniqueShows);
    setFilterShow(uniqueShows[0] || '');
  }, []);

  // Handlers
  const saveTemplate = (idx, updated) => {
    const updatedList = templates.map((tpl, i) =>
      i === idx ? { ...tpl, ...updated } : tpl
    );
    setTemplates(updatedList);
  };
  const deleteTemplate = idx => {
    setTemplates(templates.filter((_, i) => i !== idx));
  };
  const addShow = () => {
    if (newShow && !shows.includes(newShow)) {
      setShows([...shows, newShow]);
      setFilterShow(newShow);
      setNewShow('');
    }
  };
  const addTemplate = () => {
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

  // Only show templates matching filter
  const visibleTemplates = templates.filter(t => t.show === filterShow);

  return (
    <div>
      <div className="flex mb-4 items-center">
        <label className="mr-2">Filter by Show:</label>
        <select
          className="p-2 bg-gray-800 rounded mr-4"
          value={filterShow}
          onChange={e => setFilterShow(e.target.value)}
        >
          {shows.map((s, i) => (
            <option key={i} value={s}>{s}</option>
          ))}
        </select>

        <input
          className="p-2 bg-gray-800 rounded mr-2"
          placeholder="New Show"
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

      {visibleTemplates.map((tpl, idx) => (
        <div key={idx} className="mb-4 p-4 bg-gray-800 rounded">
          {/* Template Name */}
          <input
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.name}
            onChange={e => saveTemplate(idx, { name: e.target.value })}
            placeholder="Template Name"
          />

          {/* Type */}
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.type}
            onChange={e => saveTemplate(idx, { type: e.target.value })}
          >
            <option>SMS</option>
            <option>WhatsApp</option>
            <option>Call</option>
          </select>

          {/* Show assignment */}
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.show}
            onChange={e => saveTemplate(idx, { show: e.target.value })}
          >
            {shows.map((s, i) => (
              <option key={i} value={s}>{s}</option>
            ))}
          </select>

          {/* From number */}
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.from}
            onChange={e => saveTemplate(idx, { from: e.target.value })}
          >
            <option>+447723453049</option>
            <option>+447480780992</option>
            <option>+18448997279</option>
          </select>

          {/* Content or MP3 URL */}
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

          {/* Delete button */}
          <button
            className="bg-red-600 px-3 py-1 rounded"
            onClick={() => deleteTemplate(idx)}
          >
            Delete
          </button>
        </div>
      ))}

      {/* Add new template */}
      <button
        className="mt-4 bg-green-500 px-4 py-2 rounded"
        onClick={addTemplate}
      >
        Add Template
      </button>
    </div>
  );
}
