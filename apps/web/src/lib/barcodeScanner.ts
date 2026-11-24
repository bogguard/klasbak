// The ZXing WebAssembly module is bundled and served from our own site (not a public CDN):
// better for privacy, works with our content security policy, and keeps working offline.
// Keep this version equal to the one barcode-detector depends on (see apps/web/package.json).
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Formats we read: our own labels and cards are Code 128; book ISBNs are EAN-13. Public
 * libraries' labels (exchange collections) also come as Code 39, Codabar, ITF or EAN-8.
 */
export type ScanFormat = 'code_128' | 'ean_13' | 'code_39' | 'codabar' | 'itf' | 'ean_8';

/** Any label a public library may have put on its books. */
export const LIBRARY_LABEL_FORMATS: ScanFormat[] = [
  'code_128',
  'code_39',
  'codabar',
  'itf',
  'ean_8',
  'ean_13',
];

export type Detector = {
  /** A video frame at the desk, or a photo that was drawn on a canvas. */
  detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedCode[]>;
};

/** Where in the image a code was found, when the reader says. */
export type DetectedCode = {
  rawValue: string;
  format: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

type NativeDetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * Uses the browser's own barcode detector where it exists (e.g. Chrome on Android), and
 * otherwise a WebAssembly implementation, loaded only when someone actually opens the camera.
 */
export async function createDetector(formats: ScanFormat[]): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (native) {
    const supported: string[] = await native.getSupportedFormats().catch(() => []);
    if (formats.every((format) => supported.includes(format))) {
      return withFallback(new native({ formats }), formats);
    }
  }
  return zxingDetector(formats);
}

async function zxingDetector(formats: ScanFormat[]): Promise<Detector> {
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  });
  return new BarcodeDetector({ formats });
}

/**
 * Some browsers offer a built-in detector whose service isn't there (Chrome without the
 * system's barcode service): then every detect() fails. The first failure switches to the
 * WebAssembly reader for good, instead of silently reading nothing.
 */
function withFallback(native: Detector, formats: ScanFormat[]): Detector {
  let fallback: Promise<Detector> | undefined;
  return {
    async detect(source) {
      if (fallback) return (await fallback).detect(source);
      try {
        return await native.detect(source);
      } catch {
        fallback = zxingDetector(formats);
        return (await fallback).detect(source);
      }
    },
  };
}

/**
 * What a camera read, as a hand scanner would type it: Codabar labels (common in libraries)
 * can come with their start and stop letters ("A1234567B"), which aren't part of the number.
 */
export function normalizeScan(rawValue: string, format: string): string {
  const value = rawValue.trim();
  return format === 'codabar' ? value.replace(/^[A-D](.+)[A-D]$/i, '$1') : value;
}

export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}
