import * as Sentry from "@sentry/nextjs";
import {
  resolvePublicSentryDsn,
  resolveSentryEnvironment
} from "@/lib/sentry";
import { PRIVATE_TELEMETRY_OPTIONS } from "@/lib/telemetry-privacy";

const dsn = resolvePublicSentryDsn();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment(),
  integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),
  ...PRIVATE_TELEMETRY_OPTIONS
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
