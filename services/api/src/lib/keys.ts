/*
 * Single-table key design (docs/decisions.md 004 and 011). Every item type is listed here,
 * so the whole data model can be read in one place.
 *
 *   Title         pk TITLE#<titleId>    sk TITLE
 *   Copy          pk TITLE#<titleId>    sk COPY#<copyId>  gsi1 while its label isn't printed:
 *                                                         LABELS#PENDING / <barcode>
 *   Code pointer  pk CODE#<code>        sk CODE          { kind: 'copy', titleId, copyId }
 *                                                        { kind: 'reader', readerId }
 *                 One namespace for book barcodes and reader cards: a scanned code always
 *                 means exactly one thing, and uniqueness is a conditional put.
 *   Reader        pk READER#<readerId>  sk READER        gsi1: READERS / <group>#<name>#<id>
 *   Loan          pk READER#<readerId>  sk LOAN#<loanId> gsi1 while active: LOANS#ACTIVE / <dueDate>#<loanId>
 *   Settings      pk SETTINGS           sk LIBRARY
 *   Branding      pk SETTINGS           sk BRANDING      name and logo, also published as a file
 *   Counter       pk COUNTER            sk <name>        last generated number
 *   Audit         pk AUDIT#<entity>     sk <timestamp>#<ulid>   (expires via TTL)
 */

export const titleKey = (titleId: string) => ({ pk: `TITLE#${titleId}`, sk: 'TITLE' });

export const copyKey = (titleId: string, copyId: string) => ({
  pk: `TITLE#${titleId}`,
  sk: `COPY#${copyId}`,
});

export const codeKey = (code: string) => ({ pk: `CODE#${code}`, sk: 'CODE' });

export const readerKey = (readerId: string) => ({ pk: `READER#${readerId}`, sk: 'READER' });

export const loanKey = (readerId: string, loanId: string) => ({
  pk: `READER#${readerId}`,
  sk: `LOAN#${loanId}`,
});

export const settingsKey = { pk: 'SETTINGS', sk: 'LIBRARY' };
export const brandingKey = { pk: 'SETTINGS', sk: 'BRANDING' };

export const READERS_INDEX_PK = 'READERS';
export const ACTIVE_LOANS_INDEX_PK = 'LOANS#ACTIVE';
export const PENDING_LABELS_INDEX_PK = 'LABELS#PENDING';
export const GSI1 = 'gsi1';

export type CodePointer =
  { kind: 'copy'; titleId: string; copyId: string } | { kind: 'reader'; readerId: string };
