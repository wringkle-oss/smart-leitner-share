import { supabaseAdmin } from "./supabase";

type Card = {
  front: string;
  back: string;
};

type ProgramId = "ipte" | "gwite" | "start";
export type ProgramSelector = ProgramId | "all";

type SectionKey =
  | "BODY"
  | "WORD"
  | "PATT"
  | "DIAL"
  | "SCRIPT"
  | "EXPR"
  | "CLOZE"
  | "PRACTICE";

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

type ImportDebug = {
  program: ProgramId;
  searchedCategoryNo: number[];
  categorySource: "env" | "discovered" | "default" | "none";
  candidateTitlePatterns: string[];
  foundPostTitles: string[];
  matchedPostTitle: string | null;
  sourceUrl: string | null;
  parsedSectionNames: SectionKey[];
  deckCardCounts: Record<string, number>;
};

type DeckRecord = {
  id: string | number;
  code: string;
  name: string;
};

type EbsProgram = {
  id: ProgramId;
  programName: string;
  deckPrefix: string;
  categoryEnvKey: string;
  defaultCategoryNo?: number;
  categoryHints: RegExp[];
  titlePatterns: RegExp[];
  sectionLabels: Record<string, string>;
  buildSections(lines: string[]): Promise<EbsSection[]>;
};

export type ImportDailyEbsResult = {
  ok: boolean;
  status: "created" | "updated" | "skipped" | "not_found" | "failed";
  date: string;
  program: ProgramId;
  programName: string;
  sourceUrl: string | null;
  createdDecks: string[];
  updatedDecks: string[];
  skippedDecks: string[];
  warnings: string[];
  sections: Array<{
    key: SectionKey;
    deckName: string;
    cardCount: number;
    code?: string;
    skipped?: boolean;
    updated?: boolean;
  }>;
  debug: ImportDebug;
  error?: string;
};

export type ImportAllEbsResult = {
  ok: boolean;
  date: string;
  program: "all";
  results: ImportDailyEbsResult[];
};

const DEFAULT_BLOG_ID = "alone36";
const MOBILE_BASE_URL = "https://m.blog.naver.com";

const ipteLabels: Record<string, string> = {
  BODY: "\uBCF8\uBB38",
  WORD: "\uB2E8\uC5B4",
  PATT: "\uD328\uD134",
  DIAL: "\uB300\uD654\uBB38"
};

const gwiteLabels: Record<string, string> = {
  SCRIPT: "\uC2A4\uD06C\uB9BD\uD2B8",
  WORD: "\uB2E8\uC5B4",
  EXPR: "\uD45C\uD604",
  CLOZE: "\uBE48\uCE78"
};

const startLabels: Record<string, string> = {
  DIAL: "\uB300\uD654\uBB38",
  WORD: "\uB2E8\uC5B4",
  PATT: "\uD328\uD134",
  PRACTICE: "\uC5F0\uC2B5"
};

const EBS_PROGRAMS: Record<ProgramId, EbsProgram> = {
  ipte: {
    id: "ipte",
    programName: "\uC785\uD2B8\uC601",
    deckPrefix: "IT",
    categoryEnvKey: "EBS_IPTE_CATEGORY_NO",
    defaultCategoryNo: 68,
    categoryHints: [
      /\uC785\uD2B8\uC601/i,
      /\uC785\uC774\s*\uD2B8\uC774\uB294\s*\uC601\uC5B4/i
    ],
    titlePatterns: [
      /EBS\s*\uC785\uD2B8\uC601/i,
      /\uC785\uC774\s*\uD2B8\uC774\uB294\s*\uC601\uC5B4/i
    ],
    sectionLabels: ipteLabels,
    buildSections: buildIpteSections
  },
  gwite: {
    id: "gwite",
    programName: "\uADC0\uD2B8\uC601",
    deckPrefix: "GTE",
    categoryEnvKey: "EBS_GWITE_CATEGORY_NO",
    categoryHints: [
      /\uADC0\uD2B8\uC601/i,
      /\uADC0\uAC00\s*\uD2B8\uC774\uB294\s*\uC601\uC5B4/i
    ],
    titlePatterns: [
      /EBS\s*\uADC0\uD2B8\uC601/i,
      /\uADC0\uAC00\s*\uD2B8\uC774\uB294\s*\uC601\uC5B4/i
    ],
    sectionLabels: gwiteLabels,
    buildSections: buildGwiteSections
  },
  start: {
    id: "start",
    programName: "Start English",
    deckPrefix: "SE",
    categoryEnvKey: "EBS_START_CATEGORY_NO",
    categoryHints: [/start\s*english/i, /\uC2A4\uD0C0\uD2B8\s*\uC789\uAE00\uB9AC\uC2DC/i],
    titlePatterns: [/EBS\s*start\s*english/i, /start\s*english/i, /\uC2A4\uD0C0\uD2B8\s*\uC789\uAE00\uB9AC\uC2DC/i],
    sectionLabels: startLabels,
    buildSections: buildStartSections
  }
};

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function importDailyEbsDecks(
  date = getSeoulDate(),
  options: ImportOptions & { program?: ProgramId } = {}
): Promise<ImportDailyEbsResult> {
  const program = EBS_PROGRAMS[options.program || "ipte"];

  return importDailyEbsProgram(program, date, options);
}

export async function importDailyEbsPrograms(
  date = getSeoulDate(),
  selector: ProgramSelector = "ipte",
  options: ImportOptions = {}
): Promise<ImportDailyEbsResult | ImportAllEbsResult> {
  if (selector !== "all") {
    return importDailyEbsDecks(date, {
      ...options,
      program: selector
    });
  }

  const results: ImportDailyEbsResult[] = [];

  for (const program of Object.values(EBS_PROGRAMS)) {
    try {
      results.push(await importDailyEbsProgram(program, date, options));
    } catch (error) {
      console.error("Daily EBS program import failed:", {
        program: program.id,
        error
      });
      results.push(createErrorResult(program, date, error));
    }
  }

  return {
    ok: results.some(
      (result) =>
        result.status === "created" ||
        result.status === "updated" ||
        result.status === "skipped"
    ),
    date,
    program: "all",
    results
  };
}

export function normalizeProgramSelector(
  value: unknown,
  fallback: ProgramSelector = "all"
): ProgramSelector {
  const raw = String(value || fallback).trim().toLowerCase();

  if (raw === "all" || raw === "gwite" || raw === "start" || raw === "ipte") {
    return raw;
  }

  if (raw === "gte" || raw === "\uADC0\uD2B8\uC601") {
    return "gwite";
  }

  if (raw === "se" || raw === "startenglish") {
    return "start";
  }

  return "ipte";
}

async function importDailyEbsProgram(
  program: EbsProgram,
  date: string,
  options: ImportOptions
): Promise<ImportDailyEbsResult> {
  const { post, debug } = await findPostForDate(program, date);
  const warnings: string[] = [];

  if (!post) {
    return {
      ok: false,
      status: "not_found",
      date,
      program: program.id,
      programName: program.programName,
      sourceUrl: null,
      createdDecks: [],
      updatedDecks: [],
      skippedDecks: [],
      warnings: [`No ${program.programName} post found for ${date}`],
      sections: [],
      debug
    };
  }

  const html = await fetchText(post.sourceUrl);
  const lines = extractContentLines(program, html, date);
  const sections = await program.buildSections(lines);
  const createdDecks: string[] = [];
  const updatedDecks: string[] = [];
  const skippedDecks: string[] = [];
  const savedSections: ImportDailyEbsResult["sections"] = [];

  console.log("Parsed EBS sections:", {
    program: program.id,
    date,
    sourceUrl: post.sourceUrl,
    sections: sections.map((section) => ({
      key: section.key,
      lines: section.lines.length,
      cards: section.cards.length
    }))
  });

  debug.sourceUrl = post.sourceUrl;
  debug.matchedPostTitle = post.title;
  debug.parsedSectionNames = sections.map((section) => section.key);
  debug.deckCardCounts = Object.fromEntries(
    sections.map((section) => [section.key, section.cards.length])
  );

  for (const section of sections) {
    if (section.cards.length === 0) {
      warnings.push(`${section.key} section parsed 0 cards, deck not created`);
      console.log("Skipping empty EBS section:", {
        program: program.id,
        section: section.key
      });
      continue;
    }

    assertCardsAreComplete(section);

    const deckName = `${program.programName} ${date} ${section.label}`;
    const prefix = `${program.deckPrefix}${formatCompactDate(date)}-${section.key}-`;
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
    status: getResultStatus(createdDecks, updatedDecks, skippedDecks),
    date,
    program: program.id,
    programName: program.programName,
    sourceUrl: post.sourceUrl,
    createdDecks,
    updatedDecks,
    skippedDecks,
    warnings,
    sections: savedSections,
    debug
  };
}

function createErrorResult(
  program: EbsProgram,
  date: string,
  error: unknown
): ImportDailyEbsResult {
  return {
    ok: false,
    status: "failed",
    date,
    program: program.id,
    programName: program.programName,
    sourceUrl: null,
    createdDecks: [],
    updatedDecks: [],
    skippedDecks: [],
    warnings: [],
    sections: [],
    debug: createEmptyDebug(program),
    error: error instanceof Error ? error.message : String(error)
  };
}

function getResultStatus(
  createdDecks: string[],
  updatedDecks: string[],
  skippedDecks: string[]
): ImportDailyEbsResult["status"] {
  if (createdDecks.length > 0) {
    return "created";
  }

  if (updatedDecks.length > 0) {
    return "updated";
  }

  if (skippedDecks.length > 0) {
    return "skipped";
  }

  return "failed";
}

function createEmptyDebug(program: EbsProgram): ImportDebug {
  return {
    program: program.id,
    searchedCategoryNo: [],
    categorySource: "none",
    candidateTitlePatterns: program.titlePatterns.map((pattern) =>
      pattern.toString()
    ),
    foundPostTitles: [],
    matchedPostTitle: null,
    sourceUrl: null,
    parsedSectionNames: [],
    deckCardCounts: {}
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

async function findPostForDate(
  program: EbsProgram,
  date: string
): Promise<{ post: FoundPost | null; debug: ImportDebug }> {
  const titleMatcher = createTitleMatcher(program, date);
  const search = await fetchPostListCandidates(program);
  const debug = createEmptyDebug(program);

  debug.searchedCategoryNo = search.searchedCategoryNos;
  debug.categorySource = search.categorySource;
  debug.foundPostTitles = search.candidates
    .map((item) =>
      decodeHtml(
        item.titleWithInspectMessage || item.title || item.encodedTitle || ""
      )
    )
    .filter(Boolean)
    .slice(0, 30);

  for (const item of search.candidates) {
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
      post: {
        logNo,
        title,
        sourceUrl: `${MOBILE_BASE_URL}/PostView.naver?blogId=${getBlogId()}&logNo=${logNo}`
      },
      debug: {
        ...debug,
        matchedPostTitle: title,
        sourceUrl: `${MOBILE_BASE_URL}/PostView.naver?blogId=${getBlogId()}&logNo=${logNo}`
      }
    };
  }

  return { post: null, debug };
}

async function fetchPostListCandidates(program: EbsProgram) {
  const candidates: NaverPostListItem[] = [];
  const seenLogNos = new Set<string>();
  const { categoryNos, categorySource } = await resolveCategoryNos(program);

  for (const categoryNo of categoryNos) {
    for (let page = 1; page <= 5; page += 1) {
      const apiUrl = `${MOBILE_BASE_URL}/api/blogs/${getBlogId()}/category/${categoryNo}/post?itemCount=50&page=${page}`;

      try {
        const data = JSON.parse(await fetchText(apiUrl));
        const items = data?.result?.items || data?.result?.postList || [];

        for (const item of items) {
          addCandidate(candidates, seenLogNos, item);
        }
      } catch (error) {
        console.error("Naver post list API failed:", {
          program: program.id,
          categoryNo,
          page,
          error
        });
      }
    }
  }

  const fallbackCandidates = await fetchRootPostCandidates(program);

  for (const item of fallbackCandidates) {
    addCandidate(candidates, seenLogNos, item);
  }

  return {
    candidates,
    searchedCategoryNos: categoryNos,
    categorySource
  };
}

function addCandidate(
  candidates: NaverPostListItem[],
  seenLogNos: Set<string>,
  item: NaverPostListItem
) {
  const logNo = String(item?.logNo || "").trim();

  if (logNo && !seenLogNos.has(logNo)) {
    seenLogNos.add(logNo);
    candidates.push(item);
  }
}

async function resolveCategoryNos(program: EbsProgram) {
  const configured = Number(process.env[program.categoryEnvKey] || "");

  if (Number.isFinite(configured) && configured > 0) {
    return {
      categoryNos: [configured],
      categorySource: "env" as const
    };
  }

  const discovered = await discoverCategoryNos(program);

  if (discovered.length > 0) {
    return {
      categoryNos: discovered,
      categorySource: "discovered" as const
    };
  }

  return program.defaultCategoryNo
    ? {
        categoryNos: [program.defaultCategoryNo],
        categorySource: "default" as const
      }
    : {
        categoryNos: [],
        categorySource: "none" as const
      };
}

async function discoverCategoryNos(program: EbsProgram) {
  try {
    const html = await fetchText(getBlogHomeUrl());
    const decoded = decodeHtml(html);
    const matches = decoded.matchAll(/categoryNo[=:"']+(\d+)/g);
    const categoryNos = new Set<number>();

    for (const match of matches) {
      const index = match.index ?? 0;
      const snippet = decoded.slice(Math.max(0, index - 250), index + 250);

      if (program.categoryHints.some((hint) => hint.test(snippet))) {
        categoryNos.add(Number(match[1]));
      }
    }

    return Array.from(categoryNos);
  } catch (error) {
    console.error("Naver category discovery failed:", {
      program: program.id,
      error
    });
    return [];
  }
}

async function fetchRootPostCandidates(program: EbsProgram) {
  try {
    const html = await fetchText(getBlogHomeUrl());
    const decoded = decodeHtml(html);
    const candidates: NaverPostListItem[] = [];
    const matches = decoded.matchAll(
      /PostView\.naver\?blogId=[^&"']+(?:&|&amp;)logNo=(\d+)[\s\S]{0,800}?(?:title[^>]*>|ell2[^>]*>|strong[^>]*>)([^<]+)/g
    );

    for (const match of matches) {
      const title = cleanLine(match[2]);

      if (program.titlePatterns.some((pattern) => pattern.test(title))) {
        candidates.push({
          logNo: match[1],
          title
        });
      }
    }

    return candidates;
  } catch (error) {
    console.error("Naver root post fallback failed:", {
      program: program.id,
      error
    });
    return [];
  }
}

function extractContentLines(program: EbsProgram, html: string, date: string) {
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

  const titleMatcher = createTitleMatcher(program, date);
  const startIndex = lines.findIndex(titleMatcher);
  const scopedLines = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
  const oneMoreIndex = scopedLines.findIndex((line) =>
    /one\s+more\s+dialog/i.test(line)
  );

  return (oneMoreIndex >= 0 ? scopedLines.slice(0, oneMoreIndex) : scopedLines)
    .map(cleanLine)
    .filter(isUsefulLine);
}

async function buildIpteSections(lines: string[]) {
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
      label: ipteLabels.BODY,
      lines: bodyLines,
      cards: await buildBodyCards(bodyLines)
    },
    {
      key: "WORD" as const,
      label: ipteLabels.WORD,
      lines: wordLines,
      cards: buildTermCards(wordLines)
    },
    {
      key: "PATT" as const,
      label: ipteLabels.PATT,
      lines: patternLines,
      cards: buildPatternCards(patternLines)
    },
    {
      key: "DIAL" as const,
      label: ipteLabels.DIAL,
      lines: dialogLines,
      cards: buildDialogCards(dialogLines)
    }
  ] satisfies EbsSection[];
}

async function buildGwiteSections(lines: string[]) {
  const scriptIndex = lines.findIndex(isScriptHeading);
  const wordIndex = lines.findIndex(isWordHeading);
  const exprIndex = lines.findIndex((line, index) => {
    return index > positiveOrEnd(wordIndex, 0) && isExpressionHeading(line);
  });
  const firstHeading = firstPositiveOrEnd(
    [wordIndex, exprIndex].filter((index) => index !== scriptIndex),
    lines.length
  );
  const scriptStart = scriptIndex >= 0 ? scriptIndex + 1 : 0;
  const scriptLines = lines.slice(scriptStart, firstHeading);
  const wordLines = wordIndex >= 0
    ? lines.slice(wordIndex + 1, positiveOrEnd(exprIndex, lines.length))
    : [];
  const exprLines = exprIndex >= 0 ? lines.slice(exprIndex + 1) : [];
  const scriptCards = buildSentenceCards(scriptLines);
  const exprCards = buildTermCards(exprLines);

  return [
    {
      key: "SCRIPT" as const,
      label: gwiteLabels.SCRIPT,
      lines: scriptLines,
      cards: scriptCards
    },
    {
      key: "WORD" as const,
      label: gwiteLabels.WORD,
      lines: wordLines,
      cards: buildTermCards(wordLines)
    },
    {
      key: "EXPR" as const,
      label: gwiteLabels.EXPR,
      lines: exprLines,
      cards: exprCards
    },
    {
      key: "CLOZE" as const,
      label: gwiteLabels.CLOZE,
      lines: scriptLines,
      cards: buildClozeCards(scriptCards, exprCards)
    }
  ] satisfies EbsSection[];
}

async function buildStartSections(lines: string[]) {
  const wordIndex = lines.findIndex(isWordHeading);
  const patternIndex = lines.findIndex(isPatternHeading);
  const practiceIndex = lines.findIndex(isPracticeHeading);
  const firstHeading = firstPositiveOrEnd(
    [wordIndex, patternIndex, practiceIndex],
    lines.length
  );
  const dialogLines = lines.slice(0, firstHeading);
  const wordLines = wordIndex >= 0
    ? lines.slice(wordIndex + 1, firstPositiveOrEnd([patternIndex, practiceIndex], lines.length))
    : [];
  const patternLines = patternIndex >= 0
    ? lines.slice(patternIndex + 1, positiveOrEnd(practiceIndex, lines.length))
    : [];
  const practiceLines = practiceIndex >= 0 ? lines.slice(practiceIndex + 1) : [];
  const patternCards = buildPatternCards(patternLines);
  const practiceCards = buildPracticeCards(practiceLines, patternCards);

  return [
    {
      key: "DIAL" as const,
      label: startLabels.DIAL,
      lines: dialogLines,
      cards: buildStartDialogCards(dialogLines)
    },
    {
      key: "WORD" as const,
      label: startLabels.WORD,
      lines: wordLines,
      cards: buildTermCards(wordLines)
    },
    {
      key: "PATT" as const,
      label: startLabels.PATT,
      lines: patternLines,
      cards: patternCards
    },
    {
      key: "PRACTICE" as const,
      label: startLabels.PRACTICE,
      lines: practiceLines,
      cards: practiceCards
    }
  ] satisfies EbsSection[];
}

async function buildBodyCards(lines: string[]) {
  const sentences = splitEnglishSentences(lines);

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

function splitEnglishSentences(lines: string[]) {
  return lines
    .filter((line) => !/^EBS\s*/.test(line))
    .filter((line) => !hasHangul(line))
    .filter((line) => /[.!?]/.test(line))
    .flatMap((line) => line.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 8);
}

function buildSentenceCards(lines: string[]) {
  return dedupeCards(
    splitEnglishSentences(lines).map((sentence) => ({
      front: sentence,
      back: getUntranslatedBodyBack(sentence)
    }))
  );
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

function buildTermCards(lines: string[]) {
  return normalizeCards(
    lines
      .map(parseEnglishKoreanLine)
      .filter((card): card is Card => !!card)
  );
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

  return normalizeCards(cards);
}

function buildDialogCards(lines: string[]) {
  const english = lines.filter((line) => isDialogueLine(line) && !hasHangul(line));
  const korean = lines.filter((line) => isDialogueLine(line) && hasHangul(line));

  if (english.length > 0 && english.length === korean.length) {
    return dedupeCards(
      english.map((line, index) => ({
        front: line,
        back: korean[index]
      }))
    );
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
              back: hasHangul(line) ? "\uB300\uD654\uBB38" : line
            }
          : null;
      })
      .filter((card): card is Card => !!card && !!card.front && !!card.back)
  );
}

function buildStartDialogCards(lines: string[]) {
  const dialogCards = buildDialogCards(lines);

  if (dialogCards.length > 0) {
    return dialogCards;
  }

  return buildSentenceCards(lines);
}

function buildPracticeCards(lines: string[], patternCards: Card[]) {
  const directCards = normalizeCards(
    lines
      .map(parseEnglishKoreanLine)
      .filter((card): card is Card => !!card)
  );

  if (directCards.length > 0) {
    return directCards;
  }

  return patternCards
    .filter((card) => card.front.length <= 90)
    .slice(0, 8)
    .map((card) => ({
      front: card.front,
      back: card.back
    }));
}

function buildClozeCards(scriptCards: Card[], expressionCards: Card[]) {
  const cards: Card[] = [];

  for (const expression of expressionCards) {
    const target = normalizeClozeTarget(expression.front);

    if (!target || target.length < 4) {
      continue;
    }

    const script = scriptCards.find((card) =>
      card.front.toLowerCase().includes(target.toLowerCase())
    );

    if (!script) {
      continue;
    }

    cards.push({
      front: script.front.replace(new RegExp(escapeRegExp(target), "i"), "____"),
      back: script.front
    });

    if (cards.length >= 10) {
      break;
    }
  }

  return dedupeCards(cards);
}

function normalizeClozeTarget(value: string) {
  return value
    .replace(/~/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCards(cards: Card[]) {
  return dedupeCards(
    cards
      .map(normalizeCard)
      .filter((card) => card.front.trim() && card.back.trim())
  );
}

function normalizeCard(card: Card): Card {
  const front = normalizeFront(card.front);
  const back = normalizeBack(front, card.back);

  return {
    front,
    back
  };
}

function normalizeFront(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\brun a 10K\s+10km\b/i, "run a 10K")
    .replace(/\b10K\s+10km\b/i, "10K")
    .replace(/\s*\([^)]*$/g, "")
    .trim();
}

function normalizeBack(front: string, value: string) {
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

  if (/^be related to\s*~$/.test(normalizedFront) && !back.includes("~")) {
    return back.startsWith("\uC640") || back.startsWith("\uACFC")
      ? `~${back}`
      : `~\uC640 ${back}`;
  }

  if (/^be likely to\s*~$/.test(normalizedFront) && !back.includes("~")) {
    return back.startsWith("\uD560")
      ? `~${back}`
      : `~\uD560 \uAC00\uB2A5\uC131\uC774 \uC788\uB2E4`;
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

  if (/^\uC640|\uACFC\s*/.test(back)) {
    return `~${back}`;
  }

  if (/^\uCE58\uACE0\s*/.test(back)) {
    return `~${back}`;
  }

  if (/^\uD560\s+\uAC00\uB2A5\uC131/.test(back)) {
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

function parseEnglishKoreanLine(line: string): Card | null {
  const clean = line.replace(/^\d+\.\s*/, "").replace(/^\*\s*/, "").trim();
  const hangulMatch = clean.match(/[\uAC00-\uD7A3]/);

  if (!hangulMatch || hangulMatch.index === undefined) {
    return null;
  }

  const front = clean.slice(0, hangulMatch.index).trim();
  const back = clean.slice(hangulMatch.index).trim();

  if (!front || !back || !/[A-Za-z~]/.test(front)) {
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
      Referer: getBlogHomeUrl()
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

function createTitleMatcher(program: EbsProgram, date: string) {
  const datePattern = createDatePattern(date);

  return (title: string) => {
    return (
      program.titlePatterns.some((pattern) => pattern.test(title)) &&
      datePattern.test(title)
    );
  };
}

function createDatePattern(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new RegExp(`${year}\\s*[.-]\\s*0?${month}\\s*[.-]\\s*0?${day}`);
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

function isScriptHeading(line: string) {
  return /script|listening|\uC2A4\uD06C\uB9BD\uD2B8|\uB4E3\uAE30|\uC9C0\uBB38/i.test(line);
}

function isKeyExpressionsHeading(line: string) {
  return /key\s+expressions|\uC8FC\uC694\s*\uD45C\uD604|\uB2E8\uC5B4/i.test(
    line
  );
}

function isWordHeading(line: string) {
  return /key\s+expressions|vocab|vocabulary|words?|\uC8FC\uC694\s*\uD45C\uD604|\uB2E8\uC5B4|\uC5B4\uD718/i.test(
    line
  );
}

function isExpressionHeading(line: string) {
  return /expressions?|phrases?|\uD45C\uD604|\uC720\uC6A9\uD55C\s*\uD45C\uD604|\uAD6C\uBB38|\uC219\uC5B4/i.test(
    line
  );
}

function isPatternHeading(line: string) {
  return /pattern\s+practice|patterns?|\uD328\uD134|\uBB38\uD615/i.test(line);
}

function isPracticeHeading(line: string) {
  return /practice|exercise|\uC5F0\uC2B5|\uC751\uC6A9/i.test(line);
}

function isDialogueLine(line: string) {
  return /^[AB]\s+/.test(line) || /^[AB]\s*[:\uFF1A]/.test(line);
}

function positiveOrEnd(index: number, end: number) {
  return index >= 0 ? index : end;
}

function firstPositiveOrEnd(indices: number[], end: number) {
  const positives = indices.filter((index) => index >= 0);

  return positives.length > 0 ? Math.min(...positives) : end;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBlogId() {
  return process.env.NAVER_BLOG_ID || DEFAULT_BLOG_ID;
}

function getBlogHomeUrl() {
  return `${MOBILE_BASE_URL}/${getBlogId()}?tab=1`;
}
