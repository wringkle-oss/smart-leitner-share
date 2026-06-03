export type Card = {
  front: string;
  back: string;
};

export function parseCards(rawText: string): Card[] {
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error("Paste at least one card.");
  }

  const delimiter = chooseDelimiter(trimmed);
  const rows = parseDelimitedRows(trimmed, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  const dataRows = hasHeader(rows[0]) ? rows.slice(1) : rows;
  const cards = dataRows
    .map(([front, back]) => ({ front: front ?? "", back: back ?? "" }))
    .filter((card) => card.front && card.back);

  if (cards.length === 0) {
    throw new Error("Add cards with front and back columns.");
  }

  return cards;
}

function chooseDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;

  return tabCount > commaCount ? "\t" : ",";
}

function hasHeader(row: string[] | undefined): boolean {
  if (!row || row.length < 2) {
    return false;
  }

  return (
    row[0].trim().toLowerCase() === "front" &&
    row[1].trim().toLowerCase() === "back"
  );
}

function parseDelimitedRows(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}
