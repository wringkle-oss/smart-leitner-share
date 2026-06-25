# Smart Leitner Share

A small Next.js App Router app for sharing flashcard decks with short codes.

## Features

- Upload page with deck name and CSV/TSV paste area
- User-defined Deck Code that is unique and used by the Android app
- `POST /api/decks` accepts `{ "code": "...", "deckName": "...", "rawText": "..." }`
- `GET /api/decks/[code]` returns `{ "code": "...", "deckName": "...", "cards": [...] }`
- `GET /api/decks/recent?days=7` returns all decks uploaded within the last N days
- `GET` or `POST /api/import-daily-ebs` imports today's EBS Ipteuyeong decks automatically
- Supabase-only storage for Vercel serverless deployment

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production

Production URL:

```text
https://smart-leitner-share.vercel.app/
```

Useful production endpoints:

```text
https://smart-leitner-share.vercel.app/api/import-daily-ebs
https://smart-leitner-share.vercel.app/api/import-daily-ebs?force=1
https://smart-leitner-share.vercel.app/api/decks/recent?days=7
https://smart-leitner-share.vercel.app/api/decks/DECK_CODE
```

## Supabase Setup

1. Run `supabase/schema.sql` in your Supabase SQL editor.
2. Copy `.env.example` to `.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. BODY translation is off by default. The default BODY behavior is
   `TRANSLATE_BODY=false` and `BODY_BACK_MODE=same`.
5. If you explicitly set `TRANSLATE_BODY=true`, also set `OPENAI_API_KEY`.
6. Optionally set `OPENAI_TRANSLATION_MODEL`; the default is `gpt-4.1`.

Deck data is always saved to Supabase. The app does not use local filesystem
storage for decks.

Deck Code is required, normalized to uppercase, and must match
`/^[A-Z0-9_-]{3,32}$/`. Deck Name is optional; if it is empty, the app uses
Deck Code as the display name.

## Daily EBS Import

The importer fetches the Naver Blog EBS Ipteuyeong category, finds the post
whose title matches today's Asia/Seoul lesson date, excludes everything after
`One More Dialog`, and saves these sections as separate Smart Leitner decks:

- `BODY`: main passage
- `WORD`: vocabulary / Key Expressions
- `PATT`: Pattern Practice
- `DIAL`: dialogue

Deck codes use this shape:

```text
IT260625-BODY-A7K3
IT260625-WORD-M9Q2
IT260625-PATT-R4X8
IT260625-DIAL-P2H6
```

If a deck with the same date and section prefix already exists, the importer
skips that section instead of creating a duplicate. Use `force=1` to replace
existing section decks for that date.

The BODY deck is post-processed differently from the other sections. The
importer splits the English passage into sentences. By default, translation is
off, so every BODY card is stored as:

```text
English sentence<TAB>English sentence
```

This default is intentionally redundant, but it keeps both front and back
filled so card importers do not drop BODY cards. You can set
`BODY_BACK_MODE=empty` to store `English sentence<TAB>` instead.

Optional translation mode:

```text
TRANSLATE_BODY=true
OPENAI_API_KEY=...
```

When translation is enabled, BODY is stored as:

```text
English sentence<TAB>Korean translation
```

If translation fails, the importer refuses to save an incomplete BODY deck.

Manual run against a local dev server:

```bash
npm run dev
npm run import:ebs
```

Regenerate existing decks for the same date and section prefixes:

```bash
npm run import:ebs -- --force
```

The deployed force URL is useful after changing BODY settings:

```text
https://smart-leitner-share.vercel.app/api/import-daily-ebs?force=1
```

Run against a deployed site:

```bash
set IMPORT_EBS_URL=https://smart-leitner-share.vercel.app/api/import-daily-ebs
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
