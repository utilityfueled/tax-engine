type SentryEnvironment = Record<string, string | undefined>;

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

function readTrimmed(
  env: SentryEnvironment,
  key: keyof SentryEnvironment
) {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseSampleRate(value: string | null) {
  if (!value) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }

  return parsed;
}

export function resolvePublicSentryDsn(
  env: SentryEnvironment = process.env
) {
  return readTrimmed(env, "NEXT_PUBLIC_SENTRY_DSN");
}

export function resolveServerSentryDsn(
  env: SentryEnvironment = process.env
) {
  return readTrimmed(env, "SENTRY_DSN") || resolvePublicSentryDsn(env);
}

export function resolveSentryEnvironment(
  env: SentryEnvironment = process.env
) {
  return readTrimmed(env, "SENTRY_ENVIRONMENT")
    || readTrimmed(env, "NEXT_PUBLIC_SENTRY_ENVIRONMENT")
    || readTrimmed(env, "VERCEL_ENV")
    || readTrimmed(env, "NODE_ENV")
    || "development";
}

export function resolveSentryTracesSampleRate(
  env: SentryEnvironment = process.env
) {
  return parseSampleRate(
    readTrimmed(env, "SENTRY_TRACES_SAMPLE_RATE")
      || readTrimmed(env, "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE")
  );
}
