// Spec: spec/federal/form-172-return.yaml. Independently derived literal examples.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { currentOriginInput } from "../fixtures/form-172-origin.js";
import { actualNolInput } from "../fixtures/net-operating-loss.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing synthetic current-origin source");
  return value;
}

it("computes independent current regular AMT and investment loss origins", () => {
  const source = currentOriginInput();
  const before = JSON.stringify(source);
  const result = calculateFederalTax(source);
  expect(result.agi.toFixed()).toBe("-75000");
  expect(result.nolDeduction.toFixed()).toBe("0");
  expect(result.form172?.regular.partI[1].toFixed()).toBe("-90750");
  expect(result.form172?.regular.partI[9].toFixed()).toBe("10750");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.partI[6].toFixed()).toBe("0");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe("0");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("80000");
  expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe("75000");
  expect(result.allLines.filter(row => row.form === "172 Part I" && row.line === "24").map(row => row.value.toFixed())).toEqual(["-80000"]);
  expect(result.allLines.filter(row => row.form === "Alternative172 Part I" && row.line === "24").map(row => row.value.toFixed())).toEqual(["-75000"]);
  expect(JSON.stringify(source)).toBe(before);
});

it("preserves the current excess business loss separately and adds it once", () => {
  const result = calculateFederalTax(currentOriginInput("500000"));
  expect(result.form461?.sourceFactsVerified).toBe(true);
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe("187000");
  expect(result.agi.toFixed()).toBe("-288000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("293000");
  expect(result.form172?.currentExcessBusinessLoss.toFixed()).toBe("187000");
  expect(result.form172?.newRegularCarryforward.toFixed()).toBe("480000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("288000");
  expect(result.form172?.newAlternativeCarryforward.toFixed()).toBe("475000");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("480000");
  expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe("475000");
});

it("conserves earlier carry histories without converting old deductions into new losses", () => {
  for (const year of [2021, 2017]) {
    const source = currentOriginInput();
    const packet = source.netOperatingLoss;
    const vintage = actualNolInput("0").netOperatingLoss?.vintages?.[0];
    if (!packet?.alternativeTax || !vintage) throw new Error("Missing synthetic carry source");
    packet.vintages = [{ ...vintage, lossTaxYear: year, originalLoss: "10000", openingCarryforward: "10000",
      carrybackTreatment: year === 2017 ? "waived" : "not_required", carrybackSourceReference: year === 2017 ? "Actual filed timely waiver" : undefined }];
    packet.alternativeTax.vintages = [{ ...vintage, sourceId: "actual-amt2021", originalLoss: "2000", openingCarryforward: "2000",
      section1411OriginalLoss: undefined }];
    const result = calculateFederalTax(source);
    expect(result.nolDeduction.toFixed()).toBe(year === 2017 ? "10000" : "0");
    expect(result.form172?.regular.partI[23].toFixed()).toBe(year === 2017 ? "10000" : "0");
    expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
    expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe("10000");
    expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe("2000");
    expect(result.carryforwards.nolCarryforward.toFixed()).toBe("90000");
    expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe("77000");
  }
});

it("rejects unknown contradictory and unsupported current origin sources", () => {
  for (const mutate of [
    (value: ReturnType<typeof currentOriginInput>) => { required(value.form172).sourceFactsConfirmed = undefined; },
    (value: ReturnType<typeof currentOriginInput>) => { required(value.form172).sourceTaxYear = 2024; },
    (value: ReturnType<typeof currentOriginInput>) => { required(required(required(value.form172).businessSources)[0]).accountHolder = "spouse"; },
    (value: ReturnType<typeof currentOriginInput>) => { required(required(required(value.form172).businessSources)[0]).businessName = "Different actual business"; },
    (value: ReturnType<typeof currentOriginInput>) => { required(required(required(value.form172).businessSources)[0]).materiallyParticipated = undefined; },
    (value: ReturnType<typeof currentOriginInput>) => { required(required(required(value.form172).businessSources)[0]).financialTradingBusiness = true; },
    (value: ReturnType<typeof currentOriginInput>) => { required(value.scheduleC).allInvestmentAtRisk = false; },
    (value: ReturnType<typeof currentOriginInput>) => { required(required(value.form172).alternativeTax).regularDepreciationSameAsAlternativeConfirmed = undefined; },
    (value: ReturnType<typeof currentOriginInput>) => { required(value.netOperatingLoss).alternativeTax = undefined; },
    (value: ReturnType<typeof currentOriginInput>) => { value.netOperatingLoss = undefined; },
  ]) {
    const source = currentOriginInput(); mutate(source);
    expect(() => calculateFederalTax(source)).toThrow(/Form172|current.*origin|separate actual complete AMT/i);
  }
  expect(() => calculateFederalTax(currentOriginInput("100000", { form1099Misc: [
    { payer: "First source", otherIncome: "100" }, { payer: "Second source", otherIncome: "-100" },
  ] }))).toThrow(/Form172.*classification/i);
  expect(() => calculateFederalTax(currentOriginInput("100000", { scheduleA: { additionalStateLocalIncomeTaxes: "50000" } }))).toThrow(/Form172.*income.tax.*classification/i);
  expect(() => calculateFederalTax(currentOriginInput("100000", { priorYear: { shortTermCapitalLoss: "-100" } }))).toThrow(/Form172.*capital/i);
  const future = currentOriginInput(); future.taxpayer.taxYear = 2026; required(future.form172).sourceTaxYear = 2026; required(future.netOperatingLoss).sourceTaxYear = 2026;
  expect(() => calculateFederalTax(future)).toThrow(/not ready|unavailable|not enabled|readiness/i);
});

it("classifies actual above-line deductions without losing source precision", () => {
  const source = currentOriginInput("100000", {
    form8889: { accountOwner: "primary", coverageByMonth: Array.from({ length: 12 }, () => "self_only"),
      contributionsMade: "2000.25", employerContributions: "0", useLastMonthRule: false },
    iraDeductionWorksheet: { primaryContributions: "1000", primaryIsActiveParticipant: false, primaryCompensation: "20000",
      primaryRothContributions: "0", primarySection501c18Contributions: "0", sourceFactsConfirmed: true },
  });
  const result = calculateFederalTax(source);
  expect(result.agi.toFixed()).toBe("-78000.25");
  expect(result.form172?.regular.partI[6].toFixed()).toBe("18750");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.partI[6].toFixed()).toBe("3000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("78000");
  expect(source.form8889?.contributionsMade).toBe("2000.25");
});

it("retains a known zero current origin without inventing a loss from deductions", () => {
  const source = currentOriginInput("0", { scheduleC: undefined, form1099Int: [] });
  required(source.form172).businessSources = [];
  required(source.w2s[0]).wages = "1000";
  const result = calculateFederalTax(TaxYearInputSchema.parse(source));
  expect(result.form172?.regular.partI[1].toFixed()).toBe("-14750");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("0");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("0");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("0");
});

it("retains actual private activity interest and business source cents across separate origins", () => {
  const source = currentOriginInput();
  const interest = required(source.form1099Int[0]);
  interest.taxExemptInterest = "500.25"; interest.privateActivityBondInterest = "500.25"; interest.accountHolder = "primary";
  interest.privateActivityBondFacts = { taxYear: 2025, sourceId: "actual-bond-preference", recipientAmountsConfirmed: true,
    otherwiseAllowableDeduction: "0" };
  const result = calculateFederalTax(source);
  expect(result.form6251?.amti.toFixed()).toBe("-74499.75");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("74500");
  expect(interest.privateActivityBondInterest).toBe("500.25");
  const cents = currentOriginInput("500000.10"), computed = calculateFederalTax(cents);
  expect(computed.form461?.line16ExcessBusinessLoss.toFixed()).toBe("187000");
  expect(computed.agi.toFixed()).toBe("-288000.1");
  expect(computed.form172?.newRegularCarryforward.toFixed()).toBe("480000");
  expect(computed.form172?.newAlternativeCarryforward.toFixed()).toBe("475000");
  expect(cents.scheduleC?.expenses.otherExpenses).toBe("500000.10");
});
