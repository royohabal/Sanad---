import { pool } from "@workspace/db";
import type { Document } from "mongodb";
import { closeMongoConnection, getMongoDb, getMongoDatabaseName } from "../src/lib/mongo.js";
import { initializeMongoStore } from "../src/lib/mongoStore.js";

const TABLES = [
  ["sanad_companies", "companies"],
  ["sanad_company_members", "companyMembers"],
  ["sanad_workers", "workers"],
  ["sanad_worker_auth_sessions", "workerAuthSessions"],
  ["sanad_tips", "tips"],
  ["sanad_payouts", "payouts"],
  ["sanad_audit_logs", "auditLogs"],
] as const;

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "_id")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("Development PostgreSQL connection is not configured.");
  }

  await initializeMongoStore();
  const mongo = await getMongoDb();
  const collections = new Map<string, Array<Record<string, unknown>>>();

  for (const [table, collectionName] of TABLES) {
    const source = await pool.query(`SELECT * FROM ${table}`);
    const records = source.rows.map((row: Record<string, unknown>) => {
      const record = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [toCamelCase(key), value]),
      );
      if (typeof record.id !== "string") {
        throw new Error(`Source table ${table} contains a row without a string id.`);
      }
      return record;
    });
    collections.set(collectionName, records);
  }

  // Preflight every collection before writing. Existing Mongo documents are
  // retained; a conflicting record stops the copy rather than overwriting it.
  const pending = new Map<string, Array<Record<string, unknown>>>();
  for (const [collectionName, records] of collections) {
    const target = mongo.collection<Document & { _id: string }>(collectionName);
    const missing: Array<Record<string, unknown>> = [];
    for (const record of records) {
      const current = await target.findOne({ id: record.id });
      if (!current) {
        missing.push(record);
      } else if (!sameRecord(record, current)) {
        throw new Error(
          `Migration stopped: conflicting record found in ${collectionName}.`,
        );
      }
    }
    pending.set(collectionName, missing);
  }

  for (const [collectionName, records] of pending) {
    if (!records.length) continue;
    await mongo.collection<Document & { _id: string }>(collectionName).insertMany(
      records.map((record) => ({ ...record, _id: record.id }) as Document & { _id: string }),
      { ordered: true },
    );
  }

  const report: Record<string, number> = {};
  for (const [collectionName, records] of collections) {
    const target = mongo.collection<Document & { _id: string }>(collectionName);
    const targetCount = await target.countDocuments({});
    if (targetCount !== records.length) {
      throw new Error(`Verification failed for ${collectionName}.`);
    }
    for (const record of records) {
      const copied = await target.findOne({ id: record.id });
      if (!copied || !sameRecord(record, copied)) {
        throw new Error(`Verification failed for ${collectionName}.`);
      }
    }
    report[collectionName] = targetCount;
  }

  console.log(
    JSON.stringify({
      status: "verified",
      databaseName: getMongoDatabaseName(),
      copiedRecordCounts: report,
    }),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.all([pool.end(), closeMongoConnection()]);
}
