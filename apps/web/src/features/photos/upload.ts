import {
  PHOTO_SMALL_SIDE,
  PHOTO_UPLOAD_BATCH_MAX,
  type Photo,
  type PhotoPupil,
  type PhotoTarget,
  type UploadForm,
  type UploadSlot,
} from '@klasbak/shared';
import { ApiError } from '../../lib/api';
import { createDetector, type Detector } from '../../lib/barcodeScanner';
import { readJpegInfo, stripJpegMetadata } from './jpeg';
import { centralFirst, classifyShot, codeIndex, compareCaptures, type Owner } from './sequence';

/*
 * Uploading a photo day's photos from the browser. Each photo is cleaned (jpeg.ts), read for a
 * card, scaled down for the screens, and posted straight to the photos bucket with a signed
 * form; only then the API records it. Photos are prepared one by one in the order they were
 * taken (that decides who they belong to) while a few uploads run at the same time.
 */

export type UploadMode =
  { kind: 'cards' } | { kind: 'group'; group: string } | { kind: 'reader'; readerId: string };

export type FailedUpload = { file: File; target: PhotoTarget };

export type UploadProgress = {
  total: number;
  processed: number;
  uploaded: number;
  /** Photos of a card or class list line: they show who comes next and are not uploaded. */
  cards: number;
  /** Uploaded without a pupil: before the first card, or after an unknown one. */
  unassigned: number;
  /** Uploaded as class photos: after a class code, or in the class photo mode. */
  classPhotos: number;
  /** Not uploaded: the pupil may not be photographed. */
  skipped: number;
  unknownCodes: string[];
  /** Files that are not JPEG photos. */
  unreadable: string[];
  failed: FailedUpload[];
  /** Photos uploaded per pupil, to show the result per name. */
  perPupil: Record<string, number>;
  current?: string;
  done: boolean;
};

export function emptyProgress(total = 0): UploadProgress {
  return {
    total,
    processed: 0,
    uploaded: 0,
    cards: 0,
    unassigned: 0,
    classPhotos: 0,
    skipped: 0,
    unknownCodes: [],
    unreadable: [],
    failed: [],
    perPupil: {},
    done: total === 0,
  };
}

type Api = <T>(path: string, options?: { method?: 'POST'; body?: unknown }) => Promise<T>;

const PARALLEL_UPLOADS = 3;
const DETECT_SIDE = 1600;
const SMALL_QUALITY = 0.82;
const HEADER_BYTES = 256 * 1024;

type Prepared = {
  original: Blob;
  small: Blob;
  width: number;
  height: number;
  takenAt?: string;
  codes: string[];
};

function canvasOf(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

const fitting = (width: number, height: number, side: number) => {
  const scale = Math.min(1, side / Math.max(width, height));
  return [Math.round(width * scale), Math.round(height * scale)] as const;
};

async function prepare(file: File, detector: Detector | undefined): Promise<Prepared> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = readJpegInfo(bytes);
  const original = new Blob([stripJpegMetadata(bytes) as BlobPart], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });
  try {
    const big = canvasOf(bitmap, ...fitting(bitmap.width, bitmap.height, DETECT_SIDE));
    // Most central first: a photo of the class list often shows the neighbouring lines too.
    const codes = detector
      ? centralFirst(await detector.detect(big).catch(() => []), big.width, big.height).map(
          (result) => result.rawValue,
        )
      : [];
    const small = await new Promise<Blob | null>((resolve) =>
      canvasOf(big, ...fitting(big.width, big.height, PHOTO_SMALL_SIDE)).toBlob(
        resolve,
        'image/jpeg',
        SMALL_QUALITY,
      ),
    );
    if (!small) throw new Error('Could not make the screen version');
    return {
      original,
      small,
      width: bitmap.width,
      height: bitmap.height,
      takenAt: info.takenAt,
      codes,
    };
  } finally {
    bitmap.close();
  }
}

/** The camera time of each file, read from its first bytes only, to sort a whole card. */
async function captureTime(file: File): Promise<string | undefined> {
  try {
    const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
    return readJpegInfo(head).takenAt;
  } catch {
    return undefined;
  }
}

async function postForm(form: UploadForm, file: Blob): Promise<void> {
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
  body.append('file', file);
  const response = await fetch(form.url, { method: 'POST', body });
  if (!response.ok) throw new Error(`Upload refused (${response.status})`);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Errors that won't go away by trying again. */
function isFinal(error: unknown): boolean {
  return error instanceof ApiError && error.status < 500;
}

export async function uploadPhotos(params: {
  api: Api;
  dayId: string;
  files: File[];
  mode: UploadMode;
  pupils: PhotoPupil[];
  noPhoto: Set<string>;
  /** For retrying failed uploads: who each file was already given to. */
  targets?: Map<File, PhotoTarget>;
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}): Promise<UploadProgress> {
  const { api, dayId, mode, pupils, noPhoto, targets, signal, onProgress } = params;
  const progress = emptyProgress(params.files.length);
  progress.done = false;
  const emit = () => onProgress({ ...progress, failed: [...progress.failed] });
  const pupilById = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const codes = codeIndex(pupils);
  const detector =
    mode.kind === 'cards' && !targets ? await createDetector(['code_128']) : undefined;

  const times = await Promise.all(params.files.map(captureTime));
  const files = params.files
    .map((file, i) => ({ file, takenAt: times[i] }))
    .sort((a, b) =>
      compareCaptures(
        { name: a.file.name, takenAt: a.takenAt, lastModified: a.file.lastModified },
        { name: b.file.name, takenAt: b.takenAt, lastModified: b.file.lastModified },
      ),
    );

  // Signed forms, fetched a few at a time; each is valid for 15 minutes.
  let slots: { slot: UploadSlot; at: number }[] = [];
  async function nextSlot(): Promise<UploadSlot> {
    slots = slots.filter((s) => Date.now() - s.at < 10 * 60_000);
    if (slots.length === 0) {
      const fresh = await api<UploadSlot[]>(`/api/photos/days/${dayId}/uploads`, {
        method: 'POST',
        body: { count: Math.min(10, PHOTO_UPLOAD_BATCH_MAX) },
      });
      slots = fresh.map((slot) => ({ slot, at: Date.now() }));
    }
    const next = slots.shift();
    if (!next) throw new Error('No upload slot');
    return next.slot;
  }

  async function send(file: File, prepared: Prepared, target: PhotoTarget) {
    for (let attempt = 0; ; attempt++) {
      try {
        const slot = await nextSlot();
        await Promise.all([
          postForm(slot.original, prepared.original),
          postForm(slot.small, prepared.small),
        ]);
        await api<Photo>(`/api/photos/days/${dayId}/photos`, {
          method: 'POST',
          body: {
            photoId: slot.photoId,
            target,
            takenAt: prepared.takenAt,
            fileName: file.name,
            width: prepared.width,
            height: prepared.height,
          },
        });
        progress.uploaded++;
        if (target.readerId) {
          progress.perPupil[target.readerId] = (progress.perPupil[target.readerId] ?? 0) + 1;
        } else if (target.group) {
          progress.classPhotos++;
        } else {
          progress.unassigned++;
        }
        return;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'NO_PHOTO_CONSENT') {
          progress.skipped++;
          return;
        }
        if (signal.aborted || isFinal(error) || attempt >= 2) {
          progress.failed.push({ file, target });
          return;
        }
        await wait(1000 * 3 ** attempt);
      }
    }
  }

  const running = new Set<Promise<void>>();
  let owner: Owner = { kind: 'none' };
  for (const { file } of files) {
    if (signal.aborted) break;
    let prepared: Prepared;
    try {
      prepared = await prepare(file, detector);
    } catch {
      progress.unreadable.push(file.name);
      progress.processed++;
      emit();
      continue;
    }

    let target: PhotoTarget | undefined = targets?.get(file);
    if (!target) {
      if (mode.kind === 'group') target = { group: mode.group };
      else if (mode.kind === 'reader') target = { readerId: mode.readerId };
      else {
        const shot = classifyShot(owner, prepared.codes, codes);
        owner = shot.owner;
        if (shot.isCard) {
          progress.cards++;
          if (owner.kind === 'unknown' && !progress.unknownCodes.includes(owner.code)) {
            progress.unknownCodes.push(owner.code);
          }
          progress.current =
            owner.kind === 'pupil'
              ? owner.pupil.firstName
              : owner.kind === 'class'
                ? owner.group
                : undefined;
          progress.processed++;
          emit();
          continue;
        }
        target =
          owner.kind === 'pupil'
            ? { readerId: owner.pupil.id }
            : owner.kind === 'class'
              ? { group: owner.group }
              : {};
      }
    }
    if (target.readerId && noPhoto.has(target.readerId)) {
      progress.skipped++;
      progress.processed++;
      emit();
      continue;
    }
    const pupil = target.readerId ? pupilById.get(target.readerId) : undefined;
    progress.current = pupil ? `${pupil.firstName} ${pupil.lastName}` : progress.current;

    // At most a few uploads at once; preparing the next photo waits for room.
    while (running.size >= PARALLEL_UPLOADS) await Promise.race(running);
    const job: Promise<void> = send(file, prepared, target).finally(() => {
      running.delete(job);
      progress.processed++;
      emit();
    });
    running.add(job);
  }
  await Promise.all(running);
  progress.done = true;
  emit();
  return progress;
}
