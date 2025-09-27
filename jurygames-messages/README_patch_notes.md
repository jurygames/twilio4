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


## Voice-specific update
- Added **lib/resolveVoiceFrom.js** to ensure the `from` used for calls is **voice-capable** on your account. If the template's `from` isn't voice-capable (common with some UK mobile numbers), it will fall back to `TWILIO_VOICE_FALLBACK_FROM`.
- Set `TWILIO_VOICE_FALLBACK_FROM` in Vercel to any **owned, voice-capable** number (E.164). You can verify via `/api/debug/twilio-numbers`.



## Voice diagnostics
- **/api/voice/test-say?to=+E164** → places a call that uses `<Say>` (no external media). If this works, Twilio voice + number + geo perms are good.
- **/api/voice/test-play?to=+E164&url=...** → same as production path but with your own media URL. If test-say works but test-play fails, it's a **media URL** issue.
- All tests log to `/api/voice/status` → check Vercel function logs.

