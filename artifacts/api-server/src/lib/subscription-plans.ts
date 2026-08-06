import type { Subscription } from "@workspace/db";

export const SUBSCRIPTION_PLANS = {
  basic: {
    id: "basic",
    name: "Basic",
    priceDollars: 1000,
    priceCents: 100_000,
    employeeKeys: ["ceo", "coo", "support", "hr-manager", "finance"] as const,
    employeeRoles: [
      "Chief Executive Officer",
      "Chief Operating Officer",
      "Customer Service",
      "Customer Support",
      "HR",
      "HR Manager",
      "Accounting",
      "Finance Operations",
    ] as const,
    includesAllEmployees: false,
    includesAllDepartments: false,
    includesAdvancedAccess: false,
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceDollars: 2000,
    priceCents: 200_000,
    employeeKeys: [] as const,
    employeeRoles: [] as const,
    includesAllEmployees: true,
    includesAllDepartments: true,
    includesAdvancedAccess: true,
  },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;
export type SubscriptionPlanDefinition = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlanId];
export type SubscriptionLike = Pick<Subscription, "plan" | "status">;

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "suspended"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function getSubscriptionPlan(plan: string): SubscriptionPlanDefinition | undefined {
  if (plan !== "basic" && plan !== "premium") return undefined;
  return SUBSCRIPTION_PLANS[plan];
}