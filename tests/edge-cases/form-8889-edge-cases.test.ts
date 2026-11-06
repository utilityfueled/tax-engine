/**
 * Edge case tests for Form 8889 HSA eligibility boundaries.
 * Spec: spec/federal/form-8889.yaml
 *
 * Tests cover contribution limit proration, coverage changes, filing-status
 * interactions, distribution penalty thresholds, and recapture scenarios.
 */

import { describe, expect, it } from "vitest";
import { calculateForm8889 } from "@/engine/forms/form-8889.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const constants = getConstants(2025);
// 2025 limits: self-only $4,300, family $8,550, catch-up $1,000

const mfjTaxpayer = {
  ...simpleW2Fixture.taxpayer,
  filingStatus: "married_filing_jointly" as const,
  spouse: {
    firstName: "Pat",
    lastName: "Example",
    ssn: "987-65-4321",
    dateOfBirth: "1978-09-12",
  },
};

describe("Form 8889 HSA edge cases", () => {
  // ── Age boundary tests ──────────────────────────────────

  it("allows the full catch-up contribution when the taxpayer turns 55 on December 31 but not one day later", () => {
    const eligibleAtYearEnd = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1970-12-31",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "5300",
    }, constants);
    const stillUnder55 = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1971-01-01",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "5300",
    }, constants);

    expect(eligibleAtYearEnd.line3.toNumber()).toBe(5300);
    expect(eligibleAtYearEnd.line8.toNumber()).toBe(5300);
    expect(eligibleAtYearEnd.line13.toNumber()).toBe(5300);
    expect(stillUnder55.line3.toNumber()).toBe(4300);
    expect(stillUnder55.line8.toNumber()).toBe(4300);
    expect(stillUnder55.line13.toNumber()).toBe(4300);
  });

  it("does not apply the last-month rule when Medicare coverage starts in December", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "self_only",
        "self_only",
        "self_only",
        "self_only",
      ],
      medicareMonths: [12],
      contributionsMade: "4300",
    }, constants);

    expect(result.coverageType).toBe("self_only");
    // 3 eligible months (Sep-Nov): $4,300 × 3/12 = $1,075
    expect(result.line3.toNumber()).toBe(1075);
    expect(result.line8.toNumber()).toBe(1075);
    expect(result.line13.toNumber()).toBe(1075);
  });

  it("zeros the contribution limit when the HSA account owner is a dependent", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "8550",
      isDependent: true,
    }, constants);

    expect(result.coverageType).toBe("none");
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("starts the age-65 additional-tax exception only when the taxpayer was already 65 on January 1", () => {
    const eligibleOnJanuaryFirst = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1960-01-01",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "3000",
      qualifiedMedicalExpenses: "1000",
    }, constants);
    const turns65AfterJanuaryFirst = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1960-01-02",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "3000",
      qualifiedMedicalExpenses: "1000",
    }, constants);

    expect(eligibleOnJanuaryFirst.line16.toNumber()).toBe(2000);
    expect(eligibleOnJanuaryFirst.line17aHasException).toBe(true);
    expect(eligibleOnJanuaryFirst.line17b.toNumber()).toBe(0);
    expect(turns65AfterJanuaryFirst.line16.toNumber()).toBe(2000);
    expect(turns65AfterJanuaryFirst.line17aHasException).toBe(false);
    expect(turns65AfterJanuaryFirst.line17b.toNumber()).toBe(400);
  });

  it("caps validated post-age-65 distributions at Line 16 for mid-year age-65 taxpayers", () => {
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1960-01-02",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "3000",
      qualifiedMedicalExpenses: "1000",
      distributionsAfterAge65: "5000",
    }, constants);

    expect(result.line16.toNumber()).toBe(2000);
    expect(result.line17aHasException).toBe(true);
    expect(result.line17b.toNumber()).toBe(0);
  });

  it("uses the spouse January 1 age-65 boundary on spouse-owned HSA forms", () => {
    const spouseEligibleOnJanuaryFirst = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1960-01-01",
      },
    }, {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "3000",
      qualifiedMedicalExpenses: "1000",
    }, constants);
    const spouseTurns65AfterJanuaryFirst = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1960-01-02",
      },
    }, {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "3000",
      qualifiedMedicalExpenses: "1000",
    }, constants);

    expect(spouseEligibleOnJanuaryFirst.line16.toNumber()).toBe(2000);
    expect(spouseEligibleOnJanuaryFirst.line17aHasException).toBe(true);
    expect(spouseEligibleOnJanuaryFirst.line17b.toNumber()).toBe(0);
    expect(spouseTurns65AfterJanuaryFirst.line16.toNumber()).toBe(2000);
    expect(spouseTurns65AfterJanuaryFirst.line17aHasException).toBe(false);
    expect(spouseTurns65AfterJanuaryFirst.line17b.toNumber()).toBe(400);
  });

  // ── Coverage change and proration tests ─────────────────

  it("prorates the limit when coverage changes mid-year and December has no HDHP", () => {
    // 6 months self-only + 3 months family + 3 months none → no LMR (Dec is none)
    // $4,300 × 6/12 + $8,550 × 3/12 = $2,150 + $2,137.50 = $4,287.50
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
        "family", "family", "family",
        "none", "none", "none",
      ],
      contributionsMade: "4288",
    }, constants);

    expect(result.coverageType).toBe("family");
    expect(result.line3.toNumber()).toBeCloseTo(4287.5, 0);
    expect(result.line13.toNumber()).toBeCloseTo(4287.5, 0);
  });

  it("applies the last-month rule over proration when December has family coverage", () => {
    // 6 months self-only + 6 months family → prorated = $6,425
    // But LMR applies (Dec is family) → full family limit $8,550 > $6,425
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
        "family", "family", "family", "family", "family", "family",
      ],
      contributionsMade: "8550",
    }, constants);

    expect(result.coverageType).toBe("family");
    expect(result.line3.toNumber()).toBe(8550);
    expect(result.line13.toNumber()).toBe(8550);
  });

  it("prorates the limit when coverage changes from family to self-only mid-year", () => {
    // 3 months family + 9 months self-only → $8,550 × 3/12 + $4,300 × 9/12 = $2,137.50 + $3,225 = $5,362.50
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "family", "family", "family",
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
        "self_only", "self_only", "self_only",
      ],
      contributionsMade: "5363",
    }, constants);

    expect(result.coverageType).toBe("family");
    expect(result.line3.toNumber()).toBeCloseTo(5362.5, 0);
    expect(result.line13.toNumber()).toBeCloseTo(5362.5, 0);
  });

  it("does not apply the last-month rule when December coverage is none", () => {
    // 6 months self-only (Jan-Jun) + 6 months none → $4,300 × 6/12 = $2,150
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
        "none", "none", "none", "none", "none", "none",
      ],
      contributionsMade: "2150",
    }, constants);

    expect(result.line3.toNumber()).toBe(2150);
    expect(result.line13.toNumber()).toBe(2150);
  });

  it("applies the last-month rule to boost a partial-year limit when eligible on December 1", () => {
    // Only Sep-Dec eligible with self-only → monthly worksheet = $4,300 × 4/12 = $1,433.33
    // Last-month rule: full year $4,300 because eligible on Dec 1
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "none", "none", "none", "none", "none", "none",
        "none", "none", "self_only", "self_only", "self_only", "self_only",
      ],
      contributionsMade: "4300",
    }, constants);

    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line8.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);
  });

  it("uses the December coverage type for the last-month rule annual limit", () => {
    // Mixed coverage: self-only Jan-Nov, family in Dec → last-month rule uses family $8,550
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
        "self_only", "self_only", "self_only", "self_only", "self_only", "family",
      ],
      contributionsMade: "8550",
    }, constants);

    // Monthly worksheet: $4,300/12 × 11 + $8,550/12 × 1 = $3,941.67 + $712.50 = $4,654.17
    // Last-month rule: $8,550 (family annual limit for December)
    // Line 3: max($4,654.17, $8,550) = $8,550
    expect(result.line3.toNumber()).toBe(8550);
    expect(result.line13.toNumber()).toBe(8550);
  });

  it("treats months as family coverage when the spouse had family HDHP coverage", () => {
    // Primary has self-only all year, but spouse had family coverage months 4-9
    // Those months are upgraded to family; Dec stays self-only → LMR gives $4,300
    // But prorated = $4,300 × 6/12 + $8,550 × 6/12 = $6,425, which exceeds LMR
    // So Line 3 = $6,425
    const result = calculateForm8889(mfjTaxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      spouseFamilyCoverageMonths: [4, 5, 6, 7, 8, 9],
      contributionsMade: "6425",
    }, constants);

    // Coverage type reflects the highest eligible coverage seen (family)
    expect(result.coverageType).toBe("family");
    // Prorated: 6 months self-only + 6 months treated as family
    // $4,300 × 6/12 + $8,550 × 6/12 = $2,150 + $4,275 = $6,425
    // LMR would give $4,300 (Dec is self-only), but prorated $6,425 > $4,300
    expect(result.line3.toNumber()).toBeCloseTo(6425, 0);
  });

  it("handles a single eligible month correctly with fractional proration", () => {
    // Only January with self-only → $4,300 × 1/12 = $358.33
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "self_only", "none", "none", "none", "none", "none",
        "none", "none", "none", "none", "none", "none",
      ],
      contributionsMade: "359",
    }, constants);

    expect(result.line3.toNumber()).toBeCloseTo(358.33, 1);
    expect(result.line13.toNumber()).toBeCloseTo(358.33, 1);
  });

  // ── Contribution limit and deduction cap tests ──────────

  it("caps the deduction at the contribution limit when contributions exceed the limit", () => {
    // Self-only limit $4,300, contribute $6,000 → deduction capped at $4,300
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "6000",
    }, constants);

    expect(result.line2.toNumber()).toBe(6000);
    expect(result.line8.toNumber()).toBe(4300);
    expect(result.line12.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);
  });

  it("allows the full deduction when contributions exactly equal the limit", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, constants);

    expect(result.line13.toNumber()).toBe(4300);
  });

  it("reduces the deductible room to zero when employer contributions fill the entire limit", () => {
    // Self-only limit $4,300, employer contributes $4,300 → no room for personal contributions
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "1000",
      employerContributions: "4300",
    }, constants);

    expect(result.line9.toNumber()).toBe(4300);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("floors the deductible room at zero when employer contributions exceed the limit", () => {
    // Self-only limit $4,300, employer contributes $5,000 → Line 12 floors at $0
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "500",
      employerContributions: "5000",
    }, constants);

    expect(result.line9.toNumber()).toBe(5000);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("reduces the deductible room for a qualified HSA funding distribution from an IRA", () => {
    // Self-only limit $4,300, IRA funding distribution $2,000 → room = $2,300
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "3000",
      qualifiedFundingDistribution: "2000",
    }, constants);

    expect(result.line10.toNumber()).toBe(2000);
    expect(result.line11.toNumber()).toBe(2000);
    expect(result.line12.toNumber()).toBe(2300);
    expect(result.line13.toNumber()).toBe(2300);
  });

  it("allows zero deduction when no contributions are made but distributions are present", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "2000",
      qualifiedMedicalExpenses: "2000",
    }, constants);

    expect(result.line2.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
    expect(result.line14a.toNumber()).toBe(2000);
    expect(result.line16.toNumber()).toBe(0);
  });

  // ── Filing status tests ─────────────────────────────────

  it("uses the same self-only limit for head of household as for single filers", () => {
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "head_of_household",
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, constants);

    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);
  });

  it("uses the same self-only limit for married filing separately as for single filers", () => {
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_separately",
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, constants);

    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);
  });

  it("uses the same family limit for qualifying surviving spouse as for single filers", () => {
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "qualifying_surviving_spouse",
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "8550",
    }, constants);

    expect(result.line3.toNumber()).toBe(8550);
    expect(result.line13.toNumber()).toBe(8550);
  });

  // ── MFJ spouse allocation tests ─────────────────────────

  it("splits the family limit equally when both MFJ spouses have HSAs with all family months", () => {
    // Both spouses have HSAs, family coverage all year
    // Family limit $8,550, each gets half = $4,275
    const result = calculateForm8889(mfjTaxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "4275",
      bothSpousesHaveHsas: true,
    }, constants);

    expect(result.line6.toNumber()).toBe(4275);
    expect(result.line8.toNumber()).toBe(4275);
    expect(result.line13.toNumber()).toBe(4275);
  });

  it("routes the catch-up to Line 7 for a married 56-year-old with family coverage", () => {
    // Married, age 56, family coverage → catch-up goes to Line 7, not Line 3
    const result = calculateForm8889({
      ...mfjTaxpayer,
      primary: {
        ...mfjTaxpayer.primary,
        dateOfBirth: "1969-06-15",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "9550",
      bothSpousesHaveHsas: true,
    }, constants);

    // Line 3 = $8,550 (no catch-up included for married with family months)
    expect(result.line3.toNumber()).toBe(8550);
    // Line 6 = $8,550 / 2 = $4,275 (spouse allocation)
    expect(result.line6.toNumber()).toBe(4275);
    // Line 7 = $1,000 (catch-up for age 55+ married with family coverage)
    expect(result.line7.toNumber()).toBe(1000);
    // Line 8 = $4,275 + $1,000 = $5,275
    expect(result.line8.toNumber()).toBe(5275);
    expect(result.line13.toNumber()).toBe(5275);
  });

  it("keeps catch-up on Line 3 for a single 56-year-old with self-only coverage", () => {
    // Single, age 56, self-only coverage → catch-up stays on Line 3
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1969-06-15",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "5300",
    }, constants);

    // Line 3 = $4,300 + $1,000 = $5,300 (catch-up included)
    expect(result.line3.toNumber()).toBe(5300);
    // Line 7 = $0 (not married or no family months)
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(5300);
    expect(result.line13.toNumber()).toBe(5300);
  });

  // ── Medicare proration tests ────────────────────────────

  it("reduces the eligible months when Medicare enrollment covers mid-year through December", () => {
    // Self-only all year, Medicare months 7-12 → 6 eligible months
    // $4,300 × 6/12 = $2,150
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      medicareMonths: [7, 8, 9, 10, 11, 12],
      contributionsMade: "2150",
    }, constants);

    expect(result.line3.toNumber()).toBe(2150);
    expect(result.line13.toNumber()).toBe(2150);
  });

  it("blocks the last-month rule when Medicare is enrolled in December even with eligible December HDHP", () => {
    // Self-only all year, Medicare only in December → 11 eligible months
    // Last-month rule cannot apply because Medicare in December
    // $4,300 × 11/12 ≈ $3,941.67
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      medicareMonths: [12],
      contributionsMade: "3942",
    }, constants);

    expect(result.line3.toNumber()).toBeCloseTo(3941.67, 0);
    expect(result.line13.toNumber()).toBeCloseTo(3941.67, 0);
  });

  // ── Distribution and penalty edge cases ─────────────────

  it("imposes no penalty when all distributions are used for qualified medical expenses", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      qualifiedMedicalExpenses: "5000",
    }, constants);

    expect(result.line14a.toNumber()).toBe(5000);
    expect(result.line15.toNumber()).toBe(5000);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17b.toNumber()).toBe(0);
  });

  it("applies the full 20% penalty when no medical expenses offset distributions", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      qualifiedMedicalExpenses: "0",
    }, constants);

    expect(result.line14a.toNumber()).toBe(5000);
    expect(result.line15.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(5000);
    expect(result.line17aHasException).toBe(false);
    expect(result.line17b.toNumber()).toBe(1000); // 20% of $5,000
  });

  it("applies the 20% penalty only on the portion not covered by medical expenses", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      qualifiedMedicalExpenses: "3000",
    }, constants);

    expect(result.line15.toNumber()).toBe(3000);
    expect(result.line16.toNumber()).toBe(2000);
    expect(result.line17b.toNumber()).toBe(400); // 20% of $2,000
  });

  it("exempts all distributions from the 20% penalty for a disabled beneficiary", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      qualifiedMedicalExpenses: "0",
      distributionsNotSubjectToAdditionalTax: "5000",
    }, constants);

    expect(result.line16.toNumber()).toBe(5000);
    expect(result.line17aHasException).toBe(true);
    expect(result.line17b.toNumber()).toBe(0);
  });

  it("excludes rollover distributions from the taxable amount", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "8000",
      rolloverDistributions: "3000",
      qualifiedMedicalExpenses: "2000",
    }, constants);

    // Line 14b = $3,000 (rollover), Line 14c = $5,000
    expect(result.line14b.toNumber()).toBe(3000);
    expect(result.line14c.toNumber()).toBe(5000);
    expect(result.line15.toNumber()).toBe(2000);
    expect(result.line16.toNumber()).toBe(3000);
  });

  it("caps excluded distributions at the gross distribution amount", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "2000",
      excludedDistributions: "5000",
    }, constants);

    // Line 14b is capped at Line 14a ($2,000)
    expect(result.line14b.toNumber()).toBe(2000);
    expect(result.line14c.toNumber()).toBe(0);
  });

  // ── Testing period and recapture tests ──────────────────

  it("computes recapture income when the last-month-rule testing period fails", () => {
    // Prior year used last-month rule to get $4,300 but only had 4 eligible months
    // Testing period failed → recapture = $4,300 - redetermined limit
    // Redetermined limit without LMR: $4,300 × 4/12 = $1,433.33
    // Recapture = $4,300 - $1,433.33 = $2,866.67
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      lastMonthRuleContributions: "4300",
      lastMonthRuleRedeterminedLimit: "1433",
    }, constants);

    expect(result.line18.toNumber()).toBe(2867); // $4,300 - $1,433
    expect(result.line20.toNumber()).toBe(2867);
    expect(result.line21.toNumber()).toBeCloseTo(286.70, 1); // 10% of $2,867
  });

  it("does not trigger recapture when the testing period failure is due to death or disability", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      lastMonthRuleContributions: "4300",
      lastMonthRuleRedeterminedLimit: "1433",
      testingPeriodFailureDueToDeathOrDisability: true,
    }, constants);

    expect(result.line18.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
    expect(result.line21.toNumber()).toBe(0);
  });

  it("recaptures a qualified HSA funding distribution when the testing period fails", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      recaptureQualifiedFundingDistribution: "2000",
    }, constants);

    expect(result.line19.toNumber()).toBe(2000);
    expect(result.line20.toNumber()).toBe(2000);
    // Printed Form8889 line21 = 10% of line20, including funding recapture.
    expect(result.line21.toString()).toBe("200");
  });

  it("suppresses qualified HSA funding distribution recapture when death or disability applies", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      recaptureQualifiedFundingDistribution: "2000",
      testingPeriodFailureDueToDeathOrDisability: true,
    }, constants);

    expect(result.line19.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
  });

  it("combines last-month-rule recapture and qualified funding distribution recapture", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      lastMonthRuleContributions: "4300",
      lastMonthRuleRedeterminedLimit: "2150",
      recaptureQualifiedFundingDistribution: "1500",
    }, constants);

    expect(result.line18.toNumber()).toBe(2150); // $4,300 - $2,150
    expect(result.line19.toNumber()).toBe(1500);
    expect(result.line20.toNumber()).toBe(3650); // $2,150 + $1,500
    expect(result.line21.toString()).toBe("365"); // 10% of actual line20 $3,650.
  });

  // ── Interaction and integration tests ───────────────────

  it("allows full family deduction for a single filer with family HDHP coverage", () => {
    // Single filers can have family HDHP coverage (e.g., covering dependents)
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "8550",
    }, constants);

    expect(result.line3.toNumber()).toBe(8550);
    expect(result.line13.toNumber()).toBe(8550);
  });

  it("handles both contributions and distributions in the same year", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
      distributionsReceived: "2000",
      qualifiedMedicalExpenses: "1500",
    }, constants);

    // Contributions
    expect(result.line13.toNumber()).toBe(4300);
    // Distributions
    expect(result.line14a.toNumber()).toBe(2000);
    expect(result.line15.toNumber()).toBe(1500);
    expect(result.line16.toNumber()).toBe(500);
    expect(result.line17b.toNumber()).toBe(100); // 20% of $500
  });

  it("limits medical expense offset to net distributions (Line 14c), not gross", () => {
    // Gross $5,000, excluded $2,000, net $3,000, medical $4,000
    // Medical offset limited to $3,000 (net distributions)
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      excludedDistributions: "2000",
      qualifiedMedicalExpenses: "4000",
    }, constants);

    expect(result.line14c.toNumber()).toBe(3000);
    expect(result.line15.toNumber()).toBe(3000);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17b.toNumber()).toBe(0);
  });

  it("handles the partial-year catch-up for a married 57-year-old with family coverage only part of the year", () => {
    // Married, age 57, family coverage months 1-6 then self-only months 7-12
    // Catch-up goes to Line 7 (because married + has family months)
    // Line 7 eligible family months = 6
    // Line 7 = $1,000 × 6/12 = $500
    const result = calculateForm8889({
      ...mfjTaxpayer,
      primary: {
        ...mfjTaxpayer.primary,
        dateOfBirth: "1968-02-20",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: [
        "family", "family", "family", "family", "family", "family",
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
      ],
      contributionsMade: "6925",
    }, constants);

    // Line 3 = $8,550 × 6/12 + $4,300 × 6/12 = $4,275 + $2,150 = $6,425
    // (no catch-up on Line 3 because married and has family months)
    expect(result.line3.toNumber()).toBeCloseTo(6425, 0);
    // Line 7 = $1,000 × 6/12 = $500
    expect(result.line7.toNumber()).toBeCloseTo(500, 0);
    // Line 8 = $6,425 + $500 = $6,925
    expect(result.line8.toNumber()).toBeCloseTo(6925, 0);
  });

  // ── Zero-eligible-month boundary ───────────────────────

  it("zeroes the contribution limit when all 12 months have Medicare enrollment", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      medicareMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      contributionsMade: "4300",
    }, constants);

    // All months disqualified by Medicare → 0 eligible months → $0 limit
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("produces zero across all lines when no contributions, no distributions, and no coverage", () => {
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("none"),
      contributionsMade: "0",
    }, constants);

    expect(result.coverageType).toBe("none");
    expect(result.line2.toNumber()).toBe(0);
    expect(result.line3.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
    expect(result.line14a.toNumber()).toBe(0);
    expect(result.line16.toNumber()).toBe(0);
    expect(result.line17b.toNumber()).toBe(0);
  });

  // ── Contribution limit boundary precision ──────────────

  it("caps the deduction at the limit when contributions exceed it by exactly $1", () => {
    // Self-only limit $4,300 → contribute $4,301 → deduction = $4,300
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4301",
    }, constants);

    expect(result.line2.toNumber()).toBe(4301);
    expect(result.line8.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);
  });

  it("allows a deduction of exactly $1 when employer contributions leave $1 of room", () => {
    // Self-only limit $4,300, employer contributes $4,299 → room = $1
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "100",
      employerContributions: "4299",
    }, constants);

    expect(result.line9.toNumber()).toBe(4299);
    expect(result.line12.toNumber()).toBe(1);
    expect(result.line13.toNumber()).toBe(1);
  });

  // ── Archer MSA interaction ─────────────────────────────

  it("reduces the HSA limit by Archer MSA contributions on Line 4", () => {
    // Self-only limit $4,300, Archer MSA $1,500 → Line 5 = $2,800
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "2800",
      archerMSAContributions: "1500",
    }, constants);

    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line4.toNumber()).toBe(1500);
    expect(result.line5.toNumber()).toBe(2800);
    expect(result.line8.toNumber()).toBe(2800);
    expect(result.line13.toNumber()).toBe(2800);
  });

  it("floors Line 5 at zero when Archer MSA contributions exceed the HSA limit", () => {
    // Self-only limit $4,300, Archer MSA $5,000 → Line 5 = $0
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "1000",
      archerMSAContributions: "5000",
    }, constants);

    expect(result.line3.toNumber()).toBe(4300);
    expect(result.line4.toNumber()).toBe(5000);
    expect(result.line5.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  // ── MFS with family HDHP coverage ─────────────────────

  it("treats MFS as married for Line 7 catch-up routing with family coverage", () => {
    // MFS, age 56, family coverage → catch-up goes to Line 7 (married path)
    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_separately",
      primary: {
        ...simpleW2Fixture.taxpayer.primary,
        dateOfBirth: "1969-06-15",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "9550",
    }, constants);

    // MFS is married → catch-up deferred to Line 7
    expect(result.line3.toNumber()).toBe(8550);
    expect(result.line7.toNumber()).toBe(1000);
    expect(result.line8.toNumber()).toBe(9550);
    expect(result.line13.toNumber()).toBe(9550);
  });

  // ── Spouse allocation with custom override ─────────────

  it("allows a custom spouse allocation override via spouseAllocatedLimit", () => {
    // Both spouses have HSAs, family coverage → default split = $8,550 / 2 = $4,275
    // Override: primary gets $6,000 of the family limit
    const result = calculateForm8889(mfjTaxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "6000",
      bothSpousesHaveHsas: true,
      spouseAllocatedLimit: "6000",
    }, constants);

    expect(result.line6.toNumber()).toBe(6000);
    expect(result.line8.toNumber()).toBe(6000);
    expect(result.line13.toNumber()).toBe(6000);
  });

  it("caps the spouse allocation override at Line 5", () => {
    // Family limit $8,550 → Line 5 = $8,550
    // Override requests $10,000 → capped at $8,550
    const result = calculateForm8889(mfjTaxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "8550",
      bothSpousesHaveHsas: true,
      spouseAllocatedLimit: "10000",
    }, constants);

    expect(result.line6.toNumber()).toBe(8550);
    expect(result.line8.toNumber()).toBe(8550);
  });

  // ── Spouse allocation with mixed coverage months ───────

  it("splits only the family-coverage portion when mixed self-only and family months apply", () => {
    // 6 months family + 6 months self-only → family portion prorated
    // Family Line 3 = $8,550 × 6/12 = $4,275
    // Self-only months contribute to otherContributionLimit
    // Self-only Line 3 portion = $4,300 × 6/12 = $2,150
    // Total Line 3 = $4,275 + $2,150 = $6,425
    // Family portion of Line 5 = $4,275, split = $4,275 / 2 = $2,137.50
    // Other limit = Line 5 - family Line 5 = $6,425 - $4,275 = $2,150
    // Line 6 = $2,137.50 + $2,150 = $4,287.50
    const result = calculateForm8889(mfjTaxpayer, {
      accountOwner: "primary",
      coverageByMonth: [
        "family", "family", "family", "family", "family", "family",
        "self_only", "self_only", "self_only", "self_only", "self_only", "self_only",
      ],
      contributionsMade: "4288",
      bothSpousesHaveHsas: true,
    }, constants);

    expect(result.line3.toNumber()).toBeCloseTo(6425, 0);
    expect(result.line6.toNumber()).toBeCloseTo(4287.5, 0);
  });

  // ── Both spouses 55+ with family HSAs ──────────────────

  it("adds Line 7 catch-up for a 56-year-old spouse on the spouse-owned Form 8889", () => {
    // Both spouses 56+, both have HSAs, family coverage
    // Each gets: Line 6 = $8,550/2 = $4,275, Line 7 = $1,000, Line 8 = $5,275
    const result = calculateForm8889({
      ...mfjTaxpayer,
      primary: {
        ...mfjTaxpayer.primary,
        dateOfBirth: "1969-06-15",
      },
      spouse: {
        ...mfjTaxpayer.spouse!,
        dateOfBirth: "1968-03-20",
      },
    }, {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "5275",
      bothSpousesHaveHsas: true,
    }, constants);

    expect(result.line6.toNumber()).toBe(4275);
    expect(result.line7.toNumber()).toBe(1000);
    expect(result.line8.toNumber()).toBe(5275);
    expect(result.line13.toNumber()).toBe(5275);
  });

  // ── Line 7 catch-up with last-month rule ───────────────

  it("expands Line 7 eligible family months to the full year when the last-month rule applies with family December coverage", () => {
    // Married, age 56, family coverage only in Dec → LMR applies
    // Line 7 eligible months expand to full year under LMR
    // Line 7 = $1,000 × 12/12 = $1,000
    const result = calculateForm8889({
      ...mfjTaxpayer,
      primary: {
        ...mfjTaxpayer.primary,
        dateOfBirth: "1969-06-15",
      },
    }, {
      accountOwner: "primary",
      coverageByMonth: [
        "none", "none", "none", "none", "none", "none",
        "none", "none", "none", "none", "none", "family",
      ],
      contributionsMade: "9550",
    }, constants);

    // LMR: full family limit $8,550 > prorated $8,550/12 = $712.50
    expect(result.line3.toNumber()).toBe(8550);
    // Line 7 uses full eligible year (12 months) under LMR with Dec family
    expect(result.line7.toNumber()).toBe(1000);
    expect(result.line8.toNumber()).toBe(9550);
    expect(result.line13.toNumber()).toBe(9550);
  });

  // ── Prohibited transaction distributions ───────────────

  it("keeps prohibited transaction distributions taxable even with sufficient medical expenses", () => {
    // $5,000 distributions, $2,000 is a prohibited transaction, $4,000 medical expenses
    // Prohibited transactions cannot be offset by medical expenses
    // Ordinary eligible = $5,000 - $2,000 = $3,000
    // Medical offset = min($3,000, $4,000) = $3,000
    // Line 16 = $5,000 - $3,000 = $2,000 (the prohibited amount stays taxable)
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "5000",
      prohibitedTransactionDistributions: "2000",
      qualifiedMedicalExpenses: "4000",
    }, constants);

    expect(result.line14a.toNumber()).toBe(5000);
    expect(result.line15.toNumber()).toBe(3000);
    expect(result.line16.toNumber()).toBe(2000);
  });

  // ── Returned excess contributions via 1099-SA ──────────

  it("excludes returned excess contributions from the taxable distribution via supported 1099-SA", () => {
    // $3,000 gross distributions, $500 returned excess via 1099-SA code 2
    // Net taxable = $3,000 - $500 = $2,500
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "3000",
      supported1099SAReturnedExcessContributions: "500",
      qualifiedMedicalExpenses: "1000",
    }, constants);

    expect(result.line14a.toNumber()).toBe(3000);
    expect(result.line14b.toNumber()).toBe(500);
    expect(result.line14c.toNumber()).toBe(2500);
    expect(result.line15.toNumber()).toBe(1000);
    expect(result.line16.toNumber()).toBe(1500);
  });

  // ── Estate death distributions cannot offset Line 15 ───

  it("prevents estate-beneficiary death distributions from offsetting qualified medical expenses", () => {
    // $10,000 gross distributions, $5,000 is an estate death distribution
    // Estate death distributions cannot use the special Line 15 offset
    // Only the remaining $5,000 can be offset by medical expenses
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      distributionsReceived: "10000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "5000",
      qualifiedMedicalExpenses: "8000",
    }, constants);

    expect(result.line14a.toNumber()).toBe(10000);
    // Medical offset limited because $5,000 estate portion is ineligible
    expect(result.line15.toNumber()).toBe(5000);
    expect(result.line16.toNumber()).toBe(5000);
  });

  // ── Prior year redetermined limit worksheet ────────────

  it("computes recapture income using the supported prior-year redetermined limit worksheet", () => {
    // Prior year used LMR to get $4,150 (2024 self-only limit)
    // but actually only had 4 eligible months → redetermined = $4,150 × 4/12 = $1,383.33
    // Recapture = $4,150 - $1,383.33 = $2,766.67
    const result = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      priorYearRedeterminedLimitWorksheet: {
        coverageByMonth: [
          "self_only", "self_only", "self_only", "self_only",
          "none", "none", "none", "none",
          "none", "none", "none", "none",
        ],
        selfOnlyContributionLimit: "4150",
        familyContributionLimit: "8300",
        catchUpContribution: "1000",
      },
      lastMonthRuleContributions: "4150",
    }, constants);

    // Redetermined limit = $4,150 × 4/12 ≈ $1,383.33
    // Recapture = $4,150 - $1,383.33 ≈ $2,766.67
    expect(result.line18.toNumber()).toBeCloseTo(2766.67, 0);
    expect(result.line20.toNumber()).toBeCloseTo(2766.67, 0);
    expect(result.line21.toNumber()).toBeCloseTo(276.67, 0);
  });
});
