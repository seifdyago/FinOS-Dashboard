import { eq } from "drizzle-orm";
import { db, platformAdmins, type PlatformAdmin } from "@workspace/db";

export class PlatformAdminRequestError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "PlatformAdminRequestError";
    this.status = status;
  }
}

export async function requirePlatformAdminRequestContext(request: {
  header: (name: string) => string | undefined;
}): Promise<PlatformAdmin> {
  const email = request.header("x-finos-platform-admin-email")?.trim().toLowerCase();
  if (!email) {
    throw new PlatformAdminRequestError(401, "Platform admin identity is required.");
  }

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, email))
    .limit(1);

  if (!admin || !["owner", "admin"].includes(admin.role.trim().toLowerCase())) {
    throw new PlatformAdminRequestError(403, "Platform admin access is not enabled for this identity.");
  }

  return admin;
}