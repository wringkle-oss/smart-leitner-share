import { supabaseAdmin } from "./supabase";

type Card = {
  front: string;
  back: string;
};

type SectionKey = "BODY" | "WORD" | "PATT" | "DIAL";

type EbsSection = {
  key: SectionKey;
  label: string;
  lines: string[];
  cards: Card[];
};

type ImportOptions = {
  force?: boolean;
};

type NaverPostListItem = {
  logNo?: string | number;
  title?: string;
  titleWithInspectMessage?: string;
  encodedTitle?: string;
};

type FoundPost = {
  logNo: string;
  title: string;
  sourceUrl: string;
};

type DeckRecord = {
  id: string | number;
  code: string;
  name: string;
};

export type ImportDailyEbsResult = {
  ok: boolean;
  date: string;
  sourceUrl: string | null;
  createdDecks: string[];
  updatedDecks: string[];
  skippedDecks: string[];
  sections: Array<{
    key: SectionKey;
    deckName: string;
    cardCount: number;
    code?: string;
    skipped?: boolean;
    updated?: boolean;
  }>;
};

const BLOG_ID = "alone36";
const CATEGORY_NO = 68;
const CATEGORY_URL =
  "https://m.blog.naver.com/PostList.naver?blogId=alone36&categoryNo=68";
const MOBILE_BASE_URL = "https://m.blog.naver.com";

const sectionLabels: Record<SectionKey, string> = {
  BODY: "\uBCF8\uBB38",
  WORD: "\uB2E8\uC5B4",
  PATT: "\uD328\uD134",
  DIAL: "\uB300\uD654\uBB38"
};

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function importDailyEbsDecks(
  date = getSeoulDate(),
  options: ImportOptions = {}
): Promise<ImportDailyEbsResult> {
  const post = await findPostForDate(date);

  if (!post) {
    throw new Error(`No EBS post found for ${date}`);
  }

  const html = await fetchText(post.sourceUrl);
  const lines = extractContentLines(html, date);
  const sections = await buildSections(lines);
  const createdDecks: string[] = [];
  const updatedDecks: string[] = [];
  const skippedDecks: string[] = [];
  const savedSections: ImportDailyEbsResult["sections"] = [];

  for (const section of sections) {
    if (section.cards.length === 0) {
      console.log("Skipping empty EBS section:", section.key);
      continue;
    }

    assertCardsAreComplete(section);

    const deckName = `\uC785\uD2B8\uC601 ${date} ${section.label}`;
    const prefix = `IT${formatCompactDate(date)}-${section.key}-`;
    const existingDeck = await findExistingDeckByPrefix(prefix);

    if (existingDeck && !options.force) {
      skippedDecks.push(existingDeck.code);
      savedSections.push({
        key: section.key,
        deckName: existingDeck.name,
        cardCount: section.cards.length,
        code: existingDeck.code,
        skipped: true
      });
      continue;
    }

    if (existingDeck && options.force) {
      await updateDeckWithCards(existingDeck.id, {
        deckName,
        rawText: cardsToText(section.cards),
        cards: section.cards
      });

      updatedDecks.push(existingDeck.code);
      savedSections.push({
        key: section.key,
        deckName,
        cardCount: section.cards.length,
        code: existingDeck.code,
        updated: true
      });
      continue;
    }

    const code = await createUniqueDeckCode(prefix);
    await insertDeckWithCards({
      code,
      deckName,
      rawText: cardsToText(section.cards),
      cards: section.cards
    });

    createdDecks.push(code);
    savedSections.push({
      key: section.key,
      deckName,
      cardCount: section.cards.length,
      code,
      skipped: false
    });
  }

  return {
    ok: true,
    date,
    sourceUrl: post.sourceUrl,
    createdDecks,
    updatedDecks,
    skippedDecks,
    sections: savedSections
  };
}

export function getSeoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function findPostForDate(date: string): Promise<FoundPost | null> {
  const titleMatcher = createTitleMatcher(date);
  const candidates = await fetchPostListCandidates();

  for (const item of candidates) {
    const title = decodeHtml(
      item.titleWithInspectMessage || item.title || item.encodedTitle || ""
    );

    if (!titleMatcher(title)) {
      continue;
    }

    const logNo = String(item.logNo || "").trim();

    if (!logNo) {
      continue;
    }

    return {
      logNo,
      title,
      sourceUrl: `${MOBILE_BASE_URL}/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}`
    };
  }

  return null;
}

async function fetchPostListCandidates() {
  const candidates: NaverPostListItem[] = [];
  const seenLogNos = new Set<string>();

  for (let page = 1; page <= 5; page += 1) {
    const apiUrl = `${MOBILE_BASE_URL}/api/blogs/${BLOG_ID}/category/${CATEGORY_NO}/post?itemCount=50&page=${page}`;

    try {
      const data = JSON.parse(await fetchText(apiUrl));
      const items = data?.result?.items || data?.result?.postList || [];

      for (const item of items) {
        const logNo = String(item?.logNo || "").trim();

        if (logNo && !seenLogNos.has(logNo)) {
          seenLogNos.add(logNo);
          candidates.push(item);
        }
      }
    } catch (error) {
      console.error("Naver post list API failed:", { page, error });
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  const html = await fetchText(CATEGORY_URL);
  const matches = html.matchAll(
    /PostView\.naver\?blogId=alone36&amp;logNo=(\d+)[\s\S]{0,500}?title[^>]*>([^<]+)/g
  );

  for (const match of matches) {
    candidates.push({
      logNo: match[1],
      title: decodeHtml(match[2])
    });
  }

  return candidates;
}

function extractContentLines(html: string, date: string) {
  const withoutScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const text = decodeHtml(
    withoutScript
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const datePattern = createDatePattern(date);
  const startIndex = lines.findIndex(
    (line) => /EBS\s*\uC785\uD2B8\uC601/.test(line) && datePattern.test(line)
  );
  const scopedLines = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
  const oneMoreIndex = scopedLines.findIndex((line) =>
    /one\s+more\s+dialog/i.test(line)
  );

  return (oneMoreIndex >= 0 ? scopedLines.slice(0, oneMoreIndex) : scopedLines)
    .map(cleanLine)
    .filter(isUsefulLine);
}

async function buildSections(lines: string[]) {
  const keyIndex = lines.findIndex(isKeyExpressionsHeading);
  const patternIndex = lines.findIndex(isPatternHeading);
  const dialogIndex = lines.findIndex((line, index) => {
    return index > Math.max(patternIndex, keyIndex) && isDialogueLine(line);
  });

  const bodyLines = lines.slice(0, positiveOrEnd(keyIndex, lines.length));
  const wordLines = lines.slice(
    keyIndex >= 0 ? keyIndex + 1 : lines.length,
    positiveOrEnd(patternIndex, lines.length)
  );
  const patternLines = lines.slice(
    patternIndex >= 0 ? patternIndex + 1 : lines.length,
    positiveOrEnd(dialogIndex, lines.length)
  );
  const dialogLines = dialogIndex >= 0 ? lines.slice(dialogIndex) : [];

  return [
    {
      key: "BODY" as const,
      label: sectionLabels.BODY,
      lines: bodyLines,
      cards: await buildBodyCards(bodyLines)
    },
    {
      key: "WORD" as const,
      label: sectionLabels.WORD,
      lines: wordLines,
      cards: normalizeWordPatternCards(
        wordLines
          .map(parseEnglishKoreanLine)
          .filter((card): card is Card => !!card)
      )
    },
    {
      key: "PATT" as const,
      label: sectionLabels.PATT,
      lines: patternLines,
      cards: buildPatternCards(patternLines)
    },
    {
      key: "DIAL" as const,
      label: sectionLabels.DIAL,
      lines: dialogLines,
      cards: buildDialogCards(dialogLines)
    }
  ] satisfies EbsSection[];
}

async function buildBodyCards(lines: string[]) {
  const sentences = splitBodySentences(lines);

  if (sentences.length === 0) {
    throw new Error("BODY section has no English sentences");
  }

  if (shouldTranslateBody()) {
    const translations = await translateBodySentences(sentences);

    if (translations.length !== sentences.length) {
      throw new Error(
        `BODY translation count mismatch: ${sentences.length} sentences, ${translations.length} translations`
      );
    }

    return sentences
      .map((sentence, index) => ({
        front: sentence.trim(),
        back: translations[index].trim()
      }))
      .filter((card) => card.front && card.back);
  }

  return sentences
    .map((sentence) => ({
      front: sentence.trim(),
      back: getUntranslatedBodyBack(sentence)
    }))
    .filter((card) => card.front && card.back !== undefined);
}

function splitBodySentences(lines: string[]) {
  return lines
    .filter((line) => !/^EBS\s*\uC785\uD2B8\uC601/.test(line))
    .filter((line) => !hasHangul(line))
    .filter((line) => /[.!?]/.test(line))
    .flatMap((line) => line.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 12);
}

export async function translateBodySentences(sentences: string[]) {
  if (sentences.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.TRANSLATION_API_KEY;

  if (!apiKey) {
    throw new Error(
      "BODY translation requires OPENAI_API_KEY or TRANSLATION_API_KEY"
    );
  }

  const model = process.env.OPENAI_TRANSLATION_MODEL || "gpt-4.1";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "developer",
          content:
            "Translate English study text into natural Korean for language-learning flashcards. Return only a JSON array of Korean strings. Keep the same number and order as the input sentences. Do not add explanations."
        },
        {
          role: "user",
          content: JSON.stringify(sentences)
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenAI translation failed: ${data?.error?.message || response.status}`
    );
  }

  const text = extractResponseText(data);
  const translations = parseJsonStringArray(text);

  if (translations.some((translation) => !hasHangul(translation))) {
    throw new Error("BODY translation returned at least one non-Korean line");
  }

  return translations;
}

function buildPatternCards(lines: string[]) {
  const cards: Card[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/^\d+\.\s*/, "").replace(/^\*\s*/, "");
    const direct = parseEnglishKoreanLine(line);

    if (direct) {
      cards.push(direct);
      continue;
    }

    const next = lines[index + 1]?.replace(/^\*\s*/, "");

    if (line && next && hasHangul(line) && !hasHangul(next)) {
      cards.push({
        front: next,
        back: line
      });
      index += 1;
    }
  }

  return normalizeWordPatternCards(cards);
}

function normalizeWordPatternCards(cards: Card[]) {
  return dedupeCards(
    cards
      .map(normalizeWordPatternCard)
      .filter((card) => card.front.trim() && card.back.trim())
  );
}

function normalizeWordPatternCard(card: Card): Card {
  const front = normalizeWordPatternFront(card.front);
  const back = normalizeWordPatternBack(front, card.back);

  return {
    front,
    back
  };
}

function normalizeWordPatternFront(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\brun a 10K\s+10km\b/i, "run a 10K")
    .replace(/\b10K\s+10km\b/i, "10K")
    .replace(/\s*\([^)]*$/g, "")
    .trim();
}

function normalizeWordPatternBack(front: string, value: string) {
  let back = value.replace(/\s+/g, " ").trim();
  const normalizedFront = front.toLowerCase();

  if (/^run a 10k$/.test(normalizedFront) && !/10\s*km|10k/i.test(back)) {
    back = back.startsWith("\uACBD\uC8FC")
      ? `10km ${back}`
      : `10km \uACBD\uC8FC\uC5D0 ${back.replace(/^\uC5D0\s*/, "")}`;
  }

  if (/^make it a habit to\s*~$/.test(normalizedFront) && !back.includes("~")) {
    return "~\uD558\uB294 \uAC83\uC744 \uC2B5\uAD00\uD654\uD558\uB2E4";
  }

  if (/^make it a goal to\s*~$/.test(normalizedFront) && !back.includes("~")) {
    return "~\uD558\uB294 \uAC83\uC744 \uBAA9\uD45C\uB85C \uC0BC\uB2E4";
  }

  if (/^keep someone busy$/.test(normalizedFront) && !back.includes("~")) {
    return normalizeRequiredObjectBack(back, "~\uC744/\uB97C ");
  }

  if (/^see an ad for\s*~$/.test(normalizedFront) && !back.includes("~")) {
    return back.startsWith("\uC5D0 \uB300\uD55C")
      ? `~${back}`
      : `~\uC5D0 \uB300\uD55C ${back}`;
  }

  if (front.includes("~") && !back.includes("~")) {
    back = normalizeTildeBack(back);
  }

  return back;
}

function normalizeTildeBack(back: string) {
  if (/^[\uC744\uB97C]\s*/.test(back)) {
    return `~${back}`;
  }

  if (/^\uC5D0\s*/.test(back)) {
    return `~${back}`;
  }

  if (/^\uCE58\uACE0\s*/.test(back)) {
    return `~${back}`;
  }

  if (/^\uC2E0\uCCAD\uD558\uB2E4/.test(back)) {
    return `~\uC744 ${back}`;
  }

  if (/^\uB4F1\uB85D\uD558\uB2E4/.test(back)) {
    return `~\uC5D0 ${back}`;
  }

  return back;
}

function normalizeRequiredObjectBack(back: string, placeholder: string) {
  if (/^[\uC744\uB97C]\s*/.test(back)) {
    return `${placeholder}${back.replace(/^[\uC744\uB97C]\s*/, "")}`;
  }

  return `${placeholder}${back}`;
}

function buildDialogCards(lines: string[]) {
  const english = lines.filter((line) => isDialogueLine(line) && !hasHangul(line));
  const korean = lines.filter((line) => isDialogueLine(line) && hasHangul(line));

  if (english.length > 0 && english.length === korean.length) {
    return english.map((line, index) => ({
      front: line,
      back: korean[index]
    }));
  }

  return dedupeCards(
    lines
      .map((line) => {
        const parsed = parseEnglishKoreanLine(line);

        if (parsed) {
          return parsed;
        }

        return isDialogueLine(line)
          ? {
              front: line,
              back: "\uB300\uD654\uBB38"
            }
          : null;
      })
      .filter(Boolean) as Card[]
  );
}

function parseEnglishKoreanLine(line: string): Card | null {
  const clean = line.replace(/^\d+\.\s*/, "").replace(/^\*\s*/, "").trim();
  const hangulMatch = clean.match(/[\uAC00-\uD7A3]/);

  if (!hangulMatch || hangulMatch.index === undefined) {
    return null;
  }

  const front = clean.slice(0, hangulMatch.index).trim();
  const back = clean.slice(hangulMatch.index).trim();

  if (!front || !back) {
    return null;
  }

  return {
    front,
    back
  };
}

async function findExistingDeckByPrefix(prefix: string) {
  const { data, error } = await supabaseAdmin
    .from("decks")
    .select("id, code, name")
    .like("code", `${prefix}%`)
    .limit(1)
    .maybeSingle<DeckRecord>();

  if (error) {
    throw new Error(`Failed to check existing EBS deck: ${error.message}`);
  }

  return data;
}

async function createUniqueDeckCode(prefix: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `${prefix}${randomCode(4)}`;
    const { data, error } = await supabaseAdmin
      .from("decks")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check generated EBS code: ${error.message}`);
    }

    if (!data) {
      return code;
    }
  }

  throw new Error(`Could not generate unique code for prefix ${prefix}`);
}

async function insertDeckWithCards(input: {
  code: string;
  deckName: string;
  rawText: string;
  cards: Card[];
}) {
  const { data: deck, error: deckError } = await supabaseAdmin
    .from("decks")
    .insert({
      code: input.code,
      name: input.deckName,
      raw_text: input.rawText
    })
    .select("id, code, name")
    .single<DeckRecord>();

  if (deckError || !deck) {
    throw new Error(`Failed to create EBS deck: ${deckError?.message}`);
  }

  await insertCards(deck.id, input.cards);
}

async function updateDeckWithCards(
  deckId: string | number,
  input: {
    deckName: string;
    rawText: string;
    cards: Card[];
  }
) {
  const { error: deckError } = await supabaseAdmin
    .from("decks")
    .update({
      name: input.deckName,
      raw_text: input.rawText
    })
    .eq("id", deckId);

  if (deckError) {
    throw new Error(`Failed to update EBS deck: ${deckError.message}`);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("cards")
    .delete()
    .eq("deck_id", deckId);

  if (deleteError) {
    throw new Error(`Failed to replace EBS cards: ${deleteError.message}`);
  }

  await insertCards(deckId, input.cards);
}

async function insertCards(deckId: string | number, cards: Card[]) {
  const { error } = await supabaseAdmin.from("cards").insert(
    cards.map((card, index) => ({
      deck_id: deckId,
      front: card.front,
      back: card.back,
      position: index
    }))
  );

  if (error) {
    throw new Error(`Failed to create EBS cards: ${error.message}`);
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      Referer: CATEGORY_URL
    },
    next: {
      revalidate: 0
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.text();
}

function createTitleMatcher(date: string) {
  const datePattern = createDatePattern(date);

  return (title: string) => {
    return /EBS\s*\uC785\uD2B8\uC601/.test(title) && datePattern.test(title);
  };
}

function createDatePattern(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new RegExp(`${year}\\s*[.]\\s*0?${month}\\s*[.]\\s*0?${day}`);
}

function formatCompactDate(date: string) {
  const [year, month, day] = date.split("-");

  return `${year.slice(2)}${month}${day}`;
}

function cardsToText(cards: Card[]) {
  return cards.map((card) => `${card.front}\t${card.back}`).join("\n");
}

function assertCardsAreComplete(section: EbsSection) {
  const invalid = section.cards.find((card) => {
    const allowEmptyBodyBack =
      section.key === "BODY" &&
      !shouldTranslateBody() &&
      getBodyBackMode() === "empty";

    return !card.front.trim() || (!allowEmptyBodyBack && !card.back.trim());
  });

  if (invalid) {
    throw new Error(`${section.key} contains an incomplete card`);
  }
}

function shouldTranslateBody() {
  return /^(1|true|yes)$/i.test(process.env.TRANSLATE_BODY || "false");
}

function getBodyBackMode() {
  return process.env.BODY_BACK_MODE === "empty" ? "empty" : "same";
}

function getUntranslatedBodyBack(sentence: string) {
  return getBodyBackMode() === "empty" ? "" : sentence.trim();
}

function cleanLine(line: string) {
  return line
    .replace(/^[-\u2022\u00b7]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulLine(line: string) {
  if (!line || line === "\u200b") {
    return false;
  }

  return ![
    "\uBCF8\uBB38 \uBC14\uB85C\uAC00\uAE30",
    "\uBCF8\uBB38 \uAE30\uD0C0 \uAE30\uB2A5",
    "\uACF5\uC720\uD558\uAE30",
    "URL \uBCF5\uC0AC",
    "\uC2E0\uACE0\uD558\uAE30"
  ].includes(line);
}

function isKeyExpressionsHeading(line: string) {
  return /key\s+expressions|\uC8FC\uC694\s*\uD45C\uD604|\uB2E8\uC5B4/i.test(
    line
  );
}

function isPatternHeading(line: string) {
  return /pattern\s+practice|\uD328\uD134/i.test(line);
}

function isDialogueLine(line: string) {
  return /^[AB]\s+/.test(line) || /^[AB]\s*[:\uFF1A]/.test(line);
}

function positiveOrEnd(index: number, end: number) {
  return index >= 0 ? index : end;
}

function hasHangul(text: string) {
  return /[\uAC00-\uD7A3]/.test(text);
}

function dedupeCards(cards: Card[]) {
  const seen = new Set<string>();

  return cards.filter((card) => {
    const key = `${card.front}\n${card.back}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractResponseText(data: unknown) {
  const maybeOutputText = (data as { output_text?: unknown }).output_text;

  if (typeof maybeOutputText === "string") {
    return maybeOutputText;
  }

  const output = (data as { output?: unknown }).output;

  if (!Array.isArray(output)) {
    throw new Error("OpenAI response did not include output text");
  }

  for (const item of output) {
    const content = (item as { content?: unknown }).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      const text = (part as { text?: unknown }).text;

      if (typeof text === "string") {
        return text;
      }
    }
  }

  throw new Error("OpenAI response did not include output text");
}

function parseJsonStringArray(value: string) {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(trimmed);

  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error("OpenAI translation response was not a JSON string array");
  }

  return parsed;
}

function randomCode(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
