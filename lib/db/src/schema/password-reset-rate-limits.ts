import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const passwordResetRateLimits = pgTable("password_reset_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull().default(0),
});

export type PasswordResetRateLimit = typeof passwordResetRateLimits.$inferSelect;