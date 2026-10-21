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
 * weeks into the current school year, for demos and screenshots. Everything happens through the
 * services, dated in the past, so statistics, overdue lists, label queue and exchange
 * collections look like real use. The school's name and logo (Instellingen → Bibliotheek) are kept.
 * All names are made up. Never run against AWS: it refuses unless DynamoDB Local is used.
 *
 * The dates below are written for the school year 2026–2027 and moved to the current one (see
 * `on`), so the demo never looks old.
 */

if (!process.env.DYNAMODB_ENDPOINT?.includes('localhost')) {
  throw new Error('The demo data is for the local database only (DYNAMODB_ENDPOINT=localhost).');
}

const actor: Actor = { userId: 'demo', roles: ['admin'] };
// DEMO_TODAY=2027-05-20 shows the demo as on another day (to check it in every season).
const today = process.env.DEMO_TODAY ? new Date(`${process.env.DEMO_TODAY}T16:00:00Z`) : new Date();

// Whole school years between the one the dates are written for and the current one.
const [thisYear = 2026, thisMonth = 9] = localDate(today).split('-').map(Number);
const yearsLater = (thisMonth >= 9 ? thisYear : thisYear - 1) - 2026;

/** A date written for 2026–2027, moved to the same day of the current school year. */
const on = (date: string) => `${Number(date.slice(0, 4)) + yearsLater}${date.slice(4)}`;

/** A moment on a (real) day; moments still to come this school year happen today instead. */
const at = (day: string, hour = 10) => {
  const moment = new Date(`${day}T${String(hour - 2).padStart(2, '0')}:00:00Z`);
  return moment > today ? today : moment;
};

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

/*
 * Real books (title and author as the book databases give them), so the demo shows real
 * covers: with an ISBN, cover, publisher and year are looked up when the demo is loaded
 * (offline, the title and author below are used and the cover is generated). AVI levels and
 * ages are indicative, for the demo. Items without an ISBN have no author on purpose: no
 * made-up books are attributed to real people.
 */
const books: Book[] = [
  {
    isbn: '9789066921863',
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
    isbn: '9789020931976',
    title: 'Vos en haas',
    authors: ['Sylvia Vanden Heede'],
    aviLevel: 'M4',
    ageMin: 6,
    ageMax: 8,
    subjects: ['dieren', 'vriendschap'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 2B' }],
    added: '2025-09-12',
  },
  {
    isbn: '9789021432571',
    title: 'Jip en Janneke 2',
    authors: ['Annie M.G. Schmidt'],
    aviLevel: 'M3',
    ageMin: 4,
    ageMax: 7,
    subjects: ['voorlezen'],
    copies: [{ location: 'Prentenboeken' }],
    added: '2025-10-03',
  },
  {
    isbn: '9789060698181',
    title: 'Kruistocht in spijkerbroek',
    authors: ['Thea Beckman'],
    aviLevel: 'Plus',
    ageMin: 11,
    ageMax: 14,
    subjects: ['geschiedenis', 'tijdreizen'],
    copies: [{ location: 'Leesboeken' }],
    added: '2025-10-03',
  },
  {
    isbn: '9789025840631',
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
    isbn: '9789073991927',
    title: 'Nijntje',
    authors: ['Dick Bruna'],
    aviLevel: 'Start',
    ageMin: 2,
    ageMax: 5,
    subjects: ['voorlezen', 'dieren'],
    copies: [{ location: 'Prentenboeken' }, { location: 'Klasbib 1A' }],
    added: '2026-01-15',
  },
  {
    isbn: '9789060690888',
    title: 'Koning van Katoren',
    authors: ['Jan Terlouw'],
    aviLevel: 'Plus',
    ageMin: 10,
    ageMax: 14,
    subjects: ['avontuur'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-02-09',
  },
  {
    isbn: '9789026129582',
    title: 'Dagboek van een muts',
    authors: ['Rachel Renée Russell'],
    aviLevel: 'E7',
    ageMin: 10,
    ageMax: 13,
    subjects: ['humor', 'school'],
    copies: [{ location: 'Leesboeken' }, { location: 'Klasbib 6A' }],
    added: '2026-03-02',
  },
  {
    isbn: '9789047701170',
    title: 'Oorlogswinter',
    authors: ['Jan Terlouw'],
    aviLevel: 'Plus',
    ageMin: 11,
    ageMax: 14,
    subjects: ['oorlog', 'geschiedenis'],
    copies: [{ location: 'Klasbib 6A' }],
    added: '2026-04-20',
  },
  {
    isbn: '9789025866495',
    title: 'De brief voor de koning',
    authors: ['Tonke Dragt'],
    aviLevel: 'Plus',
    ageMin: 10,
    ageMax: 14,
    subjects: ['ridders', 'avontuur'],
    copies: [{ location: 'Leesboeken' }, {}],
    added: '2026-09-07',
  },
  {
    isbn: '9789066921467',
    title: 'Meester kikker',
    authors: ['Paul van Loon'],
    aviLevel: 'E5',
    ageMin: 7,
    ageMax: 10,
    subjects: ['school', 'humor'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-09-07',
  },
  {
    isbn: '9789061699767',
    title: 'Harry Potter en de steen der wijzen',
    authors: ['J.K. Rowling'],
    aviLevel: 'Plus',
    ageMin: 9,
    ageMax: 14,
    subjects: ['tovenarij', 'avontuur'],
    copies: [{ location: 'Leesboeken' }, { location: 'Leesboeken' }],
    added: '2026-09-14',
  },
  {
    isbn: '9789000327089',
    title: 'Dummie de mummie en de dans van de Cobra',
    authors: ['Tosca Menten'],
    aviLevel: 'E6',
    ageMin: 8,
    ageMax: 12,
    subjects: ['humor', 'griezelen'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-09-21',
  },
  {
    isbn: '9789045117652',
    title: 'Hoe overleef ik (zonder) dromen?',
    authors: ['Francine Oomen'],
    aviLevel: 'E7',
    ageMin: 10,
    ageMax: 13,
    subjects: ['vriendschap'],
    copies: [{ location: 'Leesboeken' }],
    added: '2026-10-05',
  },
  {
    isbn: '9780140328721',
    title: 'Fantastic Mr. Fox',
    authors: ['Roald Dahl'],
    language: 'en',
    ageMin: 8,
    ageMax: 12,
    subjects: ['dieren', 'Engels'],
    copies: [{ location: 'Engelse boeken' }],
    added: '2026-10-05',
  },
  {
    title: 'Alles over dinosaurussen',
    ageMin: 7,
    ageMax: 12,
    subjects: ['dinosaurussen', 'informatief'],
    copies: [{ location: 'Infoboeken' }],
    added: '2026-04-20',
  },
  {
    title: 'Onze planeten',
    ageMin: 8,
    ageMax: 12,
    subjects: ['ruimte', 'informatief'],
    copies: [{ location: 'Infoboeken' }],
    added: '2026-04-20',
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

/** Our data first (it's checked); the lookup adds publisher, year and the cover. */
async function withLookup(book: Partial<TitleInput>) {
  if (!book.isbn) return { input: book, coverUrl: undefined };
  const found = await lookupIsbn(book.isbn).catch(() => undefined);
  const { publisher, publishedYear, summary } = found?.title ?? {};
  return { input: { publisher, publishedYear, summary, ...book }, coverUrl: found?.coverUrl };
}

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
        { from: on('2026-10-26'), to: on('2026-11-01'), label: 'Herfstvakantie' },
        { from: on('2026-12-21'), to: on('2027-01-03'), label: 'Kerstvakantie' },
        { from: on('2027-02-15'), to: on('2027-02-21'), label: 'Krokusvakantie' },
        { from: on('2027-04-05'), to: on('2027-04-18'), label: 'Paasvakantie' },
      ],
    },
    0,
    at(on('2026-08-25')),
  );

  // Catalogue, with titles added over the last year (so "new titles" means something).
  const copies: Array<{ barcode: string; titleId: string }> = [];
  const titleIds = new Map<string, string>();
  let covers = 0;
  for (const book of books) {
    const { copies: copyInputs, added = '2026-09-01', ...title } = book;
    const { input, coverUrl } = await withLookup(title);
    const parsed = TitleInputSchema.parse({ type: 'book', ...input });
    const created = await createTitle(actor, parsed, coverUrl, at(on(added)));
    titleIds.set(parsed.title, created.id);
    if (created.coverImageKey) covers++;
    for (const copyInput of copyInputs) {
      const copy = await addCopy(actor, created.id, copyInput, at(on(added)));
      copies.push({ barcode: copy.barcode, titleId: created.id });
    }
  }
  // Labels printed, except the newest two (the print queue has something to show).
  await markLabelsPrinted(copies.slice(0, -2).map((c) => c.barcode));
  console.log(
    `Catalogue: ${books.length} titles, ${copies.length} copies (${covers} real covers).`,
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
      pupils.push(await createReader(actor, ReaderInputSchema.parse(input), at(on('2026-09-01'))));
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
        at(on('2026-09-01')),
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
    at(on('2026-09-01')),
  );
  console.log(
    `Readers: ${pupils.length} pupils in ${Object.keys(classes).length} classes, ${teachers.length} teachers, 1 inactive.`,
  );

  // An exchange collection that went back in June (with its list), and one from the autumn
  // (at school now, or back already after December).
  const spring = await createExchange(
    actor,
    {
      name: `Voorjaar ${on('2026-03-02').slice(0, 4)}`,
      lender: 'Bibliotheek Boekenstad',
      returnBy: on('2026-06-19'),
    },
    at(on('2026-03-02')),
  );
  // Spring: plain titles without authors (the saved list after returning is what matters).
  const springBooks = [
    'Op avontuur',
    'De kleine walvis',
    'Het onweer',
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
    at(on('2026-03-02')),
  );
  const autumn = await createExchange(
    actor,
    {
      name: `Najaar ${on('2026-09-15').slice(0, 4)}`,
      lender: 'Bibliotheek Boekenstad',
      returnBy: on('2026-12-18'),
    },
    at(on('2026-09-15')),
  );
  // Autumn: real books, two of which the school also owns (to show "Herkomst").
  const autumnRows = [];
  for (const book of [
    {
      isbn: '9789025748456',
      title: 'Mama kwijt',
      authors: ['Chris Haughton'],
      aviLevel: 'M3' as const,
    },
    {
      isbn: '9789051160413',
      title: 'Kleine ijsbeer en de walvisbaai',
      authors: ['Hans de Beer'],
      aviLevel: 'M4' as const,
    },
    {
      isbn: '9789000362462',
      title: 'Het nieuwe grote Superjuffie doeboek',
      authors: ['Janneke Schotveld'],
    },
  ]) {
    const { input, coverUrl } = await withLookup(book);
    autumnRows.push({ title: TitleInputSchema.parse({ type: 'book', ...input }), coverUrl });
  }
  const owned = ['Dolfje Weerwolfje', 'Nijntje'].flatMap((title) => {
    const titleId = titleIds.get(title);
    return titleId ? [{ titleId }] : [];
  });
  const autumnBooks = [...autumnRows, ...owned];
  await addExchangeBooks(
    actor,
    autumn.id,
    autumnBooks.map((book, i) => ({ barcode: `307000512${30 + i}`, ...book })),
    at(on('2026-09-15')),
  );
  const shelf = [
    ...copies,
    ...springBooks.map((_, i) => ({ barcode: `30700040${10 + i}`, titleId: 'spring' })),
    ...autumnBooks.map((_, i) => ({ barcode: `307000512${30 + i}`, titleId: 'autumn' })),
  ];

  // A history of lending: school days from March to today, returns after one to three weeks,
  // a few books forgotten lately (overdue now). Everything through the desk, dated in the past.
  const onLoan = new Map<string, { readerId: string; returnOn: string | null }>();
  const loansOf = new Map<string, number>();
  const settings = {
    closedWeekdays: DEFAULT_SETTINGS.closedWeekdays,
    closedPeriods: [
      { from: on('2026-04-06'), to: on('2026-04-19') },
      { from: on('2026-07-01'), to: on('2026-08-31') },
      { from: on('2026-10-26'), to: on('2026-11-01') },
      { from: on('2026-12-21'), to: on('2027-01-03') },
      { from: on('2027-02-15'), to: on('2027-02-21') },
      { from: on('2027-04-05'), to: on('2027-04-18') },
    ],
  };
  const days: string[] = [];
  for (
    let d = new Date(`${on('2026-03-02')}T12:00:00Z`);
    localDate(d) < localDate(today);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = localDate(d);
    if (!isClosed(day, settings)) days.push(day);
  }
  // Exchange books are lent while the collection is at school, all come back a few days before
  // it goes, and it goes on the first school day from its date (weekends move in other years).
  const exchanges = [
    {
      id: spring.id,
      tag: 'spring',
      from: on('2026-03-02'),
      lastLoan: on('2026-06-05'),
      allBack: on('2026-06-12'),
      goesBack: on('2026-06-15'),
    },
    {
      id: autumn.id,
      tag: 'autumn',
      from: on('2026-09-15'),
      lastLoan: on('2026-12-04'),
      allBack: on('2026-12-11'),
      goesBack: on('2026-12-14'),
    },
  ];
  const returned = new Set<string>();
  const exchangeOf = (titleId: string) => exchanges.find((e) => e.tag === titleId);
  const weeksAgo = (weeks: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 7 * weeks);
    return localDate(d);
  };
  // Lent four to eight weeks ago and never returned: overdue now, whatever today is.
  const forgetWindow = { from: weeksAgo(8), to: weeksAgo(4) };
  let lent = 0;
  for (const day of days) {
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
      const free = shelf.filter((c) => {
        const exchange = exchangeOf(c.titleId);
        return (
          !onLoan.has(c.barcode) &&
          (!exchange || (day >= exchange.from && day <= exchange.lastLoan))
        );
      });
      if (free.length === 0) continue;
      const book = pick(free);
      const result = await scan(actor, book.barcode, reader.id, at(day, 10));
      if (result.outcome !== 'checkedOut') continue;
      lent++;
      loansOf.set(reader.id, (loansOf.get(reader.id) ?? 0) + 1);
      const exchange = exchangeOf(book.titleId);
      // Most come back in time; some of the school's own books lent a month or two ago are
      // kept (overdue now). Not earlier, or the shelves would be full of forgotten books.
      const forgotten =
        !exchange && day >= forgetWindow.from && day <= forgetWindow.to && random() < 0.2;
      const back = new Date(`${day}T12:00:00Z`);
      back.setUTCDate(back.getUTCDate() + 7 + Math.floor(random() * 14));
      const returnOn = forgotten
        ? null
        : exchange && localDate(back) > exchange.allBack
          ? exchange.allBack
          : localDate(back);
      onLoan.set(book.barcode, { readerId: reader.id, returnOn });
    }
    for (const exchange of exchanges) {
      if (!returned.has(exchange.id) && day >= exchange.goesBack) {
        await returnExchange(actor, exchange.id, at(day, 15));
        returned.add(exchange.id);
      }
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
      at(on('2026-10-07')),
    );
  if (lost) await updateCopy(actor, lost.barcode, { status: 'lost' }, at(on('2026-10-09')));
  if (withdrawn)
    await updateCopy(
      actor,
      withdrawn.barcode,
      { status: 'withdrawn', note: 'Versleten' },
      at(on('2026-10-12')),
    );

  console.log(`Search index: ${await rebuildSearchIndex()} titles.`);
}

await main();
