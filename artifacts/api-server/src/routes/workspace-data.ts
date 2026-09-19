import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, workspaceRecords } from "@workspace/db";
import { AUTH_SESSION_COOKIE, getAuthenticatedUser } from "../lib/auth-session";

const router: IRouter = Router();
const allowedRecordTypes = new Set([
  "preferences",
  "notifications",
  "transactions",
  "customers",
  "merchants",
  "reports",
  "employee",
  "employee_chat",
  "employee_memory",
  "hr_memory",
  "merchant_credential",
]);
let workspaceTableReady: Promise<void> | null = null;

function ensureWorkspaceTable(): Promise<void> {
  if (!workspaceTableReady) {
    workspaceTableReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS workspace_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        record_type text NOT NULL,
        record_id text NOT NULL,
        payload jsonb NOT NULL,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_records_organization_type_id_unique UNIQUE (organization_id, record_type, record_id)
      )
    `).then(() => undefined);
  }
  return workspaceTableReady;
}

function sessionToken(cookieHeader: string | undefined): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE}=`))
    ?.slice(`${AUTH_SESSION_COOKIE}=`.length);
}

function validRecordType(value: string): boolean {
  return allowedRecordTypes.has(value.trim().toLowerCase());
}

function recordId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 180);
}

router.get("/workspace/data", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(sessionToken(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    await ensureWorkspaceTable();
    const requestedTypes = typeof req.query.types === "string"
      ? req.query.types.split(",").map((value) => value.trim().toLowerCase()).filter(validRecordType)
      : [];
    const conditions = [eq(workspaceRecords.organizationId, user.organizationId)];
    if (requestedTypes.length) conditions.push(inArray(workspaceRecords.recordType, requestedTypes));
    const rows = await db.select({
      record_type: workspaceRecords.recordType,
      record_id: workspaceRecords.recordId,
      payload: workspaceRecords.payload,
      updated_at: workspaceRecords.updatedAt,
    }).from(workspaceRecords).where(and(...conditions)).orderBy(asc(workspaceRecords.updatedAt));
    res.status(200).json({ records: rows });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId }, "Workspace data read failed");
    res.status(500).json({ error: "Unable to load workspace data." });
  }
});

router.put("/workspace/data/:recordType/:recordId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(sessionToken(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const type = String(req.params.recordType || "").trim().toLowerCase();
  const id = recordId(req.params.recordId);
  const payload = req.body?.payload;
  if (!validRecordType(type) || !id || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    res.status(400).json({ error: "A valid record type, record id, and object payload are required." });
    return;
  }

  try {
    await ensureWorkspaceTable();
    const [record] = await db.insert(workspaceRecords).values({
      organizationId: user.organizationId,
      recordType: type,
      recordId: id,
      payload,
      createdByUserId: user.id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [workspaceRecords.organizationId, workspaceRecords.recordType, workspaceRecords.recordId],
      set: { payload, updatedAt: new Date() },
    }).returning({
      record_type: workspaceRecords.recordType,
      record_id: workspaceRecords.recordId,
      payload: workspaceRecords.payload,
      updated_at: workspaceRecords.updatedAt,
    });
    res.status(200).json({ record });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId, recordType: type, recordId: id }, "Workspace data write failed");
    res.status(500).json({ error: "Unable to save workspace data." });
  }
});

router.delete("/workspace/data/:recordType/:recordId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(sessionToken(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const type = String(req.params.recordType || "").trim().toLowerCase();
  const id = recordId(req.params.recordId);
  if (!validRecordType(type) || !id) {
    res.status(400).json({ error: "A valid record type and record id are required." });
    return;
  }

  try {
    await ensureWorkspaceTable();
    await db.delete(workspaceRecords).where(and(
      eq(workspaceRecords.organizationId, user.organizationId),
      eq(workspaceRecords.recordType, type),
      eq(workspaceRecords.recordId, id),
    ));
    res.status(204).send();
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId, recordType: type, recordId: id }, "Workspace data delete failed");
    res.status(500).json({ error: "Unable to delete workspace data." });
  }
});

export default router;
