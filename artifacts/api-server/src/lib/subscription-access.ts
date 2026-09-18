import type { EmployeeRecord } from "@workspace/db";
import {
  getSubscriptionPlan,
  type SubscriptionLike,
  type SubscriptionPlanId,
} from "./subscription-plans.js";

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
  const activePlan = hasActiveSubscription ? plan : undefined;
  const fullAccess = Boolean(activePlan?.includesAllEmployees);

  return {
    hasActiveSubscription,
    plan: activePlan ? (activePlan.id as SubscriptionPlanId) : null,
    canAccessEmployee: (employee) => Boolean(
      activePlan &&
        (activePlan.includesAllEmployees ||
          activePlan.employeeKeys.includes(employee.employeeKey as never) ||
          activePlan.employeeRoles.some((role) => normalized(role) === normalized(employee.role))),
    ),
    canAccessDepartment: (department) =>
      Boolean(activePlan?.includesAllDepartments && normalized(department)),
    canAccessEmployeePermission: (employee, permission) => {
      if (!activePlan || !permission.trim()) return false;
      if (fullAccess) return true;
      return (
        (activePlan.employeeKeys.includes(employee.employeeKey as never) ||
          activePlan.employeeRoles.some((role) => normalized(role) === normalized(employee.role))) &&
        employee.permissions.some((candidate) => normalized(candidate) === normalized(permission))
      );
    },
    hasAdvancedAccess: Boolean(activePlan?.includesAdvancedAccess),
  };
}

export function canAccessEmployee(
  subscription: SubscriptionLike | null | undefined,
  employee: EmployeeAccessSubject,
): boolean {
  return createSubscriptionAccess(subscription).canAccessEmployee(employee);
}

export function canAccessEmployeePermission(
  subscription: SubscriptionLike | null | undefined,
  employee: EmployeeAccessSubject,
  permission: string,
): boolean {
  return createSubscriptionAccess(subscription).canAccessEmployeePermission(employee, permission);
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
