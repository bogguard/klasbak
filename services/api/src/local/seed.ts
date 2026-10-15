import './env';
import type { CopyInput, TitleInput } from '@library/shared';
import { TitleInputSchema } from '@library/shared';
import { scanAllTitles } from '../catalog/repository';
import { addCopy, createTitle, updateCopy } from '../catalog/service';
import type { Actor } from '../lib/auth';
import { rebuildSearchIndex } from '../search-indexer/rebuild';
import { ensureLocalTable } from './table';

/*
 * Fills the local database with a small, varied sample catalogue so every screen has
 * something to show. Reading levels and ages are illustrative, not authoritative.
 * Run again after `docker compose down -v` to start fresh.
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

await ensureLocalTable();

if ((await scanAllTitles()).length > 0) {
  console.log('The local catalogue already has titles; nothing to do.');
  console.log('Start fresh with: docker compose down -v && npm run dev:local, then npm run seed');
  process.exit(0);
}

for (const sample of samples) {
  const input = TitleInputSchema.parse({ type: 'book', ...sample.title });
  const title = await createTitle(actor, input, undefined);
  for (const copyInput of sample.copies) {
    const copy = await addCopy(actor, title.id, copyInput);
    if (sample.lost) await updateCopy(actor, copy.barcode, { status: 'lost' });
  }
}

const count = await rebuildSearchIndex();
console.log(`Seeded ${count} titles.`);
