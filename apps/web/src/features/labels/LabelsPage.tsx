import { LABEL_LOOKUP_MAX, type CopyLabel, type LabelLookupResult } from '@library/shared';
import { Check, Download, IdCard, Tags } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useAuthorizedApi } from '../../lib/auth';
import { useConfig } from '../../lib/config';
import { useReaders } from '../readers/api';
import { useMarkLabelsPrinted, usePendingLabels } from './api';
import { expandRange } from './barcode';
import { bookLabelsPdf, loadLogo, readerCardsPdf } from './pdf';
import { LABEL_SHEETS } from './sheets';

const OFFSET_KEY = 'label-offset';
const NEXT_START_KEY = 'label-next-start';

/** Where the next label goes on a partly used sheet, remembered per sheet type on this computer. */
function storedStart(sheetId: string): string {
  try {
    const value = JSON.parse(localStorage.getItem(NEXT_START_KEY) ?? '{}') as Record<
      string,
      number
    >;
    return String(value[sheetId] ?? 1);
  } catch {
    return '1';
  }
}

function rememberStart(sheetId: string, next: number) {
  try {
    const value = JSON.parse(localStorage.getItem(NEXT_START_KEY) ?? '{}') as Record<
      string,
      number
    >;
    localStorage.setItem(NEXT_START_KEY, JSON.stringify({ ...value, [sheetId]: next }));
  } catch {
    // Not remembered; fine.
  }
}

function storedOffset(): { x: number; y: number } {
  try {
    const value = JSON.parse(localStorage.getItem(OFFSET_KEY) ?? '{}') as {
      x?: number;
      y?: number;
    };
    return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function LabelsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const kind = params.get('type') === 'cards' ? 'cards' : 'books';

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('labels.heading')}</h1>
      <div
        role="group"
        aria-label={t('labels.kind')}
        className="inline-flex rounded-lg border border-line bg-surface p-1"
      >
        {(['books', 'cards'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setParams(value === 'cards' ? { type: 'cards' } : {})}
            className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium ${kind === value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`}
          >
            {value === 'books' ? (
              <Tags className="size-4" aria-hidden="true" />
            ) : (
              <IdCard className="size-4" aria-hidden="true" />
            )}
            {t(`labels.${value}`)}
          </button>
        ))}
      </div>
      {kind === 'books' ? (
        <BookLabels initialCodes={params.get('codes') ?? ''} />
      ) : (
        <ReaderCards readerIds={params.get('readers')} />
      )}
      <Alert tone="info">{t('labels.printTip')}</Alert>
    </div>
  );
}

function BookLabels({ initialCodes }: { initialCodes: string }) {
  const { t } = useTranslation();
  const { libraryName, logoKey } = useConfig();
  const api = useAuthorizedApi();
  const errorMessage = useErrorMessage();
  const pending = usePendingLabels();
  const markPrinted = useMarkLabelsPrinted();
  // The print queue is the usual starting point; links from a title page bring specific codes.
  const [source, setSource] = useState<'pending' | 'codes' | 'range'>(
    initialCodes ? 'codes' : 'pending',
  );
  const [codes, setCodes] = useState(initialCodes.split(',').join('\n'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sheetId, setSheetId] = useState(LABEL_SHEETS[0]?.id ?? '');
  const [startAt, setStartAt] = useState(() => storedStart(LABEL_SHEETS[0]?.id ?? ''));
  const [offset, setOffset] = useState(storedOffset);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  // After a PDF: which codes it held, until the librarian confirms the print went well.
  const [result, setResult] = useState<{ codes: string[]; unknown: string[]; startAt: number }>();
  const [confirmed, setConfirmed] = useState<number>();

  const sheet = LABEL_SHEETS.find((s) => s.id === sheetId) ?? LABEL_SHEETS[0];
  const perSheet = sheet ? sheet.columns * sheet.rows : 1;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(undefined);
    setResult(undefined);
    setConfirmed(undefined);
    if (!sheet) return;
    const start = Math.min(Math.max(1, Number(startAt) || 1), perSheet);

    if (source === 'pending') {
      const labels = pending.data ?? [];
      if (labels.length === 0) {
        setProblem(t('labels.errors.nothingPending'));
        return;
      }
      await makePdf(labels, [], start);
      return;
    }

    const list =
      source === 'range'
        ? expandRange(from.trim(), to.trim())
        : [
            ...new Set(
              codes
                .split(/[\s,;]+/)
                .map((c) => c.trim())
                .filter(Boolean),
            ),
          ];
    if (!list || list.length === 0 || list.length > LABEL_LOOKUP_MAX) {
      setProblem(
        source === 'range'
          ? t('labels.errors.range', { max: LABEL_LOOKUP_MAX })
          : t('labels.errors.codes', { max: LABEL_LOOKUP_MAX }),
      );
      return;
    }
    try {
      setBusy(true);
      const { labels, unknown } = await api<LabelLookupResult>('/api/catalog/copies/labels', {
        method: 'POST',
        body: { codes: list },
      });
      await makePdf(labels, unknown, start);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function makePdf(labels: CopyLabel[], unknown: string[], start: number) {
    if (!sheet) return;
    if (labels.length > 0) {
      const doc = await bookLabelsPdf(labels, sheet, {
        startAt: start,
        offset,
        libraryName,
        logo: await loadLogo(logoKey),
      });
      doc.save(`labels-${labels[0]?.barcode}.pdf`);
    }
    setResult({ codes: labels.map((label) => label.barcode), unknown, startAt: start });
  }

  /** The print went well: take these copies out of the queue and remember where the sheet is. */
  async function confirmPrinted() {
    if (!result || !sheet) return;
    try {
      await markPrinted.mutateAsync(result.codes);
      const next = ((result.startAt - 1 + result.codes.length) % perSheet) + 1;
      rememberStart(sheet.id, next);
      setStartAt(String(next));
      setConfirmed(result.codes.length);
      setResult(undefined);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  function changeOffset(axis: 'x' | 'y', value: string) {
    const next = { ...offset, [axis]: Number(value.replace(',', '.')) || 0 };
    setOffset(next);
    try {
      localStorage.setItem(OFFSET_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; fine.
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">{t('labels.which')}</legend>
        <div className="flex flex-wrap gap-4">
          {(['pending', 'range', 'codes'] as const).map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="source"
                checked={source === value}
                onChange={() => setSource(value)}
                className="size-4 accent-[var(--accent)]"
              />
              {value === 'pending'
                ? t('labels.source.pending', { count: pending.data?.length ?? 0 })
                : t(`labels.source.${value}`)}
            </label>
          ))}
        </div>
        {source === 'pending' ? (
          <PendingSummary labels={pending.data} />
        ) : source === 'range' ? (
          <div className="flex flex-wrap gap-3">
            <Field label={t('labels.from')} className="w-44">
              {(props) => (
                <input
                  {...props}
                  className={`${props.className} ${inputHeight} font-mono`}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  inputMode="numeric"
                  placeholder="00000001"
                />
              )}
            </Field>
            <Field label={t('labels.to')} className="w-44">
              {(props) => (
                <input
                  {...props}
                  className={`${props.className} ${inputHeight} font-mono`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  inputMode="numeric"
                  placeholder="00000065"
                />
              )}
            </Field>
          </div>
        ) : (
          <Field label={t('labels.codes')} hint={t('labels.codesHint')}>
            {(props) => (
              <textarea
                {...props}
                className={`${props.className} py-2 font-mono`}
                rows={5}
                value={codes}
                onChange={(e) => setCodes(e.target.value)}
              />
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">{t('labels.sheet')}</legend>
        <Field label={t('labels.sheetType')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={sheetId}
              onChange={(e) => {
                setSheetId(e.target.value);
                setStartAt(storedStart(e.target.value));
              }}
            >
              {LABEL_SHEETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t('labels.sheetOption', {
                    name: s.name,
                    count: s.columns * s.rows,
                    width: s.labelWidth,
                    height: s.labelHeight,
                  })}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('labels.startAt')} hint={t('labels.startAtHint', { max: perSheet })}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight} w-24`}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              inputMode="numeric"
            />
          )}
        </Field>
      </fieldset>

      <details className="rounded-xl border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer font-medium">{t('labels.alignment')}</summary>
        <p className="mt-2 text-sm text-muted">{t('labels.alignmentHint')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {(['x', 'y'] as const).map((axis) => (
            <Field key={axis} label={t(`labels.offset.${axis}`)} className="w-44">
              {(props) => (
                <input
                  {...props}
                  className={`${props.className} ${inputHeight}`}
                  defaultValue={offset[axis]}
                  onChange={(e) => changeOffset(axis, e.target.value)}
                  inputMode="decimal"
                />
              )}
            </Field>
          ))}
        </div>
      </details>

      {problem && <Alert tone="danger">{problem}</Alert>}
      {result?.unknown.length ? (
        <Alert tone="danger">{t('labels.unknown', { codes: result.unknown.join(', ') })}</Alert>
      ) : null}
      {result && result.codes.length > 0 && (
        <section
          role="status"
          className="space-y-3 rounded-xl border border-accent bg-accent-soft p-4"
        >
          <p className="font-medium">
            {t('labels.confirm.question', { count: result.codes.length })}
          </p>
          <p className="text-sm text-muted">{t('labels.confirm.explanation')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void confirmPrinted()}
              disabled={markPrinted.isPending}
            >
              <Check className="size-4" aria-hidden="true" />
              {t('labels.confirm.yes')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setResult(undefined)}>
              {t('labels.confirm.no')}
            </Button>
          </div>
        </section>
      )}
      {confirmed !== undefined && (
        <Alert tone="success">
          {t('labels.confirm.done', { count: confirmed, next: startAt })}
        </Alert>
      )}

      <Button type="submit" disabled={busy}>
        <Download className="size-4" aria-hidden="true" />
        {busy ? t('labels.busy') : t('labels.makePdf')}
      </Button>
    </form>
  );
}

/** What's waiting in the print queue, in short. */
function PendingSummary({ labels }: { labels: CopyLabel[] | undefined }) {
  const { t } = useTranslation();
  if (!labels) return <p className="text-sm text-muted">{t('labels.busy')}</p>;
  if (labels.length === 0) return <p className="text-sm text-muted">{t('labels.pending.empty')}</p>;
  const titles = [...new Set(labels.map((label) => label.title))];
  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-sm">
      <p className="font-medium">
        {t('labels.pending.summary', {
          count: labels.length,
          first: labels[0]?.barcode,
          last: labels.at(-1)?.barcode,
        })}
      </p>
      <p className="mt-1 text-muted">
        {titles.slice(0, 5).join(' · ')}
        {titles.length > 5 && ` ${t('labels.pending.more', { count: titles.length - 5 })}`}
      </p>
    </div>
  );
}

function ReaderCards({ readerIds }: { readerIds: string | null }) {
  const { t } = useTranslation();
  const readers = useReaders();
  const { libraryName, logoKey } = useConfig();
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number>();

  const preselected = useMemo(
    () => (readerIds ? new Set(readerIds.split(',')) : undefined),
    [readerIds],
  );
  const groups = useMemo(
    () => [...new Set((readers.data ?? []).map((r) => r.group).filter(Boolean))].sort() as string[],
    [readers.data],
  );
  const selected = (readers.data ?? []).filter((r) =>
    preselected ? preselected.has(r.id) : r.active && (!group || r.group === group),
  );

  async function makePdf() {
    setBusy(true);
    try {
      const doc = await readerCardsPdf(selected, libraryName, await loadLogo(logoKey));
      doc.save(`lezerskaarten${group ? `-${group}` : ''}.pdf`);
      setDone(selected.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!preselected && (
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('readers.group')}
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink"
          >
            <option value="">{t('readers.allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>{t('labels.cardsCount', { count: selected.length })}</p>
      {done !== undefined && <Alert tone="success">{t('labels.cardsDone', { count: done })}</Alert>}
      <Button onClick={() => void makePdf()} disabled={busy || selected.length === 0}>
        <Download className="size-4" aria-hidden="true" />
        {busy ? t('labels.busy') : t('labels.makePdf')}
      </Button>
    </div>
  );
}
