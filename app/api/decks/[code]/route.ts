import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeDeckCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> | { code: string } }
) {
  try {
    const resolvedParams =
      context.params instanceof Promise
        ? await context.params
        : context.params;

    const normalizedCode = normalizeDeckCode(resolvedParams.code);

    console.log("GET /api/decks/[code]", {
      rawCode: resolvedParams.code,
      normalizedCode
    });

    if (!normalizedCode) {
      return NextResponse.json(
        {
          error: "Missing deck code"
        },
        { status: 400 }
      );
    }

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
