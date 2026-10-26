import {
  calculateDueDate,
  LibrarySettingsInputSchema,
  localDate,
  READER_CATEGORIES,
  type ClosedPeriod,
  type LibrarySettings,
  type LibrarySettingsInput,
} from '@klasbak/shared';
import { Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Skeleton, StatusMessage, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { AdminOnly } from '../../app/AdminOnly';
import { useConfig } from '../../lib/config';
import { formatDate } from '../../lib/format';
import { useBranding, useSettings, useUpdateSettings } from './api';
import { ExportSection } from '../export/ExportSection';
import { LogoField } from './LogoField';

// Monday first, as on a Belgian calendar; values follow Date.getUTCDay().
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export function SettingsPage() {
  return (
    <AdminOnly>
      <Settings />
    </AdminOnly>
  );
}

function Settings() {
  const { t } = useTranslation();
  const { loaded } = useConfig();
  const settings = useSettings();
  const errorMessage = useErrorMessage();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('settings.heading')}</h1>
      {settings.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : settings.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(settings.error)}
        />
      ) : (
        // Remount once the configuration is loaded, so the name starts with the real one.
        <SettingsForm key={String(loaded)} settings={settings.data} />
      )}
      {/* An action, not a setting: it stays out of the form and its save button. */}
      <hr className="border-line" />
      <ExportSection />
    </div>
  );
}

function SettingsForm({ settings }: { settings: LibrarySettings }) {
  const { t, i18n } = useTranslation();
  const config = useConfig();
  const update = useUpdateSettings();
  const { rename } = useBranding();
  const errorMessage = useErrorMessage();
  const { version: _version, ...initial } = settings;
  const [values, setValues] = useState<LibrarySettingsInput>(initial);
  // The name lives in the branding file, but is edited and saved with the rest.
  const [name, setName] = useState(config.libraryName);
  const [failure, setFailure] = useState<unknown>();
  const [invalid, setInvalid] = useState<string>();
  const [saved, setSaved] = useState(false);
  // The version we last saw; the next save must be based on it (optimistic locking).
  const [version, setVersion] = useState(settings.version);

  function change(next: LibrarySettingsInput) {
    setValues(next);
    setInvalid(undefined);
    setSaved(false);
  }

  function setPolicy(
    category: (typeof READER_CATEGORIES)[number],
    field: 'loanDays' | 'maxLoans',
    raw: string,
  ) {
    change({
      ...values,
      loanPolicies: {
        ...values.loanPolicies,
        [category]: {
          ...values.loanPolicies[category],
          [field]: raw === '' ? Number.NaN : Number(raw),
        },
      },
    });
  }

  function setPeriod(index: number, patch: Partial<ClosedPeriod>) {
    change({
      ...values,
      closedPeriods: values.closedPeriods.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = {
      ...values,
      closedPeriods: values.closedPeriods.map((p) => ({
        ...p,
        label: p.label?.trim() || undefined,
      })),
    };
    const parsed = LibrarySettingsInputSchema.safeParse(cleaned);
    const problem = !name.trim()
      ? 'settings.branding.nameRequired'
      : !parsed.success
        ? 'settings.invalid'
        : undefined;
    setInvalid(problem);
    if (problem || !parsed.success) return;
    setFailure(undefined);
    try {
      const result = await update.mutateAsync({ settings: parsed.data, version });
      setVersion(result.version);
      // Only what changed, so the audit trail doesn't list a new name on every save.
      if (name.trim() !== config.libraryName) await rename.mutateAsync(name.trim());
      setSaved(true);
    } catch (error) {
      setFailure(error);
    }
  }

  const saving = update.isPending || rename.isPending;

  const preview = LibrarySettingsInputSchema.safeParse(values);
  const today = localDate();

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-8">
      <fieldset className="space-y-5">
        <legend className="mb-2 text-xl font-semibold">{t('settings.branding.heading')}</legend>
        <Field
          label={t('settings.branding.name')}
          hint={t('settings.branding.nameHint')}
          className="w-full max-w-md"
        >
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setInvalid(undefined);
                setSaved(false);
              }}
              maxLength={80}
            />
          )}
        </Field>
        <LogoField />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{t('settings.rules.heading')}</legend>
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('readers.form.category')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('settings.rules.loanDays')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('settings.rules.maxLoans')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {READER_CATEGORIES.map((category) => (
                <tr key={category}>
                  <th scope="row" className="px-4 py-3 font-medium">
                    {t(`readers.categories.${category}`)}
                  </th>
                  {(['loanDays', 'maxLoans'] as const).map((field) => (
                    <td key={field} className="px-4 py-2">
                      <input
                        aria-label={`${t(`settings.rules.${field}`)} (${t(`readers.categories.${category}`)})`}
                        value={
                          Number.isNaN(values.loanPolicies[category][field])
                            ? ''
                            : values.loanPolicies[category][field]
                        }
                        onChange={(e) => setPolicy(category, field, e.target.value)}
                        inputMode="numeric"
                        className={`${inputHeight} w-24 rounded-lg border border-line bg-surface px-3`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.success && (
          <p className="text-sm text-muted">
            {t('settings.rules.preview', {
              date: formatDate(calculateDueDate(today, 'pupil', preview.data), i18n.language),
            })}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{t('settings.privacy.heading')}</legend>
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium">{t('settings.privacy.retention')}</span>
          <input
            value={Number.isNaN(values.historyRetentionDays) ? '' : values.historyRetentionDays}
            onChange={(e) =>
              change({
                ...values,
                historyRetentionDays: e.target.value === '' ? Number.NaN : Number(e.target.value),
              })
            }
            inputMode="numeric"
            aria-describedby="retention-hint"
            className={`${inputHeight} w-28 rounded-lg border border-line bg-surface px-3`}
          />
          <span id="retention-hint" className="block text-sm text-muted">
            {t('settings.privacy.retentionHint')}
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{t('settings.closedDays.heading')}</legend>
        <p className="text-sm text-muted">{t('settings.closedDays.explanation')}</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => {
            const name = new Intl.DateTimeFormat(i18n.language, {
              weekday: 'long',
              timeZone: 'UTC',
            }).format(
              new Date(Date.UTC(2024, 0, 7 + day)), // 7 January 2024 was a Sunday
            );
            const checked = values.closedWeekdays.includes(day);
            return (
              <label
                key={day}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    change({
                      ...values,
                      closedWeekdays: e.target.checked
                        ? [...values.closedWeekdays, day]
                        : values.closedWeekdays.filter((d) => d !== day),
                    })
                  }
                  className="size-4 accent-[var(--accent)]"
                />
                {name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{t('settings.periods.heading')}</legend>
        <p className="text-sm text-muted">{t('settings.periods.explanation')}</p>
        {values.closedPeriods.length > 0 && (
          <ul className="space-y-2">
            {values.closedPeriods.map((period, index) => (
              <li
                key={index}
                className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
              >
                <label className="text-sm">
                  <span className="mb-1 block text-muted">{t('settings.periods.label')}</span>
                  <input
                    value={period.label ?? ''}
                    onChange={(e) => setPeriod(index, { label: e.target.value })}
                    className={`${inputHeight} w-56 rounded-lg border border-line bg-surface px-3`}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">{t('settings.periods.from')}</span>
                  <input
                    type="date"
                    value={period.from}
                    onChange={(e) => setPeriod(index, { from: e.target.value })}
                    className={`${inputHeight} rounded-lg border border-line bg-surface px-3`}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">{t('settings.periods.to')}</span>
                  <input
                    type="date"
                    value={period.to}
                    onChange={(e) => setPeriod(index, { to: e.target.value })}
                    className={`${inputHeight} rounded-lg border border-line bg-surface px-3`}
                  />
                </label>
                <Button
                  variant="secondary"
                  type="button"
                  aria-label={t('settings.periods.remove', {
                    label: period.label || `${period.from} – ${period.to}`,
                  })}
                  onClick={() =>
                    change({
                      ...values,
                      closedPeriods: values.closedPeriods.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="secondary"
          type="button"
          onClick={() =>
            change({
              ...values,
              closedPeriods: [...values.closedPeriods, { from: today, to: today, label: '' }],
            })
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('settings.periods.add')}
        </Button>
      </fieldset>

      {/* Stays in view on this long page, so it's clear one button saves everything above;
          the outcome shows next to it, where the eye is after clicking. */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-surface-sunken/95 px-4 py-4 backdrop-blur">
        {invalid && <Alert tone="danger">{t(invalid)}</Alert>}
        {saved && <Alert tone="success">{t('manage.edit.saved')}</Alert>}
        {failure !== undefined && <Alert tone="danger">{errorMessage(failure)}</Alert>}
        <Button type="submit" disabled={saving}>
          <Save className="size-4" aria-hidden="true" />
          {saving ? t('manage.form.saving') : t('settings.save')}
        </Button>
      </div>
    </form>
  );
}
