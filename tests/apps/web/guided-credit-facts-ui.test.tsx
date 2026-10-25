// Spec: spec/federal/guided-input.yaml, care-and-qbi-qualification
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionCredits } from "@/components/guided-interview/section-credits";
import { emptyCreditsData } from "@/lib/guided-interview-flow";

describe("care fact presentation", () => {
  it("requires individual spouse worksheet income and displays an explicit zero", () => {
    const html = renderToStaticMarkup(<SectionCredits data={{ ...emptyCreditsData, dependentCare: { expenses: "5000", qualifyingIndividuals: "2", spouseEarnedIncome: "0", eligibilityConfirmed: false } }} hasDependents filingStatus="mfj" onDataChange={() => {}} />);
    expect(html).toContain("Spouse&#x27;s earned income for Form 2441 line 5");
    expect(html).toContain("Excluded dependent-care benefits from Form 2441 Part III");
    expect(html).toContain('value="0"');
    expect(html).toContain('<option value="false" selected="">No</option>');
    expect(html).toContain("Provider and qualifying-person details still require form review before filing.");
  });
  it("keeps an unanswered eligibility field unselected and hides irrelevant spouse income", () => {
    const html = renderToStaticMarkup(<SectionCredits data={emptyCreditsData} hasDependents={false} filingStatus="single" onDataChange={() => {}} />);
    expect(html).not.toContain("Spouse&#x27;s earned income for Form 2441 line 5");
    expect(html).toContain('<option value="" selected="">Confirm from actual records</option>');
    expect(html).not.toContain('<option value="true" selected="">');
  });
});
