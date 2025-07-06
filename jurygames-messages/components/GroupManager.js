
import { useState } from 'react';
export default function GroupManager({ onGroupsChange }) {
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const saveGroup = () => {
    const list = numbers.split(/\s|,/).filter(n => n);
    const newGroup = { name, list };
    const updated = [...groups, newGroup];
    setGroups(updated);
    onGroupsChange && onGroupsChange(updated);
    setName(''); setNumbers('');
  };
  const deleteGroup = idx => {
    const updated = groups.filter((_, i) => i!==idx);
    setGroups(updated);
    onGroupsChange && onGroupsChange(updated);
  };
  const purgeAll = () => {
    if (confirm('Permanently delete ALL groups?')) {
      setGroups([]); onGroupsChange && onGroupsChange([]);
    }
  };
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">Groups</h2>
      <textarea
        className="w-full p-2 bg-gray-800 rounded mb-2"
        rows="3"
        placeholder="Paste numbers"
        value={numbers}
        onChange={e => setNumbers(e.target.value)}
      />
      <input
        className="w-full p-2 bg-gray-800 rounded mb-2"
        placeholder="Group Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button className="bg-blue-500 px-4 py-2 rounded" onClick={saveGroup}>Save Group</button>
      <button className="ml-2 bg-red-600 px-4 py-2 rounded" onClick={purgeAll}>Purge All</button>
      <ul className="mt-2">
        {groups.map((g,i) => (
          <li key={i} className="flex justify-between">
            <span>{g.name} ({g.list.length})</span>
            <button className="text-red-500" onClick={() => deleteGroup(i)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
