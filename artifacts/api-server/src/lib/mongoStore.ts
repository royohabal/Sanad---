import { randomUUID } from "node:crypto";
import { type Document } from "mongodb";
import type {
  AuditLog,
  Company,
  CompanyMember,
  Payout,
  Tip,
  Worker,
} from "@workspace/db";
import { getMongoDb, getMongoDatabaseName, verifyMongoConnection } from "./mongo";

type TipStatus = Tip["status"];
type PayoutStatus = Payout["status"];
type DateRange = { from: Date; to: Date };
export type TipCheckoutMetadata = {
  checkoutRequestId?: string;
  checkoutQuoteId?: string;
  usdAmountCents?: number;
  paymentCurrency?: "USD";
  kwdToUsdRate?: string;
  rateSource?: string;
  rateUpdatedAt?: Date;
  quotedAt?: Date;
};
export type StoredTip = Tip & TipCheckoutMetadata;
type TransactionRow = Pick<
  Tip,
  | "id"
  | "workerId"
  | "amountFils"
  | "currency"
  | "status"
  | "rating"
  | "createdAt"
  | "isDemo"
> & { workerName: string };
type PayoutRow = Pick<
  Payout,
  | "id"
  | "workerId"
  | "amountFils"
  | "month"
  | "status"
  | "recordedAt"
  | "note"
  | "isDemo"
> & { workerName: string };

function withoutMongoId<T>(value: Document): T {
  const { _id: _ignored, ...document } = value;
  return document as T;
}

function withMongoId<T extends { id: string }>(value: T): Document {
  return { ...value, _id: value.id };
}

async function collection(name: string) {
  return (await getMongoDb()).collection<Document>(name);
}

export async function initializeMongoStore(): Promise<{
  databaseName: string;
  collectionNames: string[];
}> {
  const connection = await verifyMongoConnection();
  const db = await getMongoDb();

  await Promise.all([
    db.collection("companies").createIndex({ id: 1 }, { unique: true }),
    db.collection("companyMembers").createIndex({ id: 1 }, { unique: true }),
    db.collection("companyMembers").createIndex(
      { companyId: 1, clerkUserId: 1 },
      { unique: true },
    ),
    db.collection("companyMembers").createIndex({ clerkUserId: 1 }),
    db.collection("workers").createIndex({ id: 1 }, { unique: true }),
    db.collection("workers").createIndex({ slug: 1 }, { unique: true }),
    db.collection("workers").createIndex(
      { clerkUserId: 1 },
      {
        unique: true,
        partialFilterExpression: { clerkUserId: { $type: "string" } },
      },
    ),
    db.collection("workers").createIndex(
      { phoneNumber: 1 },
      {
        unique: true,
        partialFilterExpression: { phoneNumber: { $type: "string" } },
      },
    ),
    db.collection("workers").createIndex({ companyId: 1 }),
    db.collection("workers").createIndex({ email: 1 }),
    db.collection("workerAuthSessions").createIndex({ id: 1 }, { unique: true }),
    db.collection("workerAuthSessions").createIndex(
      { tokenHash: 1 },
      { unique: true },
    ),
    db.collection("workerAuthSessions").createIndex({ workerId: 1 }),
    db.collection("workerAuthSessions").createIndex({ expiresAt: 1 }),
    db.collection("tips").createIndex({ id: 1 }, { unique: true }),
    db.collection("tips").createIndex({ reference: 1 }, { unique: true }),
    db.collection("tips").createIndex(
      { checkoutRequestId: 1 },
      {
        unique: true,
        partialFilterExpression: { checkoutRequestId: { $type: "string" } },
      },
    ),
    db.collection("tips").createIndex(
      { stripeCheckoutSessionId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          stripeCheckoutSessionId: { $type: "string" },
        },
      },
    ),
    db.collection("tips").createIndex({ workerId: 1, createdAt: 1 }),
    db.collection("tips").createIndex({ status: 1 }),
    db.collection("payouts").createIndex({ id: 1 }, { unique: true }),
    db.collection("payouts").createIndex({ companyId: 1, month: 1 }),
    db.collection("payouts").createIndex({ workerId: 1 }),
    db.collection("auditLogs").createIndex({ id: 1 }, { unique: true }),
    db.collection("auditLogs").createIndex({ companyId: 1, createdAt: 1 }),
  ]);

  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  return {
    databaseName: connection.databaseName || getMongoDatabaseName(),
    collectionNames: collections.map(({ name }) => name).sort(),
  };
}

export async function normalizeDemoWorkerNames(): Promise<number> {
  if (process.env.NODE_ENV === "production") return 0;

  const workersCollection = await collection("workers");
  const demoWorkers = await workersCollection
    .find({ isDemo: true })
    .project<{
      id: string;
      companyId: string;
      createdAt: Date;
      name: string;
      arabicName?: string | null;
    }>({ id: 1, companyId: 1, createdAt: 1, name: 1, arabicName: 1 })
    .sort({ companyId: 1, createdAt: 1, id: 1 })
    .toArray();
  const ordinalsByCompany = new Map<string, number>();
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  let renamed = 0;

  for (const worker of demoWorkers) {
    const ordinal = (ordinalsByCompany.get(worker.companyId) ?? 0) + 1;
    ordinalsByCompany.set(worker.companyId, ordinal);
    const arabicOrdinal = String(ordinal).replace(
      /\d/g,
      (digit) => arabicDigits[Number(digit)] ?? digit,
    );
    const name = `Worker No. ${ordinal}`;
    const arabicName = `الموظف رقم ${arabicOrdinal}`;

    if (worker.name === name && worker.arabicName === arabicName) continue;

    const result = await workersCollection.updateOne(
      { id: worker.id, isDemo: true },
      { $set: { name, arabicName, updatedAt: new Date() } },
    );
    renamed += result.modifiedCount;
  }

  return renamed;
}

export async function normalizeDemoCompanyTransactionSamples(): Promise<{
  addedWorkers: number;
  reassignedTips: number;
}> {
  if (process.env.NODE_ENV === "production") {
    return { addedWorkers: 0, reassignedTips: 0 };
  }

  const workersCollection = await collection("workers");
  const demoWorkers = await workersCollection
    .find({ isDemo: true })
    .project<{ id: string; companyId: string; createdAt: Date }>({
      id: 1,
      companyId: 1,
      createdAt: 1,
    })
    .sort({ companyId: 1, createdAt: 1, id: 1 })
    .toArray();
  const workersByCompany = new Map<string, typeof demoWorkers>();
  for (const worker of demoWorkers) {
    const companyWorkers = workersByCompany.get(worker.companyId) ?? [];
    companyWorkers.push(worker);
    workersByCompany.set(worker.companyId, companyWorkers);
  }

  let addedWorkers = 0;
  let reassignedTips = 0;
  const tipsCollection = await collection("tips");
  for (const [companyId, companyWorkers] of workersByCompany) {
    // The landing demo has one public worker; only company demo teams use a list.
    if (companyWorkers.length < 3) continue;

    while (companyWorkers.length < 6) {
      const ordinal = companyWorkers.length + 1;
      const id = randomUUID();
      const now = new Date();
      const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
      const arabicOrdinal = String(ordinal).replace(
        /\d/g,
        (digit) => arabicDigits[Number(digit)] ?? digit,
      );
      const worker = {
        id,
        companyId,
        clerkUserId: null,
        clerkInvitationId: null,
        slug: `worker-no-${ordinal}-${randomUUID().slice(0, 8)}`,
        name: `Worker No. ${ordinal}`,
        arabicName: `الموظف رقم ${arabicOrdinal}`,
        email: null,
        phoneNumber: null,
        workerPasswordHash: null,
        passwordChangeRequired: false,
        role: "Service team",
        branch: "Salmiya",
        photoUrl: null,
        status: "active",
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      };
      await workersCollection.insertOne(withMongoId(worker));
      companyWorkers.push({ id, companyId, createdAt: now });
      addedWorkers += 1;
    }

    companyWorkers.sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    const workerIds = companyWorkers.map(({ id }) => id);
    const recentDemoTips = await tipsCollection
      .find({ workerId: { $in: workerIds }, isDemo: true, status: "demo" })
      .sort({ createdAt: -1, id: 1 })
      .limit(6)
      .toArray();

    for (const [index, tip] of recentDemoTips.entries()) {
      const workerId = companyWorkers[index]?.id;
      if (!workerId || tip.workerId === workerId) continue;
      const result = await tipsCollection.updateOne(
        { id: tip.id, isDemo: true, status: "demo" },
        { $set: { workerId, updatedAt: new Date() } },
      );
      reassignedTips += result.modifiedCount;
    }
  }

  return { addedWorkers, reassignedTips };
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const document = await (await collection("companies")).findOne({ id });
  return document ? withoutMongoId<Company>(document) : null;
}

export async function getCompanyByNameAndDemo(
  name: string,
  isDemo: boolean,
): Promise<Company | null> {
  const document = await (await collection("companies")).findOne({ name, isDemo });
  return document ? withoutMongoId<Company>(document) : null;
}

export async function createCompany(
  input: Pick<Company, "name" | "registrationNumber" | "contactEmail" | "isDemo">,
): Promise<Company> {
  const now = new Date();
  const company: Company = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  await (await collection("companies")).insertOne(withMongoId(company));
  return company;
}

export async function updateCompany(
  id: string,
  changes: Partial<Pick<Company, "name" | "registrationNumber" | "contactEmail">>,
): Promise<Company | null> {
  const document = await (await collection("companies")).findOneAndUpdate(
    { id },
    { $set: { ...changes, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document ? withoutMongoId<Company>(document) : null;
}

export async function getCompanyMembership(
  clerkUserId: string,
): Promise<CompanyMember | null> {
  const document = await (await collection("companyMembers")).findOne({
    clerkUserId,
  });
  return document ? withoutMongoId<CompanyMember>(document) : null;
}

export async function createCompanyMembership(
  input: Pick<CompanyMember, "companyId" | "clerkUserId" | "email" | "role">,
): Promise<CompanyMember> {
  const member: CompanyMember = {
    id: randomUUID(),
    ...input,
    createdAt: new Date(),
  };
  await (await collection("companyMembers")).insertOne(withMongoId(member));
  return member;
}

export async function getWorkerById(id: string): Promise<Worker | null> {
  const document = await (await collection("workers")).findOne({ id });
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function getWorkerBySlug(slug: string): Promise<Worker | null> {
  const document = await (await collection("workers")).findOne({ slug });
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function getWorkerByPhone(phoneNumber: string): Promise<Worker | null> {
  const document = await (await collection("workers")).findOne({ phoneNumber });
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function getWorkerByClerkUserId(
  clerkUserId: string,
): Promise<Worker | null> {
  const document = await (await collection("workers")).findOne({ clerkUserId });
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function getWorkersByCompany(companyId: string): Promise<Worker[]> {
  const documents = await (await collection("workers"))
    .find({ companyId })
    .sort({ name: 1 })
    .toArray();
  return documents.map((document) => withoutMongoId<Worker>(document));
}

export async function createWorker(
  input: Omit<Worker, "createdAt" | "updatedAt">,
): Promise<Worker> {
  const now = new Date();
  const worker: Worker = { ...input, createdAt: now, updatedAt: now };
  await (await collection("workers")).insertOne(withMongoId(worker));
  return worker;
}

export async function updateWorker(
  id: string,
  changes: Partial<Worker>,
  extraFilter: Document = {},
): Promise<Worker | null> {
  const document = await (await collection("workers")).findOneAndUpdate(
    { id, ...extraFilter },
    { $set: { ...changes, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function linkInvitedWorker(
  id: string,
  clerkUserId: string,
): Promise<Worker | null> {
  const document = await (await collection("workers")).findOneAndUpdate(
    { id, clerkUserId: null, status: "invited" },
    { $set: { clerkUserId, status: "active", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document ? withoutMongoId<Worker>(document) : null;
}

export async function createWorkerAuthSession(
  session: {
    workerId: string;
    tokenHash: string;
    state: string;
    expiresAt: Date;
  },
): Promise<void> {
  const document = {
    id: randomUUID(),
    ...session,
    createdAt: new Date(),
  };
  await (await collection("workerAuthSessions")).insertOne(withMongoId(document));
}

export async function getWorkerAuthSessionByTokenHash(
  tokenHash: string,
): Promise<{ id: string; workerId: string; tokenHash: string; state: string; expiresAt: Date; createdAt: Date } | null> {
  const document = await (await collection("workerAuthSessions")).findOne({
    tokenHash,
  });
  return document
    ? withoutMongoId(document) as {
        id: string;
        workerId: string;
        tokenHash: string;
        state: string;
        expiresAt: Date;
        createdAt: Date;
      }
    : null;
}

export async function getWorkerAuthSessionById(
  id: string,
): Promise<{ id: string; workerId: string; tokenHash: string; state: string; expiresAt: Date; createdAt: Date } | null> {
  const document = await (await collection("workerAuthSessions")).findOne({ id });
  return document
    ? withoutMongoId(document) as {
        id: string;
        workerId: string;
        tokenHash: string;
        state: string;
        expiresAt: Date;
        createdAt: Date;
      }
    : null;
}

export async function deleteWorkerAuthSessionById(id: string): Promise<void> {
  await (await collection("workerAuthSessions")).deleteOne({ id });
}

export async function deleteWorkerAuthSessions(
  filter: { tokenHash?: string; workerId?: string; exceptId?: string },
): Promise<void> {
  const query: Document = {};
  if (filter.tokenHash) query.tokenHash = filter.tokenHash;
  if (filter.workerId) query.workerId = filter.workerId;
  if (filter.exceptId) query.id = { $ne: filter.exceptId };
  await (await collection("workerAuthSessions")).deleteMany(query);
}

export async function createTip(
  input: Omit<StoredTip, "createdAt" | "updatedAt"> & {
    createdAt?: Date;
    updatedAt?: Date;
  },
): Promise<StoredTip> {
  const now = new Date();
  const tip: StoredTip = {
    ...input,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  await (await collection("tips")).insertOne(withMongoId(tip));
  return tip;
}

export async function createTipIdempotently(
  input: Omit<StoredTip, "createdAt" | "updatedAt"> & {
    createdAt?: Date;
    updatedAt?: Date;
    checkoutRequestId: string;
  },
): Promise<StoredTip> {
  const tips = await collection("tips");
  const existing = await tips.findOne({
    checkoutRequestId: input.checkoutRequestId,
  });
  if (existing) return withoutMongoId<StoredTip>(existing);

  try {
    return await createTip(input);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      const duplicate = await tips.findOne({
        checkoutRequestId: input.checkoutRequestId,
      });
      if (duplicate) return withoutMongoId<StoredTip>(duplicate);
    }
    throw error;
  }
}

export async function getTipByCheckoutRequestId(
  checkoutRequestId: string,
): Promise<StoredTip | null> {
  const document = await (await collection("tips")).findOne({
    checkoutRequestId,
  });
  return document ? withoutMongoId<StoredTip>(document) : null;
}

export async function getTipById(id: string): Promise<StoredTip | null> {
  const document = await (await collection("tips")).findOne({ id });
  return document ? withoutMongoId<StoredTip>(document) : null;
}

export async function updateTip(
  id: string,
  changes: Partial<StoredTip>,
  extraFilter: Document = {},
): Promise<StoredTip | null> {
  const document = await (await collection("tips")).findOneAndUpdate(
    { id, ...extraFilter },
    { $set: { ...changes, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document ? withoutMongoId<StoredTip>(document) : null;
}

export async function getTipWithNames(id: string): Promise<
  (Pick<StoredTip, "id" | "workerId" | "status" | "amountFils" | "currency" | "isDemo" | "stripeCheckoutSessionId" | "checkoutQuoteId" | "usdAmountCents" | "paymentCurrency" | "kwdToUsdRate" | "rateSource" | "rateUpdatedAt"> & {
    workerName: string;
    companyName: string;
  }) | null
> {
  const tip = await getTipById(id);
  if (!tip) return null;
  const worker = await getWorkerById(tip.workerId);
  if (!worker) return null;
  const company = await getCompanyById(worker.companyId);
  if (!company) return null;
  return {
    id: tip.id,
    workerId: tip.workerId,
    status: tip.status,
    amountFils: tip.amountFils,
    currency: tip.currency,
    isDemo: tip.isDemo,
    stripeCheckoutSessionId: tip.stripeCheckoutSessionId,
    checkoutQuoteId: tip.checkoutQuoteId,
    usdAmountCents: tip.usdAmountCents,
    paymentCurrency: tip.paymentCurrency,
    kwdToUsdRate: tip.kwdToUsdRate,
    rateSource: tip.rateSource,
    rateUpdatedAt: tip.rateUpdatedAt,
    workerName: worker.name,
    companyName: company.name,
  };
}

export async function getPublicWorker(slug: string): Promise<
  (Pick<Worker, "id" | "slug" | "name" | "arabicName" | "role" | "branch" | "photoUrl"> & {
    companyName: string;
  }) | null
> {
  const worker = await getWorkerBySlug(slug);
  if (!worker || worker.status !== "active") return null;
  const company = await getCompanyById(worker.companyId);
  if (!company) return null;
  return {
    id: worker.id,
    slug: worker.slug,
    name: worker.name,
    arabicName: worker.arabicName,
    role: worker.role,
    branch: worker.branch,
    photoUrl: worker.photoUrl,
    companyName: company.name,
  };
}

export async function sumTipsForWorkers(
  workerIds: string[],
  statuses: readonly TipStatus[],
  range?: DateRange,
): Promise<number> {
  if (!workerIds.length) return 0;
  const match: Document = {
    workerId: { $in: workerIds },
    status: { $in: [...statuses] },
  };
  if (range) match.createdAt = { $gte: range.from, $lt: range.to };
  const results = await (await collection("tips"))
    .aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$amountFils" } } },
    ])
    .toArray();
  return Number(results[0]?.total ?? 0);
}

export async function sumPayoutsForWorkers(
  workerIds: string[],
  status?: PayoutStatus,
  month?: string,
): Promise<number> {
  if (!workerIds.length) return 0;
  const match: Document = { workerId: { $in: workerIds } };
  if (status) match.status = status;
  if (month) match.month = month;
  const results = await (await collection("payouts"))
    .aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$amountFils" } } },
    ])
    .toArray();
  return Number(results[0]?.total ?? 0);
}

export async function averageRatingForWorker(
  workerId: string,
  statuses: readonly TipStatus[],
): Promise<number | null> {
  const results = await (await collection("tips"))
    .aggregate<{ average: number | null }>([
      { $match: { workerId, status: { $in: [...statuses] } } },
      { $group: { _id: null, average: { $avg: "$rating" } } },
    ])
    .toArray();
  return results[0]?.average == null ? null : Number(results[0].average);
}

export async function monthlyTipsForWorker(
  workerId: string,
  statuses: readonly TipStatus[],
): Promise<Array<{ month: string; amountFils: number }>> {
  const results = await (await collection("tips"))
    .aggregate<{ _id: string; amountFils: number }>([
      { $match: { workerId, status: { $in: [...statuses] } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$createdAt",
              timezone: "Asia/Kuwait",
            },
          },
          amountFils: { $sum: "$amountFils" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return results.map((row) => ({ month: row._id, amountFils: Number(row.amountFils) }));
}

export async function monthlyTipsForCompany(
  companyId: string,
  statuses: readonly TipStatus[],
): Promise<Array<{ month: string; amountFils: number }>> {
  const workers = await getWorkersByCompany(companyId);
  const workerIds = workers.map(({ id }) => id);
  if (!workerIds.length) return [];
  const results = await (await collection("tips"))
    .aggregate<{ _id: string; amountFils: number }>([
      { $match: { workerId: { $in: workerIds }, status: { $in: [...statuses] } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$createdAt",
              timezone: "Asia/Kuwait",
            },
          },
          amountFils: { $sum: "$amountFils" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return results.map((row) => ({ month: row._id, amountFils: Number(row.amountFils) }));
}

export async function workerTransactionRows(
  workerId: string,
  limit?: number,
): Promise<TransactionRow[]> {
  const worker = await getWorkerById(workerId);
  if (!worker) return [];
  const cursor = (await collection("tips"))
    .find({ workerId })
    .sort({ createdAt: -1 });
  if (limit) cursor.limit(limit);
  const tips = await cursor.toArray();
  return tips.map((document) => {
    const tip = withoutMongoId<Tip>(document);
    return {
      id: tip.id,
      workerId: tip.workerId,
      workerName: worker.name,
      amountFils: tip.amountFils,
      currency: tip.currency,
      status: tip.status,
      rating: tip.rating,
      createdAt: tip.createdAt,
      isDemo: tip.isDemo,
    };
  });
}

export async function companyTransactionRows(
  companyId: string,
  limit = 1000,
): Promise<TransactionRow[]> {
  const workers = await getWorkersByCompany(companyId);
  if (!workers.length) return [];
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const tips = await (await collection("tips"))
    .find({ workerId: { $in: workers.map(({ id }) => id) } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return tips.flatMap((document) => {
    const tip = withoutMongoId<Tip>(document);
    const worker = workerById.get(tip.workerId);
    return worker
      ? [{
          id: tip.id,
          workerId: tip.workerId,
          workerName: worker.name,
          amountFils: tip.amountFils,
          currency: tip.currency,
          status: tip.status,
          rating: tip.rating,
          createdAt: tip.createdAt,
          isDemo: tip.isDemo,
        }]
      : [];
  });
}

export async function companyPayoutRows(
  companyId: string,
  workerIds?: string[],
): Promise<PayoutRow[]> {
  const match: Document = { companyId };
  if (workerIds) match.workerId = { $in: workerIds };
  const workers = await getWorkersByCompany(companyId);
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const payouts = await (await collection("payouts"))
    .find(match)
    .sort({ recordedAt: -1 })
    .toArray();
  return payouts.flatMap((document) => {
    const payout = withoutMongoId<Payout>(document);
    const worker = workerById.get(payout.workerId);
    return worker
      ? [{
          id: payout.id,
          workerId: payout.workerId,
          workerName: worker.name,
          amountFils: payout.amountFils,
          month: payout.month,
          status: payout.status,
          recordedAt: payout.recordedAt,
          note: payout.note,
          isDemo: payout.isDemo,
        }]
      : [];
  });
}

export async function workerPayoutRows(workerId: string): Promise<PayoutRow[]> {
  const worker = await getWorkerById(workerId);
  if (!worker) return [];
  const documents = await (await collection("payouts"))
    .find({ workerId })
    .sort({ recordedAt: -1 })
    .toArray();
  return documents.map((document) => {
    const payout = withoutMongoId<Payout>(document);
    return {
      id: payout.id,
      workerId: payout.workerId,
      workerName: worker.name,
      amountFils: payout.amountFils,
      month: payout.month,
      status: payout.status,
      recordedAt: payout.recordedAt,
      note: payout.note,
      isDemo: payout.isDemo,
    };
  });
}

export async function createPayout(
  input: Omit<Payout, "id" | "recordedAt">,
): Promise<Payout> {
  const payout: Payout = { id: randomUUID(), ...input, recordedAt: new Date() };
  await (await collection("payouts")).insertOne(withMongoId(payout));
  return payout;
}

export async function getPayoutById(id: string): Promise<Payout | null> {
  const document = await (await collection("payouts")).findOne({ id });
  return document ? withoutMongoId<Payout>(document) : null;
}

export async function updatePayoutStatus(
  id: string,
  companyId: string,
  status: PayoutStatus,
): Promise<Payout | null> {
  const document = await (await collection("payouts")).findOneAndUpdate(
    { id, companyId },
    { $set: { status } },
    { returnDocument: "after" },
  );
  return document ? withoutMongoId<Payout>(document) : null;
}

export async function writeAudit(
  companyId: string | null,
  actorClerkUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const audit: AuditLog = {
    id: randomUUID(),
    companyId,
    actorClerkUserId,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date(),
  };
  await (await collection("auditLogs")).insertOne(withMongoId(audit));
}
