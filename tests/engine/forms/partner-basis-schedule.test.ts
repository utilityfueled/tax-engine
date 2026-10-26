/**
 * Tests for Partner/Shareholder Basis Schedule
 * Spec: spec/federal/partner-basis-schedule.yaml
 *
 * Covers IRC §705 (partnerships) and IRC §1367 (S-corporations).
 * First tier of the three-tier loss limitation stack:
 *   1. Basis limitation (this module)
 *   2. At-risk limitation (Form 6198)
 *   3. Passive activity limitation (Form 8582)
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculatePartnerBasisSchedule } from "@/engine/forms/partner-basis-schedule.js";
import type { ScheduleK1 } from "@/models/inputs.js";

function k1(overrides: Partial<ScheduleK1> = {}): ScheduleK1 {
  return {
    partnershipName: overrides.partnershipName ?? "Test Partnership",
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

describe("Partner/Shareholder Basis Schedule", () => {
  // ── Beginning Basis ──────────────────────────────────────────

  it("beginning basis flows to computation", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
    }));
    expect(result.beginningBasis).toEqual(new Decimal(50000));
    expect(result.endingBasis).toEqual(new Decimal(50000));
  });

  it("negative beginning basis is floored at zero", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "-5000",
    }));
    expect(result.beginningBasis).toEqual(new Decimal(0));
  });

  // ── Income Items (Increases) ──────────────────────────────────

  it("income items increase basis correctly", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "20000",
      interestIncome: "1500",
      ordinaryDividends: "2000",
      netLongTermCapitalGain: "5000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(28500));
    expect(result.basisBeforeDecreases).toEqual(new Decimal(38500));
    expect(result.endingBasis).toEqual(new Decimal(38500));
  });

  it("guaranteed payments increase basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      guaranteedPayments: "15000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(25000));
  });

  it("tax-exempt income increases basis (Box 18 Codes A and B)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      taxExemptInterest: "3000",
      otherTaxExemptIncome: "2000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(5000));
    expect(result.endingBasis).toEqual(new Decimal(15000));
  });

  it("royalties and section 1231 gains increase basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "5000",
      royalties: "8000",
      section1231Gain: "12000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(20000));
    expect(result.endingBasis).toEqual(new Decimal(25000));
  });

  it("negative income boxes do not increase basis (only losses side)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "-5000", // This is a loss, not income
      interestIncome: "3000",
    }));
    // Ordinary income is negative → 0 increase, but creates a loss
    expect(result.totalIncomeItems).toEqual(new Decimal(3000));
    expect(result.basisBeforeDecreases).toEqual(new Decimal(13000));
  });

  it("short-term and long-term capital gains both increase basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "20000",
      netShortTermCapitalGain: "3000",
      netLongTermCapitalGain: "7000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(10000));
    expect(result.endingBasis).toEqual(new Decimal(30000));
  });

  it("net rental income and other net rental income increase basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      netRentalIncome: "6000",
      otherNetRentalIncome: "4000",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(10000));
    expect(result.endingBasis).toEqual(new Decimal(20000));
  });

  it("other income (Box 11) increases basis when positive", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      otherIncome: "2500",
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(2500));
    expect(result.endingBasis).toEqual(new Decimal(12500));
  });

  // ── Distributions ─────────────────────────────────────────────

  it("distributions reduce basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      distributions: "20000",
    }));
    expect(result.totalDistributions).toEqual(new Decimal(20000));
    expect(result.basisAfterDistributions).toEqual(new Decimal(30000));
    expect(result.excessDistributionGain).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(30000));
  });

  it("excess distributions produce capital gain (IRC §731 partnership)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "30000",
      distributions: "45000",
    }));
    expect(result.basisAfterDistributions).toEqual(new Decimal(0));
    expect(result.excessDistributionGain).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("excess distributions produce capital gain (IRC §1368 S-corp)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "20000",
      distributions: "35000",
    }));
    expect(result.entityType).toBe("s_corporation");
    expect(result.excessDistributionGain).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("distributions exactly equal basis produces zero gain and zero remaining", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "40000",
      distributions: "40000",
    }));
    expect(result.basisAfterDistributions).toEqual(new Decimal(0));
    expect(result.excessDistributionGain).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("distributions against basis increased by current-year income", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "30000",
      distributions: "35000",
    }));
    // Income increases basis to 40000, then distributions of 35000
    expect(result.basisBeforeDecreases).toEqual(new Decimal(40000));
    expect(result.basisAfterDistributions).toEqual(new Decimal(5000));
    expect(result.excessDistributionGain).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(5000));
  });

  // ── Nondeductible Expenses ───────────────────────────────────

  it("nondeductible expenses reduce basis before losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      nondeductibleExpenses: "10000",
    }));
    expect(result.totalNondeductibleExpenses).toEqual(new Decimal(10000));
    expect(result.basisAfterNondeductible).toEqual(new Decimal(40000));
    expect(result.endingBasis).toEqual(new Decimal(40000));
  });

  it("nondeductible expenses exceeding remaining basis are suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "20000",
      distributions: "15000",
      nondeductibleExpenses: "8000",
    }));
    // After distributions: 5000. Nondeductible: 8000 → 5000 used, 3000 suspended
    expect(result.basisAfterNondeductible).toEqual(new Decimal(0));
    expect(result.suspendedNondeductible).toEqual(new Decimal(3000));
  });

  it("nondeductible expenses reduce basis available for losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      nondeductibleExpenses: "30000",
      ordinaryIncome: "-15000",
    }));
    // After nondeductible: 20000. Loss of 15000 is fully allowed
    expect(result.basisAfterNondeductible).toEqual(new Decimal(20000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(5000));
  });

  // ── Losses and Pro-Rata Allocation ──────────────────────────

  it("sufficient basis allows all losses without pro-rata", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "100000",
      ordinaryIncome: "-20000",
      netRentalIncome: "-5000",
      section179Deduction: "10000",
    }));
    expect(result.totalLosses).toEqual(new Decimal(35000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(35000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(65000));
  });

  it("losses exceeding basis are suspended", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "-25000",
    }));
    expect(result.totalLosses).toEqual(new Decimal(25000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(10000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("pro-rata allocation distributes losses proportionally", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
      ordinaryIncome: "-6000", // 60% of total losses
      netRentalIncome: "-4000", // 40% of total losses
    }));
    // Total losses = 10000, basis available = 10000 → all allowed
    expect(result.totalLosses).toEqual(new Decimal(10000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(10000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
  });

  it("pro-rata allocation when losses exceed basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "6000",
      ordinaryIncome: "-6000", // 60%
      netRentalIncome: "-4000", // 40%
    }));
    // Total losses = 10000, basis = 6000
    // Ordinary: 6000/10000 * 6000 = 3600 allowed, 2400 suspended
    // Rental: 4000/10000 * 6000 = 2400 allowed, 1600 suspended
    expect(result.totalLosses).toEqual(new Decimal(10000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(6000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(4000));

    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const rental = result.lossCategories.find(c => c.key === "rental");
    expect(ordinary!.allowed).toEqual(new Decimal(3600));
    expect(ordinary!.suspended).toEqual(new Decimal(2400));
    expect(rental!.allowed).toEqual(new Decimal(2400));
    expect(rental!.suspended).toEqual(new Decimal(1600));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("pro-rata with three categories", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "9000",
      ordinaryIncome: "-12000",
      netShortTermCapitalGain: "-6000",
      section179Deduction: "12000",
    }));
    // Total losses = 30000, basis = 9000
    // Each category: 12000/30000 * 9000 = 3600, 6000/30000 * 9000 = 1800
    expect(result.totalLosses).toEqual(new Decimal(30000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(9000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(21000));

    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const stcl = result.lossCategories.find(c => c.key === "shortTermCapital");
    const s179 = result.lossCategories.find(c => c.key === "section179");
    expect(ordinary!.allowed).toEqual(new Decimal(3600));
    expect(stcl!.allowed).toEqual(new Decimal(1800));
    expect(s179!.allowed).toEqual(new Decimal(3600));
  });

  it("charitable contributions reduce basis (semantic cash and capital-gain categories)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      charitableCash: "5000",
      charitableCapitalGain30: "3000",
      charitableCapitalGain20: "2000",
    }));
    const charitable = result.lossCategories.find(c => c.key === "charitable");
    expect(charitable!.total).toEqual(new Decimal(10000));
    expect(charitable!.allowed).toEqual(new Decimal(10000));
    expect(result.endingBasis).toEqual(new Decimal(40000));
  });

  it("investment interest expense reduces basis (Code H)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "30000",
      investmentInterestExpense: "5000",
    }));
    const invInt = result.lossCategories.find(c => c.key === "investmentInterest");
    expect(invInt!.total).toEqual(new Decimal(5000));
    expect(invInt!.allowed).toEqual(new Decimal(5000));
    expect(result.endingBasis).toEqual(new Decimal(25000));
  });

  it("excess business interest expense reduces basis (Box 13 Code K)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "20000",
      excessBusinessInterest: "8000",
    }));
    const ebie = result.lossCategories.find(c => c.key === "ebie");
    expect(ebie!.total).toEqual(new Decimal(8000));
    expect(ebie!.allowed).toEqual(new Decimal(8000));
    expect(result.endingBasis).toEqual(new Decimal(12000));
  });

  it("other deductions reduce basis (Box 13 aggregate)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "15000",
      otherDeductions: "3000",
    }));
    const other = result.lossCategories.find(c => c.key === "otherDeductions");
    expect(other!.total).toEqual(new Decimal(3000));
    expect(other!.allowed).toEqual(new Decimal(3000));
    expect(result.endingBasis).toEqual(new Decimal(12000));
  });

  it("section 1231 loss reduces basis (negative Box 10)", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "25000",
      section1231Gain: "-7000",
    }));
    const s1231 = result.lossCategories.find(c => c.key === "section1231");
    expect(s1231!.total).toEqual(new Decimal(7000));
    expect(s1231!.allowed).toEqual(new Decimal(7000));
    expect(result.endingBasis).toEqual(new Decimal(18000));
  });

  // ── Prior Suspended Losses ───────────────────────────────────

  it("prior-year suspended losses are included in current-year computation", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "30000",
      ordinaryIncome: "-5000",
      priorSuspendedLosses: {
        ordinary: "10000",
      },
    }));
    // Current loss 5000 + prior 10000 = 15000
    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    expect(ordinary!.total).toEqual(new Decimal(15000));
    expect(ordinary!.allowed).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(15000));
  });

  it("prior suspended losses participate in pro-rata when basis insufficient", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "5000",
      ordinaryIncome: "-3000",
      priorSuspendedLosses: {
        ordinary: "4000",
        rental: "3000",
      },
    }));
    // Total: ordinary 7000 + rental 3000 = 10000, basis = 5000
    // Ordinary: 7000/10000 * 5000 = 3500
    // Rental: 3000/10000 * 5000 = 1500
    expect(result.totalLosses).toEqual(new Decimal(10000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(5000));

    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const rental = result.lossCategories.find(c => c.key === "rental");
    expect(ordinary!.allowed).toEqual(new Decimal(3500));
    expect(ordinary!.suspended).toEqual(new Decimal(3500));
    expect(rental!.allowed).toEqual(new Decimal(1500));
    expect(rental!.suspended).toEqual(new Decimal(1500));
  });

  // ── Carryforward Output ──────────────────────────────────────

  it("suspended loss carryforward populates all categories", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "5000",
      ordinaryIncome: "-8000",
      netRentalIncome: "-4000",
      section179Deduction: "3000",
    }));
    // Total = 15000, basis = 5000
    const cf = result.suspendedLossCarryforward;
    expect(cf.ordinary.gt(0)).toBe(true);
    expect(cf.rental.gt(0)).toBe(true);
    expect(cf.section179.gt(0)).toBe(true);
    // Other categories should be zero
    expect(cf.shortTermCapital).toEqual(new Decimal(0));
    expect(cf.longTermCapital).toEqual(new Decimal(0));
    expect(cf.section1231).toEqual(new Decimal(0));
    expect(cf.charitable).toEqual(new Decimal(0));
    expect(cf.investmentInterest).toEqual(new Decimal(0));
    expect(cf.ebie).toEqual(new Decimal(0));
  });

  // ── Zero Basis Edge Cases ───────────────────────────────────

  it("zero beginning basis suspends all losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      ordinaryIncome: "-10000",
    }));
    expect(result.totalAllowedLosses).toEqual(new Decimal(0));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(10000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("zero basis with distributions produces gain and suspends all losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      ordinaryIncome: "-5000",
      distributions: "10000",
    }));
    expect(result.excessDistributionGain).toEqual(new Decimal(10000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(5000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("income restores basis for previously unavailable losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "0",
      ordinaryIncome: "20000",
      priorSuspendedLosses: {
        ordinary: "15000",
      },
    }));
    // Income restores basis to 20000, prior suspended 15000 is now allowed
    expect(result.totalIncomeItems).toEqual(new Decimal(20000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(5000));
  });

  // ── Each Box Category Participates as Net Income or Net Loss ──

  it("each box category participates as net income or net loss", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      ordinaryIncome: "10000",  // Positive → income
      netRentalIncome: "-3000", // Negative → loss
      interestIncome: "500",    // Positive → income
      otherIncome: "-1000",     // Negative → loss
    }));
    expect(result.totalIncomeItems).toEqual(new Decimal(10500));
    expect(result.totalLosses).toEqual(new Decimal(4000));
    expect(result.endingBasis).toEqual(new Decimal(56500));
  });

  // ── S-Corp vs Partnership ────────────────────────────────────

  it("partnership and S-corp produce same results without election", () => {
    const common = {
      beginningBasis: "40000",
      ordinaryIncome: "-10000",
      distributions: "15000",
      nondeductibleExpenses: "5000",
    };
    const partnerResult = calculatePartnerBasisSchedule(k1({
      ...common,
      entityType: "partnership",
    }));
    const scorpResult = calculatePartnerBasisSchedule(k1({
      ...common,
      entityType: "s_corporation",
    }));
    expect(partnerResult.endingBasis).toEqual(scorpResult.endingBasis);
    expect(partnerResult.totalAllowedLosses).toEqual(scorpResult.totalAllowedLosses);
    expect(partnerResult.totalSuspendedLosses).toEqual(scorpResult.totalSuspendedLosses);
    expect(partnerResult.excessDistributionGain).toEqual(scorpResult.excessDistributionGain);
  });

  it("S-corp election reorders losses before nondeductible expenses", () => {
    // With election: losses come before nondeductible expenses
    // Without election (standard): nondeductible before losses
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
      ordinaryIncome: "-8000",
      nondeductibleExpenses: "5000",
      election1367: true,
    }));
    // With election: basis 10000 → losses 8000 → basis 2000 → nondeductible 5000 → suspended 3000
    expect(result.totalAllowedLosses).toEqual(new Decimal(8000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(result.suspendedNondeductible).toEqual(new Decimal(3000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("S-corp without election uses standard ordering", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
      ordinaryIncome: "-8000",
      nondeductibleExpenses: "5000",
      election1367: false,
    }));
    // Standard: basis 10000 → nondeductible 5000 → basis 5000 → losses 8000 → allowed 5000, suspended 3000
    expect(result.basisAfterNondeductible).toEqual(new Decimal(5000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(5000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(3000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("election1367 is ignored for partnerships", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "partnership",
      beginningBasis: "10000",
      ordinaryIncome: "-8000",
      nondeductibleExpenses: "5000",
      election1367: true, // Should be ignored
    }));
    // Partnership always uses standard ordering regardless of election
    expect(result.basisAfterNondeductible).toEqual(new Decimal(5000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(5000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(3000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("S-corp election produces different result than standard when basis is insufficient", () => {
    // This test proves the election matters
    const withElection = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "15000",
      ordinaryIncome: "-12000",
      nondeductibleExpenses: "6000",
      election1367: true,
    }));
    const withoutElection = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "15000",
      ordinaryIncome: "-12000",
      nondeductibleExpenses: "6000",
      election1367: false,
    }));

    // With election: losses 12000 first → basis 3000 → nondeductible 6000 → 3000 suspended
    expect(withElection.totalAllowedLosses).toEqual(new Decimal(12000));
    expect(withElection.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(withElection.suspendedNondeductible).toEqual(new Decimal(3000));

    // Without election: nondeductible 6000 first → basis 9000 → losses 12000 → 3000 suspended
    expect(withoutElection.totalAllowedLosses).toEqual(new Decimal(9000));
    expect(withoutElection.totalSuspendedLosses).toEqual(new Decimal(3000));
    expect(withoutElection.suspendedNondeductible).toEqual(new Decimal(0));

    // Same ending basis (0) but different allocation
    expect(withElection.endingBasis).toEqual(new Decimal(0));
    expect(withoutElection.endingBasis).toEqual(new Decimal(0));
  });

  // ── Comprehensive Real-World Scenarios ───────────────────────

  it("realistic partnership: income, distributions, losses, nondeductible", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "75000",
      ordinaryIncome: "30000",
      interestIncome: "2000",
      qualifiedDividends: "1000",
      ordinaryDividends: "1500",
      distributions: "40000",
      nondeductibleExpenses: "3000",
      charitableCash: "5000",
      otherDeductions: "2000",
      taxExemptInterest: "500",
    }));
    // Basis before decreases: 75000 + 30000 + 2000 + 1500 + 500 = 109000
    expect(result.basisBeforeDecreases).toEqual(new Decimal(109000));
    // After distributions: 109000 - 40000 = 69000
    expect(result.basisAfterDistributions).toEqual(new Decimal(69000));
    expect(result.excessDistributionGain).toEqual(new Decimal(0));
    // After nondeductible: 69000 - 3000 = 66000
    expect(result.basisAfterNondeductible).toEqual(new Decimal(66000));
    // Losses: 5000 + 2000 = 7000 (all fit within 66000)
    expect(result.totalAllowedLosses).toEqual(new Decimal(7000));
    expect(result.endingBasis).toEqual(new Decimal(59000));
  });

  it("partnership with large loss requiring pro-rata across multiple categories", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "20000",
      ordinaryIncome: "-15000",
      netRentalIncome: "-10000",
      netShortTermCapitalGain: "-5000",
      section179Deduction: "10000",
      charitableCash: "2000",
      otherDeductions: "8000",
    }));
    // Total losses: 15000 + 10000 + 5000 + 10000 + 2000 + 8000 = 50000
    // Basis available: 20000
    expect(result.totalLosses).toEqual(new Decimal(50000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(20000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(30000));

    // Pro-rata: each gets 20000/50000 = 40% of their category
    const ordinary = result.lossCategories.find(c => c.key === "ordinary");
    const rental = result.lossCategories.find(c => c.key === "rental");
    const stcl = result.lossCategories.find(c => c.key === "shortTermCapital");
    const s179 = result.lossCategories.find(c => c.key === "section179");
    const charity = result.lossCategories.find(c => c.key === "charitable");
    const otherDed = result.lossCategories.find(c => c.key === "otherDeductions");
    expect(ordinary!.allowed).toEqual(new Decimal(6000));   // 15000 * 0.4
    expect(rental!.allowed).toEqual(new Decimal(4000));     // 10000 * 0.4
    expect(stcl!.allowed).toEqual(new Decimal(2000));       // 5000 * 0.4
    expect(s179!.allowed).toEqual(new Decimal(4000));       // 10000 * 0.4
    expect(charity!.allowed).toEqual(new Decimal(800));     // 2000 * 0.4
    expect(otherDed!.allowed).toEqual(new Decimal(3200));   // 8000 * 0.4
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("S-corp with distributions exceeding basis and losses", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "25000",
      ordinaryIncome: "-5000",
      distributions: "40000",
    }));
    // Income: max(0, -5000) = 0
    // Basis before decreases: 25000
    // Distributions: 40000 → excess gain 15000, basis = 0
    // Losses: 5000, all suspended
    expect(result.excessDistributionGain).toEqual(new Decimal(15000));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(5000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  // ── Audit Trail ──────────────────────────────────────────────

  it("audit trail includes all major computation steps", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "50000",
      ordinaryIncome: "10000",
      distributions: "5000",
      nondeductibleExpenses: "2000",
      section179Deduction: "3000",
    }));
    const lines = result.lines;
    expect(lines.length).toBeGreaterThan(0);

    // Check for key audit entries
    const formLines = lines.filter(l => l.form === "Basis Schedule");
    const descriptions = formLines.map(l => l.line);
    expect(descriptions).toContain("1");
    expect(descriptions).toContain("income");
    expect(descriptions).toContain("basis-before-decreases");
    expect(descriptions).toContain("distributions");
    expect(descriptions).toContain("basis-after-distributions");
    expect(descriptions).toContain("nondeductible");
    expect(descriptions).toContain("ending-basis");
  });

  it("entity type is recorded correctly for partnership", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "partnership",
      beginningBasis: "10000",
    }));
    expect(result.entityType).toBe("partnership");
  });

  it("entity type is recorded correctly for S-corporation", () => {
    const result = calculatePartnerBasisSchedule(k1({
      entityType: "s_corporation",
      beginningBasis: "10000",
    }));
    expect(result.entityType).toBe("s_corporation");
  });

  // ── Rounding in Pro-Rata ─────────────────────────────────────

  it("pro-rata rounding does not exceed available basis", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "1000",
      ordinaryIncome: "-333",
      netRentalIncome: "-333",
      otherIncome: "-334",
    }));
    // Total = 1000, basis = 1000 → all allowed (no pro-rata needed)
    expect(result.totalAllowedLosses).toEqual(new Decimal(1000));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  it("pro-rata with uneven split corrects rounding on largest category", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "100",
      ordinaryIncome: "-200",
      netRentalIncome: "-100",
    }));
    // Total = 300, basis = 100
    // Ordinary: 200/300 * 100 = 66.67 → 67
    // Rental: 100/300 * 100 = 33.33 → 33
    // Sum = 100 (with rounding correction)
    expect(result.totalAllowedLosses).toEqual(new Decimal(100));

    const ordinaryAllowed = result.lossCategories.find(c => c.key === "ordinary")!.allowed;
    const rentalAllowed = result.lossCategories.find(c => c.key === "rental")!.allowed;
    expect(ordinaryAllowed.plus(rentalAllowed)).toEqual(new Decimal(100));
  });

  // ── No Losses ────────────────────────────────────────────────

  it("no losses or deductions leaves basis unchanged after income and distributions", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "30000",
      ordinaryIncome: "20000",
      distributions: "10000",
    }));
    expect(result.totalLosses).toEqual(new Decimal(0));
    expect(result.totalAllowedLosses).toEqual(new Decimal(0));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(40000));
  });

  // ── Defaults ─────────────────────────────────────────────────

  it("defaults to partnership entity type", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "10000",
    }));
    expect(result.entityType).toBe("partnership");
  });

  it("zero K-1 with zero beginning basis produces all-zero result", () => {
    const result = calculatePartnerBasisSchedule(k1());
    expect(result.beginningBasis).toEqual(new Decimal(0));
    expect(result.totalIncomeItems).toEqual(new Decimal(0));
    expect(result.totalDistributions).toEqual(new Decimal(0));
    expect(result.excessDistributionGain).toEqual(new Decimal(0));
    expect(result.totalLosses).toEqual(new Decimal(0));
    expect(result.totalAllowedLosses).toEqual(new Decimal(0));
    expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
    expect(result.endingBasis).toEqual(new Decimal(0));
  });

  // ── Mixed Income and Loss ────────────────────────────────────

  it("mixed positive and negative K-1 items compute correctly", () => {
    const result = calculatePartnerBasisSchedule(k1({
      beginningBasis: "40000",
      ordinaryIncome: "15000",     // Income: +15000
      netRentalIncome: "-8000",    // Loss: 8000
      interestIncome: "2000",      // Income: +2000
      netLongTermCapitalGain: "-3000", // Loss: 3000
      section1231Gain: "5000",     // Income: +5000
      distributions: "10000",
      nondeductibleExpenses: "1000",
      charitableCash: "4000",
    }));
    // Income: 15000 + 2000 + 5000 = 22000
    expect(result.totalIncomeItems).toEqual(new Decimal(22000));
    // Basis before decreases: 40000 + 22000 = 62000
    expect(result.basisBeforeDecreases).toEqual(new Decimal(62000));
    // After distributions: 62000 - 10000 = 52000
    expect(result.basisAfterDistributions).toEqual(new Decimal(52000));
    // After nondeductible: 52000 - 1000 = 51000
    expect(result.basisAfterNondeductible).toEqual(new Decimal(51000));
    // Total losses: 8000 + 3000 + 4000 = 15000 (all fit within 51000)
    expect(result.totalLosses).toEqual(new Decimal(15000));
    expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
    expect(result.endingBasis).toEqual(new Decimal(36000));
  });

  // ── S-Corp Debt Basis (Form 7203 Part II) ─────────────────────

  describe("S-Corp Debt Basis (Form 7203 Part II)", () => {
    it("S-corp excess losses reduce debt basis", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "-25000",
        beginningDebtBasis: "8000",
      }));
      // Stock: 10000 basis, 25000 loss → stock allowed: 10000, excess: 15000
      // Debt: 8000 available → debt allowed: 8000, still suspended: 7000
      expect(result.endingBasis).toEqual(new Decimal(0));
      expect(result.totalAllowedLosses).toEqual(new Decimal(18000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(7000));
      expect(result.debtBasis).toBeDefined();
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(8000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(0));
    });

    it("debt basis absorbs all excess losses when sufficient", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "-15000",
        beginningDebtBasis: "20000",
      }));
      // Stock: 10000 basis, 15000 loss → stock allowed: 10000, excess: 5000
      // Debt: 20000 available → debt allowed: 5000, none suspended
      expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(5000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(15000));
    });

    it("losses exceeding stock and debt basis are suspended", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-20000",
        beginningDebtBasis: "3000",
      }));
      // Stock allowed: 5000, excess: 15000
      // Debt allowed: 3000, suspended: 12000
      expect(result.totalAllowedLosses).toEqual(new Decimal(8000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(12000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(0));
    });

    it("additional loans increase available debt basis for losses", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-20000",
        beginningDebtBasis: "3000",
        additionalLoansToScorp: "7000",
      }));
      // Stock allowed: 5000, excess: 15000
      // Debt available: 3000 + 7000 = 10000 → debt allowed: 10000, suspended: 5000
      expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(5000));
      expect(result.debtBasis!.additionalLoans).toEqual(new Decimal(7000));
      expect(result.debtBasis!.debtBasisBeforeAdjustments).toEqual(new Decimal(10000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(0));
    });

    it("debt basis restored from net income reduces stock basis", () => {
      // Year 2: income year after prior debt basis reduction
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "0",
        ordinaryIncome: "12000",
        beginningDebtBasis: "4000",
        priorDebtBasisReduction: "4000",
      }));
      // Stock: 0 + 12000 = 12000 (pre-restoration)
      // Net increase: 12000 - 0 = 12000
      // Restoration: min(12000, 4000) = 4000
      // Ending stock: 12000 - 4000 = 8000
      // Ending debt: 4000 + 4000 = 8000
      expect(result.endingBasis).toEqual(new Decimal(8000));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(4000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(8000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(0));
    });

    it("restoration limited to prior debt basis reduction", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "0",
        ordinaryIncome: "20000",
        beginningDebtBasis: "6000",
        priorDebtBasisReduction: "3000",
      }));
      // Net increase: 20000
      // Restoration: min(20000, 3000) = 3000
      // Ending stock: 20000 - 3000 = 17000
      // Ending debt: 6000 + 3000 = 9000
      expect(result.endingBasis).toEqual(new Decimal(17000));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(3000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(9000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(0));
    });

    it("partial restoration when net increase is less than prior reduction", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "0",
        ordinaryIncome: "3000",
        beginningDebtBasis: "5000",
        priorDebtBasisReduction: "5000",
      }));
      // Net increase: 3000
      // Restoration: min(3000, 5000) = 3000
      // Ending stock: 3000 - 3000 = 0
      // Ending debt: 5000 + 3000 = 8000
      // Reduction carryforward: 5000 - 3000 = 2000
      expect(result.endingBasis).toEqual(new Decimal(0));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(3000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(8000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(2000));
    });

    it("no debt restoration when losses exceed income", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "-8000",
        beginningDebtBasis: "5000",
        priorDebtBasisReduction: "3000",
      }));
      // Stock: 10000, loss 8000 → allowed 8000, ending stock 2000
      // Net increase: max(0, 2000 - 10000) = 0 → no restoration
      // No excess losses (all fit in stock)
      expect(result.endingBasis).toEqual(new Decimal(2000));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(0));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(5000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(3000));
    });

    it("no restoration when no prior reduction exists", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "15000",
        beginningDebtBasis: "5000",
        // No priorDebtBasisReduction → defaults to 0
      }));
      // Net increase: 25000 - 10000 = 15000
      // But prior reduction = 0 → no restoration
      expect(result.endingBasis).toEqual(new Decimal(25000));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(0));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(5000));
    });

    it("debt basis pro-rata allocation across multiple suspended categories", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-10000", // 10000 loss
        netRentalIncome: "-5000", // 5000 loss
        beginningDebtBasis: "6000",
      }));
      // Total losses: 15000. Stock basis: 5000 → stock allowed: 5000
      // Stock pro-rata: ordinary 10000/15000 × 5000 = 3333, rental 5000/15000 × 5000 = 1667
      // Suspended from stock: ordinary 6667, rental 3333 = total 10000
      // Debt: 6000 available → debt allowed: 6000
      // Debt pro-rata: ordinary 6667/10000 × 6000 = 4000, rental 3333/10000 × 6000 = 2000
      expect(result.totalAllowedLosses).toEqual(new Decimal(11000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(4000));

      const ordinary = result.lossCategories.find(c => c.key === "ordinary");
      const rental = result.lossCategories.find(c => c.key === "rental");
      // Total allowed: stock pro-rata + debt pro-rata
      expect(ordinary!.allowed).toEqual(new Decimal(7333));
      expect(rental!.allowed).toEqual(new Decimal(3667));
      expect(ordinary!.suspended).toEqual(new Decimal(2667));
      expect(rental!.suspended).toEqual(new Decimal(1333));
    });

    it("debt basis fields ignored for partnerships", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "partnership",
        beginningBasis: "5000",
        ordinaryIncome: "-10000",
        beginningDebtBasis: "8000", // Should be ignored
      }));
      // Partnership ignores debt basis
      expect(result.debtBasis).toBeUndefined();
      expect(result.totalAllowedLosses).toEqual(new Decimal(5000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(5000));
    });

    it("zero debt basis does not allow additional losses", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-10000",
        beginningDebtBasis: "0",
      }));
      expect(result.totalAllowedLosses).toEqual(new Decimal(5000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(5000));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(0));
    });

    it("negative beginning debt basis floored at zero", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-8000",
        beginningDebtBasis: "-3000",
      }));
      // Debt basis floored to 0
      expect(result.debtBasis!.beginningDebtBasis).toEqual(new Decimal(0));
      expect(result.totalAllowedLosses).toEqual(new Decimal(5000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(3000));
    });

    it("debt basis with §1367(a)(2)(B) election active", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "-12000",
        nondeductibleExpenses: "5000",
        beginningDebtBasis: "6000",
        election1367: true,
      }));
      // Election: losses first, then nondeductible
      // Stock: 10000 → losses 12000 → allowed 10000, excess 2000 → basis 0 → nondeductible 5000 → all suspended
      // Debt: 6000 → absorbs 2000 of excess losses
      expect(result.totalAllowedLosses).toEqual(new Decimal(12000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(2000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(4000));
    });

    it("debt basis carryforward tracks cumulative reduction", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-15000",
        beginningDebtBasis: "8000",
        priorDebtBasisReduction: "2000",
      }));
      // Stock allowed: 5000, excess: 10000
      // Debt allowed: 8000, suspended: 2000
      // New reduction: 8000
      // Carryforward: 2000 (prior) + 8000 (new) = 10000
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(8000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(10000));
    });

    it("debt basis unchanged when all losses fit within stock basis", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "50000",
        ordinaryIncome: "-10000",
        beginningDebtBasis: "8000",
      }));
      // All losses fit in stock (50000 > 10000) → no overflow to debt
      expect(result.totalAllowedLosses).toEqual(new Decimal(10000));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(0));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(8000));
    });

    it("debt basis with distributions and excess losses", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "20000",
        ordinaryIncome: "-25000",
        distributions: "15000",
        beginningDebtBasis: "10000",
      }));
      // Stock before decreases: 20000 (no income increase since -25000 → 0 income)
      // After distributions: 20000 - 15000 = 5000
      // Losses: 25000 → stock allowed: 5000, excess: 20000
      // Debt: 10000 → allowed: 10000, suspended: 10000
      expect(result.excessDistributionGain).toEqual(new Decimal(0));
      expect(result.totalAllowedLosses).toEqual(new Decimal(15000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(10000));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(10000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(0));
    });

    it("realistic multi-year scenario: loss year then income year", () => {
      // Year 1: big loss reduces both stock and debt basis
      const year1 = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "15000",
        ordinaryIncome: "-22000",
        beginningDebtBasis: "10000",
      }));
      // Stock: 15000, loss 22000 → stock allowed: 15000, excess: 7000
      // Debt: 10000 → debt allowed: 7000, ending debt: 3000
      expect(year1.endingBasis).toEqual(new Decimal(0));
      expect(year1.totalAllowedLosses).toEqual(new Decimal(22000));
      expect(year1.debtBasis!.endingDebtBasis).toEqual(new Decimal(3000));
      expect(year1.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(7000));

      // Year 2: income restores debt basis
      const year2 = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "0",
        ordinaryIncome: "18000",
        beginningDebtBasis: "3000", // From year 1
        priorDebtBasisReduction: "7000", // From year 1
      }));
      // Stock pre-restoration: 0 + 18000 = 18000
      // Net increase: 18000 - 0 = 18000
      // Restoration: min(18000, 7000) = 7000
      // Ending stock: 18000 - 7000 = 11000
      // Ending debt: 3000 + 7000 = 10000 (fully restored)
      expect(year2.endingBasis).toEqual(new Decimal(11000));
      expect(year2.debtBasis!.restoration).toEqual(new Decimal(7000));
      expect(year2.debtBasis!.endingDebtBasis).toEqual(new Decimal(10000));
      expect(year2.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(0));
    });

    it("suspended loss carryforward updated with debt-basis-allowed amounts", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-8000",
        netRentalIncome: "-4000",
        beginningDebtBasis: "3000",
      }));
      // Total losses: 12000. Stock: 5000. Debt: 3000. Total allowed: 8000.
      const cf = result.suspendedLossCarryforward;
      // Suspended should reflect what's left after both stock and debt allocations
      expect(cf.ordinary.plus(cf.rental)).toEqual(new Decimal(4000));
      // Total allowed should be stock + debt
      expect(result.totalAllowedLosses).toEqual(new Decimal(8000));
    });

    it("audit trail includes debt basis entries", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-10000",
        beginningDebtBasis: "8000",
      }));
      const debtLines = result.lines.filter(l =>
        l.form === "Basis Schedule" && l.line.startsWith("debt-"));
      expect(debtLines.length).toBeGreaterThan(0);
      expect(debtLines.map(l => l.line)).toContain("debt-15");
      expect(debtLines.map(l => l.line)).toContain("debt-17");
      expect(debtLines.map(l => l.line)).toContain("debt-20");
      expect(debtLines.map(l => l.line)).toContain("debt-21");
    });

    it("no debt basis result when beginningDebtBasis not provided", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "-15000",
        // No beginningDebtBasis
      }));
      expect(result.debtBasis).toBeUndefined();
      expect(result.totalAllowedLosses).toEqual(new Decimal(10000));
    });

    it("excess losses exactly equal debt basis", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "5000",
        ordinaryIncome: "-12000",
        beginningDebtBasis: "7000",
      }));
      // Stock allowed: 5000, excess: 7000
      // Debt: 7000 → debt allowed: 7000, nothing suspended
      expect(result.totalAllowedLosses).toEqual(new Decimal(12000));
      expect(result.totalSuspendedLosses).toEqual(new Decimal(0));
      expect(result.debtBasis!.lossesAppliedToDebtBasis).toEqual(new Decimal(7000));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(0));
    });

    it("restoration with distributions — no net increase", () => {
      const result = calculatePartnerBasisSchedule(k1({
        entityType: "s_corporation",
        beginningBasis: "10000",
        ordinaryIncome: "15000",
        distributions: "20000",
        beginningDebtBasis: "5000",
        priorDebtBasisReduction: "3000",
      }));
      // Stock before decreases: 10000 + 15000 = 25000
      // After distributions: 25000 - 20000 = 5000
      // No losses → ending stock: 5000
      // Net increase: max(0, 5000 - 10000) = 0 → no restoration
      expect(result.endingBasis).toEqual(new Decimal(5000));
      expect(result.debtBasis!.restoration).toEqual(new Decimal(0));
      expect(result.debtBasis!.endingDebtBasis).toEqual(new Decimal(5000));
      expect(result.debtBasis!.debtBasisReductionCarryforward).toEqual(new Decimal(3000));
    });
  });
});
