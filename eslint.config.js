import path from "node:path";
import { fileURLToPath } from "node:url";
import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const nextAppRoot = path.join(workspaceRoot, "apps/web");

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    settings: {
      next: {
        rootDir: nextAppRoot,
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    files: [
      "src/pdf/**/*.ts",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "apps/web/tests/**/*.ts",
      "apps/web/tests/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-useless-assignment": "warn",
    },
  },
  {
    files: ["src/engine/state/ny-it201-full-return.ts"],
    rules: {
      "no-useless-assignment": "warn",
    },
  },
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      ".local/",
      "apps/web/.next/",
      "apps/web/next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  }
);
