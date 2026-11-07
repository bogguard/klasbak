import { isAssetOverdue, isInStock, SerialNumberSchema, type Asset } from '@klasbak/shared';

export type KindSummary = {
  kind: string;
  total: number;
  available: number;
  assigned: number;
  repair: number;
  lost: number;
};

/** What the school has, per kind, biggest first. Withdrawn items are no longer stock. */
export function summariseStock(assets: Asset[]): KindSummary[] {
  const kinds = new Map<string, KindSummary>();
  for (const asset of assets.filter(isInStock)) {
    const summary = kinds.get(asset.kind) ?? {
      kind: asset.kind,
      total: 0,
      available: 0,
      assigned: 0,
      repair: 0,
      lost: 0,
    };
    summary.total++;
    if (asset.status !== 'withdrawn') summary[asset.status]++;
    kinds.set(asset.kind, summary);
  }
  return [...kinds.values()].sort(
    (a, b) => b.total - a.total || a.kind.localeCompare(b.kind, 'nl'),
  );
}

/** The status filter: a status, "overdue", or empty for everything still in stock. */
export function matchesStatus(asset: Asset, filter: string, today: string): boolean {
  if (filter === 'overdue') return isAssetOverdue(asset, today);
  return filter ? asset.status === filter : isInStock(asset);
}

export function matchesSearch(asset: Asset, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('nl');
  if (!needle) return true;
  return [
    asset.kind,
    asset.name,
    asset.location,
    asset.barcode,
    asset.serialNumber,
    asset.holder?.readerName,
    asset.holder?.readerGroup,
  ].some((value) => value?.toLocaleLowerCase('nl').includes(needle));
}

/** The item a scanned or typed code stands for. */
export function findByCode(assets: Asset[], code: string): Asset | undefined {
  const needle = code.trim().toUpperCase();
  return assets.find((a) => a.barcode === needle || a.serialNumber === needle);
}

/** One serial number per line, as a scanner types them; commas and spaces work too. */
export function parseSerialNumbers(input: string): { serials: string[]; invalid: string[] } {
  const serials = new Set<string>();
  const invalid: string[] = [];
  for (const part of input.split(/[\s,;]+/).filter(Boolean)) {
    const parsed = SerialNumberSchema.safeParse(part);
    if (parsed.success) serials.add(parsed.data);
    else invalid.push(part);
  }
  return { serials: [...serials], invalid };
}

/** Distinct values for the suggestions in the form, on top of a few common ones. */
export function suggestions(values: Array<string | undefined>, common: string[] = []): string[] {
  const unique = new Set([...common, ...values.filter((v): v is string => Boolean(v))]);
  return [...unique].sort((a, b) => a.localeCompare(b, 'nl'));
}
