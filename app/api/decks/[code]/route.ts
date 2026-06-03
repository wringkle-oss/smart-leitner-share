import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const normalizedCode = String(code || "").trim().toUpperCase();

    const { data: deck, error: deckError } = await supabaseAdmin
      .from("decks")
      .select("id, code, name")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (deckError) {
      console.error(deckError);

      return NextResponse.json(
        { error: "Failed to load deck" },
        { status: 500 }
      );
    }

    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    const { data: cards, error: cardsError } = await supabaseAdmin
      .from("cards")
      .select("front, back, position")
      .eq("deck_id", deck.id)
      .order("position", { ascending: true });

    if (cardsError) {
      console.error(cardsError);

      return NextResponse.json(
        { error: "Failed to load cards" },
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
    console.error(error);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
