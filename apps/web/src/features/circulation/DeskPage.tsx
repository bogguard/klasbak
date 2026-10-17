import {
  isOverdue,
  localDate,
  readerName,
  type ReaderAtDesk,
  type ScanResult,
} from '@library/shared';
import {
  Barcode,
  BookCheck,
  Camera,
  CameraOff,
  BookUp,
  CircleAlert,
  Info,
  MonitorSmartphone,
  Printer,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge, Button, useErrorMessage } from '../../components/ui/Feedback';
import { formatDate } from '../../lib/format';
import { useReaders } from '../readers/api';
import { CameraScanner } from '../../components/CameraScanner';
import { cameraAvailable } from '../../lib/barcodeScanner';
import { useRenew, useScan } from './api';
import { LoanTicket } from './LoanTicket';
import { playFeedback } from './sound';

type Tone = 'success' | 'info' | 'danger';
type Feedback = { id: number; tone: Tone; title: string; detail?: string };

const SOUND_KEY = 'desk-sound';

/** Without scans for this long, the reader is cleared so the next child can't borrow on their card. */
const IDLE_MS = 60_000;
/** The countdown becomes visible this long before clearing. */
const WARN_MS = 20_000;

function isEditable(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function storedSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * The lending desk, built for a barcode scanner: the scan field always has focus, Enter
 * submits, and the result is shown big, announced to screen readers and confirmed by a beep.
 * Scans are queued, so scanning a stack of books quickly never loses one.
 */
export function DeskPage() {
  const { t, i18n } = useTranslation();
  const scan = useScan();
  const renew = useRenew();
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const [code, setCode] = useState('');
  const [desk, setDesk] = useState<ReaderAtDesk>();
  const deskRef = useRef<ReaderAtDesk | undefined>(undefined);
  const [log, setLog] = useState<Feedback[]>([]);
  const [soundOn, setSoundOn] = useState(storedSound);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ticket, setTicket] = useState<ReaderAtDesk>();
  // Last scan or reader change; state for rendering the countdown, ref for the timer.
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const lastActivityRef = useRef(lastActivity);
  const [now, setNow] = useState(() => Date.now());

  function markActivity() {
    const at = Date.now();
    lastActivityRef.current = at;
    setLastActivity(at);
  }

  function updateDesk(next: ReaderAtDesk | undefined) {
    deskRef.current = next;
    setDesk(next);
    markActivity();
  }

  function show(tone: Tone, title: string, detail?: string) {
    setLog((current) =>
      [{ id: Date.now() + Math.random(), tone, title, detail }, ...current].slice(0, 8),
    );
    if (soundOn) playFeedback(tone === 'danger' ? 'error' : 'success');
  }

  function handle(result: ScanResult) {
    const due = (date: string) => formatDate(date, i18n.language);
    switch (result.outcome) {
      case 'reader': {
        updateDesk(result);
        const name = readerName(result.reader);
        const late = result.activeLoans.filter((loan) => isOverdue(loan, localDate())).length;
        if (!result.reader.active) show('danger', t('errors.READER_INACTIVE'), name);
        // Late books deserve attention before anything new is lent.
        else if (late > 0) show('danger', t('desk.feedback.hasLateBooks', { name, count: late }));
        else show('info', t('desk.feedback.reader', { name }));
        break;
      }
      case 'checkedOut':
        updateDesk(result);
        show(
          'success',
          t('desk.feedback.checkedOut', { title: result.loan.titleTitle }),
          t('desk.feedback.dueOn', { date: due(result.loan.dueDate) }),
        );
        break;
      case 'alreadyLoaned':
        updateDesk(result);
        show('info', t('desk.feedback.alreadyLoaned', { title: result.loan.titleTitle }));
        break;
      case 'returned': {
        const current = deskRef.current;
        if (current?.reader.id === result.loan.readerId) {
          updateDesk({
            reader: { ...current.reader, activeLoanCount: current.reader.activeLoanCount - 1 },
            activeLoans: current.activeLoans.filter((loan) => loan.id !== result.loan.id),
          });
        }
        const from = [result.loan.readerName, result.loan.readerGroup].filter(Boolean).join(', ');
        const returned = result.wasOverdue
          ? t('desk.feedback.returnedLate', { from, date: due(result.loan.dueDate) })
          : t('desk.feedback.returnedFrom', { from });
        // Someone else's book while a reader is at the desk: probably meant to be lent to them.
        const lendHint =
          current && current.reader.id !== result.loan.readerId
            ? ` ${t('desk.feedback.scanAgainToLend', { name: readerName(current.reader) })}`
            : '';
        show(
          'success',
          t('desk.feedback.returned', { title: result.loan.titleTitle }),
          returned + lendHint,
        );
        break;
      }
      case 'alreadyReturned':
        show('info', t('desk.feedback.alreadyReturned', { title: result.title.title }));
        break;
    }
  }

  async function processQueue() {
    if (busy.current) return;
    busy.current = true;
    try {
      for (let next = queue.current.shift(); next; next = queue.current.shift()) {
        markActivity();
        try {
          handle(await scan.mutateAsync({ code: next, readerId: deskRef.current?.reader.id }));
        } catch (error) {
          show('danger', errorMessage(error), next);
        }
      }
    } finally {
      busy.current = false;
      inputRef.current?.focus();
    }
  }

  function enqueue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    queue.current.push(trimmed);
    void processQueue();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    enqueue(code);
    setCode('');
  }

  /**
   * Frees the desk for the next reader, with a quiet message on top, so nobody still sees
   * "… is at the desk" and thinks the previous reader is selected.
   */
  const clearDesk = useCallback(
    (reason: 'manual' | 'idle') => {
      // Nobody at the desk for a minute: the camera stops too (battery, privacy).
      if (reason === 'idle') setCameraOpen(false);
      if (!deskRef.current) return;
      deskRef.current = undefined;
      setDesk(undefined);
      setLog((current) =>
        [
          {
            id: Date.now() + Math.random(),
            tone: 'info' as const,
            title: t(`desk.cleared.${reason}`),
          },
          ...current,
        ].slice(0, 8),
      );
      inputRef.current?.focus();
    },
    [t],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape = "next reader", so the librarian never needs the mouse between pupils.
      if (event.key === 'Escape') {
        clearDesk('manual');
        return;
      }
      // A scanner "types" the code. If the focus is somewhere else (someone clicked the page),
      // move it to the scan field first so the code lands there instead of getting lost.
      const typing = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (typing && !isEditable(document.activeElement)) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearDesk]);

  // Clear the reader after a minute without scans (with a visible countdown first).
  useEffect(() => {
    if (!desk) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - lastActivityRef.current >= IDLE_MS) clearDesk('idle');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [desk, clearDesk]);
  const remainingMs = IDLE_MS - (now - lastActivity);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Not remembered; fine.
    }
  }

  const [latest, ...earlier] = log;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('desk.heading')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/kiosk"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-surface-sunken"
          >
            <MonitorSmartphone className="size-4" aria-hidden="true" />
            {t('myBooks.open')}
          </Link>
          <Button variant="secondary" onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? (
              <Volume2 className="size-4" aria-hidden="true" />
            ) : (
              <VolumeX className="size-4" aria-hidden="true" />
            )}
            {soundOn ? t('desk.soundOn') : t('desk.soundOff')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <form onSubmit={submit}>
            <label htmlFor="scan" className="mb-1.5 block font-medium">
              {t('desk.scanLabel')}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode
                  className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  id="scan"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="scan-hint"
                  className="h-16 w-full rounded-xl border-2 border-accent bg-surface pl-14 pr-4 font-mono text-2xl tracking-wide"
                />
              </div>
              {cameraAvailable() && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-16"
                  aria-pressed={cameraOpen}
                  onClick={() => {
                    setCameraOpen((open) => !open);
                    inputRef.current?.focus();
                  }}
                >
                  {cameraOpen ? (
                    <CameraOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Camera className="size-5" aria-hidden="true" />
                  )}
                  <span className="sr-only sm:not-sr-only">
                    {cameraOpen ? t('camera.off') : t('camera.open')}
                  </span>
                </Button>
              )}
            </div>
            <p id="scan-hint" className="mt-1.5 text-sm text-muted">
              {t('desk.scanHint')}
            </p>
          </form>

          {cameraOpen && (
            <CameraScanner
              // Only our labels and reader cards; the ISBN on the back of a book is ignored.
              formats={['code_128']}
              mode="continuous"
              // In the page, so the result of each scan and the reader stay in sight.
              inline
              onCode={enqueue}
              onClose={() => {
                setCameraOpen(false);
                inputRef.current?.focus();
              }}
            />
          )}

          <div aria-live="polite" aria-atomic="true">
            {latest ? (
              <FeedbackCard feedback={latest} large />
            ) : (
              <p className="text-muted">{t('desk.start')}</p>
            )}
          </div>

          {earlier.length > 0 && (
            <section aria-labelledby="desk-log">
              <h2 id="desk-log" className="mb-2 text-sm font-medium text-muted">
                {t('desk.earlier')}
              </h2>
              <ul className="space-y-2">
                {earlier.map((item) => (
                  <li key={item.id}>
                    <FeedbackCard feedback={item} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <ReaderPanel
          secondsLeft={
            remainingMs <= WARN_MS ? Math.max(0, Math.ceil(remainingMs / 1000)) : undefined
          }
          onStay={() => {
            markActivity();
            inputRef.current?.focus();
          }}
          desk={desk}
          onPrintTicket={() => {
            markActivity();
            setTicket(deskRef.current);
          }}
          onNextReader={() => clearDesk('manual')}
          onPickReader={(memberNumber) => enqueue(memberNumber)}
          onRenew={(loanId) => {
            const reader = deskRef.current?.reader;
            if (!reader) return;
            markActivity();
            renew
              .mutateAsync({ readerId: reader.id, loanId })
              .then((result) => {
                updateDesk({ reader: result.reader, activeLoans: result.activeLoans });
                show(
                  'success',
                  t('desk.feedback.renewed', { title: result.loan.titleTitle }),
                  t('desk.feedback.dueOn', {
                    date: formatDate(result.loan.dueDate, i18n.language),
                  }),
                );
              })
              .catch((error: unknown) => show('danger', errorMessage(error)))
              .finally(() => inputRef.current?.focus());
          }}
        />
      </div>
      {ticket && (
        <LoanTicket
          desk={ticket}
          onDone={() => {
            setTicket(undefined);
            markActivity();
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function FeedbackCard({ feedback, large = false }: { feedback: Feedback; large?: boolean }) {
  const styles: Record<Tone, string> = {
    success: 'border-success/30 bg-success-soft text-success',
    info: 'border-line bg-surface text-ink',
    danger: 'border-danger/30 bg-danger-soft text-danger',
  };
  const Icon =
    feedback.tone === 'success' ? BookCheck : feedback.tone === 'danger' ? CircleAlert : Info;
  return (
    <div
      role={large && feedback.tone === 'danger' ? 'alert' : undefined}
      className={`flex items-start gap-3 rounded-xl border ${styles[feedback.tone]} ${large ? 'p-5' : 'px-4 py-2 opacity-80'}`}
    >
      <Icon className={`${large ? 'size-7' : 'size-4'} mt-0.5 shrink-0`} aria-hidden="true" />
      <div>
        <p className={large ? 'text-xl font-semibold' : 'text-sm font-medium'}>{feedback.title}</p>
        {feedback.detail && <p className={large ? 'mt-1' : 'text-sm'}>{feedback.detail}</p>}
      </div>
    </div>
  );
}

function ReaderPanel({
  desk,
  secondsLeft,
  onStay,
  onPrintTicket,
  onNextReader,
  onPickReader,
  onRenew,
}: {
  desk: ReaderAtDesk | undefined;
  /** Set during the last seconds before the reader is cleared automatically. */
  secondsLeft: number | undefined;
  onStay: () => void;
  onPrintTicket: () => void;
  onNextReader: () => void;
  onPickReader: (memberNumber: string) => void;
  onRenew: (loanId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = localDate();

  if (!desk) return <ReaderSearch onPick={onPickReader} />;

  const { reader, activeLoans } = desk;
  const late = activeLoans.filter((loan) => isOverdue(loan, today)).length;
  return (
    <aside
      aria-labelledby="desk-reader"
      className="space-y-4 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent-soft p-2.5 text-accent">
          <UserRound className="size-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="desk-reader" className="text-xl font-semibold">
            {readerName(reader)}
          </h2>
          <p className="text-muted">
            {[reader.group, t(`readers.categories.${reader.category}`)].filter(Boolean).join(' · ')}
          </p>
          {!reader.active && <Badge tone="danger">{t('readers.inactive')}</Badge>}
        </div>
      </div>

      {late > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 font-medium text-danger">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {t('desk.lateBooks', { count: late })}
        </p>
      )}

      <div>
        <h3 className="mb-2 font-medium">{t('desk.onLoan', { count: activeLoans.length })}</h3>
        {activeLoans.length === 0 ? (
          <p className="text-sm text-muted">{t('readers.loans.none')}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {activeLoans.map((loan) => (
              <li key={loan.id} className="flex items-start justify-between gap-2 py-2">
                <span className="flex items-start gap-2">
                  <BookUp className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                  {loan.titleTitle}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span>
                    {formatDate(loan.dueDate, i18n.language)}
                    {isOverdue(loan, today) && (
                      <span className="ml-1">
                        <Badge tone="danger">{t('loans.late')}</Badge>
                      </span>
                    )}
                  </span>
                  {(loan.renewals ?? 0) > 0 && (
                    <span className="text-xs text-muted">
                      {t('loans.renewed', { count: loan.renewals })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRenew(loan.id)}
                    className="text-xs font-medium text-accent underline underline-offset-2"
                    aria-label={t('desk.renewLabel', { title: loan.titleTitle })}
                  >
                    {t('desk.renew')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {secondsLeft !== undefined && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          <span>{t('desk.autoClear', { count: secondsLeft })}</span>
          <Button variant="secondary" onClick={onStay}>
            {t('desk.stay')}
          </Button>
        </div>
      )}

      {activeLoans.length > 0 && (
        <Button variant="secondary" className="w-full" onClick={onPrintTicket}>
          <Printer className="size-4" aria-hidden="true" />
          {t('ticket.print')}
        </Button>
      )}
      <Button variant="secondary" className="w-full" onClick={onNextReader}>
        {t('desk.nextReader')}
      </Button>
    </aside>
  );
}

/** For a pupil who forgot their card: find them by name. */
function ReaderSearch({ onPick }: { onPick: (memberNumber: string) => void }) {
  const { t } = useTranslation();
  const readers = useReaders();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('nl');
  const matches =
    needle.length < 2
      ? []
      : (readers.data ?? [])
          .filter((r) => r.active && readerName(r).toLocaleLowerCase('nl').includes(needle))
          .slice(0, 8);

  return (
    <aside className="space-y-3 rounded-xl border border-dashed border-line p-5">
      <p className="font-medium">{t('desk.noReader')}</p>
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">{t('desk.searchReader')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-3"
        />
      </label>
      {matches.length > 0 && (
        <ul className="space-y-1">
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  onPick(r.memberNumber);
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left hover:bg-surface-sunken"
              >
                <span>{readerName(r)}</span>
                <span className="text-sm text-muted">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
