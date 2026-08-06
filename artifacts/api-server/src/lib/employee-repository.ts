import { and, asc, eq } from "drizzle-orm";
import { db, employees, type EmployeeRecord } from "@workspace/db";

export type EmployeeRepository = {
  listByOrganizationId: (organizationId: string) => Promise<EmployeeRecord[]>;
  findByEmployeeKey: (
    organizationId: string,
    employeeKey: string,
  ) => Promise<EmployeeRecord | undefined>;
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
};