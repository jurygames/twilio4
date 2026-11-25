import { useState } from 'react';

function londonDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time needs review';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short'
  }).format(date);
}

export default function ShowTabs({ shows, selectedShowId, onSelect, onRefresh, loading, error, status }) {
  const [copied, setCopied] = useState(false);
  const selected = shows.find(show => show.showId === selectedShowId) || null;

  const copyId = async () => {
    if (!selected?.showId || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(selected.showId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-lg bg-gray-800 p-4" aria-labelledby="show-tabs-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="show-tabs-heading" className="text-xl font-semibold">Choose a performance</h2>
          <p className="text-sm text-gray-300">Live Summons Calendar · all times shown in London time</p>
        </div>
        <button type="button" className="rounded bg-gray-700 px-3 py-2 text-sm disabled:opacity-50" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh shows'}
        </button>
      </div>

      {loading && !shows.length ? <p role="status" className="rounded bg-gray-900 p-3 text-sm text-gray-300">Loading performances…</p> : null}
      {error ? <p role="alert" className="rounded bg-amber-950 p-3 text-sm text-amber-200">{error}</p> : null}
      {!loading && !error && status === 'empty' ? <p className="rounded bg-gray-900 p-3 text-sm text-gray-300">No upcoming or recently completed performances are available.</p> : null}

      {shows.length ? (
        <div role="tablist" aria-label="Upcoming performances" className="flex gap-2 overflow-x-auto border-b border-gray-700 pb-2">
          {shows.map(show => (
            <button
              key={show.showId}
              type="button"
              role="tab"
              aria-selected={show.showId === selectedShowId}
              onClick={() => onSelect(show.showId)}
              className={`min-w-52 rounded-t px-3 py-2 text-left ${show.showId === selectedShowId ? 'bg-blue-800' : 'bg-gray-900 hover:bg-gray-700'}`}
            >
              {show.teamGroup ? <span className="mb-1 inline-flex rounded-lg bg-blue-500 px-3 py-1 text-lg font-bold text-white">Group {show.teamGroup}</span> : null}
              <span className="block font-medium">{show.name || 'Untitled performance'}</span>
              <span className="block text-xs text-gray-300">{londonDateTime(show.startsAt)}</span>
              <span className="block text-xs text-gray-400">{show.bookingDistinction}</span>
              {show.status !== 'ready' ? <span className="mt-1 block text-xs font-semibold text-amber-300">{show.status.replaceAll('_', ' ')}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div role="tabpanel" className="mt-3 rounded bg-gray-900 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{selected.name || 'Untitled performance'}</p>
              <p>{londonDateTime(selected.startsAt)} – {londonDateTime(selected.endsAt)}</p>
              <p className="text-gray-300">{selected.deliveryType.replaceAll('_', ' ')} · {selected.bookingDistinction}{selected.location ? ` · ${selected.location}` : ''}</p>
            </div>
            <button type="button" className="rounded bg-gray-700 px-3 py-1 text-xs" onClick={copyId}>{copied ? 'ID copied' : 'Copy show ID'}</button>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-gray-500">{selected.showId}</p>
          {selected.status !== 'ready' ? <p className="mt-2 text-amber-200">This performance is {selected.status.replaceAll('_', ' ')}. Recipient numbers are unavailable.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
