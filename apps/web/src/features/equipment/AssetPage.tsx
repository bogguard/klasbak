import {
  ASSET_MANUAL_STATUSES,
  isAssetOverdue,
  localDate,
  type Asset,
  type AssetRecipient,
  type Assignment,
} from '@klasbak/shared';
import { ArrowLeft, Save, Tags, TriangleAlert, Undo2, UserRoundCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useIsLibraryStaff } from '../../lib/auth';
import { formatDate, formatTimestampDate } from '../../lib/format';
import { useAsset, useAssignAsset, useRecipients, useReturnAsset, useUpdateAsset } from './api';
import { assetDetails, AssetFields, type AssetFieldValues } from './AssetFields';
import { AssetStatusBadge } from './EquipmentPage';

const MAX_RESULTS = 8;

export function AssetPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const detail = useAsset(id);
  const errorMessage = useErrorMessage();

  const back = (
    <Link
      to="/manage/equipment"
      className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('equipment.back')}
    </Link>
  );

  if (detail.isPending) return <Skeleton className="h-96 w-full" />;
  if (detail.isError) {
    return (
      <div className="space-y-6">
        {back}
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(detail.error)}
        />
      </div>
    );
  }

  const { asset, history } = detail.data;
  return (
    <div className="max-w-3xl space-y-8">
      {back}
      <header className="space-y-1">
        <p className="text-muted">{asset.kind}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{asset.name}</h1>
        <p className="flex flex-wrap items-center gap-3">
          <AssetStatusBadge asset={asset} />
          <span className="font-mono text-muted">{asset.barcode}</span>
        </p>
        <Link
          to={`/manage/equipment/labels?id=${asset.id}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4"
        >
          <Tags className="size-4" aria-hidden="true" />
          {t('equipment.labels.printOne')}
        </Link>
      </header>

      {asset.holder ? (
        <TakeBack asset={asset} />
      ) : (
        asset.status === 'available' && <HandOut assetId={asset.id} />
      )}

      <section aria-labelledby="asset-details" className="space-y-4">
        <h2 id="asset-details" className="text-xl font-semibold">
          {t('equipment.details')}
        </h2>
        <AssetDetails asset={asset} />
      </section>

      <History history={history} />
    </div>
  );
}

/** The reader's page belongs to the library: an equipment manager just sees the name. */
function ReaderLink({ readerId, children }: { readerId: string; children: string }) {
  if (!useIsLibraryStaff()) return children;
  return (
    <Link to={`/manage/readers/${readerId}`} className="hover:text-accent hover:underline">
      {children}
    </Link>
  );
}

function TakeBack({ asset }: { asset: Asset }) {
  const { t, i18n } = useTranslation();
  const takeBack = useReturnAsset(asset.id);
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<'available' | 'repair' | 'lost'>('available');
  const holder = asset.holder;
  if (!holder) return null;

  return (
    <section
      aria-labelledby="asset-holder"
      className="space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <h2 id="asset-holder" className="text-xl font-semibold">
        {t('equipment.holder.heading')}
      </h2>
      <div>
        <span className="font-medium">
          <ReaderLink readerId={holder.readerId}>
            {[holder.readerName, holder.readerGroup].filter(Boolean).join(' · ')}
          </ReaderLink>
        </span>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t('equipment.holder.since', { date: formatTimestampDate(holder.since, i18n.language) })}
          {holder.dueDate &&
            ` · ${t('equipment.due', { date: formatDate(holder.dueDate, i18n.language) })}`}
          {isAssetOverdue(asset, localDate()) && <Badge tone="danger">{t('loans.late')}</Badge>}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('equipment.holder.condition')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={state}
              onChange={(e) => setState(e.target.value as typeof state)}
            >
              <option value="available">{t('equipment.holder.fine')}</option>
              <option value="repair">{t('assetStatus.repair')}</option>
              <option value="lost">{t('assetStatus.lost')}</option>
            </select>
          )}
        </Field>
        <Button disabled={takeBack.isPending} onClick={() => takeBack.mutate(state)}>
          <Undo2 className="size-4" aria-hidden="true" />
          {t(state === 'lost' ? 'equipment.holder.markLost' : 'equipment.holder.takeBack')}
        </Button>
      </div>
      {takeBack.isError && <Alert tone="danger">{errorMessage(takeBack.error)}</Alert>}
    </section>
  );
}

const recipientLabel = (r: AssetRecipient) =>
  [`${r.firstName} ${r.lastName}`, r.group].filter(Boolean).join(' · ');

function HandOut({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const recipients = useRecipients(open);
  const assign = useAssignAsset(assetId);
  const errorMessage = useErrorMessage();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<AssetRecipient>();
  const [dueDate, setDueDate] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('nl');
    if (!needle) return [];
    return (recipients.data ?? [])
      .filter((r) =>
        [
          `${r.firstName} ${r.lastName}`,
          `${r.lastName} ${r.firstName}`,
          r.group,
          r.memberNumber,
        ].some((value) => value?.toLocaleLowerCase('nl').includes(needle)),
      )
      .slice(0, MAX_RESULTS);
  }, [recipients.data, query]);

  // Scanning a reader card types the number and presses Enter.
  function selectScanned(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = query.trim().toUpperCase();
    const card = recipients.data?.find((r) => r.memberNumber.toUpperCase() === code);
    const only = matches.length === 1 ? matches[0] : undefined;
    setChosen(card ?? only);
  }

  return (
    <section
      aria-labelledby="asset-hand-out"
      className="space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <h2 id="asset-hand-out" className="text-xl font-semibold">
        {t('equipment.handOut.heading')}
      </h2>
      {chosen ? (
        <div className="space-y-4">
          <p>
            <span className="font-medium">{recipientLabel(chosen)}</span>{' '}
            <button
              type="button"
              onClick={() => setChosen(undefined)}
              className="min-h-11 px-2 text-sm text-accent underline underline-offset-4"
            >
              {t('equipment.handOut.change')}
            </button>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('equipment.handOut.dueDate')} hint={t('equipment.handOut.dueHint')}>
              {(props) => (
                <input
                  {...props}
                  type="date"
                  min={localDate()}
                  className={`${props.className} ${inputHeight} w-44`}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              )}
            </Field>
            <Button variant="secondary" onClick={() => setDueDate(localDate())}>
              {t('equipment.handOut.today')}
            </Button>
          </div>
          <Button
            disabled={assign.isPending}
            onClick={() => assign.mutate({ readerId: chosen.id, dueDate: dueDate || undefined })}
          >
            <UserRoundCheck className="size-4" aria-hidden="true" />
            {t('equipment.handOut.submit', { name: chosen.firstName })}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label={t('equipment.handOut.who')} hint={t('equipment.handOut.whoHint')}>
            {(props) => (
              <input
                {...props}
                type="search"
                className={`${props.className} ${inputHeight}`}
                value={query}
                onFocus={() => setOpen(true)}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={selectScanned}
                autoComplete="off"
              />
            )}
          </Field>
          {recipients.isError && <Alert tone="danger">{errorMessage(recipients.error)}</Alert>}
          {query.trim() && recipients.isSuccess && matches.length === 0 && (
            <p className="text-sm text-muted">{t('equipment.handOut.noMatch')}</p>
          )}
          {matches.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {matches.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(r)}
                    className="min-h-11 w-full px-3 py-2 text-left hover:bg-surface-sunken"
                  >
                    {recipientLabel(r)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {assign.isError && <Alert tone="danger">{errorMessage(assign.error)}</Alert>}
    </section>
  );
}

/**
 * The save lives outside the form: the form remounts after every change, so it starts from what
 * was just stored, and its feedback has to survive that.
 */
function AssetDetails({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const update = useUpdateAsset(asset.id);
  const errorMessage = useErrorMessage();
  return (
    <div className="space-y-4">
      <AssetForm key={asset.version} asset={asset} update={update} />
      {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
      {update.data?.version === asset.version && (
        <Alert tone="success">{t('equipment.saved')}</Alert>
      )}
    </div>
  );
}

function AssetForm({ asset, update }: { asset: Asset; update: ReturnType<typeof useUpdateAsset> }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AssetFieldValues>({
    kind: asset.kind,
    name: asset.name,
    location: asset.location ?? '',
    purchasedOn: asset.purchasedOn ?? '',
    warrantyUntil: asset.warrantyUntil ?? '',
    note: asset.note ?? '',
  });
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber ?? '');
  const [status, setStatus] = useState(asset.status);
  const [showErrors, setShowErrors] = useState(false);
  const isAssigned = asset.status === 'assigned';

  function submit(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (!values.kind.trim() || !values.name.trim()) return;
    update.mutate({
      asset: {
        ...assetDetails(values),
        serialNumber: serialNumber.trim().toUpperCase() || undefined,
        status: status === 'assigned' ? undefined : status,
      },
      version: asset.version,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('equipment.form.serialNumber')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight} font-mono`}
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('equipment.status')}
          hint={isAssigned ? t('equipment.form.statusAssigned') : undefined}
        >
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={status}
              disabled={isAssigned}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              {isAssigned && <option value="assigned">{t('assetStatus.assigned')}</option>}
              {ASSET_MANUAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`assetStatus.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <AssetFields values={values} onChange={setValues} showErrors={showErrors} />
      <Button type="submit" disabled={update.isPending}>
        <Save className="size-4" aria-hidden="true" />
        {t('equipment.save')}
      </Button>
    </form>
  );
}

function History({ history }: { history: Assignment[] }) {
  const { t, i18n } = useTranslation();
  return (
    <section aria-labelledby="asset-history" className="space-y-3">
      <h2 id="asset-history" className="text-xl font-semibold">
        {t('equipment.history.heading')}
      </h2>
      {history.length === 0 ? (
        <p className="text-muted">{t('equipment.history.none')}</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <ReaderLink readerId={a.readerId}>
                  {[a.readerName, a.readerGroup].filter(Boolean).join(' · ')}
                </ReaderLink>
                <span className="text-muted">
                  {formatTimestampDate(a.assignedAt, i18n.language)} –{' '}
                  {a.returnedAt
                    ? formatTimestampDate(a.returnedAt, i18n.language)
                    : t('equipment.history.now')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t('equipment.history.privacy')}</p>
        </>
      )}
    </section>
  );
}
