import {
  EXCHANGE_BOOKS_BATCH,
  isValidIsbn,
  TitleInputSchema,
  toIsbn13,
  type AddExchangeBookResult,
  type ExchangeBook,
  type ExchangeDetail,
  type ReturnedExchangeBook,
  type TitleInput,
} from '@library/shared';
import {
  ArrowLeft,
  Barcode,
  BookCheck,
  Camera,
  Download,
  FileUp,
  PackageCheck,
  ScanBarcode,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { CameraScanner } from '../../components/CameraScanner';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { ApiError } from '../../lib/api';
import { cameraAvailable, LIBRARY_LABEL_FORMATS } from '../../lib/barcodeScanner';
import { formatDate } from '../../lib/format';
import { readSpreadsheet, SPREADSHEET_ACCEPT } from '../../lib/spreadsheet';
import { toCsv } from '../export/buildExport';
import { findByIsbn, useSearchIndex } from '../catalog/useSearchIndex';
import { useIsbnLookup } from '../manage/api';
import { useAddExchangeBooks, useExchange, useReturnExchange } from './api';
import { parseLibraryList, type LibraryListResult, type ListBook } from './libraryList';

/**
 * One exchange collection: add its books (scan or the library's list), see where each book
 * is, and send the whole collection back.
 */
export function ExchangePage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const exchange = useExchange(id);
  const errorMessage = useErrorMessage();

  if (exchange.isPending) return <Skeleton className="h-64 w-full" />;
  if (exchange.isError) {
    return (
      <StatusMessage
        icon={<TriangleAlert className="size-6" />}
        title={errorMessage(exchange.error)}
        action={<Button onClick={() => void exchange.refetch()}>{t('errors.retry')}</Button>}
      />
    );
  }
  const data = exchange.data;
  const active = data.status === 'active';

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          to="/manage/exchanges"
          className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('exchange.back')}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
        <p className="text-muted">
          {data.lender} ·{' '}
          {active
            ? t('exchange.returnBy', { date: formatDate(data.returnBy, i18n.language) })
            : t('exchange.returnedOn', {
                date: formatDate(data.returnedOn ?? data.returnBy, i18n.language),
              })}
        </p>
        <p className="text-muted">
          {[
            t('exchange.books', { count: data.books }),
            active && t('exchange.onLoan', { count: data.onLoan }),
            t('exchange.loans', { count: data.loans }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {active ? (
        <>
          <section aria-labelledby="add-books" className="space-y-4">
            <h2 id="add-books" className="text-xl font-semibold">
              {t('exchange.add.heading')}
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ScanBooks exchangeId={id} />
              <ImportList exchangeId={id} />
            </div>
          </section>
          <BookList exchange={data} />
          <ReturnCollection exchange={data} />
        </>
      ) : (
        <>
          <Alert tone="info">{t('exchange.closedHint', { count: data.loans })}</Alert>
          <ReturnedBookList exchange={data} />
        </>
      )}
    </div>
  );
}

type Pending = {
  book: { titleId: string } | { title: TitleInput; coverUrl?: string };
  label: string;
};

/** Per book: scan the ISBN on the back, then the library's barcode label. */
function ScanBooks({ exchangeId }: { exchangeId: string }) {
  const { t } = useTranslation();
  const index = useSearchIndex();
  const lookup = useIsbnLookup();
  const add = useAddExchangeBooks(exchangeId);
  const errorMessage = useErrorMessage();
  const [isbn, setIsbn] = useState('');
  const [manual, setManual] = useState<{ isbn?: string; title: string; author: string }>();
  const [pending, setPending] = useState<Pending>();
  const [barcode, setBarcode] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string }>();
  const [cameraOpen, setCameraOpen] = useState<'isbn' | 'label'>();
  const isbnRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  function readyForBarcode(next: Pending) {
    setPending(next);
    setManual(undefined);
    setMessage(undefined);
    // After React has shown the barcode field.
    setTimeout(() => barcodeRef.current?.focus(), 0);
  }

  async function findIsbn(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!isValidIsbn(trimmed)) {
      setMessage({ tone: 'danger', text: t('exchange.add.invalidIsbn') });
      return;
    }
    const isbn13 = toIsbn13(trimmed);
    const [existing] = index.data ? findByIsbn(index.data, isbn13) : [];
    if (existing) return readyForBarcode({ book: { titleId: existing.id }, label: existing.title });
    try {
      const found = await lookup.mutateAsync(isbn13);
      const title = TitleInputSchema.safeParse({ type: 'book', ...found.title, isbn: isbn13 });
      if (title.success) {
        return readyForBarcode({
          book: { title: title.data, coverUrl: found.coverUrl },
          label: title.data.title,
        });
      }
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        setMessage({ tone: 'danger', text: errorMessage(error) });
      }
    }
    // Not found anywhere: type title and author, the ISBN is kept.
    setManual({ isbn: isbn13, title: '', author: '' });
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    if (!manual) return;
    const title = TitleInputSchema.safeParse({
      type: 'book',
      title: manual.title.trim(),
      authors: manual.author.trim() ? [manual.author.trim()] : [],
      isbn: manual.isbn,
    });
    if (!title.success) {
      setMessage({ tone: 'danger', text: t('exchange.add.titleRequired') });
      return;
    }
    readyForBarcode({ book: { title: title.data }, label: title.data.title });
  }

  async function addWithBarcode(value: string) {
    const code = value.trim();
    if (!pending || !code) return;
    // The ISBN on the back is also a barcode: a camera (or a hurried scan) may read it instead.
    const isbnOfThisBook = 'title' in pending.book ? pending.book.title.isbn : undefined;
    if (code === isbnOfThisBook || (/^97[89]\d{10}$/.test(code) && isValidIsbn(code))) {
      setMessage({ tone: 'danger', text: t('exchange.add.thatIsTheIsbn') });
      setBarcode('');
      barcodeRef.current?.focus();
      return;
    }
    const [result] = await add.mutateAsync([{ ...pending.book, barcode: code }]);
    if (result?.status === 'added') {
      setMessage({
        tone: 'success',
        text: t('exchange.add.added', { title: pending.label, barcode: code }),
      });
      setPending(undefined);
      setIsbn('');
      setBarcode('');
      setTimeout(() => isbnRef.current?.focus(), 0);
    } else {
      setMessage({
        tone: 'danger',
        text: t(`errors.${result?.code ?? 'UNKNOWN'}`, { defaultValue: t('errors.UNKNOWN') }),
      });
      setBarcode(code);
      barcodeRef.current?.select();
    }
  }

  function submitBarcode(event: FormEvent) {
    event.preventDefault();
    void addWithBarcode(barcode);
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <ScanBarcode className="size-5 text-accent" aria-hidden="true" />
        {t('exchange.add.scanHeading')}
      </h3>
      <p className="text-sm text-muted">{t('exchange.add.scanHint')}</p>

      {!pending && !manual && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void findIsbn(isbn);
          }}
          className="flex gap-2"
        >
          <label htmlFor="exchange-isbn" className="sr-only">
            {t('exchange.add.isbn')}
          </label>
          <input
            ref={isbnRef}
            id="exchange-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder={t('exchange.add.isbn')}
            autoComplete="off"
            inputMode="numeric"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-lg"
          />
          {cameraAvailable() && (
            <Button type="button" variant="secondary" onClick={() => setCameraOpen('isbn')}>
              <Camera className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('camera.open')}</span>
            </Button>
          )}
          <Button type="submit" disabled={lookup.isPending}>
            {lookup.isPending ? t('manage.new.searching') : t('exchange.add.find')}
          </Button>
        </form>
      )}
      {!pending && !manual && (
        <button
          type="button"
          className="text-sm font-medium text-accent underline underline-offset-2"
          onClick={() => setManual({ title: '', author: '' })}
        >
          {t('exchange.add.noIsbn')}
        </button>
      )}

      {cameraOpen === 'isbn' && (
        <CameraScanner
          formats={['ean_13']}
          mode="single"
          onCode={(code) => {
            setIsbn(code);
            void findIsbn(code);
          }}
          onClose={() => setCameraOpen(undefined)}
        />
      )}
      {cameraOpen === 'label' && (
        <CameraScanner
          formats={LIBRARY_LABEL_FORMATS}
          mode="single"
          hint={t('exchange.add.cameraLabelHint')}
          onCode={(code) => {
            setBarcode(code);
            void addWithBarcode(code);
          }}
          onClose={() => setCameraOpen(undefined)}
        />
      )}

      {manual && (
        <form onSubmit={submitManual} className="space-y-3">
          <p className="text-sm">
            {manual.isbn ? t('exchange.add.notFound') : t('exchange.add.typeTitle')}
          </p>
          <input
            autoFocus
            value={manual.title}
            onChange={(e) => setManual({ ...manual, title: e.target.value })}
            placeholder={t('manage.form.title')}
            aria-label={t('manage.form.title')}
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          />
          <input
            value={manual.author}
            onChange={(e) => setManual({ ...manual, author: e.target.value })}
            placeholder={t('exchange.add.author')}
            aria-label={t('exchange.add.author')}
            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          />
          <div className="flex gap-2">
            <Button type="submit">{t('exchange.add.next')}</Button>
            <Button type="button" variant="secondary" onClick={() => setManual(undefined)}>
              {t('exchange.form.cancel')}
            </Button>
          </div>
        </form>
      )}

      {pending && (
        <form onSubmit={(e) => void submitBarcode(e)} className="space-y-2">
          <p className="font-medium">{pending.label}</p>
          <label htmlFor="exchange-barcode" className="block text-sm">
            {t('exchange.add.barcode')}
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Barcode
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                ref={barcodeRef}
                id="exchange-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                autoComplete="off"
                className="min-h-12 w-full rounded-lg border-2 border-accent bg-surface pl-10 pr-3 font-mono text-lg"
              />
            </div>
            {cameraAvailable() && (
              <Button type="button" variant="secondary" onClick={() => setCameraOpen('label')}>
                <Camera className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t('camera.open')}</span>
              </Button>
            )}
            <Button type="submit" disabled={add.isPending}>
              {t('exchange.add.addBook')}
            </Button>
          </div>
          <button
            type="button"
            className="text-sm text-muted underline underline-offset-2"
            onClick={() => {
              setPending(undefined);
              setTimeout(() => isbnRef.current?.focus(), 0);
            }}
          >
            {t('exchange.add.otherBook')}
          </button>
        </form>
      )}

      <div aria-live="polite">{message && <Alert tone={message.tone}>{message.text}</Alert>}</div>
    </div>
  );
}

type ImportOutcome = { added: number; failed: Array<{ line: number; code: string }> };

/** The library's list (Excel or CSV): all books in one go. */
function ImportList({ exchangeId }: { exchangeId: string }) {
  const { t } = useTranslation();
  const index = useSearchIndex();
  const lookup = useIsbnLookup();
  const add = useAddExchangeBooks(exchangeId);
  const [parsed, setParsed] = useState<
    LibraryListResult | { ok: false; error: 'oldExcel' | 'unreadable' }
  >();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [outcome, setOutcome] = useState<ImportOutcome>();

  async function readFile(file: File | undefined) {
    if (!file) return;
    setOutcome(undefined);
    const sheet = await readSpreadsheet(file);
    setParsed(sheet.ok ? parseLibraryList(sheet.rows) : sheet);
  }

  const books = parsed?.ok ? parsed.rows.flatMap((row) => (row.ok ? [row.book] : [])) : [];
  const skipped = parsed?.ok ? parsed.rows.filter((row) => !row.ok).length : 0;

  /** A row → what the server needs: an existing title, or the data for a new one. */
  async function toBook(
    row: ListBook,
    created: Map<string, string>,
  ): Promise<ExchangeBook | undefined> {
    const existing =
      row.isbn &&
      ((index.data && findByIsbn(index.data, row.isbn)[0]?.id) || created.get(row.isbn));
    if (existing) return { barcode: row.barcode, titleId: existing };
    let title: Partial<TitleInput> = {
      title: row.title,
      authors: row.authors,
      aviLevel: row.aviLevel,
    };
    let coverUrl: string | undefined;
    if (row.isbn) {
      // The lookup adds a cover and details; the list's own title and AVI level win.
      try {
        const found = await lookup.mutateAsync(row.isbn);
        title = {
          ...found.title,
          ...Object.fromEntries(
            Object.entries(title).filter(
              ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
            ),
          ),
        };
        coverUrl = found.coverUrl;
      } catch {
        // Not found or lookup unavailable: the list's data is enough if it has a title.
      }
    }
    const parsedTitle = TitleInputSchema.safeParse({ type: 'book', ...title, isbn: row.isbn });
    return parsedTitle.success
      ? { barcode: row.barcode, title: parsedTitle.data, coverUrl }
      : undefined;
  }

  async function runImport() {
    const created = new Map<string, string>();
    const result: ImportOutcome = { added: 0, failed: [] };
    setProgress({ done: 0, total: books.length });
    try {
      for (let start = 0; start < books.length; start += EXCHANGE_BOOKS_BATCH) {
        const rows = books.slice(start, start + EXCHANGE_BOOKS_BATCH);
        const prepared: Array<{ row: ListBook; book: ExchangeBook }> = [];
        for (const row of rows) {
          const book = await toBook(row, created);
          if (book) prepared.push({ row, book });
          else result.failed.push({ line: row.line, code: 'NOT_FOUND' });
        }
        if (prepared.length > 0) {
          const response: AddExchangeBookResult[] = await add.mutateAsync(
            prepared.map((p) => p.book),
          );
          for (const r of response) {
            const source = prepared[r.index];
            if (!source) continue;
            if (r.status === 'added') {
              result.added++;
              // The same ISBN in a later batch gets this title, not a second one.
              if (source.row.isbn && 'title' in source.book)
                created.set(source.row.isbn, r.titleId);
            } else {
              result.failed.push({ line: source.row.line, code: r.code });
            }
          }
        }
        setProgress({ done: Math.min(start + rows.length, books.length), total: books.length });
      }
    } finally {
      setProgress(undefined);
      setOutcome(result);
      setParsed(undefined);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <FileUp className="size-5 text-accent" aria-hidden="true" />
        {t('exchange.import.heading')}
      </h3>
      <p className="text-sm text-muted">{t('exchange.import.hint')}</p>
      <ListExample />
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-4 font-medium hover:bg-surface-sunken focus-within:outline-2 focus-within:outline-accent">
        <FileUp className="size-4" aria-hidden="true" />
        {t('readers.importPage.chooseFile')}
        <input
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="sr-only"
          onChange={(e) => void readFile(e.target.files?.[0])}
        />
      </label>

      {parsed && !parsed.ok && (
        <Alert tone="danger">
          {t(`exchange.import.errors.${parsed.error}`, {
            defaultValue: t(`readers.importPage.errors.${parsed.error}`),
          })}
        </Alert>
      )}
      {parsed?.ok && (
        <div className="space-y-3">
          <p>
            {t('exchange.import.ready', { count: books.length })}
            {skipped > 0 && ` ${t('exchange.import.skipped', { count: skipped })}`}
          </p>
          {progress ? (
            <p role="status">
              {t('readers.importPage.progress', { done: progress.done, total: progress.total })}
            </p>
          ) : (
            <Button onClick={() => void runImport()} disabled={books.length === 0}>
              <Upload className="size-4" aria-hidden="true" />
              {t('exchange.import.run', { count: books.length })}
            </Button>
          )}
        </div>
      )}
      {outcome && (
        <Alert tone={outcome.failed.length > 0 ? 'danger' : 'success'}>
          {t('exchange.import.result', { added: outcome.added, failed: outcome.failed.length })}
          {outcome.failed.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {outcome.failed.map((f) => (
                <li key={f.line}>
                  {t('readers.importPage.failedLine', { line: f.line })}{' '}
                  {t(`exchange.import.failed.${f.code}`, {
                    defaultValue: t(`errors.${f.code}`, { defaultValue: t('errors.UNKNOWN') }),
                  })}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}

/** Two example books, the columns the import reads. Translated, since both languages are read. */
function exampleRows(t: (key: string) => string) {
  return {
    header: ['barcode', 'title', 'author', 'isbn', 'avi'].map((c) =>
      t(`exchange.import.example.${c}`),
    ),
    rows: [
      ['34567001', 'Dolfje Weerwolfje', 'Paul van Loon', '9789025870447', 'E4'],
      ['34567002', 'Kikker is verliefd', 'Max Velthuijs', '', 'Start'],
      ['34567003', '', '', '9789047708421', ''],
    ],
  };
}

/** What the library's list must look like, with a file to pass on to the library. */
function ListExample() {
  const { t } = useTranslation();
  const { header, rows } = exampleRows(t);

  function download() {
    const csv = toCsv(
      rows,
      header.map((name, i) => [name, (row: string[]) => row[i]]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('exchange.import.example.fileName')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-x-auto rounded-lg border border-line">
        <table className="w-full whitespace-nowrap text-left text-xs">
          <caption className="sr-only">{t('exchange.import.example.caption')}</caption>
          <thead className="bg-surface-sunken">
            <tr>
              {header.map((name) => (
                <th key={name} scope="col" className="px-2 py-1.5 font-semibold">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td key={header[i]} className="px-2 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">{t('exchange.import.example.explain')}</p>
      <button
        type="button"
        onClick={download}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-2"
      >
        <Download className="size-4" aria-hidden="true" />
        {t('exchange.import.example.download')}
      </button>
    </div>
  );
}

/** Every book with where it is: on the shelf, with whom, or missing. */
function BookList({ exchange }: { exchange: ExchangeDetail }) {
  const { t, i18n } = useTranslation();
  if (exchange.bookList.length === 0) return null;
  const rows = exchange.bookList.map((book) => ({
    barcode: book.barcode,
    title: book.title?.title ?? '?',
    authors: book.title?.authors ?? [],
    isbn: book.title?.isbn,
    aviLevel: book.title?.aviLevel,
    loans: book.loans,
  }));
  return (
    <section aria-labelledby="exchange-books" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="exchange-books" className="text-xl font-semibold">
          {t('exchange.list.heading')}
        </h2>
        <DownloadBooks exchange={exchange} rows={rows} />
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('loans.title')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('exchange.list.barcode')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('exchange.list.where')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('exchange.list.loans')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {exchange.bookList.map((book) => (
              <tr key={book.id}>
                <td className="px-4 py-3">
                  <Link to={`/manage/titles/${book.titleId}`} className="hover:underline">
                    {book.title?.title ?? '?'}
                  </Link>
                  {book.title?.aviLevel && (
                    <span className="ml-2 text-muted">AVI {book.title.aviLevel}</span>
                  )}
                  {book.title?.isbn && (
                    <span className="block text-xs text-muted">ISBN {book.title.isbn}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono">{book.barcode}</td>
                <td className="px-4 py-3">
                  {book.status === 'onLoan' && book.loan ? (
                    <span>
                      {book.loan.readerName}
                      {book.loan.readerGroup && ` (${book.loan.readerGroup})`} ·{' '}
                      {t('exchange.list.until', {
                        date: formatDate(book.loan.dueDate, i18n.language),
                      })}
                    </span>
                  ) : book.status === 'available' ? (
                    <Badge tone="success">{t('exchange.list.inLibrary')}</Badge>
                  ) : (
                    <Badge tone="warning">{t(`copyStatus.${book.status}`)}</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{book.loans}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type BookRow = ReturnedExchangeBook;

/** The list for the library's evaluation: every book with how often it was lent. */
function DownloadBooks({ exchange, rows }: { exchange: ExchangeDetail; rows: BookRow[] }) {
  const { t } = useTranslation();
  function download() {
    const csv = toCsv(rows, [
      [t('exchange.import.example.barcode'), (r) => r.barcode],
      [t('exchange.import.example.title'), (r) => r.title],
      [t('exchange.import.example.author'), (r) => r.authors.join(', ')],
      [t('exchange.import.example.isbn'), (r) => r.isbn],
      [t('exchange.import.example.avi'), (r) => r.aviLevel],
      [t('exchange.list.loans'), (r) => r.loans],
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exchange.lender} - ${exchange.name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="secondary" onClick={download}>
      <Download className="size-4" aria-hidden="true" />
      {t('exchange.list.download')}
    </Button>
  );
}

/** After returning: the books it had, most lent first (saved when it went back). */
function ReturnedBookList({ exchange }: { exchange: ExchangeDetail }) {
  const { t } = useTranslation();
  const books = exchange.returnedBooks;
  if (!books) return <p className="text-muted">{t('exchange.list.notSaved')}</p>;
  return (
    <section aria-labelledby="returned-books" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="returned-books" className="text-xl font-semibold">
          {t('exchange.list.returnedHeading', { count: books.length })}
        </h2>
        <DownloadBooks exchange={exchange} rows={books} />
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('loans.title')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('exchange.list.barcode')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('exchange.list.loans')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {books.map((book) => (
              <tr key={book.barcode}>
                <td className="px-4 py-3">
                  {book.title}
                  {book.aviLevel && <span className="ml-2 text-muted">AVI {book.aviLevel}</span>}
                  {(book.authors.length > 0 || book.isbn) && (
                    <span className="block text-xs text-muted">
                      {[book.authors.join(', '), book.isbn && `ISBN ${book.isbn}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono">{book.barcode}</td>
                <td className="px-4 py-3 text-right tabular-nums">{book.loans}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Sending the collection back: only when every book is in, with the consequence named. */
function ReturnCollection({ exchange }: { exchange: ExchangeDetail }) {
  const { t } = useTranslation();
  const returnExchange = useReturnExchange(exchange.id);
  const errorMessage = useErrorMessage();
  const [confirming, setConfirming] = useState(false);
  if (exchange.books === 0) return null;

  return (
    <section
      aria-labelledby="exchange-return"
      className="space-y-3 rounded-xl border border-line bg-surface p-5"
    >
      <h2 id="exchange-return" className="text-xl font-semibold">
        {t('exchange.return.heading')}
      </h2>
      {exchange.onLoan > 0 ? (
        <Alert tone="danger">{t('exchange.return.stillOut', { count: exchange.onLoan })}</Alert>
      ) : (
        <p>{t('exchange.return.allIn', { count: exchange.books })}</p>
      )}
      {confirming ? (
        <div className="space-y-3">
          <p className="font-medium">{t('exchange.return.confirm', { count: exchange.books })}</p>
          <div className="flex gap-2">
            <Button
              onClick={() => void returnExchange.mutateAsync().then(() => setConfirming(false))}
              disabled={returnExchange.isPending}
            >
              <BookCheck className="size-4" aria-hidden="true" />
              {t('exchange.return.yes')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('exchange.form.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} disabled={exchange.onLoan > 0}>
          <PackageCheck className="size-4" aria-hidden="true" />
          {t('exchange.return.button')}
        </Button>
      )}
      {returnExchange.isError && <Alert tone="danger">{errorMessage(returnExchange.error)}</Alert>}
    </section>
  );
}
