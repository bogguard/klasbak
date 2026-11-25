import type { PhotoPupil } from '@klasbak/shared';

/*
 * Photos are matched to pupils the way photographers do it: first a photo of the pupil's card
 * (or of their line on the class list), then their portraits. Everything until the next card
 * belongs to that pupil. The class list also has a code per class: the photos after it are
 * class photos. That needs the photos in the order they were taken.
 */

export type Capture = { name: string; takenAt?: string; lastModified: number };

/** The order the camera took them: its clock, else the file's date, then the file name. */
export function compareCaptures(a: Capture, b: Capture): number {
  const timeA = a.takenAt ?? new Date(a.lastModified).toISOString();
  const timeB = b.takenAt ?? new Date(b.lastModified).toISOString();
  return timeA.localeCompare(timeB) || a.name.localeCompare(b.name, 'en', { numeric: true });
}

/** Who the photos are for at this point in the series. */
export type Owner =
  | { kind: 'none' }
  | { kind: 'pupil'; pupil: PhotoPupil }
  | { kind: 'class'; group: string }
  /** A card or code we don't know: the photos after it wait to be sorted by hand. */
  | { kind: 'unknown'; code: string };

export type Shot = { owner: Owner; isCard: boolean };

/**
 * The code on the class list that announces a class photo. Code 128 holds plain ASCII, so
 * accents are dropped ("6é" → "KLASFOTO 6E"); matching compares the same form.
 */
export function classPhotoCode(group: string): string {
  const ascii = group
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .toUpperCase();
  return `KLASFOTO ${ascii}`;
}

/** What each scannable code stands for: a pupil's card number or a class photo code. */
export type CodeIndex = Map<string, Owner>;

export function codeIndex(pupils: PhotoPupil[]): CodeIndex {
  const index: CodeIndex = new Map();
  for (const pupil of pupils) {
    index.set(pupil.memberNumber.toUpperCase(), { kind: 'pupil', pupil });
    if (pupil.group) {
      index.set(classPhotoCode(pupil.group), { kind: 'class', group: pupil.group });
    }
  }
  return index;
}

const sameOwner = (a: Owner, b: Owner) =>
  (a.kind === 'pupil' && b.kind === 'pupil' && a.pupil.id === b.pupil.id) ||
  (a.kind === 'class' && b.kind === 'class' && a.group === b.group);

/**
 * What one photo is, given the codes found on it, most central first. A photo of the class list
 * often catches the lines above and below too: the code in the middle of the photo is the one
 * meant. A photo with the current pupil's own card (on a lanyard, say) is still their portrait.
 */
export function classifyShot(current: Owner, codes: string[], index: CodeIndex): Shot {
  const found = codes.map((code) => code.trim().toUpperCase()).filter(Boolean);
  if (found.length === 0) return { owner: current, isCard: false };
  const known = found.map((code) => index.get(code)).find((owner) => owner !== undefined);
  if (!known) return { owner: { kind: 'unknown', code: found[0] as string }, isCard: true };
  if (sameOwner(known, current)) return { owner: current, isCard: false };
  return { owner: known, isCard: true };
}

type Box = { x: number; y: number; width: number; height: number };

/** Codes found on a scaled-down copy, with their place on the photo itself. */
export function inPhotoPixels(
  results: { rawValue: string; boundingBox?: Box }[],
  scale: number,
): { rawValue: string; boundingBox?: Box }[] {
  return results.map(({ rawValue, boundingBox: box }) => ({
    rawValue,
    boundingBox: box && {
      x: box.x * scale,
      y: box.y * scale,
      width: box.width * scale,
      height: box.height * scale,
    },
  }));
}

/** Codes ordered by how close they are to the middle of the photo. */
export function centralFirst<T extends { boundingBox?: Box }>(
  results: T[],
  width: number,
  height: number,
): T[] {
  const distance = (result: T) => {
    const box = result.boundingBox;
    if (!box) return Number.POSITIVE_INFINITY;
    return Math.hypot(box.x + box.width / 2 - width / 2, box.y + box.height / 2 - height / 2);
  };
  return [...results].sort((a, b) => distance(a) - distance(b));
}
