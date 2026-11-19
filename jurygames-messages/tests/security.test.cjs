const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Twilio = require('twilio');
const security = require('../lib/security');

const sender = '+447700900123';

test('only trusted app_metadata grants operator or admin access', () => {
  assert.equal(security.roleForUser({ app_metadata: { jurygames_messaging_role: 'operator' } }), 'operator');
  assert.equal(security.roleForUser({ app_metadata: { jurygames_messaging_role: 'admin' } }), 'admin');
  assert.equal(security.roleForUser({ user_metadata: { jurygames_messaging_role: 'admin' } }), null);
  assert.equal(security.roleForUser({ app_metadata: { jurygames_messaging_role: 'viewer' } }), null);
  assert.equal(security.roleMeetsRequirement('operator', 'admin'), false);
  assert.equal(security.roleMeetsRequirement('admin', 'operator'), true);
});

test('unauthenticated or under-privileged API requests stop before protected work', async () => {
  const makeResponse = () => ({
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });
  let protectedWork = 0;
  const noSessionGuard = security.createRoleGuard(async () => null);
  const anonymousResponse = makeResponse();
  const anonymous = await noSessionGuard({}, anonymousResponse, 'operator');
  if (anonymous) protectedWork += 1;
  assert.equal(anonymous, null);
  assert.equal(anonymousResponse.code, 401);

  const operatorGuard = security.createRoleGuard(async () => ({ role: 'operator' }));
  const adminResponse = makeResponse();
  const operator = await operatorGuard({}, adminResponse, 'admin');
  if (operator) protectedWork += 1;
  assert.equal(operator, null);
  assert.equal(adminResponse.code, 403);
  assert.equal(protectedWork, 0);

  const unavailableGuard = security.createRoleGuard(async () => { throw new Error('auth backend offline'); });
  const unavailableResponse = makeResponse();
  assert.equal(await unavailableGuard({}, unavailableResponse, 'operator'), null);
  assert.equal(unavailableResponse.code, 503);
});

test('cookie parsing is bounded and rejects malformed encodings', () => {
  assert.equal(security.parseCookie('other=x; jg_messaging_session=abc%2Edef'), 'abc.def');
  assert.equal(security.parseCookie('jg_messaging_session=%E0%A4%A'), null);
  assert.equal(security.parseCookie('jg_messaging_session=' + 'x'.repeat(4097)), null);
  assert.match(security.buildRefreshCookie('refresh-only', false), /Path=\/api\/auth\/session;.*HttpOnly; SameSite=Strict/);
});

test('a verified Supabase JWT must identify the current user and a bounded session lifetime', () => {
  const userId = '6a9bd14c-53be-4f4c-a78e-1a2327dded5e';
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: 100, exp: 1000 })).toString('base64url');
  const token = `header.${payload}.signature`;
  assert.equal(security.sessionExpiresAt(token, userId, 0), 1000 * 1000);
  assert.equal(security.sessionExpiresAt(token, userId, 900 * 1000), 1000 * 1000);
  assert.equal(security.sessionExpiresAt(token, 'other-user', 0), null);
  const shortPayload = Buffer.from(JSON.stringify({ sub: userId, exp: 2000 })).toString('base64url');
  assert.equal(security.sessionExpiresAt(`header.${shortPayload}.signature`, userId, 5000), 905000);
});

test('send mutations require same-origin and the application request header', () => {
  const env = { PUBLIC_BASE_URL: 'https://messages.example.test' };
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://messages.example.test', 'x-jurygames-request': '1' } }, env), true);
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://attacker.example', 'x-jurygames-request': '1' } }, env), false);
  assert.equal(security.isTrustedMutation({ headers: { origin: 'https://messages.example.test' } }, env), false);
});

test('send request accepts only a bounded E.164 list and ignores caller-supplied template fields', () => {
  const request = security.parseSendRequest({
    group: { name: 'manual', list: [sender, sender, '+14155550123'] },
    templateId: 'approved-template-id',
    requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
    template: { content: 'attacker-controlled', from: '+19995550123', media_url: 'https://evil.example/audio.mp3' },
  });
  assert.equal(request.ok, true);
  assert.deepEqual(request.recipients, [sender, '+14155550123']);
  assert.equal(Object.hasOwn(request, 'template'), false);
  assert.equal(security.parseSendRequest({ group: { name: 'manual', list: ['020 7946 0018'] }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).error, 'recipient_number_invalid');
  assert.equal(security.parseSendRequest({ group: { name: 'manual', list: [sender] }, template: { content: 'only client template' } }).error, 'send_request_invalid');
  assert.equal(security.parseSendRequest({ group: { name: 'manual', list: Array(51).fill(sender) }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }).error, 'recipient_limit_exceeded');
});

test('an existing idempotency claim never dispatches a second provider operation', () => {
  assert.equal(security.isNewSendClaim({ claimed: true, status: 'processing' }), true);
  assert.equal(security.isNewSendClaim({ claimed: false, status: 'accepted' }), false);
  assert.equal(security.isNewSendClaim({ claimed: false, status: 'processing' }), false);
  assert.equal(security.isNewSendClaim(null), false);
});

test('partial provider outcomes are counted without returning recipient details', () => {
  const summary = security.summarizeProviderOutcomes([
    { accepted: true, providerStatus: 'queued' },
    { accepted: false, providerStatus: 'provider_error' },
    { accepted: true, providerStatus: 'accepted' },
  ]);
  assert.deepEqual(summary, {
    acceptedCount: 2,
    failedCount: 1,
    providerStatuses: { queued: 1, provider_error: 1, accepted: 1 },
  });
  assert.equal(Object.hasOwn(summary, 'recipients'), false);
});

test('template senders and media are restricted to server configuration', () => {
  const env = { DEFAULT_FROM_NUMBER_UK: sender, TWILIO_ALLOWED_MEDIA_HOSTS: 'media.jurygames.test' };
  assert.equal(security.validateTemplateForSend({ type: 'SMS', from_number: sender, content: 'Hello' }, env).ok, true);
  assert.equal(security.validateTemplateForSend({ type: 'SMS', from_number: '+19995550123', content: 'Hello' }, env).error, 'template_sender_not_allowed');
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'https://media.jurygames.test/approved.mp3' }, env).ok, true);
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'https://evil.example/audio.mp3' }, env).error, 'template_media_not_allowed');
  assert.equal(security.validateTemplateForSend({ type: 'Call', from_number: sender, media_url: 'http://media.jurygames.test/audio.mp3' }, env).error, 'template_media_not_allowed');
  assert.equal(security.validateTemplateDraft({ name: 'x', type: 'SMS', show: 'x', from_number: sender, content: '', from: '+19995550123' }, env).error, 'template_field_invalid');
});

test('sending remains disabled until every safety switch and the approval secret are configured', () => {
  assert.equal(security.canSend({ MESSAGING_SEND_ENABLED: 'true' }), false);
  assert.equal(security.canSend({ MESSAGING_CONSENT_REVIEWED: 'true' }), false);
  const env = {
    MESSAGING_SEND_ENABLED: 'true',
    MESSAGING_CONSENT_REVIEWED: 'true',
    MESSAGING_MANUAL_LISTS_REVIEWED: 'true',
    MESSAGING_APPROVAL_SECRET: 'test-approval-secret-0123456789abcdef',
  };
  assert.equal(security.canSend({ ...env, MESSAGING_MANUAL_LISTS_REVIEWED: undefined }), false);
  assert.equal(security.canSend({ ...env, MESSAGING_APPROVAL_SECRET: 'short' }), false);
  assert.equal(security.canSend(env), true);
});

test('approval tokens bind the operator, exact recipients, template, sender, group, and short expiry', () => {
  const env = { MESSAGING_APPROVAL_SECRET: 'test-approval-secret-0123456789abcdef' };
  const request = {
    actorId: 'operator-user-id',
    requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751',
    templateId: 'approved-template-id',
    groupName: 'Friday Jury',
    recipients: [sender, '+14155550123'],
    template: { id: 'approved-template-id', name: 'Call time', show: 'Jury Duty', type: 'SMS', from_number: sender, content: 'Doors at seven', summary: 'Arrival time' },
    resolvedFrom: sender,
    consentAcknowledged: true,
  };
  const token = security.createApprovalToken(request, env, 1000);
  assert.equal(typeof token, 'string');
  assert.equal(token.includes(sender), false);
  assert.equal(security.createApprovalToken({ ...request, consentAcknowledged: false }, env, 1000), null);
  assert.equal(security.verifyApprovalToken(token, request, env, 2000), true);
  assert.equal(security.verifyApprovalToken(token, { ...request, recipients: [sender] }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, groupName: 'Other group' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, resolvedFrom: '+14155550123' }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, { ...request, consentAcknowledged: false }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(token, request, env, 122000), false);

  const previewInput = { ...request, consentAcknowledged: false };
  const previewToken = security.createPreviewToken(previewInput, env, 1000);
  assert.equal(security.verifyPreviewToken(previewToken, previewInput, env, 2000), true);
  assert.equal(security.verifyPreviewToken(previewToken, { ...previewInput, template: { ...request.template, content: 'changed after preview' } }, env, 2000), false);
  assert.equal(security.verifyApprovalToken(previewToken, request, env, 2000), false);
});

test('voice callbacks use only the configured HTTPS origin', () => {
  assert.equal(security.callbackUrl('/api/voice/status', 'https://messages.example.test'), 'https://messages.example.test/api/voice/status');
  assert.equal(security.callbackUrl('//attacker.example/api/voice/status', 'https://messages.example.test'), null);
  assert.equal(security.callbackUrl('/api/voice/status', 'http://messages.example.test'), null);
});

test('Twilio callback signatures bind the exact HTTPS URL and form parameters', () => {
  const token = 'test-only-auth-token';
  const url = 'https://messages.example.test/api/voice/status';
  const params = { CallSid: 'CA00000000000000000000000000000000', CallStatus: 'completed' };
  const signature = Twilio.getExpectedTwilioSignature(token, url, params);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url, params), true);
  assert.equal(security.verifyTwilioSignature(Twilio, 'wrong-token', signature, url, params), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url + '?changed=1', params), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, signature, url, { ...params, CallStatus: 'failed' }), false);
  assert.equal(security.verifyTwilioSignature(Twilio, token, '', url, params), false);
});

test('login throttling caps repeated attempts within the window', () => {
  const key = `security-test-${Math.random()}`;
  for (let i = 0; i < 8; i += 1) assert.equal(security.takeLoginAttempt(key, 1000 + i), true);
  assert.equal(security.takeLoginAttempt(key, 1010), false);
  assert.equal(security.takeLoginAttempt(key, 62_000), true);
});

test('send dispatch helper never runs more than two provider calls concurrently', async () => {
  let active = 0;
  let highest = 0;
  const result = await security.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    highest = Math.max(highest, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.equal(highest, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test('database clients use an authenticated user token and never require a service-role key', () => {
  const clientSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'supabaseClient.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'messagingAuth.js'), 'utf8');
  const sendSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'api', 'send.js'), 'utf8');
  const templatesSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'api', 'templates', 'index.js'), 'utf8');
  assert.match(clientSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(clientSource, /SUPABASE_SERVICE_ROLE_KEY|getServiceSupabaseClient/);
  assert.doesNotMatch(authSource + sendSource + templatesSource, /getServiceSupabaseClient|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(authSource, /getSupabaseClient\(\)\.auth\.getUser\(token\)/);
  assert.doesNotMatch(authSource, /is_jg_messaging_session_active/);
  assert.match(sendSource, /userClient = messagingUserClient\(session\)/);
  assert.match(sendSource, /userClient\.rpc\('claim_jg_message_send'/);
  assert.match(templatesSource, /\.from\('jg_messaging_templates'\)/);
});
