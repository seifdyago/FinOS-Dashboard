import { relations } from "drizzle-orm";
import { organizations } from "./organizations.js";
import { users } from "./users.js";
import { departments } from "./departments.js";
import { employees } from "./employees.js";
import { subscriptions } from "./subscriptions.js";
import { knowledgeDocuments } from "./knowledge-documents.js";
import { activityEvents } from "./activity-events.js";
import { usageMetrics } from "./usage-metrics.js";
import { accountApplications } from "./account-applications.js";
import { paymentDeposits } from "./payment-deposits.js";

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  users: many(users),
  departments: many(departments),
  employees: many(employees),
  knowledgeDocuments: many(knowledgeDocuments),
  subscription: one(subscriptions),
  activityEvents: many(activityEvents),
  usageMetrics: many(usageMetrics),
  paymentDeposits: many(paymentDeposits),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  uploadedKnowledgeDocuments: many(knowledgeDocuments),
  activityEvents: many(activityEvents),
  reviewedAccountApplications: many(accountApplications),
  submittedPaymentDeposits: many(paymentDeposits, { relationName: "deposit_submitter" }),
  reviewedPaymentDeposits: many(paymentDeposits, { relationName: "deposit_reviewer" }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.organizationId],
    references: [organizations.id],
  }),
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [employees.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  manager: one(employees, {
    fields: [employees.managerEmployeeId],
    references: [employees.id],
    relationName: "employee_manager",
  }),
  reports: many(employees, { relationName: "employee_manager" }),
  knowledgeDocuments: many(knowledgeDocuments),
}));

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one }) => ({
  organization: one(organizations, {
    fields: [knowledgeDocuments.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [knowledgeDocuments.employeeId],
    references: [employees.id],
  }),
  uploadedBy: one(users, {
    fields: [knowledgeDocuments.uploadedByUserId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
}));

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [activityEvents.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [activityEvents.userId],
    references: [users.id],
  }),
}));

export const usageMetricsRelations = relations(usageMetrics, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageMetrics.organizationId],
    references: [organizations.id],
  }),
}));

export const accountApplicationsRelations = relations(
  accountApplications,
  ({ one }) => ({
    reviewedBy: one(users, {
      fields: [accountApplications.reviewedByUserId],
      references: [users.id],
    }),
  }),
);

export const paymentDepositsRelations = relations(paymentDeposits, ({ one }) => ({
  organization: one(organizations, { fields: [paymentDeposits.organizationId], references: [organizations.id] }),
  submittedBy: one(users, { fields: [paymentDeposits.submittedByUserId], references: [users.id], relationName: "deposit_submitter" }),
  reviewedBy: one(users, { fields: [paymentDeposits.reviewedByUserId], references: [users.id], relationName: "deposit_reviewer" }),
}));
