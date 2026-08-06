import { randomUUID } from "node:crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export class PrivateObjectNotFoundError extends Error {
  constructor() {
    super("Private object not found");
    this.name = "PrivateObjectNotFoundError";
    Object.setPrototypeOf(this, PrivateObjectNotFoundError.prototype);
  }
}

export class PrivateObjectStorage {
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    return dir.replace(/\/+$/, "");
  }

  createObjectPath(organizationId: string): string {
    const safeOrganizationId = organizationId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!safeOrganizationId) throw new Error("organizationId is required.");
    return `/objects/uploads/${safeOrganizationId}/${randomUUID()}`;
  }

  private getStoragePath(objectPath: string): string {
    if (!objectPath.startsWith("/objects/uploads/")) {
      throw new Error("Invalid private object path.");
    }
    const relativePath = objectPath.slice("/objects/".length);
    return `${this.getPrivateObjectDir()}/${relativePath}`;
  }

  async createUploadUrl(objectPath: string): Promise<string> {
    return signObjectUrl({
      storagePath: this.getStoragePath(objectPath),
      method: "PUT",
      ttlSec: 900,
    });
  }

  async objectExists(objectPath: string): Promise<boolean> {
    const response = await fetch(
      await signObjectUrl({
        storagePath: this.getStoragePath(objectPath),
        method: "HEAD",
        ttlSec: 60,
      }),
      { method: "HEAD", signal: AbortSignal.timeout(30_000) },
    );
    return response.ok;
  }

  async createDownloadUrl(objectPath: string): Promise<string> {
    if (!(await this.objectExists(objectPath))) {
      throw new PrivateObjectNotFoundError();
    }
    return signObjectUrl({
      storagePath: this.getStoragePath(objectPath),
      method: "GET",
      ttlSec: 300,
    });
  }

  async deleteObject(objectPath: string): Promise<void> {
    const response = await fetch(
      await signObjectUrl({
        storagePath: this.getStoragePath(objectPath),
        method: "DELETE",
        ttlSec: 60,
      }),
      { method: "DELETE", signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete private object (${response.status}).`);
    }
  }
}

async function signObjectUrl({
  storagePath,
  method,
  ttlSec,
}: {
  storagePath: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const normalizedPath = storagePath.startsWith("/") ? storagePath : `/${storagePath}`;
  const parts = normalizedPath.split("/");
  if (parts.length < 3) throw new Error("Invalid object storage path.");

  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: parts[1],
      object_name: parts.slice(2).join("/"),
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to sign object storage URL (${response.status}).`);
  }

  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Storage did not return a signed URL.");
  return body.signed_url;
}

export const privateObjectStorage = new PrivateObjectStorage();