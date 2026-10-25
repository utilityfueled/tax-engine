/** Spec: spec/federal/form-1099-g-sources.yaml. Independently derived source examples. */
import { describe, expect, it } from "vitest";
import { Form1099GSchema } from "@/models/inputs.js";
import { calculateForm1099G } from "@/engine/forms/form-1099-g.js";

const source = (changes: Record<string, unknown> = {}) => Form1099GSchema.parse({
  payer: "Synthetic state agency", payerTin: "12-3456789", accountHolder: "primary",
  sourceId: "g1", accountReference: "statement-1", taxYear: 2026, sourceFormRevision: "2026-12",
  sourceFactsConfirmed: true, actualReceiptConfirmed: true, additionalWorksheetRequired: false,
  programType: "government-unemployment", unemploymentCompensation: "1000.25", federalWithheld: "100.03",
  stateOrLocalTaxRefund: "0", rtaaPayments: "0", taxableGrants: "0", agriculturePayments: "0",
  marketGain: "0", familyLeaveBenefits: "0", tradeOrBusinessRefund: false,
  currentYearRepaid: "0", priorYearRepaid: "0", unrecoveredAfterTaxContributions: "0",
  stateTaxReporting: "none", stateWithheld: "0", ...changes,
});

describe("Actual Form 1099-G source treatment", () => {
  it("preserves unknown source facts and distinguishes historical previews", () => {
    const unknown = source({ currentYearRepaid: undefined, sourceFactsConfirmed: undefined });
    expect(unknown.currentYearRepaid).toBeUndefined();
    expect(unknown.sourceFactsComplete).toBe(false);
    expect(Form1099GSchema.parse(unknown).sourceFactsComplete).toBe(false);
    expect(() => calculateForm1099G([unknown], 2026)).toThrow(/actual|complete|confirm/i);
    const defaults = source({ federalWithheld: undefined });
    expect(defaults.federalWithheld).toBe("0");
    expect(defaults.sourceFactsComplete).toBe(false);
    const legacy = Form1099GSchema.parse({ payer: "Legacy", unemploymentCompensation: "800" });
    expect(calculateForm1099G([legacy], 2025)).toMatchObject({ sourceFactsVerified: false });
    expect(calculateForm1099G([legacy], 2025).taxableUnemployment.toFixed()).toBe("800");
    expect(() => calculateForm1099G([legacy], 2026)).toThrow(/actual|complete/i);
    expect(() => calculateForm1099G([Form1099GSchema.parse({ payer: "Legacy", unemploymentCompensation: "800", currentYearRepaid: "100" })], 2025)).toThrow(/actual|complete/i);
    expect(() => calculateForm1099G([], 2027)).toThrow(/year/i);
  });

  it("keeps unemployment income separate from withholding and other government income", () => {
    const result = calculateForm1099G([source({ rtaaPayments: "50.25", taxableGrants: "70.50", grantIncomeCategory: "nonbusiness" })], 2026);
    expect(result.taxableUnemployment.toFixed()).toBe("1000.25");
    expect(result.federalWithheld.toFixed()).toBe("100.03");
    expect(result.taxableRtaa.toFixed()).toBe("50.25");
    expect(result.taxableGrants.toFixed()).toBe("70.5");
    expect(result.otherIncome.toFixed()).toBe("120.75");
    expect(result.lines.find(line => line.line === "g1:4")?.value.toFixed()).toBe("100.03");
    expect(result.sourceFactsVerified).toBe(true);
  });

  it("subtracts same-year repayments once for gross and already-net statements", () => {
    for (const [box1IncludesCurrentYearRepayment, box1] of [[true, "1000.25"], [false, "800.15"]] as const) {
      const result = calculateForm1099G([source({ unemploymentCompensation: box1, currentYearRepaid: "200.10",
        unemploymentReceivedBeforeRepayment: "1000.25", box1IncludesCurrentYearRepayment, repaymentSourceReference: "agency-repayment-ledger" })], 2026);
      expect(result.taxableUnemployment.toFixed()).toBe("800.15");
      expect(result.currentYearRepaid.toFixed()).toBe("200.1");
      expect(result.federalWithheld.toFixed()).toBe("100.03");
    }
    for (const changes of [{ box1IncludesCurrentYearRepayment: undefined }, { repaymentSourceReference: "" }, { unemploymentReceivedBeforeRepayment: "50" }]) {
      expect(() => calculateForm1099G([source({ currentYearRepaid: "200.10", unemploymentReceivedBeforeRepayment: "1000.25", box1IncludesCurrentYearRepayment: true, repaymentSourceReference: "ledger", ...changes })], 2026)).toThrow(/repayment|receipts|reconcil/i);
    }
  });

  it("recovers a shared actual program balance once and preserves unused contributions", () => {
    const history = { contributionProgramId: "actual-program", contributionHistoryReference: "agency-history", contributionBalanceReconciled: true, allProgramPaymentsIncluded: true, unrecoveredAfterTaxContributions: "1200" };
    const first = source({ ...history, unemploymentCompensation: "800" });
    const second = source({ ...history, sourceId: "g2", accountReference: "statement-2", unemploymentCompensation: "700" });
    const result = calculateForm1099G([first, second], 2026);
    expect(result.taxableUnemployment.toFixed()).toBe("300");
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0]?.contributionsRecovered.toFixed()).toBe("1200");
    expect(result.programs[0]?.endingContributions.toFixed()).toBe("0");
    const less = calculateForm1099G([first], 2026);
    expect(less.taxableUnemployment.toFixed()).toBe("0");
    expect(less.programs[0]?.endingContributions.toFixed()).toBe("400");
    expect(less.federalWithheld.toFixed()).toBe("100.03");
    expect(() => calculateForm1099G([first, { ...second, unrecoveredAfterTaxContributions: "1199" }], 2026)).toThrow(/program|balance|reconcil/i);
    expect(() => calculateForm1099G([source({ ...history, contributionBalanceReconciled: false })], 2026)).toThrow(/contribution|history/i);
  });

  it("preserves refund source years without inventing taxable refunds", () => {
    const result = calculateForm1099G([source({ stateOrLocalTaxRefund: "250.75", refundTaxYear: 2024 })], 2026);
    expect(result.refundSources[0]).toMatchObject({ sourceId: "g1", refundTaxYear: 2024, accountHolder: "primary" });
    expect(result.refundSources[0]?.amount.toFixed()).toBe("250.75");
    expect(result.otherIncome.toFixed()).toBe("0");
    expect(() => calculateForm1099G([source({ stateOrLocalTaxRefund: "50" })], 2026)).toThrow(/refund.*year/i);
    expect(() => calculateForm1099G([source({ stateOrLocalTaxRefund: "50", stateLocalIncomeTaxRefund: "51", refundTaxYear: 2025 })], 2026)).toThrow(/refund.*reconcil|alias/i);
    const aliases = calculateForm1099G([source({ stateOrLocalTaxRefund: "50", stateLocalIncomeTaxRefund: "50", refundTaxYear: 2025 })], 2026);
    expect(aliases.refundSources[0]?.amount.toFixed()).toBe("50");
  });

  it("matches the revenue ruling family leave example without reducing it by unemployment contributions", () => {
    const history = { contributionProgramId: "unemployment-only", contributionHistoryReference: "history", contributionBalanceReconciled: true, allProgramPaymentsIncluded: true, unrecoveredAfterTaxContributions: "624" };
    const result = calculateForm1099G([source({ ...history, unemploymentCompensation: "500", familyLeaveBenefits: "19200", familyLeaveProgramType: "state-pfml-family" })], 2026);
    expect(result.taxableUnemployment.toFixed()).toBe("0");
    expect(result.taxableFamilyLeave.toFixed()).toBe("19200");
    expect(result.otherIncome.toFixed()).toBe("19200");
    expect(result.programs[0]?.endingContributions.toFixed()).toBe("124");
    for (const familyLeaveProgramType of [undefined, "state-pfml-medical", "private-family-leave"]) {
      expect(() => calculateForm1099G([source({ familyLeaveBenefits: "19200", familyLeaveProgramType })], 2026)).toThrow(/family|classification/i);
    }
    expect(() => calculateForm1099G([source({ taxYear: 2025, sourceFormRevision: "2024-03", familyLeaveBenefits: "19200", familyLeaveProgramType: "state-pfml-family" })], 2025)).toThrow(/revision|family|source/i);
  });

  it("rejects unclassified or separately routed payments and unsupported repayments", () => {
    for (const changes of [{ priorYearRepaid: "3000" }, { priorYearRepaid: "3000.01" }, { taxableGrants: "1" }, { taxableGrants: "1", grantIncomeCategory: "business" }, { agriculturePayments: "1" }, { marketGain: "1" }, { stateOrLocalTaxRefund: "1", refundTaxYear: 2025, tradeOrBusinessRefund: true }, { programType: "employer-supplemental" }, { programType: "private-or-union" }, { additionalWorksheetRequired: true }]) {
      expect(() => calculateForm1099G([source(changes)], 2026)).toThrow(/separate|worksheet|classification|program|grant|farm|repayment|business/i);
    }
  });

  it("retains actual state withholding and validates state absence", () => {
    const result = calculateForm1099G([source({ stateTaxReporting: "single", state: "OH", statePayerId: "actual-state-id", stateWithheld: "24.52" })], 2026);
    expect(result.stateWithholding[0]).toMatchObject({ sourceId: "g1", state: "OH", statePayerId: "actual-state-id" });
    expect(result.stateWithholding[0]?.amount.toFixed()).toBe("24.52");
    for (const changes of [{ stateWithheld: "0.01" }, { state: "OH" }, { statePayerId: "stale" }, { stateTaxReporting: "multiple" }]) {
      expect(() => calculateForm1099G([source(changes)], 2026)).toThrow(/state/i);
    }
    const missingState = source({ stateTaxReporting: "single", state: undefined });
    expect(missingState.sourceFactsComplete).toBe(false);
    expect(() => calculateForm1099G([missingState], 2026)).toThrow(/complete/i);
  });

  it("rejects contradictory sources and retains exact cents across owners", () => {
    const second = source({ sourceId: "g2", accountReference: "statement-2", accountHolder: "spouse", unemploymentCompensation: "0.25", federalWithheld: "0.02" });
    const result = calculateForm1099G([source(), second], 2026, "married_filing_jointly");
    expect(result.taxableUnemployment.toFixed()).toBe("1000.5");
    expect(result.federalWithheld.toFixed()).toBe("100.05");
    expect(() => calculateForm1099G([second], 2026, "single")).toThrow(/spouse|joint/i);
    expect(() => calculateForm1099G([source(), source()], 2026)).toThrow(/duplicate/i);
    for (const changes of [{ taxYear: 2025 }, { actualReceiptConfirmed: false }, { sourceFactsConfirmed: false }, { accountHolder: undefined }, { unemploymentCompensation: "-1" }, { currentYearRepaid: "-1" }, { unrecoveredAfterTaxContributions: "1" }]) {
      expect(() => calculateForm1099G([source(changes)], 2026)).toThrow(/source|year|actual|owner|negative|contribution|confirm|complete/i);
    }
    expect(() => calculateForm1099G([source({ taxYear: 2025 })], 2025)).toThrow(/revision/i);
  });
});
