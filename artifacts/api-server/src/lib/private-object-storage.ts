import { issueSignedToken, presignUrl } from "@vercel/blob";
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
    const response = await fetch(
      await this.createSignedUrl(objectPath, "HEAD"),
      { method: "HEAD", signal: AbortSignal.timeout(30_000) },
    );
    return response.ok;
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
    const signedToken = await issueSignedToken({
      pathname,
      operations: [operation],
      validUntil,
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
