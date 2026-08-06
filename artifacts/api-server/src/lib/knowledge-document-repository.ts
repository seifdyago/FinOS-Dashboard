import { and, asc, eq } from "drizzle-orm";
import {
  db,
  employees,
  knowledgeDocuments,
  type KnowledgeDocumentRecord,
} from "@workspace/db";

export type CreateKnowledgeDocumentInput = {
  organizationId: string;
  employeeKey?: string | null;
  title: string;
  content: string;
  documentType?: string;
  source?: string;
};

export type KnowledgeDocumentRepository = {
  listByOrganizationId: (organizationId: string) => Promise<KnowledgeDocumentRecord[]>;
  listByEmployeeKey: (
    organizationId: string,
    employeeKey: string,
  ) => Promise<KnowledgeDocumentRecord[]>;
  findById: (
    organizationId: string,
    documentId: string,
  ) => Promise<KnowledgeDocumentRecord | undefined>;
  create: (input: CreateKnowledgeDocumentInput) => Promise<KnowledgeDocumentRecord>;
};

function requireValue(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

async function findEmployeeId(
  organizationId: string,
  employeeKey: string,
): Promise<string> {
  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, requireValue(organizationId, "organizationId")),
        eq(employees.employeeKey, requireValue(employeeKey, "employeeKey")),
      ),
    )
    .limit(1);

  if (!employee) {
    throw new Error("Employee does not belong to this organization.");
  }
  return employee.id;
}

export const knowledgeDocumentRepository: KnowledgeDocumentRepository = {
  async listByOrganizationId(organizationId) {
    const scopedOrganizationId = requireValue(organizationId, "organizationId");
    return db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.organizationId, scopedOrganizationId))
      .orderBy(asc(knowledgeDocuments.title));
  },

  async listByEmployeeKey(organizationId, employeeKey) {
    const scopedOrganizationId = requireValue(organizationId, "organizationId");
    const employeeId = await findEmployeeId(scopedOrganizationId, employeeKey);
    return db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, scopedOrganizationId),
          eq(knowledgeDocuments.employeeId, employeeId),
        ),
      )
      .orderBy(asc(knowledgeDocuments.title));
  },

  async findById(organizationId, documentId) {
    const scopedOrganizationId = requireValue(organizationId, "organizationId");
    const scopedDocumentId = requireValue(documentId, "documentId");
    const [document] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, scopedOrganizationId),
          eq(knowledgeDocuments.id, scopedDocumentId),
        ),
      )
      .limit(1);
    return document;
  },

  async create(input) {
    const organizationId = requireValue(input.organizationId, "organizationId");
    const title = requireValue(input.title, "title");
    const content = requireValue(input.content, "content");
    const employeeId = input.employeeKey
      ? await findEmployeeId(organizationId, input.employeeKey)
      : null;

    const [document] = await db
      .insert(knowledgeDocuments)
      .values({
        organizationId,
        employeeId,
        title,
        content,
        documentType: input.documentType?.trim() || "document",
        source: input.source?.trim() || "workspace",
      })
      .returning();

    return document;
  },
};