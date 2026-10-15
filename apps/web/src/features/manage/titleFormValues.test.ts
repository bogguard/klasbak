import { describe, expect, it } from 'vitest';
import { emptyTitleForm, parseTitleForm, toFormValues } from './titleFormValues';

describe('parseTitleForm', () => {
  it('turns typed text into a clean title', () => {
    const result = parseTitleForm({
      ...emptyTitleForm,
      title: '  Dolfje Weerwolfje ',
      authors: 'Paul van Loon\n\n',
      subjects: 'griezelen, weerwolven, ',
      publishedYear: '1995',
      isbn: '978-0-306-40615-7',
      ageMin: '',
    });
    expect(result).toEqual({
      ok: true,
      title: expect.objectContaining({
        title: 'Dolfje Weerwolfje',
        authors: ['Paul van Loon'],
        subjects: ['griezelen', 'weerwolven'],
        publishedYear: 1995,
        isbn: '9780306406157',
      }),
    });
  });

  it('reports friendly error keys per field', () => {
    const result = parseTitleForm({
      ...emptyTitleForm,
      title: ' ',
      isbn: '123',
      publishedYear: 'abc',
      ageMin: '120',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        title: 'manage.form.errors.title',
        isbn: 'manage.form.errors.isbn',
        publishedYear: 'manage.form.errors.year',
        ageMin: 'manage.form.errors.age',
      },
    });
  });

  // Zod checks rules across fields only once each field is valid, so this shows up last.
  it('reports an age range that runs backwards', () => {
    const result = parseTitleForm({ ...emptyTitleForm, title: 'X', ageMin: '12', ageMax: '8' });
    expect(result).toEqual({ ok: false, errors: { ageMax: 'manage.form.errors.ageOrder' } });
  });

  it('round-trips an existing title', () => {
    const values = toFormValues({ type: 'game', title: 'Catan', authors: ['A', 'B'], ageMin: 10 });
    expect(values.authors).toBe('A\nB');
    expect(parseTitleForm(values)).toMatchObject({
      ok: true,
      title: { ageMin: 10, authors: ['A', 'B'] },
    });
  });
});
