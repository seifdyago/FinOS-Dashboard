import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { hasDatabaseUrl, pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  if (!hasDatabaseUrl) {
    res.status(503).json({ status: "error", database: "not_configured" });
    return;
  }
  try {
    await pool.query("select 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({ ...data, database: "ok" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

export default router;
