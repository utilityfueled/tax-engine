// Spec: spec/federal/guided-schedule-1-a.yaml.
import { expect, it } from "vitest";
import { buildSchedule1AInput, emptySchedule1AData, emptyVehicleInterest, type Schedule1AData, type VehicleInterestData } from "@/lib/guided-schedule-1-a-facts";
import { completeBusinessSection, completeW2Entry, startCompleteInterview } from "./complete-facts";
import { actualTipIncome, actualTipW2 } from "./guided-tip-income-fixtures";
function stateWithSources(year = 2025) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages", "self-employment"], lifeEvents: ["additional-deductions"], stateCode: null }); state.taxYear = year;
  state.sectionData["income-w2"] = { entries: [{ ...actualTipW2, wages: "50000", sourceTaxYear: String(year), box12CodeTP: "7000", box12CodeTT: "1000", treasuryTippedOccupationCodes: ["102"] }] };
  state.sectionData["income-self-employment"] = structuredClone(completeBusinessSection);
  state.sectionData["income-self-employment"]!.businessFacts = { ...state.sectionData["income-self-employment"]!.businessFacts, businessName: "Actual service" };
  state.sectionData["income-self-employment"]!.necEntries = [{ payerName: "Actual payer", payerTin: "12-3456789", accountHolder: "primary", nonemployeeCompensation: "5000", federalWithheld: "0", stateTaxReporting: "none", sourceTaxYear: String(year), cashTips: "200", qualifiedOvertimeCompensation: "0", treasuryTippedOccupationCodes: ["102"] }];
  const tipIncome = actualTipIncome(); tipIncome.sourceTaxYear = String(year);
  state.sectionData["additional-deductions"] = { tipIncomeAccounts: [tipIncome] };
  return state;
}
const common = { owner: "primary" as const, occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true };
export function actualAdditionalDeductions(): Schedule1AData {
  return { ...emptySchedule1AData, sourceTaxYear: "2025", sourceReference: "Actual deduction records", sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0",
    employeeTips: [{ ...common, employer: "Blue Ocean Restaurant", w2SourceIds: ["formW2:0"], form4137EmployerSourceId: "restaurant", reportingMethod: "w2", reportingSourceReference: "Actual source W2", reportedEmployerTips: "", qualifiedW2Tips: "7000", qualifiedForm4137Tips: "7018" }],
    businessTips: [{ ...common, businessSourceId: "scheduleC", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "200" }] }],
    overtime: [{ owner: "primary", compensationSourceId: "formW2:0", qualifiedPremium: "1000", compensationExcludedFromWages: "0", requiredByFlsa: true, reportingSourceReference: "Actual FLSA premium statement" }],
    vehicleLoans: [], seniorOwners: [],
  };
}
it("binds actual employee business and overtime records without profit overrides", () => {
  const state = stateWithSources(); const result = buildSchedule1AInput(actualAdditionalDeductions(), state)!;
  expect(result.employeeTips[0]?.qualifiedForm4137Tips).toBe("7018"); expect(result.overtime[0]?.reportedCompensation).toBe("50000");
  expect(result.businessTips[0]).toMatchObject({ businessSourceId: "scheduleC", businessName: "Actual service", qualifiedReportedTips: "200" });
  expect(result.businessTips[0]?.netProfit).toBeUndefined(); expect(result.businessTips[0]?.otherAllocableDeductions).toBeUndefined();
  const wrong = actualAdditionalDeductions(); wrong.employeeTips[0]!.w2SourceIds = ["formW2:00"]; expect(() => buildSchedule1AInput(wrong, state)).toThrow(/source/i);
  const tooMuch = actualAdditionalDeductions(); tooMuch.employeeTips[0]!.qualifiedForm4137Tips = "7018.01"; expect(() => buildSchedule1AInput(tooMuch, state)).toThrow(/source|tips/i);
  const otherOwner = structuredClone(state); otherOwner.sectionData["income-w2"]!.entries[0]!.accountHolder = "spouse"; expect(() => buildSchedule1AInput(actualAdditionalDeductions(), otherOwner)).toThrow(/owner|source/i);
  const unknown = actualAdditionalDeductions(); unknown.overtime[0]!.requiredByFlsa = null; expect(() => buildSchedule1AInput(unknown, state)).toThrow();
  const noFlsa = actualAdditionalDeductions(); noFlsa.overtime[0]!.requiredByFlsa = false; expect(buildSchedule1AInput(noFlsa, state)?.overtime[0]?.requiredByFlsa).toBe(false);
});
it("preserves actual loan and senior facts and rejects unknown or conflicting sources", () => {
  const state = stateWithSources(); const facts = actualAdditionalDeductions(); facts.employeeTips = []; facts.businessTips = []; facts.overtime = []; facts.seniorOwners = ["primary"];
  state.sectionData["personal-info"]!.dateOfBirth = "1960-02-14";
  facts.vehicleLoans = [{ owner: "primary", lenderName: "Actual lender", loanAccountReference: "loan-1", sourceTaxYear: "2025", sourceReference: "Actual loan statement", borrowerQualificationConfirmed: true, vin: "1HGCM82633A004352", acquiredDate: "2025-01-01", loanOriginationDate: "2025-01-01", interestPaid: "9007199254740993.01", businessInterestDeducted: "0", nonqualifyingInterest: "0", firstLien: true, originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car", grossVehicleWeightRating: "4000", relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: false }];
  expect(buildSchedule1AInput(facts, state)?.vehicleLoans[0]?.interestPaid).toBe("9007199254740993.01");
  state.sectionData["personal-info"]!.employmentValidSsnIssuedByDueDate = false; expect(buildSchedule1AInput(facts, state)?.primarySsnEligible).toBe(false);
  state.sectionData["personal-info"]!.employmentValidSsnIssuedByDueDate = null; expect(() => buildSchedule1AInput(facts, state)).toThrow(/SSN|identity/i);
  state.sectionData["personal-info"]!.employmentValidSsnIssuedByDueDate = true;
  const missing = structuredClone(facts); missing.vehicleLoans[0]!.businessInterestDeducted = ""; expect(() => buildSchedule1AInput(missing, state)).toThrow();
  const falseLoan = structuredClone(facts); falseLoan.vehicleLoans[0]!.borrowerQualificationConfirmed = false; expect(buildSchedule1AInput(falseLoan, state)?.vehicleLoans[0]?.borrowerQualificationConfirmed).toBe(false);
  const refinance = structuredClone(facts); refinance.vehicleLoans[0]!.refinanced = true; expect(() => buildSchedule1AInput(refinance, state)).toThrow(/refinanc/i);
  state.sectionData["personal-info"]!.childTaxCredit = { possessionIncomeExclusion: "100", puertoRicoExcludedIncome: "100", form4563ExcludedIncome: "0", bonaFidePuertoRicoResident: true };
  expect(() => buildSchedule1AInput(facts, state)).toThrow(/exclu|conflict|reconcil/i);
});
function vehicleStatementFacts() {
  const form1098Vli = {
    sourceTaxYear: "2026", sourceReference: "Fictional Copy B", payer: "primary" as const,
    currentUncorrected: true, sourceFactsConfirmed: true, lenderAcquisitionDateBlank: true, lenderAcquisitionDate: "",
    reportedInterest: "9,007,199,254,740,993.01", directThirdPartyInterest: "300.10",
    reimbursedBorrowerInterest: "100.03", priorYearInterestRefund: "0.00",
    originalUseChecked: true, usAssemblyChecked: true,
  };
  const loan = {
    ...emptyVehicleInterest, owner: "primary" as const, lenderName: "Fictional lender", loanAccountReference: "loan-1",
    sourceTaxYear: "2026", sourceReference: "Fictional payment ledger", borrowerQualificationConfirmed: true,
    vin: "1HGCM82633A004352", acquiredDate: "2025-01-01", loanOriginationDate: "2025-01-01",
    interestPaid: "9007199254740592.88", businessInterestDeducted: "20.00", nonqualifyingInterest: "0",
    firstLien: true, originalUse: true, finalAssemblyUnitedStates: true, personalUse: true,
    vehicleType: "car" as const, grossVehicleWeightRating: "4000", relatedParty: false, lease: false,
    fleet: false, salvageOrScrap: false, refinanced: false, form1098Vli,
  };
  const facts: Schedule1AData = {
    ...emptySchedule1AData, sourceTaxYear: "2026", sourceReference: "Fictional deduction records",
    sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0",
    vehicleLoans: [loan],
  };
  return { facts, loan, form1098Vli };
}

it("holds repeated actual vehicle loan accounts through the guided source bridge", async () => {
  const { buildTaxInputFromGuidedData } = await import("@/lib/guided-interview-bridge");
  const state = stateWithSources(2026);
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const first = {
    ...loan, interestPaid: "900", businessInterestDeducted: "0",
    form1098Vli: { ...form1098Vli, reportedInterest: "900", directThirdPartyInterest: "0", reimbursedBorrowerInterest: "0" },
  };
  const second = {
    ...first, lenderName: "fictional   LENDER", loanAccountReference: " LOAN- 1 ",
    vin: "1HGCM82653A004353", sourceReference: "Another payment ledger entry",
    form1098Vli: { ...first.form1098Vli, sourceReference: "Another Copy B" },
  };
  const configure = (vehicleLoans: VehicleInterestData[]) => {
    state.sectionData["additional-deductions"] = { schedule1A: { ...facts, vehicleLoans } };
  };
  configure([first, { ...second, loanAccountReference: "loan-2" }]);
  expect(buildTaxInputFromGuidedData(state)?.schedule1A?.vehicleLoans).toHaveLength(2);
  configure([first, second]);
  expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [first, second] }, state)).toThrow(/same lender and loan account/u);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("routes actual 2026 Copy B and reconciles exact borrower payments", async () => {
  const state = stateWithSources(2026);
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const replay = structuredClone(facts);
  expect(buildSchedule1AInput(replay, state)?.vehicleLoans[0]).toMatchObject({
    sourceReference: "Fictional payment ledger", interestPaid: "9007199254740592.88",
    form1098Vli: {
      taxYear: 2026, payer: "primary", lenderName: "Fictional lender", loanAccountReference: "loan-1",
      vin: "1HGCM82633A004352", originationDate: "2025-01-01", lenderAcquisitionDate: null,
      sourceReference: "Fictional Copy B", factsConfirmed: true, corrected: false,
      reportedInterest: "9007199254740993.01", directThirdPartyInterest: "300.1",
      reimbursedBorrowerInterest: "100.03", priorYearInterestRefund: "0",
      originalUseChecked: true, usAssemblyChecked: true,
    },
  });
  for (const patch of [
    { sourceTaxYear: "2025" }, { currentUncorrected: false }, { sourceFactsConfirmed: null }, { payer: "spouse" as const },
    { lenderAcquisitionDateBlank: null }, { lenderAcquisitionDateBlank: false, lenderAcquisitionDate: "2026-02-01" },
    { lenderAcquisitionDate: "2026-02-01" }, { reportedInterest: "9007199254740993.011" },
    { priorYearInterestRefund: "" }, { priorYearInterestRefund: "0.01" }, { directThirdPartyInterest: "" },
    { reimbursedBorrowerInterest: "" }, { originalUseChecked: false }, { usAssemblyChecked: false },
  ]) {
    const changed = { ...loan, form1098Vli: { ...form1098Vli, ...patch } };
    expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [changed] }, state)).toThrow(/1098-VLI/);
  }
  for (const patch of [{ interestPaid: "9007199254740592.89" }, { nonqualifyingInterest: "0.01" }, { originalUse: false }, { refinanced: true }]) {
    expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [{ ...loan, ...patch }] }, state)).toThrow(/1098-VLI/);
  }
  expect(replay).toEqual(facts);
  const manual = { ...loan, form1098Vli: undefined, interestPaid: "599.99" };
  expect(buildSchedule1AInput({ ...facts, vehicleLoans: [manual] }, state)?.vehicleLoans[0]).toMatchObject({ interestPaid: "599.99", form1098Vli: undefined });

  const { validateSection } = await import("@/lib/guided-interview-flow");
  const { buildTaxInputFromGuidedData } = await import("@/lib/guided-interview-bridge");
  const { calculateSchedule1A } = await import("@/engine/schedules/schedule-1-a");
  const { TaxYearInputSchema } = await import("@/models/inputs");
  const { d } = await import("@/utils/decimal");
  state.sectionData["additional-deductions"] = { schedule1A: {
    ...facts, vehicleLoans: [{
      ...loan, interestPaid: "500.25",
      form1098Vli: {
        ...form1098Vli, reportedInterest: "900719925474099312345678900.25",
        directThirdPartyInterest: "900719925474099312345678300", reimbursedBorrowerInterest: "100",
      },
    }],
  } };
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const schedule = input.schedule1A;
  if (!schedule) throw new Error("Missing guided Schedule 1-A input");
  expect(schedule.vehicleLoans[0]?.form1098Vli?.reportedInterest).toBe("900719925474099312345678900.25");
  const result = calculateSchedule1A({ taxpayer: input.taxpayer, agi: d("55000"), foreignExcludedIncome: d("0"), facts: schedule });
  expect(result.vehicleInterestDeduction.toFixed()).toBe("480");
});
function vehicleRefundProof() {
  return {
    method: "cash_refund", originTaxYear: "2025", receiptTaxYear: "2026", cashRefundReceived: "123.45",
    refundSourceReference: "Refund deposit receipt", priorPaymentSourceReference: "2025 lender portal",
    filedReturnSourceReference: "Filed 2025 federal return and amendment", amendedReturnStatus: "reviewed",
    loanSourcesMatchConfirmed: true, borrowerBoreRecoveredPaymentConfirmed: true,
    filedReturnHistoryCompleteConfirmed: true, sourceFactsConfirmed: true,
    schedule1ADeductedInterest: "0.00", businessDeductedInterest: "0", otherDeductedInterest: "0.00",
  } as const;
}
it("routes documented Box 5 cash only when all prior deductions were zero", () => {
  const state = stateWithSources(2026);
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const proof = vehicleRefundProof();
  const statement = { ...form1098Vli, priorYearInterestRefund: "123.45", priorYearRefundProof: proof };
  const draft = { ...facts, vehicleLoans: [{ ...loan, form1098Vli: statement }] };
  const result = buildSchedule1AInput(draft, state)?.vehicleLoans[0];
  expect(result).toMatchObject({ interestPaid: loan.interestPaid, form1098Vli: {
    priorYearInterestRefund: "123.45", reportedInterest: "9007199254740993.01", priorYearRefundProof: {
      method: "cash_refund", originTaxYear: 2025, receiptTaxYear: 2026, cashRefundReceived: "123.45", factsConfirmed: true,
      refundSourceReference: proof.refundSourceReference, priorPaymentSourceReference: proof.priorPaymentSourceReference,
      filedReturnSourceReference: proof.filedReturnSourceReference, amendedReturnStatus: "reviewed",
      loanSourcesMatchConfirmed: true, borrowerBoreRecoveredPaymentConfirmed: true, filedReturnHistoryCompleteConfirmed: true,
      schedule1ADeductedInterest: "0", businessDeductedInterest: "0", otherDeductedInterest: "0",
    },
  } });
  for (const patch of [
    { method: "loan_credit" }, { originTaxYear: "" }, { receiptTaxYear: "2025" }, { cashRefundReceived: "123.44" },
    { refundSourceReference: "" }, { priorPaymentSourceReference: "" }, { filedReturnSourceReference: "" },
    { amendedReturnStatus: "unreviewed" }, { loanSourcesMatchConfirmed: false }, { borrowerBoreRecoveredPaymentConfirmed: null },
    { filedReturnHistoryCompleteConfirmed: null }, { sourceFactsConfirmed: null },
    { schedule1ADeductedInterest: "" }, { businessDeductedInterest: "0.01" }, { otherDeductedInterest: "1" },
  ] as const) {
    const failed = { ...loan, form1098Vli: { ...statement, priorYearRefundProof: { ...proof, ...patch } } };
    expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [failed] }, state)).toThrow(/Box 5/);
  }
  expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [{ ...loan, acquiredDate: "2026-01-01", form1098Vli: statement }] }, state)).toThrow(/Box 5/);
  expect(() => buildSchedule1AInput({ ...facts, vehicleLoans: [{ ...loan, form1098Vli: { ...statement, priorYearInterestRefund: "0" } }] }, state)).toThrow(/Box 5/);
});
it("reconciles a documented Box 5 credit included in the same loan's Box 1 interest", () => {
  const state = stateWithSources(2026);
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const cash = vehicleRefundProof();
  const proof = { ...cash, method: "loan_credit" as const, creditAppliedTaxYear: "2026", creditCashRefundReceived: "0.00", creditSourceReference: "2026 lender application record",
    currentYearInterestCreditApplied: "123.45", borrowerInterestExcludingCredit: "676.80", currentYearInterestCreditIncludedInBox1Confirmed: true };
  const statement = { ...form1098Vli, priorYearInterestRefund: "123.45", priorYearRefundProof: proof,
    reportedInterest: "800.25", directThirdPartyInterest: "0.00", reimbursedBorrowerInterest: "0.00" };
  const sourceLoan = { ...loan, interestPaid: "800.25", form1098Vli: statement };
  const build = (edited: VehicleInterestData = sourceLoan) => buildSchedule1AInput({ ...facts, vehicleLoans: [edited] }, state)?.vehicleLoans[0];
  expect(build()).toMatchObject({ interestPaid: "800.25", form1098Vli: { reportedInterest: "800.25", priorYearInterestRefund: "123.45",
    priorYearRefundProof: { method: "loan_credit", originTaxYear: 2025, receiptTaxYear: 2026, cashRefundReceived: "0",
      currentYearInterestCreditApplied: "123.45", borrowerInterestExcludingCredit: "676.8", currentYearInterestCreditIncludedInBox1Confirmed: true,
      refundSourceReference: proof.creditSourceReference, priorPaymentSourceReference: cash.priorPaymentSourceReference,
      filedReturnSourceReference: cash.filedReturnSourceReference, loanSourcesMatchConfirmed: true, borrowerBoreRecoveredPaymentConfirmed: true,
      filedReturnHistoryCompleteConfirmed: true, factsConfirmed: true, schedule1ADeductedInterest: "0", businessDeductedInterest: "0", otherDeductedInterest: "0" } } });
  for (const patch of [
    { method: "mixed" }, { creditCashRefundReceived: "" }, { creditCashRefundReceived: "0.01" }, { creditSourceReference: "" },
    { currentYearInterestCreditIncludedInBox1Confirmed: null }, { currentYearInterestCreditIncludedInBox1Confirmed: false },
    { currentYearInterestCreditApplied: "123.46" }, { borrowerInterestExcludingCredit: "676.81" }, { borrowerInterestExcludingCredit: "676.801" },
    { creditAppliedTaxYear: "" }, { creditAppliedTaxYear: "2025" }, { borrowerBoreRecoveredPaymentConfirmed: false }, { loanSourcesMatchConfirmed: null },
    { filedReturnHistoryCompleteConfirmed: null }, { otherDeductedInterest: "0.01" },
  ] as const) {
    expect(() => build({ ...sourceLoan, form1098Vli: { ...statement, priorYearRefundProof: { ...proof, ...patch } } })).toThrow(/Box 5/);
  }
  for (const patch of [{ directThirdPartyInterest: "0.01" }, { reimbursedBorrowerInterest: "0.01" }]) {
    expect(() => build({ ...sourceLoan, form1098Vli: { ...statement, reportedInterest: "800.26", ...patch } })).toThrow(/Box 5/);
  }
  const largeAmount = "9007199254740993123456.23";
  const largeStatement = { ...statement, reportedInterest: largeAmount, priorYearInterestRefund: "0.02", priorYearRefundProof: {
    ...proof, currentYearInterestCreditApplied: "0.02", borrowerInterestExcludingCredit: "9007199254740993123456.21",
  } };
  expect(build({ ...sourceLoan, interestPaid: largeAmount, form1098Vli: largeStatement })?.interestPaid).toBe(largeAmount);
  expect(() => build({ ...sourceLoan, interestPaid: largeAmount, form1098Vli: { ...largeStatement, priorYearRefundProof: {
    ...largeStatement.priorYearRefundProof, borrowerInterestExcludingCredit: "9007199254740993123456.22",
  } } })).toThrow(/Box 5/);
});
it("revokes stale Box 5 confirmations on batched credit edits", async () => {
  const { updateSectionData } = await import("@/lib/guided-interview-flow");
  const state = stateWithSources(2026);
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const proof = { ...vehicleRefundProof(), method: "loan_credit" as const, creditAppliedTaxYear: "2026", creditCashRefundReceived: "0",
    creditSourceReference: "Separate lender credit record", currentYearInterestCreditApplied: "123.45",
    borrowerInterestExcludingCredit: "676.80", currentYearInterestCreditIncludedInBox1Confirmed: true };
  const statement = { ...form1098Vli, priorYearInterestRefund: "123.45", priorYearRefundProof: proof,
    reportedInterest: "800.25", directThirdPartyInterest: "0", reimbursedBorrowerInterest: "0" };
  const cashLoan = { ...loan, interestPaid: "800.25", form1098Vli: { ...statement, priorYearRefundProof: { ...proof, method: "cash_refund" as const } } };
  state.sectionData["additional-deductions"] = { schedule1A: { ...facts, vehicleLoans: [cashLoan] } };
  const write = (before: typeof state, after: Schedule1AData) => updateSectionData(before, "additional-deductions", { schedule1A: after });
  const worksheet = (current: typeof state) => current.sectionData["additional-deductions"]!.schedule1A!;
  const creditLoan = { ...cashLoan, form1098Vli: statement };
  const changed = write(state, { ...facts, vehicleLoans: [creditLoan] });
  expect(worksheet(changed)).toMatchObject({ sourceFactsConfirmed: null, vehicleLoans: [{ form1098Vli: { sourceFactsConfirmed: null,
    priorYearRefundProof: { ...proof, sourceFactsConfirmed: null, loanSourcesMatchConfirmed: null, borrowerBoreRecoveredPaymentConfirmed: null,
      filedReturnHistoryCompleteConfirmed: null, currentYearInterestCreditIncludedInBox1Confirmed: null } } }] });
  const rechecked = write(changed, { ...facts, sourceFactsConfirmed: null, vehicleLoans: [creditLoan] });
  const requested = write(rechecked, { ...worksheet(rechecked), sourceFactsConfirmed: true });
  expect(buildSchedule1AInput(worksheet(requested), requested)?.vehicleLoans[0]?.form1098Vli?.priorYearRefundProof?.method).toBe("loan_credit");

  const edited = write(requested, { ...facts, vehicleLoans: [{ ...creditLoan, interestPaid: "800.26", form1098Vli: {
    ...statement, reportedInterest: "800.26", priorYearRefundProof: { ...proof, borrowerInterestExcludingCredit: "676.81" },
  } }] });
  expect(worksheet(edited)).toMatchObject({ sourceFactsConfirmed: null, vehicleLoans: [{ form1098Vli: { sourceFactsConfirmed: null,
    priorYearRefundProof: { cashRefundReceived: "123.45", borrowerInterestExcludingCredit: "676.81",
      sourceFactsConfirmed: null, currentYearInterestCreditIncludedInBox1Confirmed: null, filedReturnHistoryCompleteConfirmed: true } } }] });
  const replaced = write(requested, { ...facts, vehicleLoans: [{ ...creditLoan, owner: "spouse", lenderName: "Other lender" }] });
  expect(worksheet(replaced).vehicleLoans[0]).toMatchObject({ borrowerQualificationConfirmed: null, form1098Vli: { sourceFactsConfirmed: null,
    priorYearRefundProof: { filedReturnHistoryCompleteConfirmed: null, filedReturnSourceReference: proof.filedReturnSourceReference } } });
  const manualSpouseLoan = { ...creditLoan, owner: "spouse" as const, form1098Vli: undefined };
  const removedStatement = write(requested, { ...facts, vehicleLoans: [manualSpouseLoan] });
  expect.soft(worksheet(removedStatement).vehicleLoans[0]).toMatchObject({ owner: "spouse", interestPaid: "800.25",
    borrowerQualificationConfirmed: null, form1098Vli: undefined });
  const clearedStatement = { ...statement, priorYearInterestRefund: "0", priorYearRefundProof: undefined };
  const removedProof = write(requested, { ...facts, vehicleLoans: [{ ...creditLoan, form1098Vli: clearedStatement }] });
  expect.soft(worksheet(removedProof).vehicleLoans[0]).toMatchObject({ borrowerQualificationConfirmed: true,
    form1098Vli: { ...clearedStatement, sourceFactsConfirmed: null } });
  const manual = write(requested, { ...facts, vehicleLoans: [{ ...creditLoan, form1098Vli: undefined }] });
  expect(worksheet(write(manual, { ...facts, vehicleLoans: [manualSpouseLoan] })).vehicleLoans[0]).toEqual(manualSpouseLoan);
});
it("rechecks vehicle records when the actual borrower changes", async () => {
  const { updateSectionData } = await import("@/lib/guided-interview-flow");
  const state = stateWithSources(2026);
  state.segmentation.filingStatus = "mfj";
  const personal = state.sectionData["personal-info"];
  if (!personal?.spouse) throw new Error("Missing synthetic joint household");
  const { facts, loan, form1098Vli } = vehicleStatementFacts();
  const proof = vehicleRefundProof();
  const statement = { ...form1098Vli, priorYearInterestRefund: "123.45", priorYearRefundProof: proof };
  const primaryLoan = { ...loan, form1098Vli: statement };
  const spouseLoan = { ...loan, owner: "spouse" as const, vin: "1HGCM82633A004350", loanAccountReference: "loan-2",
    form1098Vli: { ...statement, payer: "spouse" as const } };
  state.sectionData["additional-deductions"] = { schedule1A: { ...facts, vehicleLoans: [primaryLoan, spouseLoan] } };
  expect(buildSchedule1AInput(state.sectionData["additional-deductions"].schedule1A, state)?.vehicleLoans).toHaveLength(2);

  const staleStatement = { ...statement, sourceFactsConfirmed: null, priorYearRefundProof: {
    ...proof, sourceFactsConfirmed: null, loanSourcesMatchConfirmed: null, borrowerBoreRecoveredPaymentConfirmed: null,
    filedReturnHistoryCompleteConfirmed: null,
  } };
  const replaced = { ...personal, spouse: { ...personal.spouse, firstName: "Other spouse", ssn: "222-33-4445" } };
  const changed = updateSectionData(state, "personal-info", replaced);
  const updated = changed.sectionData["additional-deductions"]?.schedule1A;
  expect(updated?.sourceFactsConfirmed).toBeNull();
  expect(updated?.vehicleLoans).toEqual([primaryLoan, { ...spouseLoan, borrowerQualificationConfirmed: null,
    form1098Vli: { ...staleStatement, payer: "spouse" } }]);
  if (!updated) throw new Error("Missing retained Schedule 1-A records");
  const outerReconfirmed = updateSectionData(changed, "additional-deductions", { schedule1A: { ...updated, sourceFactsConfirmed: true } });
  expect(() => buildSchedule1AInput(outerReconfirmed.sectionData["additional-deductions"]?.schedule1A, outerReconfirmed)).toThrow(/Copy B/);

  const primaryChanged = updateSectionData(state, "personal-info", { ...personal, lastName: "Changed" });
  expect(primaryChanged.sectionData["additional-deductions"]?.schedule1A?.vehicleLoans).toEqual([
    { ...primaryLoan, borrowerQualificationConfirmed: null, form1098Vli: staleStatement }, spouseLoan,
  ]);
  const unrelated = updateSectionData(state, "personal-info", { ...personal, addressLine1: "Updated address" });
  expect(unrelated.sectionData["additional-deductions"]?.schedule1A?.vehicleLoans).toEqual([primaryLoan, spouseLoan]);
  const formatted = updateSectionData(state, "personal-info", { ...personal, spouse: { ...personal.spouse, ssn: "222334444" } });
  expect(formatted.sectionData["additional-deductions"]?.schedule1A?.vehicleLoans).toEqual([primaryLoan, spouseLoan]);
  const removed = updateSectionData(state, "personal-info", { ...personal, spouse: undefined });
  expect(removed.sectionData["additional-deductions"]?.schedule1A?.vehicleLoans).toEqual(updated.vehicleLoans);
});
it("requires actual year-specific reported tips and overtime", () => {
  const state = stateWithSources(2026); const facts = actualAdditionalDeductions(); facts.sourceTaxYear = "2026";
  expect(buildSchedule1AInput(facts, state)?.sourceTaxYear).toBe(2026);
  for (const patch of [{ box12CodeTP: undefined }, { box12CodeTT: "" }, { sourceTaxYear: "2025" }, { treasuryTippedOccupationCodes: [] }]) {
    const missing = structuredClone(state); Object.assign(missing.sectionData["income-w2"]!.entries[0]!, patch); expect(() => buildSchedule1AInput(facts, missing)).toThrow(/source|report|year|code/i);
  }
  const missingNec = structuredClone(state); missingNec.sectionData["income-self-employment"]!.necEntries[0]!.cashTips = ""; expect(() => buildSchedule1AInput(facts, missingNec)).toThrow(/source|report/i);
  const thirdOccupation = structuredClone(state); thirdOccupation.sectionData["income-w2"]!.entries[0]!.treasuryTippedOccupationCodes = ["101", "106"];
  expect(buildSchedule1AInput(facts, thirdOccupation)?.employeeTips[0]?.occupationCode).toBe("102");
  const zero = structuredClone(facts); zero.employeeTips[0]!.qualifiedW2Tips = "0"; zero.employeeTips[0]!.qualifiedForm4137Tips = "0"; zero.businessTips[0]!.reportedTipSources[0]!.qualifiedTips = "0"; zero.overtime[0]!.qualifiedPremium = "0";
  expect(buildSchedule1AInput(zero, state)?.overtime[0]?.qualifiedPremium).toBe("0");
  const old = stateWithSources(); old.sectionData["income-w2"]!.entries = [{ ...completeW2Entry, ...actualTipW2, wages: "50000", sourceTaxYear: "2025" }]; expect(buildSchedule1AInput(actualAdditionalDeductions(), old)?.sourceTaxYear).toBe(2025);
  old.sectionData["income-w2"]!.entries[0]!.sourceTaxYear = undefined;
  expect(() => buildSchedule1AInput(actualAdditionalDeductions(), old)).toThrow(/year|source/i);
  const payroll = stateWithSources(); payroll.sectionData["income-w2"]!.entries[0]!.wages = "900";
  const statements = actualAdditionalDeductions(); statements.employeeTips[0]!.reportingMethod = "form4070"; statements.employeeTips[0]!.reportedEmployerTips = "7000"; statements.overtime[0]!.compensationExcludedFromWages = "100";
  expect(buildSchedule1AInput(statements, payroll)?.overtime[0]?.reportedCompensation).toBe("1000");
  statements.employeeTips[0]!.reportedEmployerTips = ""; expect(() => buildSchedule1AInput(statements, payroll)).toThrow(/reported|tip/i);
  statements.employeeTips[0]!.reportedEmployerTips = "7000"; statements.overtime[0]!.compensationExcludedFromWages = ""; expect(() => buildSchedule1AInput(statements, payroll)).toThrow(/compensation|payroll|wage/i);
});

it("routes the confirmed worksheet and invalidates substantive source changes", async () => {
  const { updateSectionData, validateSection } = await import("@/lib/guided-interview-flow");
  const { buildTaxInputFromGuidedData } = await import("@/lib/guided-interview-bridge");
  const state = stateWithSources(); state.sectionData["additional-deductions"]!.schedule1A = actualAdditionalDeductions();
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state)!;
  expect(input.schedule1A?.overtime[0]).toMatchObject({ compensationSourceId: "formW2:0", reportedCompensation: "50000", compensationExcludedFromWages: "0" });
  expect(input.w2s[0]?.taxYear).toBe(2025); expect(input.form1099Nec[0]?.taxYear).toBe(2025);
  expect(input.form4137ByOwner?.primary?.sourceFacts?.employers?.[0]?.cashAndChargeTipsReceived).toBe("7018");
  for (const section of ["personal-info", "income-w2", "income-self-employment", "income-social-security", "adjustments", "credits", "deductions"] as const) {
    const changed = updateSectionData(state, section, { ...state.sectionData[section], reviewSourceChanged: "actual new source" });
    expect(changed.sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBeNull();
  }
  const confirmed = updateSectionData(state, "additional-deductions", structuredClone(state.sectionData["additional-deductions"]));
  expect(confirmed.sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBe(true);
  const changedTips = structuredClone(state.sectionData["additional-deductions"]!); changedTips.tipIncomeAccounts![0]!.noncashTipsNotIncludedInWages = "25.51";
  expect(updateSectionData(state, "additional-deductions", changedTips).sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBeNull();
  const unrelated = updateSectionData(state, "payments", { estimatedPayments: [] }); expect(unrelated.sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBe(true);
});
it("supports actual Form4137-only sources without an employer report", () => {
  for (const year of [2025, 2026]) {
    const state = stateWithSources(year); state.sectionData["income-w2"] = { entries: [] };
    const ledger = state.sectionData["additional-deductions"]!.tipIncomeAccounts![0]!;
    Object.assign(ledger.employers[0]!, { w2SourceIds: [], cashAndChargeTipsReceived: "718", tipsReportedToEmployer: "0" });
    const facts = actualAdditionalDeductions(); facts.sourceTaxYear = String(year); facts.businessTips = []; facts.overtime = [];
    Object.assign(facts.employeeTips[0]!, { w2SourceIds: [], reportingMethod: "form4137", reportingSourceReference: "Actual filed Form4137 source record", reportedEmployerTips: "", qualifiedW2Tips: "0", qualifiedForm4137Tips: "718" });
    expect(buildSchedule1AInput(facts, state)?.employeeTips[0]).toMatchObject({ reportingMethod: "form4137", w2SourceIds: [], qualifiedW2Tips: "0", qualifiedForm4137Tips: "718", reportedEmployerTips: undefined });
    facts.employeeTips[0]!.qualifiedW2Tips = "1"; expect(() => buildSchedule1AInput(facts, state)).toThrow(/source|report|W2/i);
  }
});

it("calculates the guided deduction without duplicating income or business adjustments", async () => {
  const { buildTaxInputFromGuidedData } = await import("@/lib/guided-interview-bridge");
  const { calculateFederalTax } = await import("@/engine/federal");
  const { TaxYearInputSchema } = await import("@/models/inputs");
  const state = stateWithSources();
  const baseline = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  state.sectionData["additional-deductions"]!.schedule1A = actualAdditionalDeductions();
  const input = buildTaxInputFromGuidedData(state)!;
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  // Employee: max(7,000 employer report, 7,018 Form4137 column(c));
  // business: 200; overtime: 1,000. Business QBI falls by 200, so its
  // unconstrained 20% deduction falls by 40; taxable income falls by 8,178.
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("7218");
  expect(result.schedule1A?.overtimeDeduction.toFixed()).toBe("1000");
  expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(result.totalWithholding.eq(baseline.totalWithholding)).toBe(true);
  expect(result.allLines.find(line => line.form === "Sched SE" && line.line === "12")?.value.toFixed())
    .toBe(baseline.allLines.find(line => line.form === "Sched SE" && line.line === "12")?.value.toFixed());
  expect(baseline.form8995!.qbiDeduction.minus(result.form8995!.qbiDeduction).toFixed()).toBe("40");
  expect(baseline.taxableIncome.minus(result.taxableIncome).toFixed()).toBe("8178");
  expect(input.schedule1A?.businessTips[0]?.netProfit).toBeUndefined();
  expect(input.schedule1A?.businessTips[0]?.otherAllocableDeductions).toBeUndefined();
});
