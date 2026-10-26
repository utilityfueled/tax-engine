import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertReviewTemplateBytes, resolveReviewTemplateDirectory, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { fillScheduleA } from "@/pdf/fill-schedule-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

describe("physically versioned review template packs", () => {
  it("resolves only an explicitly supported year without falling back", () => {
    expect(resolveReviewTemplateDirectory("forms/blank", 2025)).toBe("forms/blank/2025");
    expect(resolveReviewTemplateDirectory("forms/blank/2025", 2025)).toBe("forms/blank/2025");
    for (const year of [2026, 2024, 2027, NaN]) {
      expect(() => resolveReviewTemplateDirectory("forms/blank", year)).toThrow(/mapping|years must match/i);
    }
    expect(REVIEW_TEMPLATE_PACKS[2025].filingQualified).toBe(false);
    expect(REVIEW_TEMPLATE_PACKS[2025].reviewStatus).toBe("legacy-review-only");
  });

  it("pins every historical blank to exact bytes and rejects an unreviewed revision", async () => {
    const pack = REVIEW_TEMPLATE_PACKS[2025];
    expect(Object.keys(pack.templates)).toHaveLength(44);
    expect(pack.templates).toHaveProperty("f8862.pdf");
    for (const [filename, template] of Object.entries(pack.templates)) {
      const bytes = await readFile(`forms/blank/2025/${filename}`);
      expect(assertReviewTemplateBytes(filename, bytes, 2025).sha256).toBe(template.sha256);
    }
    const bytes = await readFile("forms/blank/2025/f1040.pdf");
    bytes[bytes.length - 10] ^= 1;
    expect(() => assertReviewTemplateBytes("f1040.pdf", bytes, 2025)).toThrow(/revision/i);
    expect(() => assertReviewTemplateBytes("unknown.pdf", bytes, 2025)).toThrow(/registered/i);
    expect(() => assertReviewTemplateBytes("f1040.pdf", bytes, 2026)).toThrow(/mapping/i);
  });

  it("rejects a different calculation year in a directly called schedule before filesystem access", async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    await expect(fillScheduleA({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } },
      result, "/missing.pdf")).rejects.toThrow(/years must match|mapping/i);
  });
});
