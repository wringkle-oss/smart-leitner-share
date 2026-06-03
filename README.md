# Smart Leitner Share

A small Next.js App Router app for sharing flashcard decks with short codes.

## Features

- Upload page with deck name and CSV/TSV paste area
- User-defined Deck Code that is unique and used by the Android app
- `POST /api/decks` accepts `{ "code": "...", "deckName": "...", "rawText": "..." }`
- `GET /api/decks/[code]` returns `{ "code": "...", "deckName": "...", "cards": [...] }`
- `GET /api/decks/recent?days=7` returns all decks uploaded within the last N days
- Supabase-only storage for Vercel serverless deployment

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase setup

1. Run `supabase/schema.sql` in your Supabase SQL editor.
2. Copy `.env.example` to `.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Deck data is always saved to Supabase. The app does not use local filesystem
storage for decks.

Deck Code is required, normalized to uppercase, and must match
`/^[A-Z0-9_-]{3,32}$/`. Deck Name is optional; if it is empty, the app uses
Deck Code as the display name.
