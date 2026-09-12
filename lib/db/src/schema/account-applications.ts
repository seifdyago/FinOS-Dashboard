import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const accountApplications = pgTable("account_applications", {
  id: uuid("id").defaultRandom().primaryKey(),

  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone"),

  companyName: text("company_name").notNull(),
  companyDomain: text("company_domain"),
  industry: text("industry"),
  companySize: text("company_size"),

  requestedPlan: text("requested_plan").notNull().default("basic"),

  // Security verification data.
  verificationStatus: text("verification_status")
    .notNull()
    .default("pending_review"),
  verificationNotes: text("verification_notes"),

  // Store only a secure reference to an uploaded document.
  // Do not store passwords, access tokens, or raw sensitive credentials here.
  documentReference: text("document_reference"),
  documentType: text("document_type"),

  // Filled only after a security reviewer makes a decision.
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

  rejectionReason: text("rejection_reason"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAccountApplicationSchema =
  createInsertSchema(accountApplications);

export type InsertAccountApplication =
  typeof accountApplications.$inferInsert;

export type AccountApplication =
  typeof accountApplications.$inferSelect;
