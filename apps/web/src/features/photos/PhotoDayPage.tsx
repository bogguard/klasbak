import {
  canParentsDownload,
  defaultAvailableUntil,
  latestAvailableUntil,
  localDate,
  photoDayDeleteAfter,
  type Photo,
  type PhotoDay,
  type PhotoDayDetail,
  type PhotoPupil,
} from '@klasbak/shared';
import {
  ArrowLeft,
  Check,
  FileText,
  ImagePlus,
  MoreHorizontal,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useIsAdmin } from '../../lib/auth';
import { useConfig } from '../../lib/config';
import { compareGroups, formatDate } from '../../lib/format';
import { loadLogo } from '../labels/pdf';
import {
  useDeletePhotoDay,
  useEnsureCodes,
  usePhotoDay,
  usePhotoImages,
  usePhotoPupils,
  useRenewCode,
  useSetNoPhoto,
  useUpdatePhotoDay,
} from './api';
import { classListsPdf, photoSlipsPdf, type PhotoSlip } from './pdf';
import { PhotoDialog } from './PhotoDialog';
import { PhotoDayStatus } from './PhotoDaysPage';

const UNASSIGNED = '__unassigned';
const NO_CLASS = '__none';
const linkButton = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium transition';

export function PhotoDayPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const detail = usePhotoDay(id);
  const pupils = usePhotoPupils();
  const errorMessage = useErrorMessage();

  const back = (
    <Link
      to="/manage/photos"
      className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('photos.back')}
    </Link>
  );
  if (detail.isPending || pupils.isPending) {
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const failed = detail.error ?? pupils.error;
  if (failed || !detail.data || !pupils.data) {
    return (
      <div className="space-y-6">
        {back}
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(failed)}
          action={<Button onClick={() => void detail.refetch()}>{t('errors.retry')}</Button>}
        />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {back}
      <DayView detail={detail.data} pupils={pupils.data} />
    </div>
  );
}

const byName = (a: PhotoPupil, b: PhotoPupil) =>
  a.lastName.localeCompare(b.lastName, 'nl') || a.firstName.localeCompare(b.firstName, 'nl');

const byTime = (a: Photo, b: Photo) =>
  (a.takenAt ?? a.uploadedAt).localeCompare(b.takenAt ?? b.uploadedAt);

/** Everything the page shows, worked out once from the photos and the class lists. */
function useDayOverview(detail: PhotoDayDetail, pupils: PhotoPupil[]) {
  return useMemo(() => {
    const noPhoto = new Set(detail.pupils.filter((p) => p.noPhoto).map((p) => p.readerId));
    const hasCode = new Set(detail.pupils.filter((p) => p.hasCode).map((p) => p.readerId));
    const pupilIds = new Set(pupils.map((p) => p.id));
    const portraits = new Map<string, Photo[]>();
    for (const photo of [...detail.photos].sort(byTime)) {
      if (photo.kind !== 'portrait' || !photo.readerId) continue;
      portraits.set(photo.readerId, [...(portraits.get(photo.readerId) ?? []), photo]);
    }
    const classPhotos = detail.photos.filter((p) => p.kind === 'class').sort(byTime);
    // Portraits of someone no longer in the class lists wait with the unsorted ones.
    const unassigned = detail.photos
      .filter((p) => p.kind === 'portrait' && (!p.readerId || !pupilIds.has(p.readerId)))
      .sort(byTime);
    const names = new Set(pupils.map((p) => p.group ?? NO_CLASS));
    for (const photo of classPhotos) if (photo.group) names.add(photo.group);
    const groups = [...names].sort((a, b) =>
      compareGroups(a === NO_CLASS ? undefined : a, b === NO_CLASS ? undefined : b),
    );
    const progress = new Map(
      groups.map((group) => {
        const members = pupils.filter((p) => (p.group ?? NO_CLASS) === group && !noPhoto.has(p.id));
        const done = members.filter((p) => portraits.has(p.id)).length;
        return [group, { done, total: members.length }] as const;
      }),
    );
    const totals = [...progress.values()].reduce(
      (sum, p) => ({ done: sum.done + p.done, total: sum.total + p.total }),
      { done: 0, total: 0 },
    );
    return { noPhoto, hasCode, portraits, classPhotos, unassigned, groups, progress, totals };
  }, [detail, pupils]);
}

type Overview = ReturnType<typeof useDayOverview>;

function DayView({ detail, pupils }: { detail: PhotoDayDetail; pupils: PhotoPupil[] }) {
  const { t, i18n } = useTranslation();
  const { day, photos } = detail;
  const isAdmin = useIsAdmin();
  const overview = useDayOverview(detail, pupils);
  const [params, setParams] = useSearchParams();
  const fallback = overview.unassigned.length > 0 ? UNASSIGNED : (overview.groups[0] ?? NO_CLASS);
  const asked = params.get('class');
  // Once the last loose photo is sorted, its (now empty) view gives way to the classes.
  const selected =
    asked && !(asked === UNASSIGNED && overview.unassigned.length === 0) ? asked : fallback;
  const groupLabel = (group: string) => (group === NO_CLASS ? t('photos.withoutClass') : group);
  const open = canParentsDownload(day, localDate());
  const sorted =
    photos.length > 0 &&
    overview.unassigned.length === 0 &&
    overview.totals.done === overview.totals.total;
  const classOnPage = selected === UNASSIGNED ? undefined : selected;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{day.name}</h1>
          <p className="text-muted">
            {formatDate(day.takenOn, i18n.language)} · {t('photos.count', { count: photos.length })}
          </p>
          <PhotoDayStatus day={day} />
        </div>
        <Link
          to={`/manage/photos/${day.id}/upload`}
          className={`${linkButton} bg-accent text-accent-ink hover:opacity-90`}
        >
          <Upload className="size-4" aria-hidden="true" />
          {t('photos.upload.link')}
        </Link>
      </div>

      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        <Step
          number={1}
          title={t('photos.steps.classLists.title')}
          status={t('photos.steps.classLists.status')}
        >
          <ClassListButtons
            day={day}
            pupils={pupils}
            noPhoto={overview.noPhoto}
            group={classOnPage}
            groupLabel={groupLabel}
          />
        </Step>
        <Step
          number={2}
          title={t('photos.steps.upload.title')}
          done={photos.length > 0}
          status={
            photos.length > 0
              ? t('photos.steps.upload.done', { count: photos.length })
              : t('photos.steps.upload.none')
          }
        />
        <Step
          number={3}
          title={t('photos.steps.review.title')}
          done={sorted}
          status={[
            t('photos.steps.review.status', overview.totals),
            overview.unassigned.length > 0 &&
              t('photos.steps.review.unassigned', { count: overview.unassigned.length }),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Step
          number={4}
          title={t('photos.steps.parents.title')}
          done={open}
          status={
            open && day.availableUntil
              ? t('photos.parents.openUntil', {
                  date: formatDate(day.availableUntil, i18n.language),
                })
              : isAdmin
                ? t('photos.parents.closed')
                : t('photos.steps.parents.notAdmin')
          }
        >
          {isAdmin && <ParentsPanel day={day} pupils={pupils} group={classOnPage} />}
        </Step>
      </ol>

      <Review
        day={day}
        pupils={pupils}
        overview={overview}
        selected={selected}
        onSelect={(group) => setParams({ class: group }, { replace: true })}
        groupLabel={groupLabel}
      />

      {isAdmin && <DayEditor day={day} />}
    </>
  );
}

function Step({
  number,
  title,
  status,
  done = false,
  children,
}: {
  number: number;
  title: string;
  status: string;
  done?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex gap-3 p-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full font-semibold ${
          done ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="size-5" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-semibold">
            <span className="sr-only">{t('photos.steps.number', { number })} </span>
            {title}
            {done && <span className="sr-only"> ({t('photos.steps.done')})</span>}
          </h2>
          <p className="text-sm text-muted">{status}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

/** Step 3: per class, every pupil with their photos; or the photos nobody was found for. */
function Review({
  day,
  pupils,
  overview,
  selected,
  onSelect,
  groupLabel,
}: {
  day: PhotoDay;
  pupils: PhotoPupil[];
  overview: Overview;
  selected: string;
  onSelect: (group: string) => void;
  groupLabel: (group: string) => string;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<{ queue: Photo[]; startId: string }>();
  const inClass =
    selected === UNASSIGNED
      ? []
      : pupils.filter((p) => (p.group ?? NO_CLASS) === selected).sort(byName);
  const classPhotosHere = overview.classPhotos.filter((p) => p.group === selected);
  const visible =
    selected === UNASSIGNED
      ? overview.unassigned
      : [...classPhotosHere, ...inClass.flatMap((p) => overview.portraits.get(p.id) ?? [])];
  const images = usePhotoImages(
    day.id,
    visible.slice(0, 500).map((p) => p.id),
  );
  const missing = inClass.filter(
    (p) => !overview.portraits.has(p.id) && !overview.noPhoto.has(p.id),
  );
  const open = (photo: Photo) => setDialog({ queue: visible, startId: photo.id });

  return (
    <section id="review" aria-labelledby="review-heading" className="scroll-mt-6 space-y-4">
      <h2 id="review-heading" className="text-xl font-semibold">
        {t('photos.steps.review.title')}
      </h2>
      <ul className="flex flex-wrap gap-2" aria-label={t('photos.class')}>
        {overview.unassigned.length > 0 && (
          <li>
            <ClassChip
              label={t('photos.unassigned.chip')}
              detail={String(overview.unassigned.length)}
              tone="warning"
              selected={selected === UNASSIGNED}
              onClick={() => onSelect(UNASSIGNED)}
            />
          </li>
        )}
        {overview.groups.map((group) => {
          const progress = overview.progress.get(group) ?? { done: 0, total: 0 };
          const complete = progress.total > 0 && progress.done === progress.total;
          return (
            <li key={group}>
              <ClassChip
                label={groupLabel(group)}
                detail={t('photos.classProgress', progress)}
                tone={complete ? 'success' : 'neutral'}
                selected={selected === group}
                onClick={() => onSelect(group)}
              />
            </li>
          );
        })}
      </ul>

      {selected === UNASSIGNED ? (
        <div className="space-y-3">
          <p className="max-w-prose text-muted">{t('photos.unassigned.hint')}</p>
          <Thumbnails
            photos={overview.unassigned}
            images={images.data}
            onOpen={open}
            label={t('photos.unassigned.photo')}
          />
        </div>
      ) : (
        <>
          {missing.length > 0 && overview.portraits.size > 0 && (
            <Alert tone="info">
              {t('photos.missing', { names: missing.map((p) => p.firstName).join(', ') })}
            </Alert>
          )}
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <Users className="size-5 text-muted" aria-hidden="true" />
                {t('photos.classPhoto.heading', { group: groupLabel(selected) })}
              </h3>
              {selected !== NO_CLASS && (
                <Link
                  to={`/manage/photos/${day.id}/upload?group=${encodeURIComponent(selected)}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-accent hover:bg-surface-sunken"
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  {t('photos.add')}
                  <span className="sr-only">
                    {t('photos.classPhoto.heading', { group: groupLabel(selected) })}
                  </span>
                </Link>
              )}
            </div>
            {classPhotosHere.length > 0 ? (
              <Thumbnails
                photos={classPhotosHere}
                images={images.data}
                onOpen={open}
                label={t('photos.classPhoto.photo', { group: groupLabel(selected) })}
              />
            ) : (
              <p className="text-sm text-muted">{t('photos.classPhoto.none')}</p>
            )}
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {inClass.map((pupil) => (
              <PupilRow
                key={pupil.id}
                day={day}
                pupil={pupil}
                photos={overview.portraits.get(pupil.id) ?? []}
                images={images.data}
                noPhoto={overview.noPhoto.has(pupil.id)}
                hasCode={overview.hasCode.has(pupil.id)}
                onOpen={open}
              />
            ))}
          </ul>
        </>
      )}

      {dialog && (
        <PhotoDialog
          day={day}
          queue={dialog.queue}
          startId={dialog.startId}
          images={images.data}
          pupils={pupils}
          noPhoto={overview.noPhoto}
          groups={overview.groups.filter((g) => g !== NO_CLASS)}
          suggestGroup={selected === UNASSIGNED || selected === NO_CLASS ? undefined : selected}
          onClose={() => setDialog(undefined)}
        />
      )}
    </section>
  );
}

function ClassChip({
  label,
  detail,
  tone,
  selected,
  onClick,
}: {
  label: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning';
  selected: boolean;
  onClick: () => void;
}) {
  const tones = { neutral: 'text-muted', success: 'text-success', warning: 'text-warning' };
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
        selected
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-line bg-surface hover:bg-surface-sunken'
      }`}
    >
      {label}
      <span className={`inline-flex items-center gap-1 ${tones[tone]}`}>
        {tone === 'success' && <Check className="size-3.5" aria-hidden="true" />}
        {detail}
      </span>
    </button>
  );
}

function Thumbnails({
  photos,
  images,
  onOpen,
  label,
}: {
  photos: Photo[];
  images: Record<string, string> | undefined;
  onOpen: (photo: Photo) => void;
  label: string;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {photos.map((photo, i) => {
        const url = images?.[photo.id];
        return (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => onOpen(photo)}
              className="block overflow-hidden rounded-lg border border-line hover:border-accent focus-visible:border-accent"
            >
              {url ? (
                <img
                  src={url}
                  alt={`${label} ${i + 1}`}
                  loading="lazy"
                  className="h-32 w-auto max-w-56 object-cover"
                  style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                />
              ) : (
                <Skeleton className="h-32 w-24" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PupilRow({
  day,
  pupil,
  photos,
  images,
  noPhoto,
  hasCode,
  onOpen,
}: {
  day: PhotoDay;
  pupil: PhotoPupil;
  photos: Photo[];
  images: Record<string, string> | undefined;
  noPhoto: boolean;
  hasCode: boolean;
  onOpen: (photo: Photo) => void;
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const setNoPhoto = useSetNoPhoto(day.id);
  const renew = useRenewCode(day.id);
  const errorMessage = useErrorMessage();
  const { libraryName, logoKey } = useConfig();
  const slipTexts = useSlipTexts(day);
  const name = `${pupil.firstName} ${pupil.lastName}`;

  async function renewCode() {
    if (!window.confirm(t('photos.codes.confirmRenew', { name }))) return;
    const { code } = await renew.mutateAsync(pupil.id);
    if (!slipTexts) return;
    // The new slip right away: the old one no longer works.
    const doc = await photoSlipsPdf([{ pupil, code }], {
      schoolName: libraryName,
      origin: window.location.origin,
      texts: slipTexts,
      logo: await loadLogo(logoKey),
    });
    doc.save(`${t('photos.codes.fileName')}-${pupil.firstName}.pdf`);
  }

  const actions: { label: string; run: () => void }[] = [];
  // Only without photos: the server refuses "no photos" while there are some.
  if (isAdmin && (noPhoto || photos.length === 0)) {
    actions.push({
      label: noPhoto ? t('photos.noPhoto.undo') : t('photos.noPhoto.set'),
      run: () => setNoPhoto.mutate({ readerId: pupil.id, noPhoto: !noPhoto }),
    });
  }
  if (isAdmin && hasCode) {
    actions.push({ label: t('photos.codes.renew'), run: () => void renewCode().catch(() => {}) });
  }
  const failed = setNoPhoto.error ?? renew.error;

  return (
    <li className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          {noPhoto && <Badge tone="warning">{t('photos.noPhoto.badge')}</Badge>}
          {!noPhoto && photos.length === 0 && <Badge>{t('photos.none')}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!noPhoto && (
            <Link
              to={`/manage/photos/${day.id}/upload?reader=${pupil.id}`}
              aria-label={t('photos.addFor', { name })}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-accent hover:bg-surface-sunken"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('photos.add')}</span>
            </Link>
          )}
          {actions.length > 0 && <Menu label={t('photos.moreFor', { name })} actions={actions} />}
        </div>
      </div>
      {photos.length > 0 && (
        <Thumbnails
          photos={photos}
          images={images}
          onOpen={onOpen}
          label={t('photos.photoOf', { name })}
        />
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(failed)}
        </p>
      )}
    </li>
  );
}

/** A small menu for actions a row rarely needs. Closes on Escape or a click elsewhere. */
function Menu({
  label,
  actions,
}: {
  label: string;
  actions: { label: string; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-lg">
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                autoFocus={action === actions[0]}
                onClick={() => {
                  setOpen(false);
                  action.run();
                }}
                className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-surface-sunken"
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The texts on a slip; undefined while parents can't download (no date to print yet). */
function useSlipTexts(day: PhotoDay) {
  const { t, i18n } = useTranslation();
  const site = window.location.host;
  if (!day.availableUntil || !canParentsDownload(day, localDate())) return undefined;
  return {
    heading: day.name,
    howTo: t('photos.slip.howTo', { site }),
    until: t('photos.slip.until', { date: formatDate(day.availableUntil, i18n.language) }),
  };
}

/** A PDF made on a click, with a busy and a failed state. */
function usePdfTask() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try {
      await task();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return { busy, failed, run };
}

/** Step 1: the class lists for the photographer, for the class shown below or all of them. */
function ClassListButtons({
  day,
  pupils,
  noPhoto,
  group,
  groupLabel,
}: {
  day: PhotoDay;
  pupils: PhotoPupil[];
  noPhoto: Set<string>;
  group: string | undefined;
  groupLabel: (group: string) => string;
}) {
  const { t } = useTranslation();
  const { busy, failed, run } = usePdfTask();
  const inGroup = (pupil: PhotoPupil) => !group || (pupil.group ?? NO_CLASS) === group;

  const print = (all: boolean) =>
    run(async () => {
      const doc = await classListsPdf(all ? pupils : pupils.filter(inGroup), {
        dayName: day.name,
        noPhoto,
        texts: {
          heading: (name) => t('photos.classList.heading', { group: name }),
          instructions: t('photos.classList.instructions'),
          classPhoto: (name) => t('photos.classList.classPhoto', { group: name }),
          noPhoto: t('photos.noPhoto.badge'),
          withoutClass: t('photos.withoutClass'),
        },
      });
      const suffix = all || !group ? '' : `-${groupLabel(group)}`;
      doc.save(`${t('photos.classList.fileName')}${suffix}.pdf`);
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {group && (
          <Button variant="secondary" disabled={busy} onClick={() => void print(false)}>
            <FileText className="size-4" aria-hidden="true" />
            {t('photos.classList.button', { group: groupLabel(group) })}
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => void print(true)}>
          <FileText className="size-4" aria-hidden="true" />
          {t('photos.classList.all')}
        </Button>
      </div>
      {failed && <Alert tone="danger">{t('photos.print.failed')}</Alert>}
    </div>
  );
}

/** Step 4: opening the photos to parents until a date in this school year, and the slips. */
function ParentsPanel({
  day,
  pupils,
  group,
}: {
  day: PhotoDay;
  pupils: PhotoPupil[];
  group: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const update = useUpdatePhotoDay(day.id);
  const ensureCodes = useEnsureCodes(day.id);
  const errorMessage = useErrorMessage();
  const { libraryName, logoKey } = useConfig();
  const slipTexts = useSlipTexts(day);
  const { busy, failed, run } = usePdfTask();
  const [nothing, setNothing] = useState(false);
  const today = localDate();
  const latest = latestAvailableUntil(day);
  const isOpen = canParentsDownload(day, today);
  const [until, setUntil] = useState(
    day.availableUntil && day.availableUntil >= today
      ? day.availableUntil
      : defaultAvailableUntil(day, today),
  );
  const valid = until >= today && until <= latest;
  const slipGroup = group === NO_CLASS ? undefined : group;

  function save(open: boolean) {
    update.mutate({ name: day.name, takenOn: day.takenOn, open, availableUntil: until });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) save(true);
  }

  const slips = (all: boolean) =>
    run(async () => {
      if (!slipTexts) return;
      setNothing(false);
      const codes = await ensureCodes.mutateAsync();
      const byId = new Map(pupils.map((p) => [p.id, p]));
      const rows: PhotoSlip[] = codes.flatMap(({ readerId, code }) => {
        const pupil = byId.get(readerId);
        return pupil && (all || !slipGroup || pupil.group === slipGroup) ? [{ pupil, code }] : [];
      });
      if (rows.length === 0) {
        setNothing(true);
        return;
      }
      const doc = await photoSlipsPdf(rows, {
        schoolName: libraryName,
        origin: window.location.origin,
        texts: slipTexts,
        logo: await loadLogo(logoKey),
      });
      const suffix = all || !slipGroup ? '' : `-${slipGroup}`;
      doc.save(`${t('photos.codes.fileName')}${suffix}.pdf`);
    });

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <Field
          label={t('photos.parents.until')}
          error={
            valid
              ? undefined
              : t('photos.parents.untilInvalid', { date: formatDate(latest, i18n.language) })
          }
          className="w-full max-w-56"
        >
          {(props) => (
            <input
              {...props}
              type="date"
              min={today}
              max={latest}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={`${props.className} ${inputHeight}`}
            />
          )}
        </Field>
        {isOpen ? (
          <>
            {until !== day.availableUntil && (
              <Button type="submit" disabled={update.isPending || !valid}>
                {t('photos.parents.saveDate')}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={update.isPending}
              onClick={() => save(false)}
            >
              {t('photos.parents.close')}
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={update.isPending || !valid}>
            {t('photos.parents.open')}
          </Button>
        )}
      </form>
      <p className="text-sm text-muted">
        {t('photos.parents.untilHint', { date: formatDate(latest, i18n.language) })}{' '}
        {t('photos.parents.deleted', {
          date: formatDate(photoDayDeleteAfter(day), i18n.language),
        })}
      </p>
      {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}

      {slipTexts ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {slipGroup && (
              <Button variant="secondary" disabled={busy} onClick={() => void slips(false)}>
                <FileText className="size-4" aria-hidden="true" />
                {t('photos.codes.button', { group: slipGroup })}
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => void slips(true)}>
              <FileText className="size-4" aria-hidden="true" />
              {t('photos.codes.all')}
            </Button>
          </div>
          <p className="text-sm text-muted">{t('photos.codes.hint')}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('photos.codes.openFirst')}</p>
      )}
      {nothing && <Alert tone="info">{t('photos.codes.nothing')}</Alert>}
      {failed && <Alert tone="danger">{t('photos.print.failed')}</Alert>}
    </div>
  );
}

function DayEditor({ day }: { day: PhotoDay }) {
  const { t } = useTranslation();
  const update = useUpdatePhotoDay(day.id);
  const remove = useDeletePhotoDay(day.id);
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [name, setName] = useState(day.name);
  const [takenOn, setTakenOn] = useState(day.takenOn);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !takenOn) return;
    update.mutate({
      name: name.trim(),
      takenOn,
      open: day.open,
      availableUntil: day.availableUntil,
    });
  }

  async function deleteDay() {
    if (!window.confirm(t('photos.edit.confirmDelete', { name: day.name }))) return;
    try {
      await remove.mutateAsync();
      void navigate('/manage/photos');
    } catch {
      // Shown below.
    }
  }

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="min-h-11 cursor-pointer content-center font-medium">
        {t('photos.edit.heading')}
      </summary>
      <form onSubmit={submit} className="mt-4 max-w-xl space-y-4">
        <Field label={t('photos.fields.name')} required>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('photos.fields.takenOn')} required>
          {(props) => (
            <input
              {...props}
              type="date"
              className={`${props.className} ${inputHeight}`}
              value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)}
            />
          )}
        </Field>
        {(update.error ?? remove.error) && (
          <Alert tone="danger">{errorMessage(update.error ?? remove.error)}</Alert>
        )}
        {update.isSuccess && <Alert tone="success">{t('photos.edit.saved')}</Alert>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="submit" disabled={update.isPending}>
            {t('photos.edit.save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="text-danger"
            disabled={remove.isPending}
            onClick={() => void deleteDay()}
          >
            {t('photos.edit.delete')}
          </Button>
        </div>
        <p className="text-sm text-muted">{t('photos.edit.deleteHint')}</p>
      </form>
    </details>
  );
}
