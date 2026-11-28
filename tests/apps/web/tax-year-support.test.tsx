import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HelpPage from "@/app/help/page";
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

  it("lists the source requirements for Pennsylvania Schedule NRH and Schedule G-L review copies", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    expect(html).toContain("Schedule NRH for certain nonresidents with one full-year employer and signed working-day records");
    expect(html).toContain("Schedule G-L for certain resident and part-year resident credits backed by original records of income tax paid to another state");
    expect(html).toContain("No PA forms are qualified for filing");
  });

  it("agrees with incomplete year and filing gates rather than module coverage labels", () => {
    expect(FEDERAL_RULE_PACKS[2026]?.calculationStatus).toBe("incomplete");
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    for (const row of taxYearSupportRows) {
      expect(row[5]).toBe("Unavailable");
      if (row[0] === "2026") expect(row[4]).toContain("full return calculation and PDFs unavailable");
    }
  });

  it("publishes the selected 2026 state forms and draft residency methods without offering return outputs", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    for (const [jurisdiction, form] of [["Pennsylvania", "PA-40"], ["Ohio", "IT 1040"]]) {
      const row = taxYearSupportRows.find(row => row[0] === "2026" && row[1] === jurisdiction);
      if (!row) throw new Error(`Missing 2026 support for ${jurisdiction}`);
      expect(row[2]).toBe("No qualified residency scenarios");
      expect(row[3]).toContain(`${form} draft methods`);
      expect(row[3]).toContain("full-year resident, part-year resident and nonresident");
      expect(row[3]).toContain("selected ordinary wage, bank-interest and ordinary dividend scenarios");
      expect(row[4]).toContain("full return calculation and PDFs unavailable");
      expect(row[5]).toBe("Unavailable");
      expect(html).toContain(row[3]);
    }
    expect(html).toContain("IT NRC draft credit work covers selected part-year and nonresident cases.");
  });

  it("limits Help Center estimates and review downloads to supported 2025 cases", () => {
    const html = renderToStaticMarkup(<HelpPage />);
    expect(html).toContain("In supported 2025 cases, your estimate updates");
    expect(html).toContain("For 2026, you can enter and save facts");
    expect(html).toContain("For supported 2025 drafts, review the line-by-line calculations and download available review-only PDFs");
    expect(html).not.toContain("verify them before filing");
  });
});
