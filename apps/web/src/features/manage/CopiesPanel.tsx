import { COPY_STATUSES, CopyInputSchema, type Copy, type CopyStatus } from '@library/shared';
import { Pencil, Plus, Tags } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge, Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { formatDate } from '../../lib/format';
import { useAddCopy, useUpdateCopy, type CopyChanges } from './api';

const STATUS_TONES: Record<CopyStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  onLoan: 'warning',
  lost: 'danger',
  damaged: 'danger',
  withdrawn: 'neutral',
};

/** Statuses a librarian may set by hand; "on loan" belongs to the circulation desk. */
const EDITABLE_STATUSES = COPY_STATUSES.filter(
  (s): s is Exclude<CopyStatus, 'onLoan'> => s !== 'onLoan',
);

export function CopiesPanel({ titleId, copies }: { titleId: string; copies: Copy[] }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<string>();
  const sorted = [...copies].sort((a, b) => a.barcode.localeCompare(b.barcode));

  return (
    <section aria-labelledby="copies-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="copies-heading" className="text-xl font-semibold">
          {t('manage.copies.heading', { count: copies.length })}
        </h2>
        {copies.length > 0 && (
          <Link
            to={`/manage/labels?codes=${sorted.map((c) => c.barcode).join(',')}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4"
          >
            <Tags className="size-4" aria-hidden="true" />
            {t('labels.printForCopies')}
          </Link>
        )}
      </div>

      {copies.length === 0 ? (
        <p className="text-muted">{t('manage.copies.none')}</p>
      ) : (
        // Horizontal scroll inside the card on narrow screens; the page itself never scrolls sideways.
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('manage.copies.barcode')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('manage.copies.location')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('manage.copies.status')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('manage.copies.note')}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t('manage.copies.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((copy) =>
                editing === copy.id ? (
                  <EditCopyRow
                    key={copy.id}
                    titleId={titleId}
                    copy={copy}
                    onDone={() => setEditing(undefined)}
                  />
                ) : (
                  <tr key={copy.id}>
                    <td className="px-4 py-3 font-mono">{copy.barcode}</td>
                    <td className="px-4 py-3">{copy.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[copy.status]}>
                        {t(`copyStatus.${copy.status}`)}
                      </Badge>
                      {copy.labelPending && (
                        <span className="ml-2">
                          <Badge>{t('labels.pending.badge')}</Badge>
                        </span>
                      )}
                      {copy.currentLoan && (
                        <span className="ml-2 text-muted">
                          {t('readers.loans.due', {
                            date: formatDate(copy.currentLoan.dueDate, i18n.language),
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{copy.note ?? ''}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(copy.id)}
                        aria-label={t('manage.copies.editLabel', { barcode: copy.barcode })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        {t('manage.copies.edit')}
                      </Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <AddCopyForm titleId={titleId} />
    </section>
  );
}

function EditCopyRow({
  titleId,
  copy,
  onDone,
}: {
  titleId: string;
  copy: Copy;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateCopy(titleId);
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState(copy.status);
  const [location, setLocation] = useState(copy.location ?? '');
  const [note, setNote] = useState(copy.note ?? '');

  async function save() {
    const changes: CopyChanges = {
      location: location.trim() || null,
      note: note.trim() || null,
    };
    if (status !== copy.status && status !== 'onLoan') changes.status = status;
    try {
      await update.mutateAsync({ barcode: copy.barcode, changes });
      onDone();
    } catch {
      // Shown below the row.
    }
  }

  const label = (key: string) => t(key, { barcode: copy.barcode });

  return (
    <tr className="bg-surface-sunken">
      <td className="px-4 py-3 align-top font-mono">{copy.barcode}</td>
      <td className="px-4 py-3 align-top">
        <input
          aria-label={label('manage.copies.locationLabel')}
          className={`${inputHeight} w-full rounded-lg border border-line bg-surface px-3`}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          autoFocus
        />
      </td>
      <td className="px-4 py-3 align-top">
        {copy.status === 'onLoan' ? (
          <p className="text-muted">{t('manage.copies.onLoanLocked')}</p>
        ) : (
          <select
            aria-label={label('manage.copies.statusLabel')}
            className={`${inputHeight} w-full rounded-lg border border-line bg-surface px-3`}
            value={status}
            onChange={(e) => setStatus(e.target.value as CopyStatus)}
          >
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`copyStatus.${s}`)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <input
          aria-label={label('manage.copies.noteLabel')}
          className={`${inputHeight} w-full rounded-lg border border-line bg-surface px-3`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {update.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errorMessage(update.error)}
          </p>
        )}
      </td>
      <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right align-top">
        <Button onClick={() => void save()} disabled={update.isPending}>
          {t('manage.copies.save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('manage.copies.cancel')}
        </Button>
      </td>
    </tr>
  );
}

function AddCopyForm({ titleId }: { titleId: string }) {
  const { t } = useTranslation();
  const add = useAddCopy(titleId);
  const errorMessage = useErrorMessage();
  const [barcode, setBarcode] = useState('');
  const [location, setLocation] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [added, setAdded] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAdded(undefined);
    const parsed = CopyInputSchema.safeParse({
      barcode: barcode.trim() || undefined,
      location: location.trim() || undefined,
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    try {
      const copy = await add.mutateAsync(parsed.data);
      setAdded(copy.barcode);
      setBarcode('');
    } catch {
      // Shown below the form.
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="space-y-3 rounded-xl border border-dashed border-line p-4"
    >
      <h3 className="font-semibold">{t('manage.copies.addHeading')}</h3>
      <div className="flex flex-wrap items-start gap-3">
        <Field
          label={t('manage.copies.barcode')}
          hint={t('manage.copies.barcodeHint')}
          error={invalid ? t('manage.copies.barcodeInvalid') : undefined}
          className="w-56"
        >
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight} font-mono`}
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
                setInvalid(false);
              }}
              placeholder={t('manage.copies.automatic')}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t('manage.copies.location')} className="w-56">
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={add.isPending} className="mt-7">
          <Plus className="size-4" aria-hidden="true" />
          {t('manage.copies.add')}
        </Button>
      </div>
      {added && (
        <Alert
          tone="success"
          action={
            <Link
              to={`/manage/labels?codes=${added}`}
              className="font-medium underline underline-offset-4"
            >
              {t('labels.printOne')}
            </Link>
          }
        >
          {t('manage.copies.added', { barcode: added })}
        </Alert>
      )}
      {add.isError && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
    </form>
  );
}
