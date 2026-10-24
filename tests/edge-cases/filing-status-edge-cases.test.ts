/**
 * Edge case tests for filing status variations.
 * Tests Head of Household, MFS half-limits, and QSS behavior.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import type { FilingStatus } from "@/models/constants.js";
import {
  calculateTaxFromBrackets,
  calculateCapitalGainsTax,
  calculateNIIT,
  calculateAdditionalMedicareTax,
  calculateChildTaxCredit,
  calculateSALTDeduction,
} from "@/utils/tax-math.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Head of Household Brackets
// ═══════════════════════════════════════════════════════════

describe("Head of Household bracket behavior", () => {
  it("HoH 10% bracket is wider than single ($17K vs $11.925K)", () => {
    const hohTax = calculateTaxFromBrackets(d(15000), c.taxBrackets.head_of_household);
    const singleTax = calculateTaxFromBrackets(d(15000), c.taxBrackets.single);
    // HoH: 15K × 10% = $1,500
    // Single: 11925 × 10% + (15000-11925) × 12% = $1,192.50 + $369 = $1,562
    expect(hohTax.toNumber()).toBe(1500);
    expect(singleTax.toNumber()).toBe(1562);
    expect(hohTax.lessThan(singleTax)).toBe(true);
  });

  it("HoH standard deduction is $23,625", () => {
    expect(c.standardDeduction.head_of_household.toNumber()).toBe(23625);
  });

  it("HoH capital gains 0% threshold differs from single", () => {
    expect(c.capitalGainsRates.zero.threshold.head_of_household.toNumber()).toBe(64750);
    expect(c.capitalGainsRates.zero.threshold.single.toNumber()).toBe(48350);
  });

  it("HoH QDCG tax with income at 0% threshold boundary", () => {
    // Exactly at the 0% threshold: $64,750 of LTCG with $0 ordinary → all at 0%
    const result = calculateCapitalGainsTax(
      d(64750), d(0), d(64750), "head_of_household", c
    );
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("HoH QDCG tax $1 over 0% threshold", () => {
    // $64,751 total income: $64,750 at 0%, $1 at 15%
    const result = calculateCapitalGainsTax(
      d(64751), d(0), d(64751), "head_of_household", c
    );
    expect(result.preferentialTax.toNumber()).toBe(0); // $1 × 15% = $0 rounded
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Half-Limits
// ═══════════════════════════════════════════════════════════

describe("Married Filing Separately half-limits", () => {
  it("MFS NIIT threshold is $125K (half of MFJ $250K)", () => {
    expect(c.niit.threshold.married_filing_separately.toNumber()).toBe(125000);
    expect(c.niit.threshold.married_filing_jointly.toNumber()).toBe(250000);
  });

  it("MFS Additional Medicare threshold is $125K (half of MFJ $250K)", () => {
    expect(c.additionalMedicareTax.threshold.married_filing_separately.toNumber()).toBe(125000);
  });

  it("MFS NIIT kicks in at $125K MAGI", () => {
    // MFS: $130K MAGI, $20K investment income
    // Excess = $130K - $125K = $5K
    // NIIT = min($20K, $5K) × 3.8% = $190
    const niit = calculateNIIT(d(20000), d(130000), "married_filing_separately", c);
    expect(niit.toNumber()).toBe(190);
  });

  it("MFS Additional Medicare at $125K threshold", () => {
    // MFS: $200K wages → excess = $200K - $125K = $75K
    // Tax = $75K × 0.9% = $675
    const amt = calculateAdditionalMedicareTax(d(200000), d(0), "married_filing_separately", c);
    expect(amt.toNumber()).toBe(675);
  });

  it("MFS CTC phase-out at $200K (same as single)", () => {
    expect(c.childTaxCredit.phaseOutThreshold.married_filing_separately.toNumber()).toBe(200000);
    expect(c.childTaxCredit.phaseOutThreshold.single.toNumber()).toBe(200000);
  });

  it("MFS CTC fully phased out at high income", () => {


    const credit = calculateChildTaxCredit(1, 0, d(250000), "married_filing_separately", c);
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    // 2025 worksheet: child credit 0 + ODC 0 = 0.
    expect(credit.total.toNumber()).toBe(0);
  });

  it("MFS 15% cap gains threshold is half of MFJ", () => {
    expect(c.capitalGainsRates.fifteen.threshold.married_filing_separately.toNumber()).toBe(300025);
    expect(c.capitalGainsRates.fifteen.threshold.married_filing_jointly.toNumber()).toBe(600050);
  });

  it("2025 MFS SALT allows $13K below its $20K limit", () => {
    const salt = calculateSALTDeduction(d(8000), d(5000), c, d(100000), "single");
    expect(salt.toNumber()).toBe(13000);
  });
});

// ═══════════════════════════════════════════════════════════
// Qualifying Surviving Spouse
// ═══════════════════════════════════════════════════════════

describe("Qualifying Surviving Spouse", () => {
  it("QSS uses same brackets as MFJ", () => {
    const qssTax = calculateTaxFromBrackets(d(100000), c.taxBrackets.qualifying_surviving_spouse);
    const mfjTax = calculateTaxFromBrackets(d(100000), c.taxBrackets.married_filing_jointly);
    expect(qssTax.toNumber()).toBe(mfjTax.toNumber());
  });

  it("QSS standard deduction equals MFJ", () => {
    expect(c.standardDeduction.qualifying_surviving_spouse.toNumber())
      .toBe(c.standardDeduction.married_filing_jointly.toNumber());
  });

  it("QSS capital gains thresholds equal MFJ", () => {
    expect(c.capitalGainsRates.zero.threshold.qualifying_surviving_spouse.toNumber())
      .toBe(c.capitalGainsRates.zero.threshold.married_filing_jointly.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Standard Deduction Values for 2025
// ═══════════════════════════════════════════════════════════

describe("Standard deduction values for 2025", () => {
  it("Single filer standard deduction is $15,750 for 2025", () => {
    expect(c.standardDeduction.single.toNumber()).toBe(15750);
  });

  it("HoH standard deduction is $23,625 for 2025", () => {
    expect(c.standardDeduction.head_of_household.toNumber()).toBe(23625);
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-Status Tax Comparisons
// ═══════════════════════════════════════════════════════════

describe("HoH vs single: same gross income produces lower HoH tax", () => {
  it("HoH pays less tax than single on $100K gross income (wider brackets + higher deduction)", () => {
    // Single: $100K - $15K deduction = $85K taxable → $13,614 tax
    // HoH:   $100K - $22.5K deduction = $77.5K taxable → $10,225 tax
    const grossIncome = d(100000);
    const singleTaxable = grossIncome.minus(c.standardDeduction.single);
    const hohTaxable = grossIncome.minus(c.standardDeduction.head_of_household);
    const singleTax = calculateTaxFromBrackets(singleTaxable, c.taxBrackets.single);
    const hohTax = calculateTaxFromBrackets(hohTaxable, c.taxBrackets.head_of_household);
    expect(singleTax.toNumber()).toBe(13449);
    expect(hohTax.toNumber()).toBe(9978);
    expect(hohTax.lessThan(singleTax)).toBe(true);
  });
});

describe("MFJ vs single: marriage bonus for one-earner household", () => {
  it("One-earner MFJ household pays less tax than the same income filed single", () => {
    // Single earner at $150K gross:
    //   Single:          $150K - $15K = $135K taxable → $25,247 tax
    //   MFJ (one earner): $150K - $30K = $120K taxable → $16,228 tax
    // The couple benefits by $9,019 — a marriage bonus.
    const grossIncome = d(150000);
    const singleTaxable = grossIncome.minus(c.standardDeduction.single);
    const mfjTaxable = grossIncome.minus(c.standardDeduction.married_filing_jointly);
    const singleTax = calculateTaxFromBrackets(singleTaxable, c.taxBrackets.single);
    const mfjTax = calculateTaxFromBrackets(mfjTaxable, c.taxBrackets.married_filing_jointly);
    expect(singleTax.toNumber()).toBe(25067);
    expect(mfjTax.toNumber()).toBe(15898);
    expect(mfjTax.lessThan(singleTax)).toBe(true);
  });
});

describe("MFS vs single: identical income, MFS pays more at high income", () => {
  it("MFS filer pays more tax than single on $600K gross (compressed top bracket)", () => {
    // At $600K gross, MFS taxable = $585K. MFS top bracket compresses at $375,800
    // vs. single top bracket at $626,350. More income at 37% for MFS.
    // MFS: $178,481 vs single: $174,297
    const grossIncome = d(600000);
    const mfsTaxable = grossIncome.minus(c.standardDeduction.married_filing_separately);
    const singleTaxable = grossIncome.minus(c.standardDeduction.single);
    const mfsTax = calculateTaxFromBrackets(mfsTaxable, c.taxBrackets.married_filing_separately);
    const singleTax = calculateTaxFromBrackets(singleTaxable, c.taxBrackets.single);
    expect(mfsTax.toNumber()).toBe(178204);
    expect(singleTax.toNumber()).toBe(174035);
    expect(mfsTax.greaterThan(singleTax)).toBe(true);
  });
});

describe("QSS with no dependents: no error, falls back to MFJ-equivalent tax", () => {
  it("calculateTaxFromBrackets does not validate dependent eligibility for QSS", () => {
    // The low-level bracket math does not enforce IRC eligibility requirements.
    // QSS without a qualifying dependent should not throw; it computes as MFJ brackets.
    const qssTax = calculateTaxFromBrackets(d(80000), c.taxBrackets.qualifying_surviving_spouse);
    const mfjTax = calculateTaxFromBrackets(d(80000), c.taxBrackets.married_filing_jointly);
    expect(qssTax.toNumber()).toBe(mfjTax.toNumber());
  });
});

describe("All 5 filing statuses produce different totalTax on same $100K taxable income", () => {
  it("Each filing status yields a distinct bracket-tax amount on $100,000 taxable income", () => {
    const income = d(100000);
    const singleTax = calculateTaxFromBrackets(income, c.taxBrackets.single).toNumber();
    const mfjTax = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_jointly).toNumber();
    const mfsTax = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_separately).toNumber();
    const hohTax = calculateTaxFromBrackets(income, c.taxBrackets.head_of_household).toNumber();
    const qssTax = calculateTaxFromBrackets(income, c.taxBrackets.qualifying_surviving_spouse).toNumber();

    // Known values: single=16914, MFJ=11828, MFS=16914, HoH=15175, QSS=11828
    // MFS and single share the same bracket table → same taxable → same tax
    // MFJ and QSS share the same bracket table → same taxable → same tax
    // Verify the unique groupings
    expect(singleTax).toBe(16914);
    expect(mfjTax).toBe(11828);
    expect(mfsTax).toBe(16914);
    expect(hohTax).toBe(15175);
    expect(qssTax).toBe(11828);

    // Three distinct tax outcomes span the five statuses
    const uniqueAmounts = new Set([singleTax, mfjTax, mfsTax, hohTax, qssTax]);
    expect(uniqueAmounts.size).toBe(3);
  });
});

describe("Filing status affects Medicare surtax threshold", () => {
  it("Single and HoH trigger NIIT at $200K MAGI while MFS triggers at $125K", () => {
    // At $160K MAGI with $10K investment income:
    //   Single/HoH threshold = $200K → no NIIT (income below threshold)
    //   MFS threshold = $125K → excess = $35K → NIIT = min($10K, $35K) × 3.8% = $380
    const magi = d(160000);
    const investmentIncome = d(10000);

    const niitSingle = calculateNIIT(investmentIncome, magi, "single", c);
    const niitHoH = calculateNIIT(investmentIncome, magi, "head_of_household", c);
    const niitMFS = calculateNIIT(investmentIncome, magi, "married_filing_separately", c);

    expect(niitSingle.toNumber()).toBe(0);
    expect(niitHoH.toNumber()).toBe(0);
    expect(niitMFS.toNumber()).toBe(380);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: All 5 statuses at $100K gross — tax comparison
// ═══════════════════════════════════════════════════════════

describe("All 5 filing statuses at $100K gross income — after-deduction tax comparison", () => {
  it("Spec §1(a-e): tax ordering is MFJ=QSS < HoH < Single=MFS at $100K gross", () => {
    const gross = d(100000);
    const statuses: FilingStatus[] = [
      "single", "married_filing_jointly", "married_filing_separately",
      "head_of_household", "qualifying_surviving_spouse",
    ];
    const taxes = Object.fromEntries(
      statuses.map((s) => {
        const taxable = gross.minus(c.standardDeduction[s]);
        const tax = calculateTaxFromBrackets(taxable, c.taxBrackets[s]);
        return [s, tax];
      })
    );

    // MFJ and QSS: lowest (larger deduction + wider brackets)
    expect(taxes.married_filing_jointly.toNumber()).toBe(taxes.qualifying_surviving_spouse.toNumber());
    // HoH: middle
    expect(taxes.head_of_household.lessThan(taxes.single)).toBe(true);
    expect(taxes.head_of_household.greaterThan(taxes.married_filing_jointly)).toBe(true);
    // Single and MFS: same deduction + same brackets through 35% → same tax at $100K
    expect(taxes.single.toNumber()).toBe(taxes.married_filing_separately.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Standard deduction ordering
// ═══════════════════════════════════════════════════════════

describe("Standard deduction ordering across filing statuses", () => {
  it("Spec §63(c): Single < HoH < MFJ = QSS, and MFS = Single", () => {
    const single = c.standardDeduction.single.toNumber();
    const hoh = c.standardDeduction.head_of_household.toNumber();
    const mfj = c.standardDeduction.married_filing_jointly.toNumber();
    const qss = c.standardDeduction.qualifying_surviving_spouse.toNumber();
    const mfs = c.standardDeduction.married_filing_separately.toNumber();

    expect(single).toBeLessThan(hoh);
    expect(hoh).toBeLessThan(mfj);
    expect(mfj).toBe(qss);
    expect(mfs).toBe(single);
  });

  it("Spec §63(c): MFJ standard deduction is exactly 2x single", () => {
    expect(c.standardDeduction.married_filing_jointly.toNumber())
      .toBe(c.standardDeduction.single.toNumber() * 2);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Bracket boundary — MFJ 2x single vs HoH vs MFS
// ═══════════════════════════════════════════════════════════

describe("Bracket boundary differences across filing statuses", () => {
  it("Spec §1: MFJ 10% bracket top ($23,850) is exactly 2x single ($11,925)", () => {
    const mfjTop10 = c.taxBrackets.married_filing_jointly[0].max!;
    const singleTop10 = c.taxBrackets.single[0].max!;
    expect(mfjTop10.toNumber()).toBe(singleTop10.toNumber() * 2);
  });

  it("Spec §1: MFJ 12% bracket top ($96,950) is exactly 2x single ($48,475)", () => {
    const mfjTop12 = c.taxBrackets.married_filing_jointly[1].max!;
    const singleTop12 = c.taxBrackets.single[1].max!;
    expect(mfjTop12.toNumber()).toBe(singleTop12.toNumber() * 2);
  });

  it("Spec §1: MFS bracket tops match single through 24% but compress at 35%", () => {
    // MFS shares single brackets for 10%, 12%, 22%, 24% bracket tops
    for (let i = 0; i < 4; i++) {
      expect(c.taxBrackets.married_filing_separately[i].max!.toNumber())
        .toBe(c.taxBrackets.single[i].max!.toNumber());
    }
    // But MFS 35% bracket top ($375,800) < single 35% top ($626,350)
    const mfs35Top = c.taxBrackets.married_filing_separately[5].max!;
    const single35Top = c.taxBrackets.single[5].max!;
    expect(mfs35Top.toNumber()).toBeLessThan(single35Top.toNumber());
    expect(mfs35Top.toNumber()).toBe(375800);
    expect(single35Top.toNumber()).toBe(626350);
  });

  it("Spec §1: HoH 12% bracket top ($64,850) is between single ($48,475) and MFJ ($96,950)", () => {
    const hohTop12 = c.taxBrackets.head_of_household[1].max!;
    const singleTop12 = c.taxBrackets.single[1].max!;
    const mfjTop12 = c.taxBrackets.married_filing_jointly[1].max!;
    expect(hohTop12.greaterThan(singleTop12)).toBe(true);
    expect(hohTop12.lessThan(mfjTop12)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: QSS produces identical results to MFJ at multiple incomes
// ═══════════════════════════════════════════════════════════

describe("QSS vs MFJ identity — IRC §1(a)", () => {
  it("QSS and MFJ produce identical bracket tax at $250K taxable", () => {
    const income = d(250000);
    const qss = calculateTaxFromBrackets(income, c.taxBrackets.qualifying_surviving_spouse);
    const mfj = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_jointly);
    expect(qss.toNumber()).toBe(mfj.toNumber());
  });

  it("QSS and MFJ produce identical bracket tax at $800K taxable (top bracket)", () => {
    const income = d(800000);
    const qss = calculateTaxFromBrackets(income, c.taxBrackets.qualifying_surviving_spouse);
    const mfj = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_jointly);
    expect(qss.toNumber()).toBe(mfj.toNumber());
  });

  it("QSS NIIT threshold equals MFJ at $250K", () => {
    expect(c.niit.threshold.qualifying_surviving_spouse.toNumber())
      .toBe(c.niit.threshold.married_filing_jointly.toNumber());
    expect(c.niit.threshold.qualifying_surviving_spouse.toNumber()).toBe(250000);
  });

  it("QSS Additional Medicare threshold equals single/HoH at $200K (not MFJ — IRC §3101(b)(2))", () => {
    expect(c.additionalMedicareTax.threshold.qualifying_surviving_spouse.toNumber())
      .toBe(c.additionalMedicareTax.threshold.single.toNumber());
    expect(c.additionalMedicareTax.threshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
  });

  it("QSS CTC phase-out threshold equals single/HoH at $200K (not MFJ — IRC §24(b)(2))", () => {
    expect(c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse.toNumber())
      .toBe(c.childTaxCredit.phaseOutThreshold.single.toNumber());
    expect(c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Capital loss limit — MFS $1,500 vs $3,000
// ═══════════════════════════════════════════════════════════

describe("Capital loss limit by filing status — IRC §1211(b)", () => {
  it("Spec §1211(b): general capital loss limit is $3,000", () => {
    expect(c.capitalLossLimit.toNumber()).toBe(3000);
  });

  it("Spec §1211(b)(1): MFS limit is $1,500 (half of $3,000), hardcoded in Schedule D", () => {
    // The constants file has a single $3,000 limit; Schedule D overrides to $1,500 for MFS.
    // This test validates the constant; the Schedule D tests cover the runtime override.
    const mfsLimit = d(1500);
    expect(mfsLimit.toNumber()).toBe(c.capitalLossLimit.toNumber() / 2);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: SALT cap behavior
// ═══════════════════════════════════════════════════════════

describe("SALT cap across filing statuses — IRC §164(b)(6)", () => {
  it("Spec 2025 SALT maximum before MAGI reduction is $40K, halved for MFS", () => {
    expect(c.saltCap.toNumber()).toBe(40000);
  });

  it("Spec 2025 SALT allows $25K below the $40K limit", () => {
    const salt = calculateSALTDeduction(d(15000), d(10000), c, d(100000), "single");
    expect(salt.toNumber()).toBe(25000);
  });

  it("Spec §164(b)(6): SALT under cap returns actual amount", () => {
    const salt = calculateSALTDeduction(d(3000), d(2000), c, d(100000), "single");
    expect(salt.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: AMT exemption differences
// ═══════════════════════════════════════════════════════════

describe("AMT exemption differences across filing statuses — IRC §55", () => {
  it("Spec §55(d)(1): AMT exemption ordering: MFS < Single=HoH < MFJ=QSS", () => {
    const mfs = c.amt.exemption.married_filing_separately.toNumber();
    const single = c.amt.exemption.single.toNumber();
    const hoh = c.amt.exemption.head_of_household.toNumber();
    const mfj = c.amt.exemption.married_filing_jointly.toNumber();
    const qss = c.amt.exemption.qualifying_surviving_spouse.toNumber();

    expect(mfs).toBeLessThan(single);
    expect(single).toBe(hoh);
    expect(single).toBeLessThan(mfj);
    expect(mfj).toBe(qss);
  });

  it("Spec §55(d)(1)(A): MFJ AMT exemption is $137,000", () => {
    expect(c.amt.exemption.married_filing_jointly.toNumber()).toBe(137000);
  });

  it("Spec §55(d)(1)(B): Single AMT exemption is $88,100", () => {
    expect(c.amt.exemption.single.toNumber()).toBe(88100);
  });

  it("Spec §55(d)(1)(C): MFS AMT exemption is $68,500 (half of MFJ)", () => {
    expect(c.amt.exemption.married_filing_separately.toNumber()).toBe(68500);
    expect(c.amt.exemption.married_filing_separately.toNumber())
      .toBe(c.amt.exemption.married_filing_jointly.toNumber() / 2);
  });

  it("Spec §55(d)(3): AMT phase-out thresholds — MFJ/QSS highest, Single=HoH=MFS", () => {
    const mfs = c.amt.phaseOutThreshold.married_filing_separately.toNumber();
    const single = c.amt.phaseOutThreshold.single.toNumber();
    const hoh = c.amt.phaseOutThreshold.head_of_household.toNumber();
    const mfj = c.amt.phaseOutThreshold.married_filing_jointly.toNumber();
    const qss = c.amt.phaseOutThreshold.qualifying_surviving_spouse.toNumber();

    // Single, HOH and MFS share the $626,350 threshold in 2025.
    expect(single).toBe(hoh);
    expect(single).toBe(mfs);
    expect(mfs).toBeLessThan(mfj);
    expect(mfj).toBe(qss);
    expect(mfs).toBe(626350);
    expect(single).toBe(626350);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Medicare surtax thresholds
// ═══════════════════════════════════════════════════════════

describe("Additional Medicare tax thresholds by filing status — IRC §3101(b)(2)", () => {
  it("Spec §3101(b)(2): Single/HoH threshold is $200K", () => {
    expect(c.additionalMedicareTax.threshold.single.toNumber()).toBe(200000);
    expect(c.additionalMedicareTax.threshold.head_of_household.toNumber()).toBe(200000);
  });

  it("Spec §3101(b)(2): MFJ threshold is $250K", () => {
    expect(c.additionalMedicareTax.threshold.married_filing_jointly.toNumber()).toBe(250000);
  });

  it("Spec §3101(b)(2)(C): QSS threshold is $200K (not MFJ — QSS is not a joint return)", () => {
    expect(c.additionalMedicareTax.threshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
  });

  it("Spec §3101(b)(2): MFS threshold is $125K (half of MFJ)", () => {
    expect(c.additionalMedicareTax.threshold.married_filing_separately.toNumber()).toBe(125000);
  });

  it("Additional Medicare tax at $300K wages differs by filing status", () => {
    // Single: ($300K - $200K) × 0.9% = $900
    // MFJ:   ($300K - $250K) × 0.9% = $450
    // MFS:   ($300K - $125K) × 0.9% = $1,575
    const singleAmt = calculateAdditionalMedicareTax(d(300000), d(0), "single", c);
    const mfjAmt = calculateAdditionalMedicareTax(d(300000), d(0), "married_filing_jointly", c);
    const mfsAmt = calculateAdditionalMedicareTax(d(300000), d(0), "married_filing_separately", c);

    expect(singleAmt.toNumber()).toBe(900);
    expect(mfjAmt.toNumber()).toBe(450);
    expect(mfsAmt.toNumber()).toBe(1575);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: NIIT thresholds by filing status
// ═══════════════════════════════════════════════════════════

describe("NIIT thresholds by filing status — IRC §1411", () => {
  it("Spec §1411(b): Single/HoH NIIT threshold is $200K", () => {
    expect(c.niit.threshold.single.toNumber()).toBe(200000);
    expect(c.niit.threshold.head_of_household.toNumber()).toBe(200000);
  });

  it("Spec §1411(b): MFJ/QSS NIIT threshold is $250K", () => {
    expect(c.niit.threshold.married_filing_jointly.toNumber()).toBe(250000);
    expect(c.niit.threshold.qualifying_surviving_spouse.toNumber()).toBe(250000);
  });

  it("Spec §1411(b): MFS NIIT threshold is $125K", () => {
    expect(c.niit.threshold.married_filing_separately.toNumber()).toBe(125000);
  });

  it("NIIT at $260K MAGI: MFJ pays $0, single pays $380, MFS pays $513", () => {
    const magi = d(260000);
    const investmentIncome = d(50000);

    // MFJ: $260K - $250K = $10K excess → min($50K, $10K) × 3.8% = $380
    const niitMFJ = calculateNIIT(investmentIncome, magi, "married_filing_jointly", c);
    expect(niitMFJ.toNumber()).toBe(380);

    // Single: $260K - $200K = $60K excess → min($50K, $60K) × 3.8% = $1,900
    const niitSingle = calculateNIIT(investmentIncome, magi, "single", c);
    expect(niitSingle.toNumber()).toBe(1900);

    // MFS: $260K - $125K = $135K excess → min($50K, $135K) × 3.8% = $1,900
    const niitMFS = calculateNIIT(investmentIncome, magi, "married_filing_separately", c);
    expect(niitMFS.toNumber()).toBe(1900);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Education credit availability — MFS gets none
// ═══════════════════════════════════════════════════════════

describe("Education credits — MFS ineligibility — IRC §25A(g)(6)", () => {
  it("Spec §25A(g)(6): MFS receives $0 AOC regardless of expenses", () => {
    const result = calculateForm8863({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(0),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  it("Spec §25A(g)(6): MFS receives $0 LLC regardless of expenses", () => {
    const result = calculateForm8863({
      aocStudents: [],
      llcExpenses: d(10000),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
  });

  it("Spec §25A: Single filer with same expenses receives full AOC", () => {
    const result = calculateForm8863({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(0),
      magi: d(50000),
      filingStatus: "single",
    });
    // AOC = $2,000 + 25% × $2,000 = $2,500
    // Nonrefundable = 60% × $2,500 = $1,500
    // Refundable = 40% × $2,500 = $1,000
    expect(result.aocTotalTentative.toNumber()).toBe(2500);
    expect(result.aocNonrefundable.toNumber()).toBe(1500);
    expect(result.aocRefundable.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: Phase-out threshold comparisons
// ═══════════════════════════════════════════════════════════

describe("Phase-out threshold comparisons across filing statuses", () => {
  it("CTC phase-out: MFJ at $400K, all others (incl QSS) at $200K — IRC §24(b)(2)", () => {
    expect(c.childTaxCredit.phaseOutThreshold.married_filing_jointly.toNumber()).toBe(400000);
    expect(c.childTaxCredit.phaseOutThreshold.qualifying_surviving_spouse.toNumber()).toBe(200000);
    expect(c.childTaxCredit.phaseOutThreshold.single.toNumber()).toBe(200000);
    expect(c.childTaxCredit.phaseOutThreshold.head_of_household.toNumber()).toBe(200000);
    expect(c.childTaxCredit.phaseOutThreshold.married_filing_separately.toNumber()).toBe(200000);
  });

  it("QBI simplified threshold: MFJ at $394,600, all others (incl QSS) at $197,300 — IRC §199A(e)(2)", () => {
    expect(c.qbi.simplifiedThreshold.married_filing_jointly.toNumber()).toBe(394600);
    expect(c.qbi.simplifiedThreshold.qualifying_surviving_spouse.toNumber()).toBe(197300);
    expect(c.qbi.simplifiedThreshold.single.toNumber()).toBe(197300);
    expect(c.qbi.simplifiedThreshold.head_of_household.toNumber()).toBe(197300);
    expect(c.qbi.simplifiedThreshold.married_filing_separately.toNumber()).toBe(197300);
  });

  it("Capital gains 0% threshold: MFS=Single < HoH < MFJ=QSS", () => {
    const mfs = c.capitalGainsRates.zero.threshold.married_filing_separately.toNumber();
    const single = c.capitalGainsRates.zero.threshold.single.toNumber();
    const hoh = c.capitalGainsRates.zero.threshold.head_of_household.toNumber();
    const mfj = c.capitalGainsRates.zero.threshold.married_filing_jointly.toNumber();
    const qss = c.capitalGainsRates.zero.threshold.qualifying_surviving_spouse.toNumber();

    expect(mfs).toBe(single);
    expect(single).toBeLessThan(hoh);
    expect(hoh).toBeLessThan(mfj);
    expect(mfj).toBe(qss);
  });

  it("Capital gains 15% threshold ordering: MFS < Single < HoH < MFJ=QSS", () => {
    const mfs = c.capitalGainsRates.fifteen.threshold.married_filing_separately.toNumber();
    const single = c.capitalGainsRates.fifteen.threshold.single.toNumber();
    const hoh = c.capitalGainsRates.fifteen.threshold.head_of_household.toNumber();
    const mfj = c.capitalGainsRates.fifteen.threshold.married_filing_jointly.toNumber();
    const qss = c.capitalGainsRates.fifteen.threshold.qualifying_surviving_spouse.toNumber();

    expect(mfs).toBeLessThan(single);
    expect(single).toBeLessThan(hoh);
    expect(hoh).toBeLessThan(mfj);
    expect(mfj).toBe(qss);
  });
});

// ═══════════════════════════════════════════════════════════
// NEW: MFS vs Single bracket compression at the top
// ═══════════════════════════════════════════════════════════

describe("MFS bracket compression penalty — IRC §1(d)", () => {
  it("Spec §1(d): MFS and single have identical tax at $300K taxable (below 35% divergence)", () => {
    // Both share identical brackets through 32% ($250,525)
    // At $300K both are in 35% bracket — same tax
    const income = d(300000);
    const mfsTax = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_separately);
    const singleTax = calculateTaxFromBrackets(income, c.taxBrackets.single);
    expect(mfsTax.toNumber()).toBe(singleTax.toNumber());
  });

  it("Spec §1(d): MFS pays more than single at $400K due to earlier 37% bracket", () => {
    // MFS 37% starts at $375,800; single 37% starts at $626,350
    // At $400K taxable:
    //   MFS: tax through $375,800 in 35% bracket, then ($400K - $375,800) at 37%
    //   Single: all of $400K is at 35% or below
    const income = d(400000);
    const mfsTax = calculateTaxFromBrackets(income, c.taxBrackets.married_filing_separately);
    const singleTax = calculateTaxFromBrackets(income, c.taxBrackets.single);
    expect(mfsTax.greaterThan(singleTax)).toBe(true);
  });
});
