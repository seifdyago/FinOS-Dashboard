import { Router, type IRouter } from "express";

import healthRouter from "./health";
import authRouter from "./auth";
import onboardingRouter from "./onboarding";
import knowledgeFilesRouter from "./knowledge-files";
import platformAdminRouter from "./platform-admin";
import activityRouter from "./activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(onboardingRouter);
router.use(knowledgeFilesRouter);
router.use(platformAdminRouter);
router.use(activityRouter);

export default router;
