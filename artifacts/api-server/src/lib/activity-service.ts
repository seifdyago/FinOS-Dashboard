import { desc, sql } from "drizzle-orm";
import {
  activityEvents,
  db,
  usageMetrics,
  type InsertActivityEvent,
  type InsertUsageMetric,
} from "@workspace/db";

export async function recordActivityEvent(
  input: Omit<InsertActivityEvent, "id" | "createdAt">,
): Promise<void> {
  await db.insert(activityEvents).values(input);
}

export async function recordUsageMetric(
  input: Omit<InsertUsageMetric, "id" | "createdAt">,
): Promise<void> {
  await db.insert(usageMetrics).values(input);
}

export async function getActivityAnalytics() {
  const [eventCounts, lastActivity, recentEvents] = await Promise.all([
    db
      .select({
        organizationId: activityEvents.organizationId,
        eventType: activityEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityEvents)
      .groupBy(activityEvents.organizationId, activityEvents.eventType),
    db
      .select({
        organizationId: activityEvents.organizationId,
        lastActivity: sql<Date | null>`max(${activityEvents.createdAt})`,
      })
      .from(activityEvents)
      .groupBy(activityEvents.organizationId),
    db
      .select({
        id: activityEvents.id,
        organizationId: activityEvents.organizationId,
        userId: activityEvents.userId,
        eventType: activityEvents.eventType,
        metadata: activityEvents.metadata,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .orderBy(desc(activityEvents.createdAt))
      .limit(25),
  ]);

  return {
    eventCounts,
    lastActivity,
    recentEvents,
  };
}

export async function getUsageAnalytics() {
  return db
    .select({
      organizationId: usageMetrics.organizationId,
      metricType: usageMetrics.metricType,
      value: sql<number>`sum(${usageMetrics.value})::int`,
    })
    .from(usageMetrics)
    .groupBy(usageMetrics.organizationId, usageMetrics.metricType);
}