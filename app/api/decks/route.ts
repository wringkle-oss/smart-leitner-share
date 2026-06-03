import { NextRequest, NextResponse } from "next/server";
import { parseCards } from "@/lib/cards";
import {
  deckCodeValidationMessage,
  deckCodeRegex,
  normalizeDeckCode
} from "@/lib/deck-code";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const normalizedCode = normalizeDeckCode(body.code);
    const rawDeckName = String(body.deckName || "").trim();
    const rawText = String(body.rawText || "");

    if (!deckCodeRegex.test(normalizedCode)) {
      return NextResponse.json(
        { error: deckCodeValidationMessage },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Flashcard text is required" },
        { status: 400 }
      );
    }

    const cards = parseCards(rawText);

    if (cards.length === 0) {
      return NextResponse.json(
        { error: "No valid cards found. Use front<TAB>back, CSV, or TSV." },
        { status: 400 }
      );
    }

    const { data: existingDeck, error: existingError } = await supabaseAdmin
      .from("decks")
      .select("id")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);

      return NextResponse.json(
        { error: "Failed to check deck code" },
        { status: 500 }
      );
    }

    if (existingDeck) {
      return NextResponse.json(
        { error: "Deck code already exists" },
        { status: 409 }
      );
    }

    const deckName = rawDeckName || normalizedCode;

    const { data: deck, error: deckError } = await supabaseAdmin
      .from("decks")
      .insert({
        code: normalizedCode,
        name: deckName,
        raw_text: rawText
      })
      .select("id, code, name")
      .single();

    if (deckError || !deck) {
      console.error(deckError);

      return NextResponse.json(
        { error: "Failed to create deck" },
        { status: 500 }
      );
    }

    console.log("Created deck:", {
      id: deck.id,
      code: deck.code,
      name: deck.name
    });

    const cardRows = cards.map((card, index) => ({
      deck_id: deck.id,
      front: card.front,
      back: card.back,
      position: index
    }));

    const { error: cardsError } = await supabaseAdmin
      .from("cards")
      .insert(cardRows);

    if (cardsError) {
      console.error(cardsError);

      return NextResponse.json(
        { error: "Failed to save cards" },
        { status: 500 }
      );
    }

    console.log("Created cards:", {
      deckId: deck.id,
      code: deck.code,
      cardCount: cards.length
    });

    return NextResponse.json({
      code: deck.code,
      deckName: deck.name,
      cardCount: cards.length
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
