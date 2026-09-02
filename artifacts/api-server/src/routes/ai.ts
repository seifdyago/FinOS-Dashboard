import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";

import { logger } from "./lib/logger.js";
import healthRouter from "./routes/health.js";
import activityRouter from "./routes/activity.js";
import knowledgeFilesRouter from "./routes/knowledge-files.js";
import onboardingRouter from "./routes/onboarding.js";
import platformAdminRouter from "./routes/platform-admin.js";
import aiRouter from "./routes/ai.js";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// API Routes
app.use("/api/health", healthRouter);
app.use("/api/activity", activityRouter);
app.use("/api/knowledge-files", knowledgeFilesRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/platform-admin", platformAdminRouter);

// Gemini 1.5 AI Chat Route
app.use("/api/ai", aiRouter);

export default app;
