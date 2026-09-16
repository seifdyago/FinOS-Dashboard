import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  accountApplications,
  db,
  organizations,
  subscriptions,
  users,
} from "@workspace/db";
import {
  DecideAccountApplicationBody,
  DecideAccountApplicationHeader,
  DecideAccountApplicationParams,
  DecideAccountApplicationResponse,
  GetPlatformAnalyticsHeader,
  GetPlatformAnalyticsResponse,
  ListAccountApplicationsHeader,
  ListAccountApplicationsResponse,
} from "@workspace/api-zod";
import {
  PlatformAdminRequestError,
  requirePlatformAdminRequestContext,
} from "../lib/platform-admin-context";
import { getPlatformAnalytics } from "../lib/platform-analytics-service";

const router: IRouter = Router();

function applicationResponse(application: typeof accountApplications.$inferSelect) {
  return {
    id: application.id,
    applicant_name: application.applicantName,
    applicant_email: application.applicantEmail,
    applicant_phone: application.applicantPhone,
    company_name: application.companyName,
    company_domain: application.companyDomain,
    requested_plan: application.requestedPlan,
    document_reference: application.documentReference,
    document_type: application.documentType,
    verification_status: application.verificationStatus,
    verification_notes: application.verificationNotes,
    rejection_reason: application.rejectionReason,
    created_at: application.createdAt,
    reviewed_at: application.reviewedAt,
  };
}

router.get("/platform-admin/account-applications", async (req, res): Promise<void> => {
  const parsedHeaders = ListAccountApplicationsHeader.safeParse({
    "x-finos-platform-admin-email": req.header("x-finos-platform-admin-email"),
  });
  if (!parsedHeaders.success) {
    res.status(401).json({ error: "Platform admin identity is required." });
    return;
  }

  try {
    await requirePlatformAdminRequestContext(req);
    const applications = await db
      .select()
      .from(accountApplications)
      .orderBy(accountApplications.createdAt);
    res.json(ListAccountApplicationsResponse.parse(applications.map(applicationResponse)));
  } catch (error) {
    if (error instanceof PlatformAdminRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Account application list failed");
    res.status(500).json({ error: "Unable to load account applications." });
  }
});

router.post("/platform-admin/account-applications/:applicationId/decision", async (req, res): Promise<void> => {
  const parsedHeaders = DecideAccountApplicationHeader.safeParse({
    "x-finos-platform-admin-email": req.header("x-finos-platform-admin-email"),
  });
  const parsedParams = DecideAccountApplicationParams.safeParse(req.params);
  const parsedBody = DecideAccountApplicationBody.safeParse(req.body);
  if (!parsedHeaders.success || !parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "A valid application ID and decision are required." });
    return;
  }

  try {
    await requirePlatformAdminRequestContext(req);
    const reviewerEmail = req.header("x-finos-platform-admin-email")!.trim().toLowerCase();
    const [reviewer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, reviewerEmail))
      .limit(1);
    if (!reviewer) {
      res.status(403).json({ error: "Platform admin reviewer user was not found." });
      return;
    }

    const application = await db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(accountApplications)
        .where(eq(accountApplications.id, parsedParams.data.applicationId))
        .limit(1);
      if (!current) return null;
      if (current.verificationStatus !== "pending_review") {
        throw new Error("This account application has already been decided.");
      }

      const status = parsedBody.data.decision === "approved" ? "active" : "rejected";
      await transaction
        .update(organizations)
        .set({ status, updatedAt: new Date() })
        .where(eq(organizations.id, current.id));
      await transaction
        .update(users)
        .set({ status, updatedAt: new Date() })
        .where(eq(users.organizationId, current.id));
      await transaction
        .update(subscriptions)
        .set({ status, updatedAt: new Date() })
        .where(eq(subscriptions.organizationId, current.id));

      const [updated] = await transaction
        .update(accountApplications)
        .set({
          verificationStatus: parsedBody.data.decision,
          verificationNotes: parsedBody.data.notes?.trim() || null,
          rejectionReason:
            parsedBody.data.decision === "rejected"
              ? parsedBody.data.rejection_reason?.trim() || "Application rejected during security review."
              : null,
          reviewedByUserId: reviewer.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accountApplications.id, current.id),
            eq(accountApplications.verificationStatus, "pending_review"),
          ),
        )
        .returning();
      return updated;
    });

    if (!application) {
      res.status(404).json({ error: "Account application not found." });
      return;
    }
    res.json(DecideAccountApplicationResponse.parse(applicationResponse(application)));
  } catch (error) {
    if (error instanceof PlatformAdminRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unable to decide account application.";
    if (message.includes("already been decided")) {
      res.status(400).json({ error: message });
      return;
    }
    req.log.error({ error }, "Account application decision failed");
    res.status(500).json({ error: "Unable to decide account application." });
  }
});

router.get("/platform-admin/analytics", async (req, res): Promise<void> => {
  const parsedHeaders = GetPlatformAnalyticsHeader.safeParse({
    "x-finos-platform-admin-email": req.header("x-finos-platform-admin-email"),
  });
  if (!parsedHeaders.success) {
    res.status(401).json({ error: "Platform admin identity is required." });
    return;
  }

  try {
    await requirePlatformAdminRequestContext(req);
    const analytics = await getPlatformAnalytics();
    res.json(
      GetPlatformAnalyticsResponse.parse({
        summary: {
          total_companies: analytics.summary.totalCompanies,
          subscribed_companies: analytics.summary.subscribedCompanies,
          basic_subscriptions: analytics.summary.basicSubscriptions,
          premium_subscriptions: analytics.summary.premiumSubscriptions,
          monthly_expected_revenue_cents: analytics.summary.monthlyExpectedRevenueCents,
          active_companies: analytics.summary.activeCompanies,
          active_users: analytics.summary.activeUsers,
          total_employees: analytics.summary.totalEmployees,
          total_knowledge_files: analytics.summary.totalKnowledgeFiles,
          total_storage_bytes: analytics.summary.totalStorageBytes,
          total_ai_conversations: analytics.summary.totalAiConversations,
          total_ai_requests: analytics.summary.totalAiRequests,
          total_responses: analytics.summary.totalResponses,
          companies_registered_last_30_days: analytics.summary.companiesRegisteredLast30Days,
        },
        companies: analytics.companies.map((company) => ({
          id: company.id,
          name: company.name,
          registration_date: company.registrationDate,
          subscription_plan: company.subscriptionPlan,
          subscription_status: company.subscriptionStatus,
          monthly_price_cents: company.monthlyPriceCents,
          user_count: company.userCount,
          employee_count: company.employeeCount,
          ai_employee_count: company.aiEmployeeCount,
          knowledge_file_count: company.knowledgeFileCount,
          storage_bytes: company.storageBytes,
          last_activity: company.lastActivity,
          status: company.status,
          ai_conversations: company.aiConversations,
          ai_requests: company.aiRequests,
          responses: company.responses,
        })),
        recent_activity: analytics.recentActivity.map((event) => ({
          id: event.id,
          organization_id: event.organizationId,
          user_id: event.userId,
          event_type: event.eventType,
          metadata: event.metadata,
          created_at: event.createdAt,
        })),
      }),
    );
  } catch (error) {
    if (error instanceof PlatformAdminRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Platform analytics request failed");
    res.status(500).json({ error: "Unable to load platform analytics." });
  }
});

export default router;