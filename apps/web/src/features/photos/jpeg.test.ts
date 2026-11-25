import { describe, expect, it } from 'vitest';
import { NotAJpegError, readJpegInfo, stripJpegMetadata, toIso } from './jpeg';

/* A tiny JPEG put together by hand: the structure matters here, not the picture. */

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...be16(payload.length + 2),
  ...payload,
];

/** EXIF with orientation, a GPS pointer (as phones write it) and the capture time. */
function exifSegment(orientation: number, dateTime: string) {
  // TIFF: header (8) + IFD0 with 3 entries (2 + 36 + 4) = 50; the Exif IFD follows at 50.
  const exifIfdAt = 50;
  const exifEntries = 2;
  const dateAt = exifIfdAt + 2 + exifEntries * 12 + 4;
  const tiff = [
    ...ascii('MM'),
    ...be16(42),
    ...be32(8),
    ...be16(3),
    ...be16(0x0112),
    ...be16(3),
    ...be32(1),
    ...be16(orientation),
    0,
    0,
    ...be16(0x8769),
    ...be16(4),
    ...be32(1),
    ...be32(exifIfdAt),
    ...be16(0x8825),
    ...be16(4),
    ...be32(1),
    ...be32(0), // GPS: must disappear
    ...be32(0),
    ...be16(exifEntries),
    ...be16(0x9003),
    ...be16(2),
    ...be32(20),
    ...be32(dateAt),
    ...be16(0x9291),
    ...be16(2),
    ...be32(3),
    ...ascii('25'),
    0,
    0, // fits: stored inline
    ...be32(0),
    ...ascii(dateTime),
    0,
  ];
  return segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff]);
}

function jpeg(options: { orientation?: number; trailing?: number[] } = {}) {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...exifSegment(options.orientation ?? 6, '2026:10:15 09:12:44'),
    ...segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta/>')]),
    ...segment(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 7, 7]),
    ...segment(0xe2, [...ascii('MPF'), 0, 1, 2, 3]),
    ...segment(0xfe, ascii('Photographer note')),
    ...segment(0xc0, [8, ...be16(3000), ...be16(4000), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    0x12,
    0xff,
    0x00,
    0x34,
    0xff,
    0xd0,
    0x56, // image data, a stuffed 0xFF and a restart
    0xff,
    0xd9,
    ...(options.trailing ?? []),
  ]);
}

const contains = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

describe('reading a photo', () => {
  it('gives the size as shown, the orientation and the capture time', () => {
    const info = readJpegInfo(jpeg({ orientation: 6 }));
    // 4000 wide by 3000 high, turned a quarter: a portrait.
    expect(info).toMatchObject({ orientation: 6, width: 3000, height: 4000 });
    expect(info.takenAt).toBe(new Date('2026-10-15T09:12:44.250').toISOString());
  });

  it('keeps the size as stored for an upright photo', () => {
    expect(readJpegInfo(jpeg({ orientation: 1 }))).toMatchObject({ width: 4000, height: 3000 });
  });

  it('refuses what is not a JPEG', () => {
    expect(() => readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow(NotAJpegError);
  });
});

describe('cleaning a photo before uploading', () => {
  const cleaned = stripJpegMetadata(
    jpeg({ orientation: 6, trailing: [0xff, 0xd8, ...ascii('Exif preview'), 0xff, 0xd9] }),
  );

  it('removes EXIF (with GPS), XMP, comments, previews and anything after the image', () => {
    expect(contains(cleaned, '2026:10:15')).toBe(false);
    expect(contains(cleaned, 'xmpmeta')).toBe(false);
    expect(contains(cleaned, 'Photographer note')).toBe(false);
    expect(contains(cleaned, 'MPF')).toBe(false);
    expect(contains(cleaned, 'preview')).toBe(false);
    expect([...cleaned.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it('keeps the orientation, the colour profile and the image data', () => {
    expect(readJpegInfo(cleaned)).toMatchObject({ orientation: 6, width: 3000, height: 4000 });
    expect(contains(cleaned, 'ICC_PROFILE')).toBe(true);
    expect(contains(cleaned, 'JFIF')).toBe(true);
    expect(
      Buffer.from(cleaned).includes(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56])),
    ).toBe(true);
  });

  it('keeps JFIF first', () => {
    expect([...cleaned.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it('adds no EXIF at all for an upright photo', () => {
    expect(contains(stripJpegMetadata(jpeg({ orientation: 1 })), 'Exif')).toBe(false);
  });
});

describe('capture times', () => {
  it('uses the offset the camera wrote', () => {
    expect(toIso('2026:10:15 09:12:44', undefined, '+02:00')).toBe('2026-10-15T07:12:44.000Z');
  });

  it('ignores a time that is not a date', () => {
    expect(toIso('0000:00:00 00:00:00')).toBeUndefined();
    expect(toIso(undefined)).toBeUndefined();
  });
});
