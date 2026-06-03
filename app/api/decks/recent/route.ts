import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RecentDeck = {
  id: string | number;
  code: string;
  name: string;
  created_at: string;
};

type RecentCard = {
  deck_id: string | number;
  front: string;
  back: string;
  position: number;
};

function clampDays(value: string | null): number {
  const parsed = Number(value || "7");

  if (!Number.isFinite(parsed)) {
    return 7;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 365);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = clampDays(url.searchParams.get("days"));
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: decks, error: decksError } = await supabaseAdmin
      .from("decks")
      .select("id, code, name, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .returns<RecentDeck[]>();

    if (decksError) {
      console.error("Recent decks lookup error:", decksError);

      return NextResponse.json(
        {
          error: "Failed to load recent decks",
          detail: decksError.message,
          hint: decksError.hint,
          code: decksError.code
        },
        { status: 500 }
      );
    }

    if (!decks || decks.length === 0) {
      return NextResponse.json({
        days,
        count: 0,
        decks: []
      });
    }

    const deckIds = decks.map((deck) => deck.id);

    const { data: cards, error: cardsError } = await supabaseAdmin
      .from("cards")
      .select("deck_id, front, back, position")
      .in("deck_id", deckIds)
      .order("position", { ascending: true })
      .returns<RecentCard[]>();

    if (cardsError) {
      console.error("Recent cards lookup error:", cardsError);

      return NextResponse.json(
        {
          error: "Failed to load recent cards",
          detail: cardsError.message,
          hint: cardsError.hint,
          code: cardsError.code
        },
        { status: 500 }
      );
    }

    const cardsByDeckId = new Map<string, { front: string; back: string }[]>();

    for (const card of cards || []) {
      const deckId = String(card.deck_id);
      const list = cardsByDeckId.get(deckId) || [];

      list.push({
        front: card.front,
        back: card.back
      });

      cardsByDeckId.set(deckId, list);
    }

    const result = decks.map((deck) => ({
      code: deck.code,
      deckName: deck.name,
      createdAt: deck.created_at,
      cards: cardsByDeckId.get(String(deck.id)) || []
    }));

    return NextResponse.json({
      days,
      count: result.length,
      decks: result
    });
  } catch (error) {
    console.error("Unexpected recent decks error:", error);

    return NextResponse.json(
      {
        error: "Unexpected server error",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
