import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWorkerPhotoContentType,
  parseWorkerPhotoReference,
  validateWorkerPhoto,
  workerPhotoReference,
} from "./workerPhotoStorage";

test("detects supported image formats from their file signatures", () => {
  assert.equal(
    detectWorkerPhotoContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    detectWorkerPhotoContentType(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectWorkerPhotoContentType(
      Buffer.from("RIFF0000WEBP"),
    ),
    "image/webp",
  );
});

test("rejects unsupported or incomplete image signatures", () => {
  assert.equal(detectWorkerPhotoContentType(Buffer.from([0xff, 0xd8])), null);
  assert.equal(detectWorkerPhotoContentType(Buffer.from("not an image")), null);
});

test("round-trips safe GridFS photo references", () => {
  const fileId = "64b7f37c2c4c1a3f4a7d8e90";
  assert.equal(parseWorkerPhotoReference(workerPhotoReference(fileId)), fileId);
  assert.equal(parseWorkerPhotoReference("gridfs:not-an-id"), null);
  assert.equal(parseWorkerPhotoReference("https://images.example/photo.jpg"), null);
});

test("requires a matching image signature and enforces the 5 MB limit", () => {
  assert.deepEqual(
    validateWorkerPhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"),
    { valid: true, contentType: "image/jpeg" },
  );
  assert.deepEqual(
    validateWorkerPhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/png"),
    { valid: false, reason: "unsupported" },
  );
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  oversized.set([0xff, 0xd8, 0xff]);
  assert.deepEqual(validateWorkerPhoto(oversized, "image/jpeg"), {
    valid: false,
    reason: "too-large",
  });
});
