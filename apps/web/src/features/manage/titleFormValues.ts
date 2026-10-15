import { TitleInputSchema, type Title, type TitleInput, type TitleType } from '@library/shared';

/** What the form holds: plain strings, exactly as typed. Converted to a TitleInput on save. */
export type TitleFormValues = {
  type: TitleType;
  title: string;
  subtitle: string;
  /** One author per line. */
  authors: string;
  publisher: string;
  publishedYear: string;
  isbn: string;
  language: string;
  /** Comma-separated. */
  subjects: string;
  summary: string;
  aviLevel: string;
  zizoLevel: string;
  ageMin: string;
  ageMax: string;
};

export type TitleField = keyof TitleFormValues;

export const emptyTitleForm: TitleFormValues = {
  type: 'book',
  title: '',
  subtitle: '',
  authors: '',
  publisher: '',
  publishedYear: '',
  isbn: '',
  language: 'nl',
  subjects: '',
  summary: '',
  aviLevel: '',
  zizoLevel: '',
  ageMin: '',
  ageMax: '',
};

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export function toFormValues(title: Partial<TitleInput> | Title): TitleFormValues {
  return {
    type: title.type ?? 'book',
    title: text(title.title),
    subtitle: text(title.subtitle),
    authors: (title.authors ?? []).join('\n'),
    publisher: text(title.publisher),
    publishedYear: text(title.publishedYear),
    isbn: text(title.isbn),
    language: title.language ?? 'nl',
    subjects: (title.subjects ?? []).join(', '),
    summary: text(title.summary),
    aviLevel: text(title.aviLevel),
    zizoLevel: text(title.zizoLevel),
    ageMin: text(title.ageMin),
    ageMax: text(title.ageMax),
  };
}

const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());
const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
const list = (value: string, separator: RegExp) =>
  value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

export type FormErrors = Partial<Record<TitleField, string>>;

/**
 * Validates with the same schema the API uses. Errors are translation keys per field,
 * so the librarian gets a clear sentence instead of a technical message.
 */
export function parseTitleForm(
  values: TitleFormValues,
): { ok: true; title: TitleInput } | { ok: false; errors: FormErrors } {
  const result = TitleInputSchema.safeParse({
    type: values.type,
    title: values.title.trim(),
    subtitle: optional(values.subtitle),
    authors: list(values.authors, /\n/),
    publisher: optional(values.publisher),
    publishedYear: optionalNumber(values.publishedYear),
    isbn: optional(values.isbn),
    language: values.language,
    subjects: list(values.subjects, /,/),
    summary: optional(values.summary),
    aviLevel: optional(values.aviLevel),
    zizoLevel: optional(values.zizoLevel),
    ageMin: optionalNumber(values.ageMin),
    ageMax: optionalNumber(values.ageMax),
  });
  if (result.success) return { ok: true, title: result.data };

  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as TitleField;
    errors[field] ??= errorKey(field, issue.code);
  }
  return { ok: false, errors };
}

function errorKey(field: TitleField, code: string): string {
  if (field === 'ageMax' && code === 'custom') return 'manage.form.errors.ageOrder';
  const known: Partial<Record<TitleField, string>> = {
    title: 'manage.form.errors.title',
    isbn: 'manage.form.errors.isbn',
    publishedYear: 'manage.form.errors.year',
    ageMin: 'manage.form.errors.age',
    ageMax: 'manage.form.errors.age',
  };
  return known[field] ?? 'manage.form.errors.generic';
}

/** Common languages first; the list is short on purpose. */
export const LANGUAGE_CODES = ['nl', 'fr', 'en', 'de', 'es', 'it', 'pl', 'tr', 'ar', 'uk'];
