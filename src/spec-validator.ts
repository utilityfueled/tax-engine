/**
 * Validates that every spec entry has a corresponding test.
 * Usage: pnpm spec:validate
 *        pnpm spec:validate:pa  (uses --include=state/pa- prefix filter)
 *        pnpm spec:validate:oh  (uses spec/state/oh-*.yaml glob paths)
 *        pnpm spec:validate:ny  (uses --scope=state/ny prefix filter)
 *        pnpm spec:validate [spec files or directories...]
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { extname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";

export interface SpecLine {
  line: string;
  description: string;
  testRef?: string | null;
}

export interface SpecFile {
  form: string;
  lines: SpecLine[];
}

/** @deprecated Use LoadedSpec instead */
export interface LoadedSpecFile {
  relativePath: string;
  spec: SpecFile;
}

/** @deprecated Use SpecCoverageReport uncoveredLines entries instead */
export interface SpecCoverageGap {
  relativePath: string;
  form: string;
  line: string;
  description: string;
}

interface LoadedSpec {
  filePath: string;
  spec: SpecFile;
}

interface UncoveredSpecLine {
  filePath: string;
  form: string;
  line: string;
  description: string;
}

export interface BrokenTestRef {
  filePath: string;
  form: string;
  line: string;
  testRef: string;
  reason: "file-not-found" | "test-not-found" | "bad-format";
}

export interface SpecCoverageReport {
  totalLines: number;
  coveredLines: number;
  uncoveredLines: UncoveredSpecLine[];
  brokenTestRefs: BrokenTestRef[];
}

function isYamlFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return extension === ".yaml" || extension === ".yml";
}

function walkDirectory(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(fullPath));
      continue;
    }

    if (entry.isFile() && isYamlFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeSpecInputPath(inputPath: string): string {
  return resolve(process.cwd(), inputPath);
}

export function collectSpecFilePaths(inputPaths: string[] = []): string[] {
  const targets = inputPaths.length > 0 ? inputPaths : ["spec"];
  const filePaths = new Set<string>();

  for (const target of targets) {
    const normalizedTarget = normalizeSpecInputPath(target);
    if (!existsSync(normalizedTarget)) {
      throw new Error(`Spec path not found: ${target}`);
    }

    const stats = statSync(normalizedTarget);
    if (stats.isDirectory()) {
      for (const filePath of walkDirectory(normalizedTarget)) {
        filePaths.add(filePath);
      }
      continue;
    }

    if (stats.isFile() && isYamlFile(normalizedTarget)) {
      filePaths.add(normalizedTarget);
      continue;
    }

    throw new Error(`Spec path must be a YAML file or directory: ${target}`);
  }

  return [...filePaths].sort();
}

export function loadSpecs(inputPaths: string[] = []): LoadedSpec[] {
  return collectSpecFilePaths(inputPaths).flatMap((filePath) => {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parse(content) as SpecFile;
    if (!parsed.lines) {
      return [];
    }

    return [{ filePath, spec: parsed }];
  });
}

// Cache for test file contents to avoid repeated reads
const testFileCache = new Map<string, string | null>();

function readTestFileContent(testFilePath: string): string | null {
  const resolvedPath = resolve(testFilePath);
  if (testFileCache.has(resolvedPath)) {
    return testFileCache.get(resolvedPath)!;
  }
  try {
    const content = readFileSync(resolvedPath, "utf-8");
    testFileCache.set(resolvedPath, content);
    return content;
  } catch {
    testFileCache.set(resolvedPath, null);
    return null;
  }
}

export function validateTestRef(
  testRef: string,
): { valid: true } | { valid: false; reason: BrokenTestRef["reason"] } {
  const separatorIndex = testRef.indexOf("::");
  if (separatorIndex === -1) {
    return { valid: false, reason: "bad-format" };
  }

  const testFile = testRef.slice(0, separatorIndex);
  const testName = testRef.slice(separatorIndex + 2);

  if (!testFile || !testName) {
    return { valid: false, reason: "bad-format" };
  }

  const content = readTestFileContent(testFile);
  if (content === null) {
    return { valid: false, reason: "file-not-found" };
  }

  if (!content.includes(testName)) {
    return { valid: false, reason: "test-not-found" };
  }

  return { valid: true };
}

export function buildSpecCoverageReport(
  specs: LoadedSpec[],
  options?: { validateRefs?: boolean },
): SpecCoverageReport {
  const shouldValidateRefs = options?.validateRefs ?? true;
  let totalLines = 0;
  let coveredLines = 0;
  const uncoveredLines: UncoveredSpecLine[] = [];
  const brokenTestRefs: BrokenTestRef[] = [];

  for (const { filePath, spec } of specs) {
    for (const line of spec.lines) {
      totalLines++;
      if (line.testRef) {
        coveredLines++;
        if (shouldValidateRefs) {
          const result = validateTestRef(line.testRef);
          if (!result.valid) {
            brokenTestRefs.push({
              filePath,
              form: spec.form,
              line: line.line,
              testRef: line.testRef,
              reason: result.reason,
            });
          }
        }
      } else {
        uncoveredLines.push({
          filePath,
          form: spec.form,
          line: line.line,
          description: line.description,
        });
      }
    }
  }

  return {
    totalLines,
    coveredLines,
    uncoveredLines,
    brokenTestRefs,
  };
}

/** @deprecated Use buildSpecCoverageReport instead */
export function collectCoverage(specs: readonly LoadedSpecFile[]): SpecCoverageReport {
  const loadedSpecs: LoadedSpec[] = specs.map(({ relativePath, spec }) => ({
    filePath: resolve(process.cwd(), "spec", relativePath),
    spec,
  }));
  return buildSpecCoverageReport(loadedSpecs);
}

const BROKEN_REASON_LABELS: Record<BrokenTestRef["reason"], string> = {
  "file-not-found": "test file not found",
  "test-not-found": "test name not found in file",
  "bad-format": "malformed testRef (expected file::testName)",
};

export function formatSpecCoverageReport(report: SpecCoverageReport): string {
  const lines = [
    "Spec Coverage Report",
    "====================",
    "",
    `Total spec lines:    ${report.totalLines}`,
    `With test refs:      ${report.coveredLines}`,
    `Missing test refs:   ${report.uncoveredLines.length}`,
    `Broken test refs:    ${report.brokenTestRefs.length}`,
    `Coverage:            ${
      report.totalLines === 0
        ? "100.0"
        : ((report.coveredLines / report.totalLines) * 100).toFixed(1)
    }%`,
    "",
  ];

  if (report.uncoveredLines.length > 0) {
    lines.push("Lines missing test references:");
    for (const line of report.uncoveredLines) {
      lines.push(
        `  ${line.form} Line ${line.line}: ${line.description} (${relative(process.cwd(), line.filePath)})`,
      );
    }
    lines.push("");
  }

  if (report.brokenTestRefs.length > 0) {
    lines.push("Broken test references:");
    for (const ref of report.brokenTestRefs) {
      lines.push(
        `  ${ref.form} Line ${ref.line}: ${BROKEN_REASON_LABELS[ref.reason]} (${relative(process.cwd(), ref.filePath)})`,
      );
      lines.push(`    testRef: ${ref.testRef}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---- NY-compatible scope-filtering helpers ----

/** Spec entry with a relative file path (used by NY scope-based filtering) */
export interface ScopedLoadedSpec {
  file: string;
  spec: SpecFile;
}

/** Coverage report with simplified uncovered-line shape (used by NY scope-based tests) */
export interface CoverageReport {
  totalLines: number;
  coveredLines: number;
  uncoveredLines: Array<{ form: string; line: string; description: string }>;
}

function normalizeScope(scope?: string): string | null {
  if (!scope) return null;
  return scope.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** Returns true if the relative spec file path falls within the given scope prefix. */
export function isSpecInScope(file: string, scope?: string): boolean {
  const normalizedScope = normalizeScope(scope);
  if (!normalizedScope) return true;

  const normalizedFile = file.replace(/\\/g, "/");
  return (
    normalizedFile === normalizedScope ||
    normalizedFile.startsWith(`${normalizedScope}/`) ||
    normalizedFile.startsWith(`${normalizedScope}-`)
  );
}

/** Build a simplified coverage report from scoped spec entries. */
export function buildCoverageReport(specs: ScopedLoadedSpec[]): CoverageReport {
  let totalLines = 0;
  let coveredLines = 0;
  const uncoveredLines: Array<{ form: string; line: string; description: string }> = [];

  for (const { spec } of specs) {
    for (const line of spec.lines) {
      totalLines++;
      if (line.testRef) {
        coveredLines++;
      } else {
        uncoveredLines.push({
          form: spec.form,
          line: line.line,
          description: line.description,
        });
      }
    }
  }

  return { totalLines, coveredLines, uncoveredLines };
}

// ---- CLI helpers ----

function parseIncludeArg(argv: readonly string[]): string | undefined {
  const includeArg = argv.find((arg) => arg.startsWith("--include="));
  return includeArg ? includeArg.slice("--include=".length) : undefined;
}

function parseScopeArg(argv: readonly string[]): string | undefined {
  const scopeArg = argv.find((arg) => arg.startsWith("--scope="));
  return scopeArg ? scopeArg.slice("--scope=".length) : undefined;
}

export function runSpecValidator(inputPaths: string[] = []): number {
  const normalizedInputs = inputPaths.filter((inputPath) => inputPath !== "--");

  // Support --scope=<prefix> flag (used by spec:validate:ny)
  const scope = parseScopeArg(normalizedInputs);
  if (scope) {
    const specDir = resolve("spec");
    const allFiles = readdirSync(specDir, { recursive: true }) as string[];
    const scopedFiles = allFiles
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && isSpecInScope(f, scope))
      .sort();
    const specs = scopedFiles.flatMap((f) => {
      const filePath = join(specDir, f);
      const content = readFileSync(filePath, "utf-8");
      const parsed = parse(content) as SpecFile;
      return parsed.lines ? [{ filePath, spec: parsed }] : [];
    });
    const report = buildSpecCoverageReport(specs);
    console.log(formatSpecCoverageReport(report));
    return report.uncoveredLines.length > 0 || report.brokenTestRefs.length > 0 ? 1 : 0;
  }

  // Support legacy --include=<prefix> flag (used by spec:validate:pa)
  const includePrefix = parseIncludeArg(normalizedInputs);
  let specs: LoadedSpec[];
  if (includePrefix) {
    const specDir = resolve("spec");
    const allFiles = readdirSync(specDir, { recursive: true }) as string[];
    const prefix = includePrefix.replace(/\\/g, "/");
    const filePaths = allFiles
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && f.startsWith(prefix))
      .sort()
      .map((f) => join(specDir, f));
    specs = filePaths.flatMap((filePath) => {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parse(content) as SpecFile;
      return parsed.lines ? [{ filePath, spec: parsed }] : [];
    });
  } else {
    specs = loadSpecs(normalizedInputs);
  }

  const report = buildSpecCoverageReport(specs);
  console.log(formatSpecCoverageReport(report));
  return report.uncoveredLines.length > 0 || report.brokenTestRefs.length > 0 ? 1 : 0;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const currentPath = resolve(fileURLToPath(import.meta.url));

if (entryPath === currentPath) {
  process.exit(runSpecValidator(process.argv.slice(2)));
}
