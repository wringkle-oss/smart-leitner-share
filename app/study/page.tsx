"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { normalizeDeckCode } from "@/lib/deck-code";

type SharedCard = {
  front: string;
  back: string;
};

type SharedDeckResponse = {
  code: string;
  deckName: string;
  cards: SharedCard[];
};

type StudyCard = {
  id: string;
  front: string;
  back: string;
  level: number;
  knownCount: number;
  wrongCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
};

type WebDeckState = {
  code: string;
  deckName: string;
  cards: StudyCard[];
};

type StudyDisplayMode = "BOARD" | "SINGLE";
type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; restored: boolean }
  | { status: "error"; message: string };

const levels = [1, 2, 3, 4, 5];

export default function StudyPage() {
  const [deckCode, setDeckCode] = useState("");
  const [deck, setDeck] = useState<WebDeckState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [studyMode, setStudyMode] = useState<StudyDisplayMode>("BOARD");
  const [studyLevel, setStudyLevel] = useState(1);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [autoSpeakFront, setAutoSpeakFront] = useState(true);
  const [autoSpeakBack, setAutoSpeakBack] = useState(false);

  const levelCards = useMemo(() => {
    return deck?.cards.filter((card) => card.level === studyLevel) ?? [];
  }, [deck, studyLevel]);

  const selectedCard = useMemo(() => {
    return (
      levelCards.find((card) => card.id === selectedCardId) ??
      levelCards[0] ??
      null
    );
  }, [levelCards, selectedCardId]);

  const visibleCards = useMemo(() => {
    if (studyMode === "BOARD") {
      return levelCards.slice(0, 5);
    }

    return selectedCard ? [selectedCard] : [];
  }, [levelCards, selectedCard, studyMode]);

  const selectedVisibleCard = selectedCard ?? visibleCards[0] ?? null;
  const totalReviewed =
    deck?.cards.reduce(
      (total, card) => total + card.knownCount + card.wrongCount,
      0
    ) ?? 0;

  useEffect(() => {
    const next = levelCards[0]?.id ?? null;
    setSelectedCardId(next);
    setRevealedCardIds(new Set());

    if (next && autoSpeakFront) {
      const card = levelCards[0];
      speak(card.front, "en-US");
    }
  }, [studyLevel, deck?.code]);

  async function handleLoadDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeDeckCode(deckCode);

    if (!code) {
      setLoadState({ status: "error", message: "Deck Code is required." });
      return;
    }

    setDeckCode(code);
    setLoadState({ status: "loading" });
    setRevealedCardIds(new Set());

    const saved = loadDeckState(code);

    if (saved) {
      setDeck(saved);
      setStudyLevel(1);
      setSelectedCardId(saved.cards.find((card) => card.level === 1)?.id ?? null);
      setLoadState({ status: "success", restored: true });
      return;
    }

    try {
      const response = await fetch(`/api/decks/${encodeURIComponent(code)}`);
      const data = (await response.json()) as
        | SharedDeckResponse
        | { error?: string };

      if (!response.ok || !("cards" in data)) {
        const message = "error" in data ? data.error : null;
        throw new Error(message || "Failed to load deck.");
      }

      const nextDeck = createDeckState(data);
      setDeck(nextDeck);
      setStudyLevel(1);
      setSelectedCardId(nextDeck.cards[0]?.id ?? null);
      saveDeckState(nextDeck);
      setLoadState({ status: "success", restored: false });
    } catch (error) {
      setDeck(null);
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load deck."
      });
    }
  }

  function toggleCard(cardId: string) {
    const card =
      deck?.cards.find((item) => item.id === cardId) ?? selectedVisibleCard;

    setSelectedCardId(cardId);
    setRevealedCardIds((prev) => {
      const next = new Set(prev);
      const willReveal = !next.has(cardId);

      if (willReveal) {
        next.add(cardId);
        if (card && autoSpeakBack) {
          speak(card.back, "ko-KR");
        }
      } else {
        next.delete(cardId);
        if (card && autoSpeakFront) {
          speak(card.front, "en-US");
        }
      }

      return next;
    });
  }

  function gradeSelectedCard(result: "known" | "unknown") {
    const card = selectedVisibleCard;

    if (!deck || !card) {
      return;
    }

    const now = Date.now();
    const nextDeck: WebDeckState = {
      ...deck,
      cards: deck.cards.map((item) => {
        if (item.id !== card.id) {
          return item;
        }

        if (result === "known") {
          const nextLevel = Math.min(item.level + 1, 5);

          return {
            ...item,
            level: nextLevel,
            knownCount: item.knownCount + 1,
            lastReviewedAt: now,
            nextReviewAt: calculateNextReviewAt(nextLevel)
          };
        }

        return {
          ...item,
          level: 1,
          wrongCount: item.wrongCount + 1,
          lastReviewedAt: now,
          nextReviewAt: now + 10 * 60 * 1000
        };
      })
    };

    setDeck(nextDeck);
    saveDeckState(nextDeck);
    setRevealedCardIds((prev) => {
      const next = new Set(prev);
      next.delete(card.id);
      return next;
    });

    const nextCard =
      nextDeck.cards.find(
        (item) => item.level === studyLevel && item.id !== card.id
      ) ?? null;

    setSelectedCardId(nextCard?.id ?? null);

    if (nextCard && autoSpeakFront) {
      speak(nextCard.front, "en-US");
    }
  }

  function resetProgress() {
    if (!deck) {
      return;
    }

    const resetDeck: WebDeckState = {
      ...deck,
      cards: deck.cards.map((card) => ({
        ...card,
        level: 1,
        knownCount: 0,
        wrongCount: 0,
        lastReviewedAt: 0,
        nextReviewAt: 0
      }))
    };

    saveDeckState(resetDeck);
    setDeck(resetDeck);
    setStudyLevel(1);
    setSelectedCardId(resetDeck.cards[0]?.id ?? null);
    setRevealedCardIds(new Set());
  }

  return (
    <main className="study-shell">
      <section className="study-panel" aria-labelledby="study-title">
        <div className="study-topbar">
          <a className="text-link" href="/">
            Upload Deck
          </a>
        </div>

        <div className="intro study-intro">
          <p className="eyebrow">Smart Leitner Web</p>
          <h1 id="study-title">Study by deck code</h1>
        </div>

        <form className="study-load" onSubmit={handleLoadDeck}>
          <label htmlFor="study-deck-code">Deck Code</label>
          <div className="study-load-row">
            <input
              id="study-deck-code"
              value={deckCode}
              onChange={(event) =>
                setDeckCode(normalizeDeckCode(event.target.value))
              }
              placeholder="2HQYB5"
            />
            <button disabled={loadState.status === "loading"} type="submit">
              {loadState.status === "loading" ? "Loading..." : "Load Deck"}
            </button>
          </div>
        </form>

        {loadState.status === "error" && (
          <div className="error" role="alert">
            {loadState.message}
          </div>
        )}

        {deck && (
          <section className="study-workspace" aria-label="Study deck">
            <div className="deck-summary">
              <div>
                <span>Deck Name</span>
                <h2>{deck.deckName}</h2>
                <p>
                  {deck.code} · {deck.cards.length} cards · {totalReviewed} reviews
                </p>
              </div>
              <button className="secondary" type="button" onClick={resetProgress}>
                Reset progress
              </button>
            </div>

            {loadState.status === "success" && (
              <p className="study-note" role="status">
                {loadState.restored
                  ? "Saved progress loaded from this browser."
                  : "Deck loaded and saved to this browser."}
              </p>
            )}

            <div className="study-controls">
              <div className="control-group" aria-label="Study mode">
                <button
                  className={studyMode === "BOARD" ? "pill active" : "pill"}
                  type="button"
                  onClick={() => setStudyMode("BOARD")}
                >
                  Board
                </button>
                <button
                  className={studyMode === "SINGLE" ? "pill active" : "pill"}
                  type="button"
                  onClick={() => setStudyMode("SINGLE")}
                >
                  Single Card
                </button>
              </div>

              <div className="control-group" aria-label="Study level">
                {levels.map((level) => {
                  const count = deck.cards.filter(
                    (card) => card.level === level
                  ).length;

                  return (
                    <button
                      className={studyLevel === level ? "pill active" : "pill"}
                      key={level}
                      type="button"
                      onClick={() => setStudyLevel(level)}
                    >
                      Lv{level} <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="tts-row">
              <label>
                <input
                  checked={autoSpeakFront}
                  onChange={(event) => setAutoSpeakFront(event.target.checked)}
                  type="checkbox"
                />
                Front TTS
              </label>
              <label>
                <input
                  checked={autoSpeakBack}
                  onChange={(event) => setAutoSpeakBack(event.target.checked)}
                  type="checkbox"
                />
                Back TTS
              </label>
            </div>

            {visibleCards.length > 0 ? (
              <div
                className={
                  studyMode === "BOARD" ? "card-board" : "card-board single"
                }
              >
                {visibleCards.map((card) => {
                  const isRevealed = revealedCardIds.has(card.id);
                  const isSelected = selectedVisibleCard?.id === card.id;

                  return (
                    <button
                      className={
                        isSelected ? "study-card selected" : "study-card"
                      }
                      key={card.id}
                      type="button"
                      onClick={() => toggleCard(card.id)}
                    >
                      <span>{isRevealed ? "Back" : "Front"}</span>
                      <strong>{isRevealed ? card.back : card.front}</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-level">
                Lv{studyLevel} has no cards right now.
              </div>
            )}

            <div className="grade-actions">
              <button
                className="unknown-button"
                disabled={!selectedVisibleCard}
                type="button"
                onClick={() => gradeSelectedCard("unknown")}
              >
                Unknown
              </button>
              <button
                className="known-button"
                disabled={!selectedVisibleCard}
                type="button"
                onClick={() => gradeSelectedCard("known")}
              >
                Known
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function createDeckState(response: SharedDeckResponse): WebDeckState {
  return {
    code: response.code,
    deckName: response.deckName,
    cards: response.cards.map((card, index) => ({
      id: `${response.code}-${index}`,
      front: card.front,
      back: card.back,
      level: 1,
      knownCount: 0,
      wrongCount: 0,
      lastReviewedAt: 0,
      nextReviewAt: 0
    }))
  };
}

function saveDeckState(deck: WebDeckState) {
  localStorage.setItem(
    `smart-leitner-web-deck-${deck.code}`,
    JSON.stringify(deck)
  );
}

function loadDeckState(code: string): WebDeckState | null {
  const raw = localStorage.getItem(`smart-leitner-web-deck-${code}`);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WebDeckState;
  } catch {
    return null;
  }
}

function calculateNextReviewAt(level: number) {
  const now = Date.now();
  const minutesByLevel: Record<number, number> = {
    1: 10,
    2: 24 * 60,
    3: 3 * 24 * 60,
    4: 7 * 24 * 60,
    5: 14 * 24 * 60
  };

  return now + (minutesByLevel[level] ?? 10) * 60 * 1000;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
