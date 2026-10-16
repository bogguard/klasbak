/** Image types we accept from people (covers, logos), with their file extension. */
export const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageType = keyof typeof IMAGE_EXTENSIONS;

/**
 * Recognises the image type from the file's first bytes; the declared type isn't trusted.
 * SVG is deliberately not accepted: it can contain scripts that would run on our site.
 */
export function detectImageType(bytes: Uint8Array): ImageType | undefined {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}
