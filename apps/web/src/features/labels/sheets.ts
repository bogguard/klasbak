/*
 * Label sheet layouts in millimetres on A4 (210 × 297 mm), from the manufacturers' templates.
 * Printers differ slightly, so the page offers a small offset adjustment; a test print on
 * plain paper held against a sheet shows whether it's needed.
 */

export type SheetLayout = {
  id: string;
  name: string;
  columns: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  marginLeft: number;
  marginTop: number;
  /** Distance from the start of one label to the start of the next. */
  pitchX: number;
  pitchY: number;
};

export const LABEL_SHEETS: SheetLayout[] = [
  {
    id: 'avery-l7651',
    name: 'Avery L7651',
    columns: 5,
    rows: 13,
    labelWidth: 38.1,
    labelHeight: 21.2,
    marginLeft: 4.7,
    marginTop: 10.7,
    pitchX: 40.6,
    pitchY: 21.2,
  },
  {
    id: 'avery-l7159',
    name: 'Avery L7159',
    columns: 3,
    rows: 8,
    labelWidth: 63.5,
    labelHeight: 33.9,
    marginLeft: 6.5,
    marginTop: 12.9,
    pitchX: 66.0,
    pitchY: 33.9,
  },
  {
    id: 'avery-l7160',
    name: 'Avery L7160',
    columns: 3,
    rows: 7,
    labelWidth: 63.5,
    labelHeight: 38.1,
    marginLeft: 7.2,
    marginTop: 15.1,
    pitchX: 66.0,
    pitchY: 38.1,
  },
  {
    id: 'zweckform-3474',
    name: 'Avery Zweckform 3474',
    columns: 3,
    rows: 8,
    labelWidth: 70,
    labelHeight: 37,
    marginLeft: 0,
    marginTop: 0.5,
    pitchX: 70,
    pitchY: 37,
  },
];

/** Reader cards: credit-card size, 10 per A4 sheet, cut out by hand. */
export const CARD_SHEET: SheetLayout = {
  id: 'cards',
  name: 'Cards',
  columns: 2,
  rows: 5,
  labelWidth: 85.6,
  labelHeight: 54,
  marginLeft: (210 - 2 * 85.6) / 2,
  marginTop: (297 - 5 * 54) / 2,
  pitchX: 85.6,
  pitchY: 54,
};

export type Position = { page: number; x: number; y: number };

/**
 * Where each of `count` labels goes. `startAt` (1-based) skips labels already used on a
 * partly used first sheet; `offset` shifts everything to correct for the printer.
 */
export function labelPositions(
  sheet: SheetLayout,
  count: number,
  startAt = 1,
  offset = { x: 0, y: 0 },
): Position[] {
  const perPage = sheet.columns * sheet.rows;
  const first = Math.min(Math.max(1, Math.floor(startAt)), perPage) - 1;
  return Array.from({ length: count }, (_, i) => {
    const slot = first + i;
    const onPage = slot % perPage;
    return {
      page: Math.floor(slot / perPage),
      x: sheet.marginLeft + (onPage % sheet.columns) * sheet.pitchX + offset.x,
      y: sheet.marginTop + Math.floor(onPage / sheet.columns) * sheet.pitchY + offset.y,
    };
  });
}
