/** Spec: spec/state/oh-2026-dependent-care-credit-draft.yaml. */
import { describe, expect, it } from "vitest";
import { calculateOhio2026DependentCareCreditDraft as calculate } from "@/engine/state/oh-2026-dependent-care-credit-draft.js";

const jointReturn = {
  taxYear: 2026, filingStatus: "married_filing_jointly", reference: "private joint filing unit",
  primaryReference: "private primary owner", spouseReference: "private spouse owner",
  calendarYearConfirmed: true, bothSpousesFullYearOhioDomicileConfirmed: true,
  noOtherIncomeOrFederalOhioAgiAdjustmentsConfirmed: true, noDependentCareBenefitsOrReimbursementsConfirmed: true,
  noPriorYearCarePaymentsConfirmed: true,
};
const primaryWageOriginal = {
  taxYear: 2026, state: "OH", sourceReference: "private primary W2", recipientReference: jointReturn.primaryReference,
  box1Wages: "21000.00", box10DependentCareBenefits: "0.00", originalVerified: true,
  entireSeparateSection21EarnedIncomeConfirmed: true,
};
const spouseWageOriginal = {
  ...primaryWageOriginal, sourceReference: "private spouse W2", recipientReference: jointReturn.spouseReference,
  box1Wages: "18000.00",
};
const childOriginal = {
  reference: "private child file", jointReturnReference: jointReturn.reference, dateOfBirth: "2020-05-17",
  directSection152QualifyingChildConfirmed: true, livedWithBothSpousesAllYearConfirmed: true,
  soleQualifyingPersonConfirmed: true, requiredTaxpayerIdentificationVerified: true,
};
const child = { ...childOriginal, eligibleSection152A1DependentForJointUnitConfirmed: true };
const provider = {
  reference: "private provider file", licensedOhioCenterComplianceConfirmed: true,
  unrelatedNonHouseholdProviderConfirmed: true, nameAddressAndEinVerified: true,
};
const carePaymentOriginal = {
  sourceReference: "private payment ledger", taxYear: 2026, childReference: child.reference,
  providerReference: provider.reference, amountPaid: "3000.00", originalVerified: true,
  incurredAndPaidIn2026Confirmed: true, bothSpousesWorkRelatedCareOnlyConfirmed: true,
};
const carePayments = { ...carePaymentOriginal, payerReference: jointReturn.primaryReference, jointFilerBoreEligiblePaymentConfirmed: true };
const packet = { jointReturn, primaryWageOriginal, spouseWageOriginal, child, provider, carePayments };

describe("Ohio 2026 statutory dependent care credit draft", () => {
  it("reports the statutory tentative amount before federal and Ohio liability limits", () => {
    const result = calculate(packet);
    expect(result.statutoryTentativeCredit.toFixed(2)).toBe("285.00");
    const output = JSON.stringify(result);
    expect(JSON.parse(output)).toMatchObject({
      calculationStatus: "incomplete", reviewStatus: "independent-review-pending", filingQualified: false,
      lines: [{ line: "qualified-care-base", inputs: { "Federal AGI and Ohio MAGI": "39000" } },
        { line: "statutory-tentative-credit", inputs: { "Federal section 21 rate": "0.38", "Ohio statutory rate": "0.25",
          "Federal section 21 amount": "1140" } }],
    });
    expect(Object.keys(result).sort()).toEqual(["calculationStatus", "filingQualified", "lines", "reviewStatus", "statutoryTentativeCredit"]);
    for (const privateFact of [jointReturn.reference, jointReturn.primaryReference, jointReturn.spouseReference,
      primaryWageOriginal.sourceReference, spouseWageOriginal.sourceReference, child.reference, child.dateOfBirth,
      provider.reference, carePayments.sourceReference]) expect(output).not.toContain(privateFact);
  });

  it("applies the distinct federal and Ohio income boundaries without reporting rounding", () => {
    for (const [primaryWages, spouseWages, paid, expected] of [
      ["11000", "8999", "3000", "1410"],
      ["11000", "9000", "3000", "352.50"],
      ["21000", "18000", "1500.01", "142.50095"],
      ["21000", "18001", "3000", "277.50"],
      ["21000", "18999", "3000", "277.50"],
      ["21000", "19000", "3000", "0"],
    ]) expect(calculate({
      ...packet, primaryWageOriginal: { ...primaryWageOriginal, box1Wages: primaryWages },
      spouseWageOriginal: { ...spouseWageOriginal, box1Wages: spouseWages }, carePayments: { ...carePayments, amountPaid: paid },
    }).statutoryTentativeCredit.eq(expected), `wages ${primaryWages} and ${spouseWages}`).toBe(true);
  });

  it("caps the 2026 care base by both individual earnings and the single-child limit", () => {
    const cappedExpenses = { ...carePayments, amountPaid: "4800.00" };
    expect(calculate({ ...packet, carePayments: cappedExpenses }).statutoryTentativeCredit.eq("285")).toBe(true);
    expect(calculate({ ...packet, carePayments: cappedExpenses,
      spouseWageOriginal: { ...spouseWageOriginal, box1Wages: "2000.00" },
      primaryWageOriginal: { ...primaryWageOriginal, box1Wages: "37000.00" },
    }).statutoryTentativeCredit.eq("190")).toBe(true);
    expect(calculate({ ...packet, carePayments: cappedExpenses,
      primaryWageOriginal: { ...primaryWageOriginal, box1Wages: "1000.00" },
      spouseWageOriginal: { ...spouseWageOriginal, box1Wages: "38000.00" },
    }).statutoryTentativeCredit.eq("95")).toBe(true);
  });

  it("requires the actual eligible expense paid and borne by a joint filer", () => {
    expect(() => calculate({ ...packet, carePayments: carePaymentOriginal })).toThrow();
    expect(() => calculate({ ...packet, carePayments: { ...carePayments, jointFilerBoreEligiblePaymentConfirmed: false } })).toThrow();
    expect(() => calculate({ ...packet, carePayments: { ...carePayments, payerReference: "other payer" } })).toThrow(/same joint filing unit/);
    expect(calculate({ ...packet, carePayments: { ...carePayments, payerReference: jointReturn.spouseReference } })
      .statutoryTentativeCredit.eq("285")).toBe(true);
  });

  it("requires actual dependent eligibility after the section 152 exclusions", () => {
    expect(() => calculate({ ...packet, child: childOriginal })).toThrow();
    expect(() => calculate({ ...packet, child: { ...child, eligibleSection152A1DependentForJointUnitConfirmed: false } })).toThrow();
  });

  it("holds missing contradictory or unsupported household and care originals", () => {
    const cases = {
      jointReturn: [
        { taxYear: 2025 }, { filingStatus: "married_filing_separately" }, { calendarYearConfirmed: false },
        { bothSpousesFullYearOhioDomicileConfirmed: undefined }, { noOtherIncomeOrFederalOhioAgiAdjustmentsConfirmed: false },
        { noDependentCareBenefitsOrReimbursementsConfirmed: false }, { noPriorYearCarePaymentsConfirmed: undefined },
        { spouseReference: jointReturn.primaryReference },
      ],
      primaryWageOriginal: [
        { state: "PA" }, { taxYear: 2025 }, { originalVerified: false }, { sourceReference: spouseWageOriginal.sourceReference },
        { recipientReference: jointReturn.spouseReference }, { entireSeparateSection21EarnedIncomeConfirmed: undefined },
        { box10DependentCareBenefits: undefined }, { box10DependentCareBenefits: "1.00" }, { box1Wages: "0" },
      ],
      spouseWageOriginal: [{ box1Wages: "NaN" }, { box10DependentCareBenefits: "1.00" }, { recipientReference: "other owner" }],
      child: [
        { dateOfBirth: "2013-12-31" }, { dateOfBirth: "2026-06-01" }, { dateOfBirth: "2020-02-30" },
        { directSection152QualifyingChildConfirmed: false }, { livedWithBothSpousesAllYearConfirmed: undefined },
        { requiredTaxpayerIdentificationVerified: false }, { soleQualifyingPersonConfirmed: false },
        { jointReturnReference: "other filing unit" },
      ],
      provider: [{ licensedOhioCenterComplianceConfirmed: false }, { nameAddressAndEinVerified: undefined },
        { unrelatedNonHouseholdProviderConfirmed: false }],
      carePayments: [
        { childReference: "other child" }, { providerReference: "other provider" }, { taxYear: 2027 }, { originalVerified: false },
        { incurredAndPaidIn2026Confirmed: false }, { bothSpousesWorkRelatedCareOnlyConfirmed: false },
        { amountPaid: "-1.00" }, { amountPaid: "0.00" },
      ],
    } as const;
    for (const section of Object.keys(cases) as Array<keyof typeof cases>) {
      for (const change of cases[section]) expect(() => calculate({ ...packet, [section]: { ...packet[section], ...change } }),
        `${section} ${Object.keys(change).join(",")}`).toThrow();
    }
    expect(() => calculate({ ...packet, federalTaxLiabilityLimit: "680.00" })).toThrow();
    expect(() => calculate({ ...packet, ohioLiabilityBeforeCredit: "400.00" })).toThrow();
  });
});
