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
  ...PRIVATE_TELEMETRY_OPTIONS
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
