import { desc, gte, sql } from "drizzle-orm";
import {
  db,
  employees,
  knowledgeDocuments,
  organizations,
  subscriptions,
  users,
} from "@workspace/db";
import { getActivityAnalytics, getUsageAnalytics } from "./activity-service";

type CountRow = { organizationId: string; count: number };

function countByOrganization(rows: CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.organizationId, Number(row.count)]));
}

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getPlatformAnalytics() {
  const [
    organizationRows,
    subscriptionRows,
    userRows,
    employeeRows,
    knowledgeRows,
    activity,
    usageRows,
    recentOrganizations,
  ] = await Promise.all([
    db.select().from(organizations).orderBy(desc(organizations.createdAt)),
    db.select().from(subscriptions),
    db
      .select({
        organizationId: users.organizationId,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.organizationId),
    db
      .select({
        organizationId: employees.organizationId,
        count: sql<number>`count(*)::int`,
      })
      .from(employees)
      .groupBy(employees.organizationId),
    db
      .select({
        organizationId: knowledgeDocuments.organizationId,
        count: sql<number>`count(*)::int`,
        storageBytes: sql<number>`coalesce(sum(${knowledgeDocuments.sizeBytes}), 0)::int`,
      })
      .from(knowledgeDocuments)
      .where(sql`${knowledgeDocuments.documentType} = 'file'`)
      .groupBy(knowledgeDocuments.organizationId),
    getActivityAnalytics(),
    getUsageAnalytics(),
    db
      .select({ createdAt: organizations.createdAt })
      .from(organizations)
      .where(gte(organizations.createdAt, sql`now() - interval '30 days'`)),
  ]);

  const usersByOrganization = countByOrganization(userRows);
  const employeesByOrganization = countByOrganization(employeeRows);
  const knowledgeByOrganization = new Map(
    knowledgeRows.map((row) => [
      row.organizationId,
      { count: Number(row.count), storageBytes: Number(row.storageBytes) },
    ]),
  );
  const subscriptionsByOrganization = new Map(
    subscriptionRows.map((subscription) => [subscription.organizationId, subscription]),
  );
  const lastActivityByOrganization = new Map(
    activity.lastActivity.map((row) => [row.organizationId, row.lastActivity]),
  );
  const usageByOrganization = new Map<string, Map<string, number>>();
  for (const row of usageRows) {
    const metrics = usageByOrganization.get(row.organizationId) ?? new Map<string, number>();
    metrics.set(row.metricType, Number(row.value));
    usageByOrganization.set(row.organizationId, metrics);
  }

  const companies = organizationRows.map((organization) => {
    const subscription = subscriptionsByOrganization.get(organization.id);
    const knowledge = knowledgeByOrganization.get(organization.id) ?? { count: 0, storageBytes: 0 };
    const metrics = usageByOrganization.get(organization.id) ?? new Map<string, number>();
    return {
      id: organization.id,
      name: organization.name,
      registrationDate: toIsoTimestamp(organization.createdAt) as string,
      subscriptionPlan: subscription?.plan ?? "none",
      subscriptionStatus: subscription?.status ?? "none",
      monthlyPriceCents: subscription?.priceCents ?? 0,
      userCount: usersByOrganization.get(organization.id) ?? 0,
      employeeCount: employeesByOrganization.get(organization.id) ?? 0,
      aiEmployeeCount: employeesByOrganization.get(organization.id) ?? 0,
      knowledgeFileCount: knowledge.count,
      storageBytes: knowledge.storageBytes,
      lastActivity: toIsoTimestamp(lastActivityByOrganization.get(organization.id)),
      status: organization.status,
      aiConversations: metrics.get("ai_conversations") ?? 0,
      aiRequests: metrics.get("ai_requests") ?? 0,
      responses: metrics.get("responses") ?? 0,
    };
  });

  const activeSubscriptions = subscriptionRows.filter((subscription) =>
    ["active", "trialing"].includes(subscription.status.trim().toLowerCase()),
  );
  const basicSubscriptions = activeSubscriptions.filter(
    (subscription) => subscription.plan.trim().toLowerCase() === "basic",
  );
  const premiumSubscriptions = activeSubscriptions.filter(
    (subscription) => subscription.plan.trim().toLowerCase() === "premium",
  );
  const activeCompanies = organizationRows.filter(
    (organization) => organization.status.trim().toLowerCase() === "active",
  );
  const activeUsers = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.status} = 'active'`);
  const totalStorageBytes = companies.reduce((sum, company) => sum + company.storageBytes, 0);
  const totalAiConversations = companies.reduce((sum, company) => sum + company.aiConversations, 0);
  const totalAiRequests = companies.reduce((sum, company) => sum + company.aiRequests, 0);
  const totalResponses = companies.reduce((sum, company) => sum + company.responses, 0);

  return {
    summary: {
      totalCompanies: organizationRows.length,
      subscribedCompanies: activeSubscriptions.length,
      basicSubscriptions: basicSubscriptions.length,
      premiumSubscriptions: premiumSubscriptions.length,
      monthlyExpectedRevenueCents: activeSubscriptions.reduce(
        (sum, subscription) => sum + subscription.priceCents,
        0,
      ),
      activeCompanies: activeCompanies.length,
      activeUsers: Number(activeUsers[0]?.count ?? 0),
      totalEmployees: companies.reduce((sum, company) => sum + company.employeeCount, 0),
      totalKnowledgeFiles: companies.reduce((sum, company) => sum + company.knowledgeFileCount, 0),
      totalStorageBytes,
      totalAiConversations,
      totalAiRequests,
      totalResponses,
      companiesRegisteredLast30Days: recentOrganizations.length,
    },
    companies,
    recentActivity: activity.recentEvents.map((event) => ({
      id: event.id,
      organizationId: event.organizationId,
      userId: event.userId,
      eventType: event.eventType,
      metadata: event.metadata,
      createdAt: toIsoTimestamp(event.createdAt) as string,
    })),
  };
}