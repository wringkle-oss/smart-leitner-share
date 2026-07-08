# Smart Leitner Share

A small Next.js App Router app for sharing flashcard decks with short codes.

## Features

- Upload page with deck name and CSV/TSV paste area
- User-defined Deck Code that is unique and used by the Android app
- `POST /api/decks` accepts `{ "code": "...", "deckName": "...", "rawText": "..." }`
- `GET /api/decks/[code]` returns `{ "code": "...", "deckName": "...", "cards": [...] }`
- `GET /api/decks/recent?days=7` returns all decks uploaded within the last N days
- `GET` or `POST /api/import-daily-ebs` imports daily EBS decks automatically
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
https://smart-leitner-share.vercel.app/api/import-daily-ebs?program=ipte
https://smart-leitner-share.vercel.app/api/import-daily-ebs?program=gwite&force=1
https://smart-leitner-share.vercel.app/api/import-daily-ebs?program=start&force=1
https://smart-leitner-share.vercel.app/api/import-daily-ebs?program=all
https://smart-leitner-share.vercel.app/api/import-daily-ebs-all
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

The importer fetches the Naver Blog `alone36`, finds the post whose title
matches today's Asia/Seoul lesson date, excludes everything after
`One More Dialog`, and saves each parsed section as a separate Smart Leitner
deck.

Supported programs:

- `ipte`: Ipteuyeong. Decks: `BODY`, `WORD`, `PATT`, `DIAL`
- `gwite`: Gwiyeong. Decks: `SCRIPT`, `WORD`, `EXPR`, `CLOZE`
- `start`: Start English. Decks: `DIAL`, `WORD`, `PATT`, `PRACTICE`
- `all`: imports all supported programs and reports each program separately

`GET /api/import-daily-ebs` defaults to `program=all`. Use `program=ipte`
when you only want the Ipteuyeong importer.

Deck codes use these shapes:

```text
IT260707-BODY-A7K3
GTE260707-SCRIPT-M9Q2
SE260707-DIAL-R4X8
```

If a deck with the same date, program, and section prefix already exists, the
importer skips that section instead of creating a duplicate. Use `force=1` to
delete and reinsert cards for existing section decks.

Card rules:

- If a source line has English and Korean, it is saved as `front<TAB>back`.
- If a listening/script/body line has English only, it is saved as
  `English sentence<TAB>English sentence` by default.
- Korean-only lines are skipped when they cannot be safely paired.
- WORD/PATT/EXPR/PRACTICE cards are normalized before saving. The importer
  keeps required `~` placeholders in meanings and cleans known duplicate fronts
  such as `run a 10K 10km` into `run a 10K`.
- CLOZE cards are optional. If the importer cannot safely build them, the rest
  of the program import still succeeds.

BODY translation is off by default:

```text
TRANSLATE_BODY=false
BODY_BACK_MODE=same
```

Optional translation mode:

```text
TRANSLATE_BODY=true
OPENAI_API_KEY=...
```

When translation is enabled, BODY is stored as
`English sentence<TAB>Korean translation`. If translation fails, the importer
refuses to save an incomplete BODY deck.

Manual run against a local dev server:

```bash
npm run dev
npm run import:ebs -- --program=ipte
npm run import:ebs -- --program=gwite
npm run import:ebs -- --program=start
npm run import:ebs -- --program=all
npm run import:ebs -- --program=gwite --force
```

Run against a deployed site:

```bash
set IMPORT_EBS_URL=https://smart-leitner-share.vercel.app/api/import-daily-ebs
npm run import:ebs -- --program=all
```

Category discovery:

The importer tries to discover the matching Naver Blog category from
`https://m.blog.naver.com/alone36?tab=1`. If discovery fails, set category
numbers manually:

```text
NAVER_BLOG_ID=alone36
EBS_IPTE_CATEGORY_NO=68
EBS_GWITE_CATEGORY_NO=
EBS_START_CATEGORY_NO=
```

Vercel Cron is configured in `vercel.json`:

```json
{
  "path": "/api/import-daily-ebs-all",
  "schedule": "0 20 * * 0-5"
}
```

Vercel schedules use UTC. `0 20 * * 0-5` runs Sunday-Friday at 20:00 UTC,
which is Monday-Saturday at 05:00 in Asia/Seoul.
