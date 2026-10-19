import { isValidIsbn, toIsbn13, type IsbnLookupResult } from '@library/shared';
import { ArrowLeft, Barcode, Camera, PenLine, Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { CameraScanner } from '../../components/CameraScanner';
import { ApiError } from '../../lib/api';
import { cameraAvailable } from '../../lib/barcodeScanner';
import { findByIsbn, useSearchIndex } from '../catalog/useSearchIndex';
import { useAddCopyToTitle, useCreateTitle, useIsbnLookup } from './api';
import { TitleForm } from './TitleForm';
import { emptyTitleForm, toFormValues, type TitleFormValues } from './titleFormValues';
import { useConfig } from '../../lib/config';

type Draft = {
  values: TitleFormValues;
  isbn?: string;
  lookup?: IsbnLookupResult;
  /** Why there is no lookup data, if we tried. */
  lookupProblem?: 'notFound' | 'failed';
};

/** What was just added, shown while the librarian continues with the next book. */
type Added =
  | { kind: 'title'; id: string; title: string; copies: number }
  | { kind: 'copy'; id: string; title: string; barcode: string };

/**
 * Adding books is optimised for a librarian with a stack of books and a barcode scanner:
 * scan the ISBN, check what we found, save, next. A book that is already in the catalogue
 * gets an extra copy in one click. The location is kept between books.
 */
export function NewTitlePage() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>();
  const [location, setLocation] = useState('');
  const [added, setAdded] = useState<Added>();

  function next(info: Added) {
    setAdded(info);
    setDraft(undefined);
  }

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
      {added && <AddedMessage added={added} />}
      {draft ? (
        <DraftForm
          draft={draft}
          location={location}
          onLocation={setLocation}
          onRestart={() => setDraft(undefined)}
          onSavedNext={next}
        />
      ) : (
        <IsbnStep
          location={location}
          onLocation={setLocation}
          onDraft={(d) => {
            setAdded(undefined);
            setDraft(d);
          }}
          onCopyAdded={setAdded}
        />
      )}
    </div>
  );
}

function AddedMessage({ added }: { added: Added }) {
  const { t } = useTranslation();
  return (
    <Alert
      tone="success"
      action={
        <Link
          to={`/manage/titles/${added.id}`}
          className="font-medium underline underline-offset-4"
        >
          {t('manage.new.view')}
        </Link>
      }
    >
      {added.kind === 'title'
        ? t('manage.new.addedTitle', { title: added.title, count: added.copies })
        : t('manage.new.addedCopy', { title: added.title, barcode: added.barcode })}
    </Alert>
  );
}

function LocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { kind } = useConfig();
  return (
    <Field
      label={t('manage.new.location')}
      hint={t('manage.new.locationHint', { context: kind })}
      className="max-w-xs"
    >
      {(props) => (
        <input
          {...props}
          className={`${props.className} ${inputHeight}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

function IsbnStep({
  location,
  onLocation,
  onDraft,
  onCopyAdded,
}: {
  location: string;
  onLocation: (location: string) => void;
  onDraft: (draft: Draft) => void;
  onCopyAdded: (added: Added) => void;
}) {
  const { t } = useTranslation();
  const lookup = useIsbnLookup();
  const addCopy = useAddCopyToTitle();
  const errorMessage = useErrorMessage();
  const index = useSearchIndex();
  const [isbn, setIsbn] = useState('');
  const [error, setError] = useState<string>();
  const [cameraOpen, setCameraOpen] = useState(false);
  // An ISBN that's already in the catalogue: offer a copy instead of a duplicate title.
  const [known, setKnown] = useState<{ isbn13: string; id: string; title: string }>();

  async function lookUp(isbn13: string) {
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    await check(isbn);
  }

  async function check(value: string) {
    setKnown(undefined);
    if (!isValidIsbn(value)) {
      setError(t('manage.form.errors.isbn'));
      return;
    }
    const isbn13 = toIsbn13(value);
    const [existing] = index.data ? findByIsbn(index.data, isbn13) : [];
    if (existing) setKnown({ isbn13, ...existing });
    else await lookUp(isbn13);
  }

  async function addToKnown() {
    if (!known) return;
    try {
      const copy = await addCopy.mutateAsync({
        titleId: known.id,
        location: location.trim() || undefined,
      });
      onCopyAdded({ kind: 'copy', id: known.id, title: known.title, barcode: copy.barcode });
      setKnown(undefined);
      setIsbn('');
      document.getElementById('isbn-scan')?.focus();
    } catch {
      // Shown below.
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
                id="isbn-scan"
                className={`${props.className} h-14 pl-12 text-lg tracking-wide`}
                value={isbn}
                onChange={(e) => {
                  setIsbn(e.target.value);
                  setError(undefined);
                  setKnown(undefined);
                }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={lookup.isPending}>
            <Search className="size-4" aria-hidden="true" />
            {lookup.isPending ? t('manage.new.searching') : t('manage.new.lookup')}
          </Button>
          {cameraAvailable() && (
            <Button type="button" variant="secondary" onClick={() => setCameraOpen(true)}>
              <Camera className="size-4" aria-hidden="true" />
              {t('camera.scanIsbn')}
            </Button>
          )}
        </div>
      </form>
      {cameraOpen && (
        <CameraScanner
          formats={['ean_13']}
          mode="single"
          onCode={(code) => {
            setIsbn(code);
            setError(undefined);
            void check(code);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {known && (
        <section
          role="status"
          className="space-y-3 rounded-xl border border-accent bg-accent-soft p-4"
        >
          <p>
            {t('manage.new.known')}{' '}
            <Link
              to={`/manage/titles/${known.id}`}
              className="font-semibold underline underline-offset-4"
            >
              {known.title}
            </Link>
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Focused, so pressing Enter adds the copy right away. */}
            <Button autoFocus onClick={() => void addToKnown()} disabled={addCopy.isPending}>
              <Plus className="size-4" aria-hidden="true" />
              {t('manage.new.addCopy')}
            </Button>
            <Button variant="secondary" onClick={() => void lookUp(known.isbn13)}>
              {t('manage.new.newTitleAnyway')}
            </Button>
          </div>
          {addCopy.isError && <Alert tone="danger">{errorMessage(addCopy.error)}</Alert>}
        </section>
      )}

      <LocationField value={location} onChange={onLocation} />

      <div className="border-t border-line pt-6">
        <Button variant="secondary" onClick={() => onDraft({ values: emptyTitleForm })}>
          <PenLine className="size-4" aria-hidden="true" />
          {t('manage.new.withoutIsbn')}
        </Button>
      </div>
    </div>
  );
}

function DraftForm({
  draft,
  location,
  onLocation,
  onRestart,
  onSavedNext,
}: {
  draft: Draft;
  location: string;
  onLocation: (location: string) => void;
  onRestart: () => void;
  onSavedNext: (added: Added) => void;
}) {
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
        alternativeSubmitLabel={t('manage.new.saveAndNext')}
        onSubmit={async (title, { alternative }) => {
          if (!copiesValid) return;
          const { title: created, copiesCreated } = await create.mutateAsync({
            title,
            coverUrl: draft.lookup?.coverUrl,
            copies: copyCount,
            location: location.trim() || undefined,
          });
          // If some copies failed, go to the title page, which explains what's missing.
          if (alternative && copiesCreated === copyCount) {
            onSavedNext({
              kind: 'title',
              id: created.id,
              title: created.title,
              copies: copiesCreated,
            });
            return;
          }
          void navigate(`/manage/titles/${created.id}`, {
            state: { flash: 'created', copiesCreated, copiesRequested: copyCount },
          });
        }}
        extra={
          <div className="flex flex-wrap gap-4">
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
            <LocationField value={location} onChange={onLocation} />
          </div>
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
