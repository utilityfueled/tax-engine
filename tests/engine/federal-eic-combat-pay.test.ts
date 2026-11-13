// Spec: spec/federal/eic-combat-pay-election.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { fictionalEmptyEicHistory } from "../fixtures/eic-disallowance.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

function actualReturn(joint: boolean, year: 2025 | 2026 = 2025, wages = "2000") {
  const fixture = structuredClone(simpleW2Fixture);
  const actualFiler = { ...fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true };
  const personal = {
    mainHomeInUnitedStatesMoreThanHalfYear: true,
    countedMilitaryDutyOutsideUnitedStates: false,
    qualifyingChildOfAnotherTaxpayer: false,
  };
  const input = TaxYearInputSchema.parse({
    ...fixture,
    taxpayer: {
      ...fixture.taxpayer,
      taxYear: year,
      filingStatus: joint ? "married_filing_jointly" : "single",
      primary: actualFiler,
      spouse: joint ? { ...actualFiler, firstName: "Fictional Joint Filer", ssn: "900-70-0111" } : undefined,
    },
    w2s: [
      { ...fixture.w2s[0], taxYear: year, accountHolder: "primary", wages, federalWithheld: "0", box12CodeQ: "1000.10" },
      { ...fixture.w2s[0], taxYear: year, accountHolder: "primary", wages: "0", federalWithheld: "0", box12CodeQ: "250.40",
        employer: { name: "Fictional Second Employer", ein: "90-7000112" } },
      ...(joint ? [{ ...fixture.w2s[0], taxYear: year, accountHolder: "spouse", wages: "0", federalWithheld: "0", box12CodeQ: "1000" }] : []),
    ],
    eic: {
      claimantEligibility: {
        sourceTaxYear: year, sourceReference: "Fictional current claimant records", sourceFactsConfirmed: true,
        primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: joint ? false : undefined,
        primaryChildless: personal, spouseChildless: joint ? personal : undefined,
      },
    },
  });
  if (!input.eic) throw new Error("Fictional claimant packet is required");
  input.eic.disallowanceSources = fictionalEmptyEicHistory(input.taxpayer);
  return input;
}

function choose(input: TaxYearInput, primary: boolean, spouse?: boolean) {
  return TaxYearInputSchema.parse({ ...input, eic: { ...input.eic, combatPayElection: { primary, spouse } } });
}

function line(result: ReturnType<typeof calculateFederalTax>, name: string) {
  return result.allLines.find(entry => entry.form === "1040" && entry.line === name)?.value;
}

it("combines the two filers independently and keeps Code Q out of taxable wages", () => {
  for (const [primary, spouse, elected, credit] of [
    [false, false, undefined, "155"], [true, false, "1250.50", "251"],
    [false, true, "1000.00", "231"], [true, true, "2250.50", "327"],
  ] as const) {
    const result = calculateFederalTax(choose(actualReturn(true), primary, spouse));
    expect(result.agi.toFixed()).toBe("2000");
    expect(result.totalWages.toFixed()).toBe("2000");
    expect(line(result, "1i")?.toFixed(2)).toBe(elected);
    expect(result.earnedIncomeCredit.toFixed()).toBe(credit);
  }
  const draft = calculateFederalTax(choose(actualReturn(false, 2026), true));
  expect(line(draft, "1i")?.toFixed(2)).toBe("1250.50");
  expect(draft.earnedIncomeCredit.toFixed()).toBe("249"); // Statutory 0.0765 × 3250.50.
});

it("keeps an election that reduces the credit", () => {
  const input = actualReturn(true, 2025, "20000");
  input.w2s[0].box12CodeQ = "7500.10";
  expect(calculateFederalTax(choose(input, false, false)).earnedIncomeCredit.toFixed()).toBe("473");
  const elected = calculateFederalTax(choose(input, true, false));
  expect(elected.earnedIncomeCredit.toFixed()).toBe("0");
  expect(line(elected, "1i")?.toFixed(2)).toBe("7750.50");
  expect(elected.agi.toFixed()).toBe("20000");
});

it("requires complete actual W-2 originals and a valid owner for each election", () => {
  const missing = actualReturn(true);
  expect(() => calculateFederalTax(choose(missing, true))).toThrow(/spouse.*choice|choice.*spouse/i);
  expect(() => calculateFederalTax(choose(actualReturn(false), true, false))).toThrow(/spouse.*joint/i);
  missing.w2s[1].box12CodeQ = undefined;
  expect(() => calculateFederalTax(choose(missing, true, false))).toThrow(/every W-2/i);

  const year = actualReturn(false);
  year.w2s[0].taxYear = undefined;
  expect(() => calculateFederalTax(choose(year, true))).toThrow(/year.*owner/i);
  const owner = actualReturn(false);
  owner.w2s[0].accountHolder = undefined;
  expect(() => calculateFederalTax(choose(owner, true))).toThrow(/year.*owner/i);

  const zero = actualReturn(false);
  for (const w2 of zero.w2s) w2.box12CodeQ = "0.00";
  expect(() => calculateFederalTax(choose(zero, true))).toThrow(/positive.*combat pay/i);
  const unchanged = actualReturn(false);
  const saved = JSON.stringify(unchanged);
  expect(line(calculateFederalTax(unchanged), "1i")).toBeUndefined();
  expect(JSON.stringify(unchanged)).toBe(saved);
});
