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
