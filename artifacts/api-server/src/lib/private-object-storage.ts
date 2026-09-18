import { head, issueSignedToken, presignUrl } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const MAX_IDENTITY_DOCUMENT_BYTES = 10 * 1024 * 1024;
const IDENTITY_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/octet-stream",
];

export function validateIdentityDocumentMetadata(input: {
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!input.originalFileName.trim()) {
    throw new Error("originalFileName is required.");
  }
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!IDENTITY_DOCUMENT_CONTENT_TYPES.includes(mimeType)) {
    throw new Error("Unsupported identity document type.");
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("sizeBytes must be a positive integer.");
  }
  if (input.sizeBytes > MAX_IDENTITY_DOCUMENT_BYTES) {
    throw new Error("Identity document is too large.");
  }
}

type StorageMethod = "PUT" | "HEAD" | "GET" | "DELETE";

export class PrivateObjectNotFoundError extends Error {
  constructor() {
    super("Private object not found");
    this.name = "PrivateObjectNotFoundError";
    Object.setPrototypeOf(this, PrivateObjectNotFoundError.prototype);
  }
}

export class PrivateObjectStorage {
  createObjectPath(organizationId: string): string {
    const safeOrganizationId = organizationId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!safeOrganizationId) throw new Error("organizationId is required.");
    return `/objects/uploads/${safeOrganizationId}/${randomUUID()}`;
  }

  createOnboardingObjectPath(): string {
    return `/objects/uploads/onboarding/${randomUUID()}`;
  }

  async createUploadUrl(objectPath: string): Promise<string> {
    return this.createSignedUrl(objectPath, "PUT");
  }

  async objectExists(objectPath: string): Promise<boolean> {
    const pathname = toBlobPath(objectPath);
    const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
    const storeId = process.env.BLOB_STORE_ID?.trim();
    const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const retryDelaysMs = [0, 150, 350, 700, 1_200];

    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        await head(pathname, {
          ...(oidcToken && storeId
            ? { oidcToken, storeId }
            : readWriteToken
              ? { token: readWriteToken }
              : {}),
          abortSignal: AbortSignal.timeout(30_000),
        });
        return true;
      } catch {
        // A successful PUT can take a short interval to become visible to HEAD.
      }
    }
    return false;
  }

  async createDownloadUrl(objectPath: string): Promise<string> {
    if (!(await this.objectExists(objectPath))) {
      throw new PrivateObjectNotFoundError();
    }
    return this.createSignedUrl(objectPath, "GET");
  }

  async deleteObject(objectPath: string): Promise<void> {
    const response = await fetch(
      await this.createSignedUrl(objectPath, "DELETE"),
      { method: "DELETE", signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete private object (${response.status}).`);
    }
  }

  private async createSignedUrl(objectPath: string, method: StorageMethod): Promise<string> {
    const pathname = toBlobPath(objectPath);
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const operation = method.toLowerCase() as "put" | "head" | "get" | "delete";
    const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
    const storeId = process.env.BLOB_STORE_ID?.trim();
    const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const signedToken = await issueSignedToken({
      pathname,
      operations: [operation],
      validUntil,
      ...(oidcToken && storeId
        ? { oidcToken, storeId }
        : readWriteToken
          ? { token: readWriteToken }
          : {}),
      ...(operation === "put"
        ? {
            allowedContentTypes: IDENTITY_DOCUMENT_CONTENT_TYPES,
            maximumSizeInBytes: MAX_IDENTITY_DOCUMENT_BYTES,
          }
        : {}),
    });

    const { presignedUrl } = await presignUrl(signedToken, {
      access: "private",
      pathname,
      operation,
      validUntil: signedToken.validUntil,
      ...(operation === "put"
        ? {
            allowedContentTypes: IDENTITY_DOCUMENT_CONTENT_TYPES,
            maximumSizeInBytes: MAX_IDENTITY_DOCUMENT_BYTES,
            allowOverwrite: false,
          }
        : {}),
    } as Parameters<typeof presignUrl>[1]);

    return presignedUrl;
  }
}

function toBlobPath(objectPath: string): string {
  const pathname = objectPath.trim().replace(/^\/+/, "");
  if (!pathname.startsWith("objects/uploads/") || pathname.endsWith("/")) {
    throw new Error("Invalid private object path.");
  }
  return pathname;
}

export const privateObjectStorage = new PrivateObjectStorage();
