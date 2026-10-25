/** Specs: spec/state/oh-input-adapter.yaml; oh-schedule-of-withholding.yaml. */
import { describe, expect, it } from "vitest";
import { Form1099OIDSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter.js";
import { calculateOhioScheduleOfWithholding } from "@/engine/state/oh-schedule-of-withholding.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function source(overrides: Record<string, unknown> = {}) {
  return Form1099OIDSchema.parse({ payer: "Synthetic Treasury broker", sourceId: "oid-actual", taxYear: 2025,
    sourceFormRevision: "2024-01", sourceFactsConfirmed: true, recipientAmountsConfirmed: true,
    obligationType: "treasury", inflationIndexed: false, description: "Actual synthetic Treasury obligation",
    originalIssueDiscount: "0", otherPeriodicInterest: "30.20", earlyWithdrawalPenalty: "0", federalWithheld: "0",
    marketDiscount: "50", acquisitionPremium: "20", treasuryOID: "200.10", investmentExpenses: "0",
    bondPremium: "0", taxExemptOID: "0", oidReportedNetOfAcquisitionPremium: false,
    interestReportedNetOfBondPremium: false, marketDiscountElection: true, bondPremiumElection: false,
    stateWithholding: [{ state: "OH", statePayerId: "OH-actual", stateWithheld: "10.11" },
      { state: "PA", statePayerId: "PA-actual", stateWithheld: "99.99" }], ...overrides });
}
function input(forms = [source()]) { return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form1099OID: forms }); }

describe("Ohio actual OID sources", () => {
  it("Ohio uses verified Treasury OID and actual state withholding once", () => {
    const actual = input(); const federal = calculateFederalTax(actual);
    expect(federal.totalInterest.toString()).toBe("260.3");
    const ohio = buildOhioResidentReturnInput(actual, federal);
    // 200.10 OID - 20 acquisition premium + 30.20 coupon. Market discount50 stays taxable.
    expect(d(ohio.federalInterestExemptFromOhio).toString()).toBe("210.3");
    expect(d(ohio.ohioWithholding).toString()).toBe("10.11");
    const zero = buildOhioResidentReturnInput(actual, federal, { federalInterestExemptFromOhio: "0", ohioWithholdingOverride: "0" });
    expect(d(zero.federalInterestExemptFromOhio).toString()).toBe("0");
    expect(d(zero.ohioWithholding).toString()).toBe("0");
    expect(actual.form1099OID[0].treasuryOID).toBe("200.10");
  });
  it("Ohio OID withholding rejects invalid source rows and preserves exact amounts", () => {
    const actual = source({ stateWithholding: [{ state: "OH", statePayerId: "actual", stateWithheld: "9007199254740993.01" }] });
    const result = calculateOhioScheduleOfWithholding({ form1099OIDs: [actual, source({ sourceId: "second", stateWithholding: [{ state: "OH", statePayerId: "actual", stateWithheld: "0.02" }] })] });
    expect(result.line6_totalOhioWithholding.toFixed(2)).toBe("9007199254740993.03");
    expect(result.lines.find(row => row.line === "5f")?.value.toFixed(2)).toBe("9007199254740993.03");
    for (const stateWithheld of ["-0.01", "NaN", "Infinity"]) {
      expect(() => calculateOhioScheduleOfWithholding({ form1099OIDs: [{ ...actual, stateWithholding: [{ state: "OH", statePayerId: "actual", stateWithheld }] }] })).toThrow(/OID.*withholding/);
    }
    expect(() => calculateOhioScheduleOfWithholding({ form1099OIDs: [{ ...actual, stateWithholding: [actual.stateWithholding![0], actual.stateWithholding![0]] }] })).toThrow(/OID.*rows/);
    expect(calculateOhioScheduleOfWithholding({ form1099OIDs: [source({ stateWithholding: [] })] }).line6_totalOhioWithholding.toString()).toBe("0");
  });
  it("requires actual municipal jurisdiction and verified source classifications", () => {
    const actual = input([source({ obligationType: "tax_exempt", treasuryOID: "0", taxExemptOID: "200", marketDiscount: "0", specifiedPrivateActivityBond: false })]);
    const federal = calculateFederalTax(actual);
    expect(() => buildOhioResidentReturnInput(actual, federal)).toThrow(/OID.*non-Ohio.*allocation/);
    expect(d(buildOhioResidentReturnInput(actual, federal, { nonOhioStateLocalInterest: "0" }).federalInterestExemptFromOhio).toString()).toBe("0");
    const historical = input([Form1099OIDSchema.parse({ payer: "Unverified", originalIssueDiscount: "100" })]);
    expect(() => buildOhioResidentReturnInput(historical, calculateFederalTax(historical))).toThrow(/OID.*verified/);
  });
});
