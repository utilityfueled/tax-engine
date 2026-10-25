// Spec: spec/federal/form-5329-hsa-owner.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm5329, FORM_5329_FIELDS as F } from "@/pdf/fill-form-5329.js";
import { hsaOwnerInput } from "../fixtures/hsa-excess-owner.js";
import { d } from "@/utils/decimal.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { fillReturn } from "@/pdf/fill-return.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { hsaExcessSource } from "../fixtures/hsa-excess-owner.js";

describe("Form5329 separate HSA owner review", () => {
  it("prints separate owner forms and rejects altered source results", async () => {
    const input = hsaOwnerInput();
    const result = calculateFederalTax(input);
    const primary = await fillForm5329(input, result, "forms/blank/2025/f5329.pdf", "primary");
    const spouse = await fillForm5329(input, result, "forms/blank/2025/f5329.pdf", "spouse");
    expect(primary.getForm().getTextField(F.name).getText()).toBe("Jane Doe");
    expect(primary.getForm().getTextField(F.ssn).getText()).toBe("123456789");
    expect(spouse.getForm().getTextField(F.name).getText()).toBe("Alex Doe");
    expect(spouse.getForm().getTextField(F.ssn).getText()).toBe("987654321");
    expect(primary.getForm().getTextField(F.line48).getText()).toBe("700");
    expect(primary.getForm().getTextField(F.line49).getText()).toBe("6");
    expect(spouse.getForm().getTextField(F.line49).getText()).toBe("42");
    expect(primary.getForm().getTextField(F.line1).getText() ?? "").toBe("");
    const tampered = { ...result, allLines: result.allLines.map(line => line.form === "Form 5329 HSA (primary)" && line.line === "49"
      ? { ...line, value: d("600") } : line) };
    await expect(fillForm5329(input, tampered, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/reconcil|audit/i);
    const changedSource = hsaOwnerInput({ form5329HsaByOwner: { ...input.form5329HsaByOwner,
      primary: { ...input.form5329HsaByOwner?.primary, valueDec31: "10000" } } });
    await expect(fillForm5329(changedSource, result, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/reconcil|source/i);
    const dir = await mkdtemp(join(tmpdir(), "hsa-owner-packet-"));
    try {
      const zeroTax = TaxYearInputSchema.parse({ ...input,
        form8889ByOwner: { primary: { ...input.form8889ByOwner?.primary, contributionsMade: "2000" }, spouse: input.form8889ByOwner?.spouse },
        form5329HsaByOwner: { primary: hsaExcessSource({ priorYearExcessContributions: "2000", priorYearAdditionalTax: "120" }), spouse: hsaExcessSource() } });
      const output = await fillReturn(zeroTax, calculateFederalTax(zeroTax), { blankFormsDir: "forms/blank/2025", outputDir: dir });
      for (const owner of ["primary", "spouse"]) expect(output.filledForms.some(file => file.endsWith(`f5329-${owner}-filled.pdf`))).toBe(true);
      expect(output.filledForms.some(file => file.endsWith("f5329-filled.pdf"))).toBe(false);
      const primaryPdf = await PDFDocument.load(await readFile(join(dir, "f5329-primary-filled.pdf")));
      expect(primaryPdf.getForm().getTextField(F.line42).getText()).toBe("2000");
      expect(primaryPdf.getForm().getTextField(F.line49).getText() ?? "").toBe("");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
