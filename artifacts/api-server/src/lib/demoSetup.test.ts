import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { demoRecords, setupCompanyDemoData, DemoSetupConflict } from "./demoSetup";

function fakeDatabase(initial: Record<string, Record<string, unknown>[]> = {}) {
  const data = new Map(Object.entries(initial).map(([key, rows]) => [key, structuredClone(rows)]));
  const matches = (row: Record<string, unknown>, query: Record<string, unknown>) =>
    Object.entries(query).every(([key, value]) => value && typeof value === "object" && "$in" in value
      ? (value.$in as unknown[]).includes(row[key]) : row[key] === value);
  const db = {
    collection(name: string) {
      if (!data.has(name)) data.set(name, []);
      const rows = data.get(name)!;
      return {
        find: (query: Record<string, unknown>) => ({ toArray: async () => rows.filter(row => matches(row, query)) }),
        findOne: async (query: Record<string, unknown>) => rows.find(row => matches(row, query)) ?? null,
        bulkWrite: async (operations: { updateOne: { filter: Record<string, unknown>; update: { $setOnInsert: Record<string, unknown> } } }[]) => {
          for (const { updateOne: { filter, update } } of operations) {
            if (rows.some(row => matches(row, filter))) continue;
            if (rows.some(row => row.id === update.$setOnInsert.id)) throw new Error("Duplicate key");
            rows.push(structuredClone(update.$setOnInsert));
          }
        },
      };
    },
  } as unknown as Db;
  return { db, data };
}

test("demo records are deterministic, labeled, and cannot represent a Stripe charge", () => {
  const first = demoRecords("company-a", "owner", new Date("2026-10-23T12:00:00Z"));
  const second = demoRecords("company-a", "owner", new Date("2026-11-23T12:00:00Z"));
  assert.deepEqual(first.workers.map(row => row.id), second.workers.map(row => row.id));
  assert.equal(first.workers.length, 6);
  assert.ok(first.workers.every(row => row.isDemo && row.phoneNumber === null && row.workerPasswordHash === null));
  assert.ok(first.tips.every(row => row.isDemo && row.status === "demo" &&
    row.stripeCheckoutSessionId === null && row.stripePaymentIntentId === null));
  assert.ok(first.payouts.every(row => row.isDemo));
});

test("explicit setup is insert-only and idempotent, including partial retries", async () => {
  const records = demoRecords("company-a", "owner");
  const { db, data } = fakeDatabase({ workers: [records.workers[0]!] });
  await setupCompanyDemoData("company-a", "owner", db);
  const snapshot = structuredClone([...data]);
  await setupCompanyDemoData("company-a", "owner", db);
  assert.deepEqual([...data], snapshot);
  assert.equal(data.get("workers")!.length, 6);
  assert.equal(data.get("tips")!.length, 36);
  assert.equal(data.get("payouts")!.length, 2);
});

test("real workers and conflicting records are not modified", async () => {
  const { db, data } = fakeDatabase({ workers: [{ id: "real", companyId: "company-a", isDemo: false }] });
  const snapshot = structuredClone([...data]);
  await assert.rejects(setupCompanyDemoData("company-a", "owner", db), DemoSetupConflict);
  assert.deepEqual([...data], snapshot);
  const collision = demoRecords("company-a", "owner").workers[0]!;
  const other = fakeDatabase({ workers: [{ ...collision, companyId: "different", isDemo: false }] });
  await assert.rejects(setupCompanyDemoData("company-a", "owner", other.db), DemoSetupConflict);
  assert.equal(other.data.get("tips"), undefined);
});

test("legacy demo teams are reused without adding duplicate workers or tips", async () => {
  const { db, data } = fakeDatabase({ workers: [{ id: "legacy", companyId: "company-a", isDemo: true }] });
  const result = await setupCompanyDemoData("company-a", "owner", db);
  assert.equal(result.alreadyConfigured, true);
  assert.equal(data.get("workers")!.length, 1);
  assert.equal(data.get("tips"), undefined);
});
