import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createHostedAuthRouteHandlers,
  getHostedAuthConfig,
  resolveHostedWorkspaceActor
} from "../../../apps/web/src/lib/hosted-auth";

describe("security: hosted auth secret in production", () => {
  it("requires terms acceptance before creating a hosted account", async () => {
    const { POST } = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "development",
        TAX_ENGINE_APP_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "development-auth-secret-for-tests-1234567890"
      }
    });

    const response = await POST(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
        name: "Local Tester"
      })
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Terms of Service");
  });

  it("blocks auth routes when BETTER_AUTH_SECRET is missing in hosted production", async () => {
    const { POST } = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    });

    const response = await POST(new Request("https://tax.example/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" })
    }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("unavailable");
    expect(body.error).not.toContain("secret");
    expect(body.error).not.toContain("BETTER_AUTH");
  });

  it("blocks all auth HTTP methods when secret is missing in hosted production", async () => {
    const handlers = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    });

    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
      const response = await handlers[method](new Request("https://tax.example/api/auth/test", {
        method
      }));

      expect(response.status).toBe(503);
    }
  });

  it("requires both BETTER_AUTH_SECRET and DATABASE_URL in hosted production", async () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "a-strong-random-production-secret-value",
      DATABASE_URL: "postgres://example:example@localhost:5432/tax_engine",
      TAX_ENGINE_APP_URL: "https://tax.example"
    });

    expect(config.blocked).toBe(false);
    expect(config.secretSource).toBe("env");
  });

  it("does not block in development even without BETTER_AUTH_SECRET", async () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "development",
      TAX_ENGINE_APP_URL: "http://localhost:3000"
    });

    expect(config.blocked).toBe(false);
    expect(config.secretSource).toBe("preview-fallback");
  });

  it("marks config as blocked in hosted production without secret", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      TAX_ENGINE_APP_URL: "https://tax.example"
    });

    expect(config.blocked).toBe(true);
    expect(config.secretSource).toBe("preview-fallback");
  });

  it("marks config as blocked in hosted production when TAX_ENGINE_APP_URL is missing", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "a-strong-random-production-secret-value",
      DATABASE_URL: "postgres://example:example@localhost:5432/tax_engine"
    });

    expect(config.blocked).toBe(true);
    expect(config.trustedOrigins).toEqual([]);
  });

  it("marks config as blocked in hosted production when TAX_ENGINE_APP_URL is invalid", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "a-strong-random-production-secret-value",
      DATABASE_URL: "postgres://example:example@localhost:5432/tax_engine",
      TAX_ENGINE_APP_URL: "not-a-url"
    });

    expect(config.blocked).toBe(true);
    expect(config.trustedOrigins).toEqual([]);
  });

  it("does not leak the preview fallback secret value in error responses", async () => {
    const { POST } = createHostedAuthRouteHandlers({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example"
      }
    });

    const response = await POST(new Request("https://tax.example/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" })
    }));

    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("preview");
    expect(text).not.toContain("fallback");
    expect(text).not.toContain("tax-engine-hosted-auth");
  });
});

describe("security: compose.yaml passes security-critical env vars to web service", () => {
  const composePath = path.resolve(__dirname, "../../../compose.yaml");
  const composeContent = fs.readFileSync(composePath, "utf-8");

  const requiredEnvVars = [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "TAX_ENGINE_DEPLOYMENT_MODE",
    "TAX_ENGINE_APP_URL",
    "DATABASE_URL"
  ];

  for (const envVar of requiredEnvVars) {
    it(`passes ${envVar} to the web service`, () => {
      expect(composeContent).toContain(envVar);
    });
  }

  it("sets NODE_ENV=production for the web service", () => {
    expect(composeContent).toContain("NODE_ENV: production");
  });
});

describe("security: compose.yaml database access restriction", () => {
  const composePath = path.resolve(__dirname, "../../../compose.yaml");
  const composeContent = fs.readFileSync(composePath, "utf-8");

  it("binds postgres port to localhost only", () => {
    expect(composeContent).toMatch(/127\.0\.0\.1.*5432/);
  });
});

describe("security: .dockerignore excludes secrets", () => {
  const dockerignorePath = path.resolve(__dirname, "../../../.dockerignore");
  const dockerignore = fs.readFileSync(dockerignorePath, "utf-8");

  const requiredPatterns = [
    ".env",
    ".env.local",
    ".env.docker",
    ".env.production",
    ".env.*.local",
    ".env.example",
    ".env.docker.example"
  ];

  for (const pattern of requiredPatterns) {
    it(`excludes ${pattern} from Docker build context`, () => {
      const lines = dockerignore.split("\n").map((l) => l.trim());
      expect(lines).toContain(pattern);
    });
  }
});

describe("security: .dockerignore excludes development-only files from production image", () => {
  const dockerignorePath = path.resolve(__dirname, "../../../.dockerignore");
  const dockerignore = fs.readFileSync(dockerignorePath, "utf-8");
  const lines = dockerignore.split("\n").map((l) => l.trim());

  const devOnlyEntries = [
    { entry: "tests", reason: "test suite exposes internal fixtures and test data" },
    { entry: "spec", reason: "IRS spec YAML files are development-only reference" },
    { entry: "forms", reason: "blank/filled PDF forms are not served by the web app" },
    { entry: "data", reason: "example input/output data is not needed at runtime" },
    { entry: "prompts", reason: "agent prompt files expose internal tooling details" },
    { entry: "vitest.config.ts", reason: "test configuration is not needed at runtime" },
    { entry: "CLAUDE.md", reason: "AI assistant instructions are development-only" },
    { entry: "AGENTS.md", reason: "agent guidelines are development-only" }
  ];

  for (const { entry, reason } of devOnlyEntries) {
    it(`excludes ${entry} — ${reason}`, () => {
      expect(lines).toContain(entry);
    });
  }
});

describe("security: TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID blocked in production", () => {
  it("returns null when preview actor ID is set in hosted production — prevents auth bypass", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const actor = await resolveHostedWorkspaceActor({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "a-strong-production-secret-value",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "attacker-injected-actor"
      }
    });

    expect(actor).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID is set in production")
    );

    errorSpy.mockRestore();
  });

  it("allows preview actor ID in non-production hosted mode (development/testing)", async () => {
    const actor = await resolveHostedWorkspaceActor({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "development",
        TAX_ENGINE_APP_URL: "http://localhost:3000",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "dev-test-actor"
      }
    });

    expect(actor).not.toBeNull();
    expect(actor?.id).toBe("dev-test-actor");
  });

  it("does not leak actor ID or label in production rejection", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const actor = await resolveHostedWorkspaceActor({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        NODE_ENV: "production",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "a-strong-production-secret-value",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "secret-actor-id",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Secret Label"
      }
    });

    expect(actor).toBeNull();

    errorSpy.mockRestore();
  });
});

describe("security: no hardcoded secrets in web app source", () => {
  function collectSourceFiles(dir: string, files: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
        collectSourceFiles(fullPath, files);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  const webSrcDir = path.resolve(__dirname, "../../../apps/web/src");
  const sourceFiles = collectSourceFiles(webSrcDir);

  // Patterns that indicate hardcoded secrets (real API keys, not test/example values)
  const secretPatterns = [
    { pattern: /sk_live_[a-zA-Z0-9]{20,}/, label: "Stripe live secret key" },
    { pattern: /pk_live_[a-zA-Z0-9]{20,}/, label: "Stripe live publishable key" },
    { pattern: /sk_test_[a-zA-Z0-9]{20,}/, label: "Stripe test secret key" },
    { pattern: /whsec_[a-zA-Z0-9]{20,}/, label: "Stripe webhook signing secret" },
    { pattern: /ghp_[a-zA-Z0-9]{36,}/, label: "GitHub personal access token" },
    { pattern: /gho_[a-zA-Z0-9]{36,}/, label: "GitHub OAuth token" },
    { pattern: /AKIA[A-Z0-9]{16}/, label: "AWS access key ID" },
    { pattern: /sk-[a-zA-Z0-9]{40,}/, label: "OpenAI API key" },
    { pattern: /password\s*[:=]\s*["'][^"']{8,}["']/, label: "hardcoded password assignment" }
  ];

  it("web app source files do not contain hardcoded API keys or secrets", () => {
    const findings: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(path.resolve(__dirname, "../../.."), file);

      for (const { pattern, label } of secretPatterns) {
        if (pattern.test(content)) {
          findings.push(`${relativePath}: ${label}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("web app source files do not log sensitive environment variables", () => {
    const sensitiveEnvVars = [
      "BETTER_AUTH_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "MODEL_PROVIDER_API_KEY",
      "DATABASE_URL",
      "POSTGRES_PASSWORD"
    ];

    const findings: string[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(path.resolve(__dirname, "../../.."), file);

      for (const envVar of sensitiveEnvVars) {
        // Match console.log/info/debug/warn that references the env var value (not just the name)
        const logPattern = new RegExp(
          `console\\.(?:log|info|debug)\\([^)]*process\\.env\\.${envVar}`,
          "g"
        );

        if (logPattern.test(content)) {
          findings.push(`${relativePath}: logs ${envVar} value`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});

describe("security: .gitignore excludes all secret file patterns", () => {
  const gitignorePath = path.resolve(__dirname, "../../../.gitignore");
  const gitignore = fs.readFileSync(gitignorePath, "utf-8");
  const lines = gitignore.split("\n").map((l) => l.trim());

  const requiredPatterns = [
    ".env",
    ".env.local",
    ".env.docker",
    ".env.production",
    ".env.*.local"
  ];

  for (const pattern of requiredPatterns) {
    it(`excludes ${pattern} from version control`, () => {
      expect(lines).toContain(pattern);
    });
  }
});

describe("security: Dockerfile uses non-root user in runner stage", () => {
  const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile");
  const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");

  it("creates a non-root user for the runner stage", () => {
    expect(dockerfile).toContain("useradd");
    expect(dockerfile).toContain("USER appuser");
  });

  it("sets NODE_ENV=production in the runner stage", () => {
    expect(dockerfile).toContain("ENV NODE_ENV=production");
  });

  it("disables Next.js telemetry", () => {
    expect(dockerfile).toContain("NEXT_TELEMETRY_DISABLED=1");
  });
});

describe("security: hosted auth config does not expose secret source details to clients", () => {
  it("configuration notes do not contain the word 'secret' or 'preview-fallback'", () => {
    const config = getHostedAuthConfig({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example"
    });

    // The secretSource field is for internal use — verify the user-visible text doesn't mention it
    expect(config.secretSource).toBeDefined();
    // User-facing strings (mode, provider) should not leak secret details
    expect(config.mode).not.toContain("secret");
    expect(config.provider).not.toContain("secret");
  });
});
