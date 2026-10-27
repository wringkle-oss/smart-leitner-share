import { NextResponse } from "next/server";
import {
  getSeoulDate,
  importDailyEbsPrograms,
  normalizeProgramSelector
} from "@/lib/ebs-importer";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runImport({
    force: isTruthy(url.searchParams.get("force")),
    preview: isTruthy(url.searchParams.get("preview")),
    date: normalizeDate(url.searchParams.get("date")),
    program: normalizeProgramSelector(url.searchParams.get("program"))
  });
}

export async function POST(request: Request) {
  let force = false;
  let preview = false;
  let date: string | null = null;
  let program = normalizeProgramSelector(null);

  try {
    const body = await request.json();
    force = Boolean(body?.force);
    preview = Boolean(body?.preview);
    date = normalizeDate(body?.date);
    program = normalizeProgramSelector(body?.program);
  } catch {
    force = false;
  }

  return runImport({ force, preview, date, program });
}

async function runImport(options: {
  force: boolean;
  preview: boolean;
  date: string | null;
  program: ReturnType<typeof normalizeProgramSelector>;
}) {
  const date = options.date || getSeoulDate();

  try {
    const result = await importDailyEbsPrograms(date, options.program, {
      force: options.force,
      preview: options.preview
    });
    const status =
      "status" in result && result.status === "failed" ? 500 : 200;

    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Daily EBS import failed:", error);

    return NextResponse.json(
      {
        ok: false,
        date,
        program: options.program,
        sourceUrl: null,
        createdDecks: [],
        updatedDecks: [],
        skippedDecks: [],
        warnings: [],
        sections: [],
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// Accepts YYYY-MM-DD only; anything else falls back to today in Seoul.
function normalizeDate(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isTruthy(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}
