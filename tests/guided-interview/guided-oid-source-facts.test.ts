// Spec: spec/federal/guided-oid-sources.yaml.
import { describe, expect, it } from "vitest";
import { buildOidInputs, oidFactErrors, updateOidEntry, type OidEntryData } from "@/lib/guided-oid-facts";
import { buildGuidedSyntheticDocuments, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, validateSection } from "@/lib/guided-interview-flow";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid";
import { calculatePAOIDSources } from "@/engine/state/pa-oid-sources";
import { TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview } from "./complete-facts";

import { actualOid } from "../fixtures/guided-oid";

function flow(entry: OidEntryData = actualOid, stateCode: string | null = null) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode });
  const personal = state.sectionData["personal-info"];
  if (stateCode && personal) personal.state = stateCode;
  state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], oidEntries: [entry] };
  return state;
}
describe("actual guided OID sources", () => {
  it("forwards actual OID sources and exact monetary amounts into the return", () => {
    const state = flow();
    expect(validateSection(state, "income-investments").status).toBe("complete");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    expect(input.form1099OID[0]).toMatchObject({ sourceFactsComplete: true, sourceFactsConfirmed: true, taxYear: 2025, originalIssueDiscount: "100.10" });
    expect(calculateForm1099OID(input.form1099OID, 2025).taxableInterest.toFixed()).toBe("120.3");
    expect(buildOidInputs([{ ...actualOid, originalIssueDiscount: "9,007,199,254,740,993.01" }], "single", 2025)[0].originalIssueDiscount).toBe("9007199254740993.01");
    expect(computeGuidedPreview(state)?.totalIncome).toBe("120.3");
  });
  it("keeps incomplete and contradictory source facts out of calculations", () => {
    for (const patch of [{ federalWithheld: "" }, { taxYear: "2026" }, { sourceFactsConfirmed: null }, { accountHolder: "spouse" }, { recipientAmountsConfirmed: false }, { marketDiscount: "10" }, { obligationType: "treasury" }, { sourceFormRevision: "" }] as Partial<OidEntryData>[]) {
      expect(Object.keys(oidFactErrors([{ ...actualOid, ...patch }], "single", 2025)).length).toBeGreaterThan(0);
      expect(buildTaxInputFromGuidedData(flow({ ...actualOid, ...patch }))).toBeNull();
    }
    expect(oidFactErrors([actualOid, actualOid], "single", 2025)).toHaveProperty("oid-sources");
    expect(buildTaxInputFromGuidedData(flow({ stateWithholding: [{ state: "PA", statePayerId: "", stateWithheld: "0" }] }))).toBeNull();
  });
  it("preserves explicit 2026 years and marks partial OID documents honestly", () => {
    const state = flow({ ...actualOid, taxYear: "2026" }); state.taxYear = 2026;
    expect(buildTaxInputFromGuidedData(state)?.form1099OID[0].taxYear).toBe(2026);
    expect(buildGuidedSyntheticDocuments(state).find(doc => doc.kind === "1099-oid")?.coverage).toBe("supported");
    const source = state.sectionData["income-investments"]?.oidEntries?.[0];
    if (!source) throw new Error("Missing synthetic source");
    source.sourceFactsConfirmed = null;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(buildGuidedSyntheticDocuments(state).find(doc => doc.kind === "1099-oid")?.coverage).toBe("partially-supported");
  });
  it.each([
    { stateTaxReporting: "none", stateWithholding: [{ state: "PA", statePayerId: "", stateWithheld: "1" }] },
    { stateTaxReporting: "single", stateWithholding: [{ state: "PA", statePayerId: "", stateWithheld: "" }] },
    { stateTaxReporting: "multiple", stateWithholding: [{ state: "PA", statePayerId: "", stateWithheld: "0" }, { state: "PA", statePayerId: "", stateWithheld: "1" }] },
    { bondPremium: "1" }, { marketDiscount: "1", marketDiscountElection: null },
    { interestReportedNetOfBondPremium: true, bondPremiumElection: false },
    { oidReportedNetOfAcquisitionPremium: true, acquisitionPremium: "1" },
    { recipientAdjustmentsNeeded: false, recipientAdjustments: { oid: "1" } },
    { usesBondPremiumWorksheet: false, bondPremiumWorksheet: { priorCarryforward: "1" } },
    { recipientAdjustmentsNeeded: true, recipientAdjustments: { sourceReference: "" } },
    { usesBondPremiumWorksheet: true, bondPremiumWorksheet: { periods: [] } },
    { inflationIndexed: true, obligationType: "treasury", originalIssueDiscount: "0", treasuryOID: "10" },
    { obligationType: "tax_exempt", originalIssueDiscount: "0", taxExemptOID: "10" },
  ] as Partial<OidEntryData>[])("rejects unsupported or unreconciled saved worksheet facts %#", patch => {
    expect(() => buildOidInputs([{ ...actualOid, ...patch }], "single", 2025)).toThrow();
  });
  it("preserves actual current elections and mandatory municipal premiums", () => {
    const elected = buildOidInputs([{ ...actualOid, marketDiscount: "0.30", marketDiscountElection: true, otherPeriodicInterest: "10.20", bondPremium: "0.20", bondPremiumElection: true, modernBondPremiumRulesApply: true }], "single", 2025);
    expect(calculateForm1099OID(elected, 2025).taxableInterest.toFixed()).toBe("110.4");
    const municipal = buildOidInputs([{ ...actualOid, obligationType: "tax_exempt", originalIssueDiscount: "0", taxExemptOID: "100.10", otherPeriodicInterest: "10.20", bondPremium: "0.20", specifiedPrivateActivityBond: false }], "single", 2025);
    expect(calculateForm1099OID(municipal, 2025).taxExemptInterest.toFixed()).toBe("110.1");
  });
  it("keeps confirmation-only changes stable and invalidates factual edits", () => {
    const entry = { ...actualOid, paFacts: { sourceReference: "PA worksheet", factsConfirmed: true } };
    expect(updateOidEntry(entry, { sourceFactsConfirmed: true }).recipientAmountsConfirmed).toBe(true);
    expect(updateOidEntry(entry, { paFacts: { factsConfirmed: true } }).paFacts?.sourceReference).toBe("PA worksheet");
    expect(updateOidEntry(entry, { otherPeriodicInterest: "0" })).toMatchObject({ sourceFactsConfirmed: null, recipientAmountsConfirmed: null, paFacts: { factsConfirmed: null, sourceReference: "PA worksheet" } });
  });
  it("preserves actual recipient and premium histories and gates unresolved TIPS losses", () => {
    const adjusted: OidEntryData = { ...actualOid, originalIssueDiscount: "100", otherPeriodicInterest: "10", bondPremium: "25", bondPremiumElection: true, modernBondPremiumRulesApply: true,
      recipientAdjustmentsNeeded: true, recipientAdjustments: { sourceReference: "recipient worksheet", oid: "-20", periodicInterest: "0", acquisitionPremium: "0", bondPremium: "0", marketDiscount: "0" }, usesBondPremiumWorksheet: true,
      bondPremiumWorksheet: { priorInterestInclusions: "100", priorPremiumDeductions: "0", priorCarryforward: "0", disposedDuringYear: false, periods: [{ endDate: "2025-12-31", qualifiedStatedInterest: "10", amortization: "25" }] } };
    const result = calculateForm1099OID(buildOidInputs([adjusted], "single", 2025), 2025);
    expect(result.taxableInterest.toFixed()).toBe("80"); expect(result.bondPremiumDeduction.toFixed()).toBe("15");
    const tips: OidEntryData = { ...actualOid, obligationType: "treasury", originalIssueDiscount: "0", otherPeriodicInterest: "10", treasuryOID: "-25", inflationIndexed: true,
      tipsDeflationFacts: { allInstrumentInterestReportedHere: true, priorInterestInclusions: "100", priorOrdinaryLosses: "0", priorCarryforward: "0" } };
    expect(oidFactErrors([tips], "single", 2025)).toHaveProperty("oid-0-source");
    expect(buildTaxInputFromGuidedData(flow(tips))).toBeNull();
  });
  it("requires separate PA reconciliation and preserves exact state withholding", () => {
    const entry: OidEntryData = { ...actualOid, stateTaxReporting: "multiple", stateWithholding: [{ state: "PA", statePayerId: "pa-id", stateWithheld: "0.10" }, { state: "OH", statePayerId: "", stateWithheld: "0.20" }] };
    expect(buildTaxInputFromGuidedData(flow(entry, "PA"))).toBeNull();
    entry.paFacts = { sourceReference: "PA worksheet", factsConfirmed: true, paTaxTreatment: "taxable", strippedBond: false, bondPremiumNettedOnStatement: "0", paBondPremiumAmortization: "0" };
    const state = flow(entry, "PA"); state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: "0" };
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    expect(input.form1099OID[0].stateWithholding).toEqual(entry.stateWithholding);
    expect(calculatePAOIDSources(input.form1099OID, input.paResidentReturn?.scheduleA?.oidSources, 2025).stateWithholding.toFixed()).toBe("0.1");
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0.1");
    state.sectionData["state-return"] = { stateEstimatedPayments: [], additionalStateWithholding: "", additionalStateWithholdingEntries: [{ payer: "Synthetic bond broker", documentType: "1099-OID", state: "PA", taxYear: "2025", amount: "0.10" }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});
