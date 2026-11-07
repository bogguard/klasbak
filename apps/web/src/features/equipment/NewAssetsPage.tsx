import { ASSET_BATCH_MAX, type CreateAssetResult } from '@klasbak/shared';
import { ArrowLeft, Plus, Tags } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useCreateAssets } from './api';
import { assetDetails, AssetFields, emptyAssetFields } from './AssetFields';
import { parseSerialNumbers } from './stock';

/**
 * A delivery of 30 Chromebooks is one form: what they share once, then scan the serial numbers
 * one after the other. Items without a serial number (chargers, say) are a quantity.
 */
export function NewAssetsPage() {
  const { t } = useTranslation();
  const create = useCreateAssets();
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState(emptyAssetFields);
  const [mode, setMode] = useState<'serials' | 'quantity'>('serials');
  const [serialText, setSerialText] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [showErrors, setShowErrors] = useState(false);
  const [results, setResults] = useState<CreateAssetResult[]>();

  const { serials, invalid } = parseSerialNumbers(serialText);
  const amount = Number(quantity);
  const validQuantity = Number.isInteger(amount) && amount >= 1 && amount <= ASSET_BATCH_MAX;
  const tooMany = serials.length > ASSET_BATCH_MAX;
  const lines =
    mode === 'serials' ? serials.length > 0 && invalid.length === 0 && !tooMany : validQuantity;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    setResults(undefined);
    if (!values.kind.trim() || !values.name.trim() || !lines) return;
    try {
      const created = await create.mutateAsync({
        details: assetDetails(values),
        serialNumbers: mode === 'serials' ? serials : [],
        quantity: mode === 'quantity' ? amount : undefined,
      });
      setResults(created);
      setSerialText('');
      setShowErrors(false);
    } catch {
      // Shown below; what was typed stays, so nothing has to be scanned again.
    }
  }

  const added = results?.filter((r) => r.status === 'created').length ?? 0;
  const duplicates =
    results?.flatMap((r) => (r.status === 'duplicate' ? r.serialNumber : [])) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        to="/manage/equipment"
        className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('equipment.back')}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t('equipment.add')}</h1>

      {results && (
        <div className="space-y-2">
          <Alert
            tone="success"
            action={
              <Link
                to="/manage/equipment/labels"
                className="inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4"
              >
                <Tags className="size-4" aria-hidden="true" />
                {t('equipment.new.printLabels')}
              </Link>
            }
          >
            {t('equipment.new.added', { count: added })}
          </Alert>
          {duplicates.length > 0 && (
            <Alert tone="info">
              {t('equipment.new.duplicates', {
                count: duplicates.length,
                serials: duplicates.join(', '),
              })}
            </Alert>
          )}
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
        <AssetFields values={values} onChange={setValues} showErrors={showErrors} />

        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">{t('equipment.new.howMany')}</legend>
          <div className="flex flex-wrap gap-4">
            {(['serials', 'quantity'] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="size-4 accent-[var(--accent)]"
                />
                {t(`equipment.new.${value}`)}
              </label>
            ))}
          </div>
          {mode === 'serials' ? (
            <Field
              label={t('equipment.new.serialList')}
              hint={t('equipment.new.serialHint', { max: ASSET_BATCH_MAX })}
              required
              error={
                invalid.length > 0
                  ? t('equipment.new.invalidSerials', { serials: invalid.join(', ') })
                  : tooMany
                    ? t('equipment.new.tooMany', { max: ASSET_BATCH_MAX })
                    : showErrors && serials.length === 0
                      ? t('equipment.form.required')
                      : undefined
              }
            >
              {(props) => (
                <textarea
                  {...props}
                  className={`${props.className} py-2 font-mono`}
                  rows={8}
                  value={serialText}
                  onChange={(e) => setSerialText(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="characters"
                />
              )}
            </Field>
          ) : (
            <Field
              label={t('equipment.new.quantityLabel')}
              required
              error={
                showErrors && !validQuantity
                  ? t('equipment.new.quantityError', { max: ASSET_BATCH_MAX })
                  : undefined
              }
            >
              {(props) => (
                <input
                  {...props}
                  className={`${props.className} ${inputHeight} w-28`}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="numeric"
                />
              )}
            </Field>
          )}
        </fieldset>

        {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        <Button type="submit" disabled={create.isPending}>
          <Plus className="size-4" aria-hidden="true" />
          {t('equipment.new.submit', {
            count: mode === 'serials' ? serials.length : validQuantity ? amount : 0,
          })}
        </Button>
      </form>
    </div>
  );
}
