// Spec: spec/federal/net-operating-loss-vintages.yaml.
import { expect, it } from "vitest";
import { calculateNetOperatingLoss } from "@/engine/forms/net-operating-loss.js";
import type { NetOperatingLossSources, NetOperatingLossVintageSource } from "@/engine/forms/net-operating-loss.js";
import { d } from "@/utils/decimal.js";

const identity = { primary: { firstName: "Actual", lastName: "Owner", ssn: "900001234" } };
const vintage = (lossTaxYear = 2021, openingCarryforward = "100000"): NetOperatingLossVintageSource => ({ sourceId: `loss-${lossTaxYear}`, lossTaxYear,
  sourceReference: `Filed loss ${lossTaxYear}`, originKind: "individual_nol" as const,
  originalLoss: openingCarryforward, openingCarryforward, carrybackTreatment: lossTaxYear <= 2020 ? "waived" as const : "not_required" as const,
  carrybackSourceReference: lossTaxYear <= 2020 ? "Actual timely carryback waiver" : undefined,
  adjustedThroughTaxYear: 2024, historySourceReference: "Actual2024 carry schedule", allHistoryIncluded: true,
  farmingLossIncluded: false, history: [] });
const facts = (...vintages: ReturnType<typeof vintage>[]): NetOperatingLossSources => ({ sourceTaxYear: 2025,
  sourceReference: "Actual NOL source packet", sourceFactsConfirmed: true, allCarryoversIncluded: true,
  calendarYearTaxpayer: true, returnMembership: "continuous_individual", membershipUnchangedConfirmed: true,
  primaryName: "Actual Owner", primaryTaxpayerIdLast4: "1234", vintages });
const run = (sources = facts(vintage()), context?: Parameters<typeof calculateNetOperatingLoss>[0]["context"], taxYear = 2025) =>
  calculateNetOperatingLoss({ taxYear, filingStatus: "single", taxpayer: identity, facts: sources, context });
const context = (base: string, ...rows: Array<[string, string, string]>) => ({
  taxableIncomeWithoutNolQbiAndSection250: d(base),
  modifiedTaxableIncomeWithoutNolQbiAndSection250: d(base),
  carryoverContexts: rows.map(([sourceId, prior, modified]) => ({ sourceId, priorNolDeductions: d(prior), modifiedTaxableIncomeBeforeTwentyPercentReduction: d(modified) })),
});

it("requires reconciled actual loss history and continuous return identity", () => {
  const record = { ...vintage(2021, "54000"), originalLoss: "60000",
    history: [{ taxYear: 2023, nolUsed: "5000", attributeReduction: "1000", sourceReference: "Actual2023 worksheet" }] };
  const actual = facts(record);
  expect(run(actual).availableCarryforward.toFixed()).toBe("54000");
  expect(() => run({ ...actual, primaryTaxpayerIdLast4: "9999" })).toThrow(/identity/i);
  expect(() => run({ ...actual, membershipUnchangedConfirmed: false })).toThrow(/membership/i);
  expect(() => run({ ...actual, vintages: [{ ...record, openingCarryforward: "55000" }] })).toThrow(/reconcile/i);
  expect(() => run({ ...actual, vintages: [{ ...record, history: undefined }] })).toThrow(/history/i);
});
it("leaves calculation unknown until the canonical income context exists", () => {
  const result = run();
  expect(result.sourceFactsVerified).toBe(true);
  expect(result.calculationComplete).toBe(false);
  expect(result.deduction).toBeUndefined();
  expect(result.carryforward).toBeUndefined();
});
it("limits post2017 carry using the canonical base before QBI", () => {
  const result = run(facts(vintage()), context("100000", ["loss-2021", "0", "100000"]));
  expect(result.deduction?.toFixed()).toBe("80000");
  expect(result.absorbed?.toFixed()).toBe("80000");
  expect(result.carryforward?.toFixed()).toBe("20000");
  expect(result.calculationComplete).toBe(true);
});
it("separates old loss deductions from the post2017 limitation", () => {
  const result = run(facts(vintage(2017, "20000"), vintage()), context("100000", ["loss-2017", "0", "100000"], ["loss-2021", "20000", "80000"]));
  expect(result.pre2018Deduction?.toFixed()).toBe("20000");
  expect(result.post2017Deduction?.toFixed()).toBe("64000");
  expect(result.deduction?.toFixed()).toBe("84000");
  expect(result.carryforward?.toFixed()).toBe("36000");
});
it("uses modified income rather than the claimed deduction for carry absorption", () => {
  const result = run(facts(vintage()), { ...context("100000", ["loss-2021", "0", "103000"]),
    modifiedTaxableIncomeWithoutNolQbiAndSection250: d("103000") });
  expect(result.deduction?.toFixed()).toBe("80000");
  expect(result.absorbed?.toFixed()).toBe("82400");
  expect(result.carryforward?.toFixed()).toBe("17600");
});
it("does not cap a pre2018 deduction at the amount absorbed", () => {
  const result = run(facts(vintage(2017)), context("30000", ["loss-2017", "0", "30000"]));
  expect(result.deduction?.toFixed()).toBe("100000");
  expect(result.absorbed?.toFixed()).toBe("30000");
  expect(result.carryforward?.toFixed()).toBe("70000");
});
it("expires old losses after the final allowed year without expiring later losses", () => {
  const finalYear = run(facts(vintage(2005)), context("30000", ["loss-2005", "0", "30000"]));
  expect(finalYear.absorbed?.toFixed()).toBe("30000");
  expect(finalYear.expired?.toFixed()).toBe("70000");
  expect(finalYear.carryforward?.toFixed()).toBe("0");
  const expired = { ...facts(vintage(2005)), sourceTaxYear: 2026,
    vintages: [{ ...vintage(2005), adjustedThroughTaxYear: 2025 }] };
  expect(run(expired, context("30000"), 2026).deduction?.toFixed()).toBe("0");
  const later = { ...facts(vintage(2018)), sourceTaxYear: 2026,
    vintages: [{ ...vintage(2018), adjustedThroughTaxYear: 2025 }] };
  expect(run(later, context("0", ["loss-2018", "0", "0"]), 2026).carryforward?.toFixed()).toBe("100000");
});
it("requires each FIFO context to retain the actual earlier deductions", () => {
  const sources = facts(vintage(2022, "60000"), vintage(2021, "60000"));
  const actual = context("100000", ["loss-2021", "0", "100000"], ["loss-2022", "60000", "40000"]);
  const result = run(sources, actual);
  expect(result.vintages.map(row => row.deduction?.toFixed())).toEqual(["60000", "20000"]);
  expect(result.carryforward?.toFixed()).toBe("40000");
  expect(() => run(sources, context("100000", ["loss-2021", "0", "100000"], ["loss-2022", "0", "100000"]))).toThrow(/earlier|prior/i);
  expect(() => run(sources, context("100000", ["loss-2021", "0", "100000"], ["loss-2021", "60000", "40000"]))).toThrow(/duplicate|context/i);
});
it("rejects missing carryback records and ambiguous origin methods", () => {
  expect(() => run(facts({ ...vintage(2019), carrybackSourceReference: undefined }))).toThrow(/carryback/i);
  expect(() => run(facts(vintage(), { ...vintage(), sourceId: "other-same-year-source" }))).toThrow(/duplicate|same.year/i);
  expect(() => run(facts({ ...vintage(), farmingLossIncluded: true }))).toThrow(/farming/i);
  expect(() => run(facts({ ...vintage(), openingCarryforward: "100000.10", originalLoss: "100000.10" }))).toThrow(/whole.dollar/i);
  expect(() => run(facts({ ...vintage(), adjustedThroughTaxYear: 2023 }))).toThrow(/prior.year|adjusted/i);
});
it("bounds actual historical carryback use to its supported statutory period", () => {
  const actual = { ...vintage(2019, "90000"), originalLoss: "100000", carrybackTreatment: "completed" as const,
    history: [{ taxYear: 2014, nolUsed: "10000", attributeReduction: "0", sourceReference: "Actual 2014 carryback worksheet" }] };
  expect(run(facts(actual)).availableCarryforward.toFixed()).toBe("90000");
  for (const year of [1901, 2013]) {
    expect(() => run(facts({ ...actual, history: [{ ...actual.history[0], taxYear: year }] }))).toThrow(/carryback.*period|carryback.*year/i);
  }
  expect(() => run(facts({ ...actual, carrybackTreatment: "waived" }))).toThrow(/carryback/i);
  const ordinary = { ...actual, sourceId: "loss-2017", lossTaxYear: 2017, ordinaryHistoricalCarrybackConfirmed: true,
    history: [{ ...actual.history[0], taxYear: 2015 }] };
  expect(run(facts(ordinary)).availableCarryforward.toFixed()).toBe("90000");
  expect(() => run(facts({ ...ordinary, ordinaryHistoricalCarrybackConfirmed: undefined }))).toThrow(/historical|carryback/i);
  expect(() => run(facts({ ...ordinary, history: [{ ...actual.history[0], taxYear: 2014 }] }))).toThrow(/carryback.*period|carryback.*year/i);
  expect(() => run(facts({ ...actual, sourceId: "loss-2021", lossTaxYear: 2021, carrybackTreatment: "not_required" }))).toThrow(/carryback/i);
});
it("requires the actual post2020 excess business loss origin", () => {
  for (const year of [2018, 2019, 2020]) {
    expect(() => run(facts({ ...vintage(year), originKind: "excess_business_loss", carrybackTreatment: "not_required" }))).toThrow(/2021|post2020/i);
  }
  expect(run(facts({ ...vintage(), originKind: "excess_business_loss" })).availableCarryforward.toFixed()).toBe("100000");
});
it("recomputes earlier NOL percentage limits using the same modified income basis", () => {
  const sources = facts(vintage(2021), vintage(2022));
  const modified = { ...context("100000", ["loss-2021", "0", "103000"], ["loss-2022", "82400", "20600"]),
    modifiedTaxableIncomeWithoutNolQbiAndSection250: d("103000") };
  const result = run(sources, modified);
  expect(result.vintages.map(row => row.deduction?.toFixed())).toEqual(["80000", "0"]);
  expect(result.vintages.map(row => row.absorbed?.toFixed())).toEqual(["82400", "0"]);
  expect(result.vintages.map(row => row.remainingCarryforward?.toFixed())).toEqual(["17600", "100000"]);
  expect(() => run(sources, { ...modified, modifiedTaxableIncomeWithoutNolQbiAndSection250: undefined })).toThrow(/modified.*limit|modified.*income/i);
  expect(() => run(sources, { ...modified, carryoverContexts: context("100000", ["loss-2021", "0", "103000"], ["loss-2022", "80000", "23000"]).carryoverContexts })).toThrow(/earlier|modified/i);
});
it("binds both unchanged joint members without inferring a spouse allocation", () => {
  const taxpayer = { ...identity, spouse: { firstName: "Other", lastName: "Owner", ssn: "900005678" } };
  const source = { ...facts(vintage()), returnMembership: "same_spouses_joint" as const,
    spouseName: "Other Owner", spouseTaxpayerIdLast4: "5678" };
  const joint = (actual: typeof source, household = taxpayer) => calculateNetOperatingLoss({ taxYear: 2025,
    filingStatus: "married_filing_jointly", taxpayer: household, facts: actual, context: context("100000", ["loss-2021", "0", "100000"]) });
  expect(joint(source).carryforward?.toFixed()).toBe("20000");
  expect(() => joint({ ...source, spouseTaxpayerIdLast4: "0000" })).toThrow(/identity/i);
  expect(() => joint({ ...source, spouseName: "" })).toThrow(/identity/i);
  expect(() => joint({ ...source, membershipUnchangedConfirmed: false })).toThrow(/membership/i);
  expect(() => run({ ...source, returnMembership: "continuous_individual" })).toThrow(/identity/i);
});
it("preserves unknown carry calculation and validates actual zero or negative income", () => {
  const claim = run(facts(vintage()), { taxableIncomeWithoutNolQbiAndSection250: d("100000") });
  expect(claim.deduction?.toFixed()).toBe("80000");
  expect(claim.calculationComplete).toBe(false);
  expect(claim.absorbed).toBeUndefined();
  expect(claim.carryforward).toBeUndefined();
  const negative = run(facts(vintage()), context("-1000", ["loss-2021", "0", "-1000"]));
  expect(negative.deduction?.toFixed()).toBe("0");
  expect(negative.absorbed?.toFixed()).toBe("0");
  expect(negative.carryforward?.toFixed()).toBe("100000");
  expect(run(facts(), context("0")).carryforward?.toFixed()).toBe("0");
  expect(() => run(facts(vintage()), context("NaN", ["loss-2021", "0", "0"]))).toThrow(/finite/i);
  expect(() => run(facts(vintage()), context("100000", ["loss-2021", "-1", "100001"]))).toThrow(/earlier/i);
  expect(() => run(facts(vintage()), context("100000", ["wrong-source", "0", "100000"]))).toThrow(/context/i);
  expect(() => run(facts(vintage()), context("100000"))).toThrow(/context/i);
});
