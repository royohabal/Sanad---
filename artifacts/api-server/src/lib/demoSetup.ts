import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { getMongoDb } from "./mongo";

export class DemoSetupConflict extends Error {}

export function demoRecordId(companyId: string, key: string): string {
  const hex = createHash("sha256").update(`sanad-demo:${companyId}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function demoRecords(companyId: string, actorId: string, now = new Date()) {
  const arabicDigits = ["١", "٢", "٣", "٤", "٥", "٦"];
  const workers = Array.from({ length: 6 }, (_, index) => {
    const id = demoRecordId(companyId, `worker-${index + 1}`);
    return {
      _id: id, id, companyId, clerkUserId: null, clerkInvitationId: null,
      slug: `demo-worker-${index + 1}-${id.slice(0, 8)}`,
      name: `Demo worker ${index + 1}`, arabicName: `موظف تجريبي ${arabicDigits[index]}`,
      email: null, phoneNumber: null, workerPasswordHash: null, passwordChangeRequired: false,
      role: ["Service host", "Barista", "Guest services"][index % 3]!,
      branch: index % 2 ? "Sharq" : "Salmiya", photoUrl: null,
      status: "active", isDemo: true, createdAt: now, updatedAt: now,
    };
  });
  const tips = workers.flatMap((worker, workerIndex) =>
    [500, 1000, 750, 1500, 250, 1000].map((amountFils, index) => {
      const id = demoRecordId(companyId, `tip-${workerIndex + 1}-${index + 1}`);
      return {
        _id: id, id, reference: `demo_setup_${id}`, workerId: worker.id,
        amountFils, processorFeeFils: 0, refundedAmountFils: 0, currency: "KWD",
        status: "demo", rating: index % 2 ? 5 : 4, isDemo: true,
        stripeCheckoutSessionId: null, stripePaymentIntentId: null,
        createdAt: new Date(now.getTime() - (index * 4 + workerIndex) * 86400000),
        updatedAt: now,
      };
    }),
  );
  const monthParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const month = `${monthParts.find(p => p.type === "year")!.value}-${monthParts.find(p => p.type === "month")!.value}`;
  const payouts = workers.slice(0, 2).map((worker, index) => {
    const id = demoRecordId(companyId, `payout-${index + 1}`);
    return {
      _id: id, id, companyId, workerId: worker.id, amountFils: index ? 1000 : 2000,
      month, status: index ? "pending" : "paid", note: "Demo payroll record — no money sent",
      recordedByClerkUserId: actorId, recordedAt: now, isDemo: true,
    };
  });
  return { workers, tips, payouts };
}

// Deliberately not called at startup or by a public GET. All writes are insert-only.
export async function setupCompanyDemoData(companyId: string, actorId: string, database?: Db) {
  const db = database ?? await getMongoDb();
  const existing = await db.collection<Document>("workers").find({ companyId }).toArray();
  if (existing.some(worker => worker.isDemo !== true)) {
    throw new DemoSetupConflict("Demo setup is available only in a workspace without real workers.");
  }
  const records = demoRecords(companyId, actorId);
  const expectedIds = new Set(records.workers.map(worker => worker.id));
  // Existing development demo teams are already usable; never add a second team.
  if (existing.some(worker => !expectedIds.has(worker.id))) {
    return { workerCount: existing.length, alreadyConfigured: true };
  }
  const groups = [
    ["workers", records.workers],
    ["tips", records.tips],
    ["payouts", records.payouts],
  ] as const;
  // Batch round trips so explicit setup fits Vercel's serverless request budget.
  // Validate every collision before inserting anything. Never adopt a real record.
  for (const [name, documents] of groups) {
    const matches = await db.collection<Document>(name)
      .find({ id: { $in: documents.map(document => document.id) } }).toArray();
    for (const document of documents) {
      const match = matches.find(row => row.id === document.id);
      if (match && (match.isDemo !== true ||
        (name === "workers" ? match.companyId !== companyId : "workerId" in document && match.workerId !== document.workerId))) {
        throw new DemoSetupConflict("An existing record conflicts with demo setup. Nothing was overwritten.");
      }
    }
  }
  const slugOwners = await db.collection<Document>("workers")
    .find({ slug: { $in: records.workers.map(worker => worker.slug) } }).toArray();
  if (slugOwners.some(owner => records.workers.find(worker => worker.slug === owner.slug)?.id !== owner.id)) {
    throw new DemoSetupConflict("A demo URL is already in use. Nothing was overwritten.");
  }
  for (const [name, documents] of groups) {
    await db.collection<Document>(name).bulkWrite(documents.map(document => ({
      updateOne: {
        filter: { id: document.id, isDemo: true },
        update: { $setOnInsert: document },
        upsert: true,
      },
    })));
  }
  return { workerCount: records.workers.length, alreadyConfigured: existing.length === records.workers.length };
}
