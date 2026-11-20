import { useMemo, useState } from 'react';
import phoneNumbers from '../lib/phoneNumbers';

const { groupInternationalRecipients } = phoneNumbers;

async function copyNumbers(numbers) {
  if (!Array.isArray(numbers) || !numbers.length || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(numbers.join('\n'));
    return true;
  } catch {
    return false;
  }
}

function warningText(code) {
  const messages = {
    consent_and_opt_out_not_recorded: 'Consent and opt-out evidence is not recorded.',
    some_contacts_have_no_number: 'Some contacts have no phone number.',
    some_contacts_need_identity_or_source_review: 'Some contacts need identity or source review.',
    retention_review_pending: 'A Summons contact-retention review is pending.',
    no_contact_numbers_available: 'No contact numbers are available for this performance.',
    source_unavailable: 'A source is temporarily unavailable.',
    identity_review_required: 'Summons needs a human review of this show identity.',
    expired: 'The Summons contact-retention window has expired.',
    cancelled: 'This performance is cancelled.',
    quarantined: 'This performance is quarantined for review.',
    changed: 'Show details changed during the read.'
  };
  return messages[code] || String(code).replaceAll('_', ' ');
}

export default function InternationalGroups({ snapshot, selectedShow, onUseGroup }) {
  const [copied, setCopied] = useState('');
  const grouped = useMemo(() => groupInternationalRecipients(
    snapshot?.recipients || [],
    snapshot?.missingNumberCount || 0
  ), [snapshot]);

  const handleCopy = async (key, numbers) => {
    setCopied(await copyNumbers(numbers) ? key : 'copy_failed');
    setTimeout(() => setCopied(''), 2000);
  };

  if (!snapshot) return null;
  const statusWarning = snapshot.status !== 'ready';
  const expired = snapshot.status === 'expired';
  const unusable = ['cancelled', 'quarantined', 'expired', 'identity_review_required', 'source_unavailable', 'changed'].includes(snapshot.status);

  return (
    <section className="rounded-lg bg-gray-800 p-4" aria-labelledby="recipient-groups-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="recipient-groups-heading" className="text-xl font-semibold">Recipients</h2>
          <p className="text-sm text-gray-300">{selectedShow?.name || snapshot.show?.name || 'Selected performance'}</p>
          <p className="break-all font-mono text-xs text-gray-400">Show ID: {snapshot.showId}</p>
        </div>
        {snapshot.expiresAtIso ? <p className="text-xs text-gray-400">Contact list expires {new Date(snapshot.expiresAtIso).toLocaleString('en-GB', { timeZone: 'Europe/London' })} London time</p> : null}
      </div>

      {statusWarning ? <p role="status" className="mb-3 rounded bg-amber-950 p-3 text-sm text-amber-200">{(snapshot.warnings?.length ? snapshot.warnings : [snapshot.status]).map(warningText).join(' ')}</p> : null}
      {snapshot.consentStatus !== 'recorded' ? <p className="mb-3 rounded bg-amber-950 p-3 text-sm text-amber-200">Consent and opt-out evidence is not recorded. A number alone does not authorize SMS, WhatsApp, or calls.</p> : null}

      {grouped.missingNumberCount > 0 ? <p className="mb-3 text-sm text-amber-200">Needs a number: {grouped.missingNumberCount} contact{grouped.missingNumberCount === 1 ? '' : 's'}.</p> : null}

      {!unusable && grouped.groups.map(group => {
        const numbers = group.numbers.map(contact => contact.e164);
        const copyKey = `copy:${group.callingCode}`;
        const batches = [];
        for (let start = 0; start < numbers.length; start += 50) batches.push(numbers.slice(start, start + 50));
        return (
          <article key={group.callingCode} className="mb-3 rounded bg-gray-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{group.label} — {group.count} contacts</h3>
                {group.countries.length ? <p className="text-xs text-gray-400">Resolved countries among these numbers: {group.countries.join(', ')}</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded bg-gray-700 px-3 py-1 text-sm disabled:opacity-50" onClick={() => handleCopy(copyKey, numbers)} disabled={!numbers.length}>
                  {copied === copyKey ? 'Copied' : copied === 'copy_failed' ? 'Copy failed' : 'Copy numbers'}
                </button>
                {batches.map((batch, index) => (
                  <button key={`${group.callingCode}:${index}`} type="button" className="rounded bg-blue-700 px-3 py-1 text-sm disabled:opacity-50" onClick={() => onUseGroup?.({
                    id: `automatic:${snapshot.showId}:${group.callingCode}:${index + 1}`,
                    name: `${group.label}${batches.length > 1 ? ` — batch ${index + 1}/${batches.length}` : ''} — ${selectedShow?.name || snapshot.show?.name || 'Show'}`,
                    list: batch,
                    callingCode: group.callingCode,
                    kind: 'automatic',
                    scope: 'show',
                    showId: snapshot.showId,
                    showName: selectedShow?.name || snapshot.show?.name || 'Show',
                    showStartsAt: selectedShow?.startsAt || snapshot.show?.startsAt,
                    showEndsAt: selectedShow?.endsAt || snapshot.show?.endsAt,
                    showLocation: selectedShow?.location || snapshot.show?.location,
                    deliveryType: selectedShow?.deliveryType || snapshot.show?.deliveryType,
                    bookingDistinction: selectedShow?.bookingDistinction,
                    expiresAtIso: snapshot.expiresAtIso,
                    consentStatus: snapshot.consentStatus
                  })} disabled={unusable || !batch.length}>
                    Use {batches.length > 1 ? `batch ${index + 1}/${batches.length}` : 'this group'} ({batch.length})
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-gray-300">
              {group.numbers.map(contact => (
                <li key={contact.e164} className="break-all font-mono">
                  {contact.e164}<span className="ml-2 font-sans text-gray-500">{contact.roles.join(', ')} · {contact.sources.join(', ')}</span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}

      {grouped.needsReview.length ? (
        <section className="rounded border border-amber-700 bg-amber-950 p-3" aria-labelledby="needs-review-heading">
          <h3 id="needs-review-heading" className="font-semibold text-amber-200">Needs review — {grouped.needsReviewCount}</h3>
          <p className="mb-2 text-xs text-amber-200">These values are excluded from sendable groups. Correct the source or create a reviewed custom list.</p>
          <ul className="space-y-1 text-xs text-amber-100">
            {grouped.needsReview.map((item, index) => (
              <li key={`${item.number || item.original}-${index}`} className="break-all">
                <span className="font-mono">{item.number || item.original || 'No number'}</span> — {item.reason.replaceAll('_', ' ')}{item.callingCode ? ` · code ${item.callingCode}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!unusable && !grouped.groups.length && !grouped.needsReview.length && grouped.missingNumberCount === 0 ? (
        <p className="rounded bg-gray-900 p-3 text-sm text-gray-300">No contact numbers are available for this performance.</p>
      ) : null}
      {expired ? <p className="mt-2 text-sm text-red-300">This show's contact-retention window has expired. Numbers are unavailable.</p> : null}
    </section>
  );
}
