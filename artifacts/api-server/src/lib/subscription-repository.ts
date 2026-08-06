import { eq } from "drizzle-orm";
import { db, subscriptions, type Subscription } from "@workspace/db";

export type SubscriptionRepository = {
  findByOrganizationId: (organizationId: string) => Promise<Subscription | undefined>;
};

function requireOrganizationId(organizationId: string): string {
  const normalized = organizationId.trim();
  if (!normalized) throw new Error("organizationId is required");
  return normalized;
}

export const subscriptionRepository: SubscriptionRepository = {
  async findByOrganizationId(organizationId) {
    const scopedOrganizationId = requireOrganizationId(organizationId);
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, scopedOrganizationId))
      .limit(1);
    return subscription;
  },
};