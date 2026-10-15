/** Strips spaces and dashes so "978-90-451-1720-9" and "9789045117209" are the same ISBN. */
export function normalizeIsbn(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn(input: string): boolean {
  const isbn = normalizeIsbn(input);
  if (/^\d{9}[\dX]$/.test(isbn)) return isbn10Checksum(isbn) % 11 === 0;
  if (/^\d{13}$/.test(isbn)) return isbn13Checksum(isbn) % 10 === 0;
  return false;
}

/** Converts a valid ISBN-10 to ISBN-13; returns ISBN-13 input unchanged. */
export function toIsbn13(input: string): string {
  const isbn = normalizeIsbn(input);
  if (isbn.length === 13) return isbn;
  const body = `978${isbn.slice(0, 9)}`;
  const check = (10 - (isbn13Checksum(`${body}0`) % 10)) % 10;
  return `${body}${check}`;
}

function isbn10Checksum(isbn: string): number {
  return [...isbn].reduce((sum, char, i) => sum + (char === 'X' ? 10 : Number(char)) * (10 - i), 0);
}

function isbn13Checksum(isbn: string): number {
  return [...isbn].reduce((sum, char, i) => sum + Number(char) * (i % 2 === 0 ? 1 : 3), 0);
}
