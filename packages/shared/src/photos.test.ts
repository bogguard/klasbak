import { describe, expect, it } from 'vitest';
import {
  canParentsDownload,
  defaultAvailableUntil,
  formatAccessCode,
  isAccessCode,
  isPhotoDayExpired,
  normalizeAccessCode,
  photoDayDeleteAfter,
  schoolYearEnd,
  UpdatePhotoDayRequestSchema,
  type PhotoDay,
} from './photos';

const day: PhotoDay = {
  id: 'D1',
  name: 'Schoolfoto’s',
  takenOn: '2026-10-15',
  open: false,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
};

describe('the school year of a photo day', () => {
  it('ends on 31 August', () => {
    expect(schoolYearEnd('2026-10-15')).toBe('2027-08-31');
    expect(schoolYearEnd('2027-03-01')).toBe('2027-08-31');
    expect(schoolYearEnd('2027-08-31')).toBe('2027-08-31');
    expect(schoolYearEnd('2027-09-01')).toBe('2028-08-31');
  });
});

describe('until when parents can download', () => {
  it('proposes 30 days from today', () => {
    expect(defaultAvailableUntil(day, '2026-11-02')).toBe('2026-12-02');
  });

  it('never proposes a date after the end of the school year', () => {
    expect(defaultAvailableUntil({ takenOn: '2027-06-10' }, '2027-08-20')).toBe('2027-08-31');
  });

  it('asks for a date when opening', () => {
    const request = { name: 'Foto’s', takenOn: '2026-10-15', open: true };
    expect(UpdatePhotoDayRequestSchema.safeParse(request).success).toBe(false);
    expect(
      UpdatePhotoDayRequestSchema.safeParse({ ...request, availableUntil: '2026-12-01' }).success,
    ).toBe(true);
  });
});

describe('when photos can be downloaded and when they are deleted', () => {
  const open = { ...day, open: true, availableUntil: '2026-12-01' };

  it('lets parents download while open, up to and including the last day', () => {
    expect(canParentsDownload(open, '2026-12-01')).toBe(true);
    expect(canParentsDownload(open, '2026-12-02')).toBe(false);
    expect(canParentsDownload({ ...open, open: false }, '2026-11-20')).toBe(false);
    expect(canParentsDownload({ ...open, deletedAt: '2026-11-20T10:00:00Z' }, '2026-11-20')).toBe(
      false,
    );
  });

  it('deletes everything the day after the last day', () => {
    expect(photoDayDeleteAfter(open)).toBe('2026-12-01');
    expect(isPhotoDayExpired(open, '2026-12-01')).toBe(false);
    expect(isPhotoDayExpired(open, '2026-12-02')).toBe(true);
  });

  it('deletes a photo day that was never opened at the end of its school year', () => {
    expect(photoDayDeleteAfter(day)).toBe('2027-08-31');
    expect(isPhotoDayExpired(day, '2027-09-01')).toBe(true);
  });

  it('deletes a photo day the school deleted at once', () => {
    expect(isPhotoDayExpired({ ...day, deletedAt: '2026-10-20T10:00:00Z' }, '2026-10-20')).toBe(
      true,
    );
  });
});

describe('download codes', () => {
  it('accepts what parents type, with spaces, dashes or small letters', () => {
    expect(normalizeAccessCode(' k7pm-3qxd 9twa ')).toBe('K7PM3QXD9TWA');
    expect(isAccessCode('K7PM3QXD9TWA')).toBe(true);
  });

  it('refuses look-alike characters and wrong lengths', () => {
    expect(isAccessCode('K7PM3QXD9TW0')).toBe(false);
    expect(isAccessCode('K7PM3QXD9TWI')).toBe(false);
    expect(isAccessCode('K7PM3QXD9TW')).toBe(false);
  });

  it('prints in groups of four', () => {
    expect(formatAccessCode('K7PM3QXD9TWA')).toBe('K7PM-3QXD-9TWA');
  });
});
