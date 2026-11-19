const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('live API routes deny anonymous requests without invoking provider operations', { timeout: 30000 }, async (t) => {
  const root = path.resolve(__dirname, '..');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, TWILIO_AUTH_TOKEN: 'test-only-auth-token', PUBLIC_BASE_URL: 'https://messaging.example.test' },
    stdio: 'ignore',
  });
  t.after(() => { if (!server.killed) server.kill(); });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Next.js is still starting. */ }
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  assert.equal(ready, true, 'the built Next.js app did not start');

  const cases = [
    ['GET', '/api/auth/session', undefined],
    ['GET', '/api/templates', undefined],
    ['GET', '/api/messaging/shows', undefined],
    ['GET', '/api/messaging/recipients?show_id=synthetic-event', undefined],
    ['GET', '/api/twilio/messaging/shows', undefined],
    ['GET', '/api/twilio/messaging/recipients?show_id=synthetic-event', undefined],
    ['POST', '/api/templates', { name: 'anonymous', type: 'SMS' }],
    ['POST', '/api/send-preview', { group: { name: 'anonymous', list: ['+447700900123'] }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }],
    ['POST', '/api/send-approve', { group: { name: 'anonymous', list: ['+447700900123'] }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751', consentAcknowledged: true }],
    ['PATCH', '/api/templates/example', { content: 'unauthorized' }],
    ['DELETE', '/api/templates/example', undefined],
    ['POST', '/api/send', { group: { name: 'anonymous', list: ['+447700900123'] }, templateId: 'x', requestId: '02bb5d84-2e59-4a8e-9d3d-e10c0731b751' }],
  ];
  for (const [method, route, body] of cases) {
    const response = await fetch(`${base}${route}`, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'x-jurygames-request': '1' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 401, `${method} ${route} must require a verified operator`);
  }

  const invalidCallback = await fetch(`${base}/api/voice/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalid' },
    body: 'CallStatus=completed&CallSid=CA00000000000000000000000000000000',
  });
  assert.equal(invalidCallback.status, 403);

  for (const route of [
    '/api/send-sms', '/api/send-whatsapp', '/api/make-call',
    '/api/voice/test-play', '/api/voice/test-say',
    '/api/debug/dry-run', '/api/debug/resolve-sender', '/api/debug/senders', '/api/debug/twilio-numbers',
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 404, `${route} must not expose an unsafe demo/debug endpoint`);
  }
});
