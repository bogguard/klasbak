import { CameraOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createDetector, type ScanFormat } from '../lib/barcodeScanner';
import { Button } from './ui/Feedback';

type CameraScannerProps = {
  formats: ScanFormat[];
  /** "single" closes after the first code; "continuous" keeps reading (a stack of books). */
  mode: 'single' | 'continuous';
  onCode: (code: string) => void;
  onClose: () => void;
};

/** The same code seen again within this time is the same book still in view, not a new scan. */
const REPEAT_MS = 2500;
const INTERVAL_MS = 150;

/**
 * Reads barcodes with the device's camera, for desks without a barcode scanner (a tablet or
 * laptop). Shown full-screen; the back camera is preferred on phones and tablets.
 */
export function CameraScanner({ formats, mode, onCode, onClose }: CameraScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<'denied' | 'noCamera' | 'other'>();
  const [lastCode, setLastCode] = useState<string>();
  // Latest callbacks without restarting the camera when the parent re-renders.
  const onCodeRef = useRef(onCode);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCodeRef.current = onCode;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const seen = new Map<string, number>();

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector(formats);

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              for (const { rawValue } of await detector.detect(video)) {
                const now = Date.now();
                if (now - (seen.get(rawValue) ?? 0) < REPEAT_MS) continue;
                seen.set(rawValue, now);
                setLastCode(rawValue);
                onCodeRef.current(rawValue);
                if (mode === 'single') {
                  onCloseRef.current();
                  return;
                }
              }
            }
          } catch {
            // A frame that can't be read; try the next one.
          }
          timer = window.setTimeout(() => void tick(), INTERVAL_MS);
        };
        void tick();
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        setProblem(
          name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'noCamera' : 'other',
        );
      }
    }
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // The formats and mode are fixed for one opening of the scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the camera only (it must not also clear the reader at the desk).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('camera.title')}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
    >
      <div className="flex items-center justify-between p-4">
        <p className="font-medium">
          {t(`camera.hint.${formats.includes('ean_13') ? 'isbn' : 'label'}`)}
        </p>
        <Button variant="secondary" onClick={onClose} autoFocus>
          <X className="size-4" aria-hidden="true" />
          {mode === 'continuous' ? t('camera.done') : t('camera.cancel')}
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {problem ? (
          <div className="max-w-sm space-y-3 p-6 text-center">
            <CameraOff className="mx-auto size-10" aria-hidden="true" />
            <p>{t(`camera.problem.${problem}`)}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
            {/* Aiming frame: barcodes are wide and low. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute h-1/4 w-3/4 max-w-xl rounded-xl border-4 border-white/80"
            />
          </>
        )}
      </div>

      <p aria-live="polite" className="min-h-14 p-4 text-center font-mono text-lg">
        {lastCode && t('camera.read', { code: lastCode })}
      </p>
    </div>
  );
}
