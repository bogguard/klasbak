import type { PhotoPupil } from '@klasbak/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, Skeleton, StatusMessage, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { useAuthorizedApi } from '../../lib/auth';
import { compareGroups } from '../../lib/format';
import { usePhotoDay, usePhotoPupils } from './api';
import { emptyProgress, uploadPhotos, type UploadMode, type UploadProgress } from './upload';

const select = 'min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink';

/**
 * Uploading a photo day's photos. The usual way: the whole memory card at once, with a card
 * photo before each pupil. A class photo or a few photos of one pupil can be added too.
 */
export function UploadPhotosPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const detail = usePhotoDay(id);
  const pupils = usePhotoPupils();
  const errorMessage = useErrorMessage();

  const back = (
    <Link
      to={`/manage/photos/${id}`}
      className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('photos.upload.back')}
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
        <StatusMessage icon={<TriangleAlert className="size-6" />} title={errorMessage(failed)} />
      </div>
    );
  }
  const group = params.get('group');
  const reader = params.get('reader');
  const initial: UploadMode = group
    ? { kind: 'group', group }
    : reader
      ? { kind: 'reader', readerId: reader }
      : { kind: 'cards' };
  return (
    <div className="max-w-3xl space-y-6">
      {back}
      <Uploader
        dayId={id}
        dayName={detail.data.day.name}
        pupils={pupils.data}
        noPhoto={new Set(detail.data.pupils.filter((p) => p.noPhoto).map((p) => p.readerId))}
        initial={initial}
      />
    </div>
  );
}

function Uploader({
  dayId,
  dayName,
  pupils,
  noPhoto,
  initial,
}: {
  dayId: string;
  dayName: string;
  pupils: PhotoPupil[];
  noPhoto: Set<string>;
  initial: UploadMode;
}) {
  const { t } = useTranslation();
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<UploadMode>(initial);
  const [progress, setProgress] = useState<UploadProgress>();
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(false);
  const abort = useRef<AbortController>(undefined);
  const input = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () =>
      [...new Set(pupils.flatMap((p) => (p.group ? [p.group] : [])))].sort((a, b) =>
        compareGroups(a, b),
      ),
    [pupils],
  );
  const sortedPupils = useMemo(
    () =>
      pupils
        .filter((p) => !noPhoto.has(p.id))
        .sort(
          (a, b) => compareGroups(a.group, b.group) || a.lastName.localeCompare(b.lastName, 'nl'),
        ),
    [pupils, noPhoto],
  );
  const pupilName = (readerId: string) => {
    const pupil = pupils.find((p) => p.id === readerId);
    return pupil ? `${pupil.firstName} ${pupil.lastName}` : '';
  };

  // Leaving mid-way stops the uploads: ask first.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);
  useEffect(() => () => abort.current?.abort(), []);

  // A sleeping laptop or phone stops the uploads: keep the screen on while they run.
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => (lock = sentinel))
      .catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [running]);

  async function start(files: File[], retry?: UploadProgress) {
    if (files.length === 0 || running) return;
    abort.current = new AbortController();
    setRunning(true);
    setError(false);
    setProgress(emptyProgress(files.length));
    try {
      await uploadPhotos({
        api,
        dayId,
        files,
        mode,
        pupils,
        noPhoto,
        targets: retry ? new Map(retry.failed.map((f) => [f.file, f.target])) : undefined,
        signal: abort.current.signal,
        onProgress: setProgress,
      });
    } catch {
      setError(true);
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: ['photo-day', dayId] });
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start([...event.dataTransfer.files]);
  }

  const modeValue = mode.kind === 'cards' ? 'cards' : mode.kind;
  const ready =
    mode.kind === 'cards' ||
    (mode.kind === 'group' && mode.group) ||
    (mode.kind === 'reader' && mode.readerId);
  const recognised = progress ? Object.entries(progress.perPupil) : [];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t('photos.upload.heading')}</h1>
        <p className="text-muted">{dayName}</p>
      </div>

      <fieldset className="space-y-3" disabled={running}>
        <legend className="mb-2 text-lg font-semibold">{t('photos.upload.what')}</legend>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="radio"
            name="mode"
            checked={modeValue === 'cards'}
            onChange={() => setMode({ kind: 'cards' })}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-medium">{t('photos.upload.cards')}</span>
            <span className="block text-sm text-muted">{t('photos.upload.cardsHint')}</span>
          </span>
        </label>
        <label className="flex min-h-11 flex-wrap items-center gap-3">
          <input
            type="radio"
            name="mode"
            checked={modeValue === 'group'}
            onChange={() => setMode({ kind: 'group', group: groups[0] ?? '' })}
            className="size-4 accent-[var(--accent)]"
          />
          <span className="font-medium">{t('photos.upload.classPhoto')}</span>
          {mode.kind === 'group' && (
            <select
              aria-label={t('photos.class')}
              value={mode.group}
              onChange={(e) => setMode({ kind: 'group', group: e.target.value })}
              className={select}
            >
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="flex min-h-11 flex-wrap items-center gap-3">
          <input
            type="radio"
            name="mode"
            checked={modeValue === 'reader'}
            onChange={() => setMode({ kind: 'reader', readerId: sortedPupils[0]?.id ?? '' })}
            className="size-4 accent-[var(--accent)]"
          />
          <span className="font-medium">{t('photos.upload.onePupil')}</span>
          {mode.kind === 'reader' && (
            <select
              aria-label={t('photos.upload.pupil')}
              value={mode.readerId}
              onChange={(e) => setMode({ kind: 'reader', readerId: e.target.value })}
              className={select}
            >
              {sortedPupils.map((pupil) => (
                <option key={pupil.id} value={pupil.id}>
                  {[pupil.group, `${pupil.firstName} ${pupil.lastName}`]
                    .filter(Boolean)
                    .join(' · ')}
                </option>
              ))}
            </select>
          )}
        </label>
      </fieldset>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!running) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
      >
        <ImagePlus className="size-8 text-muted" aria-hidden="true" />
        <p>{t('photos.upload.drop')}</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg"
          multiple
          className="sr-only"
          onChange={(e) => {
            void start([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <Button disabled={running || !ready} onClick={() => input.current?.click()}>
          {t('photos.upload.choose')}
        </Button>
        <p className="text-sm text-muted">{t('photos.upload.jpegOnly')}</p>
      </div>

      {error && <Alert tone="danger">{t('photos.upload.failed')}</Alert>}

      {progress && progress.total > 0 && (
        <section className="space-y-3" aria-live="polite">
          <div className="space-y-1">
            <p className="font-medium">
              {progress.done
                ? t('photos.upload.done', { count: progress.uploaded })
                : t('photos.upload.progress', { done: progress.processed, total: progress.total })}
            </p>
            <progress
              className="h-2 w-full accent-[var(--accent)]"
              max={progress.total}
              value={progress.processed}
            />
            {!progress.done && progress.current && (
              <p className="text-sm text-muted">
                {t('photos.upload.current', { name: progress.current })}
              </p>
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {progress.cards > 0 && (
              <li>{t('photos.upload.cardsFound', { count: progress.cards })}</li>
            )}
            {progress.classPhotos > 0 && (
              <li>{t('photos.upload.classPhotos', { count: progress.classPhotos })}</li>
            )}
            {progress.unassigned > 0 && (
              <li>{t('photos.upload.unassigned', { count: progress.unassigned })}</li>
            )}
            {progress.skipped > 0 && (
              <li>{t('photos.upload.skipped', { count: progress.skipped })}</li>
            )}
            {progress.unknownCodes.length > 0 && (
              <li>
                {t('photos.upload.unknownCodes', { codes: progress.unknownCodes.join(', ') })}
              </li>
            )}
            {progress.unscanned > 0 && (
              <li className="text-danger">
                {t('photos.upload.unscanned', { count: progress.unscanned })}
              </li>
            )}
            {progress.unreadable.length > 0 && (
              <li className="text-danger">
                {t('photos.upload.unreadable', { names: progress.unreadable.join(', ') })}
              </li>
            )}
          </ul>
          {progress.failed.length > 0 && progress.done && (
            <Alert
              tone="danger"
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    void start(
                      progress.failed.map((f) => f.file),
                      progress,
                    )
                  }
                >
                  {t('errors.retry')}
                </Button>
              }
            >
              {t('photos.upload.failedSome', { count: progress.failed.length })}
            </Alert>
          )}
          {running && (
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              {t('photos.upload.stop')}
            </Button>
          )}
          {recognised.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer content-center font-medium">
                {t('photos.upload.perPupil', { count: recognised.length })}
              </summary>
              <ul className="mt-2 columns-1 text-sm sm:columns-2">
                {recognised.map(([readerId, count]) => (
                  <li key={readerId}>
                    {pupilName(readerId)}: {count}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {progress.done && (
            <Link
              to={`/manage/photos/${dayId}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-ink hover:opacity-90"
            >
              {t('photos.upload.review')}
            </Link>
          )}
        </section>
      )}
    </>
  );
}
