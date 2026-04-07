/**
 * Partner/Shareholder Basis Schedule — Edge Case Tests
 * Spec: spec/federal/partner-basis-schedule.yaml
 *
 * Tests boundary conditions for the basis limitation tier (first of three):
 * - Distribution excess exactly at basis boundary (IRC §731/§1368 gain triggers)
 * - Pro-rata loss allocation with rounding correction
 * - §1367(a)(2)(B) election ordering differences
 * - Debt basis restoration vs loss absorption interactions
 * - Prior suspended losses combined with current-year losses at exact basis limits
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculatePartnerBasisSchedule } from "@/engine/forms/partner-basis-schedule.js";
import type { ScheduleK1 } from "@/models/inputs.js";

function k1(overrides: Partial<ScheduleK1> = {}): ScheduleK1 {
  return {
    partnershipName: overrides.partnershipName ?? "Test Entity",
    partnershipEIN: overrides.partnershipEIN ?? "12-3456789",
    ordinaryIncome: overrides.ordinaryIncome ?? "0",
    netRentalIncome: overrides.netRentalIncome ?? "0",
    otherNetRentalIncome: overrides.otherNetRentalIncome ?? "0",
    guaranteedPayments: overrides.guaranteedPayments ?? "0",
    interestIncome: overrides.interestIncome ?? "0",
    ordinaryDividends: overrides.ordinaryDividends ?? "0",
    qualifiedDividends: overrides.qualifiedDividends ?? "0",
    royalties: overrides.royalties ?? "0",
    netShortTermCapitalGain: overrides.netShortTermCapitalGain ?? "0",
    netLongTermCapitalGain: overrides.netLongTermCapitalGain ?? "0",
    unrecapturedSection1250Gain: overrides.unrecapturedSection1250Gain ?? "0",
    collectiblesGain: overrides.collectiblesGain ?? "0",
    section1231Gain: overrides.section1231Gain ?? "0",
    otherIncome: overrides.otherIncome ?? "0",
    section179Deduction: overrides.section179Deduction ?? "0",
    otherDeductions: overrides.otherDeductions ?? "0",
    charitableCash: overrides.charitableCash ?? "0",
    charitableCapitalGain30: overrides.charitableCapitalGain30 ?? "0",
    charitableCapitalGain20: overrides.charitableCapitalGain20 ?? "0",
    investmentInterestExpense: overrides.investmentInterestExpense ?? "0",
    excessBusinessInterest: overrides.excessBusinessInterest ?? "0",
    selfEmploymentEarnings: overrides.selfEmploymentEarnings ?? "0",
    foreignTaxPaid: overrides.foreignTaxPaid ?? "0",
    foreignTaxCategory: overrides.foreignTaxCategory ?? "general",
    taxExemptInterest: overrides.taxExemptInterest ?? "0",
    otherTaxExemptIncome: overrides.otherTaxExemptIncome ?? "0",
    nondeductibleExpenses: overrides.nondeductibleExpenses ?? "0",
    distributions: overrides.distributions ?? "0",
    isPassiveActivity: overrides.isPassiveActivity ?? false,
    isForeignPartnership: overrides.isForeignPartnership ?? false,
    entityType: overrides.entityType ?? "partnership",
    beginningBasis: overrides.beginningBasis ?? "0",
    priorSuspendedLosses: overrides.priorSuspendedLosses,
    election1367: overrides.election1367 ?? false,
    beginningDebtBasis: overrides.beginningDebtBasis,
    additionalLoansToScorp: overrides.additionalLoansToScorp,
    priorDebtBasisReduction: overrides.priorDebtBasisReduction,
  };
}

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Distribution excess at exact basis boundary
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - distribution excess at basis boundary", () => {
  it("distributions $1 over basis triggers $1 capital gain (IRC §731)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      distributions: "50001",
    }));
    expect(result.excessDistributionGain).toEqual(d(1));
    expect(result.basisAfterDistributions).toEqual(d(0));
  });

  it("distributions exactly equal basis produces zero gain and zero remaining basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      distributions: "50000",
    }));
    expect(result.excessDistributionGain).toEqual(d(0));
    expect(result.basisAfterDistributions).toEqual(d(0));
  });

  it("distributions $1 under basis leaves $1 remaining, no gain", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      distributions: "49999",
    }));
    expect(result.excessDistributionGain).toEqual(d(0));
    expect(result.basisAfterDistributions).toEqual(d(1));
  });

  it("distributions against income-increased basis: income raises basis before distribution test", () => {
    // Beginning = $20,000, income = $30,000, distribution = $49,999
    // Basis before decreases = $50,000 → distribution = $49,999 → no excess gain
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "20000",
      ordinaryIncome: "30000",
      distributions: "49999",
    }));
    expect(result.basisBeforeDecreases).toEqual(d(50000));
    expect(result.excessDistributionGain).toEqual(d(0));
    expect(result.basisAfterDistributions).toEqual(d(1));
  });

  it("S-corp distribution excess triggers IRC §1368 gain (not §731)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
      distributions: "15000",
    }));
    expect(result.excessDistributionGain).toEqual(d(5000));
    expect(result.entityType).toBe("s_corporation");
  });
});

// ═══════════════════════════════════════════════════════════
// Losses exactly at basis boundary
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - losses at exact basis boundary", () => {
  it("total losses exactly equal available basis: all allowed, zero suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "40000",
      ordinaryIncome: "-40000",
    }));
    expect(result.totalAllowedLosses).toEqual(d(40000));
    expect(result.totalSuspendedLosses).toEqual(d(0));
    expect(result.endingBasis).toEqual(d(0));
  });

  it("total losses $1 over basis: $1 suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "40000",
      ordinaryIncome: "-40001",
    }));
    expect(result.totalAllowedLosses).toEqual(d(40000));
    expect(result.totalSuspendedLosses).toEqual(d(1));
    expect(result.endingBasis).toEqual(d(0));
    expect(result.suspendedLossCarryforward.ordinary).toEqual(d(1));
  });

  it("$1 basis allows $1 of a $100K loss", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "1",
      ordinaryIncome: "-100000",
    }));
    expect(result.totalAllowedLosses).toEqual(d(1));
    expect(result.totalSuspendedLosses).toEqual(d(99999));
  });

  it("zero basis suspends entire loss", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      ordinaryIncome: "-50000",
    }));
    expect(result.totalAllowedLosses).toEqual(d(0));
    expect(result.totalSuspendedLosses).toEqual(d(50000));
    expect(result.endingBasis).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// Nondeductible expenses consuming basis before losses
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - nondeductible expenses vs loss ordering", () => {
  it("nondeductible expenses consume all basis leaving nothing for losses (standard ordering)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      nondeductibleExpenses: "10000",
      ordinaryIncome: "-5000",
    }));
    // Standard: nondeductible first → basis goes to 0 → loss fully suspended
    expect(result.basisAfterNondeductible).toEqual(d(0));
    expect(result.totalAllowedLosses).toEqual(d(0));
    expect(result.totalSuspendedLosses).toEqual(d(5000));
  });

  it("nondeductible $1 less than basis leaves $1 for losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      nondeductibleExpenses: "9999",
      ordinaryIncome: "-5000",
    }));
    expect(result.basisAfterNondeductible).toEqual(d(1));
    expect(result.totalAllowedLosses).toEqual(d(1));
    expect(result.totalSuspendedLosses).toEqual(d(4999));
  });

  it("nondeductible expenses exceeding basis are suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "5000",
      nondeductibleExpenses: "8000",
    }));
    expect(result.basisAfterNondeductible).toEqual(d(0));
    expect(result.suspendedNondeductible).toEqual(d(3000));
  });
});

// ═══════════════════════════════════════════════════════════
// §1367(a)(2)(B) election: losses before nondeductible
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - §1367(a)(2)(B) election ordering", () => {
  it("election reverses order: losses consume basis before nondeductible expenses", () => {
    // With election: losses first → $5K loss reduces $10K basis to $5K → nondeductible = $5K
    // Without election: nondeductible first → $10K-$5K = $5K → losses allowed from $5K
    const resultElection = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      election1367: true,
      beginningBasis: "10000",
      nondeductibleExpenses: "5000",
      ordinaryIncome: "-8000",
    }));
    // Losses first: $8K allowed, basis = $2K, then nondeductible $5K → $3K suspended
    expect(resultElection.totalAllowedLosses).toEqual(d(8000));
    expect(resultElection.totalSuspendedLosses).toEqual(d(0));
    expect(resultElection.suspendedNondeductible).toEqual(d(3000));
    expect(resultElection.endingBasis).toEqual(d(0));

    const resultStandard = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      election1367: false,
      beginningBasis: "10000",
      nondeductibleExpenses: "5000",
      ordinaryIncome: "-8000",
    }));
    // Standard: nondeductible first → basis = $5K → losses allowed $5K, $3K suspended
    expect(resultStandard.totalAllowedLosses).toEqual(d(5000));
    expect(resultStandard.totalSuspendedLosses).toEqual(d(3000));
    expect(resultStandard.suspendedNondeductible).toEqual(d(0));
    expect(resultStandard.endingBasis).toEqual(d(0));
  });

  it("election has no effect when partnership (only applies to S-corps)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "partnership",
      election1367: true, // should be ignored
      beginningBasis: "10000",
      nondeductibleExpenses: "5000",
      ordinaryIncome: "-8000",
    }));
    // Partnership always uses standard ordering
    expect(result.totalAllowedLosses).toEqual(d(5000));
    expect(result.totalSuspendedLosses).toEqual(d(3000));
  });
});

// ═══════════════════════════════════════════════════════════
// Pro-rata loss allocation edge cases
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - pro-rata loss allocation edge cases", () => {
  it("two equal loss categories split basis exactly 50/50", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "-10000",
      netRentalIncome: "-10000",
    }));
    // Total losses = $20K, basis = $10K → each gets $5K
    expect(result.totalAllowedLosses).toEqual(d(10000));
    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const rental = result.lossCategories.find(c => c.key === "rental");
    expect(ordinary?.allowed).toEqual(d(5000));
    expect(rental?.allowed).toEqual(d(5000));
    expect(ordinary?.suspended).toEqual(d(5000));
    expect(rental?.suspended).toEqual(d(5000));
  });

  it("three unequal categories: rounding correction applied to largest", () => {
    // $7K ordinary, $2K rental, $1K STCL = $10K total. Basis = $3.
    // Pro-rata: ordinary gets 7/10×3 = 2.1 → rounds to 2
    //           rental gets 2/10×3 = 0.6 → rounds to 1
    //           STCL gets 1/10×3 = 0.3 → rounds to 0
    // Sum = 3 ✓ (rounding correction adjusts largest if needed)
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "3",
      ordinaryIncome: "-7000",
      netRentalIncome: "-2000",
      netShortTermCapitalGain: "-1000",
    }));
    expect(result.totalAllowedLosses).toEqual(d(3));
    // Sum of all allowed must equal basis exactly
    const totalAllowed = result.lossCategories.reduce(
      (sum, c) => sum.plus(c.allowed), d(0)
    );
    expect(totalAllowed).toEqual(d(3));
  });

  it("single loss category: no pro-rata needed, full basis applied", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "15000",
      ordinaryIncome: "-30000",
    }));
    expect(result.totalAllowedLosses).toEqual(d(15000));
    expect(result.totalSuspendedLosses).toEqual(d(15000));
    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    expect(ordinary?.allowed).toEqual(d(15000));
    expect(ordinary?.suspended).toEqual(d(15000));
  });
});

// ═══════════════════════════════════════════════════════════
// Prior suspended losses combined with current-year losses
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - prior suspended losses interact with current losses", () => {
  it("prior suspended + current loss exceeds basis: combined pro-rata allocation", () => {
    // Prior ordinary suspended: $10K. Current ordinary loss: $5K. Total = $15K.
    // Prior rental suspended: $5K. Current rental loss: $0. Total = $5K.
    // Grand total = $20K. Basis = $10K.
    // Ordinary: 15/20 × 10K = $7,500. Rental: 5/20 × 10K = $2,500.
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "-5000",
      priorSuspendedLosses: {
        ordinary: "10000",
        rental: "5000",
      },
    }));
    expect(result.totalLosses).toEqual(d(20000));
    expect(result.totalAllowedLosses).toEqual(d(10000));
    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const rental = result.lossCategories.find(c => c.key === "rental");
    expect(ordinary?.allowed).toEqual(d(7500));
    expect(rental?.allowed).toEqual(d(2500));
  });

  it("prior suspended losses fully allowed when basis is sufficient", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "100000",
      ordinaryIncome: "-5000",
      priorSuspendedLosses: {
        ordinary: "20000",
      },
    }));
    // Total ordinary = $25K (prior $20K + current $5K), basis = $100K
    expect(result.totalAllowedLosses).toEqual(d(25000));
    expect(result.totalSuspendedLosses).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// S-Corp debt basis edge cases
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - S-Corp debt basis edge cases", () => {
  it("excess losses exactly equal debt basis: all absorbed, zero ending debt basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "5000",
      ordinaryIncome: "-15000",
      beginningDebtBasis: "10000",
    }));
    // Stock basis: $5K allows $5K loss. $10K suspended.
    // Debt basis: $10K absorbs $10K suspended. Zero remaining.
    expect(result.debtBasis?.lossesAppliedToDebtBasis).toEqual(d(10000));
    expect(result.debtBasis?.endingDebtBasis).toEqual(d(0));
    expect(result.totalSuspendedLosses).toEqual(d(0));
    expect(result.totalAllowedLosses).toEqual(d(15000));
  });

  it("excess losses $1 over debt basis: $1 still suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "5000",
      ordinaryIncome: "-15001",
      beginningDebtBasis: "10000",
    }));
    expect(result.debtBasis?.lossesAppliedToDebtBasis).toEqual(d(10000));
    expect(result.debtBasis?.endingDebtBasis).toEqual(d(0));
    expect(result.totalSuspendedLosses).toEqual(d(1));
    expect(result.totalAllowedLosses).toEqual(d(15000));
  });

  it("debt basis restoration exactly equals prior reduction", () => {
    // Income year: net increase restores debt basis that was previously reduced
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
      ordinaryIncome: "20000",
      beginningDebtBasis: "5000",
      priorDebtBasisReduction: "8000",
    }));
    // Net increase = ending basis - beginning basis. Ending stock = $10K+$20K = $30K.
    // Net increase = max(0, $30K - $10K) = $20K.
    // Restoration = min($20K, $8K) = $8K (limited by prior reduction).
    // Ending stock = $30K - $8K = $22K.
    // Ending debt = $5K + $8K = $13K.
    expect(result.debtBasis?.restoration).toEqual(d(8000));
    expect(result.debtBasis?.endingDebtBasis).toEqual(d(13000));
    expect(result.debtBasis?.debtBasisReductionCarryforward).toEqual(d(0));
    expect(result.endingBasis).toEqual(d(22000));
  });

  it("partial debt restoration when net increase is less than prior reduction", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
      ordinaryIncome: "3000",
      beginningDebtBasis: "5000",
      priorDebtBasisReduction: "8000",
    }));
    // Net increase = $13K - $10K = $3K. Restoration = min($3K, $8K) = $3K.
    // Ending stock = $13K - $3K = $10K.
    // Ending debt = $5K + $3K = $8K.
    // Remaining reduction carryforward = $8K - $3K = $5K.
    expect(result.debtBasis?.restoration).toEqual(d(3000));
    expect(result.debtBasis?.endingDebtBasis).toEqual(d(8000));
    expect(result.debtBasis?.debtBasisReductionCarryforward).toEqual(d(5000));
    expect(result.endingBasis).toEqual(d(10000));
  });

  it("no debt basis result when S-corp but beginningDebtBasis not provided", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "5000",
      ordinaryIncome: "-10000",
    }));
    expect(result.debtBasis).toBeUndefined();
    expect(result.totalSuspendedLosses).toEqual(d(5000));
  });

  it("partnership ignores debt basis fields entirely", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "partnership",
      beginningBasis: "5000",
      ordinaryIncome: "-10000",
      beginningDebtBasis: "50000",
    }));
    expect(result.debtBasis).toBeUndefined();
    expect(result.totalSuspendedLosses).toEqual(d(5000));
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward accuracy
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - suspended loss carryforward categories", () => {
  it("multiple loss categories suspended: each tracks independently", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      ordinaryIncome: "-10000",
      netRentalIncome: "-5000",
      netLongTermCapitalGain: "-3000",
      section179Deduction: "2000",
    }));
    // All suspended — zero basis
    expect(result.suspendedLossCarryforward.ordinary).toEqual(d(10000));
    expect(result.suspendedLossCarryforward.rental).toEqual(d(5000));
    expect(result.suspendedLossCarryforward.longTermCapital).toEqual(d(3000));
    expect(result.suspendedLossCarryforward.section179).toEqual(d(2000));
    expect(result.suspendedLossCarryforward.shortTermCapital).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// Tax-exempt income increases basis
// ═══════════════════════════════════════════════════════════

describe("Basis Schedule - tax-exempt income edge cases", () => {
  it("tax-exempt interest and other tax-exempt income both increase basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      taxExemptInterest: "5000",
      otherTaxExemptIncome: "3000",
    }));
    expect(result.totalIncomeItems).toEqual(d(8000));
    expect(result.endingBasis).toEqual(d(8000));
  });

  it("tax-exempt income provides basis for loss deduction that would otherwise be suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      taxExemptInterest: "10000",
      ordinaryIncome: "-10000",
    }));
    // Exempt income creates $10K basis, loss consumes it
    expect(result.totalAllowedLosses).toEqual(d(10000));
    expect(result.totalSuspendedLosses).toEqual(d(0));
    expect(result.endingBasis).toEqual(d(0));
  });
});
