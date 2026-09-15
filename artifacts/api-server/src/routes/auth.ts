import { Router, type IRouter } from "express";
import {
  createHash,
  randomInt,
} from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";

import {
  db,
  organizations,
  platformAdmins,
  users,
  accountApplications,
  passwordResetTokens,
} from "@workspace/db";

import {
  createAuthSession,
  getAuthenticatedUser,
  revokeAuthSession,
  revokeAllUserSessions,
  AUTH_SESSION_COOKIE,
} from "../lib/auth-session";

import {
  hashPassword,
  verifyPassword,
} from "../lib/password-auth";

const router: IRouter = Router();

const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

/*
 * Password recovery security settings.
 *
 * OTP:
 * - 6 digits
 * - valid for 10 minutes
 * - maximum 5 verification attempts
 *
 * Request rate limit:
 * - maximum 3 reset requests per user
 * - during a rolling 15 minute window
 */
const PASSWORD_RESET_OTP_TTL_MS =
  10 * 60 * 1000;

const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const PASSWORD_RESET_MAX_REQUESTS =
  3;

/*
 * In production the OTP must be delivered by a
 * trusted communication channel.
 *
 * FINOS_PASSWORD_RESET_TEST_MODE=true may be used
 * temporarily during controlled testing.
 *
 * The OTP is NEVER stored in the database in plaintext.
 */
const PASSWORD_RESET_TEST_MODE =
  process.env.FINOS_PASSWORD_RESET_TEST_MODE ===
  "true";

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

function normalizeVerificationValue(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function hashLegacyPassword(
  password: string,
): string {
  return createHash("sha256")
    .update(password)
    .digest("hex");
}

function hashPasswordResetOtp(
  otp: string,
): string {
  return createHash("sha256")
    .update(otp)
    .digest("hex");
}

function generatePasswordResetOtp(): string {
  return randomInt(100000, 1000000).toString();
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
    Boolean(PLATFORM_OWNER_BOOTSTRAP_PASSWORD) &&
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

  return db.transaction(async (transaction) => {
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
      organizationId: organization.id,
      email: user.email,
      name: user.name,
      role: "platform_owner",
      status: "active",
    };
  });
}

/*
 * Verify the additional identity information supplied
 * during password recovery.
 *
 * For normal company accounts:
 * - email must belong to the user
 * - an approved/verified application must exist
 * - if the application has a phone, it must match
 * - if an applicant name is supplied, it must match
 *
 * The platform owner is handled separately because the
 * platform owner is not created through company onboarding.
 */
async function verifyPasswordResetIdentity(
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  },
  phone: string,
  idName: string,
): Promise<boolean> {
  if (user.status !== "active") {
    return false;
  }

  if (user.email === PLATFORM_OWNER_EMAIL) {
    return true;
  }

  const applications =
    await db
      .select({
        applicantName:
          accountApplications.applicantName,
        applicantEmail:
          accountApplications.applicantEmail,
        applicantPhone:
          accountApplications.applicantPhone,
        verificationStatus:
          accountApplications.verificationStatus,
      })
      .from(accountApplications)
      .where(
        eq(
          accountApplications.applicantEmail,
          user.email,
        ),
      )
      .orderBy(
        desc(accountApplications.createdAt),
      )
      .limit(1);

  const application =
    applications[0];

  if (!application) {
    return false;
  }

  const verificationStatus =
    application.verificationStatus
      .trim()
      .toLowerCase();

  const verified =
    verificationStatus ===
      "approved" ||
    verificationStatus ===
      "verified" ||
    verificationStatus ===
      "active";

  if (!verified) {
    return false;
  }

  const normalizedIdName =
    normalizeVerificationValue(idName);

  if (normalizedIdName) {
    const userName =
      normalizeVerificationValue(
        user.name,
      );

    const applicantName =
      normalizeVerificationValue(
        application.applicantName,
      );

    if (
      normalizedIdName !== userName &&
      normalizedIdName !== applicantName
    ) {
      return false;
    }
  }

  const normalizedPhone =
    normalizePhone(phone);

  if (
    normalizedPhone &&
    application.applicantPhone
  ) {
    const applicationPhone =
      normalizePhone(
        application.applicantPhone,
      );

    if (
      normalizedPhone !==
      applicationPhone
    ) {
      return false;
    }
  }

  return true;
}

/*
 * Check the database-backed reset request rate limit.
 *
 * This avoids relying on in-memory state, which is not
 * reliable across Vercel/serverless instances.
 */
async function isPasswordResetRateLimited(
  userId: string,
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() -
      PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  );

  const recentRequests =
    await db
      .select({
        id: passwordResetTokens.id,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(
            passwordResetTokens.userId,
            userId,
          ),
          gt(
            passwordResetTokens.createdAt,
            windowStart,
          ),
        ),
      );

  return (
    recentRequests.length >=
    PASSWORD_RESET_MAX_REQUESTS
  );
}

/*
 * Request password reset OTP.
 *
 * IMPORTANT:
 * The response is intentionally generic so an attacker
 * cannot discover whether an email belongs to a FinOS user.
 */
router.post(
  "/auth/password-reset/request",
  async (req, res): Promise<void> => {
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : "";

    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim()
        : "";

    const idName =
      typeof req.body?.idName === "string"
        ? req.body.idName.trim()
        : "";

    const genericResponse = {
      message:
        "If the account information is valid, a verification code has been issued.",
    };

    if (!email) {
      res.status(200).json(
        genericResponse,
      );
      return;
    }

    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const user = rows[0];

      if (!user) {
        res.status(200).json(
          genericResponse,
        );
        return;
      }

      const identityValid =
        await verifyPasswordResetIdentity(
          user,
          phone,
          idName,
        );

      if (!identityValid) {
        res.status(200).json(
          genericResponse,
        );
        return;
      }

      const rateLimited =
        await isPasswordResetRateLimited(
          user.id,
        );

      if (rateLimited) {
        /*
         * Keep the same generic response to avoid
         * leaking account information.
         */
        res.status(200).json(
          genericResponse,
        );
        return;
      }

      /*
       * Invalidate previous unused reset tokens
       * before creating a new one.
       */
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
            eq(
              passwordResetTokens.usedAt,
              null,
            ),
          ),
        );

      const otp =
        generatePasswordResetOtp();

      const otpHash =
        hashPasswordResetOtp(otp);

      const expiresAt = new Date(
        Date.now() +
          PASSWORD_RESET_OTP_TTL_MS,
      );

      const created =
        await db
          .insert(passwordResetTokens)
          .values({
            userId: user.id,
            otpHash,
            expiresAt,
            attempts: 0,
          })
          .returning({
            id: passwordResetTokens.id,
          });

      const resetToken =
        created[0];

      if (!resetToken) {
        throw new Error(
          "Unable to create password reset token.",
        );
      }

      /*
       * The actual delivery integration will be connected
       * to SMS/email later.
       *
       * Test mode is explicitly opt-in through an environment
       * variable and returns the OTP only for controlled testing.
       */
      if (PASSWORD_RESET_TEST_MODE) {
        res.status(200).json({
          ...genericResponse,
          reset_token_id:
            resetToken.id,
          test_otp: otp,
          expires_at:
            expiresAt.toISOString(),
        });
        return;
      }

      res.status(200).json(
        genericResponse,
      );
    } catch (error) {
      req.log.error(
        { error },
        "Password reset request failed",
      );

      /*
       * Do not expose internal database/authentication
       * details to the client.
       */
      res.status(200).json(
        genericResponse,
      );
    }
  },
);

/*
 * Verify OTP and set a new password.
 *
 * The reset token ID is not itself considered a secret.
 * The OTP hash, expiry, attempt count, and used state
 * are all enforced server-side.
 */
router.post(
  "/auth/password-reset/complete",
  async (req, res): Promise<void> => {
    const resetTokenId =
      typeof req.body?.resetTokenId ===
      "string"
        ? req.body.resetTokenId.trim()
        : "";

    const otp =
      typeof req.body?.otp === "string"
        ? req.body.otp.trim()
        : "";

    const newPassword =
      typeof req.body?.
