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
    program: normalizeProgramSelector(url.searchParams.get("program"))
  });
}

export async function POST(request: Request) {
  let force = false;
  let program = normalizeProgramSelector(null);

  try {
    const body = await request.json();
    force = Boolean(body?.force);
    program = normalizeProgramSelector(body?.program);
  } catch {
    force = false;
  }

  return runImport({ force, program });
}

async function runImport(options: {
  force: boolean;
  program: ReturnType<typeof normalizeProgramSelector>;
}) {
  const date = getSeoulDate();

  try {
    const result = await importDailyEbsPrograms(date, options.program, {
      force: options.force
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

function isTruthy(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}
