import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    /*
     * Never store the OTP itself.
     * Only a SHA-256 hash of the OTP is persisted.
     */
    otpHash: text("otp_hash").notNull(),

    /*
     * OTP lifetime is enforced server-side.
     */
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    /*
     * Number of verification attempts made
     * against this reset request.
     */
    attempts: integer("attempts")
      .notNull()
      .default(0),

    /*
     * Once used, the token can never be reused.
     */
    usedAt: timestamp("used_at", {
      withTimezone: true,
    }),

    resetTokenHash: text("reset_token_hash"),

    resetTokenExpiresAt: timestamp("reset_token_expires_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIndex: index("password_reset_tokens_user_id_idx").on(table.userId),
    resetTokenHashIndex: index("password_reset_tokens_reset_token_hash_idx").on(table.resetTokenHash),
  }),
);

export const insertPasswordResetTokenSchema =
  createInsertSchema(passwordResetTokens);

export type InsertPasswordResetToken =
  typeof passwordResetTokens.$inferInsert;

export type PasswordResetToken =
  typeof passwordResetTokens.$inferSelect;
