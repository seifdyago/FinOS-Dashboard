import { Router, type IRouter } from "express";
import {
  GetPlatformAnalyticsHeader,
  GetPlatformAnalyticsResponse,
} from "@workspace/api-zod";
import {
  PlatformAdminRequestError,
  requirePlatformAdminRequestContext,
} from "../lib/platform-admin-context";
import { getPlatformAnalytics } from "../lib/platform-analytics-service";

const router: IRouter = Router();

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