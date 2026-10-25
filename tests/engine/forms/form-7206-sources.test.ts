import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { Form7206Schema } from "../../../src/models/inputs.js";
import { calculateForm7206, type Form7206BusinessContext } from "../../../src/engine/forms/form-7206.js";

const d = (value: string | number) => new Decimal(value);
function payment(sourceId = "premium-1", month = 1, amount = "600.10") {
  return { sourceId, datePaid: `2026-${String(month).padStart(2, "0")}-01`, coverageTaxYear: 2026, coverageMonth: month,
    grossPremium: amount, ownerOrBusinessPaid: amount, otherPersonPaid: "0",
    personAmounts: [{ personId: "primary", payer: "owner_after_tax" as const, amountPaid: amount, excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] };
}
function plan(planId = "health-1", businessSourceId = "scheduleC") {
  return { planId, policyReference: "Actual insurer policy ABC", accountHolder: "primary" as const, businessSourceId, businessKind: "self_employed" as const,
    kind: "medical" as const, policyHolder: "individual" as const, establishedUnderBusiness: true, insuranceQualificationConfirmed: true,
    marketplaceCoverage: false, premiumTaxCreditInvolved: false, clergySpecialRules: false,
    coveredPersons: [{ personId: "primary", relationshipToOwner: "self" as const }],
    months: [{ month: 1, employerSubsidizedPlanEligible: false }], payments: [payment()] };
}
function facts() {
  return Form7206Schema.parse({ sourceTaxYear: 2026, sourceReference: "Actual paid premium and eligibility ledger", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Alex Actual", householdRole: "primary", attainedAgeAtYearEnd: 50 }], plans: [plan()] });
}
function business(sourceId = "scheduleC", overrides: Partial<Form7206BusinessContext> = {}): Form7206BusinessContext {
  return { sourceId, accountHolder: "primary", kind: "self_employed", netIncome: d(10000), ownerPositiveBusinessIncome: d(10000), ownerDeductibleSelfEmploymentTax: d(706),
    attributableRetirementDeduction: d(0), attributableForeignExclusion: d(0), ...overrides };
}
function calculate(input = facts(), businesses: Form7206BusinessContext[] | undefined = [business()], taxYear = 2026) {
  return calculateForm7206({ taxYear, filingStatus: "single", facts: input, businesses });
}

describe("Form7206 actual source worksheet (spec/federal/form-7206.yaml)", () => {
  it("uses actual monthly costs and distinct funded amounts instead of annual proration", () => {
    const input = facts();
    input.plans![0]!.months = [{ month: 1, employerSubsidizedPlanEligible: true }, { month: 2, employerSubsidizedPlanEligible: false }];
    input.plans![0]!.payments = [payment("jan", 1, "1000.10"), payment("feb", 2, "2000.20")];
    input.plans![0]!.payments![1]!.personAmounts![0]!.excludedPublicSafetyOfficerAmount = "100.01";
    input.plans![0]!.payments![1]!.personAmounts![0]!.publicSafetyOfficerAccountHolder = "primary";
    input.plans![0]!.payments![1]!.personAmounts![0]!.otherTaxFreeFunding = "200.02";
    const result = calculate(input);
    expect(result.deduction?.toString()).toBe("1700.17");
    expect(result.paidSourcePremiums.toString()).toBe("3000.3");
    expect(result.businesses[0]?.medicalPremiums.toString()).toBe("1700.17");
    expect(result.lines.find(line => line.line === "14")?.value.toString()).toBe("1700.17");
  });

  it("conserves actual premium sources and rejects unknown or contradictory facts", () => {
    for (const mutate of [
      (input: ReturnType<typeof facts>) => { input.sourceFactsConfirmed = undefined; },
      (input: ReturnType<typeof facts>) => { input.sourceTaxYear = 2025; },
      (input: ReturnType<typeof facts>) => { input.allPlansIncluded = false; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.months![0]!.employerSubsidizedPlanEligible = undefined; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments![0]!.otherPersonPaid = undefined; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments![0]!.grossPremium = "700"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments![0]!.personAmounts![0]!.amountPaid = "599"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments![0]!.personAmounts![0]!.otherTaxFreeFunding = "700"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments!.push(payment()); },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.months!.push({ month: 1, employerSubsidizedPlanEligible: false }); },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.payments![0]!.datePaid = "2026-02-30"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.coveredPersons![0]!.personId = "unlinked-person"; },
      (input: ReturnType<typeof facts>) => { input.persons![0]!.householdRole = "spouse"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.businessKind = "partnership"; },
      (input: ReturnType<typeof facts>) => { input.plans![0]!.months![0]!.month = 0; },
      (input: ReturnType<typeof facts>) => { input.persons!.push({ ...input.persons![0]!, personId: "primary-alias" }); },
      (input: ReturnType<typeof facts>) => { input.plans!.push({ ...plan("conflicting-employer-eligibility"), months: [{ month: 1, employerSubsidizedPlanEligible: true }], payments: [payment("other-premium")] }); },
    ]) { const input = facts(); mutate(input); expect(() => calculate(input)).toThrow(); }
    const actual = facts(); actual.plans![0]!.payments![0]!.grossPremium = "700.10"; actual.plans![0]!.payments![0]!.otherPersonPaid = "100";
    expect(calculate(actual).deduction?.toString()).toBe("600.1");
    const missing = Form7206Schema.parse({ persons: [{}], plans: [{ payments: [{}], months: [{}] }] });
    expect(missing.sourceFactsConfirmed).toBeUndefined(); expect(missing.plans?.[0]?.payments?.[0]?.grossPremium).toBeUndefined();
  });

  it("applies one actual person LTC limit across plans and requires competing business allocation", () => {
    const input = facts();
    input.persons![0]!.attainedAgeAtYearEnd = 50;
    input.plans = [plan("ltc1", "scheduleC"), plan("ltc2", "scheduleF")].map((entry, index) => ({ ...entry, kind: "qualified_ltc", payments: [payment(`ltc-${index}`, 1, "800")] }));
    const contexts = [business("scheduleC", { ownerPositiveBusinessIncome: d(20000) }), business("scheduleF", { ownerPositiveBusinessIncome: d(20000) })];
    expect(() => calculate(input, contexts)).toThrow(/LTC.*allocation/i);
    input.longTermCareAllocations = [{ personId: "primary", accountHolder: "primary", businessSourceId: "scheduleC", allowedPremium: "600" }, { personId: "primary", accountHolder: "primary", businessSourceId: "scheduleF", allowedPremium: "330" }];
    const result = calculate(input, contexts);
    expect(result.deduction?.toString()).toBe("930");
    expect(result.businesses.map(entry => entry.longTermCarePremiums.toString())).toEqual(["600", "330"]);
    input.longTermCareAllocations[1]!.allowedPremium = "331";
    expect(() => calculate(input, contexts)).toThrow(/LTC.*allocation|annual.*cap/i);
    input.longTermCareAllocations[1]!.allowedPremium = "330";
    input.longTermCareAllocations[1]!.businessSourceId = "scheduleK1:0";
    expect(() => calculate(input, contexts)).toThrow(/unlinked/i);
    input.longTermCareAllocations[1]!.businessSourceId = "scheduleF";
    input.longTermCareAllocations.push({ ...input.longTermCareAllocations[0]! });
    expect(() => calculate(input, contexts)).toThrow(/duplicate/i);
    const oneBusiness = facts(); oneBusiness.persons![0]!.attainedAgeAtYearEnd = 51;
    oneBusiness.plans = [plan("ltc1"), plan("ltc2")].map((entry, index) => ({ ...entry, kind: "qualified_ltc", payments: [payment(`ltc-${index}`, 1, "1000")] }));
    expect(calculate(oneBusiness).deduction?.toString()).toBe("1860");
    oneBusiness.sourceTaxYear = 2025;
    for (const entry of oneBusiness.plans) for (const source of entry.payments!) { source.datePaid = "2025-01-01"; source.coverageTaxYear = 2025; }
    expect(calculate(oneBusiness, [business()], 2025).deduction?.toString()).toBe("1800");
  });

  it("groups same-business plans and separates owners and business limits", () => {
    const input = facts(); input.plans = [plan("first"), { ...plan("second"), payments: [payment("second-premium")] }];
    expect(calculate(input, [business("scheduleC", { netIncome: d(1000), ownerPositiveBusinessIncome: d(1000), ownerDeductibleSelfEmploymentTax: d(0) })]).deduction?.toString()).toBe("1000");
    expect(calculate(input).businesses).toHaveLength(1);
    input.persons!.push({ personId: "spouse", name: "Jordan Actual", householdRole: "spouse", attainedAgeAtYearEnd: 50 });
    input.plans![1] = { ...plan("spouse", "scheduleF"), accountHolder: "spouse", coveredPersons: [{ personId: "spouse", relationshipToOwner: "self" }],
      payments: [{ ...payment("spouse-premium"), personAmounts: [{ personId: "spouse", payer: "owner_after_tax", amountPaid: "600.10", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] }] };
    expect(() => calculate(input)).toThrow(/spouse|joint/i);
    const contexts = [business(), business("scheduleF", { accountHolder: "spouse", netIncome: d(-500), ownerPositiveBusinessIncome: d(0), ownerDeductibleSelfEmploymentTax: d(0) })];
    const result = calculateForm7206({ taxYear: 2026, filingStatus: "married_filing_jointly", facts: input, businesses: contexts });
    expect(result.deduction?.toString()).toBe("600.1"); expect(result.businesses[1]?.deduction?.toString()).toBe("0");
    expect(result.eligiblePremiumExcess?.toString()).toBe("600.1");
  });

  it("uses canonical business allocation and actual foreign retirement and S corporation amounts", () => {
    const input = facts(); input.plans![0]!.payments = [payment("annual-source-allocation", 1, "20000")];
    const result = calculate(input, [business("scheduleC", { netIncome: d(30000), ownerPositiveBusinessIncome: d(100000), ownerDeductibleSelfEmploymentTax: d(7065), attributableRetirementDeduction: d(1000), attributableForeignExclusion: d(15000) })]);
    const entry = result.businesses[0]!;
    expect(entry.incomeRatio?.toString()).toBe("0.3"); expect(entry.allocatedSelfEmploymentTax?.toString()).toBe("2119.5");
    expect(entry.earnedIncomeLimit?.toString()).toBe("11880.5"); expect(result.deduction?.toString()).toBe("11880.5");
    input.plans![0] = { ...input.plans![0]!, businessSourceId: "formW2:0", businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true };
    input.plans![0]!.payments![0]!.personAmounts![0]!.payer = "business_paid_or_reimbursed";
    const corporation = business("formW2:0", { kind: "s_corporation", netIncome: undefined, ownerPositiveBusinessIncome: undefined, ownerDeductibleSelfEmploymentTax: undefined, attributableRetirementDeduction: undefined, sCorporationMedicareWages: d(15000), attributableForeignExclusion: d(2000) });
    const corporateResult = calculate(input, [corporation]);
    expect(corporateResult.deduction?.toString()).toBe("13000"); expect(corporateResult.businesses[0]?.allocatedSelfEmploymentTax).toBeUndefined();
    expect(corporateResult.lines.find(line => line.line === "11")?.value.toString()).toBe("15000");
  });

  it("requires canonical income sources before reporting a deduction", () => {
    const result = calculateForm7206({ taxYear: 2026, filingStatus: "single", facts: facts() });
    expect(result.sourceFactsVerified).toBe(true); expect(result.calculationComplete).toBe(false); expect(result.deduction).toBeUndefined();
    for (const field of ["netIncome", "ownerPositiveBusinessIncome", "ownerDeductibleSelfEmploymentTax", "attributableRetirementDeduction", "attributableForeignExclusion"] as const) expect(() => calculate(facts(), [business("scheduleC", { [field]: undefined })])).toThrow(/canonical/i);
    expect(() => calculate(facts(), [business("scheduleF")])).toThrow(/business.*source/i);
    expect(() => calculate(facts(), [business(), business()])).toThrow(/duplicate/i);
    expect(() => calculate(facts(), [business("scheduleC", { ownerPositiveBusinessIncome: d(9000) })])).toThrow(/positive.*income/i);
    const two = facts(); two.plans = [plan("C"), { ...plan("F", "scheduleF"), payments: [payment("F-premium")] }];
    expect(() => calculate(two, [business(), business("scheduleF")])).toThrow(/positive.*income|business.*total/i);
    expect(() => calculate(two, [business("scheduleC", { ownerPositiveBusinessIncome: d(20000) }), business("scheduleF", { ownerPositiveBusinessIncome: d(20000), ownerDeductibleSelfEmploymentTax: d(707) })])).toThrow(/contradict/i);
  });

  it("enforces actual partner and shareholder establishment without inferring wage inclusion", () => {
    const input = facts(); input.plans![0] = { ...input.plans![0]!, businessSourceId: "scheduleK1:0", businessKind: "partnership", premiumsIncludedInOwnerIncome: true };
    const context = [business("scheduleK1:0", { kind: "partnership" })];
    expect(calculate(input, context).deduction?.toString()).toBe("0");
    input.plans![0]!.payments![0]!.personAmounts![0]!.payer = "business_paid_or_reimbursed"; input.plans![0]!.premiumsIncludedInOwnerIncome = undefined;
    expect(() => calculate(input, context)).toThrow(/income|inclusion/i);
    input.plans![0]!.premiumsIncludedInOwnerIncome = false; expect(calculate(input, context).deduction?.toString()).toBe("0");
    input.plans![0]!.premiumsIncludedInOwnerIncome = true; expect(calculate(input, context).deduction?.toString()).toBe("600.1");
    input.plans![0]!.businessKind = "s_corporation"; input.plans![0]!.businessSourceId = "formW2:0";
    const scorp = [business("formW2:0", { kind: "s_corporation", sCorporationMedicareWages: d(10000) })];
    expect(() => calculate(input, scorp)).toThrow(/shareholder/i);
    input.plans![0]!.moreThanTwoPercentShareholder = false; expect(calculate(input, scorp).deduction?.toString()).toBe("0");
  });

  it("preserves exact large source amounts and known ineligibility without silent defaults", () => {
    const input = facts(); input.plans![0]!.payments = [payment("huge", 1, "9007199254740993.01")];
    const context = [business("scheduleC", { netIncome: d("9007199254740993.01"), ownerPositiveBusinessIncome: d("9007199254740993.01"), ownerDeductibleSelfEmploymentTax: d(0) })];
    expect(calculate(input, context).deduction?.toString()).toBe("9007199254740993.01");
    input.plans![0]!.establishedUnderBusiness = false; expect(calculate(input, context).deduction?.toString()).toBe("0");
    expect(calculate(input, context).paidSourcePremiums.toString()).toBe("9007199254740993.01");
    input.plans![0]!.establishedUnderBusiness = undefined; expect(() => calculate(input, context)).toThrow();
    const zero = facts(); zero.plans![0]!.payments = [payment("known-zero", 1, "0")]; expect(calculate(zero).deduction?.toString()).toBe("0");
    for (const invalid of ["-1", "NaN", "Infinity"]) { zero.plans![0]!.payments![0]!.grossPremium = invalid; expect(() => calculate(zero)).toThrow(); }
  });

  it("keeps covered-person and medical versus LTC eligibility separate", () => {
    const input = facts(); input.persons!.push({ personId: "child", name: "Child Actual", householdRole: "other", attainedAgeAtYearEnd: 26 });
    input.plans![0]!.coveredPersons = [{ personId: "child", relationshipToOwner: "child_under_27" }];
    input.plans![0]!.payments![0]!.personAmounts![0]!.personId = "child";
    expect(calculate(input).deduction?.toString()).toBe("600.1"); input.persons![1]!.attainedAgeAtYearEnd = 27;
    expect(calculate(input).deduction?.toString()).toBe("0");
    input.plans![0]!.coveredPersons![0]!.relationshipToOwner = "dependent";
    expect(() => calculate(input)).toThrow(/dependen/i);
    input.plans![0]!.coveredPersons![0]!.dependencyEligibilityConfirmed = true;
    expect(calculate(input).deduction?.toString()).toBe("600.1");
    const ltc = { ...plan("ltc"), kind: "qualified_ltc" as const, payments: [payment("ltc", 1, "1000")] };
    input.plans![0]!.months![0]!.employerSubsidizedPlanEligible = true; input.plans!.push(ltc);
    expect(calculate(input).deduction?.toString()).toBe("930");
  });

  it("requires the actual Marketplace and clergy coordination rather than manufacturing it", () => {
    for (const patch of [{ marketplaceCoverage: true, premiumTaxCreditInvolved: true }, { clergySpecialRules: true }]) {
      const input = facts(); Object.assign(input.plans![0]!, patch); expect(() => calculate(input)).toThrow(/974|clergy/i);
    }
    const input = facts(); input.plans![0]!.marketplaceCoverage = true; input.plans![0]!.premiumTaxCreditInvolved = false;
    expect(calculate(input).deduction?.toString()).toBe("600.1");
    input.plans![0]!.payments![0]!.datePaid = "2025-01-01"; expect(calculate(input).deduction?.toString()).toBe("0");
  });

  it("attributes public safety exclusions to the actual retired officer instead of the business owner", () => {
    const input = facts();
    input.plans![0]!.payments = [payment("primary-officer", 1, "3500"), payment("spouse-officer", 1, "3500")];
    const first = input.plans![0]!.payments![0]!.personAmounts![0]!;
    const second = input.plans![0]!.payments![1]!.personAmounts![0]!;
    first.excludedPublicSafetyOfficerAmount = "3000"; first.publicSafetyOfficerAccountHolder = "primary";
    second.excludedPublicSafetyOfficerAmount = "3000"; second.publicSafetyOfficerAccountHolder = "spouse";
    const calculateJoint = () => calculateForm7206({ taxYear: 2026, filingStatus: "married_filing_jointly", facts: input, businesses: [business()] });
    expect(calculateJoint().deduction?.toString()).toBe("1000");
    second.publicSafetyOfficerAccountHolder = undefined; expect(() => calculateJoint()).toThrow(/officer.*owner|officer.*identity/i);
    second.publicSafetyOfficerAccountHolder = "primary"; expect(() => calculateJoint()).toThrow(/3000/);
    first.excludedPublicSafetyOfficerAmount = "0"; second.publicSafetyOfficerAccountHolder = "spouse";
    expect(() => calculate(input)).toThrow(/spouse|joint/i);
  });

  it("distinguishes partnership policy ownership and actual premium payers", () => {
    const input = facts();
    input.plans![0] = { ...input.plans![0]!, businessSourceId: "scheduleK1:0", businessKind: "partnership", policyHolder: "business", premiumsIncludedInOwnerIncome: false };
    const context = [business("scheduleK1:0", { kind: "partnership" })];
    expect(calculate(input, context).deduction?.toString()).toBe("600.1");
    input.plans![0]!.premiumsIncludedInOwnerIncome = undefined;
    expect(calculate(input, context).deduction?.toString()).toBe("600.1");
    const source = input.plans![0]!.payments![0]!;
    source.personAmounts = [{ ...source.personAmounts![0]!, amountPaid: "200.03" }, { ...source.personAmounts![0]!, payer: "business_paid_or_reimbursed", amountPaid: "400.07" }];
    expect(() => calculate(input, context)).toThrow(/inclusion|income/i);
    input.plans![0]!.premiumsIncludedInOwnerIncome = false; expect(calculate(input, context).deduction?.toString()).toBe("200.03");
    input.plans![0]!.premiumsIncludedInOwnerIncome = true; expect(calculate(input, context).deduction?.toString()).toBe("600.1");
    input.plans![0]!.policyHolder = "individual"; expect(calculate(input, context).deduction?.toString()).toBe("400.07");
    source.personAmounts![1]!.payer = undefined; expect(() => calculate(input, context)).toThrow(/payer/i);
    source.personAmounts![1]!.payer = "business_paid_or_reimbursed";
    input.plans![0]!.businessKind = "s_corporation"; input.plans![0]!.businessSourceId = "formW2:0"; input.plans![0]!.moreThanTwoPercentShareholder = true;
    const corporation = [business("formW2:0", { kind: "s_corporation", sCorporationMedicareWages: d(10000) })];
    for (const policyHolder of ["individual", "business"] as const) { input.plans![0]!.policyHolder = policyHolder; expect(calculate(input, corporation).deduction?.toString()).toBe("400.07"); }
  });
});
