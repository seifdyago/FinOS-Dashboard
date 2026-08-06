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

export function canAccessKnowledgeDocument(
  document: Pick<KnowledgeDocumentRecord, "organizationId" | "employeeId">,
  scope: KnowledgeDocumentScope,
): boolean {
  if (!belongsToOrganization(document, scope.organizationId)) return false;
  return document.employeeId === null || document.employeeId === scope.employeeId;
}

export function canManageKnowledgeDocument(
  subscription: SubscriptionLike | null | undefined,
  employee: EmployeeAccessSubject,
  organizationId: string,
  document?: Pick<KnowledgeDocumentRecord, "organizationId">,
): boolean {
  if (document && !belongsToOrganization(document, organizationId)) return false;
  return canAccessEmployeePermission(subscription, employee, "manage:knowledge");
}