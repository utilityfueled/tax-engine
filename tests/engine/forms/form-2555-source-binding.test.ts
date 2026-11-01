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
  Object.assign(facts.sourceMapping.rows[0], { sourceId: "scheduleC", qbiForeignProfit: "0", payerName: "Actual Services", payerEin: "12-3456789", businessGrossReceipts: "130000", businessReturnsAndAllowances: "5000", businessCostOfGoodsSold: "1000", businessOtherIncome: "0" });
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
  expect(() => run(facts({ capitalMaterialIncomeFactor: true }))).toThrow(/30 percent method/);
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

function partnerReturn(patch: Record<string, unknown> = {}, form2555Patch: Record<string, unknown> = {}, qbiForeignProfit = "70000") {
  const form = source(), amount = "70000";
  Object.assign(form, { foreignEarnedIncome: amount, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0", partIV: { ...form.partIV, wages: "0", partnershipPersonalServices: amount },
    incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignPartnershipIncomeAlreadyReported: amount }, deductionsAllocableToExcludedIncome: "4945", ...form2555Patch });
  form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleK1:0", payerName: "Fictional Partners", payerEin: "12-3456789", foreignEarnedIncome: amount, partnerPerformedServicesConfirmed: true, capitalMaterialIncomeFactor: false, qbiForeignProfit } as never];
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], form2555: form, scheduleK1: [{ taxYear: 2025, accountHolder: "primary", partnershipName: "Fictional Partners", partnershipEIN: "12-3456789", ordinaryIncome: "80000", selfEmploymentEarnings: "80000", ...patch }] });
}

it("removes foreign business profit from QBI", () => {
  const qbi = { section199AQBI: "80000", qbiMateriallyParticipated: true, section199AW2Wages: "100000", section199AUBIA: "0" };
  const withWages = (value: ReturnType<typeof partnerReturn>) => TaxYearInputSchema.parse({ ...value, w2s: simpleW2Fixture.w2s });
  const removed = calculateFederalTax(withWages(partnerReturn(qbi))), kept = calculateFederalTax(withWages(partnerReturn(qbi, {}, "0")));
  const line13 = (result: typeof removed) => result.allLines.find(row => row.form === "1040" && row.line === "13")!.value;
  expect(line13(kept).minus(line13(removed)).gt("13000")).toBe(true);
  expect(line13(removed).gt(0)).toBe(true);
  const form = partnerReturn(qbi).form2555!;
  expect(resolveForm2555Sources({ ...partnerReturn(qbi) } as never).qbiForeignProfit).toEqual([{ sourceId: "scheduleK1:0", amount: new Decimal("70000") }]);
  for (const qbiForeignProfit of [undefined, "70000.01"]) {
    const bad = structuredClone(form); Object.assign(bad.sourceMapping!.rows[0]!, { qbiForeignProfit });
    expect(() => resolveForm2555Sources({ ...partnerReturn(qbi), form2555: bad } as never), String(qbiForeignProfit)).toThrow(/foreign profit/i);
  }
  const wage = input(); expect(resolveForm2555Sources(wage).qbiForeignProfit).toEqual([]);
});

it("requires the allocable self-employment deduction", () => {
  expect(() => calculateFederalTax(partnerReturn())).not.toThrow();
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "0" }))).toThrow(/at least 4945 of the self-employment tax deduction/);
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "4944" }))).toThrow(/at least 4945/);
  expect(() => calculateFederalTax(partnerReturn({}, { deductionsAllocableToExcludedIncome: "6000" }))).not.toThrow();
});

