import { Router, type IRouter } from "express";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { eq, and, desc, isNull, sql } from "drizzle-orm";

import {
  db,
  organizations,
  platformAdmins,
  authSessions,
  users,
  accountApplications,
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

const PASSWORD_RESET_TOKEN_TTL_MS =
  10 * 60 * 1000;

const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const PASSWORD_RESET_REQUEST_WINDOW_MS =
  15 * 60 * 1000;

const PASSWORD_RESET_MAX_REQUESTS_PER_WINDOW = 3;

const PASSWORD_RESET_MAX_IP_REQUESTS_PER_WINDOW = 10;

const PASSWORD_RESET_TEST_OTP_ENABLED =
  process.env.FINOS_PASSWORD_RESET_TEST_MODE ===
  "true";

function hashResetOtp(otp: string): string {
  return createHash("sha256")
    .update(otp)
    .digest("hex");
}

function hashResetToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function generateResetOtp(): string {
  return String(
    randomInt(100000, 1000000),
  );
}

function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

function normalizeIdNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function hashNationalId(value: string): string {
  return createHash("sha256")
    .update(normalizeIdNumber(value))
    .digest("hex");
}

function normalizeDocumentReference(value: string): string {
  return value.trim().toLowerCase();
}

function getRequestIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim();
  }

  return req.ip || "unknown";
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
      created_at timestamptz NOT NULL DEFAULT now(),
      reset_token_hash text,
      reset_token_expires_at timestamptz
    )
  `);

  await db.execute(sql`
    ALTER TABLE password_reset_tokens
    ADD COLUMN IF NOT EXISTS reset_token_hash text
  `);

  await db.execute(sql`
    ALTER TABLE password_reset_tokens
    ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamptz
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
    ON password_reset_tokens(user_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_reset_token_hash_idx
    ON password_reset_tokens(reset_token_hash)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_rate_limits (
      key_hash text PRIMARY KEY,
      window_started_at timestamptz NOT NULL,
      request_count integer NOT NULL DEFAULT 0
    )
  `);
}

async function consumeRateLimit(
  key: string,
  maxRequests: number,
  now = new Date(),
): Promise<boolean> {
  const keyHash = createHash("sha256")
    .update(key)
    .digest("hex");

  const windowStartedAt = new Date(
    now.getTime() - PASSWORD_RESET_REQUEST_WINDOW_MS,
  );

  const rows = await db.execute(sql`
    INSERT INTO password_reset_rate_limits (
      key_hash,
      window_started_at,
      request_count
    )
    VALUES (
      ${keyHash},
      ${now},
      1
    )
    ON CONFLICT (key_hash)
    DO UPDATE SET
      window_started_at = CASE
        WHEN password_reset_rate_limits.window_started_at <= ${windowStartedAt}
          THEN ${now}
        ELSE password_reset_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN password_reset_rate_limits.window_started_at <= ${windowStartedAt}
          THEN 1
        ELSE password_reset_rate_limits.request_count + 1
      END
    RETURNING request_count
  `);

  const requestCount = Number(
    (rows as unknown as { rows?: Array<{ request_count: number }> })
      .rows?.[0]?.request_count ?? maxRequests + 1,
  );

  return requestCount <= maxRequests;
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

function isLegacySha256Password(
  password: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }

  const actual = Buffer.from(
    hashLegacyPassword(password),
    "hex",
  );
  const expected = Buffer.from(storedHash, "hex");

  return (
    expected.length === actual.length &&
    timingSafeEqual(actual, expected)
  );
}

function isLegacyPlatformOwnerPassword(
  email: string,
  password: string,
): boolean {
  return (
    email === PLATFORM_OWNER_EMAIL &&
    isLegacySha256Password(
      password,
      PLATFORM_OWNER_LEGACY_SHA256,
    )
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

      let passwordIsValid =
        Boolean(
          user?.passwordHash &&
          user?.passwordSalt &&
          verifyPassword(
            password,
            user.passwordHash,
            user.passwordSalt,
          ),
        );

      const legacyPasswordIsValid =
        Boolean(
          user?.passwordHash &&
          isLegacySha256Password(
            password,
            user.passwordHash,
          ),
        );

      if (user && legacyPasswordIsValid) {
        const upgraded = hashPassword(password);

        await db
          .update(users)
          .set({
            passwordHash: upgraded.hash,
            passwordSalt: upgraded.salt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        user = {
          ...user,
          passwordHash: upgraded.hash,
          passwordSalt: upgraded.salt,
        };
        passwordIsValid = true;
      }

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

    const phone =
      typeof req.body?.phone === "string"
        ? normalizePhone(req.body.phone)
        : "";

    const idNumber =
      typeof req.body?.idNumber === "string"
        ? normalizeIdNumber(req.body.idNumber)
        : "";

    if (!email || !phone || !/^\d{14}$/.test(idNumber)) {
      res.status(400).json({
        error:
          "Email, phone, and a valid 14-digit national ID are required.",
      });
      return;
    }

    try {
      await ensurePasswordResetTable();

      const ip = getRequestIp(req);

      const emailAllowed =
        await consumeRateLimit(
          `email:${email}`,
          PASSWORD_RESET_MAX_REQUESTS_PER_WINDOW,
        );

      const ipAllowed =
        await consumeRateLimit(
          `ip:${ip}`,
          PASSWORD_RESET_MAX_IP_REQUESTS_PER_WINDOW,
        );

      if (!emailAllowed || !ipAllowed) {
        res.status(429).json({
          error:
            "Too many password reset requests. Please try again later.",
        });
        return;
      }

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

      // Keep the account existence response generic.
      if (
        !user ||
        user.status !== "active"
      ) {
        res.status(200).json({
          accepted: true,
          message:
            "If the account is eligible, a verification code will be sent.",
        });
        return;
      }

      /*
       * Identity verification is based on the
       * registration application. The recovery
       * request must prove the registered phone
       * and document reference when those values
       * exist on the application.
       */
      const applicationRows =
        await db
          .select({
            applicantPhone:
              accountApplications.applicantPhone,
            idNumberHash:
              accountApplications.idNumberHash,
            verificationStatus:
              accountApplications.verificationStatus,
          })
          .from(accountApplications)
          .where(
            eq(
              accountApplications.applicantEmail,
              email,
            ),
          )
          .orderBy(
            desc(
              accountApplications.createdAt,
            ),
          )
          .limit(1);

      const application =
        applicationRows[0];

      if (!application) {
        res.status(403).json({
          error:
            "Account recovery requires a verified registration record. Please contact FinOS security support.",
        });
        return;
      }

      const registeredPhone =
        application.applicantPhone
          ? normalizePhone(
              application.applicantPhone,
            )
          : "";

      const registeredIdNumberHash =
        application.idNumberHash ?? "";

      if (
        !registeredPhone ||
        !registeredIdNumberHash ||
        !phone ||
        !idNumber ||
        registeredPhone !== phone ||
        hashNationalId(idNumber) !==
          registeredIdNumberHash
      ) {
        res.status(403).json({
          error:
            "The account verification details do not match the registration record.",
        });
        return;
      }

      if (
        application.verificationStatus !==
          "approved"
      ) {
        res.status(403).json({
          error:
            "This account is not eligible for self-service password recovery until identity verification is approved.",
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

      if (PASSWORD_RESET_TEST_OTP_ENABLED) {
        req.log.info(
          {
            event:
              "password_reset_otp_generated_test_mode",
            userId: user.id,
            expiresAt:
              expiresAt.toISOString(),
            otp,
          },
          "Password reset OTP generated in explicit test mode",
        );
      } else {
        /*
         * Production delivery integration point.
         * The OTP is intentionally NOT returned to
         * the browser and is never logged in
         * production. The SMS/email provider must
         * be connected here before production use.
         */
        req.log.info(
          {
            event:
              "password_reset_delivery_pending",
            userId: user.id,
            expiresAt:
              expiresAt.toISOString(),
          },
          "Password reset delivery provider is not configured",
        );
      }

      const response: {
        accepted: boolean;
        message: string;
        test_otp?: string;
      } = {
        accepted: true,
        message:
          "If the account is eligible, a verification code will be sent.",
      };

      if (PASSWORD_RESET_TEST_OTP_ENABLED) {
        response.test_otp = otp;
      }

      res.status(200).json(response);
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
  "/auth/password-reset/verify",
  async (req, res): Promise<void> => {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    const otp =
      typeof req.body?.otp === "string"
        ? req.body.otp.trim()
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

      const resetToken =
        generateResetToken();

      const resetTokenExpiresAt =
        new Date(
          Date.now() +
            PASSWORD_RESET_TOKEN_TTL_MS,
        );

      await db.execute(sql`
        UPDATE password_reset_tokens
        SET
          reset_token_hash = ${hashResetToken(resetToken)},
          reset_token_expires_at = ${resetTokenExpiresAt},
          used_at = now()
        WHERE id = ${token.id}
      `);

      res.status(200).json({
        verified: true,
        reset_token: resetToken,
        expires_at:
          resetTokenExpiresAt.toISOString(),
      });
    } catch (error) {
      req.log.error(
        { error },
        "Password reset OTP verification failed",
      );

      res.status(500).json({
        error:
          "Unable to verify the password reset code right now.",
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

    const resetToken =
      typeof req.body?.resetToken ===
      "string"
        ? req.body.resetToken.trim()
        : "";

    const newPassword =
      typeof req.body?.newPassword ===
      "string"
        ? req.body.newPassword
        : "";

    if (!email || !resetToken) {
      res.status(400).json({
        error:
          "Email and a valid password reset token are required.",
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
            "The password reset token is invalid or expired.",
        });
        return;
      }

      const tokenResult = await db.execute(sql`
        SELECT
          id,
          reset_token_expires_at
        FROM password_reset_tokens
        WHERE
          user_id = ${user.id}
          AND reset_token_hash = ${hashResetToken(resetToken)}
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const tokenRow = (
        tokenResult as unknown as {
          rows?: Array<{
            id: string;
            reset_token_expires_at: Date | string | null;
          }>;
        }
      ).rows?.[0];

      if (!tokenRow) {
        res.status(400).json({
          error:
            "The password reset token is invalid or expired.",
        });
        return;
      }

      const resetTokenExpiresAt =
        tokenRow.reset_token_expires_at
          ? new Date(tokenRow.reset_token_expires_at)
          : null;


      if (
        !resetTokenExpiresAt ||
        resetTokenExpiresAt.getTime() <=
          Date.now()
      ) {
        res.status(400).json({
          error:
            "The password reset token is invalid or expired.",
        });
        return;
      }

      const {
        hash: passwordHash,
        salt: passwordSalt,
      } = hashPassword(
        newPassword,
      );

      await db.transaction(
        async (transaction) => {
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

          await transaction
            .delete(authSessions)
            .where(
              eq(
                authSessions.userId,
                user.id,
              ),
            );

          await transaction.execute(sql`
            UPDATE password_reset_tokens
            SET
              reset_token_hash = NULL,
              reset_token_expires_at = NULL,
              used_at = now()
            WHERE id = ${tokenRow.id}
          `);
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
