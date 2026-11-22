function createSendPreviewHandler({
  requireMessagingRole,
  messagingUserClient,
  validateSendGroup,
  callbackUrl,
  canSend,
  createPreviewToken,
  isTrustedMutation,
  parseSendRequest,
  resolveVoiceFrom,
  validateTemplateForSend,
}) {
  return async function sendPreviewHandler(req, res) {
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
      const groupAuthorization = await validateSendGroup(parsedRequest, session.accessToken);
      if (!groupAuthorization.ok) return res.status(groupAuthorization.status).json({ error: groupAuthorization.error });
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
        'Verify that this group matches the selected Summons performance and its current retention deadline.',
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
        groupKind: parsedRequest.groupKind,
        groupScope: parsedRequest.groupScope,
        showId: parsedRequest.showId,
        showStartsAt: parsedRequest.showStartsAt,
        showEndsAt: parsedRequest.showEndsAt,
        showName: parsedRequest.showName,
        showLocation: parsedRequest.showLocation,
        deliveryType: parsedRequest.deliveryType,
        bookingDistinction: parsedRequest.bookingDistinction,
        expiresAtIso: parsedRequest.expiresAtIso,
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
        countryGroups: groupAuthorization.countryGroups,
        exclusions: groupAuthorization.exclusions,
        show: groupAuthorization.show ? {
          showId: groupAuthorization.show.showId,
          name: groupAuthorization.show.name,
          startsAt: groupAuthorization.show.startsAt,
          endsAt: groupAuthorization.show.endsAt,
          location: groupAuthorization.show.location || null,
          deliveryType: groupAuthorization.show.deliveryType,
          bookingDistinction: groupAuthorization.show.bookingDistinction,
        } : null,
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
  };
}

module.exports = { createSendPreviewHandler };
