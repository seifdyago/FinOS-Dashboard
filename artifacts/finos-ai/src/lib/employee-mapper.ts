import type { Employee } from "@/types/employee";
import type { EmployeeRecord } from "@workspace/db";

export function mapPersistedEmployeeToEmployee(record: EmployeeRecord): Employee {
  return {
    id: record.employeeKey,
    name: record.name,
    role: record.role,
    department: record.department,
    initials: record.initials,
    color: record.color,
    accent: record.accent,
    status: record.status ?? undefined,
    active: record.active,
    metric: record.metric,
    metricLabel: record.metricLabel,
    description: record.description,
    skills: record.skills,
    responsibilities: record.responsibilities,
    permissions: record.permissions,
    knowledge: record.knowledge,
    knowledgeSource: record.knowledgeSource,
    systemPrompt: record.systemPrompt ?? undefined,
    personality: record.personality ?? undefined,
    avatar: record.avatar ?? undefined,
    reportsTo: record.reportsTo ?? undefined,
    tools: record.tools,
    goals: record.goals,
    rules: record.rules,
    team: record.team,
    model: record.model ?? undefined,
    temperature: record.temperature ?? undefined,
    memoryEnabled: record.memoryEnabled ?? undefined,
    knowledgeEnabled: record.knowledgeEnabled ?? undefined,
    manager: record.manager,
    performance: record.performance,
    lastActive: record.lastActive,
    tasks: record.tasks,
  };
}

export function mapPersistedEmployeesToEmployees(
  records: EmployeeRecord[],
): Employee[] {
  return records.map(mapPersistedEmployeeToEmployee);
}