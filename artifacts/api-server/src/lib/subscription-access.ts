import type { EmployeeRecord } from "@workspace/db";
import {
  getSubscriptionPlan,
  type SubscriptionLike,
  type SubscriptionPlanId,
} from "./subscription-plans";

export type EmployeeAccessSubject = Pick<EmployeeRecord, "employeeKey" | "role" | "department" | "permissions">;

export type SubscriptionAccess = {
  hasActiveSubscription: boolean;
  plan: SubscriptionPlanId | null;
  canAccessEmployee: (employee: EmployeeAccessSubject) => boolean;
  canAccessDepartment: (department: string) => boolean;
  canAccessEmployeePermission: (
    employee: EmployeeAccessSubject,
    permission: string,
  ) => boolean;
  hasAdvancedAccess: boolean;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function isActive(subscription: SubscriptionLike | null | undefined): boolean {
  return Boolean(subscription && ACTIVE_SUBSCRIPTION_STATUSES.has(normalized(subscription.status)));
}

export function createSubscriptionAccess(
  subscription: SubscriptionLike | null | undefined,
): SubscriptionAccess {
  const plan = subscription ? getSubscriptionPlan(normalized(subscription.plan)) : undefined;
  const hasActiveSubscription = isActive(subscription) && Boolean(plan);
  const premium = hasActiveSubscription && plan?.id === "premium";

  return {
    hasActiveSubscription,
    plan: hasActiveSubscription && plan ? (plan.id as SubscriptionPlanId) : null,
    canAccessEmployee: (employee) =>
      hasActiveSubscription &&
      Boolean(
        premium ||
          (plan?.id === "basic" &&
            (plan.employeeKeys.includes(employee.employeeKey as never) ||
              plan.employeeRoles.some((role) => normalized(role) === normalized(employee.role)))),
      ),
    canAccessDepartment: (department) =>
      Boolean(premium && normalized(department)),
    canAccessEmployeePermission: (employee, permission) => {
      if (!hasActiveSubscription || !permission.trim()) return false;
      if (premium) return true;
      return (
        plan?.id === "basic" &&
        (plan.employeeKeys.includes(employee.employeeKey as never) ||
          plan.employeeRoles.some((role) => normalized(role) === normalized(employee.role))) &&
        employee.permissions.some((candidate) => normalized(candidate) === normalized(permission))
      );
    },
    hasAdvancedAccess: Boolean(premium && plan?.includesAdvancedAccess),
  };
}

export function canAccessEmployee(
  subscription: SubscriptionLike | null | undefined,
  employee: EmployeeAccessSubject,
): boolean {
  return createSubscriptionAccess(subscription).canAccessEmployee(employee);
}

export function canAccessDepartment(
  subscription: SubscriptionLike | null | undefined,
  department: string,
): boolean {
  return createSubscriptionAccess(subscription).canAccessDepartment(department);
}

export function hasAdvancedAccess(
  subscription: SubscriptionLike | null | undefined,
): boolean {
  return createSubscriptionAccess(subscription).hasAdvancedAccess;
}