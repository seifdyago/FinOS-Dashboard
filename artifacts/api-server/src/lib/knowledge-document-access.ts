import type { KnowledgeDocumentRecord } from "@workspace/db";
import {
  canAccessEmployeePermission,
  type EmployeeAccessSubject,
} from "./subscription-access";
import type { SubscriptionLike } from "./subscription-plans";

export type KnowledgeDocumentScope = {
  organizationId: string;
  employeeId?: string | null;
};

export type KnowledgeFileUploader = {
  id: string;
  organizationId: string;
  status: string;
  role: string;
};

export type KnowledgeFileEmployee = EmployeeAccessSubject & {
  organizationId: string;
};

function normalized(value: string): string {
  return value.trim();
}

export function belongsToOrganization(
  document: Pick<KnowledgeDocumentRecord, "organizationId">,
  organizationId: string,
): boolean {
  return normalized(document.organizationId) === normalized(organizationId);
}

export function isAssociatedWithEmployee(
  document: Pick<KnowledgeDocumentRecord, "employeeId">,
  employeeId: string,
): boolean {
  return Boolean(document.employeeId && document.employeeId === normalized(employeeId));
}

export function isOwnedByUser(
  document: Pick<KnowledgeDocumentRecord, "uploadedByUserId">,
  userId: string,
): boolean {
  return Boolean(
    document.uploadedByUserId &&
      document.uploadedByUserId === normalized(userId),
  );
}

export function canUploadKnowledgeFile(
  subscription: SubscriptionLike | null | undefined,
  uploader: KnowledgeFileUploader,
  employee?: KnowledgeFileEmployee,
): boolean {
  if (uploader.status.trim().toLowerCase() !== "active") return false;
  if (!getSubscriptionPlanId(subscription)) return false;
  if (uploader.role.trim().toLowerCase() === "workspace admin") return true;
  return Boolean(
    employee &&
      employee.organizationId === uploader.organizationId &&
      canAccessEmployeePermission(subscription, employee, "manage:knowledge"),
  );
}

export function canAccessKnowledgeDocument(
  document: Pick<KnowledgeDocumentRecord, "organizationId" | "employeeId">,
  scope: KnowledgeDocumentScope,
): boolean {
  if (!belongsToOrganization(document, scope.organizationId)) return false;
  return document.employeeId === null || document.employeeId === scope.employeeId;
}

function getSubscriptionPlanId(subscription: SubscriptionLike | null | undefined): string | null {
  if (!subscription) return null;
  const status = subscription.status.trim().toLowerCase();
  const plan = subscription.plan.trim().toLowerCase();
  return (status === "active" || status === "trialing") &&
    (plan === "basic" || plan === "premium")
    ? plan
    : null;
}

export function canManageKnowledgeDocument(
  subscription: SubscriptionLike | null | undefined,
  employee: KnowledgeFileEmployee,
  organizationId: string,
  document?: Pick<KnowledgeDocumentRecord, "organizationId">,
): boolean {
  if (
    employee.organizationId.trim() !== organizationId.trim() ||
    (document && !belongsToOrganization(document, organizationId))
  ) {
    return false;
  }
  return canAccessEmployeePermission(subscription, employee, "manage:knowledge");
}