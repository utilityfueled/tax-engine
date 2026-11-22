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
    expect(Object.keys(pack.templates)).toHaveLength(49);
    expect(pack.templates["pa-schedule-a.pdf"].sha256).toBe("dd32da96a856d033725e772c9a7dc4339131b4abe776e4caa4e7de722c0cbfce");
    expect(pack.templates["pa-schedule-g-l.pdf"].sha256).toBe("b30072eb0bacf5c2cb4cd15344f1a6b9fabc01de99820c5508381c8004c3cd68");
    expect(pack.templates["pa-schedule-d.pdf"].sha256).toBe("154a86698c3c7e81d2487ce518c767a8253781a7aa2b8fcd9974d8bb5ce4b30e");
    expect(pack.templates["pa-schedule-b.pdf"].sha256).toBe("c6d8f5cdd63045e1e40b6deeced2c80b23006b7700befe3b8f0c430f2b40a0d4");
    expect(pack.templates["pa-schedule-nrh.pdf"].sha256).toBe("39254e3bd00841ff8c64445fea3ce869860993ca01f15b71ef1df10aede8e323");
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
