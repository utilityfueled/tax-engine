import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import { pdfTestPythonProbeArgs, resolvePdfTestEnvironment } from "./pdf-test-prerequisite.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = resolvePdfTestEnvironment(root, process.env);
const probe = spawnSync(env.TAX_ENGINE_PDF_TEST_PYTHON, pdfTestPythonProbeArgs, { cwd: root, env, encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error("PDF tests require Python and pinned pypdf. Run pnpm test:setup first, or set TAX_ENGINE_PDF_TEST_PYTHON to an equivalent environment.");
  process.exit(1);
}
const browser = process.argv[2] === "--browser";
if (browser) {
  try {
    const { main } = await import("./run-browser-tests.mjs");
    process.exitCode = await main(process.argv.slice(3), { parentEnv: env });
  } catch {
    console.error("Browser orchestration failed; inspect the source audit and prerequisites.");
    process.exitCode = 1;
  }
} else {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules", "vitest", "vitest.mjs"), ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
