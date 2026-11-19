import { useEffect, useMemo, useState } from 'react';
import { createCustomList, STANDALONE_EXPIRY_HOURS } from '../lib/customLists';

export default function CustomListManager({ shows = [], selectedShowId = '', groups = [], onGroupsChange }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [numbers, setNumbers] = useState('');
  const [showId, setShowId] = useState(selectedShowId);
  const [expiryHours, setExpiryHours] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState([]);
  const eligibleShows = useMemo(() => shows.filter(show => show.status === 'ready'), [shows]);

  useEffect(() => {
    if (selectedShowId && eligibleShows.some(show => show.showId === selectedShowId)) setShowId(selectedShowId);
  }, [selectedShowId, eligibleShows]);

  const publish = next => onGroupsChange?.(next);
  const saveGroup = () => {
    setError('');
    const selected = showId ? eligibleShows.find(show => show.showId === showId) : null;
    if (showId && !selected) {
      setError('That performance is cancelled, quarantined, expired, or unavailable. Select a current show or choose a short standalone expiry.');
      return;
    }
    const created = createCustomList({ name, numbers, show: selected, expiryHours });
    if (!created.ok) {
      setReview(created.needsReview || []);
      const messages = {
        group_name_invalid: 'Enter a group name of 1-80 characters.',
        number_input_invalid: 'The pasted list is too large or malformed.',
        number_list_required: 'Paste one or more international numbers.',
        number_input_too_large: 'Reduce the pasted list to at most 200 entries.',
        numbers_need_review: 'Correct or review these values before adding the custom list. No list was saved.',
        recipient_limit_exceeded: 'A group can contain up to 50 unique numbers.',
        show_not_sendable: 'Summons marks this show as unavailable for messaging.',
        show_contact_window_expired: 'Summons reports that this show contact window has expired.',
        standalone_expiry_required: 'Choose an explicit standalone expiry of up to 24 hours.'
      };
      setError(messages[created.error] || 'The custom list could not be created.');
      return;
    }
    setReview([]);
    publish([...groups, {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      ...created.group
    }]);
    setName('');
    setNumbers('');
    setExpiryHours('');
  };

  const deleteGroup = id => publish(groups.filter(group => group.id !== id));

  return (
    <section className="rounded-lg bg-gray-800 p-4" aria-labelledby="custom-list-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="custom-list-heading" className="text-xl font-semibold">Manual custom lists</h2>
          <p className="text-sm text-gray-300">Show-scoped lists expire with the Summons show window. Standalone lists require an expiry of 24 hours or less. Lists stay in memory only.</p>
        </div>
        <button type="button" className="rounded bg-blue-700 px-3 py-2 text-sm" onClick={() => setOpen(value => !value)}>
          {open ? 'Close form' : 'Create custom list'}
        </button>
      </div>

      {open ? (
        <div className="mt-4 rounded bg-gray-900 p-3">
          <label className="mb-1 block text-sm" htmlFor="custom-list-name">Group name</label>
          <input id="custom-list-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} className="mb-3 w-full rounded bg-gray-700 p-2" />

          <label className="mb-1 block text-sm" htmlFor="custom-list-show">Intended show</label>
          <select id="custom-list-show" value={showId} onChange={event => setShowId(event.target.value)} className="mb-3 w-full rounded bg-gray-700 p-2">
            <option value="">Standalone — no show association</option>
            {eligibleShows.map(show => <option key={show.showId} value={show.showId}>{show.name} · {new Date(show.startsAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} · {show.bookingDistinction}</option>)}
          </select>

          {!showId ? (
            <>
              <label className="mb-1 block text-sm" htmlFor="custom-list-expiry">Standalone expiry</label>
              <select id="custom-list-expiry" value={expiryHours} onChange={event => setExpiryHours(event.target.value)} className="mb-3 w-full rounded bg-gray-700 p-2">
                <option value="">Choose expiry…</option>
                {STANDALONE_EXPIRY_HOURS.map(hours => <option key={hours} value={hours}>{hours} hour{hours === 1 ? '' : 's'}</option>)}
              </select>
            </>
          ) : null}

          <label className="mb-1 block text-sm" htmlFor="custom-list-numbers">Paste numbers</label>
          <textarea id="custom-list-numbers" rows={4} value={numbers} onChange={event => setNumbers(event.target.value)} className="mb-2 w-full rounded bg-gray-700 p-2 font-mono text-sm" placeholder="One number per line or comma-separated; include + and country code" />
          {review.length ? <ul className="mb-2 list-disc pl-5 text-xs text-amber-200">{review.map((item, index) => <li key={`${item.original}-${index}`}><span className="font-mono">{item.original}</span> — {item.reason.replaceAll('_', ' ')}</li>)}</ul> : null}
          {error ? <p role="alert" className="mb-2 text-sm text-amber-200">{error}</p> : null}
          <button type="button" className="rounded bg-green-700 px-4 py-2 disabled:opacity-50" onClick={saveGroup}>Add list</button>
        </div>
      ) : null}

      {groups.length ? (
        <ul className="mt-4 space-y-2">
          {groups.map(group => (
            <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-900 p-3">
              <div>
                <p className="font-medium">{group.name} · {group.list.length} unique numbers</p>
                <p className="text-xs text-gray-400">{group.scope === 'show' ? `${group.showName} · show-scoped` : 'Standalone'} · expires {new Date(group.expiresAtIso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} London time</p>
                {group.showStatus && group.showStatus !== 'ready' ? <p className="text-xs text-amber-200">The Summons performance is {group.showStatus.replaceAll('_', ' ')}; this group cannot be selected to send.</p> : null}
                <p className="text-xs text-gray-500">{group.countryGroups.map(item => `${item.label}: ${item.count}`).join(' · ')}</p>
              </div>
              <button type="button" className="rounded bg-red-800 px-3 py-1 text-sm" onClick={() => deleteGroup(group.id)}>Delete</button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-gray-400">No manual groups. Create one to preserve the copy-and-paste workflow.</p>}
    </section>
  );
}
