// The ZXing WebAssembly module is bundled and served from our own site (not a public CDN):
// better for privacy, works with our content security policy, and keeps working offline.
// Keep this version equal to the one barcode-detector depends on (see apps/web/package.json).
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/** Formats we read: our own labels and cards are Code 128; book ISBNs are EAN-13. */
export type ScanFormat = 'code_128' | 'ean_13';

export type Detector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
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
    if (formats.every((format) => supported.includes(format))) return new native({ formats });
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  });
  return new BarcodeDetector({ formats });
}

export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}
