# Patch Notes (Jury Games Calls & Texts Manager)

## What changed
- **/api/send** now validates and normalizes `from`/`to` to E.164 and will refuse to send if a template has no `from`. This prevents Twilio 21603.
- Added **/api/debug/senders** to quickly check which templates have `from` values in Production.
- **TemplateManager** prevents saving SMS/Call templates without a `from` number.

## How to verify
1. Open `/api/debug/senders` on your deployed site. Every template you intend to use should show `"hasFrom": true`.
2. Try a send from the homepage. If a template is missing `from`, the API returns a clear 400 with the template name.
3. For WhatsApp, change a template `type` to `WhatsApp` and set `from` to your WhatsApp-enabled Twilio number (E.164). The API will route via the WhatsApp sender.

## Required environment variables
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

(Per-template `from` numbers are stored in the **templates table** now.)
