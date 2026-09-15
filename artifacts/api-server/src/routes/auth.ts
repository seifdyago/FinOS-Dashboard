import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  db,
  organizations,
  platformAdmins,
  users,
} from "@workspace/db";

import {
  createAuthSession,
  getAuthenticatedUser,
  revokeAuthSession,
  AUTH_SESSION_COOKIE,
} from "../lib/auth-session";

import {
  hashPassword,
  verifyPassword,
} from "../lib/password-auth";

const router: IRouter = Router();

const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

const PLATFORM_OWNER_EMAIL =
  "seifdyago@gmail.com";
const PLATFORM_OWNER_BOOTSTRAP_PASSWORD =
  process.env.FINOS_OWNER_BOOTSTRAP_PASSWORD;

const PLATFORM_OWNER_LEGACY_SHA256 =
  "f5c300c99642e85eb995fda3f0bf88cf9002b16656344619ae4dba167750cc7e";

const PLATFORM_ORGANIZATION_ID =
  "finos-platform";

const PLATFORM_ORGANIZATION_DOMAIN =
  "platform.finos.local";

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

function hashLegacyPassword(
  password: string,
): string {
  return createHash("sha256")
    .update(password)
    .digest("hex");
}

function isLegacyPlatformOwnerPassword(
  email: string,
  password: string,
): boolean {
  return (
    email === PLATFORM_OWNER_EMAIL &&
    hashLegacyPassword(password) ===
      PLATFORM_OWNER_LEGACY_SHA256
  );
}

async function ensurePlatformOwner(
  password: string,
): Promise<{
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  status: string;
}> {
  if (
    !isLegacyPlatformOwnerPassword(
      PLATFORM_OWNER_EMAIL,
      password,
    )
  ) {
    throw new Error(
      "Platform owner legacy password verification failed.",
    );
  }

  const {
    hash: passwordHash,
    salt: passwordSalt,
  } = hashPassword(password);

  return db.transaction(
    async (transaction) => {
      let organization;

      const existingOrganizations =
        await transaction
          .select()
          .from(organizations)
          .where(
            eq(
              organizations.id,
              PLATFORM_ORGANIZATION_ID,
            ),
          )
          .limit(1);

      organization =
        existingOrganizations[0];

      if (!organization) {
        const createdOrganizations =
          await transaction
            .insert(organizations)
            .values({
              id: PLATFORM_ORGANIZATION_ID,
              name: "FinOS Platform",
              domain:
                PLATFORM_ORGANIZATION_DOMAIN,
              initials: "FN",
              industry:
                "Financial Technology",
              companySize: "Platform",
              status: "active",
            })
            .returning();

        organization =
          createdOrganizations[0];

        if (!organization) {
          throw new Error(
            "Unable to create the FinOS platform organization.",
          );
        }
      }

      let user;

      const existingUsers =
        await transaction
          .select({
            id: users.id,
            organizationId:
              users.organizationId,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            passwordHash:
              users.passwordHash,
            passwordSalt:
              users.passwordSalt,
          })
          .from(users)
          .where(eq(users.email, PLATFORM_OWNER_EMAIL))
          .limit(1);

      user = existingUsers[0];

      if (!user) {
        const createdUsers =
          await transaction
            .insert(users)
            .values({
              organizationId:
                organization.id,
              email:
                PLATFORM_OWNER_EMAIL,
              name: "Seifdyago",
              role: "platform_owner",
              passwordHash,
              passwordSalt,
              status: "active",
            })
            .returning({
              id: users.id,
              organizationId:
                users.organizationId,
              email: users.email,
              name: users.name,
              role: users.role,
              status: users.status,
              passwordHash:
                users.passwordHash,
              passwordSalt:
                users.passwordSalt,
            });

        user = createdUsers[0];

        if (!user) {
          throw new Error(
            "Unable to create the platform owner user.",
          );
        }
      } else {
        await transaction
          .update(users)
          .set({
            organizationId:
              organization.id,
            name: "Seifdyago",
            role: "platform_owner",
            passwordHash,
            passwordSalt,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        user = {
          ...user,
          organizationId:
            organization.id,
          name: "Seifdyago",
          role: "platform_owner",
          status: "active",
          passwordHash,
          passwordSalt,
        };
      }

      const existingPlatformAdmins =
        await transaction
          .select()
          .from(platformAdmins)
          .where(
            eq(
              platformAdmins.userId,
              user.email,
            ),
          )
          .limit(1);

      const existingPlatformAdmin =
        existingPlatformAdmins[0];

      if (!existingPlatformAdmin) {
        await transaction
          .insert(platformAdmins)
          .values({
            userId: user.email,
            role: "owner",
          });
      } else if (
        existingPlatformAdmin.role
          .trim()
          .toLowerCase() !== "owner"
      ) {
        await transaction
          .update(platformAdmins)
          .set({
            role: "owner",
          })
          .where(
            eq(
              platformAdmins.id,
              existingPlatformAdmin.id,
            ),
          );
      }

      return {
        id: user.id,
        organizationId:
          organization.id,
        email: user.email,
        name: user.name,
        role: "platform_owner",
        status: "active",
      };
    },
  );
}

router.post(
  "/auth/login",
  async (req, res): Promise<void> => {
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
        error:
          "Email and password are required.",
      });
      return;
    }

    try {
      const rows = await db
        .select({
          id: users.id,
          organizationId:
            users.organizationId,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          passwordHash:
            users.passwordHash,
          passwordSalt:
            users.passwordSalt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let user = rows[0];

      /*
       * One-time migration for the original
       * platform-owner account.
       *
       * The old frontend stored a SHA-256
       * verifier. We use it only to migrate
       * the existing owner account into the
       * backend's scrypt authentication system.
       */
      if (
        email === PLATFORM_OWNER_EMAIL &&
        (
          !user ||
          !user.passwordHash ||
          !user.passwordSalt ||
          !verifyPassword(
            password,
            user.passwordHash,
            user.passwordSalt,
          )
        ) &&
        isLegacyPlatformOwnerPassword(
          email,
          password,
        )
      ) {
        user =
          await ensurePlatformOwner(
            password,
          );
      }

      /*
       * Always return the same authentication
       * failure response.
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
          error:
            "Invalid email or password.",
        });
        return;
      }

      /*
       * Accounts must be active before
       * receiving a session.
       */
      if (user.status !== "active") {
        res.status(403).json({
          error:
            "Your account is not active yet. Security review is required before you can sign in.",
          status: user.status,
        });
        return;
      }

      const {
        token,
        expiresAt,
      } = await createAuthSession(
        user.id,
      );

      res.cookie(
        AUTH_SESSION_COOKIE,
        token,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            COOKIE_MAX_AGE,
          path: "/",
        },
      );

      res.status(200).json({
        user: {
          id: user.id,
          organization_id:
            user.organizationId,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
        expires_at:
          expiresAt.toISOString(),
      });
    } catch (error) {
      req.log.error(
        { error },
        "Authentication login failed",
      );

      res.status(500).json({
        error:
          "Unable to sign in right now.",
      });
    }
  },
);

router.get(
  "/auth/session",
  async (req, res): Promise<void> => {
    try {
      const token =
        getSessionToken(req);

      const user =
        await getAuthenticatedUser(
          token,
        );

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
          organization_id:
            user.organizationId,
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
        error:
          "Unable to validate the current session.",
      });
    }
  },
);

router.post(
  "/auth/logout",
  async (req, res): Promise<void> => {
    try {
      const token =
        getSessionToken(req);

      await revokeAuthSession(
        token,
      );

      res.clearCookie(
        AUTH_SESSION_COOKIE,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          path: "/",
        },
      );

      res.status(200).json({
        authenticated: false,
      });
    } catch (error) {
      req.log.error(
        { error },
        "Authentication logout failed",
      );

      res.status(500).json({
        error:
          "Unable to sign out right now.",
      });
    }
  },
);

export default router;
