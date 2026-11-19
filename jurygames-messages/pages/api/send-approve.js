import { getServiceSupabaseClient } from '../../lib/supabaseClient';
import { requireMessagingRole } from '../../lib/messagingAuth';
import { resolveVoiceFrom } from '../../lib/resolveVoiceFrom';
import security from '../../lib/security';

const { callbackUrl, canSend, createApprovalToken, isTrustedMutation, parseSendRequest, validateTemplateForSend, verifyPreviewToken } = security;

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

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
  if (req.body?.consentAcknowledged !== true) return res.status(400).json({ error: 'operator_review_required' });

  const parsedRequest = parseSendRequest(req.body);
  if (!parsedRequest.ok) return res.status(400).json({ error: parsedRequest.error });

  try {
    const { data: template, error } = await getServiceSupabaseClient()
      .from('templates')
      .select('*')
      .eq('id', parsedRequest.templateId)
      .maybeSingle();
    if (error) return res.status(503).json({ error: 'template_store_unavailable' });
    if (!template) return res.status(404).json({ error: 'template_not_found' });
    const checked = validateTemplateForSend(template);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    let resolvedFrom = checked.template.from;
    if (checked.template.type === 'call') {
      if (process.env.TWILIO_CALLBACK_INGRESS_READY !== 'true' || !callbackUrl('/api/voice/status')) return res.status(503).json({ error: 'callback_not_configured' });
      resolvedFrom = await resolveVoiceFrom(checked.template.from);
    }
    const expectedPreview = {
      actorId: session.user.id,
      requestId: parsedRequest.requestId,
      templateId: parsedRequest.templateId,
      groupName: parsedRequest.groupName,
      recipients: parsedRequest.recipients,
      template,
      resolvedFrom,
      consentAcknowledged: false,
    };
    if (!verifyPreviewToken(req.body?.previewToken, expectedPreview)) {
      return res.status(409).json({ error: 'preview_expired_or_mismatched' });
    }
    const approvalToken = createApprovalToken({
      actorId: session.user.id,
      requestId: parsedRequest.requestId,
      templateId: parsedRequest.templateId,
      groupName: parsedRequest.groupName,
      recipients: parsedRequest.recipients,
      template,
      resolvedFrom,
      consentAcknowledged: true,
    });
    if (!approvalToken) return res.status(503).json({ error: 'send_approval_unavailable' });
    return res.status(200).json({ approved: true, requestId: parsedRequest.requestId, approvalToken, expiresInSeconds: 120 });
  } catch {
    return res.status(503).json({ error: 'messaging_configuration_unavailable' });
  }
}
