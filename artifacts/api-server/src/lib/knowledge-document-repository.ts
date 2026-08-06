import { and, asc, eq, isNotNull } from "drizzle-orm";
import {
  db,
  employees,
  knowledgeDocuments,
  users,
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

export const SUPPORTED_KNOWLEDGE_FILE_TYPES = [
  "pdf",
  "docx",
  "csv",
  "xlsx",
  "xls",
  "text",
] as const;

export type KnowledgeFileType = (typeof SUPPORTED_KNOWLEDGE_FILE_TYPES)[number];

export type CreateKnowledgeFileInput = {
  organizationId: string;
  uploadedByUserId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string | null;
  employeeKey?: string | null;
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
  createFileMetadata: (input: CreateKnowledgeFileInput) => Promise<KnowledgeDocumentRecord>;
  listFilesByOrganizationId: (organizationId: string) => Promise<KnowledgeDocumentRecord[]>;
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

async function requireOrganizationUser(
  organizationId: string,
  userId: string,
): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, requireValue(organizationId, "organizationId")),
        eq(users.id, requireValue(userId, "uploadedByUserId")),
      ),
    )
    .limit(1);

  if (!user) {
    throw new Error("Uploader does not belong to this organization.");
  }
  return user.id;
}

export function inferKnowledgeFileType(fileName: string, mimeType: string): KnowledgeFileType {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (
    extension === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return "docx";
  if (extension === "csv" || mimeType === "text/csv") return "csv";
  if (
    extension === "xlsx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) return "xlsx";
  if (extension === "xls" || mimeType === "application/vnd.ms-excel") return "xls";
  if (extension === "txt" || mimeType === "text/plain") return "text";
  throw new Error("Unsupported knowledge file type. Supported types: PDF, DOCX, CSV, Excel, and text.");
}

export function validateKnowledgeFileMetadata(input: {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
}): KnowledgeFileType {
  requireValue(input.originalFileName, "originalFileName");
  const mimeType = requireValue(input.mimeType, "mimeType").toLowerCase();
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("sizeBytes must be a positive integer.");
  }
  return inferKnowledgeFileType(input.originalFileName, mimeType);
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

  async listFilesByOrganizationId(organizationId) {
    const scopedOrganizationId = requireValue(organizationId, "organizationId");
    return db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.organizationId, scopedOrganizationId),
          isNotNull(knowledgeDocuments.originalFileName),
        ),
      )
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

  async createFileMetadata(input) {
    const organizationId = requireValue(input.organizationId, "organizationId");
    const uploadedByUserId = await requireOrganizationUser(
      organizationId,
      input.uploadedByUserId,
    );
    const originalFileName = requireValue(input.originalFileName, "originalFileName");
    const mimeType = requireValue(input.mimeType, "mimeType").toLowerCase();
    const fileType = validateKnowledgeFileMetadata({
      originalFileName,
      mimeType,
      sizeBytes: input.sizeBytes,
    });
    const employeeId = input.employeeKey
      ? await findEmployeeId(organizationId, input.employeeKey)
      : null;

    const [document] = await db
      .insert(knowledgeDocuments)
      .values({
        organizationId,
        employeeId,
        uploadedByUserId,
        title: originalFileName,
        content: null,
        documentType: "file",
        source: input.source?.trim() || "company-upload",
        originalFileName,
        fileType,
        mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey?.trim() || null,
      })
      .returning();

    return document;
  },
};