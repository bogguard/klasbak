/*
 * Codes Klasbak generates for book labels and reader cards start with the school's
 * instellingsnummer (decision 038): unique across Flanders without a register, and a code from
 * another school can be recognised instead of being mistaken for one of ours.
 *
 *   Book        123456 000042    12 digits: Code 128 prints digit pairs compactly
 *   Reader card L 123456 000123  the "L" keeps cards and books apart at a glance
 *
 * Codes typed or imported by the school (e.g. labels from a previous library program) keep
 * whatever form they have.
 */

/** The official number of a Flemish school (Departement Onderwijs): six digits. */
export const INSTITUTION_NUMBER_PATTERN = /^\d{6}$/;

const SEQUENCE_DIGITS = 6;
const SEQUENCE_MAX = 10 ** SEQUENCE_DIGITS - 1;

function sequence(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > SEQUENCE_MAX) {
    throw new Error(`Code number out of range: ${n}`);
  }
  return String(n).padStart(SEQUENCE_DIGITS, '0');
}

export function bookBarcode(institutionNumber: string, n: number): string {
  return `${institutionNumber}${sequence(n)}`;
}

export function memberNumber(institutionNumber: string, n: number): string {
  return `L${institutionNumber}${sequence(n)}`;
}

/** The school a generated code belongs to, or undefined for codes Klasbak didn't make. */
export function institutionNumberOf(code: string): string | undefined {
  if (/^\d{12}$/.test(code)) return code.slice(0, 6);
  if (/^L\d{12}$/.test(code)) return code.slice(1, 7);
  return undefined;
}

/**
 * What a librarian types for a book label: "42" is book 42 of this school, anything else is
 * taken as a full barcode.
 */
export function bookBarcodeFromInput(input: string, institutionNumber: string | undefined): string {
  const text = input.trim();
  if (institutionNumber && /^\d{1,6}$/.test(text))
    return bookBarcode(institutionNumber, Number(text));
  return text;
}
