import type { Asset, CopyLabel } from '@klasbak/shared';
import { ArrowLeft, Check, Download } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button, Skeleton, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useConfig } from '../../lib/config';
import { bookLabelsPdf, loadLogo } from '../labels/pdf';
import { LABEL_SHEETS, storedLabelOffset } from '../labels/sheets';
import { useAssets, useMarkAssetLabelsPrinted } from './api';

/** On the label: what it is on top, the serial number below it, like a book's author. */
function toLabel(asset: Asset): CopyLabel {
  return {
    barcode: asset.barcode,
    titleId: asset.id,
    // Labels are small: "Chromebook Acer Chromebook 314" would lose the model.
    title: asset.name.toLowerCase().includes(asset.kind.toLowerCase())
      ? asset.name
      : `${asset.kind} ${asset.name}`,
    authors: asset.serialNumber ? [asset.serialNumber] : [],
  };
}

/** New items wait here for their label, in the order they were added. */
export function AssetLabelsPage() {
  const { t } = useTranslation();
  const { libraryName, logoKey } = useConfig();
  const [params] = useSearchParams();
  const assets = useAssets();
  const markPrinted = useMarkAssetLabelsPrinted();
  const errorMessage = useErrorMessage();
  const [sheetId, setSheetId] = useState(LABEL_SHEETS[0]?.id ?? '');
  const [startAt, setStartAt] = useState('1');
  const [busy, setBusy] = useState(false);
  const [printed, setPrinted] = useState<string[]>();
  const [confirmed, setConfirmed] = useState<number>();
  const [failure, setFailure] = useState<unknown>();

  const onlyId = params.get('id');
  const selection = useMemo(
    () =>
      (assets.data ?? [])
        .filter((a) => (onlyId ? a.id === onlyId : a.status !== 'withdrawn' && !a.labelPrintedAt))
        .sort((a, b) => a.barcode.localeCompare(b.barcode)),
    [assets.data, onlyId],
  );
  const sheet = LABEL_SHEETS.find((s) => s.id === sheetId) ?? LABEL_SHEETS[0];
  const perSheet = sheet ? sheet.columns * sheet.rows : 1;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sheet || selection.length === 0) return;
    setFailure(undefined);
    setConfirmed(undefined);
    setBusy(true);
    try {
      const doc = await bookLabelsPdf(selection.map(toLabel), sheet, {
        startAt: Math.min(Math.max(1, Number(startAt) || 1), perSheet),
        offset: storedLabelOffset(),
        libraryName,
        logo: await loadLogo(logoKey),
      });
      doc.save(`labels-materiaal-${selection[0]?.barcode}.pdf`);
      setPrinted(selection.map((a) => a.id));
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!printed) return;
    try {
      await markPrinted.mutateAsync(printed);
      setConfirmed(printed.length);
      setPrinted(undefined);
    } catch (error) {
      setFailure(error);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        to="/manage/equipment"
        className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('equipment.back')}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t('equipment.labels.heading')}</h1>

      {assets.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : assets.isError ? (
        <Alert tone="danger">{errorMessage(assets.error)}</Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
          <p>
            {selection.length === 0
              ? t('equipment.labels.none')
              : t('equipment.labels.waiting', { count: selection.length })}
          </p>
          <fieldset className="flex flex-wrap items-start gap-4">
            <legend className="sr-only">{t('labels.sheet')}</legend>
            <Field label={t('labels.sheet')} className="min-w-64 flex-1">
              {(props) => (
                <select
                  {...props}
                  className={`${props.className} ${inputHeight}`}
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
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
          <Button type="submit" disabled={busy || selection.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            {t('equipment.labels.make')}
          </Button>
          {printed && (
            <Alert
              tone="info"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  disabled={markPrinted.isPending}
                  onClick={() => void confirm()}
                >
                  <Check className="size-4" aria-hidden="true" />
                  {t('equipment.labels.confirm')}
                </Button>
              }
            >
              {t('equipment.labels.confirmQuestion')}
            </Alert>
          )}
          {confirmed !== undefined && (
            <Alert tone="success">{t('equipment.labels.confirmed', { count: confirmed })}</Alert>
          )}
          {failure !== undefined && <Alert tone="danger">{errorMessage(failure)}</Alert>}
          <Alert tone="info">{t('labels.printTip')}</Alert>
        </form>
      )}
    </div>
  );
}
