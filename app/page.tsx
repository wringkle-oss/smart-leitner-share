"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  deckCodeValidationMessage,
  generateCode,
  isValidDeckCode,
  normalizeDeckCode
} from "@/lib/deck-code";

type UploadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; code: string; cardCount: number }
  | { status: "error"; message: string };

const sampleCards = `front\tback
hola\thello
gracias\tthank you
adios\tgoodbye`;

export default function Home() {
  const [code, setCode] = useState("");
  const [deckName, setDeckName] = useState("");
  const [rawText, setRawText] = useState("");
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (state.status !== "success") {
      return "";
    }

    return `${window.location.origin}/api/decks/${state.code}`;
  }, [state]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = normalizeDeckCode(code);

    if (!isValidDeckCode(normalizedCode)) {
      setState({ status: "error", message: deckCodeValidationMessage });
      return;
    }

    setState({ status: "loading" });
    setCopied(false);

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code: normalizedCode, deckName, rawText })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setState({
        status: "success",
        code: data.code,
        cardCount: data.cardCount
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed"
      });
    }
  }

  async function copyCode() {
    if (state.status !== "success") {
      return;
    }

    await navigator.clipboard.writeText(state.code);
    setCopied(true);
  }

  return (
    <main className="page-shell">
      <section className="upload-panel" aria-labelledby="page-title">
        <div className="intro">
          <p className="eyebrow">Smart Leitner Share</p>
          <h1 id="page-title">Upload flashcards by deck code</h1>
          <p>
            Create a unique Deck Code, add an optional display name, and paste
            two-column flashcard text for the Android app to download.
          </p>
        </div>

        <form className="deck-form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label htmlFor="deck-code">Deck Code</label>
            <div className="field-control">
              <div className="code-input-row">
                <input
                  id="deck-code"
                  value={code}
                  onChange={(event) =>
                    setCode(normalizeDeckCode(event.target.value))
                  }
                  placeholder="SPANISH01"
                  required
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setCode(generateCode())}
                >
                  Generate random code
                </button>
              </div>
              <p className="helper">
                A unique code you create. No spaces allowed. This is used to
                download your deck from the app.
              </p>
            </div>
          </div>

          <div className="field-row">
            <label htmlFor="deck-name">Deck Name</label>
            <div className="field-control">
              <input
                id="deck-name"
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                placeholder="Spanish Basic"
              />
              <p className="helper">
                Optional. This is the display name of the deck.
              </p>
            </div>
          </div>

          <div className="field-row text-row">
            <label htmlFor="flashcard-text">Flashcard Text</label>
            <div className="field-control">
              <textarea
                id="flashcard-text"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder={sampleCards}
                required
              />
              <p className="helper">
                Use 2-column text: front&lt;TAB&gt;back, CSV, or TSV.
              </p>
            </div>
          </div>

          <div className="actions">
            <button disabled={state.status === "loading"} type="submit">
              {state.status === "loading"
                ? "Uploading..."
                : "Upload Flashcards"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setRawText(sampleCards)}
            >
              Use sample
            </button>
          </div>
        </form>

        {state.status === "success" && (
          <div className="result" role="status">
            <p className="result-title">Upload complete!</p>
            <span>Deck Code</span>
            <strong>{state.code}</strong>
            <p>Use this code in the Android app to download your deck.</p>
            <div className="result-actions">
              <button type="button" onClick={copyCode}>
                {copied ? "Copied" : "Copy Code"}
              </button>
              <a href={shareUrl}>View deck JSON</a>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="error" role="alert">
            {state.message}
          </div>
        )}
      </section>
    </main>
  );
}
