let appPromise: Promise<any> | undefined;

function loadApp(): Promise<any> {
  appPromise ??= import("./server.mjs").then(
    (module) => module.default,
  );
  return appPromise;
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const app = await loadApp();
    app(req, res);
  } catch (error) {
    console.error("API function startup failed", error);
    res.status(500).json({
      error: "api_boot_error",
      detail:
        error instanceof Error ? error.message : "Unknown API startup error",
    });
  }
}
