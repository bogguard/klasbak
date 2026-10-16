import type { Copy, Title } from './catalog';
import type { LibrarySettings, Loan } from './circulation';
import type { Reader } from './readers';

/** One record of the full data export (Instellingen → Gegevens exporteren). */
export type ExportRecord =
  | { kind: 'title'; data: Title }
  | { kind: 'copy'; data: Copy }
  | { kind: 'reader'; data: Reader }
  | { kind: 'loan'; data: Loan }
  | { kind: 'settings'; data: LibrarySettings };

/** The export comes in pages; `next` is passed back to get the following page. */
export type ExportPage = { records: ExportRecord[]; next?: string };
