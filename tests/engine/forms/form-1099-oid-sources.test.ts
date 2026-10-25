/** Spec: spec/federal/form-1099-oid.yaml; expected values independently derived from the cited source rules. */
import { describe, expect, test } from "vitest";
import { Form1099OIDSchema } from "@/models/inputs.js";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid.js";

export function actualOid(overrides: Record<string, unknown> = {}) {
  return Form1099OIDSchema.parse({
    payer: "Synthetic Broker", sourceId: "oid-1", taxYear: 2026,
    sourceFormRevision: "2024-01", sourceFactsConfirmed: true,
    recipientAmountsConfirmed: true, obligationType: "taxable", inflationIndexed: false,
    description: "Actual test obligation", originalIssueDiscount: "0", otherPeriodicInterest: "0",
    earlyWithdrawalPenalty: "0", federalWithheld: "0", marketDiscount: "0", acquisitionPremium: "0",
    treasuryOID: "0", investmentExpenses: "0", bondPremium: "0", taxExemptOID: "0", stateWithholding: [],
    oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false,
    marketDiscountElection: false, bondPremiumElection: false, modernBondPremiumRulesApply: true,
    ...overrides,
  });
}
function result(overrides: Record<string, unknown>) { return calculateForm1099OID([actualOid(overrides)], 2026); }

describe("Form 1099-OID actual sources", () => {
  test("preserves incomplete raw source facts across reparsing", () => {
    const sparse = Form1099OIDSchema.parse({ payer: "Legacy", originalIssueDiscount: "100", sourceFactsComplete: true });
    expect(sparse.sourceFactsComplete).toBe(false);
    expect(Form1099OIDSchema.parse(sparse).sourceFactsComplete).toBe(false);
    expect(() => calculateForm1099OID([sparse], 2026)).toThrow(/complete original/i);
    expect(calculateForm1099OID([sparse], 2025).sourceFactsVerified).toBe(false);
  });
  test("keeps taxable Treasury and tax exempt OID separate", () => {
    const r = calculateForm1099OID([
      actualOid({ originalIssueDiscount: "100.11" }),
      actualOid({ sourceId: "t", obligationType: "treasury", treasuryOID: "200.22", acquisitionPremium: "20", otherPeriodicInterest: "30" }),
      actualOid({ sourceId: "m", obligationType: "tax_exempt", taxExemptOID: "300.33", acquisitionPremium: "30", specifiedPrivateActivityBond: false }),
    ], 2026);
    expect(r.taxableInterest.toString()).toBe("310.33");
    expect(r.treasuryInterest.toString()).toBe("210.22");
    expect(r.taxExemptInterest.toString()).toBe("270.33");
    expect(r.sourceFactsVerified).toBe(true);
    expect(r.sources).toHaveLength(3);
  });
  test("classifies municipal coupon interest and applies each premium once", () => {
    const r = result({ obligationType: "tax_exempt", taxExemptOID: "300", acquisitionPremium: "30", otherPeriodicInterest: "400", bondPremium: "50", specifiedPrivateActivityBond: true });
    expect(r.taxExemptInterest.toString()).toBe("620");
    expect(r.privateActivityBondInterest.toString()).toBe("620");
    expect(r.taxableInterest.toString()).toBe("0");
    expect(r.bondPremiumDeduction.toString()).toBe("0");
    expect(() => result({ obligationType: "tax_exempt", taxExemptOID: "300" })).toThrow(/private.activity/i);
  });
  test("uses actual market discount election without inferring from a box", () => {
    const accrued = { obligationType: "tax_exempt", taxExemptOID: "300", specifiedPrivateActivityBond: false, marketDiscount: "50" };
    expect(result({ ...accrued, marketDiscountElection: true }).taxableInterest.toString()).toBe("50");
    expect(result(accrued).deferredMarketDiscount.toString()).toBe("50");
    expect(result(accrued).taxableInterest.toString()).toBe("0");
    expect(() => result({ ...accrued, marketDiscountElection: undefined })).toThrow(/market discount election/i);
  });
  test("does not deduct acquisition or bond premium twice from net reporting", () => {
    const r = result({ originalIssueDiscount: "80", otherPeriodicInterest: "90", oidReportedNetOfAcquisitionPremium: true, interestReportedNetOfBondPremium: true, bondPremiumElection: true });
    expect(r.taxableInterest.toString()).toBe("170");
    expect(() => result({ oidReportedNetOfAcquisitionPremium: true, originalIssueDiscount: "80", acquisitionPremium: "20" })).toThrow(/net.*acquisition/i);
    expect(() => result({ interestReportedNetOfBondPremium: true, otherPeriodicInterest: "90", bondPremium: "10", bondPremiumElection: true })).toThrow(/net.*bond premium/i);
    expect(() => result({ originalIssueDiscount: "20", acquisitionPremium: "21" })).toThrow(/acquisition premium.*exceeds/i);
  });
  test("respects a known decision not to amortize taxable premium", () => {
    expect(result({ otherPeriodicInterest: "100", bondPremium: "30", bondPremiumElection: false }).taxableInterest.toString()).toBe("100");
    expect(result({ otherPeriodicInterest: "100", bondPremium: "30", bondPremiumElection: true }).taxableInterest.toString()).toBe("70");
    expect(() => result({ otherPeriodicInterest: "100", bondPremium: "30", bondPremiumElection: undefined })).toThrow(/bond premium election/i);
    expect(() => result({ otherPeriodicInterest: "100", bondPremium: "30", bondPremiumElection: true, modernBondPremiumRulesApply: false })).toThrow(/historical bond premium/i);
  });
  test("calculates premium deduction and carry across actual accrual periods", () => {
    const facts = { priorInterestInclusions: "20", priorPremiumDeductions: "5", priorCarryforward: "10", disposedDuringYear: false,
      periods: [{ endDate: "2026-06-30", qualifiedStatedInterest: "100", amortization: "150" }, { endDate: "2026-12-31", qualifiedStatedInterest: "70", amortization: "20" }] };
    const r = result({ otherPeriodicInterest: "170", bondPremium: "170", bondPremiumElection: true, bondPremiumWorksheet: facts });
    // First period: premium160, offset100, deduction15, carry45. Second: premium65 offsets65 of70.
    expect(r.taxableInterest.toString()).toBe("5");
    expect(r.bondPremiumDeduction.toString()).toBe("15");
    expect(r.bondPremiumCarryforward.toString()).toBe("0");
    const excess = result({ otherPeriodicInterest: "100", bondPremium: "180", bondPremiumElection: true,
      bondPremiumWorksheet: { ...facts, periods: [{ endDate: "2026-12-31", qualifiedStatedInterest: "100", amortization: "180" }] } });
    expect(excess.bondPremiumDeduction.toString()).toBe("15");
    expect(excess.bondPremiumCarryforward.toString()).toBe("75");
  });
  test("deducts actual final taxable premium carry and rejects absent history", () => {
    const r = result({ bondPremium: "40", bondPremiumElection: true, bondPremiumWorksheet: {
      priorInterestInclusions: "0", priorPremiumDeductions: "0", priorCarryforward: "10", disposedDuringYear: true,
      periods: [{ endDate: "2026-05-01", qualifiedStatedInterest: "0", amortization: "40" }],
    } });
    expect(r.bondPremiumDeduction.toString()).toBe("50");
    expect(r.bondPremiumCarryforward.toString()).toBe("0");
    expect(() => result({ otherPeriodicInterest: "20", bondPremium: "30", bondPremiumElection: true })).toThrow(/accrual.period/i);
  });
  test("rejects inconsistent premium worksheet totals and periods", () => {
    const base = { otherPeriodicInterest: "100", bondPremium: "30", bondPremiumElection: true };
    const worksheet = { priorInterestInclusions: "0", priorPremiumDeductions: "0", priorCarryforward: "0", disposedDuringYear: false,
      periods: [{ endDate: "2026-12-31", qualifiedStatedInterest: "99", amortization: "30" }] };
    expect(() => result({ ...base, bondPremiumWorksheet: worksheet })).toThrow(/reconcile/i);
    expect(() => result({ ...base, bondPremiumWorksheet: { ...worksheet, periods: [{ endDate: "2025-12-31", qualifiedStatedInterest: "100", amortization: "30" }] } })).toThrow(/period.*date/i);
    expect(() => result({ ...base, bondPremiumWorksheet: { ...worksheet, periods: [] } })).toThrow(/accrual.period/i);
  });
  test("applies the Publication 1212 deflation example and prior income loss limit", () => {
    // Pub1212 Example9: 12011.20 −12050.10 = −38.90, offsets the same obligation's interest.
    const tips = { obligationType: "treasury", inflationIndexed: true, treasuryOID: "-38.90", otherPeriodicInterest: "100",
      tipsDeflationFacts: { allInstrumentInterestReportedHere: true, priorInterestInclusions: "0", priorOrdinaryLosses: "0", priorCarryforward: "0" } };
    expect(result(tips).taxableInterest.toString()).toBe("61.1");
    const r = result({ ...tips, treasuryOID: "-200", tipsDeflationFacts: { ...tips.tipsDeflationFacts, priorInterestInclusions: "80", priorOrdinaryLosses: "30", priorCarryforward: "20" } });
    expect(r.taxableInterest.toString()).toBe("0");
    expect(r.deflationOrdinaryLoss.toString()).toBe("50");
    expect(r.deflationCarryforward.toString()).toBe("70");
  });
  test("requires actual TIPS history and never offsets another obligation", () => {
    expect(() => result({ obligationType: "treasury", treasuryOID: "-20" })).toThrow(/inflation.indexed/i);
    expect(() => result({ obligationType: "treasury", inflationIndexed: true, treasuryOID: "-20" })).toThrow(/deflation.*facts/i);
    const tips = actualOid({ obligationType: "treasury", inflationIndexed: true, treasuryOID: "-20", tipsDeflationFacts: { allInstrumentInterestReportedHere: true, priorInterestInclusions: "0", priorOrdinaryLosses: "0", priorCarryforward: "0" } });
    const r = calculateForm1099OID([tips, actualOid({ sourceId: "other", originalIssueDiscount: "100" })], 2026);
    expect(r.taxableInterest.toString()).toBe("100");
    expect(r.deflationCarryforward.toString()).toBe("20");
  });
  test("keeps penalties withholding and embedded expenses separate", () => {
    const r = result({ originalIssueDiscount: "100", otherPeriodicInterest: "40", investmentExpenses: "10", earlyWithdrawalPenalty: "200", federalWithheld: "15" });
    expect(r.taxableInterest.toString()).toBe("140");
    expect(r.earlyWithdrawalPenalty.toString()).toBe("200");
    expect(r.federalWithheld.toString()).toBe("15");
    expect(r.lines.find(line => line.line === "oid-1:9")?.value.toString()).toBe("10");
  });
  test("preserves actual state rows without using premium aliases", () => {
    const r = result({ stateWithholding: [{ state: "PA", statePayerId: "PA123", stateWithheld: "12.34" }, { state: "NY", statePayerId: "NY123", stateWithheld: "2.10" }] });
    expect(r.stateWithheld.toString()).toBe("14.44");
    expect(r.sources[0].stateWithholding[0]).toMatchObject({ state: "PA", statePayerId: "PA123" });
    expect(() => result({ taxExemptBondPremium: "10" })).toThrow(/legacy.*reconcil/i);
  });
  test("rejects duplicate sources mixed categories and unknown classifications", () => {
    expect(() => calculateForm1099OID([actualOid(), actualOid()], 2026)).toThrow(/duplicate/i);
    expect(() => result({ originalIssueDiscount: "1", treasuryOID: "2" })).toThrow(/category|classification/i);
    expect(() => result({ obligationType: undefined })).toThrow(/complete original|classification/i);
    expect(() => result({ taxYear: 2025 })).toThrow(/source year/i);
    expect(() => result({ sourceFactsConfirmed: false })).toThrow(/confirmed/i);
    expect(() => result({ recipientAmountsConfirmed: false })).toThrow(/recipient/i);
  });
  test("uses explicit recipient worksheets and preserves cents until aggregation", () => {
    const r = result({ originalIssueDiscount: "100.11", acquisitionPremium: "2.01", otherPeriodicInterest: "20.10",
      recipientAdjustments: { sourceReference: "Completed Pub1212 worksheet", oid: "-10.01", periodicInterest: "0.01", acquisitionPremium: "0.01", bondPremium: "0", marketDiscount: "0" } });
    expect(r.taxableInterest.toString()).toBe("108.19");
    expect(() => result({ recipientAdjustments: { oid: "-1" } })).toThrow();
    expect(() => result({ originalIssueDiscount: "-1" })).toThrow(/nonnegative/i);
    expect(() => calculateForm1099OID([{ ...actualOid(), originalIssueDiscount: "NaN" }], 2026)).toThrow(/finite/i);
    expect(() => calculateForm1099OID([], 2027)).toThrow(/tax year/i);
  });
  test("keeps municipal excess premium nondeductible and does not offset another period", () => {
    const r = result({ obligationType: "tax_exempt", specifiedPrivateActivityBond: false, otherPeriodicInterest: "150", bondPremium: "170",
      bondPremiumWorksheet: { priorInterestInclusions: "0", priorPremiumDeductions: "0", priorCarryforward: "0", disposedDuringYear: true,
        periods: [{ endDate: "2026-06-30", qualifiedStatedInterest: "50", amortization: "100" }, { endDate: "2026-12-31", qualifiedStatedInterest: "100", amortization: "70" }] } });
    expect(r.taxExemptInterest.toString()).toBe("30");
    expect(r.nondeductiblePremiumLoss.toString()).toBe("50");
    expect(r.bondPremiumDeduction.toString()).toBe("0");
    expect(r.bondPremiumCarryforward.toString()).toBe("0");
  });
  test("blocks complex TIPS allocation without manufacturing external interest or premium history", () => {
    const tips = { obligationType: "treasury", inflationIndexed: true, treasuryOID: "-20", otherPeriodicInterest: "10",
      tipsDeflationFacts: { allInstrumentInterestReportedHere: true, priorInterestInclusions: "0", priorOrdinaryLosses: "0", priorCarryforward: "0" } };
    expect(() => result({ ...tips, tipsDeflationFacts: { ...tips.tipsDeflationFacts, allInstrumentInterestReportedHere: false } })).toThrow(/same.instrument linkage/i);
    expect(() => result({ ...tips, marketDiscount: "10", marketDiscountElection: true })).toThrow(/allocation worksheet/i);
    expect(() => result({ ...tips, bondPremium: "30", bondPremiumElection: true })).toThrow(/premium.deflation/i);
    expect(() => result({ ...tips, tipsDeflationFacts: { ...tips.tipsDeflationFacts, priorOrdinaryLosses: "1" } })).toThrow(/prior TIPS losses/i);
  });
  test("retains a known positive deflation carryforward against later instrument interest", () => {
    const r = result({ obligationType: "treasury", inflationIndexed: true, treasuryOID: "200", otherPeriodicInterest: "20",
      tipsDeflationFacts: { allInstrumentInterestReportedHere: true, priorInterestInclusions: "0", priorOrdinaryLosses: "0", priorCarryforward: "50" } });
    expect(r.taxableInterest.toString()).toBe("170");
    expect(r.treasuryInterest.toString()).toBe("170");
    expect(r.deflationCarryforward.toString()).toBe("0");
  });
  test("rejects negative or duplicate withholding instead of changing source attribution", () => {
    expect(() => result({ stateWithholding: [{ state: "PA", statePayerId: "1", stateWithheld: "-1" }] })).toThrow(/nonnegative/i);
    expect(() => result({ stateWithholding: [{ state: "PA", statePayerId: "1", stateWithheld: "1" }, { state: "PA", statePayerId: "1", stateWithheld: "1" }] })).toThrow(/distinct/i);
  });

});
