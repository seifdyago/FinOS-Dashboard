import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("platform_admins_user_id_unique").on(table.userId),
  }),
);

export const insertPlatformAdminSchema = createInsertSchema(platformAdmins);
export type InsertPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;