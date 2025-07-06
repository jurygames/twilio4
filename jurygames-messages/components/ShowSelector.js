
import { useState, useEffect } from 'react';
export default function ShowSelector({ onSelect }) {
  const shows = ['Scott Davies', 'Harry Briggs', 'Christmas Party'];
  const [selected, setSelected] = useState(shows[0]);
  useEffect(() => onSelect && onSelect(selected), [selected]);
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1">Select Show</label>
      <select
        className="w-full p-2 bg-gray-800 rounded"
        value={selected}
        onChange={e => setSelected(e.target.value)}
      >
        {shows.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
