import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { departments } from "./departments";
import { employees } from "./employees";
import { subscriptions } from "./subscriptions";
import { knowledgeDocuments } from "./knowledge-documents";
import { activityEvents } from "./activity-events";
import { usageMetrics } from "./usage-metrics";

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  users: many(users),
  departments: many(departments),
  employees: many(employees),
  knowledgeDocuments: many(knowledgeDocuments),
  subscription: one(subscriptions),
  activityEvents: many(activityEvents),
  usageMetrics: many(usageMetrics),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  uploadedKnowledgeDocuments: many(knowledgeDocuments),
  activityEvents: many(activityEvents),
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