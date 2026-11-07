import {
  ASSET_STATUSES,
  isAssetOverdue,
  localDate,
  type Asset,
  type AssetStatus,
} from '@klasbak/shared';
import { Laptop, Plus, Search, Tags, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { formatDate } from '../../lib/format';
import { useAssets } from './api';
import { findByCode, matchesSearch, matchesStatus, suggestions, summariseStock } from './stock';

const linkButton = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium transition';
const select = 'min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink';

const STATUS_TONES: Record<AssetStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  available: 'success',
  assigned: 'neutral',
  repair: 'warning',
  lost: 'danger',
  withdrawn: 'neutral',
};

export function AssetStatusBadge({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONES[asset.status]}>{t(`assetStatus.${asset.status}`)}</Badge>;
}

/** The school's stock: how much of each kind, and where every item is. */
export function EquipmentPage() {
  const { t } = useTranslation();
  const assets = useAssets();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const kind = params.get('kind') ?? '';
  const status = params.get('status') ?? '';
  const location = params.get('location') ?? '';
  const today = localDate();

  const all = useMemo(() => assets.data ?? [], [assets.data]);
  const summary = useMemo(() => summariseStock(all), [all]);
  const locations = useMemo(() => suggestions(all.map((a) => a.location)), [all]);
  const labelsWaiting = all.filter((a) => a.status !== 'withdrawn' && !a.labelPrintedAt).length;

  const visible = useMemo(
    () =>
      all
        .filter(
          (a) =>
            (!kind || a.kind === kind) &&
            (!location || a.location === location) &&
            matchesStatus(a, status, today) &&
            matchesSearch(a, query),
        )
        .sort(
          (a, b) =>
            a.kind.localeCompare(b.kind, 'nl') ||
            a.name.localeCompare(b.name, 'nl') ||
            a.barcode.localeCompare(b.barcode),
        ),
    [all, kind, location, status, query, today],
  );

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  // A scanner types the code and presses Enter: that opens the item.
  function openScanned(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const found = findByCode(all, query);
    if (found) void navigate(`/manage/equipment/${found.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('equipment.heading')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/manage/equipment/labels"
            className={`${linkButton} border border-line bg-surface hover:bg-surface-sunken`}
          >
            <Tags className="size-4" aria-hidden="true" />
            {t('equipment.labels.link', { count: labelsWaiting })}
          </Link>
          <Link
            to="/manage/equipment/new"
            className={`${linkButton} bg-accent text-accent-ink hover:opacity-90`}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('equipment.add')}
          </Link>
        </div>
      </div>

      {assets.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : assets.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(assets.error)}
          action={<Button onClick={() => void assets.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : all.length === 0 ? (
        <StatusMessage icon={<Laptop className="size-6" />} title={t('equipment.empty.title')}>
          {t('equipment.empty.hint')}
        </StatusMessage>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <li key={s.kind}>
                <button
                  type="button"
                  aria-pressed={kind === s.kind}
                  onClick={() => setFilter('kind', kind === s.kind ? '' : s.kind)}
                  className={`w-full rounded-xl border bg-surface p-4 text-left hover:bg-surface-sunken ${kind === s.kind ? 'border-accent' : 'border-line'}`}
                >
                  <span className="block font-medium">{s.kind}</span>
                  <span className="mt-1 block font-display text-3xl tabular-nums">
                    {t('equipment.summary.available', { available: s.available, total: s.total })}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {[
                      t('equipment.summary.assigned', { count: s.assigned }),
                      s.repair > 0 && t('equipment.summary.repair', { count: s.repair }),
                      s.lost > 0 && t('equipment.summary.lost', { count: s.lost }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-60 flex-1">
              <span className="sr-only">{t('equipment.search')}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={openScanned}
                placeholder={t('equipment.search')}
                className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              {t('equipment.status')}
              <select
                value={status}
                onChange={(e) => setFilter('status', e.target.value)}
                className={select}
              >
                <option value="">{t('equipment.allStatuses')}</option>
                {ASSET_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`assetStatus.${value}`)}
                  </option>
                ))}
                <option value="overdue">{t('equipment.overdue')}</option>
              </select>
            </label>
            {locations.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                {t('equipment.location')}
                <select
                  value={location}
                  onChange={(e) => setFilter('location', e.target.value)}
                  className={select}
                >
                  <option value="">{t('equipment.allLocations')}</option>
                  {locations.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <p className="text-sm text-muted" aria-live="polite">
            {t('equipment.count', { count: visible.length })}
          </p>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('equipment.item')}
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t('equipment.code')}
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t('equipment.location')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('equipment.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((asset) => (
                  <AssetRow key={asset.id} asset={asset} today={today} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AssetRow({ asset, today }: { asset: Asset; today: string }) {
  const { t, i18n } = useTranslation();
  const { holder } = asset;
  return (
    <tr className="hover:bg-surface-sunken">
      <td className="px-4 py-3">
        <Link
          to={`/manage/equipment/${asset.id}`}
          className="font-medium hover:text-accent hover:underline"
        >
          {asset.name}
        </Link>
        <span className="block text-muted">{asset.kind}</span>
        {/* On a phone the status matters most: the place moves here, the codes stay out. */}
        {asset.location && <span className="block text-muted sm:hidden">{asset.location}</span>}
      </td>
      <td className="hidden px-4 py-3 font-mono sm:table-cell">
        {asset.barcode}
        {asset.serialNumber && <span className="block text-muted">{asset.serialNumber}</span>}
      </td>
      <td className="hidden px-4 py-3 sm:table-cell">{asset.location ?? '—'}</td>
      <td className="px-4 py-3">
        <AssetStatusBadge asset={asset} />
        {holder && (
          <span className="mt-1 block">
            {[holder.readerName, holder.readerGroup].filter(Boolean).join(' · ')}
          </span>
        )}
        {holder?.dueDate && (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            {t('equipment.due', { date: formatDate(holder.dueDate, i18n.language) })}
            {isAssetOverdue(asset, today) && <Badge tone="danger">{t('loans.late')}</Badge>}
          </span>
        )}
      </td>
    </tr>
  );
}
