// Spec: spec/federal/eic-credit-table.yaml. Expected cells come from the official table.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateEicCreditTable } from "@/engine/forms/eic-credit-table.js";
import { calculateEic } from "@/engine/forms/schedule-eic.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { fictionalEmptyEicHistory } from "../../fixtures/eic-disallowance.js";

const published: { rows: string[][] } = JSON.parse(readFileSync(new URL("../../fixtures/eic-table-2025.json", import.meta.url), "utf8"));
const draft: { rows: string[][]; partialIntervals: Array<{ lower: string; cutoff: string; column: number; credit: string }> } =
  JSON.parse(readFileSync(new URL("../../fixtures/eic-table-2026-draft.json", import.meta.url), "utf8"));
const limits = [["19104", "50434", "57310", "61555"], ["26214", "57554", "64430", "68675"]];
function result(income: string, children = 0, joint = false, agi = income) {
  return calculateEic({ filingStatus: joint ? "married_filing_jointly" : "single", qualifyingChildren: children,
    earnedIncome: d(income), agi: d(agi), investmentIncome: d(0), primaryAge: 35, mfsEicEligible: false }, getConstants(2025));
}

it("matches every published2025 EIC table cell and final footnote", () => {
  expect(published.rows).toHaveLength(1374);
  for (const row of published.rows) for (const joint of [0, 1]) for (const children of [0, 1, 2, 3]) {
    const expected = row[2 + joint * 4 + children];
    const upper = d(row[1]);
    const cutoff = d(limits[joint][children]);
    const lastEligible = upper.lte(cutoff) ? upper.minus(1) : cutoff.minus(1);
    expect(result(row[0], children, joint === 1).credit.toFixed(), `${row[0]}, joint${joint}, children${children}`).toBe(expected);
    if (lastEligible.gte(row[0])) expect(result(lastEligible.toFixed(), children, joint === 1).credit.toFixed(), `${lastEligible}, joint${joint}, children${children}`).toBe(expected);
  }
});

it("uses independent earned and AGI limits and the published Grey example", () => {
  expect(result("1000", 1, false, "30000").credit.toFixed()).toBe("349");
  expect(result("33030", 2, true, "33555").credit.toFixed()).toBe("6498");
  expect(result("5000", 1, false, "-100").credit.toFixed()).toBe("1709");
  expect(result("5000", 1, false, "1000").credit.toFixed()).toBe("1709");
  for (const filingStatus of ["head_of_household", "qualifying_surviving_spouse", "married_filing_separately"] as FilingStatus[]) {
    const actual = calculateEic({ filingStatus, qualifyingChildren: 1, earnedIncome: d("1000"), agi: d("30000"),
      investmentIncome: d(0), primaryAge: 35, mfsEicEligible: true }, getConstants(2025));
    expect(actual.credit.toFixed()).toBe("349");
  }
});

it("preserves cents and applies every final interval cutoff", () => {
  const source = d("4999.50");
  expect(result("4999.49").credit.toFixed()).toBe("381");
  const actual = calculateEic({ filingStatus: "single", qualifyingChildren: 0, earnedIncome: source, agi: source,
    investmentIncome: d(0), primaryAge: 35, mfsEicEligible: false }, getConstants(2025));
  expect(actual.credit.toFixed()).toBe("384");
  expect(source.toFixed()).toBe("4999.5");
  expect(result(".49").credit.toFixed()).toBe("0");
  expect(result(".50").credit.toFixed()).toBe("2");
  const last = [["0", "3", "1", "1"], ["1", "0", "3", "3"]];
  for (const joint of [0, 1]) for (const children of [0, 1, 2, 3]) {
    const cutoff = d(limits[joint][children]);
    expect(result(cutoff.minus(1).toFixed(), children, joint === 1).credit.toFixed()).toBe(last[joint][children]);
    expect(result(cutoff.toFixed(), children, joint === 1).credit.toFixed()).toBe("0");
    expect(result(cutoff.minus(".49").toFixed(), children, joint === 1).credit.toFixed()).toBe("0");
  }
});

it("uses the 2026 draft table for separate earned and AGI lookups", () => {
  const claimantInput = { taxpayer: { taxYear: 2026, filingStatus: "single" as const,
    primary: { firstName: "Fictional", lastName: "Claimant", ssn: "111-22-3333", dateOfBirth: "1990-01-02", employmentValidSsnIssuedByDueDate: true } },
    eic: { claimantEligibility: { sourceTaxYear: 2026, sourceReference: "Actual synthetic claimant record", sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false } } };
  const base = { filingStatus: "single" as const, qualifyingChildren: 1, earnedIncome: d("1000"), agi: d("30000"),
    investmentIncome: d(0), mfsEicEligible: false, claimantInput,
    disallowanceInput: { taxpayer: claimantInput.taxpayer, sources: fictionalEmptyEicHistory(claimantInput.taxpayer) } };
  const actual = calculateEic(base, FEDERAL_2026_CONSTANTS);
  expect(actual.credit.toFixed()).toBe("349");
  expect(actual.lines.find(row => row.form === "EIC" && row.line === "27a")?.formula).toContain("2026 draft EIC table");
  expect(actual.lines.filter(row => row.form === "EIC Table" && row.line.endsWith(":credit")).map(row => row.value.toFixed()))
    .toEqual(["349", "3447"]);
  const firstBoundary = calculateEic({ ...base, earnedIncome: d("100"), agi: d("100") }, FEDERAL_2026_CONSTANTS);
  expect(firstBoundary.credit.toFixed()).toBe("43");
  const maximum = calculateEic({ ...base, qualifyingChildren: 3, earnedIncome: d("20000"), agi: d("20000") }, FEDERAL_2026_CONSTANTS);
  expect(maximum.credit.toFixed()).toBe("8231");
  expect(maximum.maxCredit.toFixed()).toBe("8231");
});

it("matches every published 2026 draft EIC table cell and partial interval", () => {
  expect(draft.rows).toHaveLength(1405);
  expect(draft.partialIntervals).toHaveLength(8);
  function lookup(income: string, column: number) {
    return calculateEicCreditTable({ income: d(income), filingStatus: column < 4 ? "single" : "married_filing_jointly",
      qualifyingChildren: column % 4, lookup: "earned" }, FEDERAL_2026_CONSTANTS).credit.toFixed();
  }
  for (const [lower, upper, ...credits] of draft.rows) {
    expect(credits).toHaveLength(8);
    for (const [column, expected] of credits.entries()) {
      const partial = draft.partialIntervals.find(row => row.lower === lower && row.column === column);
      const lastEligible = d(partial?.cutoff ?? upper).minus(1).toFixed();
      expect(lookup(lower, column), `${lower}, column ${column}`).toBe(expected);
      expect(lookup(lastEligible, column), `${lastEligible}, column ${column}`).toBe(expected);
    }
  }
  for (const { lower, cutoff, column, credit } of draft.partialIntervals) {
    expect(lookup(d(lower).minus(".50").toFixed(), column)).toBe(credit);
    expect(lookup(d(cutoff).minus(".51").toFixed(), column)).toBe(credit);
    expect(lookup(d(cutoff).minus(".50").toFixed(), column)).toBe("0");
    expect(lookup(cutoff, column)).toBe("0");
  }
  expect(lookup(".49", 0)).toBe("0");
  expect(lookup(".50", 0)).toBe("2");
});

it("rejects unavailable years and invalid table inputs without modifying original cents", () => {
  const base = { income: d("5000.49"), filingStatus: "single" as const, qualifyingChildren: 0, lookup: "earned" as const };
  expect(() => calculateEicCreditTable(base, { ...getConstants(2025), taxYear: 2027 })).toThrow(/EIC table.*available/);
  expect(() => getConstants(2026)).toThrow(/2026 rule pack.*incomplete/);
  for (const income of [d("NaN"), d("Infinity"), d("-Infinity")]) {
    expect(() => calculateEicCreditTable({ ...base, income }, getConstants(2025))).toThrow(/finite actual income/);
  }
  for (const qualifyingChildren of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => calculateEicCreditTable({ ...base, qualifyingChildren }, getConstants(2025))).toThrow(/whole nonnegative child count/);
  }
  const actual = calculateEicCreditTable(base, getConstants(2025));
  expect(actual.credit.toFixed()).toBe("384");
  expect(actual.lines.at(-1)?.inputs["Original income"].toString()).toBe("5000.49");
  expect(base.income.toFixed()).toBe("5000.49");
  expect(calculateEicCreditTable({ ...base, qualifyingChildren: 4 }, getConstants(2025)).credit.toFixed()).toBe("2261");
  expect(calculateEicCreditTable({ ...base, income: d("-1") }, getConstants(2025)).credit.toFixed()).toBe("0");
});
