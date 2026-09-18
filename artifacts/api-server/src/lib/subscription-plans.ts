import type { Subscription } from "@workspace/db";

const LIMITED_EMPLOYEES = [
  "ceo",
  "fraud",
  "finance",
  "support",
  "compliance",
  "merchant-success",
  "hr-manager",
  "recruiter",
  "talent-acquisition-specialist",
  "learning-development-manager",
  "performance-manager",
  "payroll-manager",
  "sales-manager",
  "account-executive",
  "marketing-manager",
] as const;

export const SUBSCRIPTION_PLANS = {
  merchant_basic: {
    id: "merchant_basic",
    name: "Merchant Basic",
    priceDollars: 200,
    priceCents: 20_000,
    employeeKeys: ["support", "fraud", "hr-manager", "finance", "compliance"] as const,
    employeeRoles: [] as const,
    includesAllEmployees: false,
    includesAllDepartments: false,
    includesAdvancedAccess: false,
  },
  merchant_premium: {
    id: "merchant_premium",
    name: "Merchant Premium",
    priceDollars: 400,
    priceCents: 40_000,
    employeeKeys: LIMITED_EMPLOYEES,
    employeeRoles: [] as const,
    includesAllEmployees: false,
    includesAllDepartments: true,
    includesAdvancedAccess: true,
  },
  company_15: {
    id: "company_15",
    name: "Company 15",
    priceDollars: 300,
    priceCents: 30_000,
    employeeKeys: LIMITED_EMPLOYEES,
    employeeRoles: [] as const,
    includesAllEmployees: false,
    includesAllDepartments: true,
    includesAdvancedAccess: true,
  },
  company_32: {
    id: "company_32",
    name: "Company 32",
    priceDollars: 600,
    priceCents: 60_000,
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

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "suspended", "pending_review"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function getSubscriptionPlan(plan: string): SubscriptionPlanDefinition | undefined {
  // Keep existing production subscriptions working while new onboarding uses the explicit plans.
  if (plan === "basic") return SUBSCRIPTION_PLANS.merchant_basic;
  if (plan === "premium") return SUBSCRIPTION_PLANS.merchant_premium;
  if (!(plan in SUBSCRIPTION_PLANS)) return undefined;
  return SUBSCRIPTION_PLANS[plan as SubscriptionPlanId];
}
