import { createInsertSchema } from "drizzle-zod";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  sessionTokenHash: text("session_token_hash").notNull(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  lastUsedAt: timestamp("last_used_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const insertAuthSessionSchema =
  createInsertSchema(authSessions);

export type InsertAuthSession =
  typeof authSessions.$inferInsert;

export type AuthSession =
  typeof authSessions.$inferSelect;
