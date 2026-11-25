import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { Photo, PhotoDay, PhotoTarget } from '@klasbak/shared';
import { db, env } from '../lib/aws';
import { failedConditionAt, getItem, queryAll, stripKeys, type Item } from '../lib/dynamo';
import {
  classPhotosIndexPk,
  GSI1,
  PHOTO_DAYS_INDEX_PK,
  photoCodeKey,
  photoDayKey,
  photoKey,
  photoPupilKey,
  pupilPhotosIndexPk,
} from '../lib/keys';

/** A pupil's entry on a photo day, as stored. */
export type PhotoPupilItem = { readerId: string; noPhoto?: boolean; code?: string };
export type PhotoCodePointer = { photoDayId: string; readerId: string };

/** Where a photo is listed: per pupil or per class, so a parent's photos are one query. */
function ownerIndexPk(photo: Photo): string | undefined {
  if (photo.kind === 'class' && photo.group)
    return classPhotosIndexPk(photo.photoDayId, photo.group);
  if (photo.readerId) return pupilPhotosIndexPk(photo.photoDayId, photo.readerId);
  return undefined;
}

function photoItem(photo: Photo): Item {
  const indexPk = ownerIndexPk(photo);
  return {
    ...photoKey(photo.photoDayId, photo.id),
    ...photo,
    ...(indexPk ? { gsi1pk: indexPk, gsi1sk: photo.id } : {}),
  };
}

// ---------------------------------------------------------------- Photo days

export function getPhotoDay(dayId: string): Promise<PhotoDay | undefined> {
  return getItem<PhotoDay>(photoDayKey(dayId));
}

/** Every photo day, the deleted ones included (the nightly job still has to remove them). */
export async function listPhotoDays(): Promise<PhotoDay[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': PHOTO_DAYS_INDEX_PK },
    ScanIndexForward: false,
  });
  return items.map((item) => stripKeys<PhotoDay>(item));
}

export async function putPhotoDay(day: PhotoDay, audit: Item, isNew: boolean): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: {
              ...photoDayKey(day.id),
              ...day,
              gsi1pk: PHOTO_DAYS_INDEX_PK,
              gsi1sk: day.id,
            },
            ConditionExpression: isNew ? 'attribute_not_exists(pk)' : 'attribute_exists(pk)',
          },
        },
        { Put: { TableName: env.tableName, Item: audit } },
      ],
    }),
  );
}

/** Everything in a photo day's partition: the day, its photos and its pupils. */
export async function photoDayContents(dayId: string): Promise<{
  photos: Photo[];
  pupils: PhotoPupilItem[];
}> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': photoDayKey(dayId).pk },
  });
  const photos: Photo[] = [];
  const pupils: PhotoPupilItem[] = [];
  for (const item of items) {
    const sk = String(item.sk);
    if (sk.startsWith('PHOTO#')) photos.push(stripKeys<Photo>(item));
    else if (sk.startsWith('PUPIL#')) pupils.push(stripKeys<PhotoPupilItem>(item));
  }
  return { photos, pupils };
}

/**
 * Removes a photo day's items and its code pointers. The day item goes last, so an
 * interrupted run is picked up again by the next one.
 */
export async function deletePhotoDayItems(dayId: string): Promise<void> {
  const items = await queryAll({
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': photoDayKey(dayId).pk },
  });
  const keys: { pk: string; sk: string }[] = [];
  for (const item of items) {
    if (item.sk === 'PHOTODAY') continue;
    keys.push({ pk: String(item.pk), sk: String(item.sk) });
    if (typeof item.code === 'string') keys.push(photoCodeKey(item.code));
  }
  await batchDelete(keys);
  await db.send(new DeleteCommand({ TableName: env.tableName, Key: photoDayKey(dayId) }));
}

async function batchDelete(keys: { pk: string; sk: string }[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 25) {
    let pending = keys.slice(start, start + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      const result = await db.send(
        new BatchWriteCommand({ RequestItems: { [env.tableName]: pending } }),
      );
      pending = (result.UnprocessedItems?.[env.tableName] ?? []) as typeof pending;
    }
    if (pending.length > 0) throw new Error('DynamoDB kept returning unprocessed items');
  }
}

/** For changes that span many items, like making all codes: one entry for the whole action. */
export async function putAudit(audit: Item): Promise<void> {
  await db.send(new PutCommand({ TableName: env.tableName, Item: audit }));
}

// ---------------------------------------------------------------- Photos

export function getPhoto(dayId: string, photoId: string): Promise<Photo | undefined> {
  return getItem<Photo>(photoKey(dayId, photoId));
}

/** Stores a newly uploaded photo. False when it was registered before (a retried request). */
export async function putNewPhoto(photo: Photo): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: env.tableName,
        Item: photoItem(photo),
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

/** Gives a photo to another pupil or class, or to nobody. False when it was just deleted. */
export async function movePhoto(photo: Photo, target: PhotoTarget): Promise<Photo | undefined> {
  const { readerId: _reader, group: _group, ...rest } = photo;
  const moved: Photo = {
    ...rest,
    kind: target.group ? 'class' : 'portrait',
    ...(target.readerId ? { readerId: target.readerId } : {}),
    ...(target.group ? { group: target.group } : {}),
  };
  try {
    await db.send(
      new PutCommand({
        TableName: env.tableName,
        Item: photoItem(moved),
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );
    return moved;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return undefined;
    throw error;
  }
}

export async function deletePhoto(photo: Photo, audit: Item): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: env.tableName, Key: photoKey(photo.photoDayId, photo.id) } },
        { Put: { TableName: env.tableName, Item: audit } },
      ],
    }),
  );
}

/** A pupil's portraits on a photo day. */
export async function pupilPhotos(dayId: string, readerId: string): Promise<Photo[]> {
  return queryIndex(pupilPhotosIndexPk(dayId, readerId));
}

export async function classPhotos(dayId: string, group: string): Promise<Photo[]> {
  return queryIndex(classPhotosIndexPk(dayId, group));
}

async function queryIndex(pk: string): Promise<Photo[]> {
  const items = await queryAll({
    IndexName: GSI1,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: { ':pk': pk },
  });
  return items.map((item) => stripKeys<Photo>(item));
}

// ---------------------------------------------------------------- Pupils and codes

export function getPhotoPupil(
  dayId: string,
  readerId: string,
): Promise<PhotoPupilItem | undefined> {
  return getItem<PhotoPupilItem>(photoPupilKey(dayId, readerId));
}

export async function setNoPhoto(
  dayId: string,
  readerId: string,
  noPhoto: boolean,
  audit: Item,
): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: photoPupilKey(dayId, readerId),
            UpdateExpression: noPhoto
              ? 'SET readerId = :readerId, noPhoto = :true'
              : 'SET readerId = :readerId REMOVE noPhoto',
            ExpressionAttributeValues: {
              ':readerId': readerId,
              ...(noPhoto ? { ':true': true } : {}),
            },
          },
        },
        { Put: { TableName: env.tableName, Item: audit } },
      ],
    }),
  );
}

/**
 * Gives a pupil a download code, replacing `previous` if given. False when the code is
 * already taken (by another pupil: draw again) or the pupil got a code meanwhile.
 */
export async function putCode(
  dayId: string,
  readerId: string,
  code: string,
  previous: string | undefined,
): Promise<boolean> {
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: env.tableName,
              Item: { ...photoCodeKey(code), photoDayId: dayId, readerId },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: env.tableName,
              Key: photoPupilKey(dayId, readerId),
              UpdateExpression: 'SET readerId = :readerId, code = :code',
              ConditionExpression: previous ? 'code = :previous' : 'attribute_not_exists(code)',
              ExpressionAttributeValues: {
                ':readerId': readerId,
                ':code': code,
                ...(previous ? { ':previous': previous } : {}),
              },
            },
          },
          ...(previous
            ? [{ Delete: { TableName: env.tableName, Key: photoCodeKey(previous) } }]
            : []),
        ],
      }),
    );
    return true;
  } catch (error) {
    if (failedConditionAt(error, 0) || failedConditionAt(error, 1)) return false;
    throw error;
  }
}

export async function removeCode(dayId: string, readerId: string, code: string): Promise<void> {
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: env.tableName, Key: photoCodeKey(code) } },
        {
          Update: {
            TableName: env.tableName,
            Key: photoPupilKey(dayId, readerId),
            UpdateExpression: 'REMOVE code',
          },
        },
      ],
    }),
  );
}

export function getCodePointer(code: string): Promise<PhotoCodePointer | undefined> {
  return getItem<PhotoCodePointer>(photoCodeKey(code));
}

/** Everything of one pupil on a photo day: their portraits, their entry and their code. */
export async function deletePupilFromDay(dayId: string, readerId: string): Promise<Photo[]> {
  const [photos, pupil] = await Promise.all([
    pupilPhotos(dayId, readerId),
    getPhotoPupil(dayId, readerId),
  ]);
  await batchDelete([
    ...photos.map((photo) => photoKey(dayId, photo.id)),
    photoPupilKey(dayId, readerId),
    ...(pupil?.code ? [photoCodeKey(pupil.code)] : []),
  ]);
  return photos;
}
