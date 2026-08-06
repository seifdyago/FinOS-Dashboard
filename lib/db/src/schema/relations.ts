import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { departments } from "./departments";
import { employees } from "./employees";
import { subscriptions } from "./subscriptions";

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  users: many(users),
  departments: many(departments),
  employees: many(employees),
  subscription: one(subscriptions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
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
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
}));