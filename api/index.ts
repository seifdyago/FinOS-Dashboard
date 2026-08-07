/**
 * Vercel serverless entry point for the existing Express API.
 *
 * This file intentionally contains no routing logic of its own. It re-exports
 * the Express application from `@workspace/api-server` so that the exact same
 * app (and therefore the exact same `/api/*` paths, middlewares, tenant
 * isolation and platform-admin authorization) serves both the Replit long
 * running server and Vercel.
 *
 * The Express app mounts its router at `/api`, and `vercel.json` rewrites
 * `/api/:path*` to this function while preserving the original request URL,
 * so route matching is unchanged.
 */
import app from '@workspace/api-server/app';

export default app;
