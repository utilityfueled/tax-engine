import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateHostedRateLimitConfig } = await import("./lib/rate-limit");
    validateHostedRateLimitConfig();
    const { isHostedVercelPreviewEnvironment } = await import("./lib/hosted-runtime-safety");
    if (isHostedVercelPreviewEnvironment(process.env)) {
      console.info(JSON.stringify({
        event: "hosted-preview-runtime-identity-v1",
        node: process.versions.node,
        undici: process.versions.undici ?? null,
        arch: process.arch,
      }));
    }
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
