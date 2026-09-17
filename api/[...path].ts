type ExpressHandler = (req: any, res: any) => any;

type DynamicImport = (specifier: string) => Promise<{ default: ExpressHandler }>;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

let appPromise: Promise<ExpressHandler> | undefined;

function loadApp(): Promise<ExpressHandler> {
  appPromise ??= dynamicImport(
    "./server.mjs",
  ).then((module) => module.default);
  return appPromise;
}

export default async function handler(
  req: any,
  res: any,
): Promise<void> {
  const app = await loadApp();
  app(req, res);
}
