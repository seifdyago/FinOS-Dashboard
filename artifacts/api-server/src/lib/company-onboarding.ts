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
  const localPart = normalizeEmail(email).split("@")[0] ?? "Admin";

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

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

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
  const parsed = CreateCompanyOnboardingBody.parse(input);

  const name = parsed.name.trim();
  const email = normalizeEmail(parsed.email);
  const industry = parsed.industry.trim();
  const companySize = parsed.company_size.trim();
  const domain = getEmailDomain(email);

  if (!name || !industry || !companySize) {
    throw new Error(
      "Company name, industry, and company size are required.",
    );
  }

  try {
    return await db.transaction(async (transaction) => {
      /*
       * The account application ID is also used as the organization ID.
       * This gives us a stable internal reference between the application
       * and the organization without exposing any sensitive document data.
       */
      const applicationId = randomUUID();

      const [application] = await transaction
        .insert(accountApplications)
        .values({
          id: applicationId,
          applicantName: getAdminName(email),
          applicantEmail: email,
          companyName: name,
          companyDomain: domain,
          industry,
          companySize,
          requestedPlan: "basic",
          verificationStatus: "pending_review",
        })
        .returning();

      if (!application) {
        throw new Error(
          "Unable to create the security review application.",
        );
      }

      /*
       * The organization exists only as a pending workspace.
       * It must NOT be treated as an active customer account until
       * a security reviewer approves the application.
       */
      const [organization] = await transaction
        .insert(organizations)
        .values({
          id: application.id,
          name,
          domain,
          initials: getInitials(name),
          industry,
          companySize,
          status: "pending_review",
        })
        .returning();

      if (!organization) {
        throw new Error(
          "Unable to create the pending organization.",
        );
      }

      /*
       * The initial admin user is also pending.
       * This prevents access before security approval.
       */
      const [user] = await transaction
        .insert(users)
        .values({
          organizationId: organization.id,
          email,
          name: getAdminName(email),
          title: "Company administrator",
          role: "Workspace admin",
          status: "pending_review",
        })
        .returning();

      if (!user) {
        throw new Error(
          "Unable to create the pending workspace administrator.",
        );
      }

      /*
       * Keep a subscription record for the requested plan, but it is
       * explicitly inactive until the security review is approved.
       */
      await transaction.insert(subscriptions).values({
        organizationId: organization.id,
        plan: "basic",
        status: "pending_review",
        priceCents: 100_000,
      });

      return {
        organization,
        user,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CompanyDomainAlreadyExistsError();
    }

    throw error;
  }
}
