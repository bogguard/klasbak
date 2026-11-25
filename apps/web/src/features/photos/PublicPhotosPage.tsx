import { formatAccessCode, normalizeAccessCode, type PhotoAccess } from '@klasbak/shared';
import { Download, ImageDown, KeyRound, Share } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useConfig } from '../../lib/config';
import { formatDate } from '../../lib/format';
import { useAccessPhotos } from './api';

/**
 * Where parents land from the slip: the QR code opens /fotos#CODE, or they type the code. The
 * code is taken out of the address bar right away, so it isn't shared along with a link or
 * left in the browser history.
 */
export function PublicPhotosPage() {
  const { t } = useTranslation();
  const access = useAccessPhotos();
  const errorMessage = useErrorMessage();
  const [fromLink] = useState(() =>
    normalizeAccessCode(decodeURIComponent(window.location.hash.slice(1))),
  );
  const [code, setCode] = useState(fromLink ? formatAccessCode(fromLink) : '');
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !fromLink) return;
    started.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    access.mutate(fromLink);
  }, [access, fromLink]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeAccessCode(code);
    if (normalized) access.mutate(normalized);
  }

  if (access.data) return <Photos access={access.data} onOther={() => access.reset()} />;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('photos.public.heading')}</h1>
        <p className="text-muted">{t('photos.public.intro')}</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('photos.public.code')} hint={t('photos.public.codeHint')}>
          {(props) => (
            <input
              {...props}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              className={`${props.className} ${inputHeight} font-mono text-lg tracking-wider uppercase`}
            />
          )}
        </Field>
        {access.isError && <Alert tone="danger">{errorMessage(access.error)}</Alert>}
        <Button type="submit" disabled={access.isPending || !code.trim()} className="w-full">
          <KeyRound className="size-4" aria-hidden="true" />
          {access.isPending ? t('photos.public.checking') : t('photos.public.show')}
        </Button>
      </form>
    </div>
  );
}

/**
 * Phones that can hand photos to the share sheet, where "Save to Photos" puts them in the
 * photo app. A ZIP is of little use there; on a computer it is the easy way.
 */
function canSaveToDevice(): boolean {
  try {
    return (
      window.matchMedia('(pointer: coarse)').matches &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'foto.jpg', { type: 'image/jpeg' })] })
    );
  } catch {
    return false;
  }
}

/** The original files, named after the child: "Emma-1.jpg", "Emma-klasfoto.jpg". */
async function fetchPhotos(access: PhotoAccess): Promise<File[]> {
  const files: File[] = [];
  let portrait = 0;
  let group = 0;
  for (const photo of access.photos) {
    const response = await fetch(photo.downloadUrl);
    if (!response.ok) throw new Error('Download failed');
    const name =
      photo.kind === 'class'
        ? `${access.firstName}-klasfoto${++group > 1 ? `-${group}` : ''}.jpg`
        : `${access.firstName}-${++portrait}.jpg`;
    files.push(new File([await response.blob()], name, { type: 'image/jpeg' }));
  }
  return files;
}

function Photos({ access, onOther }: { access: PhotoAccess; onOther: () => void }) {
  const { t, i18n } = useTranslation();
  const { libraryName } = useConfig();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shareable] = useState(canSaveToDevice);
  const [prepared, setPrepared] = useState<File[]>();

  /** All photos in one ZIP, made in the browser: handy on a computer. */
  async function downloadAll() {
    setBusy(true);
    setFailed(false);
    try {
      const { zipSync } = await import('fflate');
      const files = await fetchPhotos(access);
      // Already compressed: stored as they are, without packing them again.
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const file of files) {
        entries[file.name] = [new Uint8Array(await file.arrayBuffer()), { level: 0 }];
      }
      const zip = zipSync(entries);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${access.firstName}-${t('photos.public.zipName')}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  /*
   * Two taps: the first fetches the photos, the second opens the share sheet. Phones only
   * open it straight from a tap, and fetching several photos takes longer than they allow.
   */
  async function prepare() {
    setBusy(true);
    setFailed(false);
    try {
      setPrepared(await fetchPhotos(access));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function share(files: File[]) {
    try {
      await navigator.share({ files, title: access.photoDayName });
    } catch (error) {
      // Closing the share sheet is not a failure.
      if ((error as Error).name !== 'AbortError') setFailed(true);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-accent">{libraryName}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('photos.public.photosOf', { name: access.firstName })}
        </h1>
        <p className="text-muted">
          {access.photoDayName} ·{' '}
          {t('photos.public.until', { date: formatDate(access.availableUntil, i18n.language) })}
        </p>
      </div>

      {access.photos.length === 0 ? (
        <Alert tone="info">{t('photos.public.none')}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {shareable ? (
              prepared ? (
                <Button onClick={() => void share(prepared)}>
                  <Share className="size-4" aria-hidden="true" />
                  {t('photos.public.saveNow', { count: prepared.length })}
                </Button>
              ) : (
                <Button onClick={() => void prepare()} disabled={busy}>
                  <ImageDown className="size-4" aria-hidden="true" />
                  {busy ? t('photos.public.preparing') : t('photos.public.saveToDevice')}
                </Button>
              )
            ) : (
              access.photos.length > 1 && (
                <Button onClick={() => void downloadAll()} disabled={busy}>
                  <ImageDown className="size-4" aria-hidden="true" />
                  {busy ? t('photos.public.zipping') : t('photos.public.downloadAll')}
                </Button>
              )
            )}
            <Button variant="secondary" onClick={onOther}>
              {t('photos.public.otherCode')}
            </Button>
          </div>
          {failed && <Alert tone="danger">{t('photos.public.zipFailed')}</Alert>}
          <p className="max-w-prose text-sm text-muted">
            {shareable ? t('photos.public.hintShare') : t('photos.public.hint')}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {access.photos.map((photo, i) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-xl border border-line bg-surface"
              >
                <img
                  src={photo.smallUrl}
                  alt={
                    photo.kind === 'class'
                      ? t('photos.public.classPhotoAlt')
                      : t('photos.public.photoAlt', { name: access.firstName, number: i + 1 })
                  }
                  className="w-full bg-surface-sunken object-cover"
                  style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                />
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="text-sm text-muted">
                    {photo.kind === 'class'
                      ? t('photos.public.classPhoto')
                      : t('photos.public.portrait')}
                  </span>
                  <a
                    href={photo.downloadUrl}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-ink hover:opacity-90"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t('photos.public.download')}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
