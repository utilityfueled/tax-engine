import * as Sentry from "@sentry/nextjs";
import {
  resolvePublicSentryDsn,
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate
} from "@/lib/sentry";

const dsn = resolvePublicSentryDsn();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment(),
  tracesSampleRate: resolveSentryTracesSampleRate(),
  integrations: [Sentry.browserTracingIntegration()],
  sendDefaultPii: false
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
