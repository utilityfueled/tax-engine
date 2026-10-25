// Spec: spec/federal/schedule-1-a-return.yaml.
import { expect, it } from "vitest";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { calculateSchedule1AReturn } from "@/engine/forms/schedule-1-a-return.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { tipFacts } from "../../fixtures/form4137.js";

const eligible = { owner: "primary", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true };
function withFacts(input: TaxYearInput) {
  if (!input.schedule1A) throw new Error("Synthetic source fixture requires Schedule1A facts");
  return { ...input, schedule1A: input.schedule1A };
}
function make(year = 2026) {
  return withFacts(TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: year, accountHolder: "primary", wages: "50000", socialSecurityWages: "49500", socialSecurityTips: "500", allocatedTips: "0", box12CodeTP: "500", box12CodeTT: "1000", treasuryTippedOccupationCodes: ["102"] }],
    schedule1A: { sourceTaxYear: year, sourceReference: "Actual annual source records", sourceFactsConfirmed: true, allSourcesIncluded: true,
      primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", seniorOwners: [], businessTips: [], overtime: [], vehicleLoans: [],
      employeeTips: [{ ...eligible, employer: "Tech Corp", w2SourceIds: ["formW2:0"], reportingMethod: "w2", reportingSourceReference: "Actual employer statement", qualifiedW2Tips: "500", qualifiedForm4137Tips: "0" }],
    },
  }));
}
function calc(input = make(), agi = "50000", net = "1000", adjusted = "850", verified = true) {
  return calculateSchedule1AReturn({ input, agi: d(agi), foreignExcludedIncome: d(0),
    tipPayroll: calculateUnreportedTipPayroll(input, input.taxpayer.taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025)),
    scheduleC: calculateScheduleC(input, input.scheduleC),
    businessSources: input.scheduleC ? [{ id: "scheduleC", name: "Actual service", accountHolder: "primary", netSEEarnings: d(net), qbi: d(net) }] : [],
    adjustedBusinessSources: input.scheduleC ? [{ id: "scheduleC", name: "Actual service", accountHolder: "primary", netSEEarnings: d(net), qbi: d(adjusted) }] : [],
    businessDeductionsVerified: verified,
  });
}
function business(year = 2026, tips = "900", profit = "1000") {
  const input = make(year);
  return withFacts(TaxYearInputSchema.parse({ ...input,
    form1099Nec: [{ taxYear: year, accountHolder: "primary", payer: "Actual platform", nonemployeeCompensation: profit, cashTips: tips, treasuryTippedOccupationCodes: ["102"] }],
    scheduleC: { businessName: "Actual service", accountHolder: "primary", grossReceipts: profit },
    schedule1A: { ...input.schedule1A, employeeTips: [], businessTips: [{ ...eligible, businessName: "Actual service", businessSourceId: "scheduleC", qualifiedReportedTips: tips, reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: tips }] }] },
  }));
}

it("rejects unknown or contradictory source identity and source aliases", () => {
  expect(calc().schedule1A.tipsDeduction.toFixed()).toBe("500");
  for (const patch of [{ taxYear: undefined }, { taxYear: 2025 }, { accountHolder: undefined }, { accountHolder: "spouse" as const }]) {
    const input = make(); input.w2s[0] = { ...input.w2s[0], ...patch };
    expect(() => calc(input)).toThrow(/year|owner|source/i);
  }
  for (const id of ["formW2:00", "formW2:1", "form1099Nec:0"]) {
    const input = make(); input.schedule1A.employeeTips[0].w2SourceIds = [id];
    expect(() => calc(input)).toThrow(/source|index/i);
  }
  for (const answer of [undefined, false]) {
    const input = make(); input.taxpayer.primary.employmentValidSsnIssuedByDueDate = answer;
    expect(() => calc(input)).toThrow(/SSN|identity/i);
  }
  const denied = make(); denied.taxpayer.primary.employmentValidSsnIssuedByDueDate = false; denied.schedule1A.primarySsnEligible = false;
  expect(calc(denied).schedule1A.tipsDeduction.toFixed()).toBe("0");
  const wrong = make(); wrong.schedule1A.employeeTips[0].occupationCode = "999";
  expect(() => calc(wrong)).toThrow(/occupation/i);
});

it("binds each employer report to actual payroll and column c without duplication", () => {
  const input = make(2025), record = tipFacts("primary", "700", "0", "0", 0);
  record.sourceFacts.employers[0] = { ...record.sourceFacts.employers[0], employerName: "Tech Corp", tipsReportedToEmployer: "500" };
  input.form4137ByOwner = { primary: record };
  input.schedule1A.employeeTips[0].form4137EmployerSourceId = "tips-primary";
  input.schedule1A.employeeTips[0].qualifiedForm4137Tips = "700";
  expect(calc(input).schedule1A.tipsDeduction.toFixed()).toBe("700");
  Object.assign(input.schedule1A.employeeTips[0], { reportingMethod: "form4070", reportedEmployerTips: "900", qualifiedW2Tips: "900" });
  expect(() => calc(input)).toThrow(/reconcile|employer|tips/i);
  Object.assign(input.schedule1A.employeeTips[0], { reportedEmployerTips: "501", qualifiedW2Tips: "500" });
  expect(() => calc(input)).toThrow(/reconcile|employer|tips/i);
  Object.assign(input.schedule1A.employeeTips[0], { reportedEmployerTips: "500", qualifiedW2Tips: "500" });
  expect(calc(input).schedule1A.tipsDeduction.toFixed()).toBe("700");
  input.schedule1A.employeeTips[0].qualifiedForm4137Tips = "701";
  expect(() => calc(input)).toThrow(/column|reported|tips/i);
  input.schedule1A.employeeTips[0].qualifiedForm4137Tips = "700";
  input.schedule1A.employeeTips.push({ ...input.schedule1A.employeeTips[0], employer: "Same source under another label" });
  expect(() => calc(input)).toThrow(/employer|duplicate/i);
  const reducedWages = make(2025); reducedWages.w2s[0].wages = "100";
  Object.assign(reducedWages.schedule1A.employeeTips[0], { reportingMethod: "form4070", reportedEmployerTips: "900", qualifiedW2Tips: "900" });
  expect(calc(reducedWages).schedule1A.tipsDeduction.toFixed()).toBe("900");
  const missing = make(); missing.w2s[0].box12CodeTP = undefined;
  expect(() => calc(missing)).toThrow(/TP|report/i);
  missing.w2s[0].box12CodeTP = "500"; missing.w2s[0].treasuryTippedOccupationCodes = undefined;
  expect(() => calc(missing)).toThrow(/occupation|TTOC|report/i);
});

it("bounds overtime by actual year-specific reporting while retaining the2025 transition", () => {
  const input = make(); input.schedule1A.overtime = [{ owner: "primary", qualifiedPremium: "1000", reportedCompensation: "51000", compensationExcludedFromWages: "1000", requiredByFlsa: true, compensationSourceId: "formW2:0", reportingSourceReference: "Actual payroll premium statement" }];
  expect(calc(input).schedule1A.overtimeDeduction.toFixed()).toBe("1000");
  input.schedule1A.overtime[0].qualifiedPremium = "1001";
  expect(() => calc(input)).toThrow(/overtime|premium|report/i);
  input.schedule1A.overtime[0].qualifiedPremium = "1000"; input.w2s[0].box12CodeTT = undefined;
  expect(() => calc(input)).toThrow(/TT|overtime|report/i);
  input.taxpayer.taxYear = 2025; input.w2s[0].taxYear = 2025; input.schedule1A.sourceTaxYear = 2025;
  expect(calc(input).schedule1A.overtimeDeduction.toFixed()).toBe("1000");
  input.schedule1A.overtime[0].compensationExcludedFromWages = undefined;
  expect(() => calc(input)).toThrow(/exclusion|compensation/i);
  input.schedule1A.overtime[0].compensationExcludedFromWages = "1000";
  input.schedule1A.overtime.push({ ...input.schedule1A.overtime[0] });
  expect(() => calc(input)).toThrow(/duplicate/i);
});

it("uses canonical business profit and attributable deductions rather than overrides", () => {
  const input = business();
  expect(calc(input).schedule1A.tipsDeduction.toFixed()).toBe("850");
  expect(calc(input).businessQbiExclusions[0].amount.toFixed()).toBe("850");
  input.schedule1A.businessTips[0].netProfit = "1001";
  expect(() => calc(input)).toThrow(/profit|canonical/i);
  input.schedule1A.businessTips[0].netProfit = "1000"; input.schedule1A.businessTips[0].otherAllocableDeductions = "0";
  expect(() => calc(input)).toThrow(/deduction|canonical/i);
  input.schedule1A.businessTips[0].otherAllocableDeductions = "150";
  expect(() => calc(input, "50000", "1000", "850", false)).toThrow(/allocation|attribution|verified/i);
  const report = input.schedule1A.businessTips[0].reportedTipSources?.[0];
  if (!report) throw new Error("Synthetic source allocation missing");
  report.qualifiedTips = "901";
  expect(() => calc(input)).toThrow(/tips|allocation|reconcile/i);
  const wrongIncome = business(); if (!wrongIncome.scheduleC) throw new Error("Synthetic business missing");
  wrongIncome.scheduleC.grossReceipts = "500";
  expect(() => calc(wrongIncome, "50000", "500", "350")).toThrow(/receipt|income/i);
  const unknown = business(); unknown.form1099Nec[0].cashTips = undefined;
  expect(() => calc(unknown)).toThrow(/report|tips/i);
});

it("excludes allowable business tips from QBI and rejects an unresolved shared reduction", () => {
  const input = business(2026, "30000", "100000");
  expect(calc(input, "200000", "100000", "90000").businessQbiExclusions[0].amount.toFixed()).toBe("20000");
  input.schedule1A.employeeTips = make().schedule1A.employeeTips;
  expect(() => calc(input, "200000", "100000", "90000")).toThrow(/shared|allocation/i);
  expect(calc(input, "500000", "100000", "90000").businessQbiExclusions[0].amount.toFixed()).toBe("0");
  input.schedule1A.businessTips[0].qualifiedReportedTips = "200";
  const report = input.schedule1A.businessTips[0].reportedTipSources?.[0];
  if (!report) throw new Error("Synthetic source allocation missing");
  report.qualifiedTips = "200";
  expect(calc(input, "50000", "100000", "90000").businessQbiExclusions[0].amount.toFixed()).toBe("200");
  expect(calc(input, "50000", "100000", "90000").schedule1A.tipsDeduction.toFixed()).toBe("700");
});

it("conserves complete information-return amounts and rejects contradictory subsets", () => {
  for (const kind of ["form1099Nec", "form1099Misc"] as const) {
    const input = make(); input.schedule1A.employeeTips = [];
    if (kind === "form1099Nec") input.form1099Nec = TaxYearInputSchema.parse({ ...input, form1099Nec: [{ taxYear: 2026, accountHolder: "primary", payer: "Actual payer", nonemployeeCompensation: "1000", qualifiedOvertimeCompensation: "200" }] }).form1099Nec;
    else input.form1099Misc = TaxYearInputSchema.parse({ ...input, form1099Misc: [{ taxYear: 2026, accountHolder: "primary", payer: "Actual payer", otherIncome: "1000", qualifiedOvertimeCompensation: "200" }] }).form1099Misc;
    input.schedule1A.overtime = [{ owner: "primary", qualifiedPremium: "200", reportedCompensation: "1000", requiredByFlsa: true, compensationSourceId: `${kind}:0`, reportingSourceReference: "Actual payer premium report" }];
    expect(calc(input).schedule1A.overtimeDeduction.toFixed()).toBe("200");
    input[kind][0].cashTips = "801";
    expect(() => calc(input)).toThrow(/report|gross|compensation/i);
    input[kind][0].cashTips = "800";
    expect(calc(input).schedule1A.overtimeDeduction.toFixed()).toBe("200");
    input[kind][0].cashTips = undefined;
    input[kind][0].qualifiedOvertimeCompensation = "1001";
    expect(() => calc(input)).toThrow(/report|gross|compensation/i);
    input[kind][0].qualifiedOvertimeCompensation = "200";
    input.schedule1A.overtime[0].reportedCompensation = "999";
    expect(() => calc(input)).toThrow(/reconcile|compensation/i);
    input.schedule1A.overtime[0].reportedCompensation = "1000";
    input.schedule1A.overtime[0].requiredByFlsa = false;
    expect(calc(input).schedule1A.overtimeDeduction.toFixed()).toBe("0");
    input.schedule1A.overtime[0].compensationSourceId = "form1099K:0";
    expect(() => calc(input)).toThrow(/source/i);
  }
  const payroll = make();
  payroll.w2s[0].wages = "1000"; payroll.w2s[0].box12CodeTT = "600";
  payroll.schedule1A.overtime = [{ owner: "primary", qualifiedPremium: "200", reportedCompensation: "1000", compensationExcludedFromWages: "0", requiredByFlsa: true, compensationSourceId: "formW2:0", reportingSourceReference: "Actual original payroll source" }];
  expect(() => calc(payroll)).toThrow(/report|gross|compensation/i);
  payroll.schedule1A.overtime[0].reportedCompensation = "1100"; payroll.schedule1A.overtime[0].compensationExcludedFromWages = "100";
  expect(calc(payroll).schedule1A.overtimeDeduction.toFixed()).toBe("200");
  const originalReports = business(); originalReports.form1099Nec[0].qualifiedOvertimeCompensation = "101";
  expect(() => calc(originalReports)).toThrow(/report|gross|compensation/i);
  originalReports.form1099Nec[0].qualifiedOvertimeCompensation = "100";
  expect(calc(originalReports).schedule1A.tipsDeduction.toFixed()).toBe("850");
  const contradictory = business(); contradictory.form1099Nec[0].cashTips = "1001";
  expect(() => calc(contradictory)).toThrow(/report|gross|compensation/i);
  const mixed = business(); mixed.form1099Nec[0].accountHolder = "spouse";
  expect(() => calc(mixed)).toThrow(/owner/i);
  const unknown = business(); unknown.schedule1A.businessTips[0].reportedTipSources = [];
  expect(() => calc(unknown)).toThrow(/source/i);
});

it("preserves actual zero ineligibility and the separate historical preview boundary", () => {
  const legacy = make(2025);
  Object.assign(legacy.schedule1A, { sourceTaxYear: undefined, sourceReference: undefined, sourceFactsConfirmed: undefined, allSourcesIncluded: undefined });
  Object.assign(legacy.schedule1A.employeeTips[0], { w2SourceIds: undefined, reportingMethod: undefined, reportingSourceReference: undefined });
  expect(calc(legacy).sourceFactsVerified).toBe(false);
  expect(calc(legacy).schedule1A.tipsDeduction.toFixed()).toBe("500");
  for (const patch of [{ sourceFactsConfirmed: false }, { allSourcesIncluded: false }, { sourceTaxYear: 2025 }]) {
    const input = make(); Object.assign(input.schedule1A, patch); expect(() => calc(input)).toThrow(/source/i);
  }
  const denied = business(); denied.schedule1A.businessTips[0].eligibleOccupation = false;
  expect(calc(denied).schedule1A.tipsDeduction.toFixed()).toBe("0");
  const owner = make(); owner.schedule1A.employeeTips[0].owner = "spouse";
  expect(() => calc(owner)).toThrow(/owner|household/i);
  const noW2 = make(2025); noW2.w2s = []; noW2.form4137ByOwner = { primary: tipFacts("primary", "600") };
  Object.assign(noW2.schedule1A.employeeTips[0], { employer: "Primary Restaurant", w2SourceIds: [], form4137EmployerSourceId: "tips-primary", qualifiedW2Tips: "0", qualifiedForm4137Tips: "600" });
  expect(calc(noW2).schedule1A.tipsDeduction.toFixed()).toBe("600");
  for (const year of [2025, 2026]) {
    const sourceOnly = make(year); sourceOnly.w2s = [];
    const sourceRecord = tipFacts("primary", "600"); sourceRecord.sourceFacts.sourceTaxYear = year;
    sourceOnly.form4137ByOwner = { primary: sourceRecord };
    const actual = withFacts(TaxYearInputSchema.parse({ ...sourceOnly, schedule1A: { ...sourceOnly.schedule1A,
      employeeTips: [{ ...sourceOnly.schedule1A.employeeTips[0], employer: "Primary Restaurant", w2SourceIds: [], reportingMethod: "form4137", reportingSourceReference: "Actual owner Form4137 employer ledger", form4137EmployerSourceId: "tips-primary", qualifiedW2Tips: "0", qualifiedForm4137Tips: "600" }],
    } }));
    expect(calc(actual).schedule1A.tipsDeduction.toFixed()).toBe("600");
    actual.schedule1A.employeeTips[0].qualifiedW2Tips = "1";
    expect(() => calc(actual)).toThrow(/4137|reported|claim/i);
    actual.schedule1A.employeeTips[0].qualifiedW2Tips = "0";
    actual.schedule1A.employeeTips[0].form4137EmployerSourceId = undefined;
    expect(() => calc(actual)).toThrow(/4137|employer|source/i);
  }
  noW2.schedule1A.employeeTips[0].form4137EmployerSourceId = "unknown";
  expect(() => calc(noW2)).toThrow(/4137|source/i);
  const allocated = make(); allocated.w2s[0].allocatedTips = "10";
  expect(() => calc(allocated)).toThrow(/allocated|4137/i);
  const mismatch = make(); mismatch.schedule1A.employeeTips[0].employer = "Different employer";
  expect(() => calc(mismatch)).toThrow(/employer/i);
  const sourceMissing = make(); sourceMissing.schedule1A.employeeTips[0].w2SourceIds = undefined;
  expect(() => calc(sourceMissing)).toThrow(/source/i);
  const noReference = make(); noReference.schedule1A.overtime = [{ owner: "primary", qualifiedPremium: "100", reportedCompensation: "50000", requiredByFlsa: true }];
  expect(() => calc(noReference)).toThrow(/source/i);
  const noBusiness = business(); noBusiness.schedule1A.businessTips[0].businessSourceId = "scheduleF";
  expect(() => calc(noBusiness)).toThrow(/business|ScheduleC/i);
  const mismatchedBusiness = business(); if (!mismatchedBusiness.scheduleC) throw new Error("Synthetic business missing");
  mismatchedBusiness.scheduleC.businessName = "Another business";
  expect(() => calc(mismatchedBusiness)).toThrow(/business|identity/i);
});
