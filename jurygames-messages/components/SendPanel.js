import { useEffect, useRef, useState } from 'react';

function londonDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time needs review';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SendPanel({ groups, selectedGroupId, onSelectGroup, selectedShow, canSend, onLog }) {
  const [templates, setTemplates] = useState([]);
  const [filterShow, setFilterShow] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const sendLock = useRef(false);
  const [status, setStatus] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState(null);
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
  const showCategories = [...new Set(templates.map(template => template.show).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filteredTemplates = templates.filter(template => template.show === filterShow && filterShow);
  const selectedTemplate = filteredTemplates.find(template => template.id === selectedTemplateId) || filteredTemplates[0] || null;

  useEffect(() => {
    if (!pendingData?.group || sendLock.current || pendingData.approvalToken) return;
    const current = groups.find(group => group.id === pendingData.group.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(pendingData.group) ||
        Date.parse(current.expiresAtIso || '') <= Date.now()) {
      setConfirmOpen(false);
      setPendingData(null);
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
    if (sendLock.current || sending || approvalBusy) return;
    setConfirmOpen(false);
    setPendingData(null);
  };

  const openPreview = async () => {
    const group = selectedGroup;
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
      setConfirmOpen(true);
      setStatus('');
    } catch (error) {
      setStatus(`Preview unavailable (${error.message}). No message was sent.`);
    } finally {
      setPreviewBusy(false);
    }
  };

  // One explicit operator confirmation; retain both server checks and the original
  // request ID. An ambiguous dispatch may only be retried with that same ID.
  const approveAndSend = async () => {
    if (sendLock.current || approvalBusy || sending || !canSend || !pendingData?.canApprove || !pendingData.template || pendingData.retryBlocked) return;
    sendLock.current = true;
    const { group, template, requestId, previewToken } = pendingData;
    let approvalToken = pendingData.approvalToken;
    const wasRetry = Boolean(approvalToken);
    let dispatchStarted = false;
    try {
      if (!approvalToken) {
        setApprovalBusy(true);
        setStatus('Checking approval...');
        const approvalResponse = await fetch('/api/send-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
          body: JSON.stringify({
            group: groupPayload(group), templateId: template.id, requestId,
            previewToken, consentAcknowledged: true,
          }),
        });
        const approval = await approvalResponse.json().catch(() => ({}));
        if (approvalResponse.status === 409 && approval.error === 'preview_expired_or_mismatched') {
          setConfirmOpen(false);
          setPendingData(null);
          setStatus('The preview changed or expired. Review a fresh preview. No message was sent.');
          return;
        }
        if (!approvalResponse.ok || !approval.approvalToken) throw new Error(approval.error || 'approval_unavailable');
        approvalToken = approval.approvalToken;
        setPendingData(current => current ? { ...current, approvalToken } : current);
      }
      setApprovalBusy(false);
      setSending(true);
      setStatus('Sending...');
      dispatchStarted = true;
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
        body: JSON.stringify({
          group: groupPayload(group),
          templateId: template.id,
          requestId,
          approvalToken,
          consentAcknowledged: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === 'send_request_already_claimed') {
        setConfirmOpen(false);
        setPendingData(null);
          const previous = data.status === 'processing'
          ? 'is still processing or needs manual review'
          : `was ${data.status || 'already'} recorded (${Number(data.acceptedCount || 0)} accepted, ${Number(data.failedCount || 0)} failed)`;
        setStatus(`This request ${previous}. No duplicate was sent. Twilio acceptance does not confirm delivery.`);
        return;
      }
      if (res.status === 409 && data.error === 'approval_expired_or_mismatched') {
        if (wasRetry) {
          setPendingData(current => current ? { ...current, retryBlocked: true } : current);
          setStatus('The previous send outcome is unknown and its approval expired or changed. Check the send outcome before starting another request.');
        } else {
          setConfirmOpen(false);
          setPendingData(null);
          setStatus('The approval expired or changed. Review a fresh preview. No message was sent.');
        }
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
    } catch (error) {
      if (dispatchStarted) {
        setStatus(`Send not confirmed (${error.message}). Retry this same request; do not start a new send until the outcome is known.`);
        onLog({ time: new Date(), type: 'Error', message: 'Send outcome is unknown; retries must reuse the same approval and request ID.' });
      } else {
        setStatus(`Approval unavailable (${error.message}). No message was sent.`);
      }
    } finally {
      sendLock.current = false;
      setApprovalBusy(false);
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
      <select id="send-group" className="w-full mb-2 p-2 bg-gray-800 rounded" value={selectedGroup?.id || ''} onChange={event => onSelectGroup?.(event.target.value)} disabled={!groups.length || previewBusy || confirmOpen}>
        {!groups.length ? <option value="">Choose a show or create a custom list</option> : null}
        {groups.map(group => <option key={group.id} value={group.id}>{group.name} ({group.list.length} {group.list.length === 1 ? 'number' : 'numbers'})</option>)}
      </select>

      <label className="block text-sm mb-1" htmlFor="send-show-category">Select show</label>
      <select id="send-show-category" className="w-full mb-2 p-2 bg-gray-800 rounded" value={filterShow} onChange={event => { setFilterShow(event.target.value); setSelectedTemplateId(''); }} disabled={!showCategories.length || previewBusy || confirmOpen}>
        <option value="">-- Select a show --</option>
        {showCategories.map(show => <option key={show} value={show}>{show}</option>)}
      </select>

      <label className="block text-sm mb-1" htmlFor="send-template">Message/call template</label>
      <select id="send-template" className="w-full mb-2 p-2 bg-gray-800 rounded" value={selectedTemplate?.id || ''} onChange={event => setSelectedTemplateId(event.target.value)} disabled={!filteredTemplates.length || previewBusy || confirmOpen}>
        {!filteredTemplates.length ? <option value="">Choose a show first</option> : null}
        {filteredTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · {template.type === 'call' ? 'Call' : template.type === 'whatsapp' ? 'WhatsApp' : 'SMS'}</option>)}
      </select>

      <button className="bg-green-500 px-4 py-2 rounded disabled:opacity-50" onClick={openPreview} disabled={previewBusy || confirmOpen || !selectedGroup || !selectedTemplate}>
        {previewBusy ? 'Loading preview...' : 'Review Send'}
      </button>
      <p className="mt-2 text-gray-300" role="status">{status}</p>

      {confirmOpen && pendingData?.group && pendingData?.template ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div role="dialog" aria-modal="true" aria-labelledby="send-preview-heading" className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
            <h3 id="send-preview-heading" className="mb-3 text-lg font-bold">Review {methodLabel === 'Voice call' ? 'call' : 'message'}</h3>
            <p className="mb-2"><strong>{pendingData.template.name}</strong> · {methodLabel} · {pendingData.template.showCategory}</p>
            <p className="mb-2"><strong>{pendingData.group.name}</strong> · {uniqueRecipients.length} {uniqueRecipients.length === 1 ? 'recipient' : 'recipients'}</p>
            {pendingData.group.showId ? <p className="mb-3 text-xs text-gray-400">{pendingData.show?.name || pendingData.group.showName || 'Selected performance'} · {londonDateTime(pendingData.show?.startsAt || pendingData.group.showStartsAt)}</p> : <p className="mb-3 text-xs text-gray-400">Standalone recipient list</p>}
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
            {!pendingData.approvalToken ? <p className="mb-3 text-xs text-gray-400">Confirming sends to this group. Check any applicable opt-outs first.</p> : null}
            {(pendingData.warnings || []).filter(warning => warning !== 'Verify that this group matches the selected Summons performance and its current retention deadline.').map((warning, index) => <p key={index} className="mb-2 text-sm text-amber-600 dark:text-amber-300">{warning}</p>)}
            {!canSend || !pendingData.canApprove ? <p className="mb-3 text-sm text-amber-600">Sending is unavailable.</p> : null}
            {status ? <p role="status" className="mb-3 text-sm">{status}</p> : null}
            <div className="flex justify-end space-x-2">
              <button className="rounded bg-gray-300 px-4 py-2 dark:bg-gray-700" onClick={closePreview} disabled={sending || approvalBusy}>{pendingData.approvalToken ? 'Close' : 'Cancel'}</button>
              <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={approveAndSend} disabled={approvalBusy || sending || !canSend || !pendingData.canApprove || pendingData.retryBlocked}>
                {approvalBusy || sending ? 'Sending...' : pendingData.approvalToken ? 'Retry same request' : pendingData.template.type === 'call' ? 'Confirm & Call' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
