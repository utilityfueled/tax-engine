import { describe, expect, it } from "vitest";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { fillForm1040 } from "@/pdf/fill-form-1040.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

describe("PDF year and filing qualification", () => {
  it("rejects filing requests and unknown or incomplete mapping years", () => {
    expect(() => assertPdfExportAllowed(2025, 2025)).not.toThrow();
    expect(() => assertPdfExportAllowed(2025, 2025, "filing")).toThrow(/Filing exports are unavailable/);
    for (const year of [2024, 2026, 2027, 0, NaN]) expect(() => assertPdfExportAllowed(year, year)).toThrow();
    expect(() => assertPdfExportAllowed(2025, 2026)).toThrow(/years must match/);
    expect(PDF_MAPPING_PACKS[2025].filingQualified).toBe(false);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
  });

  it("checks the orchestrator and Form 1040 before reading or writing files", async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    await expect(fillReturn(simpleW2Fixture, result, { purpose: "filing", blankFormsDir: "/missing", outputDir: "/missing" })).rejects.toThrow(/Filing exports/);
    await expect(fillForm1040(simpleW2Fixture, { ...result, taxYear: 2026 }, "/missing.pdf")).rejects.toThrow(/years must match/);
  });
});
