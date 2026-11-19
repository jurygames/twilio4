# Phase 0 security audit

This audit covers the Twilio4 app in `jurygames-messages/` and deployment metadata for the `twilio4-messages` Vercel project. Runtime routes could not be independently observed. No customer numbers, DMN transaction records, or Google Calendar event records were opened.

## Application controls

- Supabase Auth verifies the account on every protected API request. A short-lived `HttpOnly`, `Secure` in production, `SameSite=Strict` cookie holds the access token; a refresh-token cookie is limited to the sign-out endpoint. The server checks the token's `session_id` against `auth.sessions`, and sign out revokes the local Supabase session. The role comes only from trusted `app_metadata.jurygames_messaging_role`, never user-editable metadata.
- Operators may read templates and request a send. Only admins may create, edit, or delete templates. Template writes and sends require same-origin checks and a custom request header.
- Template reads and writes use a server-only Supabase service key after the role check. Request bodies cannot replace template text, sender identity, or media URL; a send names a stored template ID.
- The send route fails closed unless all send, consent, and manual-list review switches are enabled, a server-only approval secret is set, a two-minute approval token matches the current operator/template/sender/group/recipient set, and the database claim RPC succeeds. Operators must explicitly acknowledge consent and opt-out review in the preview flow. Voice calls additionally require an explicitly verified narrow callback ingress. Destinations must already be E.164, lists are capped at 50 unique values, provider concurrency is two, and the database guard limits an operator to 10 attempts per hour and prevents duplicate request IDs. Send records contain template ID, counts, coarse provider status, and timestamps only; they contain no phone numbers, message bodies, or provider SIDs.
- Voice status callbacks must pass Twilio signature validation against the configured HTTPS application URL. Callback parameters are not logged or stored.
- `/api/health` is a data-free liveness response. Legacy password checks and local-storage group data are cleared. Manual groups now exist only in page memory.
- Unauthenticated demo sends, arbitrary call/audio test routes, and sender/debug routes have been removed.
- The temporary frontend recommendation is to retain this Pages Router app through the security and contact-service work, now on patched Next.js 15.5.28 with React 18 compatibility. Retire it after the unified Summons messaging page has passed the same access, consent, retention, and provider safeguards; this phase does not migrate the UI.

## Release gates

- The production Vercel project has SSO protection enabled. The authenticated Vercel fetch returned 404 for the production aliases, so runtime behavior could not be independently observed. No browser-based production verification is claimed.
- The Vercel environment inventory contains Twilio configuration but no Supabase Auth/database variables. The app therefore cannot sign operators in or load templates in that deployment until its intended Supabase project is identified and configured.
- The connected Supabase projects are Summons and Summons Staging; neither is the Twilio4 database. The send-guard migration in this repository is not applied. Do not apply it to either Summons database. Before deployment, identify the isolated Twilio4 database, run the migration and security advisors there, and verify the template table's existing grants/RLS. Sending remains disabled until those checks and the consent/opt-out review pass.
- Vercel SSO also protects the production callback path. A signed Twilio callback needs a narrowly scoped reachable ingress. Do not disable broad SSO protection to make callbacks work.
- The Summons MCP foundation is a separate, unmerged, disabled, read-only implementation. Its current six tools omit customer contacts and messaging, and all write capabilities remain unimplemented. This phase adds no MCP send or contact tool. The MCP staging OAuth handshake is not yet validated end to end.
- Two browser-only password literals were found only in their original UI files in the indexed Jury Games source and are removed here. They were not server credentials in this app; no other indexed source reuse was found.

Do not enable `MESSAGING_SEND_ENABLED` or `MESSAGING_CONSENT_REVIEWED` until the database and deployment gates above are closed. Do not add Summons contact data to Twilio4 until the MCP/service boundary and authoritative 48-hour retention behavior have been reviewed in a separate change.
