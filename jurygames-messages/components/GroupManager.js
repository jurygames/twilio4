// components/GroupManager.js
import { useState, useEffect } from 'react';
import { callingCodes, callingCodesStartingWith7 } from '../data/callingCodes';

export default function GroupManager({ onGroupsChange }) {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const [countryCode, setCountryCode] = useState('44');

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('groups') || '[]');
    setGroups(saved);
    onGroupsChange?.(saved);
    if (saved[0]?.countryCode) {
      setCountryCode(saved[0].countryCode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('groups', JSON.stringify(groups));
  }, [groups]);

  const saveGroup = () => {
    const list = numbers
      .split(/\r?\n|,/)
      .map(n => n.replace(/\s+/g, '').trim())
      .filter(n => n);
    if (!name || list.length === 0) return;
    const updated = [...groups, { name, list, countryCode }];
    setGroups(updated);
    onGroupsChange?.(updated);
    setName('');
    setNumbers('');
    setCountryCode('44');
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
      <label className="block text-sm mb-1">Default Country Calling Code</label>
      <select
        className="w-full p-2 bg-gray-800 rounded mb-2"
        value={countryCode}
        onChange={e => setCountryCode(e.target.value)}
      >
        {callingCodes.map(({ code, countries }) => (
          <option key={code} value={code}>
            +{code} — {countries.join(', ')}
          </option>
        ))}
      </select>
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
            <span>
              {g.name} ({g.list.length} {g.list.length === 1 ? 'number' : 'numbers'}) — default +
              {g.countryCode || '??'}
            </span>
            <button className="text-red-500" onClick={() => deleteGroup(i)}>Delete</button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-yellow-300 mt-2">
        Heads up: these international calling codes start with 7 and could overlap UK local 07 patterns: {callingCodesStartingWith7.map(c => `+${c.code}`).join(', ')}.
      </p>
    </div>
  );
}
