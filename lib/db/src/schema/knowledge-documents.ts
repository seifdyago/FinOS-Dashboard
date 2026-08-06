import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { employees } from "./employees";
import { users } from "./users";

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content"),
    documentType: text("document_type").notNull().default("document"),
    source: text("source").notNull().default("workspace"),
    originalFileName: text("original_file_name"),
    fileType: text("file_type"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationIndex: index("knowledge_documents_organization_id_index").on(table.organizationId),
    employeeIndex: index("knowledge_documents_employee_id_index").on(table.employeeId),
    uploadedByUserIndex: index("knowledge_documents_uploaded_by_user_id_index").on(table.uploadedByUserId),
    organizationDocumentUnique: uniqueIndex("knowledge_documents_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
  }),
);

export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments);
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeDocumentRecord = typeof knowledgeDocuments.$inferSelect;