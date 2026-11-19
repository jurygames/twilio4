# Jury Games Messaging App

Next.js 15.5.28 Pages Router interface for approved SMS, WhatsApp and voice templates. Manual recipient groups are kept in memory only; reloading, signing out, or session expiry clears them.

## Access

The browser does not contain an authentication password. Operators sign in through Supabase Auth. A trusted administrator must set `app_metadata.jurygames_messaging_role` to `operator` or `admin`; user-editable metadata is not accepted. Every protected request verifies the current Auth user and role with Supabase. The access cookie is `HttpOnly` and bounded to 15 minutes; the refresh cookie is also `HttpOnly`, expires with it, and is scoped to the sign-out endpoint. Sign out revokes the local Supabase refresh session. Operators can read templates and request sends. Admins can create, edit and delete templates.

Server-side runtime configuration:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `DEFAULT_FROM_NUMBER_UK`, `DEFAULT_FROM_NUMBER_UK_ALT`, `DEFAULT_FROM_NUMBER_US` or `TWILIO_ALLOWED_FROM_NUMBERS`
- `TWILIO_ALLOWED_MEDIA_HOSTS` for call audio URLs
- `PUBLIC_BASE_URL` for signed Twilio callback verification
- `TWILIO_CALLBACK_INGRESS_READY` only after a narrowly reachable signed webhook ingress is verified
- `MESSAGING_APPROVAL_SECRET` — at least 32 random bytes, server only
- `MESSAGING_SEND_ENABLED`, `MESSAGING_CONSENT_REVIEWED`, and `MESSAGING_MANUAL_LISTS_REVIEWED`

## Sending safeguards

Sending is denied unless all three messaging flags are explicitly set to `true`, the approval secret is configured, and the short-lived preview approval is valid. Keep the flags disabled until the consent and opt-out review is complete, manual-list retention is approved, the Summons messaging migration is installed, and the callback route can receive Twilio requests while preserving signature verification. Voice calls additionally require `TWILIO_CALLBACK_INGRESS_READY=true` after the narrow signed callback path is verified; do not disable broad Vercel SSO protection. Operators must review the server-loaded template and explicitly acknowledge recipient eligibility; the signed two-minute approval binds the operator, template, sender, group, and normalized recipient set. The send endpoint accepts only E.164 recipient strings, caps each request at 50 unique numbers, allows up to 10 send attempts per operator per hour, limits provider concurrency to two and requires a per-request idempotency key. Missing guard functions fail closed. Twilio acceptance is reported separately from delivery.

Templates and aggregate send outcomes live in Summons. Every Twilio4 database request uses the signed-in user's short-lived access token and the public anon key; Summons RLS limits operators to reading templates and their own send status, and reserves template edits for admins. Twilio4 must not receive a Summons service-role key. Recipient lists continue to come from the existing Summons contact lifecycle and are not copied into messaging tables or browser storage. The public health route returns liveness only and reads no database rows.

## Development

```sh
npm install
npm test
npm run build
npm run test:api
npm run dev
```

See [SECURITY.md](./SECURITY.md) for the Phase 0 route audit and remaining release prerequisites.
