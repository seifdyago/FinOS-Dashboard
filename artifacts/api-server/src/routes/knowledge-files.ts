import { Router, type IRouter } from "express";
import {
  DeleteKnowledgeFileHeader,
  DeleteKnowledgeFileParams,
  FinalizeKnowledgeFileBody,
  FinalizeKnowledgeFileHeader,
  FinalizeKnowledgeFileResponse,
  GetKnowledgeFileDownloadUrlHeader,
  GetKnowledgeFileDownloadUrlParams,
  GetKnowledgeFileDownloadUrlResponse,
  ListKnowledgeFilesHeader,
  ListKnowledgeFilesResponse,
  RequestKnowledgeFileUploadUrlBody,
  RequestKnowledgeFileUploadUrlHeader,
  RequestKnowledgeFileUploadUrlResponse,
} from "@workspace/api-zod";
import {
  deleteKnowledgeFile,
  finalizeKnowledgeFile,
  getKnowledgeFileDownloadUrl,
  listKnowledgeFiles,
  requestKnowledgeFileUpload,
} from "../lib/knowledge-file-service";
import {
  requireWorkspaceRequestContext,
  WorkspaceRequestError,
} from "../lib/workspace-request-context";

const router: IRouter = Router();

router.post("/knowledge/files/upload-url", async (req, res): Promise<void> => {
  if (!hasWorkspaceIdentity(req)) {
    res.status(401).json({ error: "Workspace identity is required." });
    return;
  }
  const headers = RequestKnowledgeFileUploadUrlHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  const body = RequestKnowledgeFileUploadUrlBody.safeParse(req.body);
  if (!headers.success || !body.success) {
    res.status(400).json({ error: "Invalid workspace identity or file metadata." });
    return;
  }

  try {
    const { user } = await requireWorkspaceRequestContext(req);
    const result = await requestKnowledgeFileUpload(user, {
      originalFileName: body.data.original_file_name,
      mimeType: body.data.mime_type,
      sizeBytes: body.data.size_bytes,
      employeeKey: body.data.employee_key,
    });
    res.json(
      RequestKnowledgeFileUploadUrlResponse.parse({
        upload_url: result.uploadUrl,
        storage_key: result.objectPath,
      }),
    );
  } catch (error) {
    respondKnowledgeError(req, res, error, "Unable to create the upload URL.");
  }
});

router.get("/knowledge/files", async (req, res): Promise<void> => {
  if (!hasWorkspaceIdentity(req)) {
    res.status(401).json({ error: "Workspace identity is required." });
    return;
  }
  const headers = ListKnowledgeFilesHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  if (!headers.success) {
    res.status(400).json({ error: "Workspace identity is required." });
    return;
  }

  try {
    const { user } = await requireWorkspaceRequestContext(req);
    if (user.role.trim().toLowerCase() !== "workspace admin") {
      res.status(403).json({ error: "Only workspace admins can manage company knowledge files." });
      return;
    }
    const files = await listKnowledgeFiles(user);
    res.json(
      ListKnowledgeFilesResponse.parse(
        files.map((file) => ({
          id: file.id,
          original_file_name: file.originalFileName,
          file_type: file.fileType,
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
          storage_key: file.storageKey,
          uploaded_by_user_id: file.uploadedByUserId,
          uploader_name: file.uploaderName,
          created_at: file.createdAt.toISOString(),
          employee_id: file.employeeId,
          employee_name: file.employeeName,
          status: file.status,
        })),
      ),
    );
  } catch (error) {
    respondKnowledgeError(req, res, error, "Unable to list company knowledge files.");
  }
});

router.post("/knowledge/files/finalize", async (req, res): Promise<void> => {
  if (!hasWorkspaceIdentity(req)) {
    res.status(401).json({ error: "Workspace identity is required." });
    return;
  }
  const headers = FinalizeKnowledgeFileHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  const body = FinalizeKnowledgeFileBody.safeParse(req.body);
  if (!headers.success || !body.success) {
    res.status(400).json({ error: "Invalid workspace identity or file metadata." });
    return;
  }

  try {
    const { user } = await requireWorkspaceRequestContext(req);
    const file = await finalizeKnowledgeFile(user, {
      originalFileName: body.data.original_file_name,
      mimeType: body.data.mime_type,
      sizeBytes: body.data.size_bytes,
      objectPath: body.data.storage_key,
      employeeKey: body.data.employee_key,
    });
    const files = await listKnowledgeFiles(user);
    const response = files.find((candidate) => candidate.id === file.id);
    if (!response) {
      res.status(500).json({ error: "Uploaded file metadata could not be loaded." });
      return;
    }
    res.status(201).json(
      FinalizeKnowledgeFileResponse.parse({
        id: response.id,
        original_file_name: response.originalFileName,
        file_type: response.fileType,
        mime_type: response.mimeType,
        size_bytes: response.sizeBytes,
        storage_key: response.storageKey,
        uploaded_by_user_id: response.uploadedByUserId,
        uploader_name: response.uploaderName,
        created_at: response.createdAt.toISOString(),
        employee_id: response.employeeId,
        employee_name: response.employeeName,
        status: response.status,
      }),
    );
  } catch (error) {
    respondKnowledgeError(req, res, error, "Unable to save uploaded file metadata.");
  }
});

router.get("/knowledge/files/:fileId/download-url", async (req, res): Promise<void> => {
  if (!hasWorkspaceIdentity(req)) {
    res.status(401).json({ error: "Workspace identity is required." });
    return;
  }
  const headers = GetKnowledgeFileDownloadUrlHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  const params = GetKnowledgeFileDownloadUrlParams.safeParse(req.params);
  if (!headers.success || !params.success) {
    res.status(400).json({ error: "Invalid workspace identity or file ID." });
    return;
  }

  try {
    const { user } = await requireWorkspaceRequestContext(req);
    const downloadUrl = await getKnowledgeFileDownloadUrl(user, params.data.fileId);
    res.json(GetKnowledgeFileDownloadUrlResponse.parse({ download_url: downloadUrl }));
  } catch (error) {
    respondKnowledgeError(req, res, error, "Unable to create the download URL.");
  }
});

router.delete("/knowledge/files/:fileId", async (req, res): Promise<void> => {
  if (!hasWorkspaceIdentity(req)) {
    res.status(401).json({ error: "Workspace identity is required." });
    return;
  }
  const headers = DeleteKnowledgeFileHeader.safeParse({
    "x-finos-organization-id": req.header("x-finos-organization-id"),
    "x-finos-user-email": req.header("x-finos-user-email"),
  });
  const params = DeleteKnowledgeFileParams.safeParse(req.params);
  if (!headers.success || !params.success) {
    res.status(400).json({ error: "Invalid workspace identity or file ID." });
    return;
  }

  try {
    const { user } = await requireWorkspaceRequestContext(req);
    await deleteKnowledgeFile(user, params.data.fileId);
    res.sendStatus(204);
  } catch (error) {
    respondKnowledgeError(req, res, error, "Unable to delete the knowledge file.");
  }
});

function respondKnowledgeError(
  req: { log: { error: (context: object, message: string) => void } },
  res: { status: (code: number) => { json: (body: object) => void } },
  error: unknown,
  fallback: string,
): void {
  if (error instanceof WorkspaceRequestError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error({ error }, fallback);
  const message = error instanceof Error ? error.message : fallback;
  const status = message.includes("permission") || message.includes("subscription")
    ? 403
    : message.includes("not found")
      ? 404
      : 400;
  res.status(status).json({ error: message });
}

function hasWorkspaceIdentity(req: {
  header: (name: string) => string | undefined;
}): boolean {
  return Boolean(
    req.header("x-finos-organization-id")?.trim() &&
      req.header("x-finos-user-email")?.trim(),
  );
}

export default router;