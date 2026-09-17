import { Router, type IRouter } from "express";

import { AUTH_SESSION_COOKIE, getAuthenticatedUser } from "../lib/auth-session";
import { restoreEmployeesForOrganization, restoredEmployeeCount } from "../lib/employee-restoration";

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
    const employees = await restoreEmployeesForOrganization(user.organizationId);
    res.status(200).json({ employees, source_count: restoredEmployeeCount });
  } catch (error) {
    req.log.error({ error, organizationId: user.organizationId }, "Employee restoration failed");
    res.status(500).json({ error: "Unable to load workspace AI employees." });
  }
});

export default router;
