import type { Asset } from '@klasbak/shared';
import { describe, expect, it } from 'vitest';
import {
  findByCode,
  matchesSearch,
  matchesStatus,
  parseSerialNumbers,
  summariseStock,
} from './stock';

const asset = (overrides: Partial<Asset>): Asset => ({
  id: 'A',
  kind: 'Chromebook',
  name: 'Acer 314',
  barcode: 'M123456000001',
  status: 'available',
  createdAt: '',
  updatedAt: '',
  version: 1,
  ...overrides,
});

describe('summariseStock', () => {
  it('counts per kind, biggest first, without what was withdrawn', () => {
    const summary = summariseStock([
      asset({ kind: 'Tablet' }),
      asset({ status: 'assigned' }),
      asset({ status: 'repair' }),
      asset({ status: 'lost' }),
      asset({ status: 'withdrawn' }),
    ]);
    expect(summary).toEqual([
      { kind: 'Chromebook', total: 3, available: 0, assigned: 1, repair: 1, lost: 1 },
      { kind: 'Tablet', total: 1, available: 1, assigned: 0, repair: 0, lost: 0 },
    ]);
  });
});

describe('matchesStatus', () => {
  const holder = {
    assignmentId: 'S',
    readerId: 'R',
    readerName: 'Lotte',
    since: '2026-10-01',
    dueDate: '2026-11-01',
  };

  it('hides withdrawn items unless asked for', () => {
    const gone = asset({ status: 'withdrawn' });
    expect(matchesStatus(gone, '', '2026-11-05')).toBe(false);
    expect(matchesStatus(gone, 'withdrawn', '2026-11-05')).toBe(true);
  });

  it('finds what is late, not what is due today', () => {
    const out = asset({ status: 'assigned', holder });
    expect(matchesStatus(out, 'overdue', '2026-11-02')).toBe(true);
    expect(matchesStatus(out, 'overdue', '2026-11-01')).toBe(false);
  });

  it('never calls an item without a date late', () => {
    const out = asset({ status: 'assigned', holder: { ...holder, dueDate: undefined } });
    expect(matchesStatus(out, 'overdue', '2030-01-01')).toBe(false);
  });
});

describe('searching', () => {
  const held = asset({
    serialNumber: 'NXK1',
    holder: {
      assignmentId: 'S',
      readerId: 'R',
      readerName: 'Lotte Peeters',
      readerGroup: '3B',
      since: '',
    },
  });

  it('finds an item by who has it', () => {
    expect(matchesSearch(held, 'peeters')).toBe(true);
    expect(matchesSearch(held, 'janssens')).toBe(false);
  });

  it('finds an item by its label or by the sticker of the manufacturer', () => {
    expect(findByCode([held], 'M123456000001')).toBe(held);
    expect(findByCode([held], ' nxk1 ')).toBe(held);
    expect(findByCode([held], 'NXK')).toBeUndefined();
  });
});

describe('parseSerialNumbers', () => {
  it('reads a scanned list, in capitals, without repeats', () => {
    expect(parseSerialNumbers('nxk1\nNXK2\r\nnxk1\n\n NXK3 ,NXK4')).toEqual({
      serials: ['NXK1', 'NXK2', 'NXK3', 'NXK4'],
      invalid: [],
    });
  });

  it('points out what cannot be a serial number', () => {
    expect(parseSerialNumbers('NXK1 a?b').invalid).toEqual(['a?b']);
  });
});
