import { NextResponse } from "next/server";
import { getSeoulDate, importDailyEbsPrograms } from "@/lib/ebs-importer";

export async function GET() {
  return runImportAll(false);
}

export async function POST(request: Request) {
  let force = false;

  try {
    const body = await request.json();
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  return runImportAll(force);
}

async function runImportAll(force: boolean) {
  const date = getSeoulDate();

  try {
    const result = await importDailyEbsPrograms(date, "all", { force });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Daily EBS all import failed:", error);

    return NextResponse.json(
      {
        ok: false,
        date,
        program: "all",
        results: [],
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
