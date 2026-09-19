import { Router, type IRouter } from "express";

import { AUTH_SESSION_COOKIE, getAuthenticatedUser } from "../lib/auth-session";
import { employeeRepository } from "../lib/employee-repository";

const router: IRouter = Router();

function getSessionToken(cookieHeader: string | undefined): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_SESSION_COOKIE}=`))
    ?.slice(`${AUTH_SESSION_COOKIE}=`.length);
}

/**
 * Integration/webhook boundary for automatic employee work.
 * There is intentionally no browser-facing manual task endpoint.
 */
router.post("/integrations/tasks", async (req, res): Promise<void> => {
  const configuredSecret = process.env.FINOS_INTEGRATION_WEBHOOK_SECRET;
  const suppliedSecret = req.headers["x-finos-integration-secret"];
  const secretMatches = configuredSecret && suppliedSecret === configuredSecret;
  const user = await getAuthenticatedUser(getSessionToken(req.headers.cookie));
  if (!secretMatches && !user) {
    res.status(401).json({ error: "A connected integration or authenticated workspace session is required." });
    return;
  }

  const body = req.body || {};
  const organizationId = user?.organizationId || String(body.organizationId || "").trim();
  const employeeKey = String(body.employeeKey || "").trim();
  const task = String(body.task || "").trim();
  const integration = String(body.integration || "").trim();
  if (!organizationId || !employeeKey || !task || !integration) {
    res.status(400).json({ error: "organizationId, employeeKey, task, and integration are required." });
    return;
  }

  try {
    const employee = await employeeRepository.findByEmployeeKey(organizationId, employeeKey);
    if (!employee) {
      res.status(404).json({ error: "Employee not found in this workspace." });
      return;
    }
    const currentTasks = Array.isArray(employee.tasks) ? employee.tasks.map(String) : [];
    if (currentTasks.includes(task)) {
      res.status(200).json({ accepted: true, duplicate: true, employeeKey, task });
      return;
    }
    const updated = await employeeRepository.upsertMany(organizationId, [{
      ...employee,
      organizationId,
      tasks: [...currentTasks, task],
      lastActive: "Just now",
      status: `Working via ${integration}`,
    }]);
    res.status(201).json({ accepted: true, duplicate: false, employee: updated[0], integration });
  } catch (error) {
    req.log.error({ error, employeeKey, integration }, "Integration task event failed");
    res.status(500).json({ error: "Unable to create the integration task." });
  }
});

export default router;
