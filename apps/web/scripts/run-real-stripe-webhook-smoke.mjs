import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const appDir = path.resolve(scriptDir, "..");
const envFilePath = path.join(appDir, ".env.local");
const localHost = "127.0.0.1";
const port = Number(process.env.TAX_ENGINE_WEBHOOK_SMOKE_PORT ?? "3099");
const baseUrl = `http://${localHost}:${port}`;
const webhookEvents = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted"
];

main().catch((error) => {
  console.error("[webhook-smoke] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const fileEnv = loadEnvFile(envFilePath);
  assertRequiredEnv(fileEnv, [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "DATABASE_URL",
    "STRIPE_PRICE_ID_STARTER_MONTHLY",
    "STRIPE_PRICE_ID_PLUS_MONTHLY"
  ]);

  if (await isHttpReachable(`${baseUrl}/billing`, 1_000)) {
    throw new Error(
      `port ${port} is already serving content. Stop the existing dev server or set TAX_ENGINE_WEBHOOK_SMOKE_PORT.`
    );
  }

  const stripe = new Stripe(fileEnv.STRIPE_SECRET_KEY, {
    apiVersion: "2026-03-25.dahlia"
  });

  let tunnelProcess;
  let devServerProcess;
  let webhookEndpointId = null;

  try {
    tunnelProcess = await startCloudflareTunnel();
    const tunnelUrl = await waitForTunnelUrl(tunnelProcess);

    const webhookEndpoint = await stripe.webhookEndpoints.create({
      url: `${tunnelUrl}/api/billing/webhook`,
      enabled_events: webhookEvents,
      description: "tax-engine local real webhook smoke"
    });
    webhookEndpointId = webhookEndpoint.id;

    console.log(`[webhook-smoke] tunnel ready at ${tunnelUrl}`);
    console.log(`[webhook-smoke] created Stripe webhook endpoint ${webhookEndpoint.id}`);

    devServerProcess = startDevServer({
      ...fileEnv,
      STRIPE_WEBHOOK_SECRET: webhookEndpoint.secret
    });

    await waitForHttpOk(`${baseUrl}/billing`, 90_000);
    await waitForHttpOk(`${tunnelUrl}/billing`, 90_000);

    await runCommand(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "tests/hosted-happy-paths.spec.ts",
        "-g",
        "real Stripe-delivered webhooks activate a hosted subscription after checkout success",
        "--project=chromium",
        "--reporter=line"
      ],
      {
        cwd: appDir,
        env: {
          ...process.env,
          ...fileEnv,
          PLAYWRIGHT_BASE_URL: baseUrl,
          PLAYWRIGHT_DISABLE_WEBSERVER: "true",
          STRIPE_WEBHOOK_SECRET: webhookEndpoint.secret,
          TAX_ENGINE_REAL_STRIPE_WEBHOOK_SMOKE: "true"
        }
      }
    );

    console.log("[webhook-smoke] real Stripe webhook smoke passed.");
  } finally {
    if (webhookEndpointId) {
      try {
        await stripe.webhookEndpoints.del(webhookEndpointId);
        console.log(`[webhook-smoke] deleted Stripe webhook endpoint ${webhookEndpointId}`);
      } catch (error) {
        console.error(
          `[webhook-smoke] could not delete Stripe webhook endpoint ${webhookEndpointId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    await stopChildProcess(devServerProcess, "dev server");
    await stopChildProcess(tunnelProcess, "cloudflared tunnel");
  }
}

function loadEnvFile(filePath) {
  const env = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    env[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
  }

  return env;
}

function assertRequiredEnv(env, keys) {
  for (const key of keys) {
    if (!env[key]) {
      throw new Error(`missing ${key} in ${envFilePath}`);
    }
  }
}

function startCloudflareTunnel() {
  return spawn("cloudflared", ["tunnel", "--url", baseUrl, "--no-autoupdate"], {
    cwd: appDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function waitForTunnelUrl(childProcess, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for cloudflared to print a public URL"));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[cloudflared] ${text}`);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu);

      if (match) {
        cleanup();
        resolve(match[0]);
      }
    };

    const onErrorData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(`[cloudflared] ${text}`);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu);

      if (match) {
        cleanup();
        resolve(match[0]);
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`cloudflared exited before exposing a URL (code ${code ?? "unknown"})`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      childProcess.stdout?.off("data", onData);
      childProcess.stderr?.off("data", onErrorData);
      childProcess.off("exit", onExit);
    };

    childProcess.stdout?.on("data", onData);
    childProcess.stderr?.on("data", onErrorData);
    childProcess.once("exit", onExit);
  });
}

function startDevServer(env) {
  const childProcess = spawn(
    "pnpm",
    ["dev", "--hostname", localHost, "--port", String(port)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  childProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[web] ${chunk.toString()}`);
  });
  childProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[web] ${chunk.toString()}`);
  });

  return childProcess;
}

async function waitForHttpOk(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReachable(url, 5_000)) {
      return;
    }

    await delay(1_000);
  }

  throw new Error(`timed out waiting for ${url}`);
}

async function isHttpReachable(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });

    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      ...options,
      stdio: "inherit"
    });

    childProcess.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function stopChildProcess(childProcess, label) {
  if (!childProcess || childProcess.exitCode !== null || childProcess.killed) {
    return;
  }

  childProcess.kill("SIGINT");

  const exited = await Promise.race([
    new Promise((resolve) => {
      childProcess.once("exit", () => resolve(true));
    }),
    delay(10_000).then(() => false)
  ]);

  if (!exited) {
    childProcess.kill("SIGKILL");
    await new Promise((resolve) => {
      childProcess.once("exit", () => resolve());
    });
  }

  console.log(`[webhook-smoke] stopped ${label}.`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
