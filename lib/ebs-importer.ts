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
  skippedDecks: string[];
  sections: Array<{
    key: SectionKey;
    deckName: string;
    cardCount: number;
    code?: string;
    skipped?: boolean;
  }>;
};

const BLOG_ID = "alone36";
const CATEGORY_NO = 68;
const CATEGORY_URL =
  "https://m.blog.naver.com/PostList.naver?blogId=alone36&categoryNo=68";
const MOBILE_BASE_URL = "https://m.blog.naver.com";

const sectionLabels: Record<SectionKey, string> = {
  BODY: "본문",
  WORD: "단어",
  PATT: "패턴",
  DIAL: "대화문"
};

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function importDailyEbsDecks(date = getSeoulDate()) {
  const post = await findPostForDate(date);

  if (!post) {
    throw new Error(`No EBS post found for ${date}`);
  }

  const html = await fetchText(post.sourceUrl);
  const lines = extractContentLines(html, date);
  const sections = buildSections(lines);
  const createdDecks: string[] = [];
  const skippedDecks: string[] = [];
  const savedSections: ImportDailyEbsResult["sections"] = [];

  for (const section of sections) {
    if (section.cards.length === 0) {
      console.log("Skipping empty EBS section:", section.key);
      continue;
    }

    const deckName = `입트영 ${date} ${section.label}`;
    const prefix = `IT${formatCompactDate(date)}-${section.key}-`;
    const existingDeck = await findExistingDeckByPrefix(prefix);

    if (existingDeck) {
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

    const code = await createUniqueDeckCode(prefix);
    await insertDeckWithCards({
      code,
      deckName,
      rawText: section.lines.join("\n"),
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
    (line) => /EBS\s*입트영/.test(line) && datePattern.test(line)
  );
  const scopedLines = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
  const oneMoreIndex = scopedLines.findIndex((line) =>
    /one\s+more\s+dialog/i.test(line)
  );

  return (oneMoreIndex >= 0 ? scopedLines.slice(0, oneMoreIndex) : scopedLines)
    .map(cleanLine)
    .filter(isUsefulLine);
}

function buildSections(lines: string[]) {
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
      cards: buildBodyCards(bodyLines)
    },
    {
      key: "WORD" as const,
      label: sectionLabels.WORD,
      lines: wordLines,
      cards: wordLines.map(parseEnglishKoreanLine).filter(Boolean) as Card[]
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

function buildBodyCards(lines: string[]) {
  const cards: Card[] = [];
  const contentLines = lines.filter((line) => !/^EBS\s*입트영/.test(line));
  const firstEnglishIndex = contentLines.findIndex((line) => !hasHangul(line));

  if (
    firstEnglishIndex >= 0 &&
    hasHangul(contentLines[firstEnglishIndex + 1] || "")
  ) {
    cards.push({
      front: contentLines[firstEnglishIndex],
      back: contentLines[firstEnglishIndex + 1]
    });
  }

  const fallbackBack =
    cards[0]?.back || contentLines.find((line) => hasHangul(line)) || "본문";

  for (const line of contentLines) {
    if (hasHangul(line) || cards.some((card) => card.front === line)) {
      continue;
    }

    if (line.length < 12) {
      continue;
    }

    cards.push({
      front: line,
      back: fallbackBack
    });
  }

  return dedupeCards(cards);
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

  return dedupeCards(cards);
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
              back: "대화문"
            }
          : null;
      })
      .filter(Boolean) as Card[]
  );
}

function parseEnglishKoreanLine(line: string): Card | null {
  const clean = line.replace(/^\d+\.\s*/, "").replace(/^\*\s*/, "").trim();
  const hangulMatch = clean.match(/[가-힣]/);

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

  const { error: cardsError } = await supabaseAdmin.from("cards").insert(
    input.cards.map((card, index) => ({
      deck_id: deck.id,
      front: card.front,
      back: card.back,
      position: index
    }))
  );

  if (cardsError) {
    throw new Error(`Failed to create EBS cards: ${cardsError.message}`);
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
    return /EBS\s*입트영/.test(title) && datePattern.test(title);
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

function cleanLine(line: string) {
  return line
    .replace(/^[-•·]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulLine(line: string) {
  if (!line || line === "​") {
    return false;
  }

  return ![
    "본문 바로가기",
    "본문 기타 기능",
    "공유하기",
    "URL 복사",
    "신고하기"
  ].includes(line);
}

function isKeyExpressionsHeading(line: string) {
  return /key\s+expressions|주요\s*표현|단어/i.test(line);
}

function isPatternHeading(line: string) {
  return /pattern\s+practice|패턴/i.test(line);
}

function isDialogueLine(line: string) {
  return /^[AB]\s+/.test(line) || /^[AB]\s*[:：]/.test(line);
}

function positiveOrEnd(index: number, end: number) {
  return index >= 0 ? index : end;
}

function hasHangul(text: string) {
  return /[가-힣]/.test(text);
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

function randomCode(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
