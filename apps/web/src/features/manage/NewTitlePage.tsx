import { isValidIsbn, toIsbn13, type IsbnLookupResult } from '@library/shared';
import { ArrowLeft, Barcode, PenLine, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { ApiError } from '../../lib/api';
import { findByIsbn, useSearchIndex } from '../catalog/useSearchIndex';
import { useCreateTitle, useIsbnLookup } from './api';
import { TitleForm } from './TitleForm';
import { emptyTitleForm, toFormValues, type TitleFormValues } from './titleFormValues';

type Draft = {
  values: TitleFormValues;
  isbn?: string;
  lookup?: IsbnLookupResult;
  /** Why there is no lookup data, if we tried. */
  lookupProblem?: 'notFound' | 'failed';
};

/**
 * Adding a title is optimised for a librarian with a barcode scanner: scan the ISBN,
 * check what we found, save. Typing everything by hand is the fallback, not the default.
 */
export function NewTitlePage() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>();

  return (
    <div className="space-y-6">
      <Link
        to="/manage"
        className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('manage.backToList')}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t('manage.new.heading')}</h1>
      {draft ? (
        <DraftForm draft={draft} onRestart={() => setDraft(undefined)} />
      ) : (
        <IsbnStep onDraft={setDraft} />
      )}
    </div>
  );
}

function IsbnStep({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const { t } = useTranslation();
  const lookup = useIsbnLookup();
  const [isbn, setIsbn] = useState('');
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidIsbn(isbn)) {
      setError(t('manage.form.errors.isbn'));
      return;
    }
    const isbn13 = toIsbn13(isbn);
    try {
      const result = await lookup.mutateAsync(isbn13);
      onDraft({
        values: toFormValues({ ...result.title, isbn: isbn13 }),
        isbn: isbn13,
        lookup: result,
      });
    } catch (e) {
      const notFound = e instanceof ApiError && e.status === 404;
      onDraft({
        values: { ...emptyTitleForm, isbn: isbn13 },
        isbn: isbn13,
        lookupProblem: notFound ? 'notFound' : 'failed',
      });
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        <Field label={t('manage.new.isbnLabel')} hint={t('manage.new.isbnHint')} error={error}>
          {(props) => (
            <div className="relative">
              <Barcode
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                {...props}
                className={`${props.className} h-14 pl-12 text-lg tracking-wide`}
                value={isbn}
                onChange={(e) => {
                  setIsbn(e.target.value);
                  setError(undefined);
                }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
        </Field>
        <Button type="submit" disabled={lookup.isPending}>
          <Search className="size-4" aria-hidden="true" />
          {lookup.isPending ? t('manage.new.searching') : t('manage.new.lookup')}
        </Button>
      </form>

      <div className="border-t border-line pt-6">
        <Button variant="secondary" onClick={() => onDraft({ values: emptyTitleForm })}>
          <PenLine className="size-4" aria-hidden="true" />
          {t('manage.new.withoutIsbn')}
        </Button>
      </div>
    </div>
  );
}

function DraftForm({ draft, onRestart }: { draft: Draft; onRestart: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateTitle();
  const errorMessage = useErrorMessage();
  const index = useSearchIndex();
  const [copies, setCopies] = useState('1');
  const copyCount = Number(copies);
  const copiesValid = Number.isInteger(copyCount) && copyCount >= 0 && copyCount <= 20;
  const duplicates = draft.isbn && index.data ? findByIsbn(index.data, draft.isbn) : [];

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <Alert tone="info">
          {t('manage.new.duplicate')}{' '}
          {duplicates.map((d) => (
            <Link
              key={d.id}
              to={`/manage/titles/${d.id}`}
              className="font-semibold underline underline-offset-4"
            >
              {d.title}
            </Link>
          ))}
        </Alert>
      )}
      {draft.lookup && (
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-surface p-4">
          {draft.lookup.coverUrl && (
            <img
              src={draft.lookup.coverUrl}
              alt=""
              className="h-28 w-20 rounded-md object-cover shadow-sm"
            />
          )}
          <p className="flex-1 text-sm text-muted">
            {t('manage.new.found', { source: draft.lookup.source })}
          </p>
        </div>
      )}
      {draft.lookupProblem && (
        <Alert tone="info">{t(`manage.new.lookupProblem.${draft.lookupProblem}`)}</Alert>
      )}

      <TitleForm
        initialValues={draft.values}
        submitLabel={t('manage.new.save')}
        onSubmit={async (title) => {
          if (!copiesValid) return;
          const { title: created, copiesCreated } = await create.mutateAsync({
            title,
            coverUrl: draft.lookup?.coverUrl,
            copies: copyCount,
          });
          void navigate(`/manage/titles/${created.id}`, {
            state: { flash: 'created', copiesCreated, copiesRequested: copyCount },
          });
        }}
        extra={
          <Field
            label={t('manage.new.copies')}
            hint={t('manage.new.copiesHint')}
            error={copiesValid ? undefined : t('manage.new.copiesError')}
            className="max-w-48"
          >
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                inputMode="numeric"
              />
            )}
          </Field>
        }
        footer={create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        secondaryAction={
          <Button variant="secondary" type="button" onClick={onRestart}>
            {t('manage.new.restart')}
          </Button>
        }
      />
    </div>
  );
}
