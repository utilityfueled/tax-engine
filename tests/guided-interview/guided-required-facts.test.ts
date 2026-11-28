// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { buildDonationsInput, buildEducationInput, buildEstimatedPaymentsInput, buildForm1098Inputs, buildRetirementInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeDeductionComparison, emptyCreditsData, emptyDeductionData, emptyEducationStudent, emptyRetirementEntry, validateSection, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, type DonationEntryData, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { parseInput } from "@/ingest/loader";
import { simpleW2Fixture } from "../fixtures/simple-w2";
import { completePersonalInfo, startCompleteInterview, completeAocEligibility, completeEducationClaimant, completeMortgageSource, completeMortgageWorksheet, completeRetirementSource, completeW2Entry } from "./complete-facts";

const mortgage = { ...completeMortgageSource, lender: "Actual Bank", mortgageInterest: "123.45", interestPaidByReturnAmount: "123.45", outstandingPrincipal: "0", originationDate: "2016-06-05" };
const donation = { organization: "Actual Charity", type: "cash" as const, amount: "12.34", date: "2025-02-28", costBasis: "", isLongTermCapitalGain: null, isPrivateFoundation: false, qualifiedOrganization: true, cashAmountBasis: "net-contribution" as const };
const retirement = { ...completeRetirementSource, payer: "Actual Plan", grossDistribution: "1000", taxableAmount: "0", distributionCode: "7" };
const stateWith = (section: string, data: unknown) => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, sectionData: { ...state.sectionData, [section]: data } };
};

describe("required guided source facts", () => {
  it("reconfirms the holding-period and valuation facts after changing a 2026 noncash gift date", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: "2026", wages: "100000", federalWithheld: "10000" }] };
    const stock: DonationEntryData = { ...donation, organization: "Original Foundation", type: "appreciated_stock", amount: "5000", costBasis: "800",
      date: "2026-06-04", isLongTermCapitalGain: true, isPrivateFoundation: true, recipientCategory: "private-nonoperating",
      qualifiedAppreciatedStock: true, cashAmountBasis: undefined };
    const cash: DonationEntryData = { ...donation, date: "2026-06-04", amount: "111", cashAmountBasis: "net-contribution" };
    const otherStock = { ...stock, organization: "Separate Foundation", date: "2026-04-22" };
    const deductions = { ...emptyDeductionData, method: "itemized" as const, charitableContributions: "10111", donationEntries: [stock, otherStock, cash] };
    state.sectionData.deductions = deductions;
    expect(buildTaxInputFromGuidedData(state)?.donations?.[0]?.isLongTermCapitalGain).toBe(true);

    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; },
      removeItem: () => { value = null; }, clear: () => { value = null; }, key: () => null, length: 0 } satisfies Storage;
    const reopen = (draft: GuidedFlowState) => {
      const target = { storageKey: "donation-date" };
      expect(saveGuidedFlowState(storage, target, draft)).toBe(true);
      const reopened = loadGuidedFlowState(storage, target);
      if (!reopened) throw new Error("Expected the edited donation to reopen");
      return reopened;
    };
    const changed = { ...stock, date: "2026-01-04" };
    const next = reopen(updateSectionData(reopen(state), "deductions", { ...deductions, donationEntries: [otherStock, changed, cash] }));
    expect(validateSection(next, "deductions").fieldErrors).toHaveProperty("donation-1-capital-gain");
    expect(buildTaxInputFromGuidedData(next)).toBeNull();
    expect(next.sectionData.deductions?.donationEntries).toEqual([otherStock, { ...changed, isLongTermCapitalGain: null,
      qualifiedAppreciatedStock: null }, cash]);

    const reviewed = updateSectionData(next, "deductions", { ...deductions, donationEntries: [otherStock,
      { ...changed, isLongTermCapitalGain: false, qualifiedAppreciatedStock: null }, cash] });
    expect(buildTaxInputFromGuidedData(reviewed)?.donations?.[1]).toMatchObject({ amount: "5000", costBasis: "800", isLongTermCapitalGain: false });

    const sameValueStock = { ...stock, date: "2026-04-22", isLongTermCapitalGain: false, qualifiedAppreciatedStock: null };
    const sameValueDeductions = { ...deductions, charitableContributions: "10000", donationEntries: [stock, sameValueStock] };
    const sameValueState = reopen({ ...state, sectionData: { ...state.sectionData, deductions: sameValueDeductions } });
    const remaining = { ...sameValueDeductions, charitableContributions: "5000" };
    const copiedDate = { ...stock, date: sameValueStock.date };
    const ambiguous = reopen(updateSectionData(sameValueState, "deductions", { ...remaining, donationEntries: [copiedDate] }));
    expect(validateSection(ambiguous, "deductions").fieldErrors).toHaveProperty("donation-0-capital-gain");
    expect(buildTaxInputFromGuidedData(ambiguous)).toBeNull();
    expect(ambiguous.sectionData.deductions?.donationEntries).toEqual([{ ...copiedDate, isLongTermCapitalGain: null, qualifiedAppreciatedStock: null }]);

    const reconfirmed = updateSectionData(ambiguous, "deductions", { ...remaining, donationEntries: [sameValueStock] });
    expect(buildTaxInputFromGuidedData(reconfirmed)?.donations?.[0]).toMatchObject({ dateOfDonation: sameValueStock.date, isLongTermCapitalGain: false });
    const retained = updateSectionData(sameValueState, "deductions", { ...remaining, donationEntries: [sameValueStock] });
    expect(retained.sectionData.deductions?.donationEntries).toEqual([sameValueStock]);

    const matchingAnswers = reopen({ ...state, sectionData: { ...state.sectionData,
      deductions: { ...sameValueDeductions, donationEntries: [stock, copiedDate] } } });
    const held = updateSectionData(matchingAnswers, "deductions", { ...remaining, donationEntries: [copiedDate] });
    expect(buildTaxInputFromGuidedData(held)).toBeNull();
    const originalRow = matchingAnswers.sectionData.deductions?.donationEntries?.[1];
    if (!originalRow) throw new Error("Expected an original noncash gift row");
    const kept = updateSectionData(matchingAnswers, "deductions", { ...remaining, donationEntries: [originalRow] });
    expect(kept.sectionData.deductions?.donationEntries).toEqual([copiedDate]);

    const initial = { ...state, sectionData: { ...state.sectionData, deductions: { ...deductions, donationEntries: [{ ...stock, date: "" }, otherStock, cash] } } };
    expect(updateSectionData(initial, "deductions", deductions).sectionData.deductions?.donationEntries).toEqual(deductions.donationEntries);
    const cashDateEdit = { ...cash, date: "2026-01-03" };
    expect(updateSectionData(state, "deductions", { ...deductions, donationEntries: [stock, otherStock, cashDateEdit] })
      .sectionData.deductions?.donationEntries?.[2]).toEqual(cashDateEdit);
    expect(updateSectionData({ ...state, taxYear: 2025 }, "deductions", { ...deductions, donationEntries: [changed, otherStock, cash] })
      .sectionData.deductions?.donationEntries?.[0]).toEqual(changed);
  });

  it("uses the net cash gift on Schedule A and preserves the net object contract", () => {
    const gift = { ...donation, amount: "70", cashAmountBasis: "gross-payment" as const, cashBenefitValue: "40", cashExcessGiftIntended: true };
    const deductions = { ...emptyDeductionData, method: "itemized" as const, charitableContributions: "70", donationEntries: [gift] };
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "85000" }] };
    state.sectionData.deductions = deductions;
    expect(validateSection(state, "deductions").status).toBe("complete");
    const normalized = buildTaxInputFromGuidedData(state);
    expect(normalized?.donations[0].amount).toBe("30");
    expect(computeDeductionComparison("single", deductions, 2025).itemizedTotal).toBe("30");
    expect(calculateFederalTax(parseInput(normalized)).scheduleA.cashCharitable.toFixed()).toBe("30");
    const netObject = parseInput({ ...simpleW2Fixture, deductionElection: "itemized", donations: [{ organization: "Actual Charity", type: "cash", amount: "30", dateOfDonation: "2025-02-28", recipientCategory: "fifty-percent", qualifiedOrganization: true }] });
    expect(calculateFederalTax(netObject)
      .scheduleA.cashCharitable.toFixed()).toBe("30");
    expect(state.sectionData.deductions?.donationEntries).toEqual([gift]);
    expect(state.sectionData.deductions?.charitableContributions).toBe("70");
  });

  it("holds ambiguous restored cash gifts and incomplete gross receipts", () => {
    const gift = { ...donation, cashAmountBasis: "gross-payment" as const, amount: "70", cashBenefitValue: "40", cashExcessGiftIntended: true };
    const deductions = { ...emptyDeductionData, method: "itemized" as const, donationEntries: [gift], charitableContributions: "70" };
    for (const missing of [
      { cashAmountBasis: undefined, cashBenefitValue: undefined, cashExcessGiftIntended: undefined },
      { cashBenefitValue: "" }, { cashBenefitValue: "-0.01" }, { cashExcessGiftIntended: undefined },
      { cashAmountBasis: "net-contribution" as const },
    ]) {
      const draft = { ...gift, ...missing };
      const original = stateWith("deductions", { ...deductions, donationEntries: [draft] });
      const loaded = loadGuidedFlowState({ getItem: () => JSON.stringify(original) } as unknown as Storage, "legacy-cash-basis");
      if (!loaded) throw new Error("Expected the saved cash gift to reopen.");
      expect(loaded.sectionData.deductions?.donationEntries).toEqual([JSON.parse(JSON.stringify(draft))]);
      expect(validateSection(loaded, "deductions").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(loaded)).toBeNull();
    }
    const cashAmount = (overrides: Partial<typeof gift>) => buildDonationsInput({ ...deductions, charitableContributions: "", donationEntries: [{ ...gift, ...overrides }] }, 2025)[0].amount;
    expect(cashAmount({ cashBenefitValue: "0", cashExcessGiftIntended: undefined })).toBe("70");
    expect(cashAmount({ cashExcessGiftIntended: false })).toBe("0");
    expect(cashAmount({ cashBenefitValue: "70", cashExcessGiftIntended: undefined })).toBe("0");
    expect(cashAmount({ amount: "900719925474099312345.31", cashBenefitValue: "0.11" })).toBe("900719925474099312345.2");
  });

  it("requires actual charity qualification for 2025 without replacing false", () => {
    const data = { ...emptyDeductionData, method: "itemized" as const, donationEntries: [{ ...donation, qualifiedOrganization: undefined }] };
    expect(() => buildDonationsInput(data, 2025)).toThrow(/qualification|qualif/i);
    const rejectedGift = { ...data, donationEntries: [{ ...donation, qualifiedOrganization: false }] };
    expect(buildDonationsInput(rejectedGift, 2025)[0].qualifiedOrganization).toBe(false);
    expect(buildTaxInputFromGuidedData(stateWith("deductions", rejectedGift))?.donations[0].qualifiedOrganization).toBe(false);
    const privateStock = { ...data, donationEntries: [{ ...donation, type: "appreciated_stock" as const, amount: "5000", costBasis: "1000", qualifiedOrganization: true, isPrivateFoundation: true, recipientCategory: "private-nonoperating" as const, isLongTermCapitalGain: true }] };
    expect(() => buildDonationsInput(privateStock, 2025)).toThrow(/qualified appreciated stock/i);
    expect(buildDonationsInput({ ...privateStock, donationEntries: [{ ...privateStock.donationEntries[0], qualifiedAppreciatedStock: false }] }, 2025)[0].qualifiedAppreciatedStock).toBe(false);
  });
  it("does not manufacture mortgage or donation details from legacy totals", () => {
    expect(() => buildForm1098Inputs({ ...emptyDeductionData, method: "itemized", mortgageInterest: "100" })).toThrow(/mortgage/i);
    expect(() => buildDonationsInput({ ...emptyDeductionData, method: "itemized", charitableContributions: "100" })).toThrow(/donation/i);
    expect(buildTaxInputFromGuidedData(stateWith("deductions", { ...emptyDeductionData, method: "itemized", mortgageInterest: "100" }))).toBeNull();
  });
  it("preserves actual mortgage principal and donation classification", () => {
    const data = { ...emptyDeductionData, method: "itemized" as const, mortgageInterest: "123.45", mortgageEntries: [mortgage], mortgageWorksheet: { ...completeMortgageWorksheet }, charitableContributions: "12.34", donationEntries: [donation] };
    expect(buildForm1098Inputs(data, 2025, "single")).toEqual([{ sourceId: "Actual Bank:synthetic-loan-1", taxYear: 2025, sourceFactsComplete: true, lender: "Actual Bank", loanAccountReference: "synthetic-loan-1", mortgageInterestReceived: "123.45", outstandingMortgagePrincipal: "0", mortgageOriginationDate: "2016-06-05", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTax: "0" }]);
    expect(buildDonationsInput(data)[0]).toMatchObject({ organization: "Actual Charity", type: "cash", amount: "12.34", dateOfDonation: "2025-02-28", isPrivateFoundation: false });
    expect(() => buildForm1098Inputs({ ...data, mortgageEntries: [{ ...mortgage, outstandingPrincipal: "" }] }, 2025, "single")).toThrow(/principal/i);
    expect(() => buildDonationsInput({ ...data, donationEntries: [{ ...donation, type: "property", costBasis: "" }] })).toThrow(/basis|classification/i);
  });
  it("preserves actual loan identity independently of unchanged source amounts", () => {
    const data = { ...emptyDeductionData, method: "itemized" as const, mortgageInterest: "123.45", mortgageEntries: [mortgage], mortgageWorksheet: { ...completeMortgageWorksheet } };
    const original = buildForm1098Inputs(data, 2025, "single")[0];
    const changed = buildForm1098Inputs({ ...data, mortgageEntries: [{ ...mortgage, accountReference: "actual-loan-2" }] }, 2025, "single")[0];
    expect(changed).toEqual({ ...original, sourceId: "Actual Bank:actual-loan-2", loanAccountReference: "actual-loan-2" });
    expect(original.loanAccountReference).toBe("synthetic-loan-1");
    for (const accountReference of ["", "   "]) {
      expect(() => buildForm1098Inputs({ ...data, mortgageEntries: [{ ...mortgage, accountReference }] }, 2025, "single")).toThrow(/reference/i);
    }
    expect(mortgage.accountReference).toBe("synthetic-loan-1");
  });
  it("rejects impossible and conflicting source dates", () => {
    for (const date of ["", "2025-02-29", "2026-02-28"]) {
      const state = stateWith("deductions", { ...emptyDeductionData, method: "itemized", charitableContributions: "12.34", donationEntries: [{ ...donation, date }] });
      expect(validateSection(state, "deductions").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
    expect(() => buildEstimatedPaymentsInput({ estimatedPayments: [{ amount: "100", date: "" }], otherPayments: "" })).toThrow(/date/i);
    expect(buildEstimatedPaymentsInput({ estimatedPayments: [{ amount: "0", date: "2026-01-15" }], otherPayments: "" })).toEqual([{ amount: "0", date: "2026-01-15", type: "federal" }]);
    expect(buildTaxInputFromGuidedData(stateWith("payments", { estimatedPayments: [{ amount: "100", date: "2024-01-15" }], otherPayments: "" }))).toBeNull();
  });
  it("does not default retirement codes or taxable amounts", () => {
    expect(emptyRetirementEntry.distributionCode).toBe("");
    expect(() => buildRetirementInputs([{ ...retirement, distributionCode: "" }])).toThrow(/code/i);
    expect(buildRetirementInputs([retirement])[0].taxableAmount).toBe("0");
    expect(buildRetirementInputs([{ ...retirement, taxableAmount: "" }])[0].taxableAmount).toBeUndefined();
    expect(buildTaxInputFromGuidedData(stateWith("income-retirement", { entries: [{ ...retirement, taxableAmount: "" }] }))).toBeNull();
  });
  it("requires explicit education history and preserves zero", () => {
    expect(emptyEducationStudent.priorYearsClaimed).toBe("");
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, llcExpenses: "", refundableAocEligible: false, aocStudents: [{ ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "" }] } };
    expect(() => buildEducationInput(credits)).toThrow(/prior|history/i);
    expect(buildTaxInputFromGuidedData(stateWith("credits", credits))).toBeNull();
    expect(buildEducationInput({ ...credits, education: { ...credits.education, aotcClaimantFactsTaxYear: 2025, aocStudents: [{ ...credits.education.aocStudents[0], priorYearsClaimed: "0" }] } }, 2025)?.aocStudents[0].priorYearsClaimed).toBe(0);
  });
  it("rejects duplicate family tax IDs and malformed ZIP or state", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
    for (const data of [
      { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse!, ssn: completePersonalInfo.ssn } },
      { ...completePersonalInfo, zip: "bad" },
      { ...completePersonalInfo, state: "ZZ" },
    ]) expect(buildTaxInputFromGuidedData({ ...state, sectionData: { "personal-info": data } })).toBeNull();
  });
  it("requires reconfirmation of legacy prefilled facts without changing their values", () => {
    const original = stateWith("income-retirement", { entries: [retirement] });
    const legacy = { ...original, factsVersion: undefined };
    const loaded = loadGuidedFlowState({ getItem: () => JSON.stringify(legacy) } as unknown as Storage, "legacy");
    expect(loaded?.taxYear).toBe(2025);
    expect(loaded?.sectionData["income-retirement"]?.entries[0].distributionCode).toBe("7");
    expect(validateSection(loaded!, "income-retirement").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(loaded!)).toBeNull();
  });
  it("preserves explicit residency and all education eligibility answers", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = { ...completePersonalInfo, usResidencyMonths: "0", spouse: { ...completePersonalInfo.spouse!, usResidencyMonths: "0" } };
    const taxpayer = buildTaxInputFromGuidedData(state)?.taxpayer;
    expect(taxpayer?.primary.usResidencyMonths).toBe(0);
    expect(taxpayer?.spouse?.usResidencyMonths).toBe(0);
    expect(taxpayer?.stateResidency).toBe("full-year");
    const eligibility = { completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false };
    const student = { ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "0", ...eligibility };
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2025, llcExpenses: "", refundableAocEligible: false, aocStudents: [student] } };
    expect(buildEducationInput(credits, 2025)).toMatchObject({ refundableAocEligible: false, aocStudents: [{ ...eligibility }] });
    const missingSupport = stateWith("credits", { ...credits, education: { ...credits.education, refundableAocEligible: undefined, refundableAocFacts: undefined } });
    missingSupport.sectionData["personal-info"] = { ...completePersonalInfo, dateOfBirth: "2005-02-01" };
    expect(buildTaxInputFromGuidedData(missingSupport)).toBeNull();
  });
});

describe("2026 eligibility facts", () => {
  it("does not turn a 2026 Lifetime Learning aggregate into an eligible student", () => {
    const state = { ...stateWith("credits", { ...emptyCreditsData, education: { ...emptyCreditsData.education, llcExpenses: "1000", primarySsnEligible: true } }), taxYear: 2026 };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(buildTaxInputFromGuidedData({ ...state, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, education: { ...emptyCreditsData.education, llcExpenses: "0" } } } })).not.toBeNull();
  });
  it("requires actual 2026 charity and education eligibility facts", () => {
    const gift = { ...donation, date: "2026-02-28" };
    const deductions = { ...emptyDeductionData, donationEntries: [gift] };
    const state = { ...stateWith("deductions", deductions), taxYear: 2026 };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    const eligible = { ...gift, qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, qualifiedAppreciatedStock: false };
    const result = buildTaxInputFromGuidedData({ ...state, sectionData: { ...state.sectionData, deductions: { ...deductions, donationEntries: [eligible] } } });
    expect(result?.donations[0]).toMatchObject({ qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, qualifiedAppreciatedStock: false });
    const student = { ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "4000", priorYearsClaimed: "0", studentSsnEligible: false, institutionEin: "12-3456789" };
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, aotcClaimantFactsTaxYear: 2026, aocStudents: [student], llcExpenses: "", refundableAocEligible: false, primarySsnEligible: false } };
    const educationState = { ...stateWith("credits", credits), taxYear: 2026 };
    educationState.sectionData["personal-info"] = { ...completePersonalInfo, employmentValidSsnIssuedByDueDate: false };
    expect(buildTaxInputFromGuidedData(educationState)?.educationExpenses).toMatchObject({ primarySsnEligible: false, aocStudents: [{ studentSsnEligible: false, institutionEin: "12-3456789" }] });
    expect(buildTaxInputFromGuidedData({ ...educationState, sectionData: { ...educationState.sectionData, credits: { ...credits, education: { ...credits.education, primarySsnEligible: undefined } } } })).toBeNull();
  });
});
