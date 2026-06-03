export type ParsedCard = {
  front: string;
  back: string;
};

export function parseCards(rawText: string): ParsedCard[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("\t")) {
        const [front, ...rest] = line.split("\t");

        return {
          front: front.trim(),
          back: rest.join("\t").trim()
        };
      }

      if (line.includes(",")) {
        const [front, ...rest] = line.split(",");

        return {
          front: front.trim(),
          back: rest.join(",").trim()
        };
      }

      const parts = line.split(/\s{2,}/);

      if (parts.length >= 2) {
        return {
          front: parts[0].trim(),
          back: parts.slice(1).join(" ").trim()
        };
      }

      return null;
    })
    .filter((card): card is ParsedCard => {
      return !!card && card.front.length > 0 && card.back.length > 0;
    });
}
