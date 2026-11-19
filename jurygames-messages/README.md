# Jury Games Messaging App

Next.js 15.5.28 Pages Router interface for approved SMS, WhatsApp and voice templates. Manual recipient groups are kept in memory only; reloading, signing out, or session expiry clears them.

## Access

The browser does not contain an authentication password. Operators sign in through Supabase Auth. A trusted administrator must set `app_metadata.jurygames_messaging_role` to `operator` or `admin`; user-editable metadata is not accepted. The access cookie is `HttpOnly` and lasts 15 minutes; the refresh cookie is also `HttpOnly`, expires with it, and is scoped to the sign-out endpoint. Every protected request checks the current Auth user, current role, and the Supabase `auth.sessions` row for the token's `session_id`. Sign out revokes the local Supabase session. Operators can read templates and request sends. Admins can create, edit and delete templates.

Server-side runtime configuration:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only; never expose it with a `NEXT_PUBLIC_` variable
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `DEFAULT_FROM_NUMBER_UK`, `DEFAULT_FROM_NUMBER_UK_ALT`, `DEFAULT_FROM_NUMBER_US` or `TWILIO_ALLOWED_FROM_NUMBERS`
- `TWILIO_ALLOWED_MEDIA_HOSTS` for call audio URLs
- `PUBLIC_BASE_URL` for signed Twilio callback verification
- `TWILIO_CALLBACK_INGRESS_READY` only after a narrowly reachable signed webhook ingress is verified
- `MESSAGING_APPROVAL_SECRET` — at least 32 random bytes, server only
- `MESSAGING_SEND_ENABLED`, `MESSAGING_CONSENT_REVIEWED`, and `MESSAGING_MANUAL_LISTS_REVIEWED`

## Sending safeguards

Sending is denied unless all three messaging flags are explicitly set to `true`, the approval secret is configured, and the short-lived preview approval is valid. Keep the flags disabled until the consent and opt-out review is complete, manual-list retention is approved, the Twilio-only send-guard database functions are installed, and the callback route can receive Twilio requests while preserving signature verification. Voice calls additionally require `TWILIO_CALLBACK_INGRESS_READY=true` after the narrow signed callback path is verified; do not disable broad Vercel SSO protection. Operators must review the server-loaded template and explicitly acknowledge recipient eligibility; the signed two-minute approval binds the operator, template, sender, group, and normalized recipient set. The send endpoint accepts only E.164 recipient strings, caps each request at 50 unique numbers, allows up to 10 send attempts per operator per hour, limits provider concurrency to two and requires a per-request idempotency key. Missing guard functions fail closed. Twilio acceptance is reported separately from delivery.

The send-guard database belongs to Twilio4. Do not install its schema in Summons. Template and send APIs use a server-only Supabase service key after checking the signed-in user's current role. The public health route returns liveness only and reads no database rows.

## Development

```sh
npm install
npm test
npm run build
npm run test:api
npm run dev
```

See [SECURITY.md](./SECURITY.md) for the Phase 0 route audit and remaining release prerequisites.
