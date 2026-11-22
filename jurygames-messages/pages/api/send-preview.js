import { requireMessagingRole, messagingUserClient } from '../../lib/messagingAuth';
import { resolveVoiceFrom } from '../../lib/resolveVoiceFrom';
import { validateSendGroup } from '../../lib/sendGroupAuthorization';
import security from '../../lib/security';
const { createSendPreviewHandler } = require('../../lib/sendPreviewHandler');

const { callbackUrl, canSend, createPreviewToken, isTrustedMutation, parseSendRequest, validateTemplateForSend } = security;

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default createSendPreviewHandler({
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
});
