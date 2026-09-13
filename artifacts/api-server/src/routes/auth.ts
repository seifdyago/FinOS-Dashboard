import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";

import { db, users } from "@workspace/db";

import {
  createAuthSession,
  getAuthenticatedUser,
  revokeAuthSession,
  AUTH_SESSION_COOKIE,
} from "../lib/auth-session";

import { verifyPassword } from "../lib/password-auth";

const router: IRouter = Router();

const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

function getSessionToken(req: {
  headers: {
    cookie?: string;
  };
}): string | undefined {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) =>
      part.startsWith(`${AUTH_SESSION_COOKIE}=`),
    );

  if (!cookie) {
    return undefined;
  }

  return decodeURIComponent(
    cookie.slice(`${AUTH_SESSION_COOKIE}=`.length),
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const email =
    typeof req.body?.email === "string"
      ? normalizeEmail(req.body.email)
      : "";

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (!email || !password) {
    res.status(400).json({
      error: "Email and password are required.",
    });
    return;
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        organizationId: users.organizationId,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        passwordHash: users.passwordHash,
        passwordSalt: users.passwordSalt,
      })
      .from(users)
      .where(
        and(
          eq(users.email, email),
        ),
      )
      .limit(1);

    const user = rows[0];

    /*
     * Always return the same authentication failure response.
     * This prevents exposing whether an email exists.
     */
    if (
      !user ||
      !user.passwordHash ||
      !user.passwordSalt ||
      !verifyPassword(
        password,
        user.passwordHash,
        user.passwordSalt,
      )
    ) {
      res.status(401).json({
        error: "Invalid email or password.",
      });
      return;
    }

    /*
     * Accounts must be approved and active before login.
     *
     * Pending security review, rejected, suspended, or disabled
     * accounts cannot receive a valid session.
     */
    if (user.status !== "active") {
      res.status(403).json({
        error:
          "Your account is not active yet. Security review is required before you can sign in.",
        status: user.status,
      });
      return;
    }

    /*
     * The platform owner identity is tied to the database user
     * record. We do not create or trust an owner account in the
     * browser.
     */
    const { token, expiresAt } =
      await createAuthSession(user.id);

    res.cookie(AUTH_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    res.status(200).json({
      user: {
        id: user.id,
        organization_id: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    req.log.error(
      { error },
      "Authentication login failed",
    );

    res.status(500).json({
      error: "Unable to sign in right now.",
    });
  }
});

router.get("/auth/session", async (req, res): Promise<void> => {
  try {
    const token = getSessionToken(req);

    const user =
      await getAuthenticatedUser(token);

    if (!user) {
      res.status(401).json({
        authenticated: false,
      });
      return;
    }

    res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        organization_id: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    req.log.error(
      { error },
      "Authentication session lookup failed",
    );

    res.status(500).json({
      error: "Unable to validate the current session.",
    });
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  try {
    const token = getSessionToken(req);

    await revokeAuthSession(token);

    res.clearCookie(AUTH_SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({
      authenticated: false,
    });
  } catch (error) {
    req.log.error(
      { error },
      "Authentication logout failed",
    );

    res.status(500).json({
      error: "Unable to sign out right now.",
    });
  }
});

export default router;
