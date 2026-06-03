export const deckCodeRegex = /^[A-Z0-9_-]{3,32}$/;

export const deckCodeValidationMessage =
  "Deck Code must be 3\u201332 characters and use only letters, numbers, hyphen, or underscore. No spaces.";

export function normalizeDeckCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase();
}

export function isValidDeckCode(code: string) {
  return deckCodeRegex.test(normalizeDeckCode(code));
}

export function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
