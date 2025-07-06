
import { useState } from 'react';
import templatesData from '../data/templates.json';

export default function TemplateManager({ onSelectTemplate }) {
  const [templates, setTemplates] = useState(templatesData);
  const [name, setName] = useState('');
  const [type, setType] = useState('SMS');
  const [show, setShow] = useState('Scott Davies');
  const [from, setFrom] = useState('+447723453049');
  const [content, setContent] = useState('');

  const saveTemplate = () => {
    const newTpl = { name, type, show, from, content };
    setTemplates([...templates, newTpl]);
    setName(''); setContent('');
  };
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">Templates</h2>
      <select value={type} onChange={e=>setType(e.target.value)} className="mb-2 p-2 bg-gray-800 rounded">
        <option>SMS</option><option>WhatsApp</option><option>Call</option>
      </select>
      <input className="w-full p-2 bg-gray-800 rounded mb-2" placeholder="Template Name" value={name} onChange={e=>setName(e.target.value)}/>
      <select value={show} onChange={e=>setShow(e.target.value)} className="mb-2 p-2 bg-gray-800 rounded">
        <option>Scott Davies</option><option>Harry Briggs</option><option>Christmas Party</option>
      </select>
      <select value={from} onChange={e=>setFrom(e.target.value)} className="mb-2 p-2 bg-gray-800 rounded">
        <option>+447723453049</option><option>+447480780992</option><option>+18448997279</option>
      </select>
      <textarea className="w-full p-2 bg-gray-800 rounded mb-2" rows="2" placeholder="Content or MP3 URL" value={content} onChange={e=>setContent(e.target.value)}/>
      <button className="bg-blue-500 px-4 py-2 rounded" onClick={saveTemplate}>Add Template</button>
      <ul className="mt-2">
        {templates.filter(t=>t.show===show).map((t,i)=>(
          <li key={i}>{t.name} - {t.type}</li>
        ))}
      </ul>
    </div>
  );
}
