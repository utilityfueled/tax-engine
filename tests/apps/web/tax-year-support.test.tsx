import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SupportPage from "@/app/support/page";
import { taxYearSupportRows } from "@/lib/tax-year-support";
import { FEDERAL_RULE_PACKS } from "@/models/rule-pack-metadata";
import { PDF_MAPPING_PACKS } from "@/pdf/export-policy";

describe("public scenario and output capability disclosure", () => {
  it("separates all dedicated states and discloses limitations by year", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    for (const jurisdiction of ["Pennsylvania", "Ohio", "New York", "New Jersey", "Illinois", "California"]) {
      expect(taxYearSupportRows.filter(row => row[1] === jurisdiction).map(row => row[0])).toEqual(["2025", "2026"]);
    }
    expect(html).toContain("IT-203 state nonresident/part-year return unavailable");
    expect(html).toContain("no filled official Ohio forms");
    expect(html).toContain("NJ-1040NR unavailable");
    expect(html).toContain("no official California return PDF packet");
    expect(html).toContain("review downloads do not replace a backup");
  });
  it("agrees with incomplete year and filing gates rather than module coverage labels", () => {
    expect(FEDERAL_RULE_PACKS[2026]?.calculationStatus).toBe("incomplete");
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    for (const row of taxYearSupportRows) {
      expect(row[5]).toBe("Unavailable");
      if (row[0] === "2026") expect(row[4]).toContain("full return calculation and PDFs unavailable");
    }
  });
});
