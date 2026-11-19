// components/GroupManager.js
import { useState, useEffect } from 'react';

export default function GroupManager({ onGroupsChange }) {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    onGroupsChange?.(groups);
  }, [groups, onGroupsChange]);

  const saveGroup = () => {
    const list = [...new Set(numbers
      .split(/\r?\n|,/)
      .map(n => n.replace(/[\s().-]/g, '').trim())
      .filter(n => n))];
    if (!name.trim() || name.trim().length > 80) {
      setError('Enter a group name of 1–80 characters.');
      return;
    }
    if (list.length === 0 || list.some(n => !/^\+[1-9]\d{7,14}$/.test(n))) {
      setError('Use international E.164 numbers, including + and country code. No number was saved.');
      return;
    }
    if (list.length > 50) {
      setError('A group can contain up to 50 unique numbers.');
      return;
    }
    const updated = [...groups, { name: name.trim(), list }];
    setGroups(updated);
    onGroupsChange?.(updated);
    setName('');
    setNumbers('');
    setError('');
  };

  const deleteGroup = idx => {
    const updated = groups.filter((_, i) => i !== idx);
    setGroups(updated);
    onGroupsChange?.(updated);
  };

  const purgeAll = () => {
    if (confirm('Permanently delete ALL groups?')) {
      setGroups([]);
      onGroupsChange?.([]);
      setError('');
    }
  };

  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold font-['Roboto_Condensed'] uppercase mb-2">
        🧑‍🧑‍🧒‍🧒 Groups
      </h2>
      <textarea
        className="w-full p-2 bg-gray-800 rounded mb-2"
        rows="3"
        placeholder="Paste numbers (one per line or comma-separated)"
        value={numbers}
        onChange={e => setNumbers(e.target.value)}
      />
      <input
        className="w-full p-2 bg-gray-800 rounded mb-2"
        placeholder="Group Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button className="bg-blue-500 px-4 py-2 rounded mr-2" onClick={saveGroup}>
        Save Group
      </button>
      <button className="bg-red-600 px-4 py-2 rounded" onClick={purgeAll}>
        Purge All
      </button>
      <ul className="mt-2">
        {groups.map((g, i) => (
          <li key={i} className="flex justify-between">
            <span>{g.name} ({g.list.length} {g.list.length === 1 ? 'number' : 'numbers'})</span>
            <button className="text-red-500" onClick={() => deleteGroup(i)}>Delete</button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-2 text-sm text-amber-300">{error}</p> : null}
    </div>
);
}
