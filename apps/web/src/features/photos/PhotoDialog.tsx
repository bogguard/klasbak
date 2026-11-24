import type { Photo, PhotoDay, PhotoPupil, PhotoTarget } from '@klasbak/shared';
import { ChevronLeft, ChevronRight, ImageOff, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { useDeletePhoto, useMovePhoto } from './api';

/** Lowercase, no accents: "zoe" finds "Zoë". */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

type Choice = { key: string; label: string; detail?: string; target: PhotoTarget; icon?: boolean };

const MAX_CHOICES = 8;

/**
 * Sorting photos one after the other: type a few letters of a name, Enter, and the next photo
 * appears. Arrow keys (with the search field empty) or the buttons go back and forth.
 */
export function PhotoDialog({
  day,
  queue,
  startId,
  images,
  pupils,
  noPhoto,
  groups,
  suggestGroup,
  onClose,
}: {
  day: PhotoDay;
  /** The photos of the view it was opened from, in order. */
  queue: Photo[];
  startId: string;
  images: Record<string, string> | undefined;
  pupils: PhotoPupil[];
  noPhoto: Set<string>;
  groups: string[];
  /** The class shown behind the dialog: its pupils come first. */
  suggestGroup?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const move = useMovePhoto(day.id);
  const remove = useDeletePhoto(day.id);
  const errorMessage = useErrorMessage();
  // A snapshot: photos moved out of the view stay in the series until the dialog closes.
  const [series] = useState(queue);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      queue.findIndex((p) => p.id === startId),
    ),
  );
  const [query, setQuery] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  const photo = series[index];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Ready for the next name as soon as the next photo shows.
  useEffect(() => {
    search.current?.focus();
  }, [index]);

  const choices = useMemo(() => {
    const classChoices: Choice[] = groups.map((group) => ({
      key: `g:${group}`,
      label: t('photos.dialog.classPhoto', { group }),
      target: { group },
      icon: true,
    }));
    const pupilChoices: Choice[] = pupils
      .filter((pupil) => !noPhoto.has(pupil.id))
      .map((pupil) => ({
        key: `r:${pupil.id}`,
        label: `${pupil.firstName} ${pupil.lastName}`,
        detail: pupil.group,
        target: { readerId: pupil.id },
      }));
    const words = plain(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      // Without a search: the class behind the dialog, then its class photo.
      const own = pupilChoices.filter((c) => c.detail === suggestGroup);
      const ownClass = classChoices.filter((c) => c.target.group === suggestGroup);
      return [...own, ...ownClass].slice(0, MAX_CHOICES * 4);
    }
    const matches = (c: Choice) =>
      words.every((word) => plain(`${c.label} ${c.detail ?? ''}`).includes(word));
    return [...pupilChoices.filter(matches), ...classChoices.filter(matches)].slice(0, MAX_CHOICES);
  }, [groups, pupils, noPhoto, query, suggestGroup, t]);

  function go(step: number) {
    const next = index + step;
    if (next < 0 || next >= series.length) return;
    setIndex(next);
    setQuery('');
    move.reset();
    remove.reset();
  }

  /** After sorting a photo: on to the next one, or close when the series is done. */
  function advance() {
    setQuery('');
    if (index + 1 < series.length) setIndex(index + 1);
    else dialog.current?.close();
  }

  async function choose(choice: Choice) {
    if (!photo) return;
    try {
      await move.mutateAsync({ photoId: photo.id, target: choice.target });
      setDone((current) => ({ ...current, [photo.id]: choice.label }));
      advance();
    } catch {
      // Shown in the dialog.
    }
  }

  async function deletePhoto() {
    if (!photo || !window.confirm(t('photos.dialog.confirmDelete'))) return;
    try {
      await remove.mutateAsync(photo.id);
      setDone((current) => ({ ...current, [photo.id]: t('photos.dialog.deleted') }));
      advance();
    } catch {
      // Shown in the dialog.
    }
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && choices[0]) {
      event.preventDefault();
      void choose(choices[0]);
    } else if (!query && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    }
  }

  if (!photo) return null;
  const url = images?.[photo.id];
  const sortedAs = done[photo.id];
  const busy = move.isPending || remove.isPending;
  const failed = move.error ?? remove.error;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="photo-dialog-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="photo-dialog-title" className="truncate text-lg font-semibold">
              {photo.fileName ?? t('photos.dialog.title')}
            </h2>
            <span className="shrink-0 text-sm text-muted" aria-live="polite">
              {t('photos.dialog.position', { index: index + 1, total: series.length })}
            </span>
          </div>
          <div className="relative">
            {url ? (
              <img
                src={url}
                alt=""
                className="mx-auto max-h-[60vh] w-auto rounded-lg"
                style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-muted">
                <ImageOff className="size-8" aria-hidden="true" />
              </div>
            )}
            {sortedAs && (
              <p className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-surface px-3 py-1 text-sm shadow">
                {sortedAs}
              </p>
            )}
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="secondary" onClick={() => go(-1)} disabled={index === 0}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t('photos.dialog.previous')}
            </Button>
            <Button variant="secondary" onClick={() => go(1)} disabled={index + 1 >= series.length}>
              {t('photos.dialog.next')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">{t('photos.dialog.owner')}</span>
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={t('photos.dialog.search')}
              aria-describedby="photo-dialog-hint"
              className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-muted"
            />
          </label>
          <p id="photo-dialog-hint" className="text-sm text-muted">
            {t('photos.dialog.hint')}
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {choices.map((choice, i) => (
              <li key={choice.key}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(choice)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-surface-sunken ${
                    i === 0 && query ? 'bg-accent-soft' : ''
                  }`}
                >
                  {choice.icon && <Users className="size-4 text-muted" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {choice.detail && (
                    <span className="shrink-0 text-sm text-muted">{choice.detail}</span>
                  )}
                </button>
              </li>
            ))}
            {choices.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">{t('photos.dialog.noMatch')}</li>
            )}
          </ul>
          <Button
            variant="secondary"
            disabled={busy || (!photo.readerId && !photo.group)}
            onClick={() =>
              void choose({ key: 'none', label: t('photos.dialog.nobody'), target: {} })
            }
          >
            {t('photos.dialog.nobody')}
          </Button>
          {failed && <Alert tone="danger">{errorMessage(failed)}</Alert>}
          <div className="mt-auto flex flex-wrap justify-between gap-2 pt-2">
            <Button
              variant="secondary"
              className="text-danger"
              disabled={busy}
              onClick={() => void deletePhoto()}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t('photos.dialog.delete')}
            </Button>
            <Button onClick={() => dialog.current?.close()}>{t('photos.dialog.close')}</Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
