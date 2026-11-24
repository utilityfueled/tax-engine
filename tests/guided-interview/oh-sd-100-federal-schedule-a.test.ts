/** Spec: spec/state/oh-sd-100-federal-schedule-a.yaml. */
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal";
import { prepareOhioResidencyReviewWithFederalResult } from "@/engine/state/oh-residency-source";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { confirmGuidedOhioPaymentFacts } from "@/lib/guided-ohio-payment-facts";
import { confirmGuidedOhioResidencyFacts, snapshotGuidedOhioOriginals } from "@/lib/guided-ohio-residency-facts";
import { confirmGuidedOhioSchoolDistrictFacts } from "@/lib/guided-ohio-school-district-facts";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
import { fillScheduleA, SCHEDULE_A_FIELDS } from "@/pdf/fill-schedule-a";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers";
import { enteredSchoolDraft, guidedSchoolDistrictFixture, required } from "../fixtures/guided-oh-school-district-complete";
import { guidedSchoolBalanceFixture } from "../fixtures/guided-oh-sd-100-remaining-balance";

function itemizedWithCurrentOhioOriginals(state: GuidedFlowState) {
  state.sectionData.deductions = { ...state.sectionData.deductions, method: "itemized", realEstateTaxes: "18000" };
  const base = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const data = required(state.sectionData["state-return"]);
  data.ohioResidency = confirmGuidedOhioResidencyFacts(base, data.ohioResidency);
  data.ohioPayments = confirmGuidedOhioPaymentFacts(base, data.ohioPayments);
  data.ohioSchoolDistrict = confirmGuidedOhioSchoolDistrictFacts(base, data.ohioSchoolDistrict, data.ohioResidency, data.ohioPayments);
  return buildGuidedStateOriginals(base, state);
}

function scheduleALine5a(input: TaxYearInput) {
  return calculateFederalTax(input).allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed();
}

function withAdjustments(input: TaxYearInput, changes: Partial<NonNullable<TaxYearInput["adjustments"]>>) {
  const current = structuredClone(input);
  current.adjustments = { estimatedTaxPayments: [], extensionPayments: [], priorYearAppliedCredits: [], ...current.adjustments, ...changes };
  return bindCurrentOhioOriginals(current);
}

function bindCurrentOhioOriginals(current: TaxYearInput) {
  const original = snapshotGuidedOhioOriginals(current);
  required(current.ohioResidency).originalFederalSources = structuredClone(original);
  required(current.ohioPayments).originalFederalSources = structuredClone(original);
  required(current.ohioSchoolDistrict).originalFederalSources = structuredClone(original);
  return current;
}

function reopen(state: GuidedFlowState) {
  const items = new Map<string, string>();
  const storage: Storage = {
    get length() { return items.size; },
    clear: () => items.clear(), getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); },
    key: index => [...items.keys()][index] ?? null,
  };
  expect(saveGuidedFlowState(storage, "fictional-district-payment", state)).toBe(true);
  return required(loadGuidedFlowState(storage, "fictional-district-payment"));
}

it("deducts three native school estimates and leaves the January installment on the Ohio return", () => {
  const { state } = guidedSchoolDistrictFixture("estimates");
  const current = itemizedWithCurrentOhioOriginals(state);
  const before = structuredClone(state);
  const { preview } = computeGuidedPreviewEvaluation(state);
  expect(preview.blockedBy).toBeNull();
  expect(preview.metrics?.state).toMatchObject({
    stateWithholding: "3000", schoolDistrict: { withholding: "600", estimatedPayments: "400", totalPayments: "1000", priorCredit: "0" },
  });
  expect.soft(scheduleALine5a(current)).toBe("3900");
  expect.soft(preview.metrics?.taxableIncome).toBe("58100");
  expect(state).toEqual(before);
});

it("uses distinct same-day state and school receipts and rejects a reused confirmation", () => {
  const { data, state, draft } = guidedSchoolDistrictFixture("estimates");
  const districtReceipt = required(draft.payments.paymentRows[0]);
  required(data.ohioPayments).paymentRows = [{
    ...districtReceipt, returnType: "it1040", sourceId: "fictional-state-payment",
    sourceReference: "Fictional independently verified IT 1040 payment",
    original: { ...districtReceipt.original, returnType: "it1040", confirmationNumber: "fictional-state-confirmation" },
  }];
  const current = itemizedWithCurrentOhioOriginals(state);
  const { preview } = computeGuidedPreviewEvaluation(state);
  expect(preview.blockedBy).toBeNull();
  expect(preview.metrics?.state).toMatchObject({ stateWithholding: "3100", schoolDistrict: { estimatedPayments: "400" } });
  expect.soft(scheduleALine5a(current)).toBe("4000");
  expect.soft(preview.metrics?.taxableIncome).toBe("58000");

  const mirrored = withAdjustments(current, { estimatedTaxPayments: [{ date: "2025-04-15", amount: "100", type: "state", state: " oh " }] });
  expect.soft(scheduleALine5a(mirrored)).toBe("4000");

  const duplicate = structuredClone(current);
  required(required(duplicate.ohioPayments).paymentRows[0]).original.confirmationNumber = districtReceipt.original.confirmationNumber.toLowerCase();
  expect.soft(() => calculateFederalTax(duplicate)).toThrow(/duplicate.*receipt/i);
});

it("holds generic district aliases and keeps recognized different-state payments separate", () => {
  const { state } = guidedSchoolDistrictFixture("estimates");
  const current = itemizedWithCurrentOhioOriginals(state);
  const payment = { date: "2025-04-15", amount: "100", type: "state" } as const;
  const credit = { sourceTaxYear: 2024, amount: "100", type: "state" } as const;
  for (const alias of ["0302", "Hillsdale LSD", "Ohio"]) {
    expect.soft(() => scheduleALine5a(withAdjustments(current, { estimatedTaxPayments: [{ ...payment, state: alias }] }))).toThrow(/school district/i);
    expect.soft(() => scheduleALine5a(withAdjustments(current, { extensionPayments: [{ ...payment, state: alias }] }))).toThrow(/school district/i);
    expect.soft(() => scheduleALine5a(withAdjustments(current, { priorYearAppliedCredits: [{ ...credit, state: alias }] }))).toThrow(/school district/i);
  }
  expect.soft(() => scheduleALine5a(withAdjustments(current, { estimatedTaxPayments: [{ ...payment, state: "OH" }] }))).toThrow(/distinct actual original/i);
  expect.soft(() => scheduleALine5a(withAdjustments(current, { extensionPayments: [{ ...payment, state: "OH" }] }))).toThrow(/school district/i);
  expect.soft(() => scheduleALine5a(withAdjustments(current, { priorYearAppliedCredits: [{ ...credit, state: "OH" }] }))).toThrow(/Ohio.*prior-year credit/i);
  expect(scheduleALine5a(withAdjustments(current, {
    estimatedTaxPayments: [{ ...payment, state: " va " }], extensionPayments: [{ ...payment, state: "DC" }],
    priorYearAppliedCredits: [{ ...credit, state: "PA" }, { ...credit, state: " pr " }],
  }))).toBe("4300");
});

it("deducts only the verified prior district refund applied to the current district account", () => {
  const { state, data, facts, original } = guidedSchoolDistrictFixture("election");
  const owner = original.taxpayer.primary;
  facts.payments.priorReturn = {
    status: "filed_return", sourceReference: "Fictional filed 2024 school district return", taxYear: 2024, returnType: "sd100",
    districtCode: "0302", accountName: `${owner.firstName} ${owner.lastName}`, accountSsn: owner.ssn,
    filingStatus: "single", periodStart: "2024-01-01", periodEnd: "2024-12-31", returnKind: "original",
    filedDate: "2025-04-15", filingExtension: { kind: "none" }, line8: "0", line19: "150", electedCreditCarryforward: "125",
  };
  facts.payments.priorCreditCarryforward = {
    status: "actual_credit", sourceReference: "Fictional posted current district credit", accountHolder: "primary", accountSsn: owner.ssn,
    electedAmount: "125", availableForThisReturn: "100", appliedToThisReturnConfirmed: true,
  };
  facts.payments.account.priorCreditApplied = "100";
  data.ohioSchoolDistrict = enteredSchoolDraft(facts);
  const current = itemizedWithCurrentOhioOriginals(state);
  const { preview } = computeGuidedPreviewEvaluation(state);
  expect(preview.blockedBy).toBeNull();
  expect(preview.metrics?.state).toMatchObject({
    schoolDistrict: { withholding: "1100", estimatedPayments: "0", totalPayments: "1200", priorCredit: "100", outgoingCarryforward: "25", refund: "175" },
  });
  expect.soft(scheduleALine5a(current)).toBe("4200");
  expect.soft(preview.metrics?.taxableIncome).toBe("57800");
});

it("deducts school withholding once and excludes a verified current school balance paid in 2026", () => {
  const { state } = guidedSchoolBalanceFixture();
  const current = itemizedWithCurrentOhioOriginals(state);
  const { preview } = computeGuidedPreviewEvaluation(state);
  expect(preview.blockedBy).toBeNull();
  expect(preview.metrics?.state).toMatchObject({ schoolDistrict: { withholding: "600", estimatedPayments: "0", totalPayments: "600", amountOwed: "400" } });
  expect(scheduleALine5a(current)).toBe("3600");
  expect(preview.metrics?.taxableIncome).toBe("58400");
});

it("retains a verified school deduction through removal, stale save and current known-none replacement", () => {
  const { state, draft } = guidedSchoolDistrictFixture();
  draft.payments.paymentRows = [required(guidedSchoolDistrictFixture("estimates").draft.payments.paymentRows[0])];
  draft.payments.account.estimatedPaymentsCredited = "100";
  itemizedWithCurrentOhioOriginals(state);
  const confirmed = reopen(updateSectionData(state, "state-return", structuredClone(required(state.sectionData["state-return"]))));
  const data = required(confirmed.sectionData["state-return"]);
  expect.soft(data).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);

  const removed = reopen(updateSectionData(confirmed, "state-return", { ...data, ohioSchoolDistrict: undefined }));
  const held = { blockedBy: expect.stringMatching(/school district/i), metrics: null };
  expect.soft(computeGuidedPreviewEvaluation(removed).preview).toMatchObject(held);

  const knownNone = structuredClone(required(data.ohioSchoolDistrict));
  knownNone.payments.paymentRows = [];
  knownNone.payments.account.estimatedPaymentsCredited = "0";
  const stale = structuredClone(removed);
  const staleDraft = structuredClone(knownNone);
  const staleOriginal = TaxYearInputSchema.parse(staleDraft.originalFederalSources);
  required(staleOriginal.scheduleA).realEstateTaxes = "18001";
  staleDraft.originalFederalSources = staleOriginal;
  required(stale.sectionData["state-return"]).ohioSchoolDistrict = staleDraft;
  const staleSaved = reopen(stale);
  const staleEdited = reopen(updateSectionData(staleSaved, "income-w2", { ...required(staleSaved.sectionData["income-w2"]) }));
  expect.soft(required(staleEdited.sectionData["state-return"])).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);
  expect.soft(computeGuidedPreviewEvaluation(staleEdited).preview).toMatchObject(held);

  const malformed = structuredClone(stale);
  required(required(malformed.sectionData["state-return"]).ohioSchoolDistrict).originalFederalSources = {};
  const malformedSaved = reopen(malformed);
  const malformedEdited = reopen(updateSectionData(malformedSaved, "income-w2", { ...required(malformedSaved.sectionData["income-w2"]) }));
  expect.soft(required(malformedEdited.sectionData["state-return"])).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);
  expect.soft(computeGuidedPreviewEvaluation(malformedEdited).preview).toMatchObject(held);

  const pending = updateSectionData(removed, "state-return", { ...required(removed.sectionData["state-return"]),
    ohioSchoolDistrict: { ...knownNone, sourceFactsConfirmed: null },
  });
  itemizedWithCurrentOhioOriginals(pending);
  const resolved = reopen(updateSectionData(pending, "state-return", structuredClone(required(pending.sectionData["state-return"]))));
  expect.soft(required(resolved.sectionData["state-return"])).not.toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear");
  expect.soft(computeGuidedPreviewEvaluation(resolved).preview).toMatchObject({ blockedBy: null, metrics: { taxableIncome: "57900" } });
});

it("reopens federal Schedule A for the school deduction and rejects a coherent stale result", async () => {
  const { state } = guidedSchoolDistrictFixture("estimates");
  const current = itemizedWithCurrentOhioOriginals(state);
  const { federalResult, token } = prepareOhioResidencyReviewWithFederalResult(current);
  const redacted = redactReviewIdentifiers(current);
  const blank = "forms/blank/2025/f1040sa.pdf";
  const filled = await fillScheduleA(redacted, redactReviewIdentifiers(federalResult), blank, undefined, token);
  const reopened = await PDFDocument.load(await filled.save());
  expect(reopened.getForm().getTextField(SCHEDULE_A_FIELDS.line5a).getText()?.replaceAll(",", "")).toBe("3900");
  expect(reopened.getForm().getTextField(SCHEDULE_A_FIELDS.line17).getText()?.replaceAll(",", "")).toBe("21900");

  const { ohioSchoolDistrict: _district, ...beforeSchoolDeduction } = current;
  const stale = calculateFederalTax(beforeSchoolDeduction);
  await expect(fillScheduleA(redacted, redactReviewIdentifiers(stale), blank, undefined, token).then(() => true)).rejects.toThrow(/original.*computation/i);
});

it("validates Schedule AI after the school payments change the automatic deduction selection", () => {
  const { state } = guidedSchoolDistrictFixture("estimates");
  const current = itemizedWithCurrentOhioOriginals(state);
  current.deductionElection = "automatic";
  required(current.scheduleA).realEstateTaxes = "11900";
  const w2 = required(current.w2s[0]);
  w2.federalWithheld = "0";
  const { stateLocalSources, ...federalW2 } = w2;
  required(stateLocalSources).originalW2 = structuredClone(federalW2);
  const periods = [
    { adjustedGrossIncome: "20000", itemizedDeductions: "900" },
    { adjustedGrossIncome: "33333.33", itemizedDeductions: "1600" },
    { adjustedGrossIncome: "53333.33", itemizedDeductions: "2600" },
    { adjustedGrossIncome: "80000", itemizedDeductions: "15800" },
  ];
  current.form2210 = {
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
    withholdingMethod: "equal-installments", priorYearTaxStatus: "no-return", calculationMethod: "annualized",
    annualizedIncomePeriods: periods.map(period => ({
      ...period,
      qbiDeduction: "0", qualifiedDividends: "0", netCapitalGain: "0", netProfitFromSelfEmployment: "0",
      socialSecurityWages: "0", otherTaxes: "0", credits: "0",
    })),
  };
  const original = bindCurrentOhioOriginals(current);
  const result = calculateFederalTax(original);
  expect(result.deductionUsed).toBe("itemized");
  expect(result.deductionAmount.toFixed()).toBe("15800");
  expect(result.taxableIncome.toFixed()).toBe("64200");
  expect(result.form2210?.scheduleAi).toBeDefined();
  expect(result.form2210?.lines.find(line => line.form === "Form 2210 Schedule AI" && line.line === "6d")?.value.toFixed()).toBe("15800");

  const wrongAnnualSource = structuredClone(original);
  required(required(wrongAnnualSource.form2210).annualizedIncomePeriods?.[3]).itemizedDeductions = "15799";
  expect(() => calculateFederalTax(bindCurrentOhioOriginals(wrongAnnualSource))).toThrow(/reconcile to the completed return/i);
});
