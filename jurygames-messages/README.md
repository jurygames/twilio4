
# Jury Games Messaging App

## Setup
1. Copy `.env.example` to `.env` and add your Twilio credentials:
   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DEFAULT_FROM_NUMBER_UK, DEFAULT_FROM_NUMBER_UK_ALT, DEFAULT_FROM_NUMBER_US, APP_ENV
2. Install dependencies: `npm install`
3. Run locally: `npm run dev`
4. Deploy on Vercel: connect repo or use `vercel --prod`

## Features
- Show selection (Scott Davies, Harry Briggs, Christmas Party)
- Group create / edit / delete / purge all
- Template management (add / edit / delete SMS, WhatsApp, Call)
- Send SMS, WhatsApp, or Call with status feedback
- Hosted MP3 calls
- Dark-mode UI (Roboto Sans & blue accents) with Tailwind
