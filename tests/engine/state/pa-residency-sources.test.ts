import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources.js";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources.js";
// Spec: spec/state/pa-residency-sources.yaml.

describe("PA actual ordinary residency sources", () => {
  it("PA actual residency sources - derives all three ordinary residency classes", () => {
    for (const status of ["resident", "part_year", "nonresident"] as const) {
      const { input, sources } = paOrdinaryResidencyFixture(status);
      expect(calculatePAResidencySources(input, sources).residencyStatus).toBe(status);
    }
  });
  it("PA actual residency sources - derives actual compensation without day allocation", () => {
    const { input, sources } = paOrdinaryResidencyFixture("part_year");
    const result = calculatePAResidencySources(input, sources);
    expect(result.compensation.toString()).toBe("26000");
    expect(result.excludedNonPACompensation.toString()).toBe("24000");
    // Mailing address remains NY even though actual late-year domicile is PA.
    expect(input.taxpayer.address.state).toBe("NY");
  });
  it("PA actual residency sources - retains known zero and actual interest timing", () => {
    const { input, sources } = paOrdinaryResidencyFixture("part_year");
    expect(calculatePAResidencySources(input, sources).interest.toString()).toBe("40");
    input.form1099Int[0].interestIncome = "0";
    sources.interest[0].original.interestIncome = "0";
    sources.interest[0].credits = [{ creditedOn: "2025-09-30", amount: "0", sourceReference: "fictional-explicit-zero" }];
    expect(calculatePAResidencySources(input, sources).interest.toString()).toBe("0");
  });
  it("PA actual residency sources - matches independent original tax amounts", () => {
    for (const year of [2025, 2026]) for (const [status, taxable, tax] of [
      ["resident", "50120", "1539"], ["part_year", "26040", "799"], ["nonresident", "6000", "184"],
    ] as const) {
      const { input, sources } = paOrdinaryResidencyFixture(status, year);
      const result = calculatePAResidencySources(input, sources);
      expect(result.totalOrdinaryPATaxableIncome.toString()).toBe(taxable);
      expect(result.taxBeforeCredits.toString()).toBe(tax);
      expect(JSON.stringify(result)).not.toContain("fictional-private-pa-complete-originals");
      expect(JSON.stringify(result)).not.toContain("900-70-0311");
      expect(result.sourceCommitment).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it("PA actual residency sources - rejects incomplete or contradictory original facts", () => {
    const cases = [
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.sourceFactsConfirmed = false; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.sourceTaxYear = 2024; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.owner.originalTaxpayer.ssn = "900-70-0999"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.residency.domicilePeriods[0].from = "2025-01-02"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.residency.domicilePeriods[0].through = "2025-06-99"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.wages[0].payroll[0].outsidePAServicesCompensation = "23999.99"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.wages[0].original.employer.ein = "98-7654321"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.wages[0].sourceTaxYear = 2024; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.wages[0].currentUncorrectedNonvoidOriginalConfirmed = false; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.interest[0].credits[0].amount = "79.99"; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.interest[0].ordinaryPersonalBankInterestConfirmed = false; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.sources.otherPAIncomeClassesConfirmedNone = false; },
      (f: ReturnType<typeof paOrdinaryResidencyFixture>) => { f.input.form1099Div.push({ payer: "Actual new source", ordinaryDividends: "10" } as typeof f.input.form1099Div[number]); },
    ];
    for (const mutate of cases) {
      const fixture = paOrdinaryResidencyFixture("part_year"); mutate(fixture);
      expect(() => calculatePAResidencySources(fixture.input, fixture.sources)).toThrow(/PA.*source|PA.*residen|PA.*ordinary/);
    }
  });
  it("PA actual residency sources - binds complete canonical originals without self-reference", () => {
    const { input, sources } = paOrdinaryResidencyFixture("resident");
    const before = calculatePAResidencySources(input, sources);
    const nested = { ...input, paResidencySources: sources };
    expect(calculatePAResidencySources(nested, sources).sourceCommitment).toBe(before.sourceCommitment);
    const changed = structuredClone(input); changed.taxpayer.primary.lastName = "Changed Original";
    expect(() => calculatePAResidencySources(changed, sources)).toThrow(/original owner/);
    for (const key of ["scheduleC", "scheduleF", "cryptoIncome"] as const) {
      const retained = { ...input, [key]: {} };
      expect(() => calculatePAResidencySources(retained, sources)).toThrow(/additional retained income/);
    }
  });
  it("PA actual residency sources - rejects duplicate originals and covers zero originals", () => {
    const duplicate = paOrdinaryResidencyFixture("resident");
    duplicate.input.w2s.push(structuredClone(duplicate.input.w2s[0]));
    duplicate.sources.wages.push({ ...structuredClone(duplicate.sources.wages[0]), originalIndex: 1, sourceReference: "different-free-text-reference" });
    expect(() => calculatePAResidencySources(duplicate.input, duplicate.sources)).toThrow(/duplicate original/);
    const zero = paOrdinaryResidencyFixture("resident");
    zero.input.form1099Int[0].interestIncome = "0";
    zero.sources.interest[0].original.interestIncome = "0";
    zero.sources.interest[0].credits[0].amount = "0";
    expect(calculatePAResidencySources(zero.input, zero.sources).interest.toString()).toBe("0");
    zero.sources.interest = [];
    expect(() => calculatePAResidencySources(zero.input, zero.sources)).toThrow(/every current original/);
  });

  it("PA actual residency sources - preserves the statutory abode and actual day boundaries", () => {
    const ordinary = paOrdinaryResidencyFixture("nonresident");
    ordinary.sources.residency.domicilePeriods[0].daysInPA = 183;
    ordinary.sources.residency.paPermanentAbodePeriods = [{ from: "2025-01-01", through: "2025-12-31" }];
    expect(calculatePAResidencySources(ordinary.input, ordinary.sources).residencyStatus).toBe("nonresident");
    ordinary.sources.residency.domicilePeriods[0].daysInPA = 184;
    ordinary.sources.residency.status = "resident";
    ordinary.input.w2s[0].stateWages = "50000";
    ordinary.sources.wages[0].original = structuredClone(ordinary.input.w2s[0]);
    expect(calculatePAResidencySources(ordinary.input, ordinary.sources).taxBeforeCredits.toString()).toBe("1539");
    ordinary.sources.residency.paPermanentAbodePeriods[0].from = "2025-07-01";
    expect(() => calculatePAResidencySources(ordinary.input, ordinary.sources)).toThrow(/statutory.*abode/);
    const exception = paOrdinaryResidencyFixture("resident");
    exception.sources.residency.status = "nonresident";
    exception.sources.residency.paPermanentAbodePeriods = [];
    exception.sources.residency.outsidePAPermanentAbodePeriods = [{ from: "2025-01-01", through: "2025-12-31" }];
    exception.sources.residency.domicilePeriods[0].daysInPA = 30;
    exception.sources.residency.dec31PrincipalResidenceState = "NY";
    exception.sources.residency.schoolDistrictCode = "99999";
    exception.sources.residency.schoolDistrictName = "Non-Pennsylvania";
    exception.input.w2s[0].stateWages = "0";
    exception.sources.wages[0].original = structuredClone(exception.input.w2s[0]);
    expect(calculatePAResidencySources(exception.input, exception.sources).taxBeforeCredits.toString()).toBe("0");
    exception.sources.residency.domicilePeriods[0].daysInPA = 31;
    expect(() => calculatePAResidencySources(exception.input, exception.sources)).toThrow(/residency contradicts/);
  });
  it("PA actual residency sources - rejects semantic duplicates despite optional presentation differences", () => {
    for (const year of [2025, 2026]) {
      const duplicate = paOrdinaryResidencyFixture("resident", year);
      const second = structuredClone(duplicate.input.w2s[0]);
      second.employer.name = "  TECH   CORP  "; second.employer.ein = "123456789";
      second.treasuryTippedOccupationCodes = [];
      duplicate.input.w2s.push(second);
      duplicate.sources.wages.push({ ...structuredClone(duplicate.sources.wages[0]), originalIndex: 1,
        sourceReference: "another-free-text-reference", original: structuredClone(second) });
      expect(() => calculatePAResidencySources(duplicate.input, duplicate.sources)).toThrow(/duplicate original/);
    }
  });
  it("PA actual residency sources - rejects contradictory unmodeled original status", () => {
    const extra = paOrdinaryResidencyFixture("resident");
    Object.assign(extra.input.w2s[0], { corrected: true });
    extra.sources.wages[0].original = structuredClone(extra.input.w2s[0]);
    expect(() => calculatePAResidencySources(extra.input, extra.sources)).toThrow(/original.*shape|original.*unsupported/);
  });
  it.each(["wage", "interest"] as const)("PA actual residency sources - rejects negative %s original withholding", kind => {
      const negative = paOrdinaryResidencyFixture("resident");
      if (kind === "wage") {
        negative.input.w2s[0].federalWithheld = "-1";
        negative.sources.wages[0].original = structuredClone(negative.input.w2s[0]);
      } else {
        negative.input.form1099Int[0].federalWithheld = "-1";
        negative.sources.interest[0].original = structuredClone(negative.input.form1099Int[0]);
      }
      expect(() => calculatePAResidencySources(negative.input, negative.sources)).toThrow(/actual.*amount|nonnegative/);
  });

  it("PA actual residency sources - rounds each reported class after exact aggregation", () => {
    for (const [wages, bank, reportedComp, reportedInt, total, tax] of [
      ["16.49", "0.49", "16", "0", "16", "0"],
      ["16.49", "0.50", "16", "1", "17", "1"],
      ["16.50", "0.49", "17", "0", "17", "1"],
    ] as const) {
      const f = paOrdinaryResidencyFixture("resident");
      Object.assign(f.input.w2s[0], { wages, stateWages: wages, socialSecurityWages: wages, medicareWages: wages,
        federalWithheld: "0", socialSecurityWithheld: "1.02", medicareWithheld: "0.24", stateTaxWithheld: "0" });
      f.sources.wages[0].original = structuredClone(f.input.w2s[0]);
      Object.assign(f.sources.wages[0].payroll[0], { grossCompensation: wages, paServicesCompensation: "0", outsidePAServicesCompensation: wages });
      f.input.form1099Int[0].interestIncome = bank;
      f.sources.interest[0].original = structuredClone(f.input.form1099Int[0]);
      f.sources.interest[0].credits[0].amount = bank;
      const result = calculatePAResidencySources(f.input, f.sources);
      expect(result.compensation.toString()).toBe(new Decimal(wages).toString());
      expect(result.interest.toString()).toBe(new Decimal(bank).toString());
      expect(result.taxBeforeCredits.toString()).toBe(tax);
      expect(result.reportedCompensation.toString()).toBe(reportedComp);
      expect(result.reportedInterest.toString()).toBe(reportedInt);
      expect(result.totalOrdinaryPATaxableIncome.toString()).toBe(total);
    }
  });

  it("PA actual residency sources - rounds a class once across distinct actual originals", () => {
    const f = paOrdinaryResidencyFixture("resident");
    Object.assign(f.input.w2s[0], { wages: "8.49", stateWages: "8.49", socialSecurityWages: "8.49", medicareWages: "8.49", federalWithheld: "0", socialSecurityWithheld: "0.53", medicareWithheld: "0.12", stateTaxWithheld: "0" });
    f.sources.wages[0].original = structuredClone(f.input.w2s[0]);
    Object.assign(f.sources.wages[0].payroll[0], { grossCompensation: "8.49", paServicesCompensation: "0", outsidePAServicesCompensation: "8.49" });
    const second = structuredClone(f.input.w2s[0]); second.employer = { name: "Distinct Actual Employer", ein: "98-7654321" };
    f.input.w2s.push(second);
    f.sources.wages.push({ ...structuredClone(f.sources.wages[0]), originalIndex: 1, sourceReference: "second-distinct-original", original: structuredClone(second) });
    f.input.form1099Int[0].interestIncome = "0";
    f.sources.interest[0].original.interestIncome = "0";
    f.sources.interest[0].credits[0].amount = "0";
    const result = calculatePAResidencySources(f.input, f.sources);
    expect(result.compensation.toString()).toBe("16.98");
    expect(result.reportedCompensation.toString()).toBe("17");
    expect(result.totalOrdinaryPATaxableIncome.toString()).toBe("17");
    expect(result.taxBeforeCredits.toString()).toBe("1");
  });

});
