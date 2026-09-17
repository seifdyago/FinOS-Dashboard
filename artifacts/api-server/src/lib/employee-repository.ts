import { and, asc, eq } from "drizzle-orm";
import {
  db,
  employees,
  type EmployeeRecord,
  type InsertEmployee,
} from "@workspace/db";

export type EmployeeRepository = {
  listByOrganizationId: (organizationId: string) => Promise<EmployeeRecord[]>;
  findByEmployeeKey: (
    organizationId: string,
    employeeKey: string,
  ) => Promise<EmployeeRecord | undefined>;
  upsertMany: (
    organizationId: string,
    employeeInputs: InsertEmployee[],
  ) => Promise<EmployeeRecord[]>;
};

function requireOrganizationId(organizationId: string): string {
  const normalized = organizationId.trim();

  if (!normalized) {
    throw new Error("organizationId is required");
  }

  return normalized;
}

function requireEmployeeKey(employeeKey: string): string {
  const normalized = employeeKey.trim();

  if (!normalized) {
    throw new Error("employeeKey is required");
  }

  return normalized;
}

function normalizeEmployeeInput(
  organizationId: string,
  employee: InsertEmployee,
): InsertEmployee {
  const employeeKey = requireEmployeeKey(employee.employeeKey);

  return {
    ...employee,
    organizationId,
    employeeKey,
  };
}

export const employeeRepository: EmployeeRepository = {
  async listByOrganizationId(organizationId) {
    const scopedOrganizationId = requireOrganizationId(organizationId);

    return db
      .select()
      .from(employees)
      .where(eq(employees.organizationId, scopedOrganizationId))
      .orderBy(asc(employees.employeeKey));
  },

  async findByEmployeeKey(organizationId, employeeKey) {
    const scopedOrganizationId = requireOrganizationId(organizationId);
    const scopedEmployeeKey = requireEmployeeKey(employeeKey);

    const [employee] = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, scopedOrganizationId),
          eq(employees.employeeKey, scopedEmployeeKey),
        ),
      )
      .limit(1);

    return employee;
  },

  async upsertMany(organizationId, employeeInputs) {
    const scopedOrganizationId = requireOrganizationId(organizationId);

    if (!Array.isArray(employeeInputs)) {
      throw new Error("employeeInputs must be an array");
    }

    if (employeeInputs.length === 0) {
      return [];
    }

    const normalizedEmployees = employeeInputs.map((employee) =>
      normalizeEmployeeInput(scopedOrganizationId, employee),
    );

    const results: EmployeeRecord[] = [];

    for (const employee of normalizedEmployees) {
      const [upsertedEmployee] = await db
        .insert(employees)
        .values(employee)
        .onConflictDoUpdate({
          target: [employees.organizationId, employees.employeeKey],
          set: {
            departmentId: employee.departmentId,
            managerEmployeeId: employee.managerEmployeeId,
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
            skills: employee.skills,
            responsibilities: employee.responsibilities,
            permissions: employee.permissions,
            knowledge: employee.knowledge,
            knowledgeSource: employee.knowledgeSource,
            systemPrompt: employee.systemPrompt,
            personality: employee.personality,
            avatar: employee.avatar,
            reportsTo: employee.reportsTo,
            tools: employee.tools,
            goals: employee.goals,
            rules: employee.rules,
            team: employee.team,
            model: employee.model,
            temperature: employee.temperature,
            memoryEnabled: employee.memoryEnabled,
            knowledgeEnabled: employee.knowledgeEnabled,
            manager: employee.manager,
            performance: employee.performance,
            lastActive: employee.lastActive,
            tasks: employee.tasks,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (upsertedEmployee) {
        results.push(upsertedEmployee);
      }
    }

    return results;
  },
};
