import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  databaseUrlSource,
  hasDatabaseUrl,
  pool,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  if (!hasDatabaseUrl) {
    res.status(503).json({
      status: "error",
      database: "not_configured",
      databaseUrlSource,
    });
    return;
  }
  try {
    await pool.query("select 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({ ...data, database: "ok" });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown";
    res.status(503).json({
      status: "error",
      database: "unreachable",
      databaseUrlSource,
      errorCode: code,
    });
  }
});

export default router;
