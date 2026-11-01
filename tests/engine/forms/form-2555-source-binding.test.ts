// Spec: spec/federal/form-2555-source-binding.yaml. Actual synthetic USD sources.
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { resolveForm2555Sources } from "@/engine/forms/form-2555-source-binding.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { Form2555Schema, TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function source() {
  return { taxYear: 2025, accountHolder: "primary", foreignEarnedIncome: "120000", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "0", isSelfEmployed: false, sourceFactsConfirmed: true, eligibilityConfirmed: true, electionsValidConfirmed: true,
    claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false, housingExpensesQualificationConfirmed: true,
    employerProvidedForeignEarnedIncome: "120000", deductionsAllocableToExcludedIncome: "0", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "0",
    priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0", incomeSourceMappingConfirmed: true,
    partIV: { wages: "120000", businessPersonalServices: "0", partnershipPersonalServices: "0", noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0", allowanceCostOfLiving: "0", allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0", allowanceQuarters: "0", allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "120000", foreignEmploymentIncomeNotOnW2: "0", foreignBusinessIncomeAlreadyReported: "0", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" },
    sourceMapping: { sourceReference: "Actual foreign-service payroll ledger", sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
      rows: [{ sourceId: "formW2:0", sourceTaxYear: 2025, accountHolder: "primary", sourceReference: "Original employer W2 and foreign-service allocation", payerName: "Actual Employer", payerEin: "12-3456789", foreignEarnedIncome: "120000", priorYearIncomeReceived: "0" }] } };
}
function input(overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2025, accountHolder: "primary", employer: { name: "Actual Employer", ein: "12-3456789" }, wages: "160000", socialSecurityWages: "160000", socialSecurityWithheld: "9920", medicareWages: "160000", medicareWithheld: "2320" }], form2555: source(), ...overrides });
}
function firstSource(facts: NonNullable<ReturnType<typeof input>["form2555"]>) {
  const row = facts.sourceMapping?.rows[0];
  if (!row) throw new Error("Missing original source fixture");
  return row;
}
it("binds actual owner year and canonical source identity", () => {
  expect(resolveForm2555Sources(input()).sourceFactsVerified).toBe(true);
  for (const patch of [{ accountHolder: "spouse" }, { sourceTaxYear: 2024 }, { payerEin: "98-7654321" }, { payerName: "Changed" }, { sourceId: "formW2:00" }, { sourceId: "formW2:1" }]) {
    const facts = source(); Object.assign(facts.sourceMapping.rows[0], patch);
    expect(() => resolveForm2555Sources(input({ form2555: facts }))).toThrow();
  }
  const wrong = input(); if (!wrong.w2s[0]) throw new Error("Missing synthetic W2"); wrong.w2s[0].taxYear = undefined;
  expect(() => resolveForm2555Sources(wrong)).toThrow(/year/i);
  wrong.w2s[0].taxYear = 2025; wrong.w2s[0].accountHolder = undefined;
  expect(() => resolveForm2555Sources(wrong)).toThrow(/owner/i);
});
it("conserves exact current and prior receipts without duplicate income", () => {
  const facts = source(); facts.priorYearIncomeExclusion = "10000";
  Object.assign(facts, { priorYearIncomeExclusionTaxYear: 2024, priorYearIncomeStatementConfirmed: true, priorYearIncomeAlreadyReportedConfirmed: true, priorYearIncomeReceived: "10000", priorYearUnusedExclusion: "10000" });
  Object.assign(facts.sourceMapping.rows[0], { priorYearIncomeReceived: "10000" });
  expect(resolveForm2555Sources(input({ form2555: facts })).priorYearIncomeReceived.toFixed()).toBe("10000");
  const short = input({ form2555: facts }); if (!short.w2s[0]) throw new Error("Missing W2"); short.w2s[0].wages = "129999.99";
  expect(() => resolveForm2555Sources(short)).toThrow(/exceed|income|receipt/i);
  const duplicate = structuredClone(facts); duplicate.sourceMapping.rows.push({ ...duplicate.sourceMapping.rows[0] });
  expect(() => resolveForm2555Sources(input({ form2555: duplicate }))).toThrow(/duplicate/i);
  const mismatched = structuredClone(facts); mismatched.sourceMapping.rows[0].foreignEarnedIncome = "120000.01";
  expect(() => resolveForm2555Sources(input({ form2555: mismatched }))).toThrow(/reconcil/i);
  const huge = source(); huge.foreignEarnedIncome = huge.employerProvidedForeignEarnedIncome = huge.partIV.wages = huge.incomeSources.foreignEmploymentIncomeIncludedOnW2 = huge.sourceMapping.rows[0].foreignEarnedIncome = "9007199254740993.03";
  const actual = input({ form2555: huge }); if (!actual.w2s[0]) throw new Error("Missing W2"); actual.w2s[0].wages = "9007199254740993.03";
  expect(resolveForm2555Sources(actual).currentForeignIncome.toFixed()).toBe("9007199254740993.03");
});
it("binds business amounts to actual canonical receipts", () => {
  const facts = source(); facts.isSelfEmployed = true; facts.employerProvidedForeignEarnedIncome = "0";
  facts.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "0"; facts.incomeSources.foreignBusinessIncomeAlreadyReported = "120000";
  facts.partIV.wages = "0"; facts.partIV.businessPersonalServices = "120000";
  Object.assign(facts.sourceMapping.rows[0], { sourceId: "scheduleC", payerName: "Actual Services", payerEin: "12-3456789", businessGrossReceipts: "130000", businessReturnsAndAllowances: "5000", businessCostOfGoodsSold: "1000", businessOtherIncome: "0" });
  const business = input({ form2555: facts, form1099Nec: [{ payer: "Actual Client", nonemployeeCompensation: "130000", accountHolder: "primary" }], scheduleC: { businessName: "Actual Services", ein: "12-3456789", accountHolder: "primary", returnsAndAllowances: "5000", costOfGoodsSold: "1000", otherIncome: "0" } });
  expect(resolveForm2555Sources(business).currentForeignIncome.toFixed()).toBe("120000");
  const wrongLine = input({ form2555: { ...facts, partIV: { ...facts.partIV, wages: "120000", businessPersonalServices: "0" } }, scheduleC: business.scheduleC, form1099Nec: business.form1099Nec });
  expect(() => resolveForm2555Sources(wrongLine)).toThrow(/PartIV|business.*source/i);
  if (!business.scheduleC) throw new Error("Missing business"); business.scheduleC.returnsAndAllowances = "10000";
  expect(() => resolveForm2555Sources(business)).toThrow(/exceed|income|receipt/i);
  business.scheduleC.grossReceipts = "200000";
  Object.assign(business.form2555?.sourceMapping?.rows[0] ?? {}, { businessGrossReceipts: "200000", businessReturnsAndAllowances: "10000" });
  expect(resolveForm2555Sources(business).sourceFactsVerified).toBe(true);
  business.scheduleC.accountHolder = "spouse";
  expect(() => resolveForm2555Sources(business)).toThrow(/owner/i);
  business.scheduleC.accountHolder = "primary";
  const missing = business.form2555?.sourceMapping?.rows[0] as Record<string, unknown>;
  delete missing.businessOtherIncome;
  expect(() => resolveForm2555Sources(business)).toThrow(/actual|other income/i);
});
it("requires actual separate employment and rejects unsupported mappings", () => {
  const facts = source(); facts.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "0"; facts.incomeSources.foreignEmploymentIncomeNotOnW2 = "120000";
  Object.assign(facts.sourceMapping.rows[0], { sourceId: "foreignEmployment:original-payroll", notIncludedInW2Confirmed: true });
  expect(resolveForm2555Sources(input({ form2555: facts })).sourceFactsVerified).toBe(true);
  Object.assign(facts.sourceMapping.rows[0], { notIncludedInW2Confirmed: false });
  expect(() => resolveForm2555Sources(input({ form2555: facts }))).toThrow(/W2|separate/i);
  Object.assign(facts.sourceMapping.rows[0], { notIncludedInW2Confirmed: true, priorYearIncomeReceived: "1" });
  expect(() => resolveForm2555Sources(input({ form2555: facts }))).toThrow(/prior/i);
  for (const key of ["foreignPartnershipIncomeAlreadyReported", "otherForeignIncomeAlreadyReported"] as const) {
    const other = source(); other.incomeSources[key] = "1";
    expect(() => resolveForm2555Sources(input({ form2555: other }))).toThrow(/unsupported|source method|partnership|other/i);
  }
});
it("preserves unknown legacy sources and rejects incomplete actual records", () => {
  const legacy = source(); const { accountHolder: _owner, sourceMapping: _mapping, ...original } = legacy;
  expect(Form2555Schema.parse(original).accountHolder).toBeUndefined();
  expect(resolveForm2555Sources(input({ form2555: original })).sourceFactsVerified).toBe(false);
  const year = input({ form2555: original }); year.taxpayer.taxYear = 2026;
  expect(() => resolveForm2555Sources(year)).toThrow(/source|year|owner/i);
  for (const patch of [{ allSourcesIncluded: false }, { oneOwnerOnlyConfirmed: false }, { sourceFactsConfirmed: false }, { sourceReference: "" }]) {
    const facts = source(); Object.assign(facts.sourceMapping, patch);
    expect(() => resolveForm2555Sources(input({ form2555: facts }))).toThrow();
  }
  const missing = source() as Record<string, unknown>; delete missing.accountHolder;
  expect(() => resolveForm2555Sources(input({ form2555: missing }))).toThrow(/owner/i);
});
it("validates actual sources before canonical exclusion and tax stacking", () => {
  const result = calculateFederalTax(input());
  expect(result.totalWages.toFixed()).toBe("160000"); expect(result.agi.toFixed()).toBe("40000");
  expect(result.taxableIncome.toFixed()).toBe("24250"); expect(result.ordinaryTax.toFixed()).toBe("5820");
  const facts = source(); facts.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "0"; facts.incomeSources.foreignEmploymentIncomeNotOnW2 = "120000";
  Object.assign(facts.sourceMapping.rows[0], { sourceId: "foreignEmployment:original-payroll", notIncludedInW2Confirmed: true });
  const other = input({ form2555: facts }); if (!other.w2s[0]) throw new Error("Missing W2"); other.w2s[0].wages = "40000";
  expect(calculateFederalTax(other).totalWages.toFixed()).toBe("160000");
  const changed = input(); if (!changed.w2s[0]) throw new Error("Missing W2"); changed.w2s[0].accountHolder = "spouse";
  expect(() => calculateFederalTax(changed)).toThrow(/owner/i);
});

it("supports one actual spouse source and rejects household substitution", () => {
  const actual = input();
  actual.taxpayer.filingStatus = "married_filing_jointly";
  actual.taxpayer.spouse = { ...actual.taxpayer.primary, firstName: "Actual spouse" };
  if (!actual.form2555?.sourceMapping || !actual.w2s[0]) throw new Error("Missing source");
  actual.form2555.accountHolder = "spouse";
  firstSource(actual.form2555).accountHolder = "spouse";
  actual.w2s[0].accountHolder = "spouse";
  expect(resolveForm2555Sources(actual).currentForeignIncome.toFixed()).toBe("120000");
  actual.taxpayer.taxYear = 2026;
  actual.form2555.taxYear = 2026;
  firstSource(actual.form2555).sourceTaxYear = 2026;
  actual.w2s[0].taxYear = 2026;
  expect(resolveForm2555Sources(actual).sourceFactsVerified).toBe(true);
  actual.w2s[0].accountHolder = "primary";
  expect(() => resolveForm2555Sources(actual)).toThrow(/owner/);
  actual.w2s[0].accountHolder = "spouse";
  actual.taxpayer.spouse = undefined;
  expect(() => resolveForm2555Sources(actual)).toThrow(/household/);
  actual.taxpayer.spouse = { ...actual.taxpayer.primary, firstName: "Actual spouse" };
  actual.taxpayer.filingStatus = "married_filing_separately";
  expect(() => resolveForm2555Sources(actual)).toThrow(/household/);
});

it("rejects missing and contradictory original receipt facts", () => {
  expect(resolveForm2555Sources(input({ form2555: undefined })).sourceFactsVerified).toBe(false);
  for (const badAmount of [undefined, "", "-0.01", "NaN", "Infinity"]) {
    const actual = input();
    if (!actual.form2555?.sourceMapping) throw new Error("Missing source");
    Object.assign(firstSource(actual.form2555), { foreignEarnedIncome: badAmount });
    expect(() => resolveForm2555Sources(actual)).toThrow();
  }
  for (const change of [(facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { facts.taxYear = 2024; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { facts.incomeSourceMappingConfirmed = false; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { facts.partIV = undefined; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { firstSource(facts).sourceReference = " "; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { firstSource(facts).payerName = " "; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { facts.priorYearIncomeReceived = "1"; },
    (facts: NonNullable<ReturnType<typeof input>["form2555"]>) => { facts.priorYearIncomeExclusion = "1"; facts.priorYearIncomeReceived = "0"; }]) {
    const actual = input(); if (!actual.form2555) throw new Error("Missing source"); change(actual.form2555);
    expect(() => resolveForm2555Sources(actual)).toThrow();
  }
  const separate = source();
  separate.incomeSources.foreignEmploymentIncomeIncludedOnW2 = "0";
  separate.incomeSources.foreignEmploymentIncomeNotOnW2 = "120000";
  Object.assign(separate.sourceMapping.rows[0], { sourceId: "foreignEmployment:one", notIncludedInW2Confirmed: true, foreignEarnedIncome: "60000" });
  separate.sourceMapping.rows.push({ ...separate.sourceMapping.rows[0], sourceId: "foreignEmployment:two" });
  expect(() => resolveForm2555Sources(input({ form2555: separate }))).toThrow(/duplicate.*reference/);
});

it("binds active-partner income to its Schedule K-1", () => {
  const k1 = { taxYear: 2025, accountHolder: "primary", partnershipName: "Fictional Partners", partnershipEIN: "12-3456789", ordinaryIncome: "90000", selfEmploymentEarnings: "80000" };
  const facts = (patch = {}, amount = "70000") => { const form = source(); Object.assign(form, { foreignEarnedIncome: amount, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0",
    partIV: { ...form.partIV, wages: "0", partnershipPersonalServices: amount }, incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignPartnershipIncomeAlreadyReported: amount } });
    form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleK1:0", payerName: "Fictional Partners", payerEin: "12-3456789", foreignEarnedIncome: amount, partnerPerformedServicesConfirmed: true, capitalMaterialIncomeFactor: false, qbiForeignProfit: "0", ...patch } as never]; return form; };
  const run = (form = facts(), original: Record<string, unknown> = k1) => resolveForm2555Sources({ ...input({ form2555: form }), scheduleK1: [original] } as never);
  expect(run().currentForeignIncome.toFixed()).toBe("70000");
  expect(run(facts({}, "80000")).currentForeignIncome.toFixed()).toBe("80000");
  expect(() => run(facts({}, "80000.01"))).toThrow(/exceed Schedule K-1 Box 14 code A/);
  expect(() => run(facts({ capitalMaterialIncomeFactor: true }))).toThrow(/reasonable allowance/);
  for (const patch of [{ capitalMaterialIncomeFactor: undefined }, { partnerPerformedServicesConfirmed: undefined }, { partnerPerformedServicesConfirmed: false }]) expect(() => run(facts(patch)), JSON.stringify(patch)).toThrow(/partner/i);
  for (const patch of [{ payerName: "Changed" }, { payerEin: "98-7654321" }, { payerEin: undefined }, { sourceId: "scheduleK1:1" }, { sourceId: "scheduleK1:00" }]) expect(() => run(facts(patch)), JSON.stringify(patch)).toThrow();
  for (const change of [{ accountHolder: "spouse" }, { taxYear: 2024 }, { taxYear: undefined }, { selfEmploymentEarnings: undefined }]) expect(() => run(facts(), { ...k1, ...change }), JSON.stringify(change)).toThrow();
  expect(() => run(facts({ priorYearIncomeReceived: "1" }))).toThrow(/prior/i);
  const withReturn = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form2555: { ...facts(), deductionsAllocableToExcludedIncome: "4945" }, scheduleK1: [{ ...k1, ordinaryIncome: "80000", guaranteedPayments: "0" }] });
  const excluded = calculateFederalTax(withReturn), included = calculateFederalTax(TaxYearInputSchema.parse({ ...withReturn, form2555: undefined }));
  expect(included.agi.minus(excluded.agi).toFixed()).toBe("65055");
  const other = facts(); Object.assign(other, { incomeSources: { ...other.incomeSources, foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "70000" } });
  expect(() => run(other)).toThrow(/other mappings/);
});

function partnerReturn(patch: Record<string, unknown> = {}, form2555Patch: Record<string, unknown> = {}, qbiForeignProfit = "70000", k1QbiExcludesForeignConfirmed?: boolean) {
  const form = source(), amount = "70000";
  Object.assign(form, { foreignEarnedIncome: amount, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0", partIV: { ...form.partIV, wages: "0", partnershipPersonalServices: amount },
    incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignPartnershipIncomeAlreadyReported: amount }, deductionsAllocableToExcludedIncome: "4945", ...form2555Patch });
  form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleK1:0", payerName: "Fictional Partners", payerEin: "12-3456789", foreignEarnedIncome: amount, partnerPerformedServicesConfirmed: true, capitalMaterialIncomeFactor: false, qbiForeignProfit, k1QbiExcludesForeignConfirmed } as never];
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form2555: form, scheduleK1: [{ taxYear: 2025, accountHolder: "primary", partnershipName: "Fictional Partners", partnershipEIN: "12-3456789", ordinaryIncome: "80000", selfEmploymentEarnings: "80000", ...patch }] });
}

function businessReturn(foreign: string, allocable: string, patch: Record<string, unknown> = {}, wages = false) {
  const form = source(), gross = (patch.grossReceipts as string | undefined) ?? "100000";
  Object.assign(form, { foreignEarnedIncome: foreign, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0", partIV: { ...form.partIV, wages: "0", businessPersonalServices: foreign },
    incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignBusinessIncomeAlreadyReported: foreign }, deductionsAllocableToExcludedIncome: allocable });
  form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleC", payerName: "Actual Services", payerEin: "12-3456789", foreignEarnedIncome: foreign, businessGrossReceipts: gross, businessReturnsAndAllowances: "0", businessCostOfGoodsSold: "0", businessOtherIncome: "0" } as never];
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: wages ? simpleW2Fixture.w2s : [], form2555: form,
    scheduleC: { accountHolder: "primary", businessName: "Actual Services", ein: "12-3456789", grossReceipts: gross, returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", materialParticipation: true, qbiMateriallyParticipated: true, ...patch } });
}
const line13 = (result: ReturnType<typeof calculateFederalTax>) => result.allLines.find(row => row.form === "1040" && row.line === "13")!.value.toFixed();

it("removes foreign business profit from QBI", () => {
  // U.S. wages keep the taxable-income cap away, so these compare QBI itself.
  // With wages, SE tax is 13974 at the wage base, so half is 6987 and the U.S. half of that lowers QBI.
  const half = calculateFederalTax(businessReturn("50000", "3493", {}, true));
  expect(half.selfEmploymentTax.toFixed()).toBe("13974");
  expect(line13(half)).toBe("9301");
  const allForeign = calculateFederalTax(businessReturn("100000", "6987", {}, true));
  expect(line13(allForeign)).toBe("0");
  expect(allForeign.qbiLossCarryforward?.toFixed() ?? "0").toBe("0");
  const k1 = { section199AQBI: "80000", qbiMateriallyParticipated: true };
  const withWages = (value: ReturnType<typeof partnerReturn>) => TaxYearInputSchema.parse({ ...value, w2s: simpleW2Fixture.w2s });
  const removed = calculateFederalTax(withWages(partnerReturn(k1))), kept = calculateFederalTax(withWages(partnerReturn(k1, {}, "0", true)));
  expect(new Decimal(line13(kept)).minus(line13(removed)).gt("13000")).toBe(true);
  expect(new Decimal(line13(removed)).gt(0)).toBe(true);
  expect(resolveForm2555Sources(partnerReturn(k1) as never).qbiForeignProfit).toEqual([{ sourceId: "scheduleK1:0", amount: new Decimal("70000"), receipts: new Decimal("70000"), capitalMaterial: false }]);
  expect(() => calculateFederalTax(partnerReturn(k1, {}, "0"))).toThrow(/already omits this foreign profit/);
  expect(() => calculateFederalTax(partnerReturn({ ...k1, section199AW2Wages: "1" }))).toThrow(/wages and UBIA/);
  expect(() => calculateFederalTax(partnerReturn({ ...k1, section199AUBIA: "1" }))).toThrow(/wages and UBIA/);
  expect(() => calculateFederalTax(partnerReturn({ section199AQBI: "20000" }))).toThrow(/exceeds the Schedule K-1 QBI/);
  expect(() => calculateFederalTax(businessReturn("50000", "3532", { w2WagesPaid: "1" }))).toThrow(/Schedule C QBI needs its wages and UBIA/);
  expect(() => calculateFederalTax(businessReturn("50000", "3532", { ubiaQualifiedProperty: "1" }))).toThrow(/Schedule C QBI needs its wages and UBIA/);
  // A domestic source carries the whole U.S. share of the deduction, and the total is unchanged.
  const mixedInput = TaxYearInputSchema.parse({ ...businessReturn("100000", "6987", {}, true), scheduleK1: [{ taxYear: 2025, accountHolder: "primary", partnershipName: "Domestic Partners", partnershipEIN: "98-7654321", ordinaryIncome: "100000", selfEmploymentEarnings: "100000", section199AQBI: "100000", qbiMateriallyParticipated: true }] });
  const adjusted = (id: string) => calculateFederalTax(mixedInput).allLines.find(row => row.form === "QBI Source Deductions" && row.line === id)?.value.toFixed() ?? "0";
  expect(adjusted("scheduleC")).toBe("0");
  expect(new Decimal(adjusted("scheduleK1:0")).gt("90000")).toBe(true);
  for (const qbiForeignProfit of [undefined, "70000.01"]) {
    const bad = partnerReturn(k1); Object.assign(bad.form2555!.sourceMapping!.rows[0]!, { qbiForeignProfit });
    expect(() => resolveForm2555Sources(bad as never), String(qbiForeignProfit)).toThrow(/foreign profit/i);
  }
  expect(resolveForm2555Sources(input()).qbiForeignProfit).toEqual([]);
  expect(resolveForm2555Sources(input()).scheduleCForeignShare).toEqual([]);
});

it("requires the allocable self-employment deduction", () => {
  expect(() => calculateFederalTax(partnerReturn({}, {}, "0"))).not.toThrow();
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "0" }, "0"))).toThrow(/at least 4945 of the self-employment tax deduction/);
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "4944" }, "0"))).toThrow(/at least 4945/);
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "6000" }, "0"))).not.toThrow();
  // Schedule C: expenses reduce the foreign profit the same way, and part-year exclusion reduces the minimum.
  expect(() => calculateFederalTax(businessReturn("50000", "3532"))).not.toThrow();
  expect(() => calculateFederalTax(businessReturn("50000", "3531"))).toThrow(/at least 3532/);
  const expensed = businessReturn("62000", "0", { grossReceipts: "124000", expenses: { advertising: "60000" } });
  expect(() => calculateFederalTax(expensed)).toThrow(/at least 2261/);
  // The exclusion ratio scales the minimum: 130000 of 200000 foreign income.
  expect(() => calculateFederalTax(businessReturn("200000", "0", { grossReceipts: "200000" }))).toThrow(/at least 8837 /);
  // On a joint return, an owner with no self-employment row borrows no one's deduction.
  const joint = partnerReturn({ accountHolder: "spouse", selfEmploymentNetEarningsAfterAdjustments: "0", selfEmploymentIncomeType: "nonfarm", selfEmploymentFactsConfirmed: true }, { accountHolder: "spouse", deductionsAllocableToExcludedIncome: "0" }, "0");
  joint.form2555!.sourceMapping!.rows[0]!.accountHolder = "spouse";
  const couple = TaxYearInputSchema.parse({ ...joint, taxpayer: { ...joint.taxpayer, filingStatus: "married_filing_jointly", spouse: { firstName: "Pat", lastName: "Doe", ssn: "987-65-4322", dateOfBirth: "1980-01-01" } }, scheduleC: { accountHolder: "primary", businessName: "Domestic Shop", grossReceipts: "100000", returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0" } });
  expect(() => calculateFederalTax(couple)).not.toThrow();
  // A K-1 sheds only its own earnings, so adjustments below its receipts cap the share.
  const adjusted = (after: string, allocable: string) => { const value = partnerReturn({ section199AQBI: "30000", selfEmploymentNetEarningsAfterAdjustments: after, selfEmploymentIncomeType: "nonfarm", selfEmploymentFactsConfirmed: true }, { deductionsAllocableToExcludedIncome: allocable }, "0", true);
    return TaxYearInputSchema.parse({ ...value, scheduleC: { accountHolder: "primary", businessName: "Domestic Shop", grossReceipts: "100000", returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", qbiMateriallyParticipated: true } }); };
  const scheduleCQbi = (value: ReturnType<typeof adjusted>) => new Decimal(calculateFederalTax(value).allLines.find(row => row.form === "QBI Source Deductions" && row.line === "scheduleC")!.value);
  expect(() => calculateFederalTax(adjusted("0", "0"))).not.toThrow();
  expect(scheduleCQbi(adjusted("0", "0")).minus("92935").abs().lte(1)).toBe(true);
  // A K-1 loss lowers net earnings to 80000, so the whole 5652 deduction falls on Schedule C.
  expect(scheduleCQbi(adjusted("-20000", "0")).minus("94348").abs().lte(1)).toBe(true);
  expect(() => calculateFederalTax(adjusted("50000", "0"))).toThrow(/at least 3532/);
  expect(scheduleCQbi(adjusted("50000", "3532")).minus("92935").abs().lte(1)).toBe(true);
  // The foreign share comes off the owner only, so the other spouse's domestic business keeps its full deduction.
  const spouseOwner = partnerReturn({ accountHolder: "spouse" }, { accountHolder: "spouse", deductionsAllocableToExcludedIncome: "4945" }, "0");
  spouseOwner.form2555!.sourceMapping!.rows[0]!.accountHolder = "spouse";
  const pair = TaxYearInputSchema.parse({ ...spouseOwner, taxpayer: { ...spouseOwner.taxpayer, filingStatus: "married_filing_jointly", spouse: { firstName: "Pat", lastName: "Doe", ssn: "987-65-4322", dateOfBirth: "1980-01-01" } }, scheduleC: { accountHolder: "primary", businessName: "Domestic Shop", grossReceipts: "100000", returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", qbiMateriallyParticipated: true } });
  expect(new Decimal(calculateFederalTax(pair).allLines.find(row => row.form === "QBI Source Deductions" && row.line === "scheduleC")!.value).minus("92935").abs().lte(1)).toBe(true);
  // A domestic Schedule C keeps its wages and UBIA.
  const domesticWages = businessReturn("0", "0", { w2WagesPaid: "10000" }); domesticWages.form2555 = undefined;
  expect(() => calculateFederalTax(domesticWages)).not.toThrow();
});

it("limits earned income where capital is material", () => {
  const capital = (receipts: string, patch: Record<string, unknown> = {}, k1: Record<string, unknown> = {}) => { const value = partnerReturn({ ordinaryIncome: "54147", selfEmploymentEarnings: "54147", ...k1 }, { foreignEarnedIncome: receipts, partIV: { ...source().partIV, wages: "0", partnershipPersonalServices: receipts }, incomeSources: { ...source().incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignPartnershipIncomeAlreadyReported: receipts }, deductionsAllocableToExcludedIncome: "9999" }, "0");
    Object.assign(value.form2555!.sourceMapping!.rows[0]!, { foreignEarnedIncome: receipts, capitalMaterialIncomeFactor: true, reasonableServicesAllowance: "20000", reasonableAllowanceConfirmed: true, ...patch });
    return value; };
  expect(calculateFederalTax(capital("15096")).form2555?.foreignEarnedIncome.toFixed()).toBe("15096");
  expect(() => calculateFederalTax(capital("15097"))).toThrow(/30 percent limit of 15096/);
  // Guaranteed payments are part of the share.
  expect(() => calculateFederalTax(capital("15097", {}, { ordinaryIncome: "44147", guaranteedPayments: "10000" }))).toThrow(/30 percent limit of 15096/);
  // The whole-dollar deduction of 3826 gives an exact limit of 15096.30, so cents below it pass.
  expect(() => calculateFederalTax(capital("15096.20"))).not.toThrow();
  expect(() => calculateFederalTax(capital("15096.40"))).toThrow(/30 percent limit of 15096/);
  // All the foreign profit leaves QBI, not only the earned part.
  const qbiLine = (value: ReturnType<typeof capital>) => calculateFederalTax(TaxYearInputSchema.parse({ ...value, w2s: simpleW2Fixture.w2s })).allLines.find(row => row.form === "QBI Source Deductions" && row.line === "scheduleK1:0")?.value.toFixed() ?? "0";
  const whole = capital("15096", { qbiForeignProfit: "54147" }, { section199AQBI: "54147" });
  expect(qbiLine(whole)).toBe("0");
  expect(() => calculateFederalTax(capital("15096", { qbiForeignProfit: "54147.01" }, { section199AQBI: "54147" }))).toThrow(/exceeds the Schedule K-1 QBI/);
  // The limit reads this K-1 by its own index and scales the deduction by its earnings.
  const second = capital("16000"); second.form2555!.sourceMapping!.rows[0]!.sourceId = "scheduleK1:1";
  const domesticFirst = { taxYear: 2025, accountHolder: "primary", partnershipName: "Domestic Partners", partnershipEIN: "98-7654321", ordinaryIncome: "100000", selfEmploymentEarnings: "100000" };
  expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...second, scheduleK1: [domesticFirst, second.scheduleK1[0]] }))).toThrow(/30 percent limit of 150\d\d/);
  const beside = capital("14000"); const shop = { accountHolder: "primary", businessName: "Domestic Shop", grossReceipts: "200000", returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0" };
  expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...beside, scheduleC: shop }))).not.toThrow(/30 percent limit/);
  expect(() => calculateFederalTax(capital("15096", { reasonableServicesAllowance: "15095" }))).toThrow(/reasonable allowance/);
  expect(() => calculateFederalTax(capital("15096", { reasonableServicesAllowance: undefined }))).toThrow(/reasonable allowance/);
  expect(() => calculateFederalTax(capital("15096", { reasonableAllowanceConfirmed: false }))).toThrow(/reasonable allowance/);
  expect(() => calculateFederalTax(capital("15096", { capitalMaterialIncomeFactor: false }, {}))).not.toThrow(/30 percent limit/);
  expect(() => calculateFederalTax(capital("20000", { capitalMaterialIncomeFactor: false }))).not.toThrow(/30 percent limit/);
});

it("reads the K-1 earnings Schedule SE reads and handles several sources", () => {
  const shop = { accountHolder: "primary", businessName: "Domestic Shop", grossReceipts: "100000", returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", qbiMateriallyParticipated: true };
  const qbi = (value: Parameters<typeof calculateFederalTax>[0], id: string) => new Decimal(calculateFederalTax(value).allLines.find(row => row.form === "QBI Source Deductions" && row.line === id)?.value ?? 0);
  // Unconfirmed facts leave Schedule SE on Box 14 code A, so the share uses 70000 of receipts.
  const unconfirmed = partnerReturn({ selfEmploymentNetEarningsAfterAdjustments: "50000", section199AQBI: "30000" }, {}, "0", true);
  const withShop = TaxYearInputSchema.parse({ ...unconfirmed, scheduleC: shop });
  expect(qbi(withShop, "scheduleC").minus("92934.7").abs().lte(1)).toBe(true);
  // Two K-1s: the share comes from the foreign one by its own index.
  const twoK1 = partnerReturn({ selfEmploymentNetEarningsAfterAdjustments: "50000", selfEmploymentIncomeType: "nonfarm", selfEmploymentFactsConfirmed: true, section199AQBI: "30000" }, { deductionsAllocableToExcludedIncome: "3043" }, "0", true);
  twoK1.form2555!.sourceMapping!.rows[0]!.sourceId = "scheduleK1:1";
  const domesticK1 = { taxYear: 2025, accountHolder: "primary", partnershipName: "Domestic Partners", partnershipEIN: "98-7654321", ordinaryIncome: "80000", selfEmploymentEarnings: "80000", selfEmploymentNetEarningsAfterAdjustments: "80000", selfEmploymentIncomeType: "nonfarm", selfEmploymentFactsConfirmed: true, section199AQBI: "80000", qbiMateriallyParticipated: true };
  const both = TaxYearInputSchema.parse({ ...twoK1, scheduleC: shop, scheduleK1: [domesticK1, twoK1.scheduleK1[0]] });
  expect(qbi(both, "scheduleC").minus("93914").abs().lte(1)).toBe(true);
  expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...both, form2555: { ...both.form2555, deductionsAllocableToExcludedIncome: "3042" } }))).toThrow(/at least 3043/);
  // A K-1 loss cannot lower the foreign share below Schedule C's own profit.
  const lossy = TaxYearInputSchema.parse({ ...businessReturn("50000", "3532"), scheduleK1: [{ ...domesticK1, ordinaryIncome: "-20000", selfEmploymentEarnings: "0", selfEmploymentNetEarningsAfterAdjustments: "-20000", section199AQBI: "0" }] });
  expect(() => calculateFederalTax(lossy)).not.toThrow();
  expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...lossy, form2555: { ...lossy.form2555, deductionsAllocableToExcludedIncome: "3531" } }))).toThrow(/at least 3532/);
  // A joint return with an unowned source cannot pick an owner.
  const joint = partnerReturn({}, {}, "0");
  const unowned = TaxYearInputSchema.parse({ ...joint, taxpayer: { ...joint.taxpayer, filingStatus: "married_filing_jointly", spouse: { firstName: "Pat", lastName: "Doe", ssn: "987-65-4322", dateOfBirth: "1980-01-01" } }, scheduleC: { ...shop, accountHolder: undefined }, scheduleK1: [{ ...joint.scheduleK1[0], selfEmploymentEarnings: "80000" }, { ...domesticK1, accountHolder: undefined }] });
  expect(() => calculateFederalTax(unowned)).toThrow(/owner on every self-employment source/);
  // Business tips read the full business profit, so a foreign share rejects by name.
  const tips = { owner: "primary", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true, businessName: "Actual Services", businessSourceId: "scheduleC", qualifiedReportedTips: "1000", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "1000" }] };
  expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...businessReturn("50000", "3532"), schedule1A: { primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [tips], vehicleLoans: [], seniorOwners: [], overtime: [] } }))).toThrow(/business tips with foreign Schedule C profit/);
  // A foreign K-1 loss adds no foreign earnings, so Schedule C alone sets the share.
  const lossForm = businessReturn("50000", "3532");
  const lossK1 = { taxYear: 2025, accountHolder: "primary", partnershipName: "Fictional Partners", partnershipEIN: "12-3456789", ordinaryIncome: "-20000", selfEmploymentEarnings: "80000", selfEmploymentNetEarningsAfterAdjustments: "-20000", selfEmploymentIncomeType: "nonfarm", selfEmploymentFactsConfirmed: true };
  const k1Row = { ...lossForm.form2555!.sourceMapping!.rows[0]!, sourceId: "scheduleK1:0", payerName: "Fictional Partners", foreignEarnedIncome: "10000", businessGrossReceipts: undefined, businessReturnsAndAllowances: undefined, businessCostOfGoodsSold: undefined, businessOtherIncome: undefined, partnerPerformedServicesConfirmed: true, capitalMaterialIncomeFactor: false, qbiForeignProfit: "0" };
  const two = (allocable: string) => TaxYearInputSchema.parse({ ...lossForm, scheduleK1: [lossK1], form2555: { ...lossForm.form2555, foreignEarnedIncome: "60000", deductionsAllocableToExcludedIncome: allocable, partIV: { ...lossForm.form2555!.partIV, partnershipPersonalServices: "10000" },
    incomeSources: { ...lossForm.form2555!.incomeSources, foreignPartnershipIncomeAlreadyReported: "10000" }, sourceMapping: { ...lossForm.form2555!.sourceMapping!, rows: [lossForm.form2555!.sourceMapping!.rows[0]!, k1Row] } } });
  expect(() => calculateFederalTax(two("3532"))).not.toThrow(/at least/);
  expect(() => calculateFederalTax(two("3531"))).toThrow(/at least 3532/);
});

