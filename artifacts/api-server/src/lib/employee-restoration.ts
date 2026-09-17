import type { InsertEmployee } from "@workspace/db";

import { employees as sourceEmployees } from "../../../finos-ai/src/data/employees";
import { employeeRepository } from "./employee-repository";

type SourceEmployee = (typeof sourceEmployees)[number];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toInsertEmployee(employee: SourceEmployee): InsertEmployee {
  const source = employee as SourceEmployee & Record<string, unknown>;
  return {
    employeeKey: employee.id,
    name: employee.name,
    role: employee.role,
    department: employee.department,
    initials: employee.initials,
    color: employee.color,
    accent: employee.accent,
    status: employee.status,
    active: employee.active,
    metric: employee.metric,
    metricLabel: employee.metricLabel,
    description: employee.description,
    skills: asStringArray(employee.skills),
    responsibilities: asStringArray(source.responsibilities),
    permissions: asStringArray(employee.permissions),
    knowledge: asStringArray(employee.knowledge),
    knowledgeSource: employee.knowledgeSource,
    systemPrompt: typeof source.systemPrompt === "string" ? source.systemPrompt : null,
    personality: typeof source.personality === "string" ? source.personality : null,
    avatar: typeof source.avatar === "string" ? source.avatar : null,
    reportsTo: typeof source.reportsTo === "string" ? source.reportsTo : null,
    tools: asStringArray(source.tools),
    goals: asStringArray(source.goals),
    rules: asStringArray(source.rules),
    team: asStringArray(source.team),
    model: typeof source.model === "string" ? source.model : null,
    temperature: typeof source.temperature === "number" ? source.temperature : null,
    memoryEnabled: typeof source.memoryEnabled === "boolean" ? source.memoryEnabled : null,
    knowledgeEnabled: typeof source.knowledgeEnabled === "boolean" ? source.knowledgeEnabled : null,
    manager: employee.manager,
    performance: employee.performance,
    lastActive: employee.lastActive,
    tasks: asStringArray(employee.tasks),
  };
}

const restorationInputs = sourceEmployees.map(toInsertEmployee);

export async function restoreEmployeesForOrganization(organizationId: string) {
  return employeeRepository.upsertMany(organizationId, restorationInputs);
}

export const restoredEmployeeCount = restorationInputs.length;
