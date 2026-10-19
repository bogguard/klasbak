import {
  IMPORT_BATCH_SIZE,
  matchReader,
  readerName,
  type ImportRowResult,
  type Reader,
} from '@library/shared';
import { ArrowLeft, FileUp, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AdminOnly } from '../../app/AdminOnly';
import { Badge, Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { useDeactivateReaders, useImportReaders, useReaders } from './api';
import { readSpreadsheet, SPREADSHEET_ACCEPT } from '../../lib/spreadsheet';
import { parseReaderRecords, type CsvParseResult, type ParsedRow } from './csv';
import { useConfig } from '../../lib/config';

type FileResult = CsvParseResult | { ok: false; error: 'oldExcel' | 'unreadable' };

type Outcome = { line: number; result: ImportRowResult };

/**
 * Import a class list in three steps: choose a file, check the preview, import.
 * Nothing is saved before the librarian has seen exactly what will happen: which readers are
 * new, which are updated, and (for a new school year) which pupils are no longer in the list.
 */
export function ImportReadersPage() {
  return (
    <AdminOnly>
      <ImportReaders />
    </AdminOnly>
  );
}

function ImportReaders() {
  const { t } = useTranslation();
  const { kind, terms } = useConfig();
  const importReaders = useImportReaders();
  const deactivate = useDeactivateReaders();
  const existing = useReaders();
  const errorMessage = useErrorMessage();
  const [parsed, setParsed] = useState<FileResult>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [outcomes, setOutcomes] = useState<Outcome[]>();
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [deactivated, setDeactivated] = useState<number>();

  async function readFile(file: File | undefined) {
    if (!file) return;
    setOutcomes(undefined);
    setDeactivated(undefined);
    setDeactivateMissing(false);
    const sheet = await readSpreadsheet(file);
    // The library's own names for its second reader type count as that type in the file.
    const teacherNames = [terms?.teacher?.one, terms?.teacher?.other].filter(
      (name): name is string => Boolean(name),
    );
    setParsed(sheet.ok ? parseReaderRecords(sheet.rows, teacherNames) : sheet);
  }

  const valid = useMemo(
    () =>
      parsed?.ok ? parsed.rows.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok) : [],
    [parsed],
  );
  const invalid = parsed?.ok ? parsed.rows.filter((r) => !r.ok) : [];

  // What will happen to each row, and which active pupils the file doesn't mention.
  const plan = useMemo(() => {
    const readers = existing.data ?? [];
    const matches = new Map<number, Reader | undefined>(
      valid.map((row) => [row.line, matchReader(row.reader, readers)]),
    );
    const mentioned = new Set([...matches.values()].map((r) => r?.id));
    const missing = readers
      .filter((r) => r.active && r.category === 'pupil' && !mentioned.has(r.id))
      .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '', 'nl', { numeric: true }));
    return { matches, missing };
  }, [existing.data, valid]);
  const updates = [...plan.matches.values()].filter(Boolean).length;

  async function runImport() {
    const results: Outcome[] = [];
    setProgress({ done: 0, total: valid.length });
    try {
      // Small batches keep each request quick and show progress for long lists.
      for (let start = 0; start < valid.length; start += IMPORT_BATCH_SIZE) {
        const batch = valid.slice(start, start + IMPORT_BATCH_SIZE);
        const response = await importReaders.mutateAsync(batch.map((row) => row.reader));
        for (const result of response) {
          results.push({ line: batch[result.index]?.line ?? 0, result });
        }
        setProgress({ done: Math.min(start + batch.length, valid.length), total: valid.length });
      }
      if (deactivateMissing && plan.missing.length > 0) {
        let count = 0;
        const ids = plan.missing.map((r) => r.id);
        for (let start = 0; start < ids.length; start += IMPORT_BATCH_SIZE) {
          const response = await deactivate.mutateAsync(
            ids.slice(start, start + IMPORT_BATCH_SIZE),
          );
          count += response.deactivated;
        }
        setDeactivated(count);
      }
    } finally {
      setOutcomes(results);
      setProgress(undefined);
    }
  }

  const counts = outcomes && {
    created: outcomes.filter((o) => o.result.status === 'created').length,
    updated: outcomes.filter((o) => o.result.status === 'updated').length,
    failed: outcomes.filter((o) => o.result.status === 'failed'),
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        to="/manage/readers"
        className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('readers.back')}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t('readers.importPage.heading')}</h1>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p>{t('readers.importPage.explanation', { context: kind })}</p>
        <pre className="relative overflow-x-auto rounded-lg bg-surface-sunken p-3 text-sm">
          {/* School administrations export Dutch column names, also for English users. */}
          {t('readers.importPage.example', { context: kind })}
        </pre>
        <p className="text-sm text-muted">{t('readers.importPage.columns', { context: kind })}</p>
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
      </section>

      {parsed && !parsed.ok && (
        <Alert tone="danger">{t(`readers.importPage.errors.${parsed.error}`)}</Alert>
      )}

      {parsed?.ok && !outcomes && (
        <section className="space-y-4" aria-labelledby="preview-heading">
          <h2 id="preview-heading" className="text-xl font-semibold">
            {t('readers.importPage.preview')}
          </h2>
          <p>
            {t('readers.importPage.planCount', {
              created: valid.length - updates,
              updated: updates,
            })}
            {invalid.length > 0 &&
              ` ${t('readers.importPage.invalidCount', { count: invalid.length })}`}
          </p>
          <div className="max-h-96 overflow-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('readers.importPage.line')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('readers.name')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('readers.group')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('readers.form.schoolNumber', { context: kind })}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('readers.importPage.check')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parsed.rows.map((row) => {
                  const data = row.ok ? row.reader : row.values;
                  return (
                    <tr key={row.line}>
                      <td className="px-3 py-2 tabular-nums text-muted">{row.line}</td>
                      <td className="px-3 py-2">
                        {data.firstName} {data.lastName}
                      </td>
                      <td className="px-3 py-2">{data.group}</td>
                      <td className="px-3 py-2 font-mono">{data.schoolNumber}</td>
                      <td className="px-3 py-2">
                        {row.ok ? (
                          plan.matches.get(row.line) ? (
                            <Badge>{t('readers.importPage.willUpdate')}</Badge>
                          ) : (
                            <Badge tone="success">{t('readers.importPage.willCreate')}</Badge>
                          )
                        ) : (
                          <Badge tone="danger">{t('readers.importPage.skipped')}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {plan.missing.length > 0 && (
            <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <p className="font-medium">
                {t('readers.importPage.missing', { count: plan.missing.length })}
              </p>
              <details className="text-sm text-muted">
                <summary className="cursor-pointer">{t('readers.importPage.showMissing')}</summary>
                <ul className="mt-2 columns-2 gap-6">
                  {plan.missing.map((r) => (
                    <li key={r.id}>
                      {r.group ? `${r.group} · ` : ''}
                      {readerName(r)}
                    </li>
                  ))}
                </ul>
              </details>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  checked={deactivateMissing}
                  onChange={(e) => setDeactivateMissing(e.target.checked)}
                  className="mt-1 size-5 accent-accent"
                />
                <span>
                  {t('readers.importPage.deactivateMissing', {
                    count: plan.missing.length,
                    context: kind,
                  })}
                  <span className="block text-sm text-muted">
                    {t('readers.importPage.deactivateHint')}
                  </span>
                </span>
              </label>
            </div>
          )}
          {progress ? (
            <p role="status">
              {t('readers.importPage.progress', { done: progress.done, total: progress.total })}
            </p>
          ) : (
            <Button onClick={() => void runImport()} disabled={valid.length === 0}>
              <Upload className="size-4" aria-hidden="true" />
              {t('readers.importPage.run', { count: valid.length })}
            </Button>
          )}
          {(importReaders.isError || deactivate.isError) && (
            <Alert tone="danger">{errorMessage(importReaders.error ?? deactivate.error)}</Alert>
          )}
        </section>
      )}

      {counts && (
        <section className="space-y-3" aria-labelledby="result-heading">
          <h2 id="result-heading" className="text-xl font-semibold">
            {t('readers.importPage.result')}
          </h2>
          <Alert tone={counts.failed.length ? 'danger' : 'success'}>
            {t('readers.importPage.summary', {
              created: counts.created,
              updated: counts.updated,
              failed: counts.failed.length,
            })}
            {deactivated !== undefined &&
              ` ${t('readers.importPage.deactivated', { count: deactivated })}`}
          </Alert>
          {counts.failed.length > 0 && (
            <ul className="list-disc space-y-1 pl-6 text-sm">
              {counts.failed.map(({ line, result }) => (
                <li key={line}>
                  {t('readers.importPage.failedLine', { line })}{' '}
                  {result.status === 'failed' &&
                    t(`errors.${result.code}`, { defaultValue: t('errors.UNKNOWN') })}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/manage/readers"
            className="font-medium text-accent underline underline-offset-4"
          >
            {t('readers.importPage.toList')}
          </Link>
        </section>
      )}
    </div>
  );
}
