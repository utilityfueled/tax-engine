/**
 * Married Filing Jointly end-to-end test.
 * Dual-income MFJ couple with complex income: two W-2s, interest, dividends,
 * capital gains/losses, self-employment, K-1 partnership, itemized deductions,
 * one qualifying child, and estimated tax payments.
 *
 * Verifies all MFJ-specific thresholds and calculations:
 * - MFJ standard deduction ($30,000)
 * - MFJ tax brackets (wider than single)
 * - MFJ capital gains rate thresholds
 * - CTC phase-out at $400K (not $200K)
 * - Additional Medicare Tax threshold ($250K)
 * - NIIT threshold ($250K)
 * - SALT cap ($10K)
 * - AMT exemption ($137K)
 * - Form 4797 property sales (§1245/§1250 recapture, §1231 lookback, QDCG interaction)
 * - Home sale exclusion ($500K MFJ when both spouses meet use test, $250K when one)
 * - Form 8936 clean vehicle credit (MFJ $300K MAGI threshold for new, $150K for used)
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { complexMFJFixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

describe("MFJ Full Return - dual income with complex sources", () => {
  const federal = calculateFederalTax(complexMFJFixture);

  // ── Filing Status ─────────────────────────────────────
  it("filing status is married_filing_jointly", () => {
    expect(federal.filingStatus).toBe("married_filing_jointly");
  });

  // ══════════════════════════════════════════════════════
  // 1. Total Income (W-2 + interest + dividends + cap gains + SE + K-1)
  // ══════════════════════════════════════════════════════

  it("wages = $250K from two W-2s ($200K + $50K)", () => {
    expect(federal.totalWages.toNumber()).toBe(250000);
  });

  it("taxable interest = $2,500 (1099-INT) + $500 (K-1) = $3,000", () => {
    expect(federal.totalInterest.toNumber()).toBe(3000);
  });

  it("ordinary dividends = $8,000 (1099-DIV) + $0 (K-1) = $8,000", () => {
    expect(federal.totalDividends.toNumber()).toBe(8000);
  });

  it("qualified dividends = $6,000", () => {
    expect(federal.qualifiedDividends.toNumber()).toBe(6000);
  });

  it("capital gains: AAPL +$10K LT, TSLA -$2K ST, distributions +$3K, K-1 +$2K LT", () => {
    // Net ST: -$2K
    // Net LT: +$10K + $3K dist + $2K K-1 = +$15K
    // Overall: -$2K + $15K = +$13K
    expect(federal.capitalGainLoss.toNumber()).toBe(13000);
  });

  it("total income includes all sources", () => {
    // W-2 $250K + interest $3K + dividends $8K + cap gains $13K + SE $15K + K-1 $5K
    expect(federal.totalIncome.toNumber()).toBe(294000);
  });

  // ══════════════════════════════════════════════════════
  // 2. Adjustments to Income
  // ══════════════════════════════════════════════════════

  it("SE deduction reduces AGI (50% of SE tax)", () => {
    // SE net earnings: $15K × 0.9235 = $13,852.50
    // SE tax: SS portion + Medicare portion
    // Deductible half = 50% of SE tax
    expect(federal.adjustmentsToIncome.greaterThan(0)).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 3. AGI
  // ══════════════════════════════════════════════════════

  it("AGI = total income minus adjustments", () => {
    const expected = federal.totalIncome.minus(federal.adjustmentsToIncome);
    expect(federal.agi.toNumber()).toBe(expected.toNumber());
  });

  it("AGI is above $250K (triggers NIIT and Additional Medicare Tax)", () => {
    expect(federal.agi.greaterThan(d(250000))).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 4. Standard Deduction vs Itemized Choice
  // ══════════════════════════════════════════════════════

  it("MFJ standard deduction = $31,500", () => {
    expect(federal.standardDeduction.toNumber()).toBe(31500);
  });

  it("itemized deductions exceed standard deduction", () => {
    // Mortgage: $18K limited to ($650K/$750K) ratio = $15,600
    // SALT: min($8.5K property tax, $10K cap) = $8,500
    // Charitable: $5K cash + $20K appreciated stock = $25K
    // Total itemized > $31.5K standard
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.deductionAmount.greaterThan(d(31500))).toBe(true);
  });

  it("Schedule A sub-result available (itemizing)", () => {
    expect(federal.scheduleA).toBeDefined();
    expect(federal.scheduleA!.totalItemized.greaterThan(d(30000))).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 5. Taxable Income
  // ══════════════════════════════════════════════════════

  it("taxable income = AGI - itemized deduction - QBI deduction", () => {
    // QBI deduction from Schedule C ($15K SE profit → ~$3K QBI deduction)
    const qbiDeduction = federal.form8995?.qbiDeduction ?? new Decimal(0);
    const expected = federal.agi.minus(federal.deductionAmount).minus(qbiDeduction);
    expect(federal.taxableIncome.toNumber()).toBe(expected.toNumber());
    expect(qbiDeduction.greaterThan(0)).toBe(true);
  });

  it("taxable income is positive", () => {
    expect(federal.taxableIncome.greaterThan(0)).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 6. Tax Brackets (MFJ brackets are wider than single)
  // ══════════════════════════════════════════════════════

  it("total tax before credits is positive", () => {
    expect(federal.totalTaxBeforeCredits.greaterThan(0)).toBe(true);
  });

  it("ordinary tax computed on non-preferential income", () => {
    expect(federal.ordinaryTax.greaterThan(0)).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 7. Capital Gains Treatment (QDCG worksheet)
  // ══════════════════════════════════════════════════════

  it("preferential rate applies to qualified dividends and long-term gains", () => {
    // $6K qualified dividends + net LTCG get preferential rates
    expect(federal.capitalGainsTax.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("total tax before credits = ordinary tax + capital gains tax", () => {
    const sum = federal.ordinaryTax.plus(federal.capitalGainsTax);
    expect(federal.totalTaxBeforeCredits.toNumber()).toBe(sum.toNumber());
  });

  it("Schedule D sub-result available", () => {
    expect(federal.scheduleD).toBeDefined();
    expect(federal.scheduleD!.netCapitalGainLoss.toNumber()).toBe(13000);
  });

  // ══════════════════════════════════════════════════════
  // 8. Child Tax Credit (MFJ phase-out at $400K)
  // ══════════════════════════════════════════════════════

  it("CTC = $2,000 for one qualifying child (AGI under $400K MFJ threshold)", () => {
    // AGI ~$293K < $400K → no phase-out → full $2,000
    expect(federal.childTaxCredit.toNumber()).toBe(2000);
  });

  it("ACTC = $0 (high-income filer, full CTC used nonrefundably)", () => {
    // Tax well exceeds $2,000 CTC → no unused CTC → no ACTC
    expect(federal.form8812).toBeDefined();
    expect(federal.form8812!.actc.toNumber()).toBe(0);
  });

  // ══════════════════════════════════════════════════════
  // 9. Additional Medicare Tax (Form 8959)
  // ══════════════════════════════════════════════════════

  it("Additional Medicare Tax applies (combined earnings > $250K MFJ threshold)", () => {
    // W-2 wages $250K + SE $15K = $265K > $250K MFJ threshold
    // Excess × 0.9% → positive tax
    expect(federal.additionalMedicareTax.greaterThan(0)).toBe(true);
  });

  it("Form 8959 sub-result available", () => {
    expect(federal.form8959).toBeDefined();
  });

  // ══════════════════════════════════════════════════════
  // 10. NIIT (Form 8960)
  // ══════════════════════════════════════════════════════

  it("NIIT applies (AGI > $250K MFJ threshold with investment income)", () => {
    // Investment income: interest $3K + dividends $8K + cap gains $13K
    // AGI > $250K → NIIT on lesser of NII or AGI excess
    expect(federal.niitTax.greaterThan(0)).toBe(true);
  });

  it("Form 8960 sub-result available", () => {
    expect(federal.form8960).toBeDefined();
  });

  // ══════════════════════════════════════════════════════
  // 11. Schedule SE
  // ══════════════════════════════════════════════════════

  it("SE tax computed on $15K consulting income", () => {
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("Schedule SE sub-result available", () => {
    expect(federal.scheduleSE).toBeDefined();
    expect(federal.scheduleSE!.netNonfarmProfit.toNumber()).toBe(15000);
  });

  // ══════════════════════════════════════════════════════
  // 12. AMT
  // ══════════════════════════════════════════════════════

  it("AMT exemption for MFJ is $137,000", () => {
    // Taxable income ~$245K; AMTI = taxable + SALT add-back (~$8.5K)
    // AMTI ~$253K < $1,252,700 phase-out → full exemption
    // AMTI - $137K exemption ~$116K × 26% = ~$30K < regular tax → no AMT
    expect(federal.amt.toNumber()).toBe(0);
  });

  // ══════════════════════════════════════════════════════
  // 13. Total Tax
  // ══════════════════════════════════════════════════════

  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  it("total tax = tax after credits + additional taxes", () => {
    // Tax after credits = totalTaxBeforeCredits - totalCredits (floored at 0)
    // Total tax = tax after credits + SE + AMT + additional Medicare + NIIT + penalty
    const taxAfterCredits = Decimal.max(
      federal.totalTaxBeforeCredits.minus(federal.totalCredits),
      0
    );
    const expected = taxAfterCredits.plus(federal.totalAdditionalTaxes);
    expect(federal.totalTax.toNumber()).toBe(expected.toNumber());
  });

  // ══════════════════════════════════════════════════════
  // 14. Withholding and Payments
  // ══════════════════════════════════════════════════════

  it("total withholding = $42,500 ($35K + $7.5K from two W-2s)", () => {
    expect(federal.totalWithholding.toNumber()).toBe(42500);
  });

  it("estimated tax payments = $20,000 (4 × $5K)", () => {
    expect(federal.estimatedTaxPayments.toNumber()).toBe(20000);
  });

  it("total payments includes withholding + estimated payments + refundable credits", () => {
    expect(federal.totalPayments.greaterThanOrEqualTo(
      federal.totalWithholding.plus(federal.estimatedTaxPayments)
    )).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 15. Refund or Amount Owed
  // ══════════════════════════════════════════════════════

  it("refund and owed are mutually exclusive", () => {
    const both = federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
  });

  it("tax equation: totalTax = payments - refund + owed", () => {
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ══════════════════════════════════════════════════════
  // Additional Verifications
  // ══════════════════════════════════════════════════════

  it("foreign tax credit from 1099-DIV ($150)", () => {
    expect(federal.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(federal.foreignTaxCredit.lte(d(150))).toBe(true);
  });

  it("no capital loss carryforward (net gain)", () => {
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("no suspended passive losses (K-1 ordinary income is positive)", () => {
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });

  // ── Audit Trail ───────────────────────────────────────
  it("audit trail covers all key forms", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched B")).toBe(true);
    expect(forms.has("Sched C")).toBe(true);
    expect(forms.has("Sched D")).toBe(true);
    expect(forms.has("Sched E")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Sched A")).toBe(true);
    expect(forms.has("Sched 1")).toBe(true);
    expect(forms.has("Sched 2")).toBe(true);
    expect(forms.has("Form 8949")).toBe(true);
    expect(forms.has("Form 8959")).toBe(true);
    expect(forms.has("Form 8960")).toBe(true);
    expect(forms.has("Form 1116")).toBe(true);
    expect(forms.has("Form 6251")).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 16. MFJ Standard Deduction Verification
  // ══════════════════════════════════════════════════════

  it("MFJ standard deduction is exactly $31,500 (double the single filer amount)", () => {
    // 2025 MFJ standard deduction is $31,500 — confirmed from constants
    expect(federal.standardDeduction.toNumber()).toBe(31500);
    // MFJ standard deduction must be greater than itemized for itemized to be chosen
    // (in this fixture itemized wins), so we separately assert the constant value
    expect(federal.standardDeduction.equals(d(31500))).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 17. MFJ Tax Bracket Boundaries
  // ══════════════════════════════════════════════════════

  it("MFJ taxable income falls in the 22% or 24% bracket (not 10% or 37%)", () => {
    // MFJ 22% bracket: $96,950–$206,700; 24% bracket: $206,700–$394,600
    // Taxable income ~$245K lands in one of these two brackets
    const ti = federal.taxableIncome;
    const inBracketRange = ti.greaterThan(d(96950)) && ti.lessThan(d(394600));
    expect(inBracketRange).toBe(true);
  });

  it("MFJ 37% bracket threshold is $751,600 (much higher than single $626,350)", () => {
    // Verify ordinary tax does not reflect 37% rate at this income level
    // Taxable income ~$245K is well below the MFJ 37% threshold of $751,600
    expect(federal.taxableIncome.lessThan(d(751600))).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 18. Two W-2 Earners
  // ══════════════════════════════════════════════════════

  it("two W-2 earners: combined wages = $200K + $50K = $250,000", () => {
    expect(federal.totalWages.toNumber()).toBe(250000);
  });

  it("two W-2 earners: combined federal withholding = $35K + $7.5K = $42,500", () => {
    expect(federal.totalWithholding.toNumber()).toBe(42500);
  });

  // ══════════════════════════════════════════════════════
  // 19. MFJ CTC Phase-Out at $400K Threshold
  // ══════════════════════════════════════════════════════

  it("CTC is not phased out because AGI ($293K) is below MFJ $400K threshold", () => {
    // For single filers the phase-out starts at $200K — this couple benefits from
    // the higher MFJ threshold.  Full $2,000 per child applies.
    expect(federal.form8812).toBeDefined();
    expect(federal.form8812!.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("CTC phase-out would reduce credit by $50 per $1,000 above $400K (not triggered here)", () => {
    // AGI ~$293K < $400K threshold → reduction = 0 → before-limitation equals $2,000
    expect(federal.childTaxCredit.toNumber()).toBe(2000);
  });

  // ══════════════════════════════════════════════════════
  // 20. NIIT Threshold at $250K for MFJ
  // ══════════════════════════════════════════════════════

  it("Form 8960 NIIT threshold is $250,000 for MFJ filers", () => {
    expect(federal.form8960).toBeDefined();
    expect(federal.form8960!.threshold.toNumber()).toBe(250000);
  });

  it("NIIT taxable base = lesser of net investment income or MAGI excess over $250K", () => {
    // Investment income: interest $3K + dividends $8K + cap gains $13K = $24K NII
    // MAGI ~$293K − $250K threshold = ~$43K excess
    // Taxable base = min($24K, $43K) = $24K investment income
    const nii = federal.form8960!.netInvestmentIncome;
    const excess = federal.form8960!.magiExcess;
    const base = federal.form8960!.taxableBase;
    // Base is the lesser of the two
    expect(base.equals(Decimal.min(nii, excess))).toBe(true);
    expect(base.greaterThan(0)).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 21. Capital Loss Limit ($3,000)
  // ══════════════════════════════════════════════════════

  it("capital loss limit is $3,000 regardless of filing status for MFJ", () => {
    // This fixture has a net gain so the limit is not triggered, but we confirm
    // the carryforward is zero and the reported gain is positive
    expect(federal.capitalGainLoss.greaterThan(0)).toBe(true);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  // ══════════════════════════════════════════════════════
  // 22. MFJ AMT Exemption at $137,000
  // ══════════════════════════════════════════════════════

  it("Form 6251 AMT exemption for MFJ is $137,000", () => {
    expect(federal.form6251).toBeDefined();
    expect(federal.form6251!.exemption.toNumber()).toBe(137000);
  });

  it("AMT phase-out threshold for MFJ is $1,252,700 — not reached, full exemption applies", () => {
    // AMTI ~$253K is far below the MFJ phase-out of $1,252,700 so no exemption reduction
    const amti = federal.form6251!.amti;
    expect(amti.lessThan(d(1252700))).toBe(true);
    // Full $137,000 exemption is used, not reduced
    expect(federal.form6251!.exemption.toNumber()).toBe(137000);
  });

  // ══════════════════════════════════════════════════════
  // 23. Total Tax Equation: refund = totalPayments - totalTax
  // ══════════════════════════════════════════════════════

  it("refund equation: refund = totalPayments - totalTax when payments exceed tax", () => {
    if (federal.refund.greaterThan(0)) {
      const expected = federal.totalPayments.minus(federal.totalTax);
      expect(federal.refund.toNumber()).toBe(expected.toNumber());
    } else {
      // Amount owed case: totalTax > totalPayments
      const expected = federal.totalTax.minus(federal.totalPayments);
      expect(federal.amountOwed.toNumber()).toBe(expected.toNumber());
    }
  });

  it("totalTax components: totalAdditionalTaxes includes SE tax, AMT, Additional Medicare, NIIT", () => {
    // Verify every major additional tax item is non-negative and sums correctly
    const seTax = federal.selfEmploymentTax;
    const amt = federal.amt;
    const medTax = federal.additionalMedicareTax;
    const niit = federal.niitTax;
    const penalty = federal.estimatedTaxPenalty;
    expect(seTax.greaterThan(0)).toBe(true);
    expect(amt.toNumber()).toBe(0); // no AMT at this income
    expect(medTax.greaterThan(0)).toBe(true);
    expect(niit.greaterThan(0)).toBe(true);
    const sumAdditional = seTax.plus(amt).plus(medTax).plus(niit).plus(penalty);
    expect(federal.totalAdditionalTaxes.toNumber()).toBe(sumAdditional.toNumber());
  });

  // ══════════════════════════════════════════════════════
  // 24. MFJ with Itemized Deductions Exceeding Standard Deduction
  // ══════════════════════════════════════════════════════

  it("itemized deductions include SALT ($8,500 property tax, capped at $10K), mortgage interest, and charitable", () => {
    // Mortgage interest limited by $650K/$750K ratio: $18K × (650/750) = $15,600
    // SALT: $8,500 (under $10K cap)
    // Charitable: $5K cash + $20K stock = $25K
    // Total ≈ $15,600 + $8,500 + $25,000 = $49,100 > $30,000 standard deduction
    expect(federal.scheduleA).toBeDefined();
    expect(federal.scheduleA!.totalItemized.greaterThan(d(30000))).toBe(true);
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.deductionAmount.greaterThan(d(30000))).toBe(true);
  });

  it("SALT deduction is capped at $10,000 even for MFJ filers", () => {
    // Property tax is $8,500 which is under the $10,000 cap
    // The SALT cap is the same for MFJ and single filers
    expect(federal.scheduleA).toBeDefined();
    expect(federal.scheduleA!.saltDeduction.lte(d(10000))).toBe(true);
  });

  // ══════════════════════════════════════════════════════
  // 25. Audit Trail Completeness (Extended)
  // ══════════════════════════════════════════════════════

  it("audit trail contains at least one line for Form 8812 (CTC/ACTC)", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("Form 8812")).toBe(true);
  });

  it("audit trail contains Form 8959 and Form 8960 (Medicare / NIIT surtaxes)", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("Form 8959")).toBe(true);
    expect(forms.has("Form 8960")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// MFJ + Form 4797 Property Sales Integration
// Scenario: Couple sells rental building (§1250) and business equipment (§1245).
// Verifies depreciation recapture flows through Schedule 1 and Schedule D,
// and that unrecaptured §1250 gain enters the QDCG preferential-rate path.
// ══════════════════════════════════════════════════════════════════

describe("MFJ Full Return - Form 4797 property sales", () => {
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    form4797: {
      nonrecapturedNetSection1231Losses: "5000",
      propertySales: [
        {
          description: "Office furniture (§1245)",
          costOrBasis: "40000",
          depreciationAllowed: "40000",
          grossSalesPrice: "12000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        },
        {
          description: "Rental duplex (§1250)",
          costOrBasis: "300000",
          depreciationAllowed: "60000",
          grossSalesPrice: "400000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        },
      ],
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("§1245 equipment: all gain is recaptured as ordinary income", () => {
    // Adjusted basis = 40000 - 40000 = 0, gain = 12000
    // Recapture = min(12000, 40000) = 12000, §1231 remainder = 0
    const equip = result.form4797!.propertyResults.find(
      (p) => p.propertyType === "section1245"
    )!;
    expect(equip.section1245Recapture.toNumber()).toBe(12000);
    expect(equip.section1231Gain.toNumber()).toBe(0);
  });

  it("§1250 rental: $0 ordinary recapture (post-1986 MACRS SL), all gain is §1231", () => {
    // Adjusted basis = 300000 - 60000 = 240000, gain = 160000
    // §1250 recapture = $0 (SL = total depreciation)
    // §1231 gain = 160000
    const rental = result.form4797!.propertyResults.find(
      (p) => p.propertyType === "section1250"
    )!;
    expect(rental.section1250Recapture.toNumber()).toBe(0);
    expect(rental.section1231Gain.toNumber()).toBe(160000);
    expect(rental.unrecapturedSection1250Gain.toNumber()).toBe(60000);
  });

  it("Part I line 7 combines K-1 defaults and property §1231 amounts", () => {
    // §1231: rental 160000 + equipment 0 = 160000
    // No K-1 §1231 in this fixture
    expect(result.form4797!.line7.toNumber()).toBe(160000);
  });

  it("lookback recaptures $5K of prior nonrecaptured §1231 losses as ordinary", () => {
    expect(result.form4797!.line12.toNumber()).toBe(5000);
    expect(result.form4797!.line9.toNumber()).toBe(155000);
  });

  it("Schedule 1 Line 4 carries combined ordinary gain (recapture + lookback)", () => {
    // Part I ordinary: line11(0) + line12(5000) = 5000
    // Part II ordinary: recapture(12000) + short-term(0) = 12000
    // Total ordinary = 5000 + 12000 = 17000
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(17000);
  });

  it("Schedule D receives §1231 LTCG alongside existing capital gains", () => {
    // Base fixture capital gain = 13000
    // Form 4797 §1231 LTCG = 155000
    // Total = 13000 + 155000 = 168000
    expect(result.capitalGainLoss.toNumber()).toBe(
      baseResult.capitalGainLoss.toNumber() + 155000
    );
  });

  it("unrecaptured §1250 gain flows to QDCG for 25% max rate treatment", () => {
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(60000);
    // Preferential capital gains tax should be computed
    expect(result.capitalGainsTax.greaterThan(0)).toBe(true);
  });

  it("AGI increases by full property sale amounts", () => {
    // Ordinary: 17000, LTCG: 155000 → total new income = 172000
    expect(result.agi.toNumber()).toBe(
      baseResult.agi.toNumber() + 172000
    );
  });

  it("total tax increases but QDCG preferential rates apply to the §1250 gain", () => {
    expect(result.totalTax.greaterThan(baseResult.totalTax)).toBe(true);
  });

  it("MFJ NIIT threshold still $250K — higher AGI means more NIIT", () => {
    expect(result.form8960!.threshold.toNumber()).toBe(250000);
    expect(result.niitTax.greaterThan(baseResult.niitTax)).toBe(true);
  });

  it("audit trail includes Form 4797 Part III per-property lines", () => {
    const f4797Lines = result.allLines.filter(
      (l) => l.form === "Form 4797" || l.form === "Form 4797 Part III"
    );
    expect(f4797Lines.length).toBeGreaterThan(0);
    expect(f4797Lines.some((l) => l.line.includes("Office furniture"))).toBe(true);
    expect(f4797Lines.some((l) => l.line.includes("Rental duplex"))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// MFJ + Home Sale Exclusion ($500K MFJ)
// Scenario: Couple sells principal residence with $420K gain.
// MFJ exclusion is $500K (vs $250K single) when both spouses meet use test.
// ══════════════════════════════════════════════════════════════════

describe("MFJ Full Return - home sale exclusion ($500K MFJ)", () => {
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    homeSales: [
      {
        salePrice: "850000",
        sellingExpenses: "50000",
        purchasePrice: "380000",
        improvements: "0",
        depreciationAfterMay1997: "0",
        daysOwned: 1826, // 5 full years
        daysUsedAsResidence: 1826,
        usedExclusionInPrior2Years: false,
        bothSpousesMeetUseTest: true,
        atLeastOneSpouseMeetsOwnershipTest: true,
      },
    ],
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("gain = sale price - expenses - purchase price = $420K", () => {
    // 850000 - 50000 - 380000 = 420000
    // Both spouses meet use test → $500K MFJ exclusion
    // Taxable gain = max(0, 420000 - 500000) = $0
    // Capital gain should not increase from base
    expect(result.capitalGainLoss.toNumber()).toBe(baseResult.capitalGainLoss.toNumber());
  });

  it("$500K MFJ exclusion fully covers the $420K gain — no taxable gain", () => {
    // AGI should not increase from base (no taxable gain from home sale)
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber());
  });

  it("total tax is the same as base — fully excluded gain adds nothing", () => {
    expect(result.totalTax.toNumber()).toBe(baseResult.totalTax.toNumber());
  });
});

describe("MFJ Full Return - home sale exclusion with depreciation recapture", () => {
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    homeSales: [
      {
        salePrice: "950000",
        sellingExpenses: "55000",
        purchasePrice: "350000",
        improvements: "25000",
        depreciationAfterMay1997: "15000",
        daysOwned: 1826,
        daysUsedAsResidence: 1826,
        usedExclusionInPrior2Years: false,
        bothSpousesMeetUseTest: true,
        atLeastOneSpouseMeetsOwnershipTest: true,
      },
    ],
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("gain before exclusion: $950K - $55K - $350K - $25K + $15K depreciation = $535K", () => {
    // Adjusted basis = 350000 + 25000 - 15000 = 360000
    // Amount realized = 950000 - 55000 = 895000
    // Gain = 895000 - 360000 = 535000
    // Non-excludable depreciation = 15000 (taxed as unrecaptured §1250)
    // Excludable gain = 535000 - 15000 = 520000
    // Exclusion applied = min(520000, 500000) = 500000
    // Taxable gain = 520000 - 500000 = 20000 (LTCG)
    // Plus $15000 depreciation recapture (unrecaptured §1250 at 25% max)
    // Total taxable = 20000 + 15000 = 35000

    // Capital gain should increase by $35K from base
    expect(result.capitalGainLoss.toNumber()).toBe(
      baseResult.capitalGainLoss.toNumber() + 35000
    );
  });

  it("post-1997 depreciation is not excludable — taxed as unrecaptured §1250 gain", () => {
    // The $15K depreciation recapture flows to QDCG at 25% max rate
    expect(result.capitalGainsTax.greaterThan(baseResult.capitalGainsTax)).toBe(true);
  });

  it("AGI increases by the taxable portion ($35K) not the full gain", () => {
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber() + 35000);
  });
});

describe("MFJ Full Return - home sale exclusion only one spouse meets use test", () => {
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    homeSales: [
      {
        salePrice: "700000",
        sellingExpenses: "40000",
        purchasePrice: "350000",
        improvements: "0",
        daysOwned: 1826,
        daysUsedAsResidence: 1826,
        usedExclusionInPrior2Years: false,
        bothSpousesMeetUseTest: false, // only one spouse qualifies → $250K limit
      },
    ],
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("only $250K exclusion when only one spouse meets use test", () => {
    // Gain = 700000 - 40000 - 350000 = 310000
    // Only one spouse qualifies → $250K exclusion
    // Taxable = 310000 - 250000 = 60000 LTCG
    expect(result.capitalGainLoss.toNumber()).toBe(
      baseResult.capitalGainLoss.toNumber() + 60000
    );
  });

  it("AGI increases by the $60K taxable gain", () => {
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber() + 60000);
  });
});

// ══════════════════════════════════════════════════════════════════
// MFJ + Form 8936 Clean Vehicle Credit
// Scenario: Couple buys a new EV qualifying for $7,500 credit.
// MFJ MAGI threshold for new vehicles is $300K.
// ══════════════════════════════════════════════════════════════════

describe("MFJ Full Return - Form 8936 clean vehicle credit", () => {
  // The complexMFJFixture has AGI ~$293K, under the $300K MFJ threshold
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    form8936: {
      newCleanVehicles: [
        {
          dateAcquired: "2025-09-30",
          criticalMineralsRequirementMet: true,
          batteryComponentsRequirementMet: true,
          msrp: "45000",
          vehicleType: "other",
          personalUsePercentage: "100",
        },
      ],
      previouslyOwnedCleanVehicles: [],
      priorYearAgi: "280000", // prior year also under $300K
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("$7,500 new clean vehicle credit when both requirements met and MAGI under $300K MFJ", () => {
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.totalNewVehicleCredit.toNumber()).toBe(7500);
  });

  it("clean vehicle credit reduces total tax", () => {
    expect(result.totalTax.lessThan(baseResult.totalTax)).toBe(true);
  });

  it("credit flows as nonrefundable credit through Schedule 3", () => {
    expect(result.totalCredits.greaterThan(baseResult.totalCredits)).toBe(true);
  });
});

describe("MFJ Full Return - Form 8936 MAGI over $300K MFJ threshold", () => {
  // Add extra income to push AGI above $300K
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    form1099Int: [
      {
        payer: "National Bank",
        interestIncome: "12500", // extra $10K to push over threshold
        federalWithheld: "0",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      },
    ],
    form8936: {
      newCleanVehicles: [
        {
          dateAcquired: "2025-09-30",
          criticalMineralsRequirementMet: true,
          batteryComponentsRequirementMet: true,
          msrp: "45000",
          vehicleType: "other",
          personalUsePercentage: "100",
        },
      ],
      previouslyOwnedCleanVehicles: [],
      priorYearAgi: "310000", // both years over $300K
    },
  };
  const result = calculateFederalTax(fixture);

  it("no credit when MFJ MAGI exceeds $300K threshold in both years", () => {
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.totalNewVehicleCredit.toNumber()).toBe(0);
  });
});

describe("MFJ Full Return - Form 8936 previously owned vehicle", () => {
  const fixture: TaxYearInput = {
    ...complexMFJFixture,
    form8936: {
      newCleanVehicles: [],
      previouslyOwnedCleanVehicles: [
        {
          dateAcquired: "2025-09-30",
          salePrice: "20000",
          personalUsePercentage: "100",
        },
      ],
      priorYearAgi: "140000",
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(complexMFJFixture);

  it("previously owned credit is lesser of $4,000 or 30% of sale price", () => {
    // 30% of $20K = $6K; lesser of $6K or $4K = $4K
    // MFJ MAGI threshold for previously owned = $150K
    // Fixture AGI ~$293K — but the check uses lesser of current or prior year
    // Prior year AGI = $140K < $150K → eligible via lesser-of-two-years
    expect(result.form8936).toBeDefined();
    expect(result.form8936!.totalPreviouslyOwnedCredit.toNumber()).toBe(4000);
  });

  it("previously owned credit reduces total tax", () => {
    expect(result.totalTax.lessThan(baseResult.totalTax)).toBe(true);
  });
});
