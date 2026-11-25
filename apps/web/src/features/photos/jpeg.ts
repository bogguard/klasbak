/*
 * Reading and cleaning JPEG files in the browser, byte by byte, without re-encoding: the
 * original keeps the photographer's quality. A JPEG is a list of segments (marker 0xFFxx and a
 * length) up to the image data, which ends with EOI (0xFFD9).
 *
 * Cleaning removes what can say more than the photo itself: EXIF (camera serial number, GPS
 * location on a phone), XMP, IPTC, comments, the embedded previews (MPF) and anything after
 * the image. It keeps the colour profile and the orientation, so the photo still looks and
 * stands the same.
 */

export type JpegInfo = {
  /** EXIF orientation 1–8; 1 when the file doesn't say. */
  orientation: number;
  /** As shown, so after turning for the orientation. */
  width: number;
  height: number;
  /** When the camera took it (ISO, UTC), if the file says. */
  takenAt?: string;
};

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP13 = 0xed;
const COM = 0xfe;

export class NotAJpegError extends Error {}

type Segment = { marker: number; start: number; end: number };

/** The segments before the image data, and where the image data starts. */
function segments(bytes: Uint8Array): { list: Segment[]; dataStart: number } {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) throw new NotAJpegError();
  const list: Segment[] = [];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new NotAJpegError();
    // Fill bytes: any number of 0xFF before a marker.
    while (bytes[i + 1] === 0xff) i++;
    const marker = bytes[i + 1] as number;
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) throw new NotAJpegError();
    list.push({ marker, start: i, end });
    if (marker === SOS) return { list, dataStart: i };
    i = end;
  }
  throw new NotAJpegError();
}

/**
 * Where the main image ends (just after EOI). Progressive JPEGs have more segments between
 * the scans; inside scan data 0xFF is followed by 0x00 or a restart marker.
 */
function imageEnd(bytes: Uint8Array, dataStart: number): number {
  let i = dataStart;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const next = bytes[i + 1] as number;
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
      i += next === 0xff ? 1 : 2;
      continue;
    }
    if (next === EOI) return i + 2;
    if (i + 3 >= bytes.length) break;
    // A segment between scans (DHT, SOS, DRI…): skip its header.
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    i += 2 + length;
  }
  // No EOI (a cut-off file): keep everything, browsers still show what's there.
  return bytes.length;
}

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
  for (let k = 0; k < text.length; k++) {
    if (bytes[at + k] !== text.charCodeAt(k)) return false;
  }
  return true;
}

/** An APP1 segment with EXIF (not XMP). */
function isExif(bytes: Uint8Array, segment: Segment): boolean {
  return segment.marker === APP1 && startsWith(bytes, segment.start + 4, 'Exif\0\0');
}

function readExif(bytes: Uint8Array, segment: Segment): Omit<JpegInfo, 'width' | 'height'> {
  const tiff = segment.start + 10;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = startsWith(bytes, tiff, 'II');
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const limit = segment.end;
  const safe = (at: number, size: number) => at >= tiff && at + size <= limit;

  /** The entries of an IFD by tag: where each one's 12 bytes start. */
  const entries = (ifdOffset: number) => {
    const found = new Map<number, number>();
    const at = tiff + ifdOffset;
    if (!safe(at, 2)) return found;
    const count = u16(at);
    for (let n = 0; n < count; n++) {
      const entry = at + 2 + n * 12;
      if (!safe(entry, 12)) break;
      found.set(u16(entry), entry);
    }
    return found;
  };
  const ascii = (entry: number) => {
    const count = u32(entry + 4);
    const at = count <= 4 ? entry + 8 : tiff + u32(entry + 8);
    if (!safe(at, count)) return undefined;
    return String.fromCharCode(...bytes.subarray(at, at + count)).replace(/\0+$/, '');
  };

  const result: Omit<JpegInfo, 'width' | 'height'> = { orientation: 1 };
  if (!safe(tiff, 8)) return result;
  const ifd0 = entries(u32(tiff + 4));
  const orientationEntry = ifd0.get(0x0112);
  if (orientationEntry !== undefined) {
    const value = u16(orientationEntry + 8);
    if (value >= 1 && value <= 8) result.orientation = value;
  }
  const exifPointer = ifd0.get(0x8769);
  if (exifPointer !== undefined) {
    const exif = entries(u32(exifPointer + 8));
    const original = exif.get(0x9003);
    const subSeconds = exif.get(0x9291);
    const offset = exif.get(0x9011);
    if (original !== undefined) {
      result.takenAt = toIso(
        ascii(original),
        subSeconds !== undefined ? ascii(subSeconds) : undefined,
        offset !== undefined ? ascii(offset) : undefined,
      );
    }
  }
  return result;
}

/**
 * "2026:10:15 09:12:44" with optional sub-seconds and offset. Without an offset the camera's
 * clock is taken as local time, which is right for a photo day at school.
 */
export function toIso(
  dateTime: string | undefined,
  subSeconds?: string,
  offset?: string,
): string | undefined {
  const match = dateTime?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  const ms = subSeconds && /^\d+$/.test(subSeconds) ? subSeconds.padEnd(3, '0').slice(0, 3) : '000';
  const local = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}`;
  const date =
    offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? new Date(`${local}${offset}`) : new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Start-of-frame markers hold the image size (C4, C8 and CC are something else). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Size, orientation and time from the start of a file (the first 256 kB is plenty). */
export function readJpegInfo(bytes: Uint8Array): JpegInfo {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) throw new NotAJpegError();
  let info: Omit<JpegInfo, 'width' | 'height'> = { orientation: 1 };
  let width = 0;
  let height = 0;
  let i = 2;
  // Like `segments`, but tolerant of a file cut off after the headers.
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    while (bytes[i + 1] === 0xff) i++;
    const marker = bytes[i + 1] as number;
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    const segment = { marker, start: i, end: Math.min(i + 2 + length, bytes.length) };
    if (isExif(bytes, segment) && info.orientation === 1 && !info.takenAt) {
      info = readExif(bytes, segment);
    }
    if (isStartOfFrame(marker) && i + 9 <= bytes.length) {
      height = ((bytes[i + 5] as number) << 8) | (bytes[i + 6] as number);
      width = ((bytes[i + 7] as number) << 8) | (bytes[i + 8] as number);
    }
    if (marker === SOS) break;
    i += 2 + length;
  }
  if (!width || !height) throw new NotAJpegError();
  const turned = info.orientation >= 5;
  return { ...info, width: turned ? height : width, height: turned ? width : height };
}

/** EXIF with only the orientation: big-endian TIFF, one IFD with one entry. */
function orientationSegment(orientation: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, APP1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

/** Metadata segments we drop; the colour profile (APP2 ICC_PROFILE) stays. */
function isDropped(bytes: Uint8Array, segment: Segment): boolean {
  if (segment.marker === APP1 || segment.marker === APP13 || segment.marker === COM) return true;
  return segment.marker === APP2 && startsWith(bytes, segment.start + 4, 'MPF\0');
}

/** The same photo without metadata, except its orientation. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { list, dataStart } = segments(bytes);
  const exif = list.find((segment) => isExif(bytes, segment));
  const orientation = exif ? readExif(bytes, exif).orientation : 1;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  // JFIF (APP0) must stay first; the orientation goes right after it.
  const kept = list.filter((segment) => segment.marker !== SOS && !isDropped(bytes, segment));
  const jfif = kept[0]?.marker === 0xe0 ? kept.shift() : undefined;
  if (jfif) parts.push(bytes.subarray(jfif.start, jfif.end));
  if (orientation !== 1) parts.push(orientationSegment(orientation));
  for (const segment of kept) parts.push(bytes.subarray(segment.start, segment.end));
  parts.push(bytes.subarray(dataStart, imageEnd(bytes, dataStart)));

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
