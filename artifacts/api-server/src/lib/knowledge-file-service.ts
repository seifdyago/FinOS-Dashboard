import { and, eq } from "drizzle-orm";
import {
  db,
  employees,
  knowledgeDocuments,
  users,
} from "@workspace/db";
import {
  knowledgeDocumentRepository,
  validateKnowledgeFileMetadata,
} from "./knowledge-document-repository";
import {
  canManageKnowledgeDocument,
  canUploadKnowledgeFile,
  type KnowledgeFileEmployee,
  type KnowledgeFileUploader,
} from "./knowledge-document-access";
import { privateObjectStorage } from "./private-object-storage";
import { subscriptionRepository } from "./subscription-repository";
import type { User } from "@workspace/db";

export type KnowledgeFileListItem = {
  id: string;
  originalFileName: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedByUserId: string | null;
  uploaderName: string;
  createdAt: Date;
  employeeId: string | null;
  employeeName: string | null;
  status: string;
};

function uploaderFromUser(user: User): KnowledgeFileUploader {
  return {
    id: user.id,
    organizationId: user.organizationId,
    status: user.status,
    role: user.role,
  };
}

async function employeeForKey(organizationId: string, employeeKey?: string | null): Promise<KnowledgeFileEmployee | undefined> {
  if (!employeeKey?.trim()) return undefined;
  const [employee] = await db
    .select({
      organizationId: employees.organizationId,
      employeeKey: employees.employeeKey,
      role: employees.role,
      department: employees.department,
      permissions: employees.permissions,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.employeeKey, employeeKey.trim())))
    .limit(1);
  if (!employee) throw new Error("Selected AI employee does not belong to this organization.");
  return employee;
}

async function requireUploadAccess(user: User, employeeKey?: string | null) {
  const subscription = await subscriptionRepository.findByOrganizationId(user.organizationId);
  const employee = await employeeForKey(user.organizationId, employeeKey);
  if (!canUploadKnowledgeFile(subscription, uploaderFromUser(user), employee)) {
    throw new Error("Your subscription or workspace permissions do not allow knowledge file uploads.");
  }
  return { subscription, employee };
}

export async function requestKnowledgeFileUpload(
  user: User,
  input: { originalFileName: string; mimeType: string; sizeBytes: number; employeeKey?: string | null },
) {
  await requireUploadAccess(user, input.employeeKey);
  validateKnowledgeFileMetadata(input);
  const objectPath = privateObjectStorage.createObjectPath(user.organizationId);
  const uploadUrl = await privateObjectStorage.createUploadUrl(objectPath);
  return { uploadUrl, objectPath };
}

export async function finalizeKnowledgeFile(
  user: User,
  input: {
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    objectPath: string;
    employeeKey?: string | null;
  },
) {
  await requireUploadAccess(user, input.employeeKey);
  validateKnowledgeFileMetadata(input);
  const expectedPrefix = `/objects/uploads/${user.organizationId.replace(/[^a-zA-Z0-9_-]/g, "_")}/`;
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("Storage object does not belong to this organization.");
  }
  if (!(await privateObjectStorage.objectExists(input.objectPath))) {
    throw new Error("Uploaded file was not found in private storage.");
  }
  return knowledgeDocumentRepository.createFileMetadata({
    organizationId: user.organizationId,
    uploadedByUserId: user.id,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storageKey: input.objectPath,
    employeeKey: input.employeeKey,
  });
}

export async function listKnowledgeFiles(user: User): Promise<KnowledgeFileListItem[]> {
  const rows = await db
    .select({
      document: knowledgeDocuments,
      uploaderName: users.name,
      employeeName: employees.name,
    })
    .from(knowledgeDocuments)
    .leftJoin(users, eq(knowledgeDocuments.uploadedByUserId, users.id))
    .leftJoin(employees, eq(knowledgeDocuments.employeeId, employees.id))
    .where(and(eq(knowledgeDocuments.organizationId, user.organizationId), eq(knowledgeDocuments.documentType, "file")));

  return rows.map(({ document, uploaderName, employeeName }) => ({
    id: document.id,
    originalFileName: document.originalFileName ?? document.title,
    fileType: document.fileType ?? "unknown",
    mimeType: document.mimeType ?? "application/octet-stream",
    sizeBytes: document.sizeBytes ?? 0,
    storageKey: document.storageKey ?? "",
    uploadedByUserId: document.uploadedByUserId,
    uploaderName: uploaderName ?? "Former workspace user",
    createdAt: document.createdAt,
    employeeId: document.employeeId,
    employeeName: employeeName ?? null,
    status: document.status,
  }));
}

export async function deleteKnowledgeFile(user: User, documentId: string): Promise<void> {
  const [document] = await db
    .select()
    .from(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.organizationId, user.organizationId), eq(knowledgeDocuments.id, documentId)))
    .limit(1);
  if (!document || document.documentType !== "file") throw new Error("Knowledge file not found.");

  const subscription = await subscriptionRepository.findByOrganizationId(user.organizationId);
  const employee = document.employeeId
    ? await employeeForId(user.organizationId, document.employeeId)
    : undefined;
  const uploader = uploaderFromUser(user);
  const isAdmin = user.role.trim().toLowerCase() === "workspace admin";
  if (
    !canUploadKnowledgeFile(subscription, uploader, employee) ||
    (!isAdmin &&
      (!employee ||
        !canManageKnowledgeDocument(subscription, employee, user.organizationId, document)))
  ) {
    throw new Error("You do not have permission to delete this knowledge file.");
  }

  if (document.storageKey) await privateObjectStorage.deleteObject(document.storageKey);
  await db.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.organizationId, user.organizationId), eq(knowledgeDocuments.id, documentId)));
}

export async function getKnowledgeFileDownloadUrl(user: User, documentId: string): Promise<string> {
  const [document] = await db
    .select()
    .from(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.organizationId, user.organizationId), eq(knowledgeDocuments.id, documentId)))
    .limit(1);
  if (!document || document.documentType !== "file" || !document.storageKey) throw new Error("Knowledge file not found.");
  const subscription = await subscriptionRepository.findByOrganizationId(user.organizationId);
  const employee = document.employeeId
    ? await employeeForId(user.organizationId, document.employeeId)
    : undefined;
  const isAdmin = user.role.trim().toLowerCase() === "workspace admin";
  if (
    !canUploadKnowledgeFile(subscription, uploaderFromUser(user), employee) ||
    (!isAdmin &&
      (!employee ||
        !canManageKnowledgeDocument(subscription, employee, user.organizationId, document)))
  ) {
    throw new Error("You do not have permission to access this knowledge file.");
  }
  return privateObjectStorage.createDownloadUrl(document.storageKey);
}

async function employeeForId(organizationId: string, employeeId: string): Promise<KnowledgeFileEmployee | undefined> {
  const [employee] = await db
    .select({
      organizationId: employees.organizationId,
      employeeKey: employees.employeeKey,
      role: employees.role,
      department: employees.department,
      permissions: employees.permissions,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
    .limit(1);
  return employee;
}