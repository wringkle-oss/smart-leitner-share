import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Card } from "./cards";
import { normalizeDeckCode } from "./deck-code";
import {
  getSupabaseAdmin,
  type CardRecord,
  type DeckRecord
} from "./supabase";

export type PublicDeck = {
  code: string;
  deckName: string;
  cards: Card[];
};

const localDataPath = path.join(process.cwd(), ".data", "decks.json");

export class DeckCodeConflictError extends Error {
  constructor() {
    super("Deck code already exists");
    this.name = "DeckCodeConflictError";
  }
}

export async function createDeck(deck: {
  code: string;
  deckName: string;
  rawText: string;
  cards: Card[];
}) {
  const normalizedCode = normalizeDeckCode(deck.code);
  const normalizedDeckName = deck.deckName.trim() || normalizedCode;

  if (deck.cards.length === 0) {
    throw new Error("At least one card is required.");
  }

  await insertDeck({
    code: normalizedCode,
    deckName: normalizedDeckName,
    rawText: deck.rawText,
    cards: deck.cards
  });

  return normalizedCode;
}

export async function getDeck(code: string): Promise<PublicDeck | null> {
  const cleanCode = normalizeDeckCode(code);

  if (!cleanCode) {
    return null;
  }

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("id,code,name")
      .eq("code", cleanCode)
      .single<Pick<DeckRecord, "id" | "code" | "name">>();

    if (deckError || !deck) {
      return null;
    }

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("front,back,position")
      .eq("deck_id", deck.id)
      .order("position", { ascending: true })
      .returns<CardRecord[]>();

    if (cardsError) {
      throw new Error(cardsError.message);
    }

    return {
      code: deck.code,
      deckName: deck.name,
      cards: (cards ?? []).map((card) => ({
        front: card.front,
        back: card.back
      }))
    };
  }

  const decks = await readLocalDecks();
  const deck = decks[cleanCode];

  if (!deck) {
    return null;
  }

  return {
    code: cleanCode,
    deckName: deck.deckName,
    cards: deck.cards
  };
}

async function insertDeck(deck: {
  code: string;
  deckName: string;
  rawText: string;
  cards: Card[];
}) {
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: existingDeck, error: existingError } = await supabase
      .from("decks")
      .select("code")
      .eq("code", deck.code)
      .maybeSingle<Pick<DeckRecord, "code">>();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingDeck) {
      throw new DeckCodeConflictError();
    }

    const { data: createdDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        code: deck.code,
        name: deck.deckName,
        raw_text: deck.rawText
      })
      .select("id, code, name")
      .single<Pick<DeckRecord, "id" | "code" | "name">>();

    if (deckError) {
      if (deckError.code === "23505") {
        throw new DeckCodeConflictError();
      }

      throw new Error(deckError.message);
    }

    const { error: cardsError } = await supabase.from("cards").insert(
      deck.cards.map((card, index) => ({
        deck_id: createdDeck.id,
        front: card.front,
        back: card.back,
        position: index
      }))
    );

    if (cardsError) {
      throw new Error(cardsError.message);
    }

    return;
  }

  const decks = await readLocalDecks();

  if (decks[deck.code]) {
    throw new DeckCodeConflictError();
  }

  decks[deck.code] = {
    code: deck.code,
    deckName: deck.deckName,
    cards: deck.cards,
    rawText: deck.rawText,
    createdAt: new Date().toISOString()
  };

  await mkdir(path.dirname(localDataPath), { recursive: true });
  await writeFile(localDataPath, JSON.stringify(decks, null, 2));
}

async function readLocalDecks(): Promise<
  Record<string, PublicDeck & { rawText: string; createdAt: string }>
> {
  try {
    return JSON.parse(await readFile(localDataPath, "utf8"));
  } catch {
    return {};
  }
}
