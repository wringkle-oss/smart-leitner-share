import { NextRequest, NextResponse } from "next/server";
import { parseCards } from "@/lib/cards";
import { isValidDeckCode, normalizeDeckCode } from "@/lib/deck-code";
import { createDeck, DeckCodeConflictError } from "@/lib/decks";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body.code ?? "");
    const normalizedCode = normalizeDeckCode(code);
    const deckName = String(body.deckName ?? "");
    const rawText = String(body.rawText ?? "");

    if (!isValidDeckCode(normalizedCode)) {
      return NextResponse.json({ error: "Invalid deck code" }, { status: 400 });
    }

    const cards = parseCards(rawText);
    const savedCode = await createDeck({
      code: normalizedCode,
      deckName,
      rawText,
      cards
    });

    return NextResponse.json({
      code: savedCode,
      deckName: deckName.trim() || savedCode,
      cardCount: cards.length
    });
  } catch (error) {
    if (error instanceof DeckCodeConflictError) {
      return NextResponse.json(
        { error: "Deck code already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save deck."
      },
      { status: 400 }
    );
  }
}
