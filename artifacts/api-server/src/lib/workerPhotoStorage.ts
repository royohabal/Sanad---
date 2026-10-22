import { finished } from "node:stream/promises";
import { GridFSBucket, ObjectId } from "mongodb";
import { getMongoDb } from "./mongo";

const PHOTO_BUCKET = "workerPhotos";
export const MAX_WORKER_PHOTO_BYTES = 5 * 1024 * 1024;
export type WorkerPhotoContentType = "image/jpeg" | "image/png" | "image/webp";

const contentTypes: Record<WorkerPhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function detectWorkerPhotoContentType(
  bytes: Uint8Array,
): WorkerPhotoContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateWorkerPhoto(
  bytes: Uint8Array,
  declaredContentType: string | undefined,
):
  | { valid: true; contentType: WorkerPhotoContentType }
  | { valid: false; reason: "too-large" | "unsupported" } {
  if (bytes.length > MAX_WORKER_PHOTO_BYTES) {
    return { valid: false, reason: "too-large" };
  }
  const contentType = detectWorkerPhotoContentType(bytes);
  if (
    !contentType ||
    declaredContentType !== contentType ||
    bytes.length === 0
  ) {
    return { valid: false, reason: "unsupported" };
  }
  return { valid: true, contentType };
}

export function workerPhotoReference(fileId: string): string {
  return `gridfs:${fileId}`;
}

export function parseWorkerPhotoReference(reference?: string | null): string | null {
  if (!reference?.startsWith("gridfs:")) return null;
  const fileId = reference.slice("gridfs:".length);
  return ObjectId.isValid(fileId) && new ObjectId(fileId).toHexString() === fileId
    ? fileId
    : null;
}

export async function storeWorkerPhoto(
  workerId: string,
  bytes: Buffer,
  contentType: WorkerPhotoContentType,
): Promise<string> {
  const database = await getMongoDb();
  const bucket = new GridFSBucket(database, { bucketName: PHOTO_BUCKET });
  const fileId = new ObjectId();
  const extension = contentTypes[contentType];
  const stream = bucket.openUploadStreamWithId(
    fileId,
    `worker-${workerId}.${extension}`,
    {
      metadata: { workerId, kind: "worker-profile-photo", contentType },
    },
  );
  stream.end(bytes);
  await finished(stream);
  return fileId.toHexString();
}

export async function deleteWorkerPhoto(fileId: string): Promise<void> {
  if (!ObjectId.isValid(fileId)) return;
  const database = await getMongoDb();
  const bucket = new GridFSBucket(database, { bucketName: PHOTO_BUCKET });
  try {
    await bucket.delete(new ObjectId(fileId));
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 26) throw error;
  }
}

export async function getWorkerPhoto(
  fileId: string,
  workerId: string,
): Promise<{
  contentType: WorkerPhotoContentType;
  length: number;
  stream: ReturnType<GridFSBucket["openDownloadStream"]>;
} | null> {
  if (!ObjectId.isValid(fileId)) return null;
  const database = await getMongoDb();
  const objectId = new ObjectId(fileId);
  const file = await database
    .collection(`${PHOTO_BUCKET}.files`)
    .findOne({ _id: objectId, "metadata.workerId": workerId, "metadata.kind": "worker-profile-photo" });
  if (!file || typeof file.length !== "number") return null;
  const contentType = (file.metadata as { contentType?: unknown } | undefined)
    ?.contentType;
  if (
    contentType !== "image/jpeg" &&
    contentType !== "image/png" &&
    contentType !== "image/webp"
  ) {
    return null;
  }
  const bucket = new GridFSBucket(database, { bucketName: PHOTO_BUCKET });
  return {
    contentType,
    length: file.length,
    stream: bucket.openDownloadStream(objectId),
  };
}
