// Spec: spec/federal/guided-input.yaml
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionPayments } from "@/components/guided-interview/section-payments";
import { SectionOtherTaxes } from "@/components/guided-interview/section-other-taxes";
import type { GuidedPreviewMetrics } from "@/lib/guided-interview-bridge";

describe("guided monetary presentation", () => {
  it("renders the exact payment total beyond binary integer precision", () => {
    const html = renderToStaticMarkup(<SectionPayments data={{ otherPayments: "", estimatedPayments: [{ date: "2025-04-15", amount: "9007199254740993.01" }, { date: "2025-06-15", amount: "0.09" }] }} onDataChange={() => {}} />);
    expect(html).toContain("$9,007,199,254,740,993.10");
  });
  it("uses known engine tax amounts and distinguishes unavailable calculations", () => {
    const props = { data: undefined, hasSelfEmployment: true, hasInvestments: true, onDataChange: () => {} };
    const unknown = renderToStaticMarkup(<SectionOtherTaxes {...props} guidedPreview={null} />);
    expect(unknown).toContain("Awaiting calculation");
    expect(unknown).not.toContain("this tax does not apply");
    const preview: GuidedPreviewMetrics = { totalIncome: "900000", agi: "900000", taxableIncome: "800000", totalTax: "100000", totalPayments: "100000", refund: "0", amountOwed: "0", state: null, selfEmploymentTax: "123.45", additionalMedicareTax: "0", netInvestmentIncomeTax: "0" };
    const known = renderToStaticMarkup(<SectionOtherTaxes {...props} guidedPreview={preview} />);
    expect(known).toContain("$123.45");
    expect(known).not.toContain("Awaiting calculation");
    expect(known).toContain("The current engine result for this tax is zero.");
  });
});
