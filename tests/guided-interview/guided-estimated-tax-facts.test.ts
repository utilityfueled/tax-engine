// Spec: spec/federal/guided-estimated-tax.yaml.
import { afterEach, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { assertFederalPaymentSources } from "@/engine/forms/federal-payment-date-sources.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyPaymentData, parseGuidedFlowState, updateSectionData, validateSection, type PaymentData } from "@/lib/guided-interview-flow";
import { buildEstimatedTaxFacts, emptyEstimatedTaxFacts, estimatedTaxFactErrors, type EstimatedTaxFactsData } from "@/lib/guided-estimated-tax-facts";
import { computeGuidedPreviewOutcome } from "@/lib/guided-preview-compute";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

afterEach(() => vi.useRealTimers());

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
function filedPriorReturnFacts2026(): EstimatedTaxFactsData {
  return {
    ...facts(), sourceTaxYear: "2026", priorYearTaxStatus: "return-filed", priorYearFullYear: true,
    priorYearJointReturn: false, priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "400", priorYearAgiForForm2210: "50000",
  };
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
  Object.assign(source, { priorYearTaxStatus: "return-filed", priorYearFullYear: false, priorYearJointReturn: false });
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
it("holds a repeated January estimated payment through Payments, bridge and draft replay", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 0, 15, 12));
  const januaryDate = "2027-01-15";
  const original: PaymentData = { ...emptyPaymentData, estimatedTaxFacts: filedPriorReturnFacts2026(), estimatedPayments: [
    { date: "2026-04-15", amount: "100" },
    { date: "2026-06-15", amount: "100" },
    { date: "2026-09-15", amount: "100" },
    { date: januaryDate, amount: "100", application: { taxYear: "2026", confirmed: true } },
  ] };
  const state = stateWith(original); state.taxYear = 2026;
  const input = buildTaxInputFromGuidedData(state);
  const estimates = input?.adjustments?.estimatedTaxPayments;
  if (!input?.form2210 || !estimates) throw new Error("The four original federal estimates must reach the bridge");
  const result = calculateForm2210({ taxYear: 2026, filingStatus: "single", currentYearTax: new Decimal(4000), incomeTaxAfterCredits: new Decimal(4000),
    withholding: new Decimal(0), estimatedPayments: new Decimal(400), refundableCredits: new Decimal(0), facts: input.form2210,
    payments: estimates.map(({ date, amount }) => ({ date, amount, kind: "estimated" })),
  });
  expect(result.installments[3]?.payments.toFixed()).toBe("100");

  const returnPayment = { date: januaryDate, amount: "100.00" };
  const edited = updateSectionData(state, "payments", {
    ...original, estimatedTaxFacts: { ...original.estimatedTaxFacts, returnPayments: [returnPayment] },
  });
  const confirmed = updateSectionData(edited, "payments", {
    ...edited.sectionData.payments, estimatedTaxFacts: { ...edited.sectionData.payments?.estimatedTaxFacts, sourceFactsConfirmed: true },
  });
  const reopened = parseGuidedFlowState(JSON.stringify(confirmed));
  if (!reopened) throw new Error("The saved payment draft must reopen");
  for (const draft of [confirmed, reopened]) {
    expect(draft.sectionData.payments?.estimatedTaxFacts?.returnPayments).toEqual([returnPayment]);
    expect(draft.sectionData.payments?.estimatedPayments).toEqual(original.estimatedPayments);
    expect(validateSection(draft, "payments")).toMatchObject({ status: "partial", allowSkip: false,
      fieldErrors: { estimatedTaxFacts: expect.stringMatching(/return payment.*estimated or extension payment.*reconcile/i) } });
    expect(buildTaxInputFromGuidedData(draft)).toBeNull();
  }
});
it("holds a matching extension payment without admitting invented worksheet receipt identity", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 3, 15, 12));
  const state = stateWith({ ...emptyPaymentData,
    extensionPayments: [{ date: "2027-04-15", amount: "1,200.01", receiptReference: "ACTUAL-EXTENSION-RECORD" }],
    estimatedTaxFacts: { ...filedPriorReturnFacts2026(), returnPayments: [
      { date: "2027-04-15", amount: "1200.010", receiptReference: "UNVERIFIED-WORKSHEET-REFERENCE" },
    ] },
  });
  state.taxYear = 2026;
  expect(validateSection(state, "payments").fieldErrors?.estimatedTaxFacts).toMatch(/return payment.*estimated or extension payment.*reconcile/i);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it("accepts separately confirmed original payment references and holds stale or repeated proof", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 0, 16, 12));
  const date = "2027-01-15";
  const estimate = { date, amount: "50.00", receiptReference: "ORIGINAL-ESTIMATE", application: { taxYear: "2026", confirmed: true } };
  const originalReturn = { date, amount: "50", processedReceipt: { reference: " original-return ", confirmedFor: { date, amount: "50.00", reference: "ORIGINAL-RETURN" } } };
  const secondReturn = { date, amount: "50.00", processedReceipt: { reference: "SECOND-RETURN", confirmedFor: { date, amount: "50.00", reference: "SECOND-RETURN" } } };
  const state = stateWith({ ...emptyPaymentData, estimatedPayments: [estimate],
    estimatedTaxFacts: { ...filedPriorReturnFacts2026(), returnPayments: [originalReturn, secondReturn] },
  });
  state.taxYear = 2026;
  const reopened = parseGuidedFlowState(JSON.stringify(state));
  if (!reopened) throw new Error("The original receipt draft must reopen");
  for (const draft of [state, reopened]) {
    expect(validateSection(draft, "payments").status).toBe("complete");
    const input = buildTaxInputFromGuidedData(draft);
    expect(input?.form2210?.returnPayments).toEqual([
      { date, amount: "50", receiptReference: "guided-balance-due-receipt-1" },
      { date, amount: "50", receiptReference: "guided-balance-due-receipt-2" },
    ]);
    expect(input?.adjustments?.estimatedTaxPayments?.[0]).toEqual({
      date, amount: "50.00", type: "federal", receiptReference: "guided-estimate-receipt-1",
      application: { taxYear: 2026, confirmed: true },
    });
    expect(() => assertFederalPaymentSources(TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input))))).not.toThrow();
    expect(JSON.stringify(input)).not.toMatch(/original-estimate|original-return|second-return/i);
  }

  function expectHeld(estimatedPayments: PaymentData["estimatedPayments"], returnPayments: EstimatedTaxFactsData["returnPayments"], message: RegExp) {
    const edited = updateSectionData(state, "payments", { ...state.sectionData.payments, estimatedPayments,
      estimatedTaxFacts: { ...state.sectionData.payments?.estimatedTaxFacts, returnPayments },
    });
    const confirmed = updateSectionData(edited, "payments", { ...edited.sectionData.payments,
      estimatedTaxFacts: { ...edited.sectionData.payments?.estimatedTaxFacts, sourceFactsConfirmed: true },
    });
    expect(validateSection(confirmed, "payments").fieldErrors?.estimatedTaxFacts).toMatch(message);
    expect(buildTaxInputFromGuidedData(confirmed)).toBeNull();
  }

  expectHeld([{ ...estimate, receiptReference: "" }], [originalReturn], /reconcile/i);
  expectHeld([estimate], [{ ...originalReturn, processedReceipt: { reference: "ORIGINAL-RETURN", confirmedFor: null } }], /reconcile/i);
  expectHeld([], [{ date, amount: "50.00" }, { date, amount: "50" }], /reconcile/i);
  expectHeld([], [originalReturn, { ...secondReturn, processedReceipt: originalReturn.processedReceipt }], /reference.*used/i);
  expectHeld([estimate], [{ date: "2027-01-16", amount: "49.99", processedReceipt: {
    reference: " original- estimate ", confirmedFor: { date: "2027-01-16", amount: "49.99", reference: "ORIGINAL-ESTIMATE" },
  } }], /reference.*used/i);
  expectHeld([{ ...estimate, amount: "51" }], [{ ...originalReturn, amount: "51" }], /reconcile/i);
  expectHeld([estimate], [{ ...originalReturn, date: "2027-01-16" }], /confirm.*processed.*reference/i);
});
it("keeps independently linked credits, distinct dates or amounts and explicit zero", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 3, 15, 12));
  const state = stateWith({ ...emptyPaymentData,
    estimatedPayments: [{ date: "2026-04-15", amount: "100" }],
    extensionPayments: [{ date: "2027-04-15", amount: "100" }, { date: "2027-01-15", amount: "0.00" }],
    priorYearAppliedCredits: [{ sourceTaxYear: "2025", amount: "100" }],
    estimatedTaxFacts: { ...filedPriorReturnFacts2026(),
      priorYearCreditPayments: [{ appliedCreditIndex: "0", date: "2026-04-15", amount: "100.00" }],
      returnPayments: [{ date: "2027-04-14", amount: "100" }, { date: "2027-04-15", amount: "100.01" }, { date: "2027-01-15", amount: "0" }],
    },
  });
  state.taxYear = 2026;
  expect(validateSection(state, "payments").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form2210?.returnPayments).toEqual([{ date: "2027-04-14", amount: "100" }, { date: "2027-04-15", amount: "100.01" }, { date: "2027-01-15", amount: "0" }]);
  expect(input?.form2210?.priorYearCreditPayments).toEqual([{ date: "2026-04-15", amount: "100" }]);
  expect(input?.adjustments?.priorYearAppliedCredits).toEqual([{ sourceTaxYear: 2025, amount: "100", type: "federal" }]);
});
it("holds impossible and future 2026 dates after a payment draft reopens", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 0, 20, 12));
  const reopen = (patch: Partial<EstimatedTaxFactsData>) => {
    const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: { ...filedPriorReturnFacts2026(), ...patch } });
    state.taxYear = 2026;
    const reopened = parseGuidedFlowState(JSON.stringify(state));
    if (!reopened) throw new Error("The actual payment draft must reopen");
    expect(reopened.sectionData.payments?.estimatedTaxFacts).toMatchObject(patch);
    return reopened;
  };
  const unknown = reopen({});
  expect(buildTaxInputFromGuidedData(unknown)?.form2210?.returnPayments).toEqual([]);
  expect(buildTaxInputFromGuidedData(unknown)?.form2210?.returnFiledDate).toBeUndefined();
  const actual = { returnPayments: [{ date: "2027-01-20", amount: "12000.00" }],
    earlyReturnExceptionClaimed: true, returnFiledDate: "2027-01-20", returnPaidInFullDate: "2027-01-20" };
  expect(validateSection(reopen(actual), "payments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(reopen(actual))?.form2210).toMatchObject({
    returnPayments: [{ date: "2027-01-20", amount: "12000" }],
    returnFiledDate: "2027-01-20", returnPaidInFullDate: "2027-01-20",
  });
  for (const date of ["2026-12-31", "2027-01-21", "2027-02-29"]) {
    for (const patch of [
      { ...actual, returnPayments: [{ date, amount: "12000.00" }] },
      { ...actual, returnFiledDate: date },
      { ...actual, returnPaidInFullDate: date },
    ]) {
      const held = reopen(patch);
      expect(validateSection(held, "payments")).toMatchObject({ status: "partial", allowSkip: false });
      expect(buildTaxInputFromGuidedData(held)).toBeNull();
    }
  }
});
it("holds conflicting positive prior-return refunds through Payments and the bridge", () => {
  for (const year of [2025, 2026]) {
    const credit = { sourceTaxYear: String(year - 1), amount: "872.09" };
    const source = {
      ...facts(), sourceTaxYear: String(year),
      priorYearCreditPayments: [{ appliedCreditIndex: "0", date: `${year}-04-15`, amount: credit.amount }],
    };
    const payments = { ...emptyPaymentData, estimatedTaxFacts: source, priorYearAppliedCredits: [credit] };
    const state = stateWith(payments);
    state.taxYear = year;
    const validation = validateSection(state, "payments");
    expect(validation).toMatchObject({ status: "partial", allowSkip: false });
    expect(validation.fieldErrors.estimatedTaxFacts).toMatch(/prior.return.*credit|prior.return.*refund/i);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(state.sectionData.payments).toEqual(payments);

    state.segmentation.filingStatus = "mfj";
    expect(validateSection(state, "payments").status).toBe("complete");
    state.segmentation.filingStatus = "single";

    state.sectionData.payments = { ...payments, estimatedTaxFacts: undefined };
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.priorYearAppliedCredits).toEqual([
      { ...credit, sourceTaxYear: year - 1, type: "federal" },
    ]);
    state.sectionData.payments = {
      ...payments, estimatedTaxFacts: { ...source, priorYearCreditPayments: [] },
      priorYearAppliedCredits: [{ ...credit, amount: "0.00" }],
    };
    expect(validateSection(state, "payments").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.priorYearAppliedCredits?.[0]?.amount).toBe("0.00");
  }
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
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: facts(), estimatedPayments: [{ date: "2026-01-15", amount: "4000", application: { taxYear: "2025", confirmed: true } }] });
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
  const state = stateWith({ ...emptyPaymentData, estimatedTaxFacts: source, estimatedPayments: [
    { date: "2025-04-15", amount: "1375" },
    { date: "2025-06-16", amount: "1375" },
    { date: "2025-09-15", amount: "1375" },
    { date: "2026-01-15", amount: "1375", application: { taxYear: "2025", confirmed: true } },
  ] });
  Object.assign(state.sectionData["income-w2"]!.entries[0], { wages: "85000", socialSecurityWages: "85000", medicareWages: "85000" });
  const input = buildTaxInputFromGuidedData(state); expect(input?.form2210?.priorYearTaxForForm2210).toBe("5000");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form2210?.requiredAnnualPayment.toFixed()).toBe("5500");
  expect(result.form2210?.penalty.toFixed()).toBe("0");
});

it("uses the farmer deadline, keeps waiver answers exact and leaves unknown answers unknown", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 2, 3, 12));
  const farmer = { ...facts(), farmerOrFisher: true, farmingIncomeTwoThirdsConfirmed: true };
  const build = (patch: Partial<EstimatedTaxFactsData>, year = 2025, base = farmer) => buildEstimatedTaxFacts({ ...emptyPaymentData, estimatedTaxFacts: { ...base, sourceTaxYear: String(year), ...patch } }, year);
  const dates = (date: string) => ({ earlyReturnExceptionClaimed: true, returnFiledDate: date, returnPaidInFullDate: date });
  expect(build(dates("2026-03-02"))?.returnFiledDate).toBe("2026-03-02");
  expect(() => build(dates("2026-03-03"))).toThrow(/conflict/);
  expect(() => build(dates("2026-02-20"), 2025, facts())).toThrow(/conflict/);
  expect(build(dates("2027-03-01"), 2026)?.returnFiledDate).toBe("2027-03-01");
  expect(() => build(dates("2027-03-02"), 2026)).toThrow(/conflict/);
  expect(() => build({ calculationMethod: "annualized" })).toThrow(/no annualized method/);
  const waiver = { waiverRequested: true, waiverKind: "full" as const, waiverReason: "retirement_or_disability" as const, waiverStatementReference: "Fictional statement" };
  expect(build(waiver, 2025, facts())).toMatchObject(waiver);
  for (const patch of [{ waiverKind: "" as const }, { waiverReason: "" as const }, { waiverStatementReference: " " }]) expect(() => build({ ...waiver, ...patch }, 2025, facts()), JSON.stringify(patch)).toThrow(/waiver/i);
  expect(() => build({ farmerOrFisher: null }, 2025, facts())).toThrow(/farmer or fisher/);
  expect(() => build({ waiverRequested: null }, 2025, facts())).toThrow(/penalty waiver/);
});

it("names the engine rejection instead of a silent empty preview", () => {
  const waiver = { waiverRequested: true, waiverKind: "partial" as const, waiverAmount: "999999", waiverReason: "retirement_or_disability" as const, waiverStatementReference: "Fictional statement" };
  const blocked = computeGuidedPreviewOutcome(stateWith({ ...emptyPaymentData, estimatedTaxFacts: { ...facts(), ...waiver } }));
  expect(blocked.metrics).toBeNull();
  expect(blocked.blockedBy).toMatch(/no more than the penalty/);
  const fine = computeGuidedPreviewOutcome(stateWith({ ...emptyPaymentData, estimatedTaxFacts: facts() }));
  expect(fine.blockedBy).toBeNull();
  expect(fine.metrics).not.toBeNull();
  expect(computeGuidedPreviewOutcome(null)).toEqual({ metrics: null, blockedBy: null });
});

