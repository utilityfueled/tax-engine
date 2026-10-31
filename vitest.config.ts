import { defineConfig } from "vitest/config";
import path from "path";

// V8 instrumentation slows the heaviest PDF and DOM cases past 5s on hosted
// runners. The normal unit job keeps the default deadline for real regressions.
const coverageRun = process.argv.includes("--coverage");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    globals: true,
    testTimeout: coverageRun ? 15_000 : 5_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/index.ts", "src/spec-validator.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@/app": path.resolve(__dirname, "apps/web/src/app"),
      "@/components": path.resolve(__dirname, "apps/web/src/components"),
      "@/lib": path.resolve(__dirname, "apps/web/src/lib"),
      "@": path.resolve(__dirname, "src"),
      "@spec": path.resolve(__dirname, "spec"),
      "@tax-engine/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@tax-engine/engine/src": path.resolve(__dirname, "packages/engine/src"),
      "@tax-engine/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
    },
  },
});
