import { localDate, type MyBooks } from '@library/shared';
import { Barcode, BookOpen, Camera, Library, LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CameraScanner } from '../../components/CameraScanner';
import { Badge, Button, useErrorMessage } from '../../components/ui/Feedback';
import { cameraAvailable } from '../../lib/barcodeScanner';
import { useConfig } from '../../lib/config';
import { daysBetween, formatDate } from '../../lib/format';
import { useMyBooks } from './api';

/** The next pupil shouldn't see someone else's books: the screen clears itself. */
const SHOW_FOR_MS = 20_000;

/**
 * "Mijn boeken": a device in the library, signed in by a librarian, where pupils scan their
 * own card to see what they have and until when. It only reads; lending stays at the desk.
 */
export function MyBooksPage() {
  const { t, i18n } = useTranslation();
  const { libraryName, logoKey } = useConfig();
  const lookUp = useMyBooks();
  const errorMessage = useErrorMessage();
  const [code, setCode] = useState('');
  const [shown, setShown] = useState<MyBooks | null>(null);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = localDate();

  useEffect(() => {
    document.title = `${t('myBooks.heading')} · ${libraryName}`;
  }, [t, libraryName]);

  // Clear after a while; each new scan starts the time again.
  useEffect(() => {
    if (!shown && !error) return;
    const timer = setTimeout(clear, SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [shown, error]);

  function clear() {
    setShown(null);
    setError('');
    inputRef.current?.focus();
  }

  async function show(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCode('');
    try {
      setShown(await lookUp.mutateAsync(trimmed));
      setError('');
    } catch (failure) {
      setShown(null);
      setError(errorMessage(failure));
    } finally {
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void show(code);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="flex items-center gap-3 px-6 py-5">
        {logoKey ? (
          <img src={`/${logoKey}`} alt="" className="h-12 w-auto max-w-36 object-contain" />
        ) : (
          <Library className="size-8 text-accent" aria-hidden="true" />
        )}
        <span className="font-display text-2xl font-semibold">{libraryName}</span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight">{t('myBooks.heading')}</h1>
          <p className="mt-2 text-lg text-muted">{t('myBooks.instruction')}</p>
        </div>

        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="card" className="sr-only">
            {t('myBooks.cardLabel')}
          </label>
          <div className="relative flex-1">
            <Barcode
              className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              id="card"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-16 w-full rounded-xl border-2 border-accent bg-surface pl-14 pr-4 font-mono text-2xl tracking-wide"
            />
          </div>
          {cameraAvailable() && (
            <Button
              type="button"
              variant="secondary"
              className="h-16"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="size-5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('camera.open')}</span>
            </Button>
          )}
        </form>

        {cameraOpen && (
          <CameraScanner
            formats={['code_128']}
            mode="single"
            onCode={(value) => {
              setCameraOpen(false);
              void show(value);
            }}
            onClose={() => {
              setCameraOpen(false);
              inputRef.current?.focus();
            }}
          />
        )}

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft p-5 text-lg text-danger">
              {error}
            </p>
          )}
          {shown && (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-2xl font-semibold">
                {t('myBooks.hello', { name: shown.firstName })}
              </h2>
              {shown.loans.length === 0 ? (
                <p className="mt-3 text-lg text-muted">{t('myBooks.none')}</p>
              ) : (
                <>
                  <p className="mt-1 text-lg text-muted">
                    {t('myBooks.count', { count: shown.loans.length })}
                  </p>
                  <ul className="mt-4 divide-y divide-line">
                    {shown.loans.map((loan) => {
                      const daysLeft = daysBetween(today, loan.dueDate);
                      return (
                        <li key={loan.id} className="flex items-start gap-3 py-4">
                          <BookOpen
                            className="mt-1 size-6 shrink-0 text-accent"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold">{loan.titleTitle}</p>
                            <p className="text-muted">
                              {t('myBooks.dueOn', {
                                date: formatDate(loan.dueDate, i18n.language),
                              })}
                            </p>
                          </div>
                          {daysLeft < 0 ? (
                            <Badge tone="danger">{t('loans.daysLate', { count: -daysLeft })}</Badge>
                          ) : daysLeft <= 3 ? (
                            <Badge tone="warning">
                              {daysLeft === 0
                                ? t('myBooks.dueToday')
                                : t('myBooks.daysLeft', { count: daysLeft })}
                            </Badge>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <Button variant="secondary" className="mt-4" onClick={clear}>
                {t('myBooks.done')}
              </Button>
            </section>
          )}
        </div>
      </main>

      <footer className="flex justify-end px-6 py-4">
        <Link
          to="/manage/desk"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t('myBooks.exit')}
        </Link>
      </footer>
    </div>
  );
}
