import { z } from 'zod';
import { isValidIsbn, toIsbn13 } from './isbn';

export const TITLE_TYPES = [
  'book',
  'magazine',
  'audio',
  'video',
  'game',
  'score',
  'other',
] as const;
export const TitleTypeSchema = z.enum(TITLE_TYPES);
export type TitleType = z.infer<typeof TitleTypeSchema>;

/** AVI-2009 reading levels used in Flemish and Dutch primary schools. */
export const AVI_LEVELS = [
  'Start',
  'M3',
  'E3',
  'M4',
  'E4',
  'M5',
  'E5',
  'M6',
  'E6',
  'M7',
  'E7',
  'Plus',
] as const;
export const AviLevelSchema = z.enum(AVI_LEVELS);

export const COPY_STATUSES = ['available', 'onLoan', 'lost', 'damaged', 'withdrawn'] as const;
export const CopyStatusSchema = z.enum(COPY_STATUSES);
export type CopyStatus = z.infer<typeof CopyStatusSchema>;

/**
 * Text from people or book databases. NFC joins letters and separate accents ("e" + "́" → "é"),
 * which some sources send apart; PDFs and search then treat them as one character.
 */
export const text = (max: number) => z.string().trim().normalize('NFC').min(1).max(max);

/** Book barcodes and reader card numbers share one namespace (see docs/decisions.md 011). */
export const CodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{3,32}$/);

const IsbnSchema = z.string().refine(isValidIsbn, { message: 'Invalid ISBN' }).transform(toIsbn13);

/** Fields a librarian edits. Shared by the form (client) and the API (server). */
export const TitleInputSchema = z
  .object({
    type: TitleTypeSchema,
    title: text(300),
    subtitle: text(300).optional(),
    authors: z.array(text(200)).max(20).default([]),
    publisher: text(200).optional(),
    publishedYear: z.number().int().min(1400).max(2100).optional(),
    isbn: IsbnSchema.optional(),
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .default('nl'),
    subjects: z.array(text(60)).max(30).default([]),
    summary: z.string().trim().max(4000).optional(),
    aviLevel: AviLevelSchema.optional(),
    zizoLevel: text(10).optional(),
    ageMin: z.number().int().min(0).max(99).optional(),
    ageMax: z.number().int().min(0).max(99).optional(),
  })
  .strict()
  .refine((t) => t.ageMin === undefined || t.ageMax === undefined || t.ageMin <= t.ageMax, {
    message: 'ageMin must not exceed ageMax',
    path: ['ageMax'],
  });
export type TitleInput = z.infer<typeof TitleInputSchema>;

export const CreateTitleRequestSchema = z.object({
  title: TitleInputSchema,
  /** Cover found by the ISBN lookup; the server copies it so visitors never hit third parties. */
  coverUrl: z.url({ protocol: /^https$/ }).optional(),
});

export const UpdateTitleRequestSchema = z.object({
  title: TitleInputSchema,
  /** Optimistic locking: the version the librarian started editing from. */
  version: z.number().int().positive(),
});

export type Title = TitleInput & {
  id: string;
  /** Created for an exchange collection: removed with it when no other copies remain. */
  exchangeId?: string;
  coverImageKey?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export const CopyInputSchema = z
  .object({
    /** Omit to let the system assign the next barcode number. */
    barcode: CodeSchema.optional(),
    location: text(100).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type CopyInput = z.infer<typeof CopyInputSchema>;

export const UpdateCopyRequestSchema = z
  .object({
    status: CopyStatusSchema.exclude(['onLoan']).optional(),
    location: text(100).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type Copy = {
  id: string;
  titleId: string;
  barcode: string;
  status: CopyStatus;
  location?: string;
  note?: string;
  /** True until its barcode label has been printed (the label print queue). */
  labelPending?: boolean;
  /** Lent to the school by the public library as part of this exchange collection. */
  exchangeId?: string;
  /** How often this copy was lent (counted at the desk). */
  loanCount?: number;
  /** Set while the copy is on loan; maintained by circulation only. */
  currentLoan?: { loanId: string; readerId: string; dueDate: string; loanedAt: string };
  createdAt: string;
  updatedAt: string;
};

export type TitleWithCopies = Title & { copies: Copy[] };

/** Public view: copies without internal notes. */
export type PublicTitle = Title & {
  copies: Pick<Copy, 'id' | 'status' | 'location'>[];
};

export type IsbnLookupResult = {
  title: Partial<TitleInput>;
  coverUrl?: string;
  source: string;
};

export const LABEL_LOOKUP_MAX = 500;

export const LabelLookupRequestSchema = z.object({
  codes: z.array(CodeSchema).min(1).max(LABEL_LOOKUP_MAX),
});

/** What a book label shows. */
export type CopyLabel = { barcode: string; titleId: string; title: string; authors: string[] };

export type LabelLookupResult = { labels: CopyLabel[]; unknown: string[] };

/** Uploaded covers are sent as base64; the browser shrinks photos well below this first. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;

export const CoverUploadRequestSchema = z.object({
  // Base64 grows data by a third; allow the full 2 MB after decoding.
  image: z.base64().max(Math.ceil((COVER_MAX_BYTES * 4) / 3) + 4),
});

export const MarkLabelsPrintedRequestSchema = z.object({
  codes: z.array(CodeSchema).min(1).max(LABEL_LOOKUP_MAX),
});
