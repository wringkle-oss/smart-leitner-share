import { NextRequest, NextResponse } from "next/server";
import { getDeck } from "@/lib/decks";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const deck = await getDeck(code);

    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    return NextResponse.json(deck);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not download deck."
      },
      { status: 500 }
    );
  }
}
