// components/TemplateManager.js
import { useState } from 'react';
import templatesData from '../data/templates.js';

export default function TemplateManager() {
  const [templates, setTemplates] = useState(templatesData);
  const [shows, setShows] = useState([...new Set(templatesData.map(t => t.show))]);
  const [newShow, setNewShow] = useState('');

  const saveTemplate = (index, updated) => {
    const list = templates.map((tpl, i) => i === index ? {...tpl, ...updated} : tpl);
    setTemplates(list);
    // persist as needed
  };

  const deleteTemplate = (index) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };

  const addShow = () => {
    if (newShow && !shows.includes(newShow)) {
      setShows([...shows, newShow]);
      setNewShow('');
    }
  };

  const addTemplate = () => {
    const tpl = {
      name: '',
      type: 'SMS',
      show: shows[0] || '',
      from: '+447723453049',
      content: ''
    };
    setTemplates([...templates, tpl]);
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Manage Templates</h2>
      <div className="mb-4">
        <input
          className="p-2 bg-gray-800 rounded mr-2"
          placeholder="New Show Name"
          value={newShow}
          onChange={e => setNewShow(e.target.value)}
        />
        <button className="bg-blue-500 px-4 py-2 rounded" onClick={addShow}>Add Show</button>
      </div>
      {templates.map((tpl, idx) => (
        <div key={idx} className="mb-4 p-4 bg-gray-800 rounded">
          <input
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.name}
            onChange={e => saveTemplate(idx, {name: e.target.value})}
            placeholder="Template Name"
          />
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.type}
            onChange={e => saveTemplate(idx, {type: e.target.value})}
          >
            <option>SMS</option><option>WhatsApp</option><option>Call</option>
          </select>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.show}
            onChange={e => saveTemplate(idx, {show: e.target.value})}
          >
            {shows.map((s,i) => <option key={i}>{s}</option>)}
          </select>
          <select
            className="w-full p-2 bg-gray-900 rounded mb-2"
            value={tpl.from}
            onChange={e => saveTemplate(idx, {from: e.target.value})}
          >
            <option>+447723453049</option><option>+447480780992</option><option>+18448997279</option>
          </select>
          {tpl.type === 'Call' ? (
            <input
              className="w-full p-2 bg-gray-900 rounded mb-2"
              value={tpl.mediaUrl}
              onChange={e => saveTemplate(idx, {mediaUrl: e.target.value})}
              placeholder="MP3 URL"
            />
          ) : (
            <textarea
              className="w-full p-2 bg-gray-900 rounded mb-2"
              rows="2"
              value={tpl.content}
              onChange={e => saveTemplate(idx, {content: e.target.value})}
              placeholder="Message content"
            />
          )}
          <button className="bg-red-600 px-3 py-1 rounded" onClick={() => deleteTemplate(idx)}>Delete</button>
        </div>
      ))}
      <button className="mt-4 bg-green-500 px-4 py-2 rounded" onClick={addTemplate}>Add Template</button>
    </div>
);
}
