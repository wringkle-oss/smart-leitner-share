import { NextRequest, NextResponse } from "next/server";
import { normalizeDeckCode } from "@/lib/deck-code";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const params = await context.params;
    const normalizedCode = normalizeDeckCode(params.code);

    console.log("GET deck request:", normalizedCode);

    const { data: deck, error: deckError } = await supabaseAdmin
      .from("decks")
      .select("id, code, name")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (deckError) {
      console.error("Deck lookup error:", deckError);

      return NextResponse.json(
        {
          error: "Failed to load deck",
          detail: deckError.message,
          hint: deckError.hint,
          code: deckError.code
        },
        { status: 500 }
      );
    }

    if (!deck) {
      console.log("Deck not found:", normalizedCode);

      return NextResponse.json(
        {
          error: "Deck not found",
          requestedCode: normalizedCode
        },
        { status: 404 }
      );
    }

    console.log("Deck found:", {
      id: deck.id,
      code: deck.code,
      name: deck.name
    });

    const { data: cards, error: cardsError } = await supabaseAdmin
      .from("cards")
      .select("front, back, position")
      .eq("deck_id", deck.id)
      .order("position", { ascending: true });

    if (cardsError) {
      console.error("Cards lookup error:", cardsError);

      return NextResponse.json(
        {
          error: "Failed to load cards",
          detail: cardsError.message,
          hint: cardsError.hint,
          code: cardsError.code
        },
        { status: 500 }
      );
    }

    console.log("Cards found:", {
      deckId: deck.id,
      code: deck.code,
      cardCount: cards?.length ?? 0
    });

    return NextResponse.json({
      code: deck.code,
      deckName: deck.name,
      cards: (cards || []).map((card) => ({
        front: card.front,
        back: card.back
      }))
    });
  } catch (error) {
    console.error("Unexpected GET deck error:", error);

    return NextResponse.json(
      {
        error: "Unexpected server error",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
