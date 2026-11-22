import path from "node:path";

export const pdfTestPythonProbeArgs = Object.freeze([
  "-c", "import pypdf; raise SystemExit(pypdf.__version__ != '6.10.0')"
]);

export function resolvePdfTestEnvironment(root, env) {
  const override = env.TAX_ENGINE_PDF_TEST_PYTHON;
  if (!override) {
    const python = path.join(root, ".local", "pdf-test-venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    return { ...env, TAX_ENGINE_PDF_TEST_PYTHON: python };
  }
  if (path.isAbsolute(override)) return env;
  const pathLike = override.includes("/") || (process.platform === "win32" && (override.includes("\\") || path.parse(override).root !== ""));
  if (pathLike) return { ...env, TAX_ENGINE_PDF_TEST_PYTHON: path.resolve(root, override) };

  const pathKey = process.platform === "win32"
    ? Object.keys(env).sort().find(key => key.toUpperCase() === "PATH")
    : "PATH";
  if (!pathKey || env[pathKey] === undefined) return env;
  const anchoredPath = env[pathKey].split(path.delimiter)
    .map(entry => path.isAbsolute(entry) ? entry : path.resolve(root, entry))
    .join(path.delimiter);
  return { ...env, [pathKey]: anchoredPath };
}
