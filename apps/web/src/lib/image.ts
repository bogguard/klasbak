/*
 * Prepares a photo for upload as a book cover: turned upright, scaled down and re-saved as
 * JPEG. Re-saving through a canvas also drops the photo's metadata (EXIF), such as the GPS
 * location of the phone it was taken with.
 */

const MAX_SIDE = 900;
const QUALITY = 0.85;

export class UnsupportedImageError extends Error {}

export async function prepareCover(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // e.g. HEIC photos in a browser that can't read them.
    throw new UnsupportedImageError();
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new UnsupportedImageError();
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new UnsupportedImageError();
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks: String.fromCharCode with too many arguments overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
