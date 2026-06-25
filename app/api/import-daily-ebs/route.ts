import { NextResponse } from "next/server";
import { getSeoulDate, importDailyEbsDecks } from "@/lib/ebs-importer";

export async function GET(request: Request) {
  const url = new URL(request.url);

  return runImport({
    force: isTruthy(url.searchParams.get("force"))
  });
}

export async function POST(request: Request) {
  let force = false;

  try {
    const body = await request.json();
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  return runImport({ force });
}

async function runImport(options: { force: boolean }) {
  const date = getSeoulDate();

  try {
    const result = await importDailyEbsDecks(date, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Daily EBS import failed:", error);

    return NextResponse.json(
      {
        ok: false,
        date,
        sourceUrl: null,
        createdDecks: [],
        updatedDecks: [],
        skippedDecks: [],
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

function isTruthy(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}
