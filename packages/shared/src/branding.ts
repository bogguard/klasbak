import { z } from 'zod';
import { text } from './catalog';

/** Public file the website reads for the library's name and logo (no API call needed). */
export const BRANDING_PATH = 'branding/branding.json';

export const LOGO_MAX_BYTES = 1024 * 1024;

export const UpdateBrandingRequestSchema = z.object({ libraryName: text(80) }).strict();

export const LogoUploadRequestSchema = z.object({
  image: z.base64().max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 4),
});

/**
 * What kind of library this is. A school gets school words and school years; another
 * organisation (a law firm, a company, an association) gets neutral words and calendar years,
 * and doesn't see what only makes sense in a school.
 */
export const LIBRARY_KINDS = ['school', 'organisation'] as const;
export const LibraryKindSchema = z.enum(LIBRARY_KINDS);
export type LibraryKind = z.infer<typeof LibraryKindSchema>;

const TermSchema = z.object({ one: text(40), other: text(40) }).strict();

/**
 * The library's own words for its two kinds of readers and for their groups, e.g. "medewerker"
 * and "partner" with "afdeling". Internally the reader types stay `pupil` and `teacher` (the
 * one with fewer and the one with more books); only their names change. Unset words use the
 * defaults for the kind of library.
 */
export const LibraryTermsSchema = z
  .object({
    pupil: TermSchema.optional(),
    teacher: TermSchema.optional(),
    group: TermSchema.optional(),
  })
  .strict();
export type LibraryTerms = z.infer<typeof LibraryTermsSchema>;

export const UpdateVocabularyRequestSchema = z
  .object({ kind: LibraryKindSchema, terms: LibraryTermsSchema })
  .strict();

export type Branding = {
  libraryName?: string;
  logoKey?: string;
  /** Unset means "school" (installations from before this existed). */
  kind?: LibraryKind;
  terms?: LibraryTerms;
};
