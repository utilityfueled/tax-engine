/** Specs: spec/state/pa-oid-sources.yaml; spec/federal/form-1099-oid.yaml. */
import { describe, expect, it } from "vitest";
import { Form1099OIDSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";

function source(overrides: Record<string, unknown> = {}) {
  return Form1099OIDSchema.parse({ payer: "Synthetic OID custodian", sourceId: "actual-oid", taxYear: 2025,
    sourceFormRevision: "2024-01", sourceFactsConfirmed: true, recipientAmountsConfirmed: true,
    obligationType: "taxable", inflationIndexed: false, description: "Actual synthetic obligation",
    originalIssueDiscount: "1000", otherPeriodicInterest: "200", earlyWithdrawalPenalty: "0", federalWithheld: "0",
    marketDiscount: "0", acquisitionPremium: "0", treasuryOID: "0", investmentExpenses: "0",
    bondPremium: "80", taxExemptOID: "0", oidReportedNetOfAcquisitionPremium: false,
    interestReportedNetOfBondPremium: false, marketDiscountElection: false, bondPremiumElection: true,
    modernBondPremiumRulesApply: true,
    stateWithholding: [{ state: "PA", statePayerId: "actual-pa", stateWithheld: "10.11" },
      { state: "OH", statePayerId: "actual-oh", stateWithheld: "99.99" }], ...overrides });
}
function facts(overrides: Record<string, unknown> = {}) {
  return { sourceId: "actual-oid", sourceReference: "Synthetic issuer and PA amortization worksheet",
    factsConfirmed: true, paTaxTreatment: "taxable", strippedBond: false,
    bondPremiumNettedOnStatement: "0", paBondPremiumAmortization: "50", ...overrides };
}
function input(forms = [source()], oidSources: unknown = [facts()]) {
  return TaxYearInputSchema.parse({ taxpayer: { taxYear: 2025, filingStatus: "single",
    primary: { firstName: "Synthetic", lastName: "Resident", ssn: "111-22-3333", dateOfBirth: "1980-01-01" },
    address: { street: "1 Example Street", city: "Harrisburg", state: "PA", zip: "17101" }, dependents: [] },
    form1099OID: forms, paResidentReturn: { scheduleA: { oidSources } } });
}

describe("PA actual OID source reconciliation", () => {
  it("includes OID once with separate PA and federal premium methods", () => {
    const fed = calculateForm1099OID([source()], 2025);
    expect(fed.sources[0].bondPremiumInterestReduction.toString()).toBe("80");
    const result = calculatePAReturn(input());
    expect(result.scheduleA?.line1.toString()).toBe("1120");
    expect(result.scheduleA?.line3.toString()).toBe("80");
    expect(result.scheduleA?.line8.toString()).toBe("50");
    expect(result.mappedIncome.interest.toString()).toBe("1150");
    const alreadyNet = calculatePAReturn(input([source({ otherPeriodicInterest: "120", bondPremium: "0", interestReportedNetOfBondPremium: true })], [facts({ bondPremiumNettedOnStatement: "80" })]));
    expect(alreadyNet.mappedIncome.interest.toString()).toBe("1150");
    expect(alreadyNet.scheduleA?.line3.toString()).toBe("80");
  });
  it("retains taxable market discount and the taxable part of stripped obligations", () => {
    const treasury = source({ obligationType: "treasury", originalIssueDiscount: "0", treasuryOID: "1000", marketDiscount: "25", marketDiscountElection: true });
    const direct = calculatePAReturn(input([treasury], [facts({ paTaxTreatment: "us_government" })]));
    expect(direct.scheduleA?.line1.toString()).toBe("1145");
    expect(direct.scheduleA?.line7.toString()).toBe("1150");
    expect(direct.mappedIncome.interest.toString()).toBe("25");
    expect(direct.scheduleSP.nontaxableIncome.toString()).toBe("1150");
    const stripped = calculatePAReturn(input([treasury], [facts({ paTaxTreatment: "us_government", strippedBond: true, strippedBondExemptInterest: "900" })]));
    expect(stripped.mappedIncome.interest.toString()).toBe("275");
    expect(stripped.scheduleA?.line7.toString()).toBe("900");
    const municipal = source({ obligationType: "tax_exempt", originalIssueDiscount: "0", taxExemptOID: "1000", specifiedPrivateActivityBond: false });
    const pa = calculatePAReturn(input([municipal], [facts({ paTaxTreatment: "pennsylvania" })]));
    expect(pa.scheduleA?.line1.toString()).toBe("0");
    expect(pa.scheduleA?.line2.toString()).toBe("1120");
    expect(pa.scheduleA?.line6.toString()).toBe("1150");
    expect(pa.mappedIncome.interest.toString()).toBe("0");
    expect(calculatePAReturn(input([municipal], [facts()])).mappedIncome.interest.toString()).toBe("1150");
  });
  it("keeps exact PA withholding and source identities", () => {
    const result = calculatePAReturn(input([source({ stateWithholding: [{ state: "PA", statePayerId: "actual", stateWithheld: "9007199254740993.01" }] }), source({ sourceId: "second", stateWithholding: [{ state: "PA", statePayerId: "actual", stateWithheld: "0.02" }] })], [facts(), facts({ sourceId: "second" })]));
    expect(result.stateWithholding.toFixed(2)).toBe("9007199254740993.03");
    expect(calculatePAReturn(input()).stateWithholding.toFixed(2)).toBe("10.11");
    const zero = calculatePAReturn(input([source({ stateWithholding: [] })], [facts({ paBondPremiumAmortization: "0" })]));
    expect(zero.mappedIncome.interest.toString()).toBe("1200");
    expect(zero.stateWithholding.toString()).toBe("0");
  });
  it("rejects incomplete contradictory and unmatched PA source facts", () => {
    expect(() => calculatePAReturn({ ...input(), paResidentReturn: undefined })).toThrow(/one actual reconciliation/);
    expect(() => calculatePAReturn(input([], [facts()]))).toThrow(/no matching source/);
    for (const oidSources of [null, [], [facts({ sourceId: "absent" })], [facts(), facts()], [facts({ factsConfirmed: false })],
      [facts({ sourceReference: "" })], [facts({ paTaxTreatment: undefined })], [facts({ strippedBond: undefined })],
      [facts({ paBondPremiumAmortization: undefined })], [facts({ paBondPremiumAmortization: "-1" })],
      [facts({ paBondPremiumAmortization: "1201" })], [facts({ bondPremiumNettedOnStatement: "80" })],
      [facts({ paTaxTreatment: "us_government", strippedBond: true })],
      [facts({ paTaxTreatment: "us_government", strippedBond: true, strippedBondExemptInterest: "1151" })],
      [facts({ strippedBondExemptInterest: "5" })]]) {
      expect(() => calculatePAReturn(input([source()], oidSources)), JSON.stringify(oidSources)).toThrow();
    }
    expect(() => calculatePAReturn(input([source({ earlyWithdrawalPenalty: "1200" })]))).toThrow(/disposition worksheet/);
    const forfeited = calculatePAReturn(input([source({ earlyWithdrawalPenalty: "150" })]));
    expect(forfeited.scheduleA?.line8.toString()).toBe("200");
    expect(forfeited.mappedIncome.interest.toString()).toBe("1000");
    expect(() => calculatePAReturn(input([Form1099OIDSchema.parse({ payer: "Legacy", originalIssueDiscount: "10" })]))).toThrow(/verified/);
  });
});
