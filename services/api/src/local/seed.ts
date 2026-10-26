import './env';
import type { CopyInput, ReaderInput, TitleInput } from '@klasbak/shared';
import { DEFAULT_SETTINGS, ReaderInputSchema, TitleInputSchema } from '@klasbak/shared';
import { getTitleWithCopies, scanAllTitles } from '../catalog/repository';
import { addCopy, createTitle, updateCopy } from '../catalog/service';
import { getSettings, scan, updateSettings } from '../circulation/service';
import type { Actor } from '../lib/auth';
import { createReader, listReaders } from '../readers/service';
import { rebuildSearchIndex } from '../search-indexer/rebuild';
import { ensureLocalTable, migrateLocalData } from './table';

/*
 * Fills the local database with sample data so every screen has something to show:
 * a varied catalogue, two classes of readers, example holidays and a few loans (one late).
 * All names are made up; reading levels, ages and holiday dates are illustrative only.
 * Each part is only added when it's missing. Start fresh with `docker compose down -v`.
 */

const actor: Actor = { userId: 'seed', roles: ['admin'] };

type Sample = { title: Partial<TitleInput>; copies: CopyInput[]; lost?: boolean };

const samples: Sample[] = [
  {
    title: {
      title: 'Dolfje Weerwolfje',
      authors: ['Paul van Loon'],
      aviLevel: 'E4',
      ageMin: 7,
      ageMax: 10,
      subjects: ['griezelen', 'weerwolven', 'vriendschap'],
    },
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 3B' }, {}],
  },
  {
    title: {
      title: 'Vos en Haas',
      authors: ['Sylvia Vanden Heede'],
      aviLevel: 'M4',
      ageMin: 6,
      ageMax: 8,
      subjects: ['dieren', 'vriendschap'],
    },
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 2A' }],
  },
  {
    title: {
      title: 'Pluk van de Petteflet',
      authors: ['Annie M.G. Schmidt'],
      aviLevel: 'E5',
      ageMin: 6,
      ageMax: 10,
      subjects: ['avontuur', 'humor'],
    },
    copies: [{ location: 'Leesboeken' }],
  },
  {
    title: {
      title: 'Kikker is verliefd',
      authors: ['Max Velthuijs'],
      ageMin: 3,
      ageMax: 6,
      subjects: ['dieren', 'liefde', 'prentenboek'],
    },
    copies: [{ location: 'Prentenboeken' }, { location: 'Prentenboeken' }],
  },
  {
    title: {
      title: 'De Gruffalo',
      authors: ['Julia Donaldson', 'Axel Scheffler'],
      ageMin: 3,
      ageMax: 7,
      subjects: ['bos', 'monsters', 'prentenboek'],
    },
    copies: [{ location: 'Prentenboeken' }],
    lost: true,
  },
  {
    title: {
      title: 'Het zakmes',
      authors: ['Sjoerd Kuyper'],
      aviLevel: 'E6',
      ageMin: 8,
      ageMax: 11,
      subjects: ['familie', 'vriendschap'],
    },
    copies: [{ location: 'Leesboeken' }],
  },
  {
    title: {
      title: 'Alles over dinosaurussen',
      subtitle: 'Een eerste weetboek',
      ageMin: 6,
      ageMax: 10,
      subjects: ['dinosaurussen', 'prehistorie', 'informatief'],
    },
    copies: [{ location: 'Informatief' }, { location: 'Informatief' }],
  },
  {
    title: {
      type: 'magazine',
      title: 'Zonnekind',
      subtitle: 'Jaargang 2026, nummer 1',
      ageMin: 8,
      ageMax: 10,
      subjects: ['tijdschrift'],
    },
    copies: [{ location: 'Tijdschriften' }],
  },
  {
    title: {
      type: 'game',
      title: 'De Kolonisten van Catan',
      ageMin: 10,
      subjects: ['bordspel', 'strategie'],
    },
    copies: [{ location: 'Spelkast' }],
  },
  {
    title: {
      type: 'audio',
      title: 'Luisterverhalen voor kleuters',
      ageMin: 3,
      ageMax: 6,
      subjects: ['luisterboek'],
      language: 'nl',
    },
    copies: [{ location: 'Audio' }],
  },
  {
    title: {
      title: 'The Gruffalo',
      authors: ['Julia Donaldson', 'Axel Scheffler'],
      language: 'en',
      ageMin: 4,
      ageMax: 8,
      subjects: ['English', 'prentenboek'],
    },
    copies: [{ location: 'Anderstalig' }],
  },
];

const sampleReaders: Partial<ReaderInput>[] = [
  { firstName: 'Lotte', lastName: 'Peeters', group: '3B' },
  { firstName: 'Noah', lastName: 'Janssens', group: '3B' },
  { firstName: 'Amira', lastName: 'El Amrani', group: '3B' },
  { firstName: 'Lucas', lastName: 'Maes', group: '3B' },
  { firstName: 'Emma', lastName: 'Jacobs', group: '5A' },
  { firstName: 'Mats', lastName: 'Willems', group: '5A' },
  { firstName: 'Fien', lastName: 'Claes', group: '5A', active: false },
  { firstName: 'An', lastName: 'Wouters', category: 'teacher', email: 'an.wouters@example.org' },
];

await ensureLocalTable();
await migrateLocalData();

const barcodes: string[] = [];
if ((await scanAllTitles()).length === 0) {
  for (const sample of samples) {
    const input = TitleInputSchema.parse({ type: 'book', ...sample.title });
    const title = await createTitle(actor, input, undefined);
    for (const copyInput of sample.copies) {
      const copy = await addCopy(actor, title.id, copyInput);
      if (sample.lost) await updateCopy(actor, copy.barcode, { status: 'lost' });
      else barcodes.push(copy.barcode);
    }
  }
  console.log(`Catalogue: ${await rebuildSearchIndex()} titles.`);
} else {
  console.log('Catalogue: already has titles, skipped.');
  for (const title of await scanAllTitles()) {
    const copies = (await getTitleWithCopies(title.id))?.copies ?? [];
    barcodes.push(...copies.filter((c) => c.status === 'available').map((c) => c.barcode));
  }
}

if ((await getSettings()).version === 0) {
  await updateSettings(
    actor,
    {
      ...DEFAULT_SETTINGS,
      closedPeriods: [
        { from: '2026-10-26', to: '2026-11-08', label: 'Herfstvakantie (voorbeeld)' },
        { from: '2026-12-21', to: '2027-01-03', label: 'Kerstvakantie (voorbeeld)' },
      ],
    },
    0,
  );
  console.log('Settings: example holidays added.');
}

if ((await listReaders()).length === 0) {
  const readers = [];
  for (const input of sampleReaders) {
    readers.push(await createReader(actor, ReaderInputSchema.parse(input)));
  }
  console.log(`Readers: ${readers.length} added.`);

  // A few loans with available copies from the catalogue.
  const [lotte, noah, , , emma] = readers;
  if (barcodes.length >= 8 && lotte && noah && emma) {
    const book = (index: number) => barcodes[index] ?? '';
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    await scan(actor, book(0), lotte.id, daysAgo(3));
    await scan(actor, book(3), lotte.id, daysAgo(2));
    await scan(actor, book(5), emma.id, daysAgo(40)); // late by now
    await scan(actor, book(7), noah.id, daysAgo(30));
    await scan(actor, book(7), undefined, daysAgo(10)); // returned: history
    console.log('Loans: 3 active (1 late) and 1 returned.');
  }
} else {
  console.log('Readers: already present, skipped.');
}
