// Spec: spec/federal/guided-government-payment-worksheets.yaml.
import { expect, it } from "vitest";
import { calculateForm1099G } from "@/engine/forms/form-1099-g";
import { buildTaxInputFromGuidedData, buildUnemploymentInputs } from "@/lib/guided-interview-bridge";
import { unemploymentFactErrors, type UnemploymentEntryData } from "@/lib/guided-unemployment-facts";
import { completeUnemploymentSource, startCompleteInterview } from "./complete-facts";

const source = (changes: Partial<UnemploymentEntryData> = {}): UnemploymentEntryData => ({ ...completeUnemploymentSource, compensation: "1000.25", federalWithheld: "10.03", ...changes });
const data = (entries: UnemploymentEntryData[]) => ({ compensation: "", federalWithheld: "", entries });

it("distinguishes actual payers sharing a local label without exposing taxpayer IDs", () => {
  const forms = buildUnemploymentInputs(data([
    source({ payer: "First actual agency", payerTin: "12-3456789", accountReference: "annual-statement", compensation: "100" }),
    source({ payer: "Second actual agency", payerTin: "98-7654321", accountReference: "annual-statement", compensation: "200" }),
  ]));
  expect(new Set(forms.map(form => form.sourceId)).size).toBe(2);
  expect(calculateForm1099G(forms, 2025).taxableUnemployment.toFixed()).toBe("300");
  for (const form of forms) expect(form.sourceId).not.toMatch(/123456789|12-3456789|987654321|98-7654321/);
  expect(() => buildUnemploymentInputs(data([source(), source()]))).toThrow(/duplicate/i);
});

it("binds actual gross and net repayment reporting without guessing receipts", () => {
  for (const [box1IncludesCurrentYearRepayment, compensation] of [[true, "1000.25"], [false, "800.15"]] as const) {
    const entry = source({ compensation, currentYearRepaid: "200.10", unemploymentReceivedBeforeRepayment: "1000.25", box1IncludesCurrentYearRepayment, repaymentSourceReference: "actual-receipt-1" });
    const forms = buildUnemploymentInputs(data([entry]));
    expect(forms[0]).toMatchObject({ taxYear: 2025, sourceFormRevision: "2024-03", currentYearRepaid: "200.10", unemploymentReceivedBeforeRepayment: "1000.25", box1IncludesCurrentYearRepayment, repaymentSourceReference: "actual-receipt-1", sourceFactsConfirmed: true });
    expect(calculateForm1099G(forms, 2025).taxableUnemployment.toFixed()).toBe("800.15");
    for (const change of [{ unemploymentReceivedBeforeRepayment: "" }, { box1IncludesCurrentYearRepayment: undefined }, { repaymentSourceReference: "" }, { unemploymentReceivedBeforeRepayment: "1000.26" }]) {
      expect(() => buildUnemploymentInputs(data([{ ...entry, ...change }]))).toThrow();
    }
  }
});

it("binds contribution history once across actual linked statements", () => {
  const history = { unrecoveredAfterTaxContributions: "1000.30", contributionProgramId: "actual-program", contributionHistoryReference: "actual-history", contributionBalanceReconciled: true, allProgramPaymentsIncluded: true };
  const entries = [source({ ...history, compensation: "600.20" }), source({ ...history, accountReference: "second-statement", compensation: "600.20" })];
  const result = calculateForm1099G(buildUnemploymentInputs(data(entries)), 2025);
  expect(result.taxableUnemployment.toFixed()).toBe("200.1");
  expect(result.programs).toHaveLength(1);
  expect(result.programs[0]?.contributionsRecovered.toFixed()).toBe("1000.3");
  for (const change of [{ contributionProgramId: "" }, { contributionHistoryReference: "" }, { contributionBalanceReconciled: undefined }, { allProgramPaymentsIncluded: false }, { unrecoveredAfterTaxContributions: "1000.31" }]) {
    expect(() => buildUnemploymentInputs(data([entries[0]!, { ...entries[1]!, ...change }]))).toThrow();
  }
});

it("requires actual payment classification and preserves distinct source amounts", () => {
  const entry = source({ sourceTaxYear: "2026", sourceFormRevision: "2026-12", programType: "other-government", compensation: "0", rtaaPayments: "100.12", taxableGrants: "200.23", grantIncomeCategory: "nonbusiness", familyLeaveBenefits: "19200", familyLeaveProgramType: "state-pfml-family" });
  const forms = buildUnemploymentInputs(data([entry]));
  const result = calculateForm1099G(forms, 2026);
  expect(result.otherIncome.toFixed()).toBe("19500.35");
  expect(result.taxableUnemployment.toFixed()).toBe("0");
  expect(result.federalWithheld.toFixed()).toBe("10.03");
  expect(forms[0]).toMatchObject({ taxableGrants: "200.23", grantIncomeCategory: "nonbusiness", familyLeaveBenefits: "19200", familyLeaveProgramType: "state-pfml-family" });
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026; state.sectionData["income-unemployment"] = data([entry]);
  expect(buildTaxInputFromGuidedData(state)?.form1099G?.[0]).toMatchObject({ taxYear: 2026, familyLeaveBenefits: "19200" });
  for (const change of [{ grantIncomeCategory: undefined }, { grantIncomeCategory: "business" as const }, { familyLeaveProgramType: undefined }, { familyLeaveProgramType: "state-pfml-medical" as const }, { sourceFormRevision: "2024-03" }]) {
    expect(Object.keys(unemploymentFactErrors(data([{ ...entry, ...change }]))).length).toBeGreaterThan(0);
  }
});
