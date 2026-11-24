import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  canParentsDownload,
  isAccessCode,
  isPhotoDayExpired,
  latestAvailableUntil,
  localDate,
  normalizeAccessCode,
  PHOTO_MAX_BYTES,
  PHOTO_SMALL_MAX_BYTES,
  type Photo,
  type PhotoAccess,
  type PhotoCode,
  type PhotoDay,
  type PhotoDayDetail,
  type PhotoDayInput,
  type PhotoImages,
  type PhotoPupil,
  type PhotoTarget,
  type RegisterPhotoRequest,
  type UpdatePhotoDayRequest,
  type UploadSlot,
} from '@klasbak/shared';
import { ulid } from 'ulid';
import { getSettings } from '../circulation/repository';
import { auditItem } from '../lib/audit';
import type { Actor } from '../lib/auth';
import { AppError, ConflictError, NotFoundError } from '../lib/errors';
import { metrics } from '../lib/observability';
import {
  createFileLink,
  createUploadForm,
  deleteFiles,
  deleteFolder,
  photoFileKeys,
  readFileStart,
} from '../lib/photo-files';
import { getReader, listReaders } from '../readers/repository';
import * as repository from './repository';

/** A module that is off refuses requests, whoever asks (decision 036). */
export async function assertPhotosEnabled(): Promise<void> {
  const { modules } = await getSettings();
  if (!modules.photos) throw new AppError(403, 'MODULE_OFF', 'This module is switched off');
}

// ---------------------------------------------------------------- Photo days

export async function listDays(): Promise<PhotoDay[]> {
  return (await repository.listPhotoDays()).filter((day) => !day.deletedAt);
}

async function existingDay(dayId: string): Promise<PhotoDay> {
  const day = await repository.getPhotoDay(dayId);
  if (!day || day.deletedAt) throw new NotFoundError('Photo day');
  return day;
}

export async function createDay(
  actor: Actor,
  input: PhotoDayInput,
  now = new Date(),
): Promise<PhotoDay> {
  const id = ulid(now.getTime());
  const day: PhotoDay = {
    ...input,
    id,
    open: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repository.putPhotoDay(
    day,
    auditItem({ entity: `PHOTODAY#${id}`, action: 'photoDay.created', actor }, now),
    true,
  );
  return day;
}

/** Opening it to parents needs a last day: from today to the end of that school year. */
export async function updateDay(
  actor: Actor,
  dayId: string,
  request: UpdatePhotoDayRequest,
  now = new Date(),
): Promise<PhotoDay> {
  const existing = await existingDay(dayId);
  const today = localDate(now);
  const latest = latestAvailableUntil(request);
  const { availableUntil } = request;
  const dateChanged = availableUntil !== existing.availableUntil;
  if (availableUntil && (dateChanged || request.open)) {
    if (availableUntil < today || availableUntil > latest) {
      throw new AppError(400, 'PHOTO_DATE_OUT_OF_RANGE', 'Pick a date in this school year', {
        latest,
      });
    }
  }
  const updated: PhotoDay = {
    ...existing,
    name: request.name,
    takenOn: request.takenOn,
    open: request.open,
    availableUntil: availableUntil ?? existing.availableUntil,
    updatedAt: now.toISOString(),
  };
  const changedFields = (['name', 'takenOn', 'open', 'availableUntil'] as const).filter(
    (field) => existing[field] !== updated[field],
  );
  await repository.putPhotoDay(
    updated,
    auditItem(
      { entity: `PHOTODAY#${dayId}`, action: 'photoDay.updated', actor, changedFields },
      now,
    ),
    false,
  );
  if (request.open && !existing.open) metrics.addMetric('PhotoDayOpened', MetricUnit.Count, 1);
  return updated;
}

/** Hidden and closed at once; the nightly job removes the files and items (photoDays below). */
export async function deleteDay(actor: Actor, dayId: string, now = new Date()): Promise<void> {
  const existing = await existingDay(dayId);
  await repository.putPhotoDay(
    { ...existing, open: false, deletedAt: now.toISOString(), updatedAt: now.toISOString() },
    auditItem({ entity: `PHOTODAY#${dayId}`, action: 'photoDay.deleted', actor }, now),
    false,
  );
}

export async function getDayDetail(dayId: string): Promise<PhotoDayDetail> {
  const day = await existingDay(dayId);
  const { photos, pupils } = await repository.photoDayContents(dayId);
  return {
    day,
    photos,
    pupils: pupils.map(({ readerId, noPhoto, code }) => ({
      readerId,
      ...(noPhoto ? { noPhoto } : {}),
      hasCode: Boolean(code),
    })),
  };
}

/** The class lists: active readers, with no more than a class list holds. */
export async function listPupils(): Promise<PhotoPupil[]> {
  const readers = await listReaders();
  return readers
    .filter((reader) => reader.active)
    .map(({ id, firstName, lastName, group, memberNumber, category }) => ({
      id,
      firstName,
      lastName,
      group,
      memberNumber,
      category,
    }));
}

// ---------------------------------------------------------------- Photos

/** Forms to upload the original and the screen version of `count` new photos. */
export async function createUploadSlots(
  dayId: string,
  count: number,
  now = new Date(),
): Promise<UploadSlot[]> {
  await existingDay(dayId);
  return Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const photoId = ulid(now.getTime() + i);
      const keys = photoFileKeys(dayId, photoId);
      const [original, small] = await Promise.all([
        createUploadForm(keys.original, PHOTO_MAX_BYTES),
        createUploadForm(keys.small, PHOTO_SMALL_MAX_BYTES),
      ]);
      return { photoId, original, small };
    }),
  );
}

/** A pupil who may not be photographed gets no photos; a class is any name. */
async function checkTarget(dayId: string, target: PhotoTarget): Promise<void> {
  if (!target.readerId) return;
  const [reader, pupil] = await Promise.all([
    getReader(target.readerId),
    repository.getPhotoPupil(dayId, target.readerId),
  ]);
  if (!reader) throw new NotFoundError('Reader');
  if (pupil?.noPhoto) {
    throw new ConflictError('NO_PHOTO_CONSENT', 'This pupil may not be photographed');
  }
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

/**
 * Records a photo once both files are uploaded. The files are checked, not trusted: they must
 * be there, under this day, and be JPEGs. Safe to repeat.
 */
export async function registerPhoto(
  dayId: string,
  request: RegisterPhotoRequest,
  now = new Date(),
): Promise<Photo> {
  await existingDay(dayId);
  await checkTarget(dayId, request.target);
  const keys = photoFileKeys(dayId, request.photoId);
  const [original, small] = await Promise.all([
    readFileStart(keys.original),
    readFileStart(keys.small),
  ]);
  if (!original || !small) {
    throw new AppError(400, 'PHOTO_NOT_UPLOADED', 'Upload both files first');
  }
  if (!isJpeg(original.bytes) || !isJpeg(small.bytes)) {
    await deleteFiles([keys.original, keys.small]);
    throw new AppError(400, 'INVALID_IMAGE', 'Only JPEG photos');
  }
  const { target, photoId, ...details } = request;
  const photo: Photo = {
    ...details,
    id: photoId,
    photoDayId: dayId,
    kind: target.group ? 'class' : 'portrait',
    ...(target.readerId ? { readerId: target.readerId } : {}),
    ...(target.group ? { group: target.group } : {}),
    size: original.size,
    uploadedAt: now.toISOString(),
  };
  if (await repository.putNewPhoto(photo)) {
    metrics.addMetric('PhotoUploaded', MetricUnit.Count, 1);
    return photo;
  }
  const stored = await repository.getPhoto(dayId, photoId);
  if (!stored) throw new NotFoundError('Photo');
  return stored;
}

export async function movePhoto(
  dayId: string,
  photoId: string,
  target: PhotoTarget,
): Promise<Photo> {
  await existingDay(dayId);
  const photo = await repository.getPhoto(dayId, photoId);
  if (!photo) throw new NotFoundError('Photo');
  await checkTarget(dayId, target);
  const moved = await repository.movePhoto(photo, target);
  if (!moved) throw new NotFoundError('Photo');
  return moved;
}

/** Safe to repeat: a photo that is already gone stays gone. */
export async function deletePhoto(
  actor: Actor,
  dayId: string,
  photoId: string,
  now = new Date(),
): Promise<void> {
  await existingDay(dayId);
  const photo = await repository.getPhoto(dayId, photoId);
  if (!photo) return;
  await repository.deletePhoto(
    photo,
    auditItem({ entity: `PHOTODAY#${dayId}`, action: 'photo.deleted', actor }, now),
  );
  const keys = photoFileKeys(dayId, photoId);
  await deleteFiles([keys.original, keys.small]);
}

/** Links to the screen versions, for the photos a screen is about to show. */
export async function imageLinks(dayId: string, photoIds: string[]): Promise<PhotoImages> {
  await existingDay(dayId);
  const entries = await Promise.all(
    photoIds.map(async (id) => [id, await createFileLink(photoFileKeys(dayId, id).small)] as const),
  );
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------- Consent and codes

/** Without permission no photos: refused while the pupil still has some, and no code. */
export async function setNoPhoto(
  actor: Actor,
  dayId: string,
  readerId: string,
  noPhoto: boolean,
  now = new Date(),
): Promise<void> {
  await existingDay(dayId);
  if (!(await getReader(readerId))) throw new NotFoundError('Reader');
  if (noPhoto) {
    if ((await repository.pupilPhotos(dayId, readerId)).length > 0) {
      throw new ConflictError('PUPIL_HAS_PHOTOS', 'Delete the photos of this pupil first');
    }
    const pupil = await repository.getPhotoPupil(dayId, readerId);
    if (pupil?.code) await repository.removeCode(dayId, readerId, pupil.code);
  }
  await repository.setNoPhoto(
    dayId,
    readerId,
    noPhoto,
    auditItem({ entity: `PHOTODAY#${dayId}`, action: 'photoPupil.consent', actor }, now),
  );
}

/** A random code; rejection sampling keeps every character equally likely. */
export function newAccessCode(): string {
  const alphabet = ACCESS_CODE_ALPHABET;
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let code = '';
  while (code.length < ACCESS_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(ACCESS_CODE_LENGTH))) {
      if (byte < limit && code.length < ACCESS_CODE_LENGTH)
        code += alphabet[byte % alphabet.length];
    }
  }
  return code;
}

async function giveCode(dayId: string, readerId: string, previous?: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newAccessCode();
    if (await repository.putCode(dayId, readerId, code, previous)) return code;
    // Taken by someone else meanwhile (a double click): use theirs.
    const pupil = await repository.getPhotoPupil(dayId, readerId);
    if (pupil?.code && pupil.code !== previous) return pupil.code;
  }
  throw new Error('Could not make a unique code');
}

/**
 * Codes for everyone who has photos: their own portraits or a photo of their class. Pupils who
 * already have one keep it, so printing the slips again gives the same codes.
 */
export async function ensureCodes(actor: Actor, dayId: string, now = new Date()) {
  await existingDay(dayId);
  const [{ photos, pupils }, readers] = await Promise.all([
    repository.photoDayContents(dayId),
    listReaders(),
  ]);
  const withPortrait = new Set(
    photos.flatMap((p) => (p.kind === 'portrait' && p.readerId ? [p.readerId] : [])),
  );
  const classesWithPhoto = new Set(
    photos.flatMap((p) => (p.kind === 'class' && p.group ? [p.group] : [])),
  );
  const pupilById = new Map(pupils.map((pupil) => [pupil.readerId, pupil]));
  const eligible = readers.filter(
    (reader) =>
      reader.active &&
      !pupilById.get(reader.id)?.noPhoto &&
      (withPortrait.has(reader.id) || (reader.group && classesWithPhoto.has(reader.group))),
  );

  const codes: PhotoCode[] = [];
  let created = 0;
  // In groups: a big school has a thousand pupils, one transaction each.
  for (let start = 0; start < eligible.length; start += 25) {
    const batch = eligible.slice(start, start + 25);
    codes.push(
      ...(await Promise.all(
        batch.map(async (reader) => {
          const existing = pupilById.get(reader.id)?.code;
          if (existing) return { readerId: reader.id, code: existing };
          created++;
          return { readerId: reader.id, code: await giveCode(dayId, reader.id) };
        }),
      )),
    );
  }
  if (created > 0) {
    await repository.putAudit(
      auditItem({ entity: `PHOTODAY#${dayId}`, action: 'photoCodes.created', actor }, now),
    );
    metrics.addMetric('PhotoCodesCreated', MetricUnit.Count, created);
  }
  return codes;
}

/** A lost or misused slip: the old code stops working at once. */
export async function renewCode(
  actor: Actor,
  dayId: string,
  readerId: string,
  now = new Date(),
): Promise<PhotoCode> {
  await existingDay(dayId);
  if (!(await getReader(readerId))) throw new NotFoundError('Reader');
  const pupil = await repository.getPhotoPupil(dayId, readerId);
  if (pupil?.noPhoto) {
    throw new ConflictError('NO_PHOTO_CONSENT', 'This pupil may not be photographed');
  }
  const code = await giveCode(dayId, readerId, pupil?.code);
  await repository.putAudit(
    auditItem({ entity: `PHOTODAY#${dayId}`, action: 'photoCode.renewed', actor }, now),
  );
  return { readerId, code };
}

// ---------------------------------------------------------------- Parents

const unknownCode = () => new AppError(404, 'PHOTO_CODE_UNKNOWN', 'Unknown code');

/** Letters and digits only, for file names that work everywhere. */
function fileNamePart(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * What a parent gets for a code: the pupil's first name and the links to their photos and
 * those of their class. Unknown and switched-off look the same, so nothing is given away.
 */
export async function accessPhotos(rawCode: string, now = new Date()): Promise<PhotoAccess> {
  const code = normalizeAccessCode(rawCode);
  if (!isAccessCode(code)) throw unknownCode();
  const [{ modules }, pointer] = await Promise.all([
    getSettings(),
    repository.getCodePointer(code),
  ]);
  if (!modules.photos || !pointer) {
    metrics.addMetric('PhotoAccessRefused', MetricUnit.Count, 1);
    throw unknownCode();
  }
  const [day, reader] = await Promise.all([
    repository.getPhotoDay(pointer.photoDayId),
    getReader(pointer.readerId),
  ]);
  if (!day || !reader || day.deletedAt) throw unknownCode();
  if (!canParentsDownload(day, localDate(now)) || !day.availableUntil) {
    throw new AppError(404, 'PHOTOS_NOT_AVAILABLE', 'These photos are not available now');
  }

  const [portraits, ofClass] = await Promise.all([
    repository.pupilPhotos(day.id, reader.id),
    reader.group ? repository.classPhotos(day.id, reader.group) : Promise.resolve([]),
  ]);
  const byTime = (a: Photo, b: Photo) =>
    (a.takenAt ?? a.uploadedAt).localeCompare(b.takenAt ?? b.uploadedAt) ||
    a.id.localeCompare(b.id);
  const name = fileNamePart(reader.firstName) || 'foto';
  const ordered = [
    ...portraits.sort(byTime).map((photo, i) => ({ photo, fileName: `${name}-${i + 1}.jpg` })),
    ...ofClass.sort(byTime).map((photo, i) => ({
      photo,
      fileName: `${name}-${fileNamePart(`klas ${reader.group ?? ''}`)}-${i + 1}.jpg`,
    })),
  ];
  const photos = await Promise.all(
    ordered.map(async ({ photo, fileName }) => {
      const keys = photoFileKeys(day.id, photo.id);
      const [smallUrl, downloadUrl] = await Promise.all([
        createFileLink(keys.small),
        createFileLink(keys.original, fileName),
      ]);
      return {
        id: photo.id,
        kind: photo.kind,
        width: photo.width,
        height: photo.height,
        smallUrl,
        downloadUrl,
      };
    }),
  );
  metrics.addMetric('PhotoAccessGranted', MetricUnit.Count, 1);
  return {
    firstName: reader.firstName,
    photoDayName: day.name,
    availableUntil: day.availableUntil,
    photos,
  };
}

// ---------------------------------------------------------------- Erasure and retention

/** Right to erasure: a reader's portraits, entries and codes on every photo day. */
export async function deleteReaderPhotos(readerId: string): Promise<void> {
  for (const day of await repository.listPhotoDays()) {
    const photos = await repository.deletePupilFromDay(day.id, readerId);
    await deleteFiles(
      photos.flatMap((photo) => {
        const keys = photoFileKeys(day.id, photo.id);
        return [keys.original, keys.small];
      }),
    );
  }
}

/** Nightly: photo days past their last day, or deleted by the school, leave nothing behind. */
export async function removeExpiredPhotoDays(now = new Date()): Promise<number> {
  const today = localDate(now);
  let removed = 0;
  for (const day of await repository.listPhotoDays()) {
    if (!isPhotoDayExpired(day, today)) continue;
    // Files first: the day item is the last thing to go, so a failed run is retried.
    await deleteFolder(day.id);
    await repository.deletePhotoDayItems(day.id);
    removed++;
  }
  return removed;
}
