import {
  accountApplications,
  db,
  organizations,
  subscriptions,
  users,
  type Organization,
  type User,
} from "@workspace/db";
import { CreateCompanyOnboardingBody } from "@workspace/api-zod";
import { randomUUID } from "node:crypto";

import { hashPassword } from "./password-auth";

export class CompanyDomainAlreadyExistsError extends Error {
  constructor() {
    super("A company account already exists for this email domain.");
    this.name = "CompanyDomainAlreadyExistsError";
  }
}

export type CompanyOnboardingInput = {
  name: string;
  email: string;
  password: string;
  industry: string;
  company_size: string;
  subscription: "basic" | "premium";
};

export type CompanyOnboardingResult = {
  organization: Organization;
  user: User;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string): string {
  const domain = normalizeEmail(email).split("@")[1] ?? "";

  if (
    !domain ||
    !domain.includes(".") ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    throw new Error("Enter a valid work email address.");
  }

  return domain;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAdminName(email: string): string {
  const localPart =
    normalizeEmail(email).split("@")[0] ?? "Admin";

  const name = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part[0].toUpperCase() + part.slice(1),
    )
    .join(" ");

  return name || "Workspace Admin";
}

function getSubscriptionPriceCents(
  plan: "basic" | "premium",
): number {
  return plan === "premium"
    ? 200_000
    : 100_000;
}

function isUniqueViolation(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
  };

  return (
    candidate.code === "23505" ||
    isUniqueViolation(candidate.cause)
  );
}

export async function createCompanyOnboarding(
  input: CompanyOnboardingInput,
): Promise<CompanyOnboardingResult> {
  const parsed =
    CreateCompanyOnboardingBody.parse(input);

  const name = parsed.name.trim();
  const email = normalizeEmail(parsed.email);
  const password = parsed.password;
  const industry = parsed.industry.trim();
  const companySize = parsed.company_size.trim();
  const subscription = parsed.subscription;
  const domain = getEmailDomain(email);

  if (
    !name ||
    !industry ||
    !companySize ||
    !password
  ) {
    throw new Error(
      "Company name, email, password, industry, and company size are required.",
    );
  }

  if (
    subscription !== "basic" &&
    subscription !== "premium"
  ) {
    throw new Error(
      "Please select a valid subscription plan.",
    );
  }

  /*
   * Passwords are hashed before they ever reach the database.
   * The plaintext password is never stored.
   */
  const {
    hash: passwordHash,
    salt: passwordSalt,
  } = hashPassword(password);

  const requestedPlan = subscription;
  const priceCents =
    getSubscriptionPriceCents(requestedPlan);

  try {
    return await db.transaction(async (transaction) => {
      /*
       * The account application ID is also used as the
       * organization ID.
       *
       * The application is created as pending_review and
       * must be approved by Security before the account
       * can
