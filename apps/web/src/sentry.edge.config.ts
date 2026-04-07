import * as Sentry from "@sentry/nextjs";
import {
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate,
  resolveServerSentryDsn
} from "@/lib/sentry";

const dsn = resolveServerSentryDsn();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment(),
  tracesSampleRate: resolveSentryTracesSampleRate(),
  sendDefaultPii: false
});
