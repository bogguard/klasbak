import { describe, expect, it } from 'vitest';
import { bookBarcode, bookBarcodeFromInput, memberNumber, institutionNumberOf } from './codes';

describe('generated codes', () => {
  it('start with the school number', () => {
    expect(bookBarcode('012345', 42)).toBe('012345000042');
    expect(memberNumber('012345', 123)).toBe('L012345000123');
  });

  it('refuse numbers that no longer fit', () => {
    expect(() => bookBarcode('012345', 1_000_000)).toThrow();
    expect(() => memberNumber('012345', 0)).toThrow();
  });

  it('tell which school a code belongs to', () => {
    expect(institutionNumberOf('012345000042')).toBe('012345');
    expect(institutionNumberOf('L012345000123')).toBe('012345');
  });

  it("don't claim codes Klasbak didn't make", () => {
    expect(institutionNumberOf('00000042')).toBeUndefined(); // an old label
    expect(institutionNumberOf('9789045117209')).toBeUndefined(); // an ISBN
    expect(institutionNumberOf('L000123')).toBeUndefined();
  });
});

describe('bookBarcodeFromInput', () => {
  it('turns a short number into this school’s barcode', () => {
    expect(bookBarcodeFromInput(' 42 ', '012345')).toBe('012345000042');
  });

  it('keeps full or foreign codes as typed', () => {
    expect(bookBarcodeFromInput('012345000042', '012345')).toBe('012345000042');
    expect(bookBarcodeFromInput('BIB-0042', '012345')).toBe('BIB-0042');
    expect(bookBarcodeFromInput('42', undefined)).toBe('42');
  });
});
