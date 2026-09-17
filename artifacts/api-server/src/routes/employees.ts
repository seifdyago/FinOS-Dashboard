import { Router, type IRouter } from "express";

import { AUTH_SESSION_COOKIE, getAuthenticatedUser } from "../lib/auth-session";
import { restoreEmployeesForOrganization, restoredEmployeeCount } from "../lib/employee-restoration";
import { createSubscriptionAccess } from "../lib/subscription-access";
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
    if (!access.hasActiveSubscription || !access.plan) {
      res.status(403).json({ error: "An active subscription is required to access AI employees." });
      return;
    }
    const visibleEmployees = employees.filter((employee) => access.canAccessEmployee(employee));
    res.status(200).json({
      employees: visibleEmployees,
      source_count: restoredEmployeeCount,
      plan: access.plan,
      employee_count: visibleEmployees.length,
    });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId }, "Employee restoration failed");
    res.status(500).json({ error: "Unable to load workspace AI employees." });
  }
});

export default router;
