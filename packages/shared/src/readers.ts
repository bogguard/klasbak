import { z } from 'zod';
import { CodeSchema, text } from './catalog';

export const READER_CATEGORIES = ['pupil', 'teacher'] as const;
export const ReaderCategorySchema = z.enum(READER_CATEGORIES);
export type ReaderCategory = z.infer<typeof ReaderCategorySchema>;

/*
 * Only what the library needs (privacy by design): no birth dates, addresses or photos.
 * Email is optional; most pupils won't have one.
 */
export const ReaderInputSchema = z
  .object({
    /** The number on the reader card. Omit to generate one; it can't change afterwards. */
    memberNumber: CodeSchema.optional(),
    firstName: text(100),
    lastName: text(100),
    /** Class or group, e.g. "3B". */
    group: text(30).optional(),
    /**
     * The pupil's number in the school administration (stamboeknummer/stamnummer), only to
     * recognise them in next year's import. Never printed; the card number stays the library's.
     */
    schoolNumber: text(40).optional(),
    category: ReaderCategorySchema.default('pupil'),
    email: z.email().max(254).optional(),
    active: z.boolean().default(true),
  })
  .strict();
export type ReaderInput = z.infer<typeof ReaderInputSchema>;

export const UpdateReaderRequestSchema = z.object({
  reader: ReaderInputSchema.omit({ memberNumber: true }),
  version: z.number().int().positive(),
});

export const IMPORT_BATCH_SIZE = 50;

/** Rows are validated one by one on the server so each row gets its own result. */
export const ImportReadersRequestSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(IMPORT_BATCH_SIZE),
});

/** Readers to set inactive after importing a new school year's list (pupils who left). */
export const DeactivateReadersRequestSchema = z.object({
  readerIds: z.array(z.string().min(1).max(40)).min(1).max(IMPORT_BATCH_SIZE),
});

export type ImportRowResult =
  | { index: number; status: 'created' | 'updated'; memberNumber: string }
  | { index: number; status: 'failed'; code: string };

export type Reader = Omit<ReaderInput, 'memberNumber'> & {
  id: string;
  memberNumber: string;
  activeLoanCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export function readerName(reader: Pick<Reader, 'firstName' | 'lastName'>): string {
  return `${reader.firstName} ${reader.lastName}`;
}

type Matchable = Pick<Reader, 'id' | 'memberNumber' | 'firstName' | 'lastName'> & {
  schoolNumber?: string;
};

/** Lowercase, no accents or extra spaces: "Zoë  Maes" and "zoe maes" are the same name. */
function nameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Finds the existing reader an imported row is about, so importing next year's list updates
 * readers instead of adding them twice. In order: the school's number, the card number, and
 * (for readers entered by hand before the first import) an exact, unique name match among
 * readers without a school number. Used by the import preview and the server alike.
 */
export function matchReader<T extends Matchable>(
  row: Pick<ReaderInput, 'firstName' | 'lastName' | 'memberNumber' | 'schoolNumber'>,
  readers: T[],
): T | undefined {
  if (row.schoolNumber) {
    const bySchoolNumber = readers.find((r) => r.schoolNumber === row.schoolNumber);
    if (bySchoolNumber) return bySchoolNumber;
  }
  if (row.memberNumber) {
    const byCard = readers.find((r) => r.memberNumber === row.memberNumber);
    if (byCard) return byCard;
  }
  const key = nameKey(row.firstName, row.lastName);
  const byName = readers.filter((r) => !r.schoolNumber && nameKey(r.firstName, r.lastName) === key);
  return byName.length === 1 ? byName[0] : undefined;
}
