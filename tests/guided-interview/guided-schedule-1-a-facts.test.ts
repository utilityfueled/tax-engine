// Spec: spec/federal/guided-schedule-1-a.yaml.
import { expect, it } from "vitest";
import { buildSchedule1AInput, emptySchedule1AData, type Schedule1AData } from "@/lib/guided-schedule-1-a-facts";
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
