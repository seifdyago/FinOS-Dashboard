import { db, organizations, users, type Organization, type User } from "@workspace/db";
import { CreateCompanyOnboardingBody } from "@workspace/api-zod";
import { randomUUID } from "node:crypto";

export class CompanyDomainAlreadyExistsError extends Error {
  constructor() {
    super("A company account already exists for this email domain.");
    this.name = "CompanyDomainAlreadyExistsError";
  }
}

export type CompanyOnboardingInput = {
  name: string;
  email: string;
  industry: string;
  company_size: string;
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
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
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
  const localPart = normalizeEmail(email).split("@")[0] ?? "Admin";
  const name = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  return name || "Workspace Admin";
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || isUniqueViolation(candidate.cause);
}

export async function createCompanyOnboarding(
  input: CompanyOnboardingInput,
): Promise<CompanyOnboardingResult> {
  const parsed = CreateCompanyOnboardingBody.parse(input);
  const name = parsed.name.trim();
  const email = normalizeEmail(parsed.email);
  const industry = parsed.industry.trim();
  const companySize = parsed.company_size.trim();
  const domain = getEmailDomain(email);

  if (!name || !industry || !companySize) {
    throw new Error("Company name, industry, and company size are required.");
  }

  try {
    return await db.transaction(async (transaction) => {
      const [organization] = await transaction
        .insert(organizations)
        .values({
          id: randomUUID(),
          name,
          domain,
          initials: getInitials(name),
          industry,
          companySize,
          status: "active",
        })
        .returning();

      const [user] = await transaction
        .insert(users)
        .values({
          organizationId: organization.id,
          email,
          name: getAdminName(email),
          title: "Company administrator",
          role: "Workspace admin",
          status: "active",
        })
        .returning();

      return { organization, user };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CompanyDomainAlreadyExistsError();
    }
    throw error;
  }
}