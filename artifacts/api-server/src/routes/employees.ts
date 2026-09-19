import { Router, type IRouter } from "express";

import { AUTH_SESSION_COOKIE, getAuthenticatedUser } from "../lib/auth-session";
import { restoreEmployeesForOrganization, restoredEmployeeCount } from "../lib/employee-restoration";
import { employeeRepository } from "../lib/employee-repository";
import { createSubscriptionAccess } from "../lib/subscription-access";
import { getEmployeeLimit } from "../lib/subscription-plans";
import { subscriptionRepository } from "../lib/subscription-repository";

const router: IRouter = Router();

function getSessionToken(cookieHeader: string | undefined): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE}=`))
    ?.slice(`${AUTH_SESSION_COOKIE}=`.length);
}

router.get("/employees", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(getSessionToken(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const [employees, subscription] = await Promise.all([
      restoreEmployeesForOrganization(user.organizationId),
      subscriptionRepository.findByOrganizationId(user.organizationId),
    ]);
    const access = createSubscriptionAccess(subscription);
    const isPlatformOwner = ["owner", "admin"].includes((user.platformAdminRole || "").trim().toLowerCase());
    if (!isPlatformOwner && (!access.hasActiveSubscription || !access.plan)) {
      res.status(403).json({ error: "An active subscription is required to access AI employees." });
      return;
    }
    const visibleEmployees = isPlatformOwner
      ? employees
      : employees.filter((employee) => access.canAccessEmployee(employee));
    res.status(200).json({
      employees: visibleEmployees,
      source_count: restoredEmployeeCount,
      plan: isPlatformOwner ? "platform_owner" : access.plan,
      employee_limit: isPlatformOwner ? null : getEmployeeLimit(access.plan),
      platform_owner: isPlatformOwner,
      employee_count: visibleEmployees.length,
    });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId }, "Employee restoration failed");
    res.status(500).json({ error: "Unable to load workspace AI employees." });
  }
});

router.post("/employees", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(getSessionToken(req.headers.cookie));
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const [existing, subscription] = await Promise.all([
      employeeRepository.listByOrganizationId(user.organizationId),
      subscriptionRepository.findByOrganizationId(user.organizationId),
    ]);
    const isPlatformOwner = ["owner", "admin"].includes((user.platformAdminRole || "").trim().toLowerCase());
    const access = createSubscriptionAccess(subscription);
    const limit = isPlatformOwner ? Number.POSITIVE_INFINITY : getEmployeeLimit(access.plan);
    if (!isPlatformOwner && (!access.hasActiveSubscription || !access.plan)) {
      res.status(403).json({ error: "An active subscription is required to add AI employees." });
      return;
    }
    if (existing.length >= limit) {
      res.status(409).json({ error: `Your subscription allows up to ${limit} AI employees. Upgrade to add more.` });
      return;
    }

    const body = req.body || {};
    const employeeKey = String(body.employeeKey || body.id || body.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    if (!employeeKey || !name || !role) {
      res.status(400).json({ error: "Employee name and role are required." });
      return;
    }
    if (existing.some((employee) => employee.employeeKey.toLowerCase() === employeeKey || employee.role.trim().toLowerCase() === role.toLowerCase())) {
      res.status(409).json({ error: "An employee with this key or role already exists." });
      return;
    }

    const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const [created] = await employeeRepository.upsertMany(user.organizationId, [{
      organizationId: user.organizationId,
      employeeKey,
      name,
      role,
      department: String(body.department || "Operations"),
      initials,
      color: String(body.color || "#5bd5ee"),
      accent: String(body.color || "#2a9eb7"),
      status: "Ready",
      active: true,
      metric: "•",
      metricLabel: "awaiting live data",
      description: String(body.description || `${role} operating with workspace context.`),
      skills: Array.isArray(body.skills) ? body.skills.map(String) : [],
      responsibilities: Array.isArray(body.responsibilities) ? body.responsibilities.map(String) : [],
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      knowledge: Array.isArray(body.knowledge) ? body.knowledge.map(String) : [],
      knowledgeSource: String(body.knowledgeSource || "Workspace context"),
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      personality: typeof body.personality === "string" ? body.personality : null,
      avatar: typeof body.avatar === "string" ? body.avatar : null,
      manager: String(body.manager || "Workspace admin"),
      performance: 0,
      lastActive: "Never",
      tasks: [],
    }]);
    res.status(201).json({ employee: created, employee_count: existing.length + 1, employee_limit: Number.isFinite(limit) ? limit : null });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId }, "Employee creation failed");
    res.status(500).json({ error: "Unable to add AI employee." });
  }
});

export default router;
