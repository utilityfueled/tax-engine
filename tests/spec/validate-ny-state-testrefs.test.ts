/**
 * Validates that all New York state spec lines have testRefs and that those
 * refs resolve to real test files and names.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

interface SpecLine {
  line: string;
  description?: string;
  testRef?: string;
}

interface SpecFile {
  form: string;
  lines: SpecLine[];
}

function parseNYSpecFiles(dir: string): Array<{ file: string; spec: SpecFile }> {
  const files = readdirSync(dir).filter((file) => /^ny-.*\.ya?ml$/i.test(file));

  return files.map((file) => {
    const content = readFileSync(join(dir, file), "utf-8");
    return {
      file,
      spec: parse(content) as SpecFile,
    };
  });
}

function extractTestNames(filePath: string): Set<string> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const names = new Set<string>();

    const testMatches = content.matchAll(/(?:it|test)\(\s*"([^"]+)"/g);
    for (const match of testMatches) {
      names.add(match[1]);
    }

    const describeMatches = content.matchAll(/describe\(\s*"([^"]+)"/g);
    for (const match of describeMatches) {
      names.add(match[1]);
    }

    return names;
  } catch {
    return new Set();
  }
}

const projectRoot = join(import.meta.dirname, "../..");

describe("New York spec validation", () => {
  const nySpecs = parseNYSpecFiles(join(projectRoot, "spec/state"));
  const testNameCache = new Map<string, Set<string>>();

  function getTestNames(testFile: string): Set<string> {
    if (!testNameCache.has(testFile)) {
      testNameCache.set(testFile, extractTestNames(join(projectRoot, testFile)));
    }

    return testNameCache.get(testFile)!;
  }

  it("all NY spec lines have testRef coverage", () => {
    const missing: string[] = [];

    for (const { file, spec } of nySpecs) {
      for (const line of spec.lines ?? []) {
        if (!line.testRef) {
          missing.push(
            `${file} line ${line.line}: ${line.description ?? "missing description"}`
          );
        }
      }
    }

    if (missing.length > 0) {
      expect.fail(`NY spec lines missing testRef coverage:\n${missing.join("\n")}`);
    }
  });

  it("all NY testRefs point to existing test files and test names", () => {
    const broken: string[] = [];

    for (const { file, spec } of nySpecs) {
      for (const line of spec.lines ?? []) {
        if (!line.testRef) continue;

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
      expect.fail(`Broken NY spec testRefs:\n${broken.join("\n")}`);
    }
  });

  it("NY resident package has substantial spec coverage", () => {
    const totalLines = nySpecs.reduce((sum, entry) => sum + (entry.spec.lines?.length ?? 0), 0);
    expect(nySpecs.length).toBeGreaterThanOrEqual(10);
    expect(totalLines).toBeGreaterThanOrEqual(100);
  });
});
