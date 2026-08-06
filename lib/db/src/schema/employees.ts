import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  index,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { departments } from "./departments";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeKey: text("employee_key").notNull(),
    departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
    managerEmployeeId: uuid("manager_employee_id"),
    name: text("name").notNull(),
    role: text("role").notNull(),
    department: text("department").notNull().default(""),
    initials: text("initials").notNull(),
    color: text("color").notNull(),
    accent: text("accent").notNull(),
    status: text("status"),
    active: boolean("active").notNull().default(true),
    metric: text("metric").notNull(),
    metricLabel: text("metric_label").notNull(),
    description: text("description").notNull(),
    skills: text("skills").array().notNull().default([]),
    responsibilities: text("responsibilities").array().notNull().default([]),
    permissions: text("permissions").array().notNull().default([]),
    knowledge: text("knowledge").array().notNull().default([]),
    knowledgeSource: text("knowledge_source").notNull().default(""),
    systemPrompt: text("system_prompt"),
    personality: text("personality"),
    avatar: text("avatar"),
    reportsTo: text("reports_to"),
    tools: text("tools").array().notNull().default([]),
    goals: text("goals").array().notNull().default([]),
    rules: text("rules").array().notNull().default([]),
    team: text("team").array().notNull().default([]),
    model: text("model"),
    temperature: real("temperature"),
    memoryEnabled: boolean("memory_enabled"),
    knowledgeEnabled: boolean("knowledge_enabled"),
    manager: text("manager").notNull().default("Workspace admin"),
    performance: integer("performance").notNull().default(0),
    lastActive: text("last_active").notNull().default("Never"),
    tasks: text("tasks").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationEmployeeKeyUnique: uniqueIndex("employees_organization_employee_key_unique").on(
      table.organizationId,
      table.employeeKey,
    ),
    departmentIndex: index("employees_department_id_index").on(table.departmentId),
  }),
);

export const insertEmployeeSchema = createInsertSchema(employees);
export type InsertEmployee = typeof employees.$inferInsert;
export type EmployeeRecord = typeof employees.$inferSelect;