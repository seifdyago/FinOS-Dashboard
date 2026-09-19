import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

export const paymentDeposits = pgTable("payment_deposits", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  plan: text("plan").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method").notNull(),
  transferReference: text("transfer_reference").notNull(),
  receiptReference: text("receipt_reference").notNull(),
  receiptType: text("receipt_type").notNull(),
  status: text("status").notNull().default("pending_review"),
  reviewNotes: text("review_notes"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentDepositSchema = createInsertSchema(paymentDeposits);
export type InsertPaymentDeposit = typeof paymentDeposits.$inferInsert;
export type PaymentDeposit = typeof paymentDeposits.$inferSelect;
