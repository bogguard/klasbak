import { LABEL_LOOKUP_MAX } from '@library/shared';
import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128/index.js';

/** One black bar, in modules (the narrowest bar width) from the left edge of the symbol. */
export type Bar = { start: number; width: number };

/**
 * Code 128, which every common scanner reads. JsBarcode picks the most compact encoding,
 * e.g. the numeric mode for "00000042", which gives wider bars on small labels.
 */
export function code128(text: string): { modules: number; bars: Bar[] } {
  const encoder = new CODE128(text, {});
  if (!encoder.valid()) throw new Error(`Cannot encode "${text}" as Code 128`);
  const pattern = encoder.encode().data;

  const bars: Bar[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '1') continue;
    const last = bars.at(-1);
    if (last && last.start + last.width === i) last.width++;
    else bars.push({ start: i, width: 1 });
  }
  return { modules: pattern.length, bars };
}

/** Scanners need empty space before and after the bars: 10 modules each side. */
export const QUIET_ZONE_MODULES = 10;

/** "00000001" to "00000020" → every code in between, keeping the leading zeros. */
export function expandRange(from: string, to: string): string[] | undefined {
  if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return undefined;
  const start = Number(from);
  const end = Number(to);
  if (end < start || end - start + 1 > LABEL_LOOKUP_MAX) return undefined;
  return Array.from({ length: end - start + 1 }, (_, i) =>
    String(start + i).padStart(from.length, '0'),
  );
}
