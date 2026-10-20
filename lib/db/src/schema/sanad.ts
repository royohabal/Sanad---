import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const workerStatusEnum = pgEnum("sanad_worker_status", [
  "active",
  "inactive",
  "invited",
]);
export const tipStatusEnum = pgEnum("sanad_tip_status", [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "demo",
]);
export const payoutStatusEnum = pgEnum("sanad_payout_status", [
  "pending",
  "paid",
]);

export const companiesTable = pgTable("sanad_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  registrationNumber: text("registration_number"),
  contactEmail: text("contact_email"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const companyMembersTable = pgTable(
  "sanad_company_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    role: text("role").notNull().default("company_admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sanad_company_members_company_user_idx").on(
      table.companyId,
      table.clerkUserId,
    ),
    index("sanad_company_members_user_idx").on(table.clerkUserId),
  ],
);

export const workersTable = pgTable(
  "sanad_workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id"),
    clerkInvitationId: text("clerk_invitation_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    arabicName: text("arabic_name"),
    email: text("email"),
    role: text("role").notNull(),
    branch: text("branch"),
    photoUrl: text("photo_url"),
    status: workerStatusEnum("status").notNull().default("active"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("sanad_workers_slug_idx").on(table.slug),
    uniqueIndex("sanad_workers_clerk_user_idx").on(table.clerkUserId),
    index("sanad_workers_company_idx").on(table.companyId),
    index("sanad_workers_email_idx").on(table.email),
  ],
);

export const tipsTable = pgTable(
  "sanad_tips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "restrict" }),
    amountFils: integer("amount_fils").notNull(),
    processorFeeFils: integer("processor_fee_fils").notNull().default(0),
    refundedAmountFils: integer("refunded_amount_fils").notNull().default(0),
    currency: text("currency").notNull().default("KWD"),
    status: tipStatusEnum("status").notNull().default("pending"),
    rating: integer("rating"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("sanad_tips_reference_idx").on(table.reference),
    uniqueIndex("sanad_tips_checkout_session_idx").on(
      table.stripeCheckoutSessionId,
    ),
    index("sanad_tips_worker_created_idx").on(table.workerId, table.createdAt),
    index("sanad_tips_status_idx").on(table.status),
  ],
);

export const payoutsTable = pgTable(
  "sanad_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workersTable.id, { onDelete: "restrict" }),
    amountFils: integer("amount_fils").notNull(),
    month: text("month").notNull(),
    status: payoutStatusEnum("status").notNull().default("pending"),
    note: text("note"),
    recordedByClerkUserId: text("recorded_by_clerk_user_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (table) => [
    index("sanad_payouts_company_month_idx").on(table.companyId, table.month),
    index("sanad_payouts_worker_idx").on(table.workerId),
  ],
);

export const auditLogsTable = pgTable(
  "sanad_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companiesTable.id, {
      onDelete: "set null",
    }),
    actorClerkUserId: text("actor_clerk_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sanad_audit_logs_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  ],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertWorkerSchema = createInsertSchema(workersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTipSchema = createInsertSchema(tipsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({
  id: true,
  recordedAt: true,
});

export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type CompanyMember = typeof companyMembersTable.$inferSelect;
export type Worker = typeof workersTable.$inferSelect;
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Tip = typeof tipsTable.$inferSelect;
export type InsertTip = z.infer<typeof insertTipSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
