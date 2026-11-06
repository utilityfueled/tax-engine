import * as Sentry from "@sentry/nextjs";
import {
  resolveSentryEnvironment,
  resolveServerSentryDsn
} from "@/lib/sentry";
import { PRIVATE_TELEMETRY_OPTIONS } from "@/lib/telemetry-privacy";

const dsn = resolveServerSentryDsn();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment(),
  ...PRIVATE_TELEMETRY_OPTIONS
});
