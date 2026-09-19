import { Router, type IRouter } from "express";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { eq, and, desc, isNull, isNotNull, gt, sql } from "drizzle-orm";

import {
  db,
  organizations,
  platformAdmins,
  authSessions,
  users,
  subscriptions,
  accountApplications,
  passwordResetTokens,
  passwordResetRateLimits,
} from "@workspace/db";

import {
  createAuthSession,
  getAuthenticatedUser,
  getPlatformAdminRole,
  revokeAuthSession,
  AUTH_SESSION_COOKIE,
} from "../lib/auth-session";

import {
  hashPassword,
  verifyPassword,
} from "../lib/password-auth";
import {
  sendPasswordResetCode,
} from "../lib/password-reset-delivery";
import { LIFETIME_ACCOUNT_EMAILS, isSubscriptionExpired } from "../lib/subscription-plans";

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

  const rows = await db
    .insert(passwordResetRateLimits)
    .values({
      keyHash,
      windowStartedAt: now,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: passwordResetRateLimits.keyHash,
      set: {
        windowStartedAt: sql`CASE WHEN ${passwordResetRateLimits.windowStartedAt} <= ${windowStartedAt} THEN ${now} ELSE ${passwordResetRateLimits.windowStartedAt} END`,
        requestCount: sql`CASE WHEN ${passwordResetRateLimits.windowStartedAt} <= ${windowStartedAt} THEN 1 ELSE ${passwordResetRateLimits.requestCount} + 1 END`,
      },
    })
    .returning({ requestCount: passwordResetRateLimits.requestCount });

  const requestCount = Number(rows[0]?.requestCount ?? maxRequests + 1);

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

const PLATFORM_OWNER_PHONE =
  "01092122639";

const PLATFORM_OWNER_ID_NUMBER_HASH =
  "4074c2525f3bed3e0645921b19c21266fef8e802d27ac6e601e6e8cfc9772f5a";

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
  passwordHash: string;
  passwordSalt: string;
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

      const existingOwnerApplications =
        await transaction
          .select()
          .from(accountApplications)
          .where(
            eq(
              accountApplications.applicantEmail,
              PLATFORM_OWNER_EMAIL,
            ),
          )
          .orderBy(
            desc(
              accountApplications.createdAt,
            ),
          )
          .limit(1);

      const existingOwnerApplication =
        existingOwnerApplications[0];

      if (existingOwnerApplication) {
        await transaction
          .update(accountApplications)
          .set({
            organizationId:
              organization.id,
            applicantPhone:
              PLATFORM_OWNER_PHONE,
            idNumberHash:
              PLATFORM_OWNER_ID_NUMBER_HASH,
            verificationStatus:
              "approved",
            reviewedByUserId:
              user.id,
            reviewedAt:
              new Date(),
            rejectionReason:
              null,
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              accountApplications.id,
              existingOwnerApplication.id,
            ),
          );
      } else {
        await transaction
          .insert(accountApplications)
          .values({
            organizationId:
              organization.id,
            applicantName:
              "Seifdyago",
            applicantEmail:
              PLATFORM_OWNER_EMAIL,
            applicantPhone:
              PLATFORM_OWNER_PHONE,
            idNumberHash:
              PLATFORM_OWNER_ID_NUMBER_HASH,
            companyName:
              organization.name,
            companyDomain:
              organization.domain,
            industry:
              organization.industry,
            companySize:
              organization.companySize,
            requestedPlan:
              "basic",
            verificationStatus:
              "approved",
            reviewedByUserId:
              user.id,
            reviewedAt:
              new Date(),
          });
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

      const existingSubscriptions =
        await transaction
          .select()
          .from(subscriptions)
          .where(
            eq(
              subscriptions.organizationId,
              organization.id,
            ),
          )
          .limit(1);

      if (existingSubscriptions[0]) {
        await transaction
          .update(subscriptions)
          .set({
            plan: "basic",
            status: "active",
            priceCents: 100_000,
            updatedAt: new Date(),
          })
          .where(
            eq(
              subscriptions.id,
              existingSubscriptions[0].id,
            ),
          );
      } else {
        await transaction
          .insert(subscriptions)
          .values({
            organizationId: organization.id,
            plan: "basic",
            status: "active",
            priceCents: 100_000,
          });
      }

      return {
        id: user.id,
        organizationId:
          organization.id,
        email: user.email,
        name: user.name,
        role: "platform_owner",
        status: "active",
        passwordHash,
        passwordSalt,
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
        .where(eq(users.email, email));

      if (rows.length > 1) {
        res.status(409).json({
          error:
            "This email is linked to more than one workspace. Contact FinOS support to resolve the account identity.",
        });
        return;
      }

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

      const [subscription] = await db
        .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, user.organizationId))
        .limit(1);
      if (LIFETIME_ACCOUNT_EMAILS.has(email)) {
        await db.update(subscriptions).set({ status: "active", currentPeriodEnd: null, updatedAt: new Date() }).where(eq(subscriptions.organizationId, user.organizationId));
        if (user.status !== "active") {
          await db.update(organizations).set({ status: "active", updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
          await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, user.id));
          user = { ...user, status: "active" };
        }
      } else if (isSubscriptionExpired(subscription?.currentPeriodEnd)) {
        await db.update(subscriptions).set({ status: "suspended", updatedAt: new Date() }).where(eq(subscriptions.organizationId, user.organizationId));
        await db.update(organizations).set({ status: "suspended", updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
        await db.update(users).set({ status: "suspended", updatedAt: new Date() }).where(eq(users.id, user.id));
        res.status(403).json({ error: "Your subscription has expired. Submit a renewal payment to reactivate the account.", status: "suspended" });
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

      await db
        .update(users)
        .set({
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

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
          platform_admin_role:
            await getPlatformAdminRole(user.email),
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
          platform_admin_role:
            user.platformAdminRole,
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
        .where(eq(users.email, email));

      if (rows.length > 1) {
        res.status(200).json({
          accepted: true,
          message:
            "If the account is eligible, a verification code will be sent.",
        });
        return;
      }

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

      try {
        if (!PASSWORD_RESET_TEST_OTP_ENABLED) {
          await sendPasswordResetCode({
            email: user.email,
            code: otp,
            expiresAt,
          });
        }
      } catch (deliveryError) {
        await db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              isNull(passwordResetTokens.usedAt),
            ),
          );
        throw deliveryError;
      }

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
        req.log.info(
          {
            event: "password_reset_email_sent",
            userId: user.id,
            expiresAt: expiresAt.toISOString(),
          },
          "Password reset email sent",
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
      const userRows = await db
        .select({
          id: users.id,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email));

      if (userRows.length > 1) {
        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

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

      const verifiedRows = await db
        .update(passwordResetTokens)
        .set({
          resetTokenHash: hashResetToken(resetToken),
          resetTokenExpiresAt,
          usedAt: new Date(),
        })
        .where(
          and(
            eq(passwordResetTokens.id, token.id),
            isNull(passwordResetTokens.usedAt),
          ),
        )
        .returning({ id: passwordResetTokens.id });

      if (!verifiedRows[0]) {
        res.status(400).json({
          error:
            "The verification code is invalid or expired.",
        });
        return;
      }

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
      const userRows = await db
        .select({
          id: users.id,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email));

      if (userRows.length > 1) {
        res.status(400).json({
          error:
            "The password reset token is invalid or expired.",
        });
        return;
      }

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

      const tokenRows = await db
        .select({
          id: passwordResetTokens.id,
          resetTokenExpiresAt:
            passwordResetTokens.resetTokenExpiresAt,
        })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            eq(
              passwordResetTokens.resetTokenHash,
              hashResetToken(resetToken),
            ),
            isNotNull(passwordResetTokens.resetTokenExpiresAt),
          ),
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);

      const tokenRow = tokenRows[0];

      if (!tokenRow) {
        res.status(400).json({
          error:
            "The password reset token is invalid or expired.",
        });
        return;
      }

      const resetTokenExpiresAt =
        tokenRow.resetTokenExpiresAt;


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

          const consumedTokens = await transaction
            .update(passwordResetTokens)
            .set({
              resetTokenHash: null,
              resetTokenExpiresAt: null,
              usedAt: new Date(),
            })
            .where(
              and(
                eq(passwordResetTokens.id, tokenRow.id),
                eq(
                  passwordResetTokens.resetTokenHash,
                  hashResetToken(resetToken),
                ),
                gt(
                  passwordResetTokens.resetTokenExpiresAt,
                  new Date(),
                ),
              ),
            )
            .returning({ id: passwordResetTokens.id });

          if (!consumedTokens[0]) {
            throw new Error("The password reset token is invalid or expired.");
          }
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
