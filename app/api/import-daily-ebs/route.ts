import { NextResponse } from "next/server";
import { getSeoulDate, importDailyEbsDecks } from "@/lib/ebs-importer";

export async function GET() {
  return runImport();
}

export async function POST() {
  return runImport();
}

async function runImport() {
  const date = getSeoulDate();

  try {
    const result = await importDailyEbsDecks(date);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Daily EBS import failed:", error);

    return NextResponse.json(
      {
        ok: false,
        date,
        sourceUrl: null,
        createdDecks: [],
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
