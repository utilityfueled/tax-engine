import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

it("disables Sentry build analytics without changing the source map credential gate", () => {
  const source = readFileSync(resolve("apps/web/next.config.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const credentials of [false, true]) {
    const configure = vi.fn();
    const env = credentials ? { SENTRY_AUTH_TOKEN: "synthetic", SENTRY_ORG: "synthetic", SENTRY_PROJECT: "synthetic" } : {};
    new Script(compiled).runInNewContext({
      exports: {}, __dirname: resolve("apps/web"), process: { env },
      require: (name: string) => name === "@sentry/nextjs/config" ? { withSentryConfig: configure } : {},
    });
    expect(configure).toHaveBeenCalledOnce();
    expect(configure.mock.lastCall?.[1]).toMatchObject({ telemetry: false, sourcemaps: { disable: !credentials } });
  }
});
