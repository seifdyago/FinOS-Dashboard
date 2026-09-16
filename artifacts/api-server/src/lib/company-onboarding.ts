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
import { createHash, randomUUID } from "node:crypto";

import { hashPassword } from "./password-auth";
import { privateObjectStorage } from "./private-object-storage";

export class CompanyDomainAlreadyExistsError extends Error {
  constructor() {
    super("A company account already exists for this email domain.");
    this.name = "CompanyDomainAlreadyExistsError";
  }
}

export type CompanyOnboardingInput = {
  name: string;
  full_name: string;
  email: string;
  password: string;
  industry: string;
  company_size: string;
  subscription: "basic" | "premium";
  phone: string;
  idNumber: string;
  documentReference: string;
  documentType: string;
};

export type CompanyOnboardingResult = {
  organization: Organization;
  user: User;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string): string {
  const domain =
    normalizeEmail(email).split("@")[1] ?? "";

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
        part[0].toUpperCase() +
        part.slice(1),
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
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  return code === "23505";
}

export async function createCompanyOnboarding(
  input: CompanyOnboardingInput,
): Promise<CompanyOnboardingResult> {
  const parsed =
    CreateCompanyOnboardingBody.parse(input);

  const name = parsed.name.trim();
  const fullName = parsed.full_name.trim();
  const email = normalizeEmail(parsed.email);
  const password = parsed.password;
  const industry = parsed.industry.trim();
  const companySize =
    parsed.company_size.trim();
  const subscription =
    parsed.subscription;
  const phone = parsed.phone.trim().replace(/[^\d+]/g, "");
  const idNumber = parsed.idNumber.trim();
  const documentReference = parsed.documentReference.trim();
  const documentType = parsed.documentType.trim() || "identity_document";
  const domain =
    getEmailDomain(email);

  if (
    !name ||
    !fullName ||
    !industry ||
    !companySize ||
    !password ||
    !phone ||
    !/^\d{14}$/.test(idNumber) ||
    !documentReference
  ) {
    throw new Error(
      "Company name, email, password, industry, and company size are required.",
    );
  }

  if (
    !documentReference.startsWith("/objects/uploads/onboarding/") ||
    !(await privateObjectStorage.objectExists(documentReference))
  ) {
    throw new Error(
      "The uploaded identity document could not be verified in private storage.",
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
   * Passwords are hashed before they ever
   * reach the database.
   *
   * The plaintext password is never stored.
   */
  const {
    hash: passwordHash,
    salt: passwordSalt,
  } = hashPassword(password);

  const idNumberHash = createHash("sha256")
    .update(idNumber)
    .digest("hex");

  const requestedPlan =
    subscription;

  const priceCents =
    getSubscriptionPriceCents(
      requestedPlan,
    );

  try {
    return await db.transaction(
      async (transaction) => {
        /*
         * Create one application ID and use it
         * as the organization ID.
         */
        const applicationId =
          randomUUID();

        /*
         * Create the company organization.
         *
         * The account remains pending review
         * until the security/admin approval flow
         * changes its status.
         */
        const createdOrganizations =
          await transaction
            .insert(organizations)
            .values({
              id: applicationId,
              name,
              domain,
              initials:
                getInitials(name),
              industry,
              companySize,
              status:
                "pending_review",
            })
            .returning();

        const organization =
          createdOrganizations[0];

        if (!organization) {
          throw new Error(
            "Unable to create the company organization.",
          );
        }

        /*
         * Create the first workspace administrator.
         *
         * Only the password hash and salt are stored.
         * The plaintext password is never persisted.
         */
        const createdUsers =
          await transaction
            .insert(users)
            .values({
              organizationId:
                organization.id,
              email,
              name:
                fullName,
              role: "admin",
              passwordHash,
              passwordSalt,
              status:
                "pending_review",
            })
            .returning();

        const user =
          createdUsers[0];

        if (!user) {
          throw new Error(
            "Unable to create the company administrator.",
          );
        }

        /*
         * Create the subscription record.
         *
         * The subscription is also pending review
         * until the account is approved.
         */
        await transaction
          .insert(subscriptions)
          .values({
            organizationId:
              organization.id,
            plan: requestedPlan,
            status:
              "pending_review",
            priceCents,
          });

        /*
         * Create the security/account application.
         *
         * No password or authentication secret
         * is stored in this table.
         */
        await transaction
          .insert(accountApplications)
          .values({
            id: applicationId,
            organizationId:
              organization.id,
            applicantName:
              fullName,
            applicantEmail:
              email,
            applicantPhone:
              phone,
            idNumberHash,
            companyName:
              name,
            companyDomain:
              domain,
            industry,
            companySize,
            requestedPlan,
            documentReference,
            documentType,
            verificationStatus:
              "pending_review",
          });

        return {
          organization,
          user,
        };
      },
    );
  } catch (error) {
    /*
     * The organization domain is unique.
     *
     * Convert the database unique constraint
     * into the application-level error expected
     * by the onboarding route.
     */
    if (
      isUniqueViolation(error)
    ) {
      throw new CompanyDomainAlreadyExistsError();
    }

    throw error;
  }
}
