import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCoverageReport,
  buildSpecCoverageReport,
  collectSpecFilePaths,
  formatSpecCoverageReport,
  isSpecInScope,
  loadSpecs,
  runSpecValidator,
  validateTestRef,
  type ScopedLoadedSpec,
} from "@/spec-validator.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const specDir = resolve(projectRoot, "spec");

const tempDirs: string[] = [];

function makeTempSpecTree(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "spec-validator-"));
  tempDirs.push(tempDir);
  mkdirSync(join(tempDir, "state"), { recursive: true });
  mkdirSync(join(tempDir, "federal"), { recursive: true });

  writeFileSync(
    join(tempDir, "state", "oh-test.yaml"),
    [
      'form: "Ohio Test Spec"',
      "lines:",
      '  - line: "1"',
      '    description: "Covered line"',
      '    testRef: "tests/engine/state/oh-test.test.ts::covered line"',
      '  - line: "2"',
      '    description: "Uncovered line"',
    ].join("\n"),
  );

  writeFileSync(
    join(tempDir, "federal", "federal-test.yaml"),
    [
      'form: "Federal Test Spec"',
      "lines:",
      '  - line: "A"',
      '    description: "Covered line"',
      '    testRef: "tests/engine/federal.test.ts::covered line"',
    ].join("\n"),
  );

  writeFileSync(join(tempDir, "README.md"), "ignore me");

  return tempDir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("spec validator", () => {
  it("collects YAML specs recursively from an explicit directory", () => {
    const tempDir = makeTempSpecTree();

    expect(collectSpecFilePaths([join(tempDir, "state")])).toEqual([
      join(tempDir, "state", "oh-test.yaml"),
    ]);
  });

  it("supports mixing explicit files and directories", () => {
    const tempDir = makeTempSpecTree();

    expect(
      collectSpecFilePaths([
        join(tempDir, "state", "oh-test.yaml"),
        join(tempDir, "federal"),
      ]),
    ).toEqual([
      join(tempDir, "federal", "federal-test.yaml"),
      join(tempDir, "state", "oh-test.yaml"),
    ]);
  });

  it("reports coverage for only the targeted spec paths", () => {
    const tempDir = makeTempSpecTree();
    const report = buildSpecCoverageReport(loadSpecs([join(tempDir, "state")]));

    expect(report.totalLines).toBe(2);
    expect(report.coveredLines).toBe(1);
    expect(report.uncoveredLines).toHaveLength(1);
    expect(formatSpecCoverageReport(report)).toContain("Ohio Test Spec Line 2");
    expect(formatSpecCoverageReport(report)).not.toContain("Federal Test Spec");
  });

  it("loads only Pennsylvania state specs when an include prefix is provided", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Use runSpecValidator with --include flag (legacy PA path)
    const exitCode = runSpecValidator(["--include=state/pa-"]);
    // PA specs are fully covered so exit code should be 0
    expect(exitCode).toBe(0);
  });

  it("Pennsylvania state specs have complete testRef coverage", () => {
    const paFiles = collectSpecFilePaths([specDir]).filter((f) =>
      f.replace(/\\/g, "/").includes("state/pa-"),
    );

    expect(paFiles.length).toBeGreaterThan(0);
    const report = buildSpecCoverageReport(loadSpecs(paFiles));
    expect(report.totalLines).toBeGreaterThan(0);
    expect(report.uncoveredLines).toEqual([]);
  });

  it("returns success when validating only Pennsylvania state specs", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = runSpecValidator(["--include=state/pa-"]);

    expect(exitCode).toBe(0);
  });
});

describe("testRef validation", () => {
  it("validates a well-formed testRef pointing to an existing test", () => {
    const result = validateTestRef(
      "tests/engine/state/oh-it-1040.test.ts::OH IT 1040 Line 1 - federal AGI flows through",
    );
    expect(result).toEqual({ valid: true });
  });

  it("rejects a testRef with a missing file", () => {
    const result = validateTestRef(
      "tests/engine/state/nonexistent-file.test.ts::some test name",
    );
    expect(result).toEqual({ valid: false, reason: "file-not-found" });
  });

  it("rejects a testRef with a test name not found in the file", () => {
    const result = validateTestRef(
      "tests/engine/state/oh-it-1040.test.ts::Nonexistent test name that does not exist anywhere",
    );
    expect(result).toEqual({ valid: false, reason: "test-not-found" });
  });

  it("rejects a testRef with no :: separator", () => {
    const result = validateTestRef("tests/engine/state/oh-it-1040.test.ts");
    expect(result).toEqual({ valid: false, reason: "bad-format" });
  });

  it("reports broken testRefs in coverage report", () => {
    const tempDir = makeTempSpecTree();
    writeFileSync(
      join(tempDir, "state", "broken-ref.yaml"),
      [
        'form: "Broken Ref Test"',
        "lines:",
        '  - line: "1"',
        '    description: "Points to nonexistent file"',
        '    testRef: "tests/engine/state/nonexistent.test.ts::some test"',
      ].join("\n"),
    );

    const report = buildSpecCoverageReport(loadSpecs([join(tempDir, "state", "broken-ref.yaml")]));
    expect(report.coveredLines).toBe(1);
    expect(report.brokenTestRefs).toHaveLength(1);
    expect(report.brokenTestRefs[0].reason).toBe("file-not-found");
  });

  it("includes broken refs in formatted report", () => {
    const tempDir = makeTempSpecTree();
    writeFileSync(
      join(tempDir, "state", "broken-ref.yaml"),
      [
        'form: "Broken Ref Test"',
        "lines:",
        '  - line: "1"',
        '    description: "Points to nonexistent file"',
        '    testRef: "tests/engine/state/nonexistent.test.ts::some test"',
      ].join("\n"),
    );

    const report = buildSpecCoverageReport(loadSpecs([join(tempDir, "state", "broken-ref.yaml")]));
    const formatted = formatSpecCoverageReport(report);
    expect(formatted).toContain("Broken test refs:    1");
    expect(formatted).toContain("Broken test references:");
    expect(formatted).toContain("test file not found");
  });
});

describe("per-state spec coverage", () => {
  const states = ["ca", "il", "nj", "ny", "oh", "pa", "wa"] as const;

  for (const st of states) {
    it(`${st.toUpperCase()} state specs have complete testRef coverage`, () => {
      const allFiles = collectSpecFilePaths([specDir]);
      const stateFiles = allFiles.filter((f) => {
        const rel = f.replace(/\\/g, "/");
        return rel.includes(`state/${st}-`) || rel.includes(`state/${st}/`);
      });

      expect(stateFiles.length).toBeGreaterThan(0);
      const report = buildSpecCoverageReport(loadSpecs(stateFiles));
      expect(report.totalLines).toBeGreaterThan(0);
      expect(report.uncoveredLines).toEqual([]);
    });

    it(`${st.toUpperCase()} state specs have no broken testRefs`, () => {
      const allFiles = collectSpecFilePaths([specDir]);
      const stateFiles = allFiles.filter((f) => {
        const rel = f.replace(/\\/g, "/");
        return rel.includes(`state/${st}-`) || rel.includes(`state/${st}/`);
      });

      expect(stateFiles.length).toBeGreaterThan(0);
      const report = buildSpecCoverageReport(loadSpecs(stateFiles));
      expect(report.brokenTestRefs).toEqual([]);
    });
  }
});

describe("spec-validator NY scope helpers", () => {
  it("matches New York state files when scoped to state/ny", () => {
    expect(isSpecInScope("state/ny-it201-tax-computation.yaml", "state/ny")).toBe(true);
    expect(isSpecInScope("state/ny/worksheet.yaml", "state/ny")).toBe(true);
    expect(isSpecInScope("state/ca-form-540.yaml", "state/ny")).toBe(false);
    expect(isSpecInScope("federal/form-1040.yaml", "state/ny")).toBe(false);
  });

  it("builds coverage from the filtered New York slice only", () => {
    const allSpecs: ScopedLoadedSpec[] = [
      {
        file: "state/ny-it201-tax-computation.yaml",
        spec: {
          form: "IT-201",
          lines: [
            {
              line: "39",
              description: "NY tax",
              testRef: "tests/engine/state/ny-it201-tax-computation.test.ts::IT-201 Line 39 - computes resident tax",
            },
          ],
        },
      },
      {
        file: "federal/form-2210.yaml",
        spec: {
          form: "Form 2210",
          lines: [
            {
              line: "1",
              description: "Current year tax",
              testRef: null,
            },
          ],
        },
      },
    ];

    const nySpecs = allSpecs.filter((entry) => isSpecInScope(entry.file, "state/ny"));
    const report = buildCoverageReport(nySpecs);

    expect(report.totalLines).toBe(1);
    expect(report.coveredLines).toBe(1);
    expect(report.uncoveredLines).toEqual([]);
  });
});
