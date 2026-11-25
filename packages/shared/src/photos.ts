import { z } from 'zod';
import { text } from './catalog';
import { addDays } from './circulation';
import type { Reader } from './readers';

/*
 * Schoolfoto's (decision 040). The school, or a photographer it hires, takes portraits and
 * class photos on a photo day. Parents download the original files for free with a personal
 * code from a printed slip, until a date the school picks. Afterwards everything is deleted.
 */

const IsoDateSchema = z.iso.date();
const IdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid id');

/** Large enough for a camera's best JPEG; anything bigger is not a school photo. */
export const PHOTO_MAX_BYTES = 40 * 1024 * 1024;
/** The version shown on screens, made by the browser before uploading. */
export const PHOTO_SMALL_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_SMALL_SIDE = 1200;

/** How many upload slots or image links one request may ask for. */
export const PHOTO_UPLOAD_BATCH_MAX = 20;
export const PHOTO_IMAGES_BATCH_MAX = 500;

/** Downloads are open this long by default, and never past the end of the school year. */
export const PHOTO_DEFAULT_OPEN_DAYS = 30;

export const PhotoDayInputSchema = z.object({ name: text(80), takenOn: IsoDateSchema }).strict();
export type PhotoDayInput = z.infer<typeof PhotoDayInputSchema>;

export const UpdatePhotoDayRequestSchema = PhotoDayInputSchema.extend({
  /** Whether parents can download now. */
  open: z.boolean(),
  /** The last day parents can download; the photos are deleted after it. */
  availableUntil: IsoDateSchema.optional(),
})
  .strict()
  .refine((r) => !r.open || r.availableUntil, {
    message: 'Pick until when parents can download',
    path: ['availableUntil'],
  });
export type UpdatePhotoDayRequest = z.infer<typeof UpdatePhotoDayRequestSchema>;

export type PhotoDay = PhotoDayInput & {
  id: string;
  open: boolean;
  availableUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the school deletes it: hidden at once, the files are removed that night. */
  deletedAt?: string;
};

/** A portrait belongs to one pupil (or to nobody yet); a class photo to everyone in a class. */
export const PHOTO_KINDS = ['portrait', 'class'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export type Photo = {
  id: string;
  photoDayId: string;
  kind: PhotoKind;
  /** Portraits: the pupil. Missing while nobody was recognised yet. */
  readerId?: string;
  /** Class photos: the class. */
  group?: string;
  /** When the camera took it, from the file: the order the photographer worked in. */
  takenAt?: string;
  /** The camera's file name, so the photographer finds it back in their own copy. */
  fileName?: string;
  width: number;
  height: number;
  size: number;
  uploadedAt: string;
};

/** Who a photo is for: a pupil, a class, or (empty) nobody yet. */
export const PhotoTargetSchema = z
  .object({ readerId: IdSchema.optional(), group: text(30).optional() })
  .strict()
  .refine((t) => !(t.readerId && t.group), { message: 'A pupil or a class, not both' });
export type PhotoTarget = z.infer<typeof PhotoTargetSchema>;

export const CreateUploadSlotsRequestSchema = z
  .object({ count: z.number().int().min(1).max(PHOTO_UPLOAD_BATCH_MAX) })
  .strict();

/** A presigned S3 form: post `fields` and then the file to `url`. */
export type UploadForm = { url: string; fields: Record<string, string> };
export type UploadSlot = { photoId: string; original: UploadForm; small: UploadForm };

export const RegisterPhotoRequestSchema = z
  .object({
    photoId: IdSchema,
    target: PhotoTargetSchema,
    takenAt: z.iso.datetime().optional(),
    fileName: z.string().trim().normalize('NFC').min(1).max(255).optional(),
    width: z.number().int().min(1).max(100_000),
    height: z.number().int().min(1).max(100_000),
  })
  .strict();
export type RegisterPhotoRequest = z.infer<typeof RegisterPhotoRequestSchema>;

export const MovePhotoRequestSchema = z.object({ target: PhotoTargetSchema }).strict();

export const PhotoImagesRequestSchema = z
  .object({ photoIds: z.array(IdSchema).min(1).max(PHOTO_IMAGES_BATCH_MAX) })
  .strict();
/** Short-lived links to the screen versions, by photo id. */
export type PhotoImages = Record<string, string>;

export const SetNoPhotoRequestSchema = z.object({ noPhoto: z.boolean() }).strict();

/** A pupil on a photo day: whether they may be photographed, and whether a code was made. */
export type PhotoPupilStatus = { readerId: string; noPhoto?: boolean; hasCode: boolean };

export type PhotoDayDetail = { day: PhotoDay; photos: Photo[]; pupils: PhotoPupilStatus[] };

/** What the photo screens know about a pupil: no more than a class list. */
export type PhotoPupil = Pick<
  Reader,
  'id' | 'firstName' | 'lastName' | 'group' | 'memberNumber' | 'category'
>;

/** A download code for one pupil, for the slips. Only administrators see these. */
export type PhotoCode = { readerId: string; code: string };

export const PhotoAccessRequestSchema = z.object({ code: z.string().max(40) }).strict();

/** What a parent sees after typing or scanning the code. */
export type PhotoAccess = {
  firstName: string;
  photoDayName: string;
  availableUntil: string;
  photos: {
    id: string;
    kind: PhotoKind;
    width: number;
    height: number;
    smallUrl: string;
    downloadUrl: string;
  }[];
};

/*
 * Download codes: 12 characters from an alphabet without look-alikes (no 0/O, 1/I/L), about
 * 60 bits. Far too many to guess, so no card number or PIN is needed next to it.
 */
export const ACCESS_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ACCESS_CODE_LENGTH = 12;

/** What someone typed or scanned, as stored: uppercase, without spaces or dashes. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isAccessCode(code: string): boolean {
  return (
    code.length === ACCESS_CODE_LENGTH && [...code].every((c) => ACCESS_CODE_ALPHABET.includes(c))
  );
}

/** "K7PM-3QXD-9TWA": groups of four are easier to type over from paper. */
export function formatAccessCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** The Flemish school year runs from 1 September to 31 August. */
export function schoolYearEnd(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return `${month >= 9 ? year + 1 : year}-08-31`;
}

/** The latest date a photo day can stay open: the end of the school year it was taken in. */
export function latestAvailableUntil(day: Pick<PhotoDay, 'takenOn'>): string {
  return schoolYearEnd(day.takenOn);
}

/** The date proposed when opening a photo day to parents. */
export function defaultAvailableUntil(day: Pick<PhotoDay, 'takenOn'>, today: string): string {
  const proposed = addDays(today, PHOTO_DEFAULT_OPEN_DAYS);
  const latest = latestAvailableUntil(day);
  return proposed < latest ? proposed : latest;
}

/** After this date everything of the photo day is deleted. */
export function photoDayDeleteAfter(day: Pick<PhotoDay, 'takenOn' | 'availableUntil'>): string {
  return day.availableUntil ?? schoolYearEnd(day.takenOn);
}

export function isPhotoDayExpired(day: PhotoDay, today: string): boolean {
  return Boolean(day.deletedAt) || today > photoDayDeleteAfter(day);
}

export function canParentsDownload(day: PhotoDay, today: string): boolean {
  return (
    day.open &&
    !day.deletedAt &&
    day.availableUntil !== undefined &&
    today <= day.availableUntil &&
    !isPhotoDayExpired(day, today)
  );
}
