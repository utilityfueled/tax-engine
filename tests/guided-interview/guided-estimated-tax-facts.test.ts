// Spec: spec/federal/guided-estimated-tax.yaml.
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyPaymentData, updateSectionData, validateSection, type PaymentData } from "@/lib/guided-interview-flow";
import { buildEstimatedTaxFacts, emptyEstimatedTaxFacts, estimatedTaxFactErrors, type EstimatedTaxFactsData } from "@/lib/guided-estimated-tax-facts";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";
function facts(): EstimatedTaxFactsData {
  return { ...structuredClone(emptyEstimatedTaxFacts), sourceTaxYear: "2025", sourceReference: "Actual prior return and IRS payment history", sourceFactsConfirmed: true,
    allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
    calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "no-return", earlyReturnExceptionClaimed: false };
}
function stateWith(payments: PaymentData) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", federalWithheld: "0", socialSecurityWages: "50000", medicareWages: "50000" }] };
  state.sectionData.payments = payments; return state;
}
it("preserves actual prior history and known zero without creating missing facts", () => {
  expect(buildEstimatedTaxFacts(undefined, 2025)).toBeUndefined();
  const payments = { ...emptyPaymentData, estimatedTaxFacts: facts() };
  expect(buildEstimatedTaxFacts(payments, 2025)).toMatchObject({ priorYearTaxStatus: "no-return", farmerOrFisher: false });
  expect(buildEstimatedTaxFacts(payments, 2025)?.priorYearTaxForForm2210).toBeUndefined();
  const source = payments.estimatedTaxFacts;
  source.priorYearTaxStatus = "no-tax-liability"; source.priorYearFullYear = true; source.priorYearResidentAllYear = true; source.priorYearJointReturn = false;
  source.priorYearTaxComputationConfirmed = true; source.priorYearTaxForForm2210 = "0";
  expect(buildEstimatedTaxFacts(payments, 2025)?.priorYearTaxForForm2210).toBe("0");
  source.priorYearTaxStatus = "return-filed"; source.priorYearAgiForForm2210 = "-123.45";
  expect(buildEstimatedTaxFacts(payments, 2025)?.priorYearAgiForForm2210).toBe("-123.45");
  source.priorYearTaxForForm2210 = "";
  expect(Object.values(estimatedTaxFactErrors(payments, 2025)).join(" ")).toMatch(/tax|amount/i);
  expect(buildTaxInputFromGuidedData(stateWith(payments))).toBeNull();
});
it("reconciles actual effective credit dates per original source", () => {
  const source = facts();
  const payments: PaymentData = { ...emptyPaymentData, estimatedTaxFacts: source, priorYearAppliedCredits: [{ sourceTaxYear: "2024", amount: "9007199254740993.03" }] };
  expect(Object.keys(estimatedTaxFactErrors(payments, 2025)).length).toBeGreaterThan(0);
  source.priorYearCreditPayments = [{ appliedCreditIndex: "0", date: "2025-08-01", amount: "9007199254740993.01" }, { appliedCreditIndex: "0", date: "2025-09-15", amount: "0.02" }];
  expect(buildEstimatedTaxFacts(payments, 2025)?.priorYearCreditPayments).toEqual([{ date: "2025-08-01", amount: "9007199254740993.01" }, { date: "2025-09-15", amount: "0.02" }]);
  source.priorYearCreditPayments[1].amount = "0.01";
  expect(() => buildEstimatedTaxFacts(payments, 2025)).toThrow(/reconcil|source/i);
  source.priorYearCreditPayments[1].amount = "0.02"; source.priorYearCreditPayments[1].appliedCreditIndex = "1";
  expect(() => buildEstimatedTaxFacts(payments, 2025)).toThrow(/source|link/i);
  payments.priorYearAppliedCredits = [{ sourceTaxYear: "2024", amount: "0" }]; source.priorYearCreditPayments = [];
  expect(buildEstimatedTaxFacts(payments, 2025)?.priorYearCreditPayments).toEqual([]);
  payments.priorYearAppliedCredits[0].amount = "";
  expect(() => buildEstimatedTaxFacts(payments, 2025)).toThrow(/amount|refund/i);
});
it("rejects unsupported or contradictory source history without guessing", () => {
  for (const patch of [{ sourceTaxYear: "2026" }, { sourceFactsConfirmed: null }, { allPaymentRecordsIncluded: null }, { farmerOrFisher: true }, { calculationMethod: "annualized" },
    { residentReturn: false }, { calendarYearTaxpayer: false }, { waiverRequested: true }, { disasterReliefClaimed: true },
    { withholdingMethod: "actual-dates", withholdingPayments: [{ date: "2026-01-15", amount: "0" }] },
    { returnPayments: [{ date: "2025-02-30", amount: "0" }] }, { returnPayments: [{ date: "2026-04-15", amount: "-1" }] },
    { earlyReturnExceptionClaimed: true, returnFiledDate: "2026-01-31", returnPaidInFullDate: "" },
  ]) expect(Object.keys(estimatedTaxFactErrors({ ...emptyPaymentData, estimatedTaxFacts: { ...facts(), ...patch } as EstimatedTaxFactsData }, 2025)).length).toBeGreaterThan(0);
  const source = facts(); source.priorYearTaxStatus = "return-filed"; source.priorYearFullYear = false; source.priorYearJointReturn = false;
  expect(buildEstimatedTaxFacts({ ...emptyPaymentData, estimatedTaxFacts: source }, 2025)?.priorYearTaxForForm2210).toBeUndefined();
  source.withholdingMethod = "actual-dates"; source.withholdingPayments = [{ date: "2025-12-31", amount: "0" }];
  expect(buildEstimatedTaxFacts({ ...emptyPaymentData, estimatedTaxFacts: source }, 2025)?.withholdingPayments).toEqual([{ date: "2025-12-31", amount: "0" }]);
});
it("calculates the dated penalty from guided sources without a tax override", () => {
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: facts(), estimatedPayments: [{ date: "2026-01-15", amount: "4000" }] });
  expect(validateSection(state, "payments").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  // Published single34250-34300 tax3875; required3488/4=872.
  // First3late periods275+214+122days:872*.07*611/365=102.179..., rounds102.
  expect(result.totalTax.toFixed()).toBe("3875");
  expect(result.form2210?.requiredAnnualPayment.toFixed()).toBe("3488");
  expect(result.form2210?.penalty.toFixed()).toBe("102");
  expect(result.form2210?.sourceFactsVerified).toBe(true);
  expect(result.form2210?.underpayment.toFixed()).toBe("0");
});
it("revokes stale confirmation while preserving source history", () => {
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: facts() });
  const changed = updateSectionData(state, "income-w2", { entries: [{ ...completeW2Entry, wages: "50001" }] });
  expect(changed.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.payments?.estimatedTaxFacts?.sourceReference).toBe(facts().sourceReference);
  const confirmed = updateSectionData(changed, "payments", { ...changed.sectionData.payments, estimatedTaxFacts: { ...changed.sectionData.payments?.estimatedTaxFacts, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBe(true);
});

it("binds actual withholding dates to canonical withholding and supports proven2026 zero", () => {
  const source = facts(); source.withholdingMethod = "actual-dates"; source.withholdingPayments = [{ date: "2025-12-31", amount: "3488" }];
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: source });
  state.sectionData["income-w2"]!.entries[0].federalWithheld = "3488";
  const statutoryZero = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  // 3875 tax minus3488 withholding is387, below the statutory1000 exception.
  expect(statutoryZero.form2210?.penalty.toFixed()).toBe("0");
  Object.assign(state.sectionData["income-w2"]!.entries[0], { wages: "85000", socialSecurityWages: "85000", medicareWages: "85000", federalWithheld: "9140" });
  source.withholdingPayments[0].amount = "9140";
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  // Published single69250-69300 tax10155; tax minus withholding1015 exceeds1000.
  // Actual9140 on December31 leaves three2285 installments late260+199+107days.
  // 2285*.07*566/365=248.0326..., rounds248.
  expect(result.totalTax.toFixed()).toBe("10155");
  expect(result.form2210?.penalty.toFixed()).toBe("248");
  source.withholdingPayments[0].amount = "9139";
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)))).toThrow(/withholding.*reconcile/i);
  const noTax = facts(); Object.assign(noTax, { sourceTaxYear: "2026", priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true,
    priorYearJointReturn: false, priorYearResidentAllYear: true, priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "0" });
  const next = stateWith({ ...emptyPaymentData, estimatedTaxFacts: noTax }); next.taxYear = 2026;
  const nextInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(next));
  expect(nextInput.form2210?.priorYearTaxForForm2210).toBe("0");
  // The isolated2026 source calculation can prove zero; fullreturn readiness remains closed.
  const zero = calculateForm2210({ taxYear: 2026, filingStatus: "single", currentYearTax: new Decimal(10000), incomeTaxAfterCredits: new Decimal(10000),
    withholding: new Decimal(0), estimatedPayments: new Decimal(0), refundableCredits: new Decimal(0), payments: [], facts: nextInput.form2210 });
  expect(zero.penalty.toFixed()).toBe("0"); expect(zero.sourceFactsVerified).toBe(true);
  expect(() => calculateFederalTax(nextInput)).toThrow(/2026.*incomplete|unavailable/i);
  expect(noTax.priorYearAgiForForm2210).toBe("");
});

it("applies the prior-tax high-income multiplier once to the original amount", () => {
  const source = facts(); Object.assign(source, { priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearJointReturn: false,
    priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "5000", priorYearAgiForForm2210: "150001" });
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: source, estimatedPayments: ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"].map(date => ({ date, amount: "1375" })) });
  Object.assign(state.sectionData["income-w2"]!.entries[0], { wages: "85000", socialSecurityWages: "85000", medicareWages: "85000" });
  const input = buildTaxInputFromGuidedData(state); expect(input?.form2210?.priorYearTaxForForm2210).toBe("5000");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form2210?.requiredAnnualPayment.toFixed()).toBe("5500");
  expect(result.form2210?.penalty.toFixed()).toBe("0");
});
