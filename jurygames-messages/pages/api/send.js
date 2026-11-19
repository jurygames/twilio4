import { sendSMS, sendWhatsApp, makeCall } from '../../lib/twilioClient';
import { resolveVoiceFrom } from '../../lib/resolveVoiceFrom';
import { requireMessagingRole, messagingUserClient } from '../../lib/messagingAuth';
import security from '../../lib/security';

const {
  canSend,
  callbackUrl,
  isNewSendClaim,
  isTrustedMutation,
  mapWithConcurrency,
  parseSendRequest,
  SEND_CONCURRENCY,
  summarizeProviderOutcomes,
  verifyApprovalToken,
  validateTemplateForSend,
} = security;

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

function providerErrorCategory(error) {
  const code = error && typeof error === 'object' ? String(error.code || '') : '';
  return /^[A-Z0-9_-]{1,24}$/i.test(code) ? code : 'provider_error';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = await requireMessagingRole(req, res, 'operator');
  if (!session) return;
  if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
  if (!canSend()) return res.status(503).json({ error: 'sending_disabled' });

  const parsedRequest = parseSendRequest(req.body);
  if (!parsedRequest.ok) return res.status(400).json({ error: parsedRequest.error });
  const { requestId, templateId, groupName, recipients } = parsedRequest;

  let prepared;
  let callFrom;
  let statusCallback;
  let templateRecord;
  let userClient;
  try {
    userClient = messagingUserClient(session);
    const { data: template, error } = await userClient
      .from('jg_messaging_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();
    if (error) return res.status(503).json({ error: 'template_store_unavailable' });
    if (!template) return res.status(404).json({ error: 'template_not_found' });
    templateRecord = template;
    const checked = validateTemplateForSend(template);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    prepared = checked.template;
    if (prepared.type === 'call') {
      if (process.env.TWILIO_CALLBACK_INGRESS_READY !== 'true') return res.status(503).json({ error: 'callback_not_configured' });
      statusCallback = callbackUrl('/api/voice/status');
      if (!statusCallback) return res.status(503).json({ error: 'callback_not_configured' });
      callFrom = await resolveVoiceFrom(prepared.from);
    }
  } catch {
    return res.status(503).json({ error: 'messaging_configuration_unavailable' });
  }

  const resolvedFrom = prepared.type === 'call' ? callFrom : prepared.from;
  if (!verifyApprovalToken(req.body?.approvalToken, {
    actorId: session.user.id,
    requestId,
    templateId,
    groupName,
    recipients,
    template: templateRecord,
    resolvedFrom,
    consentAcknowledged: req.body?.consentAcknowledged === true,
  })) {
    return res.status(409).json({ error: 'approval_expired_or_mismatched' });
  }

  let claim;
  try {
    const { data, error } = await userClient.rpc('claim_jg_message_send', {
      p_actor_id: session.user.id,
      p_request_id: requestId,
      p_template_id: templateId,
      p_recipient_count: recipients.length,
    });
    if (error?.message === 'messaging_rate_limited') return res.status(429).json({ error: 'send_rate_limited' });
    if (error?.message === 'messaging_concurrency_limited') return res.status(429).json({ error: 'send_concurrency_limited' });
    if (error) return res.status(503).json({ error: 'send_guard_unavailable' });
    claim = Array.isArray(data) ? data[0] : data;
  } catch {
    return res.status(503).json({ error: 'send_guard_unavailable' });
  }
  if (!isNewSendClaim(claim)) {
    const status = ['processing', 'accepted', 'partial', 'failed'].includes(claim?.status) ? claim.status : 'unknown';
    return res.status(409).json({
      error: 'send_request_already_claimed',
      status,
      acceptedCount: Number.isInteger(claim?.accepted_count) ? claim.accepted_count : 0,
      failedCount: Number.isInteger(claim?.failed_count) ? claim.failed_count : 0,
      providerStatuses: claim?.provider_statuses && typeof claim.provider_statuses === 'object' ? claim.provider_statuses : {},
      deliveryConfirmed: false,
    });
  }

  const outcomes = await mapWithConcurrency(recipients, SEND_CONCURRENCY, async (to) => {
    try {
      let result;
      if (prepared.type === 'sms') result = await sendSMS(to, prepared.from, prepared.content);
      else if (prepared.type === 'whatsapp') result = await sendWhatsApp(to, prepared.from, prepared.content);
      else result = await makeCall(to, callFrom, prepared.mediaUrl, statusCallback);
      const rawStatus = result?.status ? String(result.status).toLowerCase() : 'accepted';
      const providerStatus = /^[a-z0-9_-]{1,24}$/.test(rawStatus) ? rawStatus : 'unknown_status';
      return { accepted: Boolean(result?.sid), providerStatus };
    } catch (error) {
      return { accepted: false, providerStatus: providerErrorCategory(error) };
    }
  });

  const { acceptedCount, failedCount, providerStatuses } = summarizeProviderOutcomes(outcomes);
  try {
    const { error } = await userClient.rpc('finish_jg_message_send', {
      p_actor_id: session.user.id,
      p_request_id: requestId,
      p_accepted_count: acceptedCount,
      p_failed_count: failedCount,
      p_provider_statuses: providerStatuses,
    });
    if (error) {
      console.error(JSON.stringify({ tag: 'twilio-send-outcome', status: 'recording_failed', requestId }));
      return res.status(503).json({ error: 'send_outcome_recording_failed', requestId });
    }
  } catch {
    console.error(JSON.stringify({ tag: 'twilio-send-outcome', status: 'recording_failed', requestId }));
    return res.status(503).json({ error: 'send_outcome_recording_failed', requestId });
  }

  console.log(JSON.stringify({ tag: 'twilio-send-outcome', status: failedCount ? (acceptedCount ? 'partial' : 'failed') : 'accepted', requestId, acceptedCount, failedCount }));
  return res.status(200).json({ acceptedCount, failedCount, providerStatuses, deliveryConfirmed: false });
}
