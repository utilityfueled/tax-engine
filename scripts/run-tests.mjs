import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = process.env.TAX_ENGINE_PDF_TEST_PYTHON || path.join(
  root, ".local", "pdf-test-venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
);
const probe = spawnSync(python, ["-c", "import pypdf; assert pypdf.__version__ == '6.10.0'"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error("PDF tests require Python and pinned pypdf. Run pnpm test:setup first, or set TAX_ENGINE_PDF_TEST_PYTHON to an equivalent environment.");
  process.exit(1);
}
const browser = process.argv[2] === "--browser";
const args = browser
  ? [path.join(root, "apps", "web", "node_modules", "@playwright", "test", "cli.js"), "test", ...process.argv.slice(3)]
  : [path.join(root, "node_modules", "vitest", "vitest.mjs"), ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, {
  cwd: browser ? path.join(root, "apps", "web") : root,
  env: { ...process.env, TAX_ENGINE_PDF_TEST_PYTHON: python },
  stdio: "inherit"
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
