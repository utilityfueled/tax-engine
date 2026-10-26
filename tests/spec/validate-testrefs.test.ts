/**
 * Validates that all spec YAML testRef entries point to tests that actually exist.
 * This prevents spec-to-test drift over time.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import ts from "typescript";

interface SpecLine {
  line: string;
  testRef?: string;
}

interface SpecFile {
  form: string;
  lines: SpecLine[];
}

function parseSpecFiles(dir: string): Array<{ file: string; spec: SpecFile }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  const results: Array<{ file: string; spec: SpecFile }> = [];

  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");

    // Simple YAML parsing for form name and testRefs
    const formMatch = content.match(/^form:\s*"(.+)"/m);
    const form = formMatch?.[1] ?? file;

    const lines: SpecLine[] = [];
    const lineMatches = content.matchAll(/- line:\s*"(.+?)"\n[\s\S]*?testRef:\s*"(.+?)"/g);
    for (const m of lineMatches) {
      lines.push({ line: m[1], testRef: m[2] });
    }

    results.push({ file, spec: { form, lines } });
  }

  return results;
}

function literalTestNames(content: string): Set<string> {
  const names = new Set<string>();
  // Only child traversal is needed. Parent links substantially increase V8
  // coverage overhead without changing which literal test calls are found.
  const source = ts.createSourceFile("spec-linked.test.ts", content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  function baseName(expression: ts.Expression): string | undefined {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression) || ts.isCallExpression(expression)) return baseName(expression.expression);
    return undefined;
  }
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ["it", "test", "describe"].includes(baseName(node.expression) ?? "")) {
      const label = node.arguments[0];
      if (label && (ts.isStringLiteral(label) || ts.isNoSubstitutionTemplateLiteral(label))) names.add(label.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return names;
}

function extractTestNames(filePath: string): Set<string> {
  try {
    return literalTestNames(readFileSync(filePath, "utf-8"));
  } catch {
    return new Set();
  }
}

const projectRoot = join(import.meta.dirname, "../..");

describe("Spec testRef validation", () => {
  it("finds actual literal test names regardless of quote style", () => {
    expect([...literalTestNames("it('single', () => {}); test(\"double\", () => {}); describe(`template`, () => {});")])
      .toEqual(["single", "double", "template"]);
  });
  it("does not accept commented examples or unrelated strings as existing tests", () => {
    expect([...literalTestNames("// it(\"commented\", () => {});\nconst prose = 'test(\"quoted\")'; other(\"not a test\");")]).toEqual([]);
  });
  it("recognizes literal parameterized and modifier test names", () => {
    expect([...literalTestNames("it.each([1, 2])('parameter %s', () => {}); describe.skip(\"suite\", () => {});")])
      .toEqual(["parameter %s", "suite"]);
  });
  const federalSpecs = parseSpecFiles(join(projectRoot, "spec/federal"));
  const stateSpecs = parseSpecFiles(join(projectRoot, "spec/state"));
  const allSpecs = [...federalSpecs, ...stateSpecs];

  // Cache test files
  const testNameCache = new Map<string, Set<string>>();
  function getTestNames(testFile: string): Set<string> {
    if (!testNameCache.has(testFile)) {
      testNameCache.set(testFile, extractTestNames(join(projectRoot, testFile)));
    }
    return testNameCache.get(testFile)!;
  }

  it("all spec files have at least one line with a testRef", () => {
    for (const { file, spec } of allSpecs) {
      expect(spec.lines.length, `${file} has no testRef entries`).toBeGreaterThan(0);
    }
  });

  it("all testRefs point to existing test files and test names", () => {
    const broken: string[] = [];

    for (const { file, spec } of allSpecs) {
      for (const line of spec.lines) {
        if (!line.testRef) continue;

        // Parse "tests/path/file.test.ts::test name"
        const [testFile, testName] = line.testRef.split("::");
        if (!testFile || !testName) {
          broken.push(`${file} line ${line.line}: invalid testRef format "${line.testRef}"`);
          continue;
        }

        const names = getTestNames(testFile);
        if (names.size === 0) {
          broken.push(`${file} line ${line.line}: test file not found "${testFile}"`);
          continue;
        }

        if (!names.has(testName)) {
          broken.push(`${file} line ${line.line}: test "${testName}" not found in ${testFile}`);
        }
      }
    }

    if (broken.length > 0) {
      expect.fail(`Broken testRefs:\n${broken.join("\n")}`);
    }
  });

  it("spec coverage: at least 200 spec lines total", () => {
    const totalLines = allSpecs.reduce((acc, s) => acc + s.spec.lines.length, 0);
    expect(totalLines).toBeGreaterThanOrEqual(200);
  });
});
