import { Router, type IRouter } from "express";
import healthRouter from "./health";
import onboardingRouter from "./onboarding";
import knowledgeFilesRouter from "./knowledge-files";

const router: IRouter = Router();

router.use(healthRouter);
router.use(onboardingRouter);
router.use(knowledgeFilesRouter);

export default router;
