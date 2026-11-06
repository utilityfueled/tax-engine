import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

it.each([false, true])("preserves actual form values and notices in temporary component serialization (flatten=%s)", async flatten => {
  const directory = await mkdtemp(join(tmpdir(), "tax-component-serialization-"));
  try {
    const result = calculateFederalTax(simpleW2Fixture);
    const paths: string[][] = [];
    const pageCounts: Array<Record<string, number>> = [];
    for (const useObjectStreams of [undefined, false]) {
      const options = { blankFormsDir: "forms/blank", outputDir: join(directory, String(useObjectStreams)), flatten, useObjectStreams };
      const { filledForms } = await fillReturn(simpleW2Fixture, result, options);
      expect(filledForms.length).toBeGreaterThan(1);
      paths.push(filledForms);
      const counts: Record<string, number> = {};
      pageCounts.push(counts);
      for (const file of filledForms) {
        const bytes = await readFile(file);
        // Ordinary files keep compressed object streams. The short-lived
        // merge inputs may omit them without changing any PDF content.
        expect(bytes.toString("latin1").includes("/Type /ObjStm"), basename(file)).toBe(useObjectStreams !== false);
        const doc = await PDFDocument.load(bytes);
        counts[basename(file)] = doc.getPageCount();
        expect(doc.getPageCount()).toBeGreaterThan(0);
        if (flatten) expect(doc.getForm().getFields()).toHaveLength(0);
        if (basename(file) === "f1040-filled.pdf" && !flatten) {
          expect(doc.getForm().getTextField("topmostSubform[0].Page1[0].f1_47[0]").getText()).toBe("85000");
          expect(doc.getForm().getCheckBox("topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[0]").isChecked()).toBe(true);
        }
      }
    }
    // Read all completed files in one independent parser process. Starting a
    // separate interpreter for every small component dominates this check.
    const packets = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys,json,os; from pypdf import PdfReader\ndef read(p):\n r=PdfReader(p)\n return {'fields': {k: str(v.get('/V', '')) for k,v in (r.get_fields() or {}).items()}, 'pages': [p.extract_text() or '' for p in r.pages]}\nprint(json.dumps([{os.path.basename(p): read(p) for p in group} for group in json.loads(sys.argv[1])]))", JSON.stringify(paths)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 })) as Array<Record<string, { fields: unknown; pages: string[] }>>;
    for (const [index, packet] of packets.entries()) for (const [file, value] of Object.entries(packet)) {
      expect(value.pages).toHaveLength(pageCounts[index]?.[file] ?? 0);
      for (const page of value.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    }
    expect(packets[1]).toEqual(packets[0]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
