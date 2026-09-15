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
  passwordHash: string;
  passwordSalt: string;
}> {
  if (
    password !== PLATFORM_OWNER_BOOTSTRAP_PASSWORD &&
    !isLegacyPlatformOwnerPassword(
      PLATFORM_OWNER_EMAIL,
      password,
    )
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
          .where(
            eq(
              users.email,
              PLATFORM_OWNER_EMAIL,
            ),
          )
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
             
