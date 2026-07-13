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

export type StudyDisplayMode = "BOARD" | "SINGLE";
export type StudyDirection = "FRONT_TO_BACK" | "BACK_TO_FRONT";
export type TtsLanguage =
  | "en-US"
  | "ko-KR"
  | "ja-JP"
  | "es-ES"
  | "es-MX"
  | "off";

export type WebStudySettings = {
  cardFontSize: number;
  studyDisplayMode: StudyDisplayMode;
  studyDirection: StudyDirection;
  randomOrder: boolean;
  frontTtsEnabled: boolean;
  backTtsEnabled: boolean;
  frontLanguage: TtsLanguage;
  backLanguage: TtsLanguage;
  unknownOnlyOnLv5: boolean;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; restored: boolean }
  | { status: "error"; message: string };

type StudySettingsPanelProps = {
  settings: WebStudySettings;
  onChange: (next: Partial<WebStudySettings>) => void;
  onClose: () => void;
};

const SETTINGS_KEY = "smart-leitner-web-settings";
const levels = [1, 2, 3, 4, 5];

export const defaultWebStudySettings: WebStudySettings = {
  cardFontSize: 32,
  studyDisplayMode: "BOARD",
  studyDirection: "FRONT_TO_BACK",
  randomOrder: false,
  frontTtsEnabled: true,
  backTtsEnabled: false,
  frontLanguage: "en-US",
  backLanguage: "ko-KR",
  unknownOnlyOnLv5: false
};

export default function StudyPage() {
  const [deckCode, setDeckCode] = useState("");
  const [deck, setDeck] = useState<WebDeckState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [settings, setSettings] = useState<WebStudySettings>(
    defaultWebStudySettings
  );
  const [studyLevel, setStudyLevel] = useState(1);
  const [orderedLevelCards, setOrderedLevelCards] = useState<StudyCard[]>([]);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const selectedCard = useMemo(() => {
    return (
      orderedLevelCards.find((card) => card.id === selectedCardId) ??
      orderedLevelCards[0] ??
      null
    );
  }, [orderedLevelCards, selectedCardId]);

  const visibleCards = useMemo(() => {
    if (settings.studyDisplayMode === "BOARD") {
      return orderedLevelCards.slice(0, 5);
    }

    return selectedCard ? [selectedCard] : [];
  }, [orderedLevelCards, selectedCard, settings.studyDisplayMode]);

  const selectedVisibleCard = selectedCard ?? visibleCards[0] ?? null;
  const unknownEnabled = !settings.unknownOnlyOnLv5 || studyLevel === 5;
  const totalReviewed =
    deck?.cards.reduce(
      (total, card) => total + card.knownCount + card.wrongCount,
      0
    ) ?? 0;

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    if (!deck) {
      setOrderedLevelCards([]);
      setSelectedCardId(null);
      setRevealedCardIds(new Set());
      return;
    }

    const ordered = orderLevelCards(deck.cards, studyLevel, settings.randomOrder);
    setOrderedLevelCards(ordered);
    setSelectedCardId(ordered[0]?.id ?? null);
    setRevealedCardIds(new Set());

    if (ordered[0] && shouldSpeakPrompt(settings)) {
      speak(getPromptText(ordered[0], settings), getPromptLanguage(settings));
    }
  }, [deck?.code, studyLevel, settings.randomOrder]);

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

  function updateSettings(next: Partial<WebStudySettings>) {
    setSettings((prev) => {
      const updated = {
        ...prev,
        ...next,
        cardFontSize: clampFontSize(next.cardFontSize ?? prev.cardFontSize)
      };
      saveSettings(updated);
      return updated;
    });
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
        if (card && shouldSpeakAnswer(settings)) {
          speak(getAnswerText(card, settings), getAnswerLanguage(settings));
        }
      } else {
        next.delete(cardId);
        if (card && shouldSpeakPrompt(settings)) {
          speak(getPromptText(card, settings), getPromptLanguage(settings));
        }
      }

      return next;
    });
  }

  function gradeSelectedCard(result: "known" | "unknown") {
    const card = selectedVisibleCard;

    if (!deck || !card || (result === "unknown" && !unknownEnabled)) {
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

    const nextOrderedCards = orderedLevelCards.filter(
      (item) => item.id !== card.id
    );
    const nextCard = nextOrderedCards[0] ?? null;

    setDeck(nextDeck);
    saveDeckState(nextDeck);
    setOrderedLevelCards(nextOrderedCards);
    setSelectedCardId(nextCard?.id ?? null);
    setRevealedCardIds((prev) => {
      const next = new Set(prev);
      next.delete(card.id);
      return next;
    });

    if (nextCard && shouldSpeakPrompt(settings)) {
      speak(getPromptText(nextCard, settings), getPromptLanguage(settings));
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
    const ordered = orderLevelCards(resetDeck.cards, 1, settings.randomOrder);

    saveDeckState(resetDeck);
    setDeck(resetDeck);
    setStudyLevel(1);
    setOrderedLevelCards(ordered);
    setSelectedCardId(ordered[0]?.id ?? null);
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
                  {deck.code} - {deck.cards.length} cards - {totalReviewed}{" "}
                  reviews
                </p>
              </div>
              <div className="deck-actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setShowSettings(true)}
                >
                  Settings
                </button>
                <button className="secondary" type="button" onClick={resetProgress}>
                  Reset progress
                </button>
              </div>
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
                  className={
                    settings.studyDisplayMode === "BOARD"
                      ? "pill active"
                      : "pill"
                  }
                  type="button"
                  onClick={() => updateSettings({ studyDisplayMode: "BOARD" })}
                >
                  Board
                </button>
                <button
                  className={
                    settings.studyDisplayMode === "SINGLE"
                      ? "pill active"
                      : "pill"
                  }
                  type="button"
                  onClick={() => updateSettings({ studyDisplayMode: "SINGLE" })}
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
                  checked={settings.frontTtsEnabled}
                  onChange={(event) =>
                    updateSettings({ frontTtsEnabled: event.target.checked })
                  }
                  type="checkbox"
                />
                Front TTS
              </label>
              <label>
                <input
                  checked={settings.backTtsEnabled}
                  onChange={(event) =>
                    updateSettings({ backTtsEnabled: event.target.checked })
                  }
                  type="checkbox"
                />
                Back TTS
              </label>
            </div>

            {visibleCards.length > 0 ? (
              <div
                className={
                  settings.studyDisplayMode === "BOARD"
                    ? "card-board"
                    : "card-board single"
                }
              >
                {visibleCards.map((card) => {
                  const isRevealed = revealedCardIds.has(card.id);
                  const isSelected = selectedVisibleCard?.id === card.id;
                  const displayText = isRevealed
                    ? getAnswerText(card, settings)
                    : getPromptText(card, settings);

                  return (
                    <button
                      className={
                        isSelected ? "study-card selected" : "study-card"
                      }
                      key={card.id}
                      type="button"
                      onClick={() => toggleCard(card.id)}
                    >
                      <span>{isRevealed ? "Answer" : "Prompt"}</span>
                      <div
                        className="study-card-text"
                        style={{ fontSize: `${settings.cardFontSize}px` }}
                      >
                        {displayText}
                      </div>
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
                disabled={!selectedVisibleCard || !unknownEnabled}
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

        {showSettings && (
          <StudySettingsPanel
            settings={settings}
            onChange={updateSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </section>
    </main>
  );
}

function StudySettingsPanel({
  settings,
  onChange,
  onClose
}: StudySettingsPanelProps) {
  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Study Settings</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="settings-section">
          <h3>Card</h3>
          <label className="setting-row">
            <span>Card font size</span>
            <input
              max={64}
              min={12}
              onChange={(event) =>
                onChange({ cardFontSize: Number(event.target.value) })
              }
              type="range"
              value={settings.cardFontSize}
            />
            <strong>{settings.cardFontSize}px</strong>
          </label>
        </section>

        <section className="settings-section">
          <h3>Study Mode</h3>
          <div className="button-row">
            <button
              className={
                settings.studyDisplayMode === "BOARD" ? "active" : ""
              }
              type="button"
              onClick={() => onChange({ studyDisplayMode: "BOARD" })}
            >
              Board
            </button>
            <button
              className={
                settings.studyDisplayMode === "SINGLE" ? "active" : ""
              }
              type="button"
              onClick={() => onChange({ studyDisplayMode: "SINGLE" })}
            >
              Single Card
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Card Direction</h3>
          <div className="button-row">
            <button
              className={
                settings.studyDirection === "FRONT_TO_BACK" ? "active" : ""
              }
              type="button"
              onClick={() => onChange({ studyDirection: "FRONT_TO_BACK" })}
            >
              Front to Back
            </button>
            <button
              className={
                settings.studyDirection === "BACK_TO_FRONT" ? "active" : ""
              }
              type="button"
              onClick={() => onChange({ studyDirection: "BACK_TO_FRONT" })}
            >
              Back to Front
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Order</h3>
          <label className="check-row">
            <input
              checked={settings.randomOrder}
              onChange={(event) =>
                onChange({ randomOrder: event.target.checked })
              }
              type="checkbox"
            />
            <span>Random Order</span>
          </label>
        </section>

        <section className="settings-section">
          <h3>TTS</h3>
          <label className="check-row">
            <input
              checked={settings.frontTtsEnabled}
              onChange={(event) =>
                onChange({ frontTtsEnabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Front TTS</span>
          </label>
          <label className="check-row">
            <input
              checked={settings.backTtsEnabled}
              onChange={(event) =>
                onChange({ backTtsEnabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Back TTS</span>
          </label>
          <label className="setting-row">
            <span>Front language</span>
            <select
              onChange={(event) =>
                onChange({ frontLanguage: event.target.value as TtsLanguage })
              }
              value={settings.frontLanguage}
            >
              <option value="en-US">English</option>
              <option value="ko-KR">Korean</option>
              <option value="ja-JP">Japanese</option>
              <option value="es-ES">Spanish Spain</option>
              <option value="es-MX">Spanish Mexico</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="setting-row">
            <span>Back language</span>
            <select
              onChange={(event) =>
                onChange({ backLanguage: event.target.value as TtsLanguage })
              }
              value={settings.backLanguage}
            >
              <option value="ko-KR">Korean</option>
              <option value="en-US">English</option>
              <option value="ja-JP">Japanese</option>
              <option value="es-ES">Spanish Spain</option>
              <option value="es-MX">Spanish Mexico</option>
              <option value="off">Off</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>Unknown Button</h3>
          <label className="check-row">
            <input
              checked={settings.unknownOnlyOnLv5}
              onChange={(event) =>
                onChange({ unknownOnlyOnLv5: event.target.checked })
              }
              type="checkbox"
            />
            <span>Use Unknown only on Lv5</span>
          </label>
        </section>
      </div>
    </div>
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

function loadSettings(): WebStudySettings {
  if (typeof window === "undefined") {
    return defaultWebStudySettings;
  }

  const raw = localStorage.getItem(SETTINGS_KEY);

  if (!raw) {
    return defaultWebStudySettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WebStudySettings>;

    return {
      ...defaultWebStudySettings,
      ...parsed,
      cardFontSize: clampFontSize(
        parsed.cardFontSize ?? defaultWebStudySettings.cardFontSize
      )
    };
  } catch {
    return defaultWebStudySettings;
  }
}

function saveSettings(settings: WebStudySettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function clampFontSize(value: number) {
  return Math.min(Math.max(Number(value), 12), 64);
}

function orderLevelCards(
  cards: StudyCard[],
  studyLevel: number,
  randomOrder: boolean
) {
  const levelCards = cards.filter((card) => card.level === studyLevel);

  if (randomOrder) {
    return shuffleCards(levelCards);
  }

  return [...levelCards].sort((a, b) => a.id.localeCompare(b.id));
}

function shuffleCards<T>(cards: T[]): T[] {
  const copy = [...cards];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function getPromptText(card: StudyCard, settings: WebStudySettings) {
  return settings.studyDirection === "FRONT_TO_BACK" ? card.front : card.back;
}

function getAnswerText(card: StudyCard, settings: WebStudySettings) {
  return settings.studyDirection === "FRONT_TO_BACK" ? card.back : card.front;
}

function getPromptLanguage(settings: WebStudySettings): TtsLanguage {
  return settings.studyDirection === "FRONT_TO_BACK"
    ? settings.frontLanguage
    : settings.backLanguage;
}

function getAnswerLanguage(settings: WebStudySettings): TtsLanguage {
  return settings.studyDirection === "FRONT_TO_BACK"
    ? settings.backLanguage
    : settings.frontLanguage;
}

function shouldSpeakPrompt(settings: WebStudySettings) {
  return settings.studyDirection === "FRONT_TO_BACK"
    ? settings.frontTtsEnabled
    : settings.backTtsEnabled;
}

function shouldSpeakAnswer(settings: WebStudySettings) {
  return settings.studyDirection === "FRONT_TO_BACK"
    ? settings.backTtsEnabled
    : settings.frontTtsEnabled;
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

function speak(text: string, lang: TtsLanguage) {
  if (
    lang === "off" ||
    typeof window === "undefined" ||
    !window.speechSynthesis ||
    !text.trim()
  ) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
