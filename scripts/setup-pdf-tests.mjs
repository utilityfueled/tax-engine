import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const venv = path.join(root, ".local", "pdf-test-venv");
const python = path.join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.env.TAX_ENGINE_SETUP_PYTHON || "python3", ["-m", "venv", venv]);
run(python, ["-m", "pip", "install", "--require-hashes", "-r", "requirements-test.txt"]);
console.log("PDF test environment ready. Run pnpm test or pnpm test:coverage.");
