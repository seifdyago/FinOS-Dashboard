import { createInsertSchema } from "drizzle-zod";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { users } from "./users.js";

export const workspaceRecords = pgTable(
  "workspace_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationTypeIdUnique: uniqueIndex("workspace_records_organization_type_id_unique").on(table.organizationId, table.recordType, table.recordId),
    organizationTypeIndex: index("workspace_records_organization_type_index").on(table.organizationId, table.recordType),
    updatedAtIndex: index("workspace_records_updated_at_index").on(table.updatedAt),
  }),
);

export const insertWorkspaceRecordSchema = createInsertSchema(workspaceRecords);
export type InsertWorkspaceRecord = typeof workspaceRecords.$inferInsert;
export type WorkspaceRecord = typeof workspaceRecords.$inferSelect;
