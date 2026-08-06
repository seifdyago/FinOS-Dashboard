import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const usageMetrics = pgTable(
  "usage_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    value: integer("value").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationIndex: index("usage_metrics_organization_id_index").on(table.organizationId),
    metricTypeIndex: index("usage_metrics_metric_type_index").on(table.metricType),
    createdAtIndex: index("usage_metrics_created_at_index").on(table.createdAt),
  }),
);

export const insertUsageMetricSchema = createInsertSchema(usageMetrics);
export type InsertUsageMetric = typeof usageMetrics.$inferInsert;
export type UsageMetric = typeof usageMetrics.$inferSelect;