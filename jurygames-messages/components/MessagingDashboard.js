import sessionRenewal from '../lib/sessionRenewal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CustomListManager from './CustomListManager';
import InternationalGroups from './InternationalGroups';
import SendPanel from './SendPanel';
import ShowTabs from './ShowTabs';
import StatusPanel from './StatusPanel';
import phoneNumbers from '../lib/phoneNumbers';

const { groupInternationalRecipients } = phoneNumbers;

function explainApiError(code) {
  if (code === 'authentication_required') return 'Your session expired. Sign in again.';
  if (code === 'messaging_role_required') return 'This account no longer has messaging access.';
  if (code === 'show_source_unavailable' || code === 'contact_source_unavailable') return 'Summons is temporarily unavailable. Existing in-memory numbers are retained only until their recorded expiry; sending is blocked.';
  if (code === 'show_changed_during_read') return 'Show details changed while loading. Refresh the show list and select the performance again.';
  if (code === 'show_id_required') return 'Select a performance before loading contacts.';
  return 'The messaging source could not be verified.';
}

export default function MessagingDashboard({ canSend }) {
  const [shows, setShows] = useState([]);
  const [showStatus, setShowStatus] = useState('loading');
  const [selectedShowId, setSelectedShowId] = useState('');
  const [showLoading, setShowLoading] = useState(false);
  const [showError, setShowError] = useState('');
  const [recipientSnapshot, setRecipientSnapshot] = useState(null);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientError, setRecipientError] = useState('');
  const [manualGroups, setManualGroups] = useState([]);
  const [selectedSendGroupId, setSelectedSendGroupId] = useState('');
  const [logs, setLogs] = useState([]);
  const selectedShowIdRef = useRef('');
  const refreshingRef = useRef(false);
  const recipientRequestRef = useRef(0);

  useEffect(() => { selectedShowIdRef.current = selectedShowId; }, [selectedShowId]);

  const clearPrivateState = useCallback(() => {
    recipientRequestRef.current += 1;
    selectedShowIdRef.current = '';
    setShows([]);
    setShowStatus('loading');
    setSelectedShowId('');
    setRecipientSnapshot(null);
    setRecipientLoading(false);
    setRecipientError('');
    setManualGroups([]);
    setSelectedSendGroupId('');
  }, []);

  const loadRecipients = useCallback(async (showId, { clearBefore = true } = {}) => {
    if (!showId) return;
    const requestId = ++recipientRequestRef.current;
    if (clearBefore) setRecipientSnapshot(null);
    setRecipientLoading(true);
    setRecipientError('');
    try {
      const response = await sessionRenewal.messagingFetch(`/api/twilio/messaging/recipients?show_id=${encodeURIComponent(showId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== recipientRequestRef.current || selectedShowIdRef.current !== showId) return;
      if (!response.ok) {
        const code = typeof payload.error === 'string' ? payload.error : 'source_error';
        if (response.status === 401 || response.status === 403) {
          clearPrivateState();
          return;
        }
        if (response.status === 409 || ['show_changed_during_read', 'contact_source_unavailable', 'show_source_unavailable'].includes(code)) {
          setRecipientError(explainApiError(code));
          return;
        }
        setRecipientError(explainApiError(code));
        return;
      }
      if (payload.showId !== showId || !Array.isArray(payload.recipients)) {
        setRecipientError('Summons returned an unverified show response. No numbers were added.');
        return;
      }
      setRecipientSnapshot(payload);
    } catch {
      if (requestId !== recipientRequestRef.current || selectedShowIdRef.current !== showId) return;
      setRecipientError(explainApiError('contact_source_unavailable'));
    } finally {
      if (requestId === recipientRequestRef.current) setRecipientLoading(false);
    }
  }, [clearPrivateState]);

  const refreshShows = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setShowLoading(true);
    setShowError('');
    try {
      const response = await sessionRenewal.messagingFetch('/api/twilio/messaging/shows', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearPrivateState();
          setShowError(explainApiError(payload.error));
          return;
        }
        setShowError(explainApiError(payload.error));
        return;
      }
      if (!Array.isArray(payload.shows) || !['ready', 'empty'].includes(payload.status)) {
        setShowError('Summons returned an invalid show list. Existing in-memory data has not been deleted.');
        return;
      }
      const nextShows = payload.shows;
      const oldSelectedId = selectedShowIdRef.current;
      const stillListed = nextShows.some(show => show.showId === oldSelectedId);
      const nextSelectedId = stillListed
        ? oldSelectedId
        : (nextShows.find(show => show.status === 'ready')?.showId || nextShows[0]?.showId || '');
      setShows(nextShows);
      setShowStatus(payload.status);
      setManualGroups(previous => previous.map(group => {
        if (group.scope !== 'show') return group;
        const currentShow = nextShows.find(show => show.showId === group.showId);
        if (!currentShow) return { ...group, showStatus: 'unavailable' };
        return { ...group, expiresAtIso: currentShow.contactsExpireAt, showStatus: currentShow.status };
      }));
      if (nextSelectedId !== oldSelectedId) {
        recipientRequestRef.current += 1;
        selectedShowIdRef.current = nextSelectedId;
        setRecipientSnapshot(null);
        setRecipientError('');
        setSelectedShowId(nextSelectedId);
      } else if (nextSelectedId) {
        await loadRecipients(nextSelectedId, { clearBefore: false });
      } else {
        recipientRequestRef.current += 1;
        selectedShowIdRef.current = '';
        setRecipientSnapshot(null);
        setRecipientError('');
      }
    } catch {
      // Keep an already-loaded list if an upstream request fails. The server
      // expiry remains authoritative and the error blocks new sends.
      setShowError(explainApiError('show_source_unavailable'));
      setRecipientError(explainApiError('contact_source_unavailable'));
    } finally {
      setShowLoading(false);
      refreshingRef.current = false;
    }
  }, [clearPrivateState, loadRecipients]);

  useEffect(() => {
    void refreshShows();
    const timer = setInterval(() => { void refreshShows(); }, 5 * 60 * 1000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshShows(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshShows]);

  useEffect(() => {
    if (selectedShowId) void loadRecipients(selectedShowId);
    else setRecipientSnapshot(null);
  }, [selectedShowId, loadRecipients]);

  useEffect(() => {
    const purgeExpired = () => {
      const now = Date.now();
      setManualGroups(previous => previous.filter(group => Date.parse(group.expiresAtIso) > now));
      setRecipientSnapshot(previous => {
        if (!previous?.expiresAtIso || Date.parse(previous.expiresAtIso) > now) return previous;
        return { ...previous, status: 'expired', recipients: [], emails: [] };
      });
    };
    const timer = setInterval(purgeExpired, 30 * 1000);
    document.addEventListener('visibilitychange', purgeExpired);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', purgeExpired);
    };
  }, []);

  const selectedShow = useMemo(() => shows.find(show => show.showId === selectedShowId) || null, [shows, selectedShowId]);
  const automaticGroups = useMemo(() => {
    if (!recipientSnapshot || recipientSnapshot.showId !== selectedShowId || recipientError ||
        !['ready', 'incomplete'].includes(recipientSnapshot.status) ||
        !recipientSnapshot.expiresAtIso || Date.parse(recipientSnapshot.expiresAtIso) <= Date.now()) return [];
    const normalized = groupInternationalRecipients(recipientSnapshot.recipients, recipientSnapshot.missingNumberCount);
    return normalized.groups.flatMap(group => {
      const numbers = group.numbers.map(contact => contact.e164);
      const batches = [];
      for (let start = 0; start < numbers.length; start += 50) batches.push(numbers.slice(start, start + 50));
      return batches.map((list, index) => {
        const batchSuffix = batches.length > 1 ? ` · batch ${index + 1}/${batches.length}` : '';
        return {
          id: `automatic:${recipientSnapshot.showId}:${group.callingCode}:${index + 1}`,
          name: `${group.label}${batchSuffix}`,
          list,
          kind: 'automatic',
          scope: 'show',
          showId: recipientSnapshot.showId,
          showName: selectedShow?.name || recipientSnapshot.show?.name || 'Performance',
          showStartsAt: selectedShow?.startsAt || recipientSnapshot.show?.startsAt,
          showEndsAt: selectedShow?.endsAt || recipientSnapshot.show?.endsAt,
          showLocation: selectedShow?.location || recipientSnapshot.show?.location,
          deliveryType: selectedShow?.deliveryType || recipientSnapshot.show?.deliveryType,
          bookingDistinction: selectedShow?.bookingDistinction,
          expiresAtIso: recipientSnapshot.expiresAtIso,
          showStatus: recipientSnapshot.status,
          consentStatus: recipientSnapshot.consentStatus
        };
      });
    });
  }, [recipientSnapshot, selectedShowId, selectedShow, recipientError]);

  const visibleManualGroups = useMemo(() => manualGroups.filter(group =>
    group.scope === 'standalone' || group.showId === selectedShowId
  ), [manualGroups, selectedShowId]);

  const sendGroups = useMemo(() => [
    ...automaticGroups,
    ...visibleManualGroups.filter(group =>
      !['cancelled', 'quarantined', 'unavailable', 'invalid'].includes(group.showStatus) &&
      !(group.scope === 'show' && /:group:[1-9][0-9]{0,2}$/.test(group.showId || '')) &&
      Date.parse(group.expiresAtIso) > Date.now() &&
      (group.scope !== 'show' || (
        !showError && shows.some(show => show.showId === group.showId && show.status === 'ready' &&
          show.contactsExpireAt === group.expiresAtIso)
      ))
    )
  ], [automaticGroups, visibleManualGroups, showError, shows]);

  useEffect(() => {
    if (!sendGroups.some(group => group.id === selectedSendGroupId)) {
      setSelectedSendGroupId(sendGroups[0]?.id || '');
    }
  }, [sendGroups, selectedSendGroupId]);

  const selectShow = showId => {
    recipientRequestRef.current += 1;
    selectedShowIdRef.current = showId;
    setRecipientSnapshot(null);
    setRecipientError('');
    setSelectedShowId(showId);
  };

  return (
    <div className="space-y-4">
      <ShowTabs
        shows={shows}
        selectedShowId={selectedShowId}
        onSelect={selectShow}
        onRefresh={refreshShows}
        loading={showLoading}
        error={showError}
        status={showStatus}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {selectedShowId ? (
            <section className="rounded-lg bg-gray-800 p-4">
              {recipientLoading && !recipientSnapshot ? <p role="status" className="text-sm text-gray-300">Loading contacts from Summons…</p> : null}
              {recipientError ? <p role="alert" className="mb-3 rounded bg-amber-950 p-3 text-sm text-amber-200">{recipientError}</p> : null}
              {recipientSnapshot && !recipientError ? <InternationalGroups key={selectedShowId} snapshot={recipientSnapshot} selectedShow={selectedShow} onUseGroup={group => setSelectedSendGroupId(group.id)} /> : null}
              {!recipientLoading && !recipientSnapshot && !recipientError ? <p className="text-sm text-gray-300">Select a performance to load its retained contact list.</p> : null}
            </section>
          ) : (
            <section className="rounded-lg bg-gray-800 p-4"><p className="text-sm text-gray-300">Select a show to view its recipient groups.</p></section>
          )}
          <CustomListManager shows={shows} selectedShowId={selectedShowId} groups={manualGroups} onGroupsChange={setManualGroups} />
        </div>

        <div className="space-y-4">
          <SendPanel groups={sendGroups} selectedGroupId={selectedSendGroupId} onSelectGroup={setSelectedSendGroupId} selectedShow={selectedShow} canSend={canSend} onLog={entry => setLogs(previous => [entry, ...previous])} />
          <StatusPanel logs={logs} />
        </div>
      </div>
    </div>
  );
}
