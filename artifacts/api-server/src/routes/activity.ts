import { Router, type IRouter } from "express";
import {
  RecordActivityEventBody,
  RecordActivityEventHeader,
  RecordActivityEventResponse,
} from "@workspace/api-zod";
import { recordActivityEvent, recordUsageMetric } from "../lib/activity-service";
import {
  requireWorkspaceRequestContext,
  WorkspaceRequestError,
} from "../lib/workspace-request-context";

const router: IRouter = Router();

router.post("/activity/events", async (req, res): Promise<void> => {
  const headers = RecordActivityEventHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  const body = RecordActivityEventBody.safeParse(req.body);

  if (!headers.success || !body.success) {
    res.status(400).json({ error: "Invalid workspace activity event." });
    return;
  }

  try {
    const { organization, user } = await requireWorkspaceRequestContext(req);
    await recordActivityEvent({
      organizationId: organization.id,
      userId: user.id,
      eventType: body.data.event_type,
      metadata: body.data.metadata,
    });

    if (
      body.data.usage_metric_type &&
      body.data.usage_value != null &&
      Number.isInteger(body.data.usage_value)
    ) {
      await recordUsageMetric({
        organizationId: organization.id,
        metricType: body.data.usage_metric_type,
        value: body.data.usage_value,
      });
    }

    res.status(204).send(RecordActivityEventResponse.parse(undefined));
  } catch (error) {
    if (error instanceof WorkspaceRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Workspace activity event failed");
    res.status(500).json({ error: "Unable to record workspace activity." });
  }
});

export default router;