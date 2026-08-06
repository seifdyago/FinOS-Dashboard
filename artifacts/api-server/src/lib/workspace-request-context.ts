import { and, eq } from "drizzle-orm";
import { db, organizations, users, type Organization, type User } from "@workspace/db";

export class WorkspaceRequestError extends Error {
  status: 400 | 401 | 403 | 404;

  constructor(status: 400 | 401 | 403 | 404, message: string) {
    super(message);
    this.name = "WorkspaceRequestError";
    this.status = status;
  }
}

export type WorkspaceRequestContext = {
  organization: Organization;
  user: User;
};

export async function requireWorkspaceRequestContext(
  request: {
    header: (name: string) => string | undefined;
  },
): Promise<WorkspaceRequestContext> {
  const organizationId = request.header("x-finos-organization-id")?.trim();
  const email = request.header("x-finos-user-email")?.trim().toLowerCase();

  if (!organizationId || !email) {
    throw new WorkspaceRequestError(401, "Workspace identity is required.");
  }

  const [result] = await db
    .select({ organization: organizations, user: users })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(and(eq(users.organizationId, organizationId), eq(users.email, email)))
    .limit(1);

  if (!result) throw new WorkspaceRequestError(403, "User does not belong to this organization.");
  if (result.organization.status.trim().toLowerCase() !== "active") {
    throw new WorkspaceRequestError(403, "This company workspace is inactive.");
  }
  if (result.user.status.trim().toLowerCase() !== "active") {
    throw new WorkspaceRequestError(403, "This user account is inactive.");
  }

  return result;
}