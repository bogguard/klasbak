import './env';
import { BatchWriteCommand, ScanCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_SETTINGS,
  isClosed,
  localDate,
  ReaderInputSchema,
  TitleInputSchema,
  type CopyInput,
  type ReaderInput,
  type TitleInput,
} from '@library/shared';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { addCopy, createTitle, markLabelsPrinted, updateCopy } from '../catalog/service';
import { lookupIsbn } from '../catalog/isbn-lookup';
import { scan, updateSettings } from '../circulation/service';
import { addExchangeBooks, createExchange, returnExchange } from '../exchange/service';
import type { Actor } from '../lib/auth';
import { db, env } from '../lib/aws';
import { brandingKey } from '../lib/keys';
import { createReader } from '../readers/service';
import { rebuildSearchIndex } from '../search-indexer/rebuild';
import { ensureLocalTable } from './table';

/*
 * `npm run demo`: empties the LOCAL database and fills it with a school library that is a few
 * weeks into the school year, for demos and screenshots. Everything happens through the
 * services, dated in the past, so statistics, overdue lists, label queue and exchange
 * collections look like real use. The school's name and logo (Huisstijl) are kept.
 * All names are made up. Never run against AWS: it refuses unless DynamoDB Local is used.
 */

if (!process.env.DYNAMODB_ENDPOINT?.includes('localhost')) {
  throw new Error('The demo data is for the local database only (DYNAMODB_ENDPOINT=localhost).');
}

const actor: Actor = { userId: 'demo', roles: ['admin'] };
const today = new Date();
const at = (date: string, hour = 10) =>
  new Date(`${date}T${String(hour - 2).padStart(2, '0')}:00:00Z`);

// A small, repeatable random generator: the same demo every time.
let seed = 20260901;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)] as T;

async function wipe() {
  let removed = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page: ScanCommandOutput = await db.send(
      new ScanCommand({ TableName: env.tableName, ExclusiveStartKey: startKey }),
    );
    const keys = (page.Items ?? [])
      .map((item) => ({ pk: item.pk as string, sk: item.sk as string }))
      // The school's own name and logo stay.
      .filter((key) => !(key.pk === brandingKey.pk && key.sk === brandingKey.sk));
    for (let i = 0; i < keys.length; i += 25) {
      const batch = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      await db.send(new BatchWriteCommand({ RequestItems: { [env.tableName]: batch } }));
      removed += batch.length;
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  const publicDir = process.env.LOCAL_PUBLIC_DIR ?? '.local/public';
  await rm(join(publicDir, 'covers'), { recursive: true, force: true });
  await rm(join(publicDir, 'search'), { recursive: true, force: true });
  console.log(`Emptied the local database (${removed} items); name and logo kept.`);
}

type Book = Partial<TitleInput> & { copies: CopyInput[]; added?: string };

/** With a real ISBN, cover and details come from the book databases (when online). */
const withCover: Array<{ isbn: string; copies: CopyInput[]; aviLevel?: TitleInput['aviLevel'] }> = [
  { isbn: '9789061699767', copies: [{ location: 'Leesboeken' }, { location: 'Leesboeken' }] },
  { isbn: '9789031726653', copies: [{ location: 'Leesboeken' }], aviLevel: 'E6' },
  { isbn: '9780140328721', copies: [{ location: 'Engelse boeken' }] },
];

const books: Book[] = [
  {
    title: 'Dolfje Weerwolfje',
    authors: ['Paul van Loon'],
    aviLevel: 'E4',
    ageMin: 7,
    ageMax: 10,
    subjects: ['griezelen', 'vriendschap'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 3B' }, {}],
    added: '2025-09-12',
  },
  {
    title: 'Vos en Haas',
    authors: ['Sylvia Vanden Heede'],
    aviLevel: 'M4',
    ageMin: 6,
    ageMax: 8,
    subjects: ['dieren', 'vriendschap'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 2B' }],
    added: '2025-09-12',
  },
  {
    title: 'Pluk van de Petteflet',
    authors: ['Annie M.G. Schmidt'],
    aviLevel: 'E5',
    ageMin: 6,
    ageMax: 10,
    subjects: ['avontuur', 'humor'],
    copies: [{ location: 'Leesboeken' }],
    added: '2025-10-03',
  },
  {
    title: 'Kikker is verliefd',
    authors: ['Max Velthuijs'],
    aviLevel: 'Start',
    ageMin: 4,
    ageMax: 7,
    subjects: ['liefde', 'dieren'],
    copies: [{ location: 'Prentenboeken' }, { location: 'Klasbib 1A' }],
    added: '2025-10-03',
  },
  {
    title: 'Het zakmes',
    authors: ['Sjoerd Kuyper'],
    aviLevel: 'E6',
    ageMin: 9,
    ageMax: 12,
    subjects: ['familie', 'opa'],
    copies: [{ location: 'Leesboeken' }],
    added: '2025-11-20',
  },
  {
    title: 'Rikki en de verdwenen tekening',
    authors: ['Guido van Genechten'],
    aviLevel: 'M3',
    ageMin: 5,
    ageMax: 7,
    subjects: ['dieren', 'school'],
    copies: [{ location: 'Prentenboeken' }],
    added: '2026-01-15',
  },
  {
    title: 'De Gruffalo',
    authors: ['Julia Donaldson', 'Axel Scheffler'],
    aviLevel: 'M4',
    ageMin: 4,
    ageMax: 8,
    subjects: ['bos', 'monsters'],
    copies: [{ location: 'Prentenboeken' }, { location: 'Klasbib 1A' }],
    added: '2026-01-15',
  },
  {
    title: 'Mijn mama is een superheld',
    authors: ['Kaat Vandenbossche'],
    aviLevel: 'M5',
    ageMin: 6,
    ageMax: 9,
    subjects: ['familie', 'humor'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-02-09',
  },
  {
    title: 'Het geheim van de oude vuurtoren',
    authors: ['Marc de Bel'],
    aviLevel: 'E7',
    ageMin: 9,
    ageMax: 12,
    subjects: ['avontuur', 'zee', 'mysterie'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 6A' }],
    added: '2026-03-02',
  },
  {
    title: 'Superjuffie op schoolreis',
    authors: ['Janneke Schotveld'],
    aviLevel: 'E5',
    ageMin: 7,
    ageMax: 10,
    subjects: ['school', 'humor'],
    copies: [{ location: 'Leesboeken' }, {}],
    added: '2026-03-02',
  },
  {
    title: 'Alles over dinosaurussen',
    authors: ['Redactie Jeugdkennis'],
    ageMin: 7,
    ageMax: 12,
    subjects: ['dinosaurussen', 'informatief'],
    copies: [{ location: 'Infoboeken' }],
    added: '2026-04-20',
  },
  {
    title: 'Ruimtereis: onze planeten',
    authors: ['Redactie Jeugdkennis'],
    ageMin: 8,
    ageMax: 12,
    subjects: ['ruimte', 'informatief'],
    copies: [{ location: 'Infoboeken' }],
    added: '2026-04-20',
  },
  {
    title: 'Fien en de geheime tuin',
    authors: ['Ann Peeters'],
    aviLevel: 'E4',
    ageMin: 7,
    ageMax: 9,
    subjects: ['natuur', 'vriendschap'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 3B' }],
    added: '2026-09-07',
  },
  {
    title: 'De dag dat de klas verdween',
    authors: ['Bart Moeyaert'],
    aviLevel: 'M6',
    ageMin: 8,
    ageMax: 11,
    subjects: ['school', 'mysterie'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-09-07',
  },
  {
    title: 'Leren lezen met Lars',
    authors: ['Hilde Van Dam'],
    aviLevel: 'Start',
    ageMin: 5,
    ageMax: 6,
    subjects: ['eerste lezers'],
    copies: [{ location: 'Eerste lezers' }, { location: 'Eerste lezers' }],
    added: '2026-09-21',
  },
  {
    title: 'Voetbal is mijn leven',
    authors: ['Johan Fabricius jr.'],
    aviLevel: 'M7',
    ageMin: 9,
    ageMax: 12,
    subjects: ['sport', 'voetbal'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-10-05',
  },
  {
    title: 'Zwemmen met dolfijnen',
    authors: ['Saar Vermeulen'],
    aviLevel: 'E3',
    ageMin: 6,
    ageMax: 8,
    subjects: ['zee', 'dieren'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-10-05',
  },
  {
    type: 'magazine',
    title: 'Zonnekind',
    subjects: ['tijdschrift'],
    ageMin: 7,
    ageMax: 10,
    copies: [{ location: 'Tijdschriften' }],
    added: '2026-09-01',
  },
  {
    type: 'game',
    title: 'De Kolonisten van Catan Junior',
    ageMin: 6,
    ageMax: 99,
    subjects: ['spel'],
    copies: [{ location: 'Spelkast' }],
    added: '2026-02-09',
  },
  {
    type: 'audio',
    title: 'Luisterverhalen voor kleuters',
    subjects: ['luisterboek'],
    ageMin: 3,
    ageMax: 6,
    copies: [{ location: 'Luisterhoek' }],
    added: '2025-11-20',
  },
];

const classes: Record<string, Array<[string, string]>> = {
  '1A': [
    ['Lina', 'Peeters'],
    ['Mohamed', 'Benali'],
    ['Jules', 'Desmet'],
    ['Ella', 'Verbeke'],
  ],
  '2B': [
    ['Finn', 'De Smet'],
    ['Zoë', 'Lambert'],
    ['Yasmine', 'Ouali'],
    ['Rune', 'Goossens'],
  ],
  '3A': [
    ['Lotte', 'Janssens'],
    ['Amir', 'Haddad'],
    ['Nora', 'Wouters'],
    ['Seppe', 'Martens'],
  ],
  '3B': [
    ['Noah', 'Claes'],
    ['Amira', 'El Amrani'],
    ['Lucas', 'Maes'],
    ['Fleur', 'Hermans'],
  ],
  '4A': [
    ['Emma', 'Jacobs'],
    ['Wout', 'Mertens'],
    ['Lisa', 'Van Damme'],
    ['Kobe', 'Dubois'],
  ],
  '5B': [
    ['Mats', 'Willems'],
    ['Sara', 'Aerts'],
    ['Ibrahim', 'Yilmaz'],
    ['Hanne', 'Coppens'],
  ],
  '6A': [
    ['Jasper', 'Michiels'],
    ['Febe', 'Pauwels'],
    ['Louis', 'Segers'],
    ['Lore', 'Leclercq'],
  ],
};

async function main() {
  await ensureLocalTable();
  await wipe();

  await updateSettings(
    actor,
    {
      ...DEFAULT_SETTINGS,
      closedPeriods: [
        { from: '2026-10-26', to: '2026-11-01', label: 'Herfstvakantie' },
        { from: '2026-12-21', to: '2027-01-03', label: 'Kerstvakantie' },
        { from: '2027-02-15', to: '2027-02-21', label: 'Krokusvakantie' },
        { from: '2027-04-05', to: '2027-04-18', label: 'Paasvakantie' },
      ],
    },
    0,
    at('2026-08-25'),
  );

  // Catalogue, with titles added over the last year (so "new titles" means something).
  const copies: Array<{ barcode: string; titleId: string }> = [];
  for (const book of books) {
    const { copies: copyInputs, added = '2026-09-01', ...title } = book;
    const input = TitleInputSchema.parse({ type: 'book', ...title });
    const created = await createTitle(actor, input, undefined, at(added));
    for (const copyInput of copyInputs) {
      const copy = await addCopy(actor, created.id, copyInput, at(added));
      copies.push({ barcode: copy.barcode, titleId: created.id });
    }
  }
  let covers = 0;
  for (const { isbn, copies: copyInputs, aviLevel } of withCover) {
    const found = await lookupIsbn(isbn).catch(() => undefined);
    const input = TitleInputSchema.parse({
      type: 'book',
      title: `ISBN ${isbn}`,
      ...found?.title,
      isbn,
      ...(aviLevel ? { aviLevel } : {}),
    });
    const created = await createTitle(actor, input, found?.coverUrl, at('2026-09-14'));
    if (created.coverImageKey) covers++;
    for (const copyInput of copyInputs) {
      const copy = await addCopy(actor, created.id, copyInput, at('2026-09-14'));
      copies.push({ barcode: copy.barcode, titleId: created.id });
    }
  }
  // Labels printed, except the newest two (the print queue has something to show).
  await markLabelsPrinted(copies.slice(0, -2).map((c) => c.barcode));
  console.log(
    `Catalogue: ${books.length + withCover.length} titles, ${copies.length} copies (${covers} real covers).`,
  );

  // Readers: seven classes, three teachers, one pupil who left.
  const pupils = [];
  let number = 1000;
  for (const [group, names] of Object.entries(classes)) {
    for (const [firstName, lastName] of names) {
      const input: Partial<ReaderInput> = {
        firstName,
        lastName,
        group,
        schoolNumber: String(++number),
      };
      pupils.push(await createReader(actor, ReaderInputSchema.parse(input), at('2026-09-01')));
    }
  }
  const teachers = [];
  for (const [firstName, lastName] of [
    ['An', 'Wouters'],
    ['Pieter', 'Declercq'],
    ['Sofie', 'Van den Broeck'],
  ]) {
    teachers.push(
      await createReader(
        actor,
        ReaderInputSchema.parse({ firstName, lastName, category: 'teacher' }),
        at('2026-09-01'),
      ),
    );
  }
  await createReader(
    actor,
    ReaderInputSchema.parse({
      firstName: 'Tibo',
      lastName: 'Vermeersch',
      group: '6A',
      active: false,
    }),
    at('2026-09-01'),
  );
  console.log(
    `Readers: ${pupils.length} pupils in ${Object.keys(classes).length} classes, ${teachers.length} teachers, 1 inactive.`,
  );

  // An exchange collection that went back in June (with its list), and one at school now.
  const spring = await createExchange(
    actor,
    { name: 'Voorjaar 2026', lender: 'Bibliotheek Zele', returnBy: '2026-06-19' },
    at('2026-03-02'),
  );
  const springBooks = [
    'Op avontuur met Wiebe',
    'De kleine walvis',
    'Bram en de bliksem',
    'Zoek de kat!',
    'Mijn eerste atlas',
  ];
  await addExchangeBooks(
    actor,
    spring.id,
    springBooks.map((title, i) => ({
      barcode: `30700040${10 + i}`,
      title: { type: 'book', title, authors: [] },
    })),
    at('2026-03-02'),
  );
  const autumn = await createExchange(
    actor,
    { name: 'Najaar 2026', lender: 'Bibliotheek Zele', returnBy: '2026-12-18' },
    at('2026-09-15'),
  );
  const autumnBooks: Array<[string, string, TitleInput['aviLevel']?]> = [
    ['De vlucht van de reiger', 'Lies Goossens', 'E5'],
    ['Waar is Bobbie?', 'Tom Schamp', 'M3'],
    ['Het grote griezelboek', 'Diverse auteurs'],
    ['Sterren boven de stad', 'Elke Bonte', 'M6'],
    ['Tim en de tijdmachine', 'Pieter Gaudesaboos', 'E4'],
    ['Paarden in de wei', 'Inge Moreel', 'M4'],
    ['Het mysterie van het kasteel', 'Marc de Bel', 'E6'],
    ['Robots zijn ook maar mensen', 'Jef Aerts', 'M7'],
  ];
  await addExchangeBooks(
    actor,
    autumn.id,
    autumnBooks.map(([title, author, aviLevel], i) => ({
      barcode: `307000512${30 + i}`,
      title: { type: 'book', title, authors: [author], ...(aviLevel ? { aviLevel } : {}) },
    })),
    at('2026-09-15'),
  );
  const shelf = [
    ...copies,
    ...springBooks.map((_, i) => ({ barcode: `30700040${10 + i}`, titleId: 'spring' })),
    ...autumnBooks.map((_, i) => ({ barcode: `307000512${30 + i}`, titleId: 'autumn' })),
  ];

  // A history of lending: school days from March to today, returns after one to three weeks,
  // a few books forgotten (overdue now). Everything through the desk, dated in the past.
  const onLoan = new Map<string, { readerId: string; returnOn: string | null }>();
  const loansOf = new Map<string, number>();
  const settings = {
    closedWeekdays: DEFAULT_SETTINGS.closedWeekdays,
    closedPeriods: [
      { from: '2026-04-06', to: '2026-04-19' },
      { from: '2026-07-01', to: '2026-08-31' },
      { from: '2026-10-26', to: '2026-11-01' },
    ],
  };
  const days: string[] = [];
  for (
    let d = new Date('2026-03-02T12:00:00Z');
    localDate(d) < localDate(today);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = localDate(d);
    if (!isClosed(day, settings)) days.push(day);
  }
  let lent = 0;
  for (const day of days) {
    // Spring books go back before the collection does.
    const springOver = day >= '2026-06-10';
    for (const [barcode, loan] of onLoan) {
      if (loan.returnOn && loan.returnOn <= day) {
        await scan(actor, barcode, undefined, at(day, 9));
        onLoan.delete(barcode);
        loansOf.set(loan.readerId, (loansOf.get(loan.readerId) ?? 1) - 1);
      }
    }
    const busy = 1 + Math.floor(random() * 3);
    for (let i = 0; i < busy; i++) {
      // A calm library: about a third of the books out at most, so the shelves aren't empty.
      if (onLoan.size >= shelf.length / 3) break;
      const reader = random() < 0.1 ? pick(teachers) : pick(pupils);
      const max = reader.category === 'teacher' ? 10 : 3;
      if ((loansOf.get(reader.id) ?? 0) >= max) continue;
      const free = shelf.filter(
        (c) =>
          !onLoan.has(c.barcode) &&
          (c.titleId !== 'spring' || (day >= '2026-03-02' && !springOver)) &&
          (c.titleId !== 'autumn' || day >= '2026-09-15'),
      );
      if (free.length === 0) continue;
      const book = pick(free);
      const result = await scan(actor, book.barcode, reader.id, at(day, 10));
      if (result.outcome !== 'checkedOut') continue;
      lent++;
      loansOf.set(reader.id, (loansOf.get(reader.id) ?? 0) + 1);
      // Most come back in time; some are kept long (overdue now), recent ones are still out.
      const forgotten = random() < 0.07 && day >= '2026-09-01';
      const keep = 7 + Math.floor(random() * 14);
      const back = new Date(`${day}T12:00:00Z`);
      back.setUTCDate(back.getUTCDate() + keep);
      // Spring's books all come back before that collection goes back on 15 June.
      const returnOn = forgotten
        ? null
        : book.titleId === 'spring' && localDate(back) > '2026-06-12'
          ? '2026-06-12'
          : localDate(back);
      onLoan.set(book.barcode, { readerId: reader.id, returnOn });
    }
    if (day === '2026-06-15') {
      await returnExchange(actor, spring.id, at(day, 15));
    }
  }
  console.log(`Loans: ${lent} since March, ${onLoan.size} out now.`);

  // A few copies with a story: damaged, missing and withdrawn (only ones on the shelf).
  // Only from titles with more copies, so every title still has one to lend.
  const perTitle = (titleId: string) => copies.filter((c) => c.titleId === titleId).length;
  const onShelf = copies.filter((c) => !onLoan.has(c.barcode) && perTitle(c.titleId) > 1);
  const [damaged, lost, withdrawn] = [onShelf[0], onShelf[3], onShelf[6]];
  if (damaged)
    await updateCopy(
      actor,
      damaged.barcode,
      { status: 'damaged', note: 'Kaft gescheurd' },
      at('2026-10-07'),
    );
  if (lost) await updateCopy(actor, lost.barcode, { status: 'lost' }, at('2026-10-09'));
  if (withdrawn)
    await updateCopy(
      actor,
      withdrawn.barcode,
      { status: 'withdrawn', note: 'Versleten' },
      at('2026-10-12'),
    );

  console.log(`Search index: ${await rebuildSearchIndex()} titles.`);
}

await main();
