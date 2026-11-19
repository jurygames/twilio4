import { requireMessagingRole, messagingUserClient } from '../../lib/messagingAuth';
import { resolveVoiceFrom } from '../../lib/resolveVoiceFrom';
import security from '../../lib/security';

const { callbackUrl, canSend, createPreviewToken, isTrustedMutation, parseSendRequest, validateTemplateForSend } = security;

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

  const parsedRequest = parseSendRequest(req.body);
  if (!parsedRequest.ok) return res.status(400).json({ error: parsedRequest.error });

  try {
    const { data: template, error } = await messagingUserClient(session)
      .from('jg_messaging_templates')
      .select('*')
      .eq('id', parsedRequest.templateId)
      .maybeSingle();
    if (error) return res.status(503).json({ error: 'template_store_unavailable' });
    if (!template) return res.status(404).json({ error: 'template_not_found' });
    const checked = validateTemplateForSend(template);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    let resolvedFrom = checked.template.from;
    const warnings = [
      'This manual group is not linked to a canonical Summons show in this phase.',
      'Confirm the intended show, retention deadline, consent, and opt-out status for every recipient before approval.',
    ];
    let callbackReady = true;
    if (canSend() && checked.template.type === 'call') {
      if (process.env.TWILIO_CALLBACK_INGRESS_READY !== 'true' || !callbackUrl('/api/voice/status')) {
        callbackReady = false;
        warnings.push('A narrowly reachable signed Twilio callback is not configured; call sending is unavailable.');
      }
      else resolvedFrom = await resolveVoiceFrom(checked.template.from);
    }

    const ready = canSend() && callbackReady;
    const previewToken = ready ? createPreviewToken({
      actorId: session.user.id,
      requestId: parsedRequest.requestId,
      templateId: parsedRequest.templateId,
      groupName: parsedRequest.groupName,
      recipients: parsedRequest.recipients,
      template,
      resolvedFrom,
      consentAcknowledged: false,
    }) : null;

    return res.status(200).json({
      requestId: parsedRequest.requestId,
      recipientCount: parsedRequest.recipients.length,
      groupName: parsedRequest.groupName,
      canApprove: Boolean(ready && previewToken),
      previewToken,
      warnings,
      template: {
        id: String(template.id),
        name: String(template.name || '').slice(0, 120),
        showCategory: String(template.show || '').slice(0, 120),
        type: checked.template.type,
        from: resolvedFrom,
        content: checked.template.content,
        summary: String(template.summary || '').slice(0, 500),
        ...(checked.template.type === 'call' ? { mediaUrl: checked.template.mediaUrl } : {}),
      },
    });
  } catch {
    return res.status(503).json({ error: 'messaging_configuration_unavailable' });
  }
}
