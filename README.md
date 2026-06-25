# Smart Leitner Share

A small Next.js App Router app for sharing flashcard decks with short codes.

## Features

- Upload page with deck name and CSV/TSV paste area
- User-defined Deck Code that is unique and used by the Android app
- `POST /api/decks` accepts `{ "code": "...", "deckName": "...", "rawText": "..." }`
- `GET /api/decks/[code]` returns `{ "code": "...", "deckName": "...", "cards": [...] }`
- `GET /api/decks/recent?days=7` returns all decks uploaded within the last N days
- `GET` or `POST /api/import-daily-ebs` imports today's EBS 입트영 decks automatically
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

## Daily EBS Import

The importer fetches the Naver Blog 입트영 category, finds the post whose title
matches today's Asia/Seoul lesson date, excludes everything after `One More
Dialog`, and saves these sections as separate Smart Leitner decks:

- `BODY`: 본문
- `WORD`: 단어 / Key Expressions
- `PATT`: 패턴 / Pattern Practice
- `DIAL`: 대화문

Deck codes use this shape:

```text
IT260625-BODY-A7K3
IT260625-WORD-M9Q2
IT260625-PATT-R4X8
IT260625-DIAL-P2H6
```

If a deck with the same date and section prefix already exists, the importer
skips that section instead of creating a duplicate.

Manual run against a local dev server:

```bash
npm run dev
npm run import:ebs
```

To run against a deployed site:

```bash
set IMPORT_EBS_URL=https://your-site.vercel.app/api/import-daily-ebs
npm run import:ebs
```

Vercel Cron is configured in `vercel.json`:

```json
{
  "path": "/api/import-daily-ebs",
  "schedule": "0 20 * * 0-5"
}
```

Vercel schedules use UTC. `0 20 * * 0-5` runs Sunday-Friday at 20:00 UTC,
which is Monday-Saturday at 05:00 in Asia/Seoul.
