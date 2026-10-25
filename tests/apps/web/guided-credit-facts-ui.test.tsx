// Spec: spec/federal/guided-input.yaml, care-and-qbi-qualification
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionCredits } from "@/components/guided-interview/section-credits";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import { SectionReview } from "@/components/guided-interview/section-review";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

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

describe("energy source fact presentation", () => {
  it("shows actual item categories and preserves unknown qualification and zero carryforward", () => {
    const html = renderToStaticMarkup(<SectionCredits data={{ ...emptyCreditsData, energy: { ...emptyCreditsData.energy,
      qualifiedImprovements: [{ category: "exterior_door", qualifiedCost: "0", installationCompletedDate: "2026-01-01", qualificationConfirmed: null }],
      cleanEnergyProperties: [{ category: "fuel_cell", qualifiedCost: "1234.56", installationCompletedDate: "2026-02-02", qualificationConfirmed: false, fuelCellKilowattCapacity: "0.5" }],
      priorYearCarryforward: "0", carryforwardSourceTaxYear: "2025", carryforwardConfirmed: true,
    } }} hasDependents={false} taxYear={2026} onDataChange={() => {}} />);
    expect(html).toContain("New installations completed after 2025 do not receive these credits");
    expect(html).toContain("Fuel-cell kilowatt capacity");
    expect(html).toContain("Qualified manufacturer ID");
    expect(html).toContain('<option value="exterior_door" selected="">');
    expect(html).toContain('<option value="" selected="">Confirm from actual records</option>');
    expect(html).toContain('value="0"');
  });
  it("reviews actual costs and classified payments once, retaining a known zero carryforward", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData.credits = { ...emptyCreditsData, energy: { ...emptyCreditsData.energy,
      solarElectricCost: "1234.56", cleanEnergyProperties: [{ category: "solar_electric", qualifiedCost: "1234.56", installationCompletedDate: "2025-04-01", qualificationConfirmed: true }], priorYearCarryforward: "0",
    } };
    state.sectionData.payments = { estimatedPayments: [], otherPayments: "1000.30", extensionPayments: [{ date: "2026-04-15", amount: "1000.10" }], priorYearAppliedCredits: [{ sourceTaxYear: "2024", amount: "0.20" }] };
    const html = renderToStaticMarkup(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />);
    expect(html).toContain("Entered energy property costs (before qualification and limits)");
    expect(html).toContain("$1,234.56");
    expect(html).not.toContain("$2,469.12");
    expect(html).toContain("Prior-year residential clean-energy carryforward");
    expect(html).toContain("Extension payments (1)");
    expect(html).toContain("Prior-year overpayment applied (1)");
    expect(html).not.toContain("Saved payment total (needs classification)");
  });
});
