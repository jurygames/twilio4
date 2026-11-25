// Shared pure selection and single-confirmation transport, independently testable
// without rendering the React component or contacting Twilio.
function selectTemplates(templates, category, selectedId) {
  const categories = [...new Set(templates.map(template => template.show).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filtered = category ? templates.filter(template => template.show === category) : [];
  const selected = filtered.find(template => template.id === selectedId) || filtered[0] || null;
  return { categories, filtered, selected };
}

async function dispatchPreview({ fetcher, payload, previewToken, approvalToken, onApproved, onDispatch }) {
  const post = async (url, body) => {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };
  let token = approvalToken;
  if (!token) {
    const result = await post('/api/send-approve', { ...payload, previewToken, consentAcknowledged: true });
    if (!result.response.ok || !result.data.approvalToken) return { stage: 'approval', ...result };
    token = result.data.approvalToken;
    onApproved(token);
  }
  onDispatch();
  const result = await post('/api/send', { ...payload, approvalToken: token, consentAcknowledged: true });
  return { stage: 'dispatch', ...result };
}

module.exports = { selectTemplates, dispatchPreview };
