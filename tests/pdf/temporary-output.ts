import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Prevent parallel form suites from overwriting each other's generated PDFs. */
export function useTemporaryPdfOutput(): string {
  const path = mkdtempSync(join(tmpdir(), "tax-engine-pdf-test-"));
  afterAll(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
