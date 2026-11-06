// Spec: spec/federal/form-4137.yaml; final2025 Form4137 and Pub531.
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { Form4137Schema, TaxYearInputSchema } from "../../../src/models/inputs.js";
import { calculateForm4137, type Form4137PayrollContext } from "../../../src/engine/forms/form-4137.js";
import { getConstants } from "../../../src/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "../../../src/models/federal-2026-indexed.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { calculateFederalTax } from "../../../src/engine/federal.js";

const d = (value: string | number) => new Decimal(value);
function employer(sourceId = "restaurant", received = "7018", reported = "7000") {
  return { sourceId, employerName: "Blue Ocean Restaurant", employerEin: "12-3456789", w2SourceIds: ["formW2:0"],
    cashAndChargeTipsReceived: received, tipsReportedToEmployer: reported, allocatedTips: "0", adequateRecordsSupportUnreportedTips: true,
    railroadRetirementCovered: false, medicareOnlyGovernmentUnreportedTips: "0", reportedTipsNotIncludedInBox7: "0", box7TipsExcludedFromReportedTotal: "0",
    smallTipMonths: [{ month: 6, totalCashAndChargeTips: "18", tipsReportedToEmployer: "0" }] };
}
function facts() {
  return Form4137Schema.parse({ accountHolder: "primary", sourceFacts: { sourceTaxYear: 2025, sourceReference: "Actual annual tip records and source payroll",
    sourceFactsConfirmed: true, allEmployersIncluded: true, reportingYearTreatmentConfirmed: true,
    railroadRetirementCompensation: "0", noncashTipsNotIncludedInWages: "0", employers: [employer()] } });
}
function payroll(overrides: Partial<Form4137PayrollContext> = {}): Form4137PayrollContext {
  return { accountHolder: "primary", w2s: [{ sourceId: "formW2:0", accountHolder: "primary", employerName: "Blue Ocean Restaurant", employerEin: "12-3456789",
    socialSecurityWages: d(10000), socialSecurityTips: d(7000), allocatedTips: d(0) }], ...overrides };
}
function calculate(input = facts(), context = payroll()) {
  return calculateForm4137(input, input.sourceFacts?.sourceTaxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025), { sourcePayroll: context });
}

describe("Actual Form4137 employer source worksheet", () => {
  it("separates the published eighteen dollar income example from payroll tips", () => {
    // Pub531: 10,000 wages +7,000 reported tips +18 June tips =17,018 income.
    const input = facts();
    const result = calculate(input);
    expect(result.line2?.toString()).toBe("7018"); expect(result.line3?.toString()).toBe("7000");
    expect(result.line4?.toString()).toBe("18"); expect(result.line5?.toString()).toBe("18");
    expect(result.unreportedTipIncome.toString()).toBe("18"); expect(result.line6.toString()).toBe("0");
    expect(result.line13.toString()).toBe("0"); expect(d(17000).plus(result.unreportedTipIncome).toString()).toBe("17018");
    input.sourceFacts!.noncashTipsNotIncludedInWages = "25.50";
    const noncash = calculate(input);
    expect(noncash.unreportedTipIncome.toString()).toBe("43.5"); expect(noncash.noncashTipIncome?.toString()).toBe("25.5");
    expect(noncash.line4?.toString()).toBe("18"); expect(noncash.line6.toString()).toBe("0");
    expect(noncash.sourceFactsVerified).toBe(true);
  });

  it("applies employer month exceptions independently at the twenty dollar threshold", () => {
    const input = facts();
    input.sourceFacts!.employers = [0, 1].map(index => ({ ...employer(`employer-${index}`, "19.99", "0"), employerName: `Employer ${index}`, employerEin: `12-345678${index}`, w2SourceIds: [],
      smallTipMonths: [{ month: 6, totalCashAndChargeTips: "19.99", tipsReportedToEmployer: "0" }] }));
    const context = payroll({ w2s: [] });
    expect(calculate(input, context).line5?.toString()).toBe("39.98");
    expect(calculate(input, context).line6.toString()).toBe("0");
    input.sourceFacts!.employers.push({ ...employer("at-threshold", "20", "0"), employerName: "Third employer", employerEin: "12-3456782", w2SourceIds: [], smallTipMonths: [] });
    expect(calculate(input, context).line6.toString()).toBe("20");
    input.sourceFacts!.employers[2]!.smallTipMonths = [{ month: 1, totalCashAndChargeTips: "20", tipsReportedToEmployer: "0" }];
    expect(() => calculate(input, context)).toThrow(/less than 20|under.*20/i);
    input.sourceFacts!.employers[2]!.smallTipMonths = [];
    input.sourceFacts!.employers[0]!.smallTipMonths!.push({ month: 6, totalCashAndChargeTips: "0", tipsReportedToEmployer: "0" });
    expect(() => calculate(input, context)).toThrow(/duplicate.*month/i);
  });

  it("requires actual ownership reporting year and canonical employer sources", () => {
    for (const mutate of [
      (input: ReturnType<typeof facts>) => { input.accountHolder = undefined; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.sourceTaxYear = 2024; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.sourceReference = undefined; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.sourceFactsConfirmed = false; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.allEmployersIncluded = undefined; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.reportingYearTreatmentConfirmed = undefined; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.employers![0]!.w2SourceIds = ["formW2:1"]; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.employers![0]!.employerName = "Other actual employer"; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.employers![0]!.employerEin = "98-7654321"; },
      (input: ReturnType<typeof facts>) => { input.sourceFacts!.employers![0]!.tipsReportedToEmployer = "6999"; },
    ]) { const input = facts(); mutate(input); expect(() => calculate(input)).toThrow(); }
    expect(() => calculateForm4137(facts(), getConstants(2025))).toThrow(/canonical.*payroll/i);
    expect(() => calculate(facts(), payroll({ accountHolder: "spouse" }))).toThrow(/owner/i);
    const context = payroll(); context.w2s[0]!.accountHolder = "spouse";
    expect(() => calculate(facts(), context)).toThrow(/owner/i);
    context.w2s[0]!.accountHolder = "primary"; context.w2s[0]!.socialSecurityWages = undefined as never;
    expect(() => calculate(facts(), context)).toThrow(/canonical|payroll/i);
    const adjusted = facts(); adjusted.sourceFacts!.employers![0]!.reportedTipsNotIncludedInBox7 = "100";
    expect(() => calculate(adjusted)).toThrow(/reconcil/i);
    adjusted.sourceFacts!.employers![0]!.tipsReportedToEmployer = "7100"; adjusted.sourceFacts!.employers![0]!.cashAndChargeTipsReceived = "7118";
    adjusted.sourceFacts!.employers![0]!.reportedTipReconciliationReference = "Actual employer annual and December reporting-year worksheet";
    expect(calculate(adjusted).line4?.toString()).toBe("18");
    // Zero difference must be entered, not defaulted from the absence of an adjustment.
    adjusted.sourceFacts!.employers![0]!.box7TipsExcludedFromReportedTotal = undefined;
    expect(() => calculate(adjusted)).toThrow(/Box7|reported.*tips/i);
    const unlinked = facts(); unlinked.sourceFacts!.employers![0]!.w2SourceIds = [];
    expect(() => calculate(unlinked)).toThrow(/all actual W2/i);
    const duplicatePayroll = payroll(); duplicatePayroll.w2s.push({ ...duplicatePayroll.w2s[0]! });
    expect(() => calculate(facts(), duplicatePayroll)).toThrow(/duplicate.*payroll/i);
    const multiple = payroll(); multiple.w2s.push({ ...multiple.w2s[0]!, sourceId: "formW2:1", socialSecurityWages: d(1000), socialSecurityTips: d(200) });
    const combined = facts(); combined.sourceFacts!.employers![0]!.w2SourceIds = ["formW2:0", "formW2:1"];
    combined.sourceFacts!.employers![0]!.cashAndChargeTipsReceived = "7218"; combined.sourceFacts!.employers![0]!.tipsReportedToEmployer = "7200";
    expect(calculate(combined, multiple).line8.toString()).toBe("18200");
    combined.sourceFacts!.employers![0]!.w2SourceIds!.push("formW2:1");
    expect(() => calculate(combined, multiple)).toThrow(/duplicated/i);
  });

  it("conserves employer columns allocated tips and large exact amounts", () => {
    const input = facts();
    input.sourceFacts!.employers![0]!.allocatedTips = "100";
    expect(() => calculate(input)).toThrow(/allocated|Box8/i);
    const context = payroll(); context.w2s[0]!.allocatedTips = d(100);
    input.sourceFacts!.employers![0]!.adequateRecordsSupportUnreportedTips = false;
    expect(() => calculate(input, context)).toThrow(/allocated|adequate/i);
    input.sourceFacts!.employers![0]!.adequateRecordsSupportUnreportedTips = true;
    expect(calculate(input, context).line4?.toString()).toBe("18");
    input.sourceFacts!.employers![0]!.cashAndChargeTipsReceived = "6999";
    expect(() => calculate(input, context)).toThrow(/reported.*received|received.*reported/i);
    const many = facts(); many.sourceFacts!.employers = Array.from({ length: 6 }, (_, index) => ({ ...employer(`source-${index}`, "100.01", "0"),
      employerName: `Actual employer ${index}`, employerEin: `12-345678${index}`, w2SourceIds: [], smallTipMonths: [] }));
    const all = calculate(many, payroll({ w2s: [] }));
    expect(all.employers).toHaveLength(6); expect(all.line2?.toString()).toBe("600.06");
    many.sourceFacts!.employers[0]!.cashAndChargeTipsReceived = "9007199254740993.01";
    expect(calculate(many, payroll({ w2s: [] })).line2?.toString()).toBe("9007199254741493.06");
    many.sourceFacts!.employers[1]!.employerEin = many.sourceFacts!.employers[0]!.employerEin;
    expect(() => calculate(many, payroll({ w2s: [] }))).toThrow(/duplicate.*employer/i);
    const monthly = facts(); monthly.sourceFacts!.employers![0]!.smallTipMonths!.push({ month: 7, totalCashAndChargeTips: "19", tipsReportedToEmployer: "0" });
    expect(() => calculate(monthly)).toThrow(/conserve/i);
    monthly.sourceFacts!.employers![0]!.smallTipMonths = [{ month: 6, totalCashAndChargeTips: "18", tipsReportedToEmployer: "19" }];
    expect(() => calculate(monthly)).toThrow(/monthly reported/i);
    const applied = facts(); applied.sourceFacts!.employers![0]!.employerEin = "Applied For";
    const appliedContext = payroll(); appliedContext.w2s[0]!.employerEin = "Applied For";
    expect(calculate(applied, appliedContext).employers?.[0]?.employerEin).toBe("Applied For");
    const partial = facts(); const partialContext = payroll();
    partialContext.w2s[0]!.allocatedTips = d(100);
    partialContext.w2s.push({ ...partialContext.w2s[0]!, sourceId: "formW2:1", socialSecurityWages: d(0), socialSecurityTips: d(0), allocatedTips: undefined });
    partial.sourceFacts!.employers![0]!.w2SourceIds!.push("formW2:1");
    expect(() => calculate(partial, partialContext)).toThrow(/allocated|Box8/i);
    partial.sourceFacts!.employers![0]!.allocatedTips = "100";
    expect(calculate(partial, partialContext).line4?.toString()).toBe("18");
    partial.sourceFacts!.employers![0]!.reportedTipsNotIncludedInBox7 = "8000";
    partial.sourceFacts!.employers![0]!.box7TipsExcludedFromReportedTotal = "8000";
    partial.sourceFacts!.employers![0]!.reportedTipReconciliationReference = "Source cannot support either adjustment";
    expect(() => calculate(partial, partialContext)).toThrow(/reconcil|source.*exceed|exceed.*source/i);
  });

  it("uses actual owner payroll and caps RRTA compensation before the wage base comparison", () => {
    const input = facts(); input.sourceFacts!.employers![0]!.cashAndChargeTipsReceived = "17000"; input.sourceFacts!.employers![0]!.smallTipMonths = [];
    input.sourceFacts!.railroadRetirementCompensation = "200000";
    const result = calculate(input);
    expect(result.line7?.toString()).toBe("176100"); expect(result.line8.toString()).toBe("193100");
    expect(result.line9.toString()).toBe("0"); expect(result.line10.toString()).toBe("0");
    expect(result.line12.toString()).toBe("145");
    input.sourceFacts!.employers![0]!.railroadRetirementCovered = true;
    expect(() => calculate(input)).toThrow(/RRTA|railroad.*tips/i);
    input.sourceFacts!.employers![0]!.railroadRetirementCovered = false; input.sourceFacts!.railroadRetirementCompensation = undefined;
    expect(() => calculate(input)).toThrow(/railroad|RRTA/i);
    const spouse = facts(); spouse.accountHolder = "spouse"; const spouseContext = payroll({ accountHolder: "spouse" }); spouseContext.w2s[0]!.accountHolder = "spouse";
    expect(calculate(spouse, spouseContext).accountHolder).toBe("spouse");
  });

  it("preserves government Medicare tips and selected year tax line rounding", () => {
    const input = facts(); input.sourceFacts!.sourceTaxYear = 2026;
    const row = input.sourceFacts!.employers![0]!; row.cashAndChargeTipsReceived = "15000"; row.smallTipMonths = [];
    row.medicareOnlyGovernmentUnreportedTips = "3000"; row.medicareOnlyGovernmentQualificationConfirmed = true;
    const result = calculate(input);
    expect(result.line7?.toString()).toBe("184500"); expect(result.line6.toString()).toBe("8000");
    expect(result.line10.toString()).toBe("5000"); expect(result.line11.toString()).toBe("310"); expect(result.line12.toString()).toBe("116");
    expect(result.line13.toString()).toBe("426");
    row.medicareOnlyGovernmentQualificationConfirmed = false;
    expect(() => calculate(input)).toThrow(/government.*qualification/i);
    row.medicareOnlyGovernmentQualificationConfirmed = true; row.medicareOnlyGovernmentUnreportedTips = "8001";
    expect(() => calculate(input)).toThrow(/government.*exceed/i);
    row.medicareOnlyGovernmentUnreportedTips = "0";
    const context = payroll(); context.w2s[0]!.socialSecurityWages = d(177491);
    const rounded = calculate(input, context); // 184500 -177491 -7000 =9; 9*.062 =.558.
    expect(rounded.line9.toString()).toBe("9"); expect(rounded.line11.toString()).toBe("1");
  });

  it("preserves unknown source facts and separates the legacy and owner representations", () => {
    const unknown = Form4137Schema.parse({ sourceFacts: { employers: [{}] } });
    expect(unknown.accountHolder).toBeUndefined(); expect(unknown.unreportedTipIncome).toBeUndefined();
    expect(unknown.sourceFacts?.employers?.[0]?.allocatedTips).toBeUndefined(); expect(unknown.sourceFacts?.reportingYearTreatmentConfirmed).toBeUndefined();
    expect(() => calculate(unknown)).toThrow();
    const legacy = calculateForm4137({ unreportedTipIncome: "10000", socialSecurityWagesAndTipsAlreadyReported: "170000" }, getConstants(2025));
    expect(legacy.line13.toString()).toBe("523"); expect(legacy.sourceFactsVerified).toBe(false); expect(legacy.employers).toBeUndefined();
    const mixed = facts(); mixed.unreportedTipIncome = "19";
    expect(() => calculate(mixed)).toThrow(/summary|reconcil|legacy/i);
    const primary = facts(); const spouse = { ...facts(), accountHolder: "spouse" as const };
    const household = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: { ...simpleW2Fixture.taxpayer.primary, firstName: "Actual Spouse" } } };
    const parsed = TaxYearInputSchema.parse({ ...household, form4137ByOwner: { primary, spouse } });
    expect(parsed.form4137ByOwner?.spouse?.accountHolder).toBe("spouse");
    expect(() => calculateFederalTax(parsed)).toThrow(/actual.*owner|known.*owner|owner.*attribution/i);
    expect(() => TaxYearInputSchema.parse({ ...household, form4137: primary, form4137ByOwner: { primary } })).toThrow(/either|both/i);
    expect(() => TaxYearInputSchema.parse({ ...simpleW2Fixture, form4137ByOwner: { spouse } })).toThrow(/spouse/i);
    expect(() => TaxYearInputSchema.parse({ ...household, form4137ByOwner: { primary: spouse } })).toThrow(/owner/i);
  });
});
