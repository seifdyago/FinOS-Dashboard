import { Router, type IRouter } from "express";
import {
  CompanyDomainAlreadyExistsError,
  createCompanyOnboarding,
} from "../lib/company-onboarding";
import {
  CreateCompanyOnboardingResponse,
  CreateCompanyOnboardingBody,
} from "@workspace/api-zod";
import { recordActivityEvent } from "../lib/activity-service";

const router: IRouter = Router();

router.post("/onboarding/companies", async (req, res): Promise<void> => {
  const parsed = CreateCompanyOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await createCompanyOnboarding(parsed.data);
    try {
      await recordActivityEvent({
        organizationId: result.organization.id,
        userId: result.user.id,
        eventType: "company_registered",
        metadata: { industry: result.organization.industry, companySize: result.organization.companySize },
      });
      await recordActivityEvent({
        organizationId: result.organization.id,
        userId: result.user.id,
        eventType: "subscription_activated",
        metadata: { plan: "basic", priceCents: 100_000 },
      });
    } catch (telemetryError) {
      req.log.warn({ error: telemetryError }, "Company onboarding telemetry could not be recorded");
    }

    res.status(201).json(
      CreateCompanyOnboardingResponse.parse({
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          domain: result.organization.domain,
          initials: result.organization.initials,
          industry: result.organization.industry,
          company_size: result.organization.companySize,
          status: result.organization.status,
        },
        user: {
          id: result.user.id,
          organization_id: result.user.organizationId,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          status: result.user.status,
        },
      }),
    );
  } catch (error) {
    if (error instanceof CompanyDomainAlreadyExistsError) {
      res.status(409).json({ error: error.message });
      return;
    }

    req.log.error({ error }, "Company onboarding failed");
    res.status(500).json({ error: "Unable to create the company workspace." });
  }
});

export default router;