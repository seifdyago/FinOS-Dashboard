import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    role: text("role").notNull().default("member"),
    authSubject: text("auth_subject"),
    status: text("status").notNull().default("active"),
    timezone: text("timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationEmailUnique: uniqueIndex("users_organization_email_unique").on(
      table.organizationId,
      table.email,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;