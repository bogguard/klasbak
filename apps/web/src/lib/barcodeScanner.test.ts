import { describe, expect, it } from 'vitest';
import { normalizeScan } from './barcodeScanner';

describe('normalizeScan', () => {
  it('drops the start and stop letters of Codabar, as hand scanners do', () => {
    expect(normalizeScan('A34567001B', 'codabar')).toBe('34567001');
    expect(normalizeScan('34567001', 'codabar')).toBe('34567001');
  });

  it('leaves other formats alone', () => {
    expect(normalizeScan(' L000001 ', 'code_128')).toBe('L000001');
    expect(normalizeScan('A123B', 'code_39')).toBe('A123B');
  });
});
