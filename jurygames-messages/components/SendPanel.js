import { useEffect, useState } from 'react';

function londonDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time needs review';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SendPanel({ groups, selectedGroupId, onSelectGroup, selectedShow, canSend, onLog }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.templates)) {
      setStatus('Templates are unavailable.');
      return;
    }
    setTemplates(data.templates);
  };

  useEffect(() => { fetchTemplates(); }, []);
  const selectedGroup = groups.find(group => group.id === selectedGroupId) || groups[0] || null;
  const filteredTemplates = templates;

  useEffect(() => {
    if (!pendingData?.group) return;
    const current = groups.find(group => group.id === pendingData.group.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(pendingData.group) ||
        Date.parse(current.expiresAtIso || '') <= Date.now()) {
      setConfirmOpen(false);
      setPendingData(null);
      setConsentAcknowledged(false);
      setStatus('The selected show or recipient list changed or expired. Review a fresh preview before approving.');
    }
  }, [groups, pendingData]);

  const groupPayload = group => ({
    name: group.name,
    list: group.list,
    kind: group.kind || 'custom',
    scope: group.scope || (group.showId ? 'show' : 'standalone'),
    ...(group.showId ? { showId: group.showId } : {}),
    ...(group.scope === 'show' ? {
      showStartsAt: group.showStartsAt,
      showEndsAt: group.showEndsAt,
      showName: group.showName,
      showLocation: group.showLocation || null,
      deliveryType: group.deliveryType,
      bookingDistinction: group.bookingDistinction,
    } : {}),
    ...(group.expiresAtIso ? { expiresAtIso: group.expiresAtIso } : {})
  });

  const closePreview = () => {
    if (sending || approvalBusy) return;
    setConfirmOpen(false);
    setPendingData(null);
    setConsentAcknowledged(false);
  };

  const openPreview = async () => {
    const group = selectedGroup;
    const selectedTemplate = filteredTemplates[selectedTemplateIndex];
    const requestId = globalThis.crypto?.randomUUID?.();
    if (!group || !selectedTemplate || !requestId) {
      setStatus('Select a group and template before reviewing the send.');
      return;
    }

    setPreviewBusy(true);
    setStatus('Loading the server-approved preview...');
    try {
      const res = await fetch('/api/send-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
        body: JSON.stringify({ group: groupPayload(group), templateId: selectedTemplate.id, requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'preview_unavailable');
      setPendingData({ group, show: data.show || null, countryGroups: data.countryGroups || [], exclusions: data.exclusions || null, requestId, template: data.template, previewToken: data.previewToken || null, approvalToken: null, canApprove: Boolean(data.canApprove), warnings: data.warnings || [] });
      setConsentAcknowledged(false);
      setConfirmOpen(true);
      setStatus('Review the exact server-loaded template and recipient list.');
    } catch (error) {
      setStatus(`Preview unavailable (${error.message}). No message was sent.`);
    } finally {
      setPreviewBusy(false);
    }
  };

  const approvePreview = async () => {
    if (approvalBusy || sending || !canSend || !consentAcknowledged || !pendingData?.template) return;
    setApprovalBusy(true);
    setStatus('Recording your approval...');
    try {
      const res = await fetch('/api/send-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
        body: JSON.stringify({
          group: groupPayload(pendingData.group),
          templateId: pendingData.template.id,
          requestId: pendingData.requestId,
          previewToken: pendingData.previewToken,
          consentAcknowledged: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === 'preview_expired_or_mismatched') {
        setConfirmOpen(false);
        setPendingData(null);
        setConsentAcknowledged(false);
        setStatus('The preview changed or expired. Review it again before approving. No message was sent.');
        return;
      }
      if (!res.ok || !data.approvalToken) throw new Error(data.error || 'approval_unavailable');
      setPendingData(current => current ? { ...current, approvalToken: data.approvalToken } : current);
      setStatus('Preview approved. Confirm the send before Twilio is contacted.');
    } catch (error) {
      setStatus(`Approval unavailable (${error.message}). No message was sent.`);
    } finally {
      setApprovalBusy(false);
    }
  };

  const confirmSend = async () => {
    if (sending || !canSend || !consentAcknowledged || !pendingData?.approvalToken) return;
    setSending(true);
    setStatus('Sending...');
    try {
      const { group, template, requestId, approvalToken } = pendingData;
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
        body: JSON.stringify({
          group: groupPayload(group),
          templateId: template.id,
          requestId,
          approvalToken,
          consentAcknowledged,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === 'send_request_already_claimed') {
        setConfirmOpen(false);
        setPendingData(null);
        setConsentAcknowledged(false);
        const previous = data.status === 'processing'
          ? 'is still processing or needs manual review'
          : `was ${data.status || 'already'} recorded (${Number(data.acceptedCount || 0)} accepted, ${Number(data.failedCount || 0)} failed)`;
        setStatus(`This request ${previous}. No duplicate was sent. Twilio acceptance does not confirm delivery.`);
        return;
      }
      if (res.status === 409 && data.error === 'approval_expired_or_mismatched') {
        setPendingData(current => current ? { ...current, approvalToken: null } : current);
        setStatus('The preview expired or changed. Review the preview and approve it again. No message was sent.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'send_not_confirmed');
      const acceptedCount = Number(data.acceptedCount || 0);
      const failedCount = Number(data.failedCount || 0);
      if (failedCount > 0) {
        setStatus(`Partially accepted by Twilio: ${acceptedCount} accepted, ${failedCount} failed.`);
        onLog({ time: new Date(), type: 'Warning', message: `${template.type} "${template.name}" to ${group.name}: ${acceptedCount} accepted, ${failedCount} failed.` });
      } else {
        setStatus(`Accepted by Twilio (${acceptedCount}); delivery is not confirmed here.`);
        onLog({ time: new Date(), type: template.type, template: template.name, groupName: group.name, message: `${template.type} "${template.name}" accepted by Twilio for ${group.name} (${acceptedCount} recipients).` });
      }
      setConfirmOpen(false);
      setPendingData(null);
      setConsentAcknowledged(false);
    } catch (error) {
      setStatus(`Send not confirmed (${error.message}). Retry here to reuse the same approval and request ID.`);
      onLog({ time: new Date(), type: 'Error', message: 'Send outcome is unknown; retries must reuse the same approval and request ID.' });
    } finally {
      setSending(false);
    }
  };

  const uniqueRecipients = pendingData?.group ? [...new Set(pendingData.group.list)] : [];
  const methodLabel = pendingData?.template?.type === 'whatsapp'
    ? 'WhatsApp'
    : pendingData?.template?.type === 'call' ? 'Voice call' : 'SMS';

  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2">Send Message or Call</h2>

      <label className="block text-sm mb-1" htmlFor="send-group">Recipient group</label>
      <select id="send-group" className="w-full mb-2 p-2 bg-gray-800 rounded" value={selectedGroup?.id || ''} onChange={event => onSelectGroup?.(event.target.value)} disabled={!groups.length}>
        {!groups.length ? <option value="">Choose a show or create a custom list</option> : null}
        {groups.map(group => <option key={group.id} value={group.id}>{group.name} ({group.list.length} {group.list.length === 1 ? 'number' : 'numbers'})</option>)}
      </select>

      <label className="block text-sm mb-1" htmlFor="send-template">Approved message/call template</label>
      <select id="send-template" className="w-full mb-2 p-2 bg-gray-800 rounded" value={selectedTemplateIndex} onChange={event => setSelectedTemplateIndex(Number(event.target.value))} disabled={!filteredTemplates.length}>
        {filteredTemplates.map((template, index) => <option key={template.id || index} value={index}>{template.name} · {template.type} · content category: {template.show}</option>)}
      </select>

      <button className="bg-green-500 px-4 py-2 rounded disabled:opacity-50" onClick={openPreview} disabled={previewBusy || !selectedGroup || !filteredTemplates.length}>
        {previewBusy ? 'Loading preview...' : 'Review Send'}
      </button>
      <p className="mt-2 text-gray-300" role="status">{status}</p>

      {confirmOpen && pendingData?.group && pendingData?.template ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
            <h3 className="mb-4 text-lg font-bold">Review Message Preview</h3>
            <p className="mb-2">Template content category: <strong>{pendingData.template.showCategory}</strong> <span className="text-xs text-gray-500">(not a show ID)</span></p>
            <p className="mb-2">Method: <strong>{methodLabel}</strong></p>
            <p className="mb-2">Template: <strong>{pendingData.template.name}</strong></p>
            <p className="mb-2">Sender: <strong>{pendingData.template.from}</strong></p>
            {pendingData.group.showId ? (
              <>
            <p className="mb-2">Exact show: <strong>{pendingData.show?.name || pendingData.group.showName || selectedShow?.name || 'Selected performance'}</strong></p>
                <p className="mb-2">Performance: <strong>{londonDateTime(pendingData.show?.startsAt || pendingData.group.showStartsAt || selectedShow?.startsAt)}</strong> · {pendingData.show?.deliveryType || pendingData.group.deliveryType || selectedShow?.deliveryType || 'type needs review'} · {pendingData.show?.bookingDistinction || pendingData.group.bookingDistinction || selectedShow?.bookingDistinction || 'booking type needs review'}{(pendingData.show?.location || pendingData.group.showLocation || selectedShow?.location) ? ` · ${pendingData.show?.location || pendingData.group.showLocation || selectedShow?.location}` : ''}</p>
                <p className="mb-2 break-all font-mono text-xs">Show ID: {pendingData.group.showId}</p>
              </>
            ) : <p className="mb-2">Standalone list; expiry: <strong>{new Date(pendingData.group.expiresAtIso).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</strong> London time</p>}
            <p className="mb-2">Recipient group: <strong>{pendingData.group.name}</strong> · {uniqueRecipients.length} unique recipients</p>
            <p className="mb-2 text-xs text-gray-400">Country groups: {(pendingData.countryGroups || []).map(item => `${item.label}: ${item.count}`).join(' · ') || 'needs review'}</p>
            {pendingData.exclusions?.source === 'summons' ? (
              <p className="mb-2 text-xs text-gray-400">Excluded from the automatic list: {pendingData.exclusions.missingNumberCount} missing number{pendingData.exclusions.missingNumberCount === 1 ? '' : 's'} · {pendingData.exclusions.needsReviewCount} needing review.</p>
            ) : <p className="mb-2 text-xs text-gray-400">Manual list: numbers were checked for format and duplicates; verify the list is complete and each recipient is eligible.</p>}
            <p className="mb-2 text-xs text-gray-400">{pendingData.group.kind === 'automatic' ? 'Summons contact list' : 'Manual custom list'} · expires {pendingData.group.expiresAtIso ? new Date(pendingData.group.expiresAtIso).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : 'not recorded'} London time</p>
            <p className="mb-2 text-xs text-gray-400">Estimated cost: unavailable for this preview.</p>
            {pendingData.template.type === 'call' ? (
              <div className="mb-3">
                <p className="mb-1 text-sm font-semibold">Approved call audio</p>
                <audio controls preload="none" className="w-full" src={pendingData.template.mediaUrl}>Audio preview unavailable.</audio>
              </div>
            ) : (
              <>
                <p className="mb-1 text-sm font-semibold">Exact message content</p>
                <pre className="mb-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-sm text-white">{pendingData.template.content}</pre>
              </>
            )}
            {pendingData.template.summary ? <p className="mb-3 text-sm">{pendingData.template.summary}</p> : null}
            <details className="mb-3 rounded bg-gray-100 p-2 text-xs dark:bg-gray-900">
              <summary>Review recipient numbers ({uniqueRecipients.length})</summary>
              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap">{uniqueRecipients.join('\n')}</pre>
            </details>
            <ul className="mb-3 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
              {(pendingData.warnings || []).map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
            <label className="mb-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consentAcknowledged}
                disabled={!canSend || !pendingData.canApprove || sending || approvalBusy}
                onChange={event => {
                  setConsentAcknowledged(event.target.checked);
                  if (!event.target.checked) setPendingData(current => current ? { ...current, approvalToken: null } : current);
                }}
                className="mt-1"
              />
              <span>I confirmed the selected performance, recipient list, message, and any applicable opt-outs.</span>
            </label>
            <p className="mb-4 text-xs text-gray-500">Approval expires after two minutes and binds this exact list and template. Twilio acceptance does not confirm delivery.</p>
            {!canSend || !pendingData.canApprove ? <p className="mb-4 text-sm text-amber-600">Sending is disabled until the messaging safety checks are configured.</p> : null}
            {pendingData.approvalToken ? <p className="mb-3 text-sm text-green-700">Preview approved; confirm to send.</p> : null}
            {status ? <p role="status" className="mb-3 text-sm">{status}</p> : null}
            <div className="flex justify-end space-x-2">
              <button className="rounded bg-gray-300 px-4 py-2 dark:bg-gray-700" onClick={closePreview} disabled={sending || approvalBusy}>Cancel</button>
              {!pendingData.approvalToken ? (
                <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={approvePreview} disabled={approvalBusy || sending || !canSend || !pendingData.canApprove || !consentAcknowledged}>
                  {approvalBusy ? 'Approving...' : 'Approve Preview'}
                </button>
              ) : (
                <button className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50" onClick={confirmSend} disabled={sending || approvalBusy || !canSend || !consentAcknowledged}>
                  {sending ? 'Sending...' : 'Confirm and Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
