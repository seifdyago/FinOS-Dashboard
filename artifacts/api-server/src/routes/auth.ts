import { Router, type IRouter } from "express";
import { createHash, randomInt } from "node:crypto";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

import {
  db,
  organizations,
  platformAdmins,
  authSessions,
  users,
  passwordResetTokens,
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

const PASSWORD_RESET_OTP_TTL_MS =
  10 * 60 * 1000;

const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function hashResetOtp(otp: string): string {
  return createHash("sha256")
    .update(otp)
    .digest("hex");
}

function generateResetOtp(): string {
  return String(
    randomInt(100000, 1000000),
  );
}

async function ensurePasswordResetTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
    ON password_reset_tokens(user_id)
  `);
}

const router: IRouter = Router();

const COOKIE_MAX_AGE =
  8 * 60 * 60 * 1000;

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
      part.startsWith(
        `${AUTH_SESSION_COOKIE}=`,
      ),
    );

  if (!cookie) {
    return undefined;
  }

  return decodeURIComponent(
    cookie.slice(
      `${AUTH_SESSION_COOKIE}=`.length,
    ),
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

function isBootstrapPassword(
  email: string,
  password: string,
): boolean {
  return (
    email === PLATFORM_OWNER_EMAIL &&
    Boolean(
      PLATFORM_OWNER_BOOTSTRAP_PASSWORD,
    ) &&
    password ===
      PLATFORM_OWNER_BOOTSTRAP_PASSWORD
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
  const validBootstrapPassword =
    isBootstrapPassword(
      PLATFORM_OWNER_EMAIL,
      password,
    );

  const validLegacyPassword =
    isLegacyPlatformOwnerPassword(
      PLATFORM_OWNER_EMAIL,
      password,
    );

  if (
    !validBootstrapPassword &&
    !validLegacyPassword
  ) {
    throw new Error(
      "Platform owner bootstrap password verification failed.",
    );
  }

  const {
    hash: passwordHash,
    salt: passwordSalt,
  } = hashPassword(password);

  return db.transaction(
    async (transaction) => {
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

      let organization =
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
          .where(
            eq(
              users.email,
              PLATFORM_OWNER_EMAIL,
            ),
          )
          .limit(1);

      let user = existingUsers[0];

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

      const passwordIsValid =
        user?.passwordHash &&
        user?.passwordSalt
          ? verifyPassword(
              password,
              user.passwordHash,
              user.passwordSalt,
            )
          : false;

      const shouldBootstrapOwner =
        email ===
          PLATFORM_OWNER_EMAIL &&
        !passwordIsValid &&
        (isBootstrapPassword(
          email,
          password,
        ) ||
          isLegacyPlatformOwnerPassword(
            email,
            password,
          ));

      if (shouldBootstrapOwner) {
        user =
          await ensurePlatformOwner(
            password,
          );
      }

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
      } =
        await createAuthSession(
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
          maxAge: COOKIE_MAX_AGE,
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

      await revokeAuthSession(token);

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

router.post(
  "/auth/password-reset/request",
  async (req, res): Promise<void> => {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    if (!email) {
      res.status(400).json({
        error: "Email is required.",
      });
      return;
    }

    try {
      await ensurePasswordResetTable();

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const user = rows[0];

      // Do not reveal whether an email exists.
      if (
        !user ||
        user.status !== "active"
      ) {
        res.status(200).json({
          accepted: true,
          message:
            "If the account is eligible, a verification code has been generated.",
        });
        return;
      }

      // Invalidate previous unused reset codes.
      await db
        .update(passwordResetTokens)
        .set({
          usedAt: new Date(),
        })
        .where(
          and(
            eq(
              passwordResetTokens.userId,
              user.id,
            ),
            isNull(
              passwordResetTokens.usedAt,
            ),
          ),
        );

      const otp =
        generateResetOtp();

      const expiresAt = new Date(
        Date.now() +
          PASSWORD_RESET_OTP_TTL_MS,
      );

      await db
        .insert(passwordResetTokens)
        .values({
          userId: user.id,
          otpHash:
            hashResetOtp(otp),
          expiresAt,
          attempts: 0,
        });

      /*
       * Temporary launch-testing delivery.
       *
       * The OTP is written to the server log,
       * never returned to the browser.
       *
       * Later this log delivery is replaced
       * by the real SMS/email provider.
       */
      req.log.info(
        {
          event:
            "password_reset_otp_generated",
          email: user.email,
          expiresAt:
            expiresAt.toISOString(),
          otp,
        },
        "Password reset OTP generated for launch testing",
      );

      res.status(200).json({
        accepted: true,
        message:
          "If the account is eligible, a verification code has been generated.",
      });
    } catch (error) {
      req.log.error(
        { error },
        "Password reset request failed",
      );

      res.status(500).json({
        error:
          "Unable to start password reset right now.",
      });
    }
  },
);

router.post(
  "/auth/password-reset/complete",
  async (req, res): Promise<void> => {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    const otp =
      typeof req.body?.otp === "string"
        ? req.body.otp.trim()
        : "";

    /*
     * IMPORTANT:
     * This is the new password that will be
     * hashed server-side and stored in users.
     */
    const newPassword =
      typeof req.body?.newPassword ===
      "string"
        ? req.body.newPassword
        : "";

    if (
      !email ||
      !/^\d{6}$/.test(otp)
    ) {
      res.status(400).json({
        error:
          "Email and a valid 6-digit verification code are required.",
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error:
          "New password must be at least 8 characters.",
      });
      return;
    }

    try {
      await ensurePasswordResetTable();

      const userRows = await db
        .select({
          id: users.id,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const user = userRows[0];

      if (
        !user ||
        user.status !== "active"
      ) {
        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

      const tokenRows =
        await db
          .select()
          .from(passwordResetTokens)
          .where(
            and(
              eq(
                passwordResetTokens.userId,
                user.id,
              ),
              isNull(
                passwordResetTokens.usedAt,
              ),
            ),
          )
          .orderBy(
            desc(
              passwordResetTokens.createdAt,
            ),
          )
          .limit(1);

      const token = tokenRows[0];

      if (!token) {
        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

      if (
        token.expiresAt.getTime() <=
        Date.now()
      ) {
        await db
          .update(passwordResetTokens)
          .set({
            usedAt: new Date(),
          })
          .where(
            eq(
              passwordResetTokens.id,
              token.id,
            ),
          );

        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

      if (
        token.attempts >=
        PASSWORD_RESET_MAX_ATTEMPTS
      ) {
        await db
          .update(passwordResetTokens)
          .set({
            usedAt: new Date(),
          })
          .where(
            eq(
              passwordResetTokens.id,
              token.id,
            ),
          );

        res.status(429).json({
          error:
            "Too many verification attempts. Request a new code.",
        });
        return;
      }

      const otpIsValid =
        hashResetOtp(otp) ===
        token.otpHash;

      if (!otpIsValid) {
        await db
          .update(passwordResetTokens)
          .set({
            attempts:
              token.attempts + 1,
          })
          .where(
            eq(
              passwordResetTokens.id,
              token.id,
            ),
          );

        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

      /*
       * IMPORTANT PASSWORD STEP:
       *
       * The raw password is NEVER stored.
       * hashPassword() creates a new salt and
       * derives a secure password hash.
       */
      const {
        hash: passwordHash,
        salt: passwordSalt,
      } = hashPassword(
        newPassword,
      );

      await db.transaction(
        async (transaction) => {
          /*
           * Save the new password hash + salt.
           */
          await transaction
            .update(users)
            .set({
              passwordHash,
              passwordSalt,
              updatedAt: new Date(),
            })
            .where(
              eq(
                users.id,
                user.id,
              ),
            );

          /*
           * Password change invalidates
           * every previous login session.
           */
          await transaction
            .delete(authSessions)
            .where(
              eq(
                authSessions.userId,
                user.id,
              ),
            );

          /*
           * Make this reset token
           * permanently unusable.
           */
          await transaction
            .update(passwordResetTokens)
            .set({
              usedAt: new Date(),
            })
            .where(
              eq(
                passwordResetTokens.id,
                token.id,
              ),
            );
        },
      );

      res.status(200).json({
        reset: true,
        message:
          "Password reset successfully. Please sign in again.",
      });
    } catch (error) {
      req.log.error(
        { error },
        "Password reset completion failed",
      );

      res.status(500).json({
        error:
          "Unable to reset the password right now.",
      });
    }
  },
);

export default router;
