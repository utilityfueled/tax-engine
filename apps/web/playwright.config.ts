import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const appDir = import.meta.dirname;

function loadLocalEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const fileContents = readFileSync(filePath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile(path.resolve(appDir, ".env.local"));

const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3099";
const disableManagedWebServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === "true";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  /* Run tests serially to avoid overwhelming the dev server */
  workers: 1,
  /* Retry once to handle transient dev-server hiccups */
  retries: 1,
  use: {
    baseURL: playwrightBaseUrl,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: disableManagedWebServer
    ? undefined
    : {
        command: "rm -rf .next && pnpm dev --port 3099",
        port: 3099,
        reuseExistingServer: false,
        timeout: 60_000,
        cwd: appDir
      }
});
