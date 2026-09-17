import {
  createHash,
  randomBytes,
} from "node:crypto";

import {
  authSessions,
  db,
  platformAdmins,
  users,
} from "@workspace/db";

import { eq } from "drizzle-orm";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashSessionToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  platformAdminRole: string | null;
};

export async function getPlatformAdminRole(
  email: string,
): Promise<string | null> {
  const rows = await db
    .select({ role: platformAdmins.role })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, email.trim().toLowerCase()))
    .limit(1);

  return rows[0]?.role ?? null;
}

export async function createAuthSession(
  userId: string,
): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS,
  );

  await db.insert(authSessions).values({
    userId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
    lastUsedAt: new Date(),
  });

  return {
    token,
    expiresAt,
  };
}

export async function getAuthenticatedUser(
  token: string | undefined,
): Promise<AuthenticatedUser | null> {
  if (!token) {
    return null;
  }

  const sessionTokenHash = hashSessionToken(token);

  const rows = await db
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      organizationId: users.organizationId,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      platformAdminRole: platformAdmins.role,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(
      users,
      eq(authSessions.userId, users.id),
    )
    .leftJoin(
      platformAdmins,
      eq(platformAdmins.userId, users.email),
    )
    .where(
      eq(
        authSessions.sessionTokenHash,
        sessionTokenHash,
      ),
    )
    .limit(1);

  const session = rows[0];

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(authSessions)
      .where(eq(authSessions.id, session.sessionId));

    return null;
  }

  /*
   * A user whose account is not active must not be allowed
   * to use an existing session.
   *
   * This is especially important for pending security review,
   * rejected, and suspended accounts.
   */
  if (session.status !== "active") {
    await db
      .delete(authSessions)
      .where(eq(authSessions.id, session.sessionId));

    return null;
  }

  await db
    .update(authSessions)
    .set({
      lastUsedAt: new Date(),
    })
    .where(eq(authSessions.id, session.sessionId));

  return {
    id: session.userId,
    organizationId: session.organizationId,
    email: session.email,
    name: session.name,
    role: session.role,
    status: session.status,
    platformAdminRole: session.platformAdminRole,
  };
}

export async function revokeAuthSession(
  token: string | undefined,
): Promise<void> {
  if (!token) {
    return;
  }

  await db
    .delete(authSessions)
    .where(
      eq(
        authSessions.sessionTokenHash,
        hashSessionToken(token),
      ),
    );
}

export async function revokeAllUserSessions(
  userId: string,
): Promise<void> {
  await db
    .delete(authSessions)
    .where(eq(authSessions.userId, userId));
}

export const AUTH_SESSION_COOKIE = "finos_session";
