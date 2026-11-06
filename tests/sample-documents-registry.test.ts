import { describe, expect, it } from "vitest";
import { officialSampleDocumentFixtures } from "@tax-engine/contracts";
import registry from "../sample-documents/registry.json";

describe("sample tax document registry", () => {
  it("uses official IRS sources for all seeded fixtures", () => {
    for (const entry of registry) {
      expect(entry.sourcePage).toMatch(/^https:\/\/www\.irs\.gov\//);
      expect(entry.downloadUrl).toMatch(/^https:\/\/www\.irs\.gov\//);
    }
  });

  it("contains unique ids and supported document kinds", () => {
    const ids = new Set<string>();
    const supportedKinds = new Set([
      "w2",
      "1099-int",
      "1099-g",
      "1099-oid",
      "1099-div",
      "1099-b",
      "1095-a",
      "1098-e",
      "1099-r",
      "ssa-1099",
      "1099-sa",
      "1099-nec",
      "training-scenario"
    ]);

    for (const entry of registry) {
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(supportedKinds.has(entry.kind)).toBe(true);
    }
  });

  it("stays aligned with the shared fixture catalog used by the web upload classifier", () => {
    const fixtureById = new Map(officialSampleDocumentFixtures.map((fixture) => [fixture.id, fixture]));

    expect(fixtureById.size).toBe(registry.length);

    for (const entry of registry) {
      const fixture = fixtureById.get(entry.id);
      const downloadBasename = new URL(entry.downloadUrl).pathname.split("/").pop()?.replace(/\.pdf$/i, "");

      expect(fixture).toBeDefined();
      expect(fixture?.kind).toBe(entry.kind);
      expect(fixture?.title).toBe(entry.title);
      expect(fixture?.taxYearHint).toBe(entry.taxYearHint);
      expect(fixture?.aliases).toContain(entry.id);
      // The IRS current fw2.pdf URL changes years; its basename cannot establish a tax year.
      if (entry.id === "irs-w2-2026") {
        expect(fixture?.aliases).not.toContain(downloadBasename);
        expect(fixture?.aliases).toContain("fw2--2026");
      } else {
        expect(fixture?.aliases).toContain(downloadBasename);
      }
    }
  });
});
