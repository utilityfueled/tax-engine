// Spec: spec/state/guided-state-routing.yaml. Expected values use actual source rules.
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData, buildGuidedSyntheticDocuments } from "@/lib/guided-interview-bridge";
import { validateSection, emptyDeductionData } from "@/lib/guided-interview-flow";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildGuidedOhioOverlay, buildGuidedPennsylvaniaOverrides } from "@/lib/guided-state-engine-inputs";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";
import { actualOid } from "../fixtures/guided-oid";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

function stateFlow(selected: string | null, mailing = "OH") {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages", "investments"], lifeEvents: [], stateCode: selected });
  if (!state.sectionData["personal-info"]) throw new Error("Missing synthetic personal facts");
  state.sectionData["personal-info"].state = mailing;
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "60000", stateTaxReporting: "single", state: selected ?? "OH", stateWages: "60000", stateWithheld: "2000" }] };
  state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], oidEntries: [{ ...actualOid, obligationType: "treasury", originalIssueDiscount: "0", otherPeriodicInterest: "0", treasuryOID: "1000" }] };
  return state;
}
function paSource(state: ReturnType<typeof stateFlow>) {
  const source = state.sectionData["income-investments"]?.oidEntries?.[0];
  if (!source) throw new Error("Missing synthetic OID source");
  source.paFacts = { sourceReference: "Actual synthetic PA worksheet", factsConfirmed: true, paTaxTreatment: "us_government", strippedBond: false, bondPremiumNettedOnStatement: "0", paBondPremiumAmortization: "0" };
  return source;
}

describe("selected state and dedicated previews", () => {
  it("uses selected state for source facts and preserves the actual mailing address", () => {
    const pa = stateFlow("PA", "OH");
    expect(validateSection(pa, "income-investments").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(pa)).toBeNull();
    expect(buildGuidedSyntheticDocuments(pa).find(doc => doc.kind === "1099-oid")?.coverage).toBe("partially-supported");
    paSource(pa);
    expect(buildTaxInputFromGuidedData(pa)?.taxpayer.address.state).toBe("OH");
    expect(buildTaxInputFromGuidedData(pa)?.paResidentReturn?.scheduleA?.oidSources).toHaveLength(1);
    const oh = stateFlow("OH", "PA");
    expect(validateSection(oh, "income-investments").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(oh)?.taxpayer.address.state).toBe("PA");
    expect(buildTaxInputFromGuidedData(oh)?.paResidentReturn).toBeUndefined();
    const federal = stateFlow(null, "PA");
    expect(buildTaxInputFromGuidedData(federal)).not.toBeNull();
    expect(computeGuidedPreview(federal)?.state).toBeNull();
  });
  it("uses dedicated PA and OH treatment for Treasury OID", () => {
    const pa = stateFlow("PA", "PA"); paSource(pa);
    // $60,000 PA wages ×3.07%; direct Treasury OID is exempt. No forgiveness at this income.
    expect(computeGuidedPreview(pa)?.state).toMatchObject({ stateTax: "1842", stateRefund: "158", stateAmountOwed: "0", stateWithholding: "2000" });
    const oh = stateFlow("OH");
    const withTreasury = computeGuidedPreview(oh);
    const noTreasury = structuredClone(oh);
    noTreasury.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], oidEntries: [] };
    expect(withTreasury?.state).not.toBeNull();
    expect(withTreasury?.state?.stateTax).toBe(computeGuidedPreview(noTreasury)?.state?.stateTax);
  });
  it("preserves exact actual payments in dedicated state previews and export overlays", () => {
    for (const code of ["PA", "OH"]) {
      const state = stateFlow(code, code);
      const source = code === "PA" ? paSource(state) : state.sectionData["income-investments"]?.oidEntries?.[0];
      if (!source) throw new Error("Missing synthetic source");
      source.stateTaxReporting = "single";
      source.stateWithholding = [{ state: code, statePayerId: "actual-id", stateWithheld: "0.10" }];
      state.sectionData["state-return"] = { additionalStateWithholding: "0.20", additionalStateWithholdingEntries: [{ payer: "Separate actual payer", documentType: "1099-MISC", state: code, taxYear: "2025", amount: "0.20" }], stateEstimatedPayments: [{ state: code, date: "2025-04-15", amount: "0.30" }] };
      state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: "0" };
      const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
      expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("2000.6");
      if (code === "OH") expect(buildGuidedOhioOverlay(input, state)).toMatchObject({ ohioWithholdingOverride: "2000.3", estimatedPayments: "0.3" });
      else {
        const result = calculatePAReturn(input, buildGuidedPennsylvaniaOverrides(state));
        expect(result.pa40.stateWithholding.toFixed()).toBe("2000.3");
        expect(result.pa40.estimatedPayments.toFixed()).toBe("0.3");
        // PA prints the $158.60 net overpayment rounded to the nearest whole dollar.
        expect(result.pa40.netOverpayment.toFixed()).toBe("159");
      }
    }
  });
  it("does not substitute generic calculations for missing dedicated state facts", () => {
    const state = stateFlow("OH");
    const source = state.sectionData["income-investments"]?.oidEntries?.[0];
    if (!source) throw new Error("Missing synthetic source");
    Object.assign(source, { obligationType: "tax_exempt", treasuryOID: "0", taxExemptOID: "1000", specifiedPrivateActivityBond: false });
    // Federal source is complete, but Ohio issuer allocation has not been supplied.
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
    expect(computeGuidedPreview(state)?.state).toBeNull();
    for (const residency of ["part-year", "nonresident", ""] as const) {
      const partial = stateFlow("PA", "PA"); paSource(partial);
      if (!partial.sectionData["personal-info"]) throw new Error("Missing personal facts");
      partial.sectionData["personal-info"].stateResidency = residency;
      expect(computeGuidedPreview(partial)?.state ?? null).toBeNull();
    }
  });
});
