import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { resolveDeploymentMode } from "./deployment-mode";
import { isLoopbackHostname } from "./hosted-runtime-safety";
import { isRecoveryToken } from "./hosted-recovery-contract";
export { isRecoveryToken } from "./hosted-recovery-contract";

type RecoveryEnvironment = Record<string, string | undefined>;
const deliveryError = "Account recovery delivery is unavailable.";
const bareEmail = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/u;

export interface HostedRecoveryMailConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  password: string;
  from: string;
  appOrigin: string;
}

export function isRecoveryEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && bareEmail.test(value);
}

/** Return no usable configuration for partial or unsafe delivery settings. */
export function getHostedRecoveryMailConfig(env: RecoveryEnvironment = process.env): HostedRecoveryMailConfig | null {
  if (resolveDeploymentMode(env) !== "hosted") return null;
  const host = env.TAX_ENGINE_AUTH_SMTP_HOST?.trim();
  const rawPort = env.TAX_ENGINE_AUTH_SMTP_PORT?.trim();
  const user = env.TAX_ENGINE_AUTH_SMTP_USER?.trim();
  const password = env.TAX_ENGINE_AUTH_SMTP_PASSWORD;
  const from = env.TAX_ENGINE_AUTH_MAIL_FROM;
  if (!host || !rawPort || !user || !password?.trim() || !isRecoveryEmail(from)) return null;
  if (!/^[A-Za-z0-9.-]+$/u.test(host) && host !== "::1") return null;
  if (!/^\d{1,5}$/u.test(rawPort)) return null;
  const port = Number(rawPort);
  if (port < 1 || port > 65535) return null;
  let app: URL;
  try { app = new URL(env.TAX_ENGINE_APP_URL ?? ""); } catch { return null; }
  if (app.username || app.password || app.search || app.hash || app.pathname !== "/") return null;
  const insecureRequested = env.TAX_ENGINE_AUTH_SMTP_ALLOW_INSECURE_LOOPBACK === "true";
  const nonProduction = (env.NODE_ENV?.trim().toLowerCase() || "development") !== "production";
  const local = nonProduction && isLoopbackHostname(host) && isLoopbackHostname(app.hostname);
  if (insecureRequested && !local) return null;
  if (app.protocol !== "https:" && !(app.protocol === "http:" && local)) return null;
  return { host, port, user, password, from, appOrigin: app.origin,
    secure: port === 465, requireTLS: !insecureRequested };
}

interface RecoveryMessage { email: string; token: string }
interface PlainMessage { from: string; to: string; subject: string; text: string }
interface RecoveryTransport {
  sendMail(message: PlainMessage): Promise<{ accepted: unknown[]; rejected: unknown[] }>;
  close(): void;
}
interface RecoveryMailDependencies {
  createTransport?: (options: SMTPTransport.Options) => RecoveryTransport;
}

/** Only the account recipient and single-use token leave the server. Never log transport diagnostics. */
export async function sendHostedRecoveryMail(
  message: RecoveryMessage,
  env: RecoveryEnvironment = process.env,
  dependencies: RecoveryMailDependencies = {},
): Promise<void> {
  const config = getHostedRecoveryMailConfig(env);
  if (!config || !isRecoveryEmail(message.email) || !isRecoveryToken(message.token)) throw new Error(deliveryError);
  let transport: RecoveryTransport | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transport = (dependencies.createTransport ?? nodemailer.createTransport)({
      host: config.host, port: config.port, secure: config.secure, requireTLS: config.requireTLS,
      // Explicit loopback testing must not accidentally negotiate an untrusted TLS connection.
      ignoreTLS: !config.requireTLS,
      auth: { user: config.user, pass: config.password },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 5_000, greetingTimeout: 5_000, dnsTimeout: 5_000, socketTimeout: 10_000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
    const link = `${config.appOrigin}/account/recover#token=${message.token}`;
    const sent = await Promise.race([
      transport.sendMail({ from: config.from, to: message.email,
        subject: "Reset your Viva La Tax password",
        text: `Use this link to reset your password. It expires in 15 minutes.\n\n${link}\n\nIf you did not request this change, you can ignore this email.`,
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(deliveryError)), 15_000); }),
    ]);
    if (sent.rejected.length || sent.accepted.length !== 1 || sent.accepted[0] !== message.email) throw new Error(deliveryError);
  } catch {
    throw new Error(deliveryError);
  } finally {
    if (timer) clearTimeout(timer);
    // Even a transport close error must not expose a private SMTP diagnostic.
    try { transport?.close(); } catch { /* Delivery has already resolved or failed generically. */ }
  }
}
