import { createInsertSchema } from "drizzle-zod";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationIndex: index("activity_events_organization_id_index").on(table.organizationId),
    eventTypeIndex: index("activity_events_event_type_index").on(table.eventType),
    createdAtIndex: index("activity_events_created_at_index").on(table.createdAt),
  }),
);

export const insertActivityEventSchema = createInsertSchema(activityEvents);
export type InsertActivityEvent = typeof activityEvents.$inferInsert;
export type ActivityEvent = typeof activityEvents.$inferSelect;