import type { PhotoPupil } from '@klasbak/shared';
import { describe, expect, it } from 'vitest';
import {
  centralFirst,
  classifyShot,
  classPhotoCode,
  codeIndex,
  compareCaptures,
  inPhotoPixels,
  type Owner,
} from './sequence';

const emma: PhotoPupil = {
  id: 'R1',
  firstName: 'Emma',
  lastName: 'Peeters',
  group: '3B',
  memberNumber: 'L123456000001',
  category: 'pupil',
};
const noah: PhotoPupil = { ...emma, id: 'R2', firstName: 'Noah', memberNumber: 'L123456000002' };
const index = codeIndex([emma, noah]);

/** Runs a series of photos (the codes on each, most central first) through the rule. */
function series(codesPerPhoto: string[][]) {
  let owner: Owner = { kind: 'none' };
  return codesPerPhoto.map((codes) => {
    const shot = classifyShot(owner, codes, index);
    owner = shot.owner;
    if (shot.isCard) return 'card';
    if (owner.kind === 'pupil') return owner.pupil.firstName;
    if (owner.kind === 'class') return `class ${owner.group}`;
    return owner.kind;
  });
}

describe('matching photos to pupils with their cards', () => {
  it('gives the photos after a card to that pupil, until the next card', () => {
    expect(series([['L123456000001'], [], [], ['L123456000002'], [], []])).toEqual([
      'card',
      'Emma',
      'Emma',
      'card',
      'Noah',
      'Noah',
    ]);
  });

  it('keeps photos before the first card for sorting by hand', () => {
    expect(series([[], ['L123456000001'], []])).toEqual(['none', 'card', 'Emma']);
  });

  it('keeps a portrait with the pupil’s own card in view as a portrait', () => {
    expect(series([['L123456000001'], ['L123456000001'], []])).toEqual(['card', 'Emma', 'Emma']);
  });

  it('reads card numbers regardless of case and spaces', () => {
    expect(series([[' l123456000002 '], []])).toEqual(['card', 'Noah']);
  });

  it('keeps photos after an unknown card apart instead of giving them to the previous pupil', () => {
    expect(series([['L123456000001'], [], ['L999999000001'], []])).toEqual([
      'card',
      'Emma',
      'card',
      'unknown',
    ]);
  });
});

describe('photographing the class list', () => {
  it('takes the line in the middle when the lines around it are in the photo too', () => {
    // Emma's portraits are done; the photographer aims at Noah's line, Emma's shows above it.
    expect(series([['L123456000001'], [], ['L123456000002', 'L123456000001'], []])).toEqual([
      'card',
      'Emma',
      'card',
      'Noah',
    ]);
  });

  it('turns the photos after the class code into class photos, until the next card', () => {
    expect(series([['L123456000002'], [], ['KLASFOTO 3B'], [], [], ['L123456000001']])).toEqual([
      'card',
      'Noah',
      'card',
      'class 3B',
      'class 3B',
      'card',
    ]);
  });

  it('prints class codes in plain letters, as Code 128 needs', () => {
    expect(classPhotoCode('6é Latijn')).toBe('KLASFOTO 6E LATIJN');
    expect(codeIndex([{ ...emma, group: '6é' }]).get('KLASFOTO 6E')).toEqual({
      kind: 'class',
      group: '6é',
    });
  });
});

describe('which code is meant', () => {
  it('puts the code closest to the middle of the photo first', () => {
    const box = (y: number) => ({ x: 400, y, width: 800, height: 100 });
    const results = [
      { rawValue: 'above', boundingBox: box(100) },
      { rawValue: 'middle', boundingBox: box(550) },
      { rawValue: 'no position' },
    ];
    expect(centralFirst(results, 1600, 1200).map((r) => r.rawValue)).toEqual([
      'middle',
      'above',
      'no position',
    ]);
  });
});

describe('codes read at several sizes', () => {
  it('compares their places on the photo itself', () => {
    const small = inPhotoPixels(
      [{ rawValue: 'middle', boundingBox: { x: 100, y: 180, width: 200, height: 40 } }],
      4,
    );
    const large = inPhotoPixels(
      [{ rawValue: 'above', boundingBox: { x: 200, y: 100, width: 400, height: 80 } }],
      2,
    );
    expect(small[0]?.boundingBox).toEqual({ x: 400, y: 720, width: 800, height: 160 });
    expect(centralFirst([...large, ...small], 1600, 1600).map((r) => r.rawValue)).toEqual([
      'middle',
      'above',
    ]);
  });
});

describe('the order photos were taken in', () => {
  it('follows the camera clock, then the file date and name', () => {
    const files = [
      { name: 'IMG_0010.JPG', takenAt: '2026-10-15T08:01:00.000Z', lastModified: 0 },
      { name: 'IMG_0009.JPG', takenAt: '2026-10-15T08:00:00.000Z', lastModified: 0 },
      { name: 'IMG_10.JPG', lastModified: Date.parse('2026-10-15T08:02:00Z') },
      { name: 'IMG_9.JPG', lastModified: Date.parse('2026-10-15T08:02:00Z') },
    ];
    expect(files.sort(compareCaptures).map((f) => f.name)).toEqual([
      'IMG_0009.JPG',
      'IMG_0010.JPG',
      'IMG_9.JPG',
      'IMG_10.JPG',
    ]);
  });
});
