import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const observed = vi.hoisted(() => ({ writes: [] as string[] }));
vi.mock("fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
    observed.writes.push(String(args[0]));
    return actual.writeFile(...args);
  } };
});

it.each([false, true])("writes each completed template once with its visible review notice (flatten=%s)", async flatten => {
  const outputDir = await mkdtemp(join(tmpdir(), "tax-single-write-"));
  observed.writes = [];
  try {
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, { blankFormsDir: "forms/blank", outputDir, flatten });
    expect(filledForms.length).toBeGreaterThan(1);
    for (const file of filledForms) {
      // A packet's completed in-memory forms must not be serialized, reloaded
      // and overwritten just to finalize a notice already available in memory.
      expect(observed.writes.filter(path => path === file), basename(file)).toHaveLength(1);
      const bytes = await readFile(file);
      const doc = await PDFDocument.load(bytes);
      // Reopen the completed file directly. A pipe waiting for EOF can block
      // Vitest's event loop and prevent its own timeout from firing.
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
        "import sys,json; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 })) as string[];
      expect(pages).toHaveLength(doc.getPageCount());
      for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      if (basename(file) === "f1040-filled.pdf" && !flatten) {
        expect(doc.getForm().getTextField("topmostSubform[0].Page1[0].f1_47[0]").getText()).toBe("85000");
      }
    }
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});
