import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const departments = pgTable(
  "departments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationNameUnique: uniqueIndex("departments_organization_name_unique").on(
      table.organizationId,
      table.name,
    ),
  }),
);

export const insertDepartmentSchema = createInsertSchema(departments);
export type InsertDepartment = typeof departments.$inferInsert;
export type Department = typeof departments.$inferSelect;