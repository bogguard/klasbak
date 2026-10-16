import { localDate, type ExportPage, type ExportRecord } from '@library/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { useAuthorizedApi } from '../../lib/auth';

/** Everything the school owns in one ZIP: its right to take its data along (DPA, article 11). */
export function ExportSection() {
  const { t } = useTranslation();
  const api = useAuthorizedApi();
  const errorMessage = useErrorMessage();
  const [count, setCount] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string>();

  async function run() {
    setBusy(true);
    setDone(false);
    setProblem(undefined);
    try {
      const records: ExportRecord[] = [];
      let cursor: string | undefined;
      do {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const page = await api<ExportPage>(`/api/circulation/export${query}`);
        records.push(...page.records);
        setCount(records.length);
        cursor = page.next;
      } while (cursor);

      // Loaded only here: the zip library is not needed anywhere else.
      const { buildExportZip } = await import('./buildExport');
      const zip = buildExportZip(records, new Date());
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `bibliotheek-export-${localDate()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="export-heading" className="space-y-3">
      <h2 id="export-heading" className="text-xl font-semibold">
        {t('settings.export.heading')}
      </h2>
      <p className="text-sm text-muted">{t('settings.export.explanation')}</p>
      <Button variant="secondary" onClick={() => void run()} disabled={busy}>
        <Download className="size-4" aria-hidden="true" />
        {busy ? t('settings.export.busy', { count: count ?? 0 }) : t('settings.export.button')}
      </Button>
      {done && <Alert tone="success">{t('settings.export.done', { count: count ?? 0 })}</Alert>}
      {problem && <Alert tone="danger">{problem}</Alert>}
    </section>
  );
}
