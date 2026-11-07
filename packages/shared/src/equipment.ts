import { z } from 'zod';
import { CodeSchema, text } from './catalog';
import type { Reader } from './readers';

/*
 * Materiaal (decision 039): the school's stock of Chromebooks, tablets, chargers and the like.
 * Every item is counted on its own: it has a label, and can be traced to a place or a person.
 */

/** "assigned" follows from handing out and taking back; the others are set by hand. */
export const ASSET_STATUSES = ['available', 'assigned', 'repair', 'lost', 'withdrawn'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_MANUAL_STATUSES = ['available', 'repair', 'lost', 'withdrawn'] as const;
const ManualStatusSchema = z.enum(ASSET_MANUAL_STATUSES);

/** A first choice in the form; schools type any other kind they have. */
export const COMMON_ASSET_KINDS = ['Chromebook', 'Laptop', 'Tablet', 'Oplader', 'Projector'];

/** How many items one form may add at once; a bigger delivery goes in a few rounds. */
export const ASSET_BATCH_MAX = 200;

const IsoDateSchema = z.iso.date();

/**
 * A serial number is scanned as well as typed, so it follows the rules of codes. Uppercase, so
 * a typed "5cd1234" finds the sticker's "5CD1234".
 */
export const SerialNumberSchema = CodeSchema.toUpperCase();

/** The fields one item has in common with the others of a delivery. */
const AssetDetailsSchema = z.object({
  kind: text(40),
  name: text(100),
  location: text(100).optional(),
  note: z.string().trim().normalize('NFC').max(500).optional(),
  purchasedOn: IsoDateSchema.optional(),
  warrantyUntil: IsoDateSchema.optional(),
});

/** One or more new items: one per serial number, or `quantity` items without one. */
export const CreateAssetsRequestSchema = z
  .object({
    details: AssetDetailsSchema.strict(),
    serialNumbers: z.array(SerialNumberSchema).max(ASSET_BATCH_MAX).default([]),
    quantity: z.number().int().min(1).max(ASSET_BATCH_MAX).optional(),
  })
  .strict()
  .refine((r) => r.serialNumbers.length > 0 !== (r.quantity !== undefined), {
    message: 'Give serial numbers or a quantity',
    path: ['quantity'],
  });
export type CreateAssetsRequest = z.infer<typeof CreateAssetsRequestSchema>;

export const AssetInputSchema = AssetDetailsSchema.extend({
  serialNumber: SerialNumberSchema.optional(),
  /** Left out while the item is with someone: only taking it back changes that. */
  status: ManualStatusSchema.optional(),
}).strict();
export type AssetInput = z.infer<typeof AssetInputSchema>;

export const UpdateAssetRequestSchema = z
  .object({ asset: AssetInputSchema, version: z.number().int().min(1) })
  .strict();

export const AssignAssetRequestSchema = z
  .object({ readerId: z.string(), dueDate: IsoDateSchema.optional() })
  .strict();

export const ReturnAssetRequestSchema = z
  .object({ status: ManualStatusSchema.exclude(['withdrawn']).default('available') })
  .strict();

export const MarkAssetLabelsPrintedRequestSchema = z
  .object({ ids: z.array(z.string()).min(1).max(ASSET_BATCH_MAX) })
  .strict();

/** Who has an item now. Snapshots, like a loan's, so the stock list needs no reader lookups. */
export type AssetHolder = {
  assignmentId: string;
  readerId: string;
  readerName: string;
  readerGroup?: string;
  since: string;
  dueDate?: string;
};

export type Asset = Omit<AssetInput, 'status'> & {
  id: string;
  /** Our own label; the serial number is a second code that finds the same item. */
  barcode: string;
  status: AssetStatus;
  holder?: AssetHolder;
  /** Set once the label was printed; until then it waits on the label page. */
  labelPrintedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

/** An item handed to a reader: personal data, removed like a loan after the retention period. */
export type Assignment = {
  id: string;
  assetId: string;
  assetName: string;
  barcode: string;
  readerId: string;
  readerName: string;
  readerGroup?: string;
  assignedAt: string;
  dueDate?: string;
  returnedAt?: string;
};

export type AssetDetail = { asset: Asset; history: Assignment[] };

/** What happened to one line of the form: a known serial number is never added twice. */
export type CreateAssetResult =
  { status: 'created'; asset: Asset } | { status: 'duplicate'; serialNumber: string };

/** A reader to hand something to: no more than the person handing it out needs to see. */
export type AssetRecipient = Pick<
  Reader,
  'id' | 'firstName' | 'lastName' | 'group' | 'memberNumber' | 'category'
>;

export function isAssetOverdue(asset: Pick<Asset, 'holder'>, today: string): boolean {
  return Boolean(asset.holder?.dueDate && asset.holder.dueDate < today);
}

/** Withdrawn items left the school: they no longer count as stock. */
export function isInStock(asset: Pick<Asset, 'status'>): boolean {
  return asset.status !== 'withdrawn';
}
