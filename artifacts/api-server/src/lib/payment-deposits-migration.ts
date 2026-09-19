import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

let ready = false;
let inFlight: Promise<void> | undefined;

export async function ensurePaymentDepositsTable(): Promise<void> {
  if (ready) return;
  if (inFlight) return inFlight;
  inFlight = db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_deposits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      plan text NOT NULL,
      amount_cents integer NOT NULL,
      payment_method text NOT NULL,
      transfer_reference text NOT NULL,
      receipt_reference text NOT NULL,
      receipt_type text NOT NULL,
      status text NOT NULL DEFAULT 'pending_review',
      review_notes text,
      reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `).then(() => {
    ready = true;
  }).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
