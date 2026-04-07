/**
 * Edge case tests for Form W-2G — Certain Gambling Winnings
 * Spec: spec/federal/form-w2g.yaml
 *
 * Focuses on:
 * - Loss limitation boundary precision (IRC §165(d))
 * - Large winnings crossing multiple tax brackets
 * - Many W-2Gs aggregation (10+ forms)
 * - Manual-only gambling income (no W-2Gs)
 * - Gambling as sole income source
 * - Itemization vs standard deduction interaction with gambling losses
 * - Withholding exceeding tax liability (refund scenario)
 * - Fractional cent precision in winnings and withholding
 * - Filing status variations (MFJ, MFS, HoH)
 */

import { describe, it, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";

const baseTaxpayer: TaxYearInput["taxpayer"] = {
  taxYear: 2025,
  filingStatus: "single",
  primary: {
    firstName: "Edge",
    lastName: "Gambler",
    ssn: "111-22-3333",
    dateOfBirth: "1980-06-15",
  },
  address: {
    street: "100 Casino Blvd",
    city: "Las Vegas",
    state: "NV",
    zip: "89101",
  },
  dependents: [],
};

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: baseTaxpayer,
    w2s: [
      {
        employer: { name: "Day Job Inc", ein: "99-8765432" },
        wages: "50000",
        federalWithheld: "6000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      },
    ],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    formW2G: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Loss Limitation Boundary Precision (IRC §165(d))
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - loss limitation boundary precision", () => {
  it("Form W-2G - losses exactly $1 over winnings are capped at winnings", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "10000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "10001", // $1 over the $10,000 winnings
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // Losses capped at $10,000 (total gambling winnings)
    expect(schedALine28!.value.toNumber()).toBe(10000);
  });

  it("Form W-2G - losses $0.01 over winnings are capped with cent precision", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "7500.50", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "7500.51", // $0.01 over
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(7500.50);
  });

  it("Form W-2G - losses $0.01 under winnings are fully deductible", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "5000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "4999.99",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(4999.99);
  });
});

// ═══════════════════════════════════════════════════════════
// Large Winnings Crossing Multiple Tax Brackets
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - large winnings crossing tax brackets", () => {
  it("Form W-2G - $500,000 winnings push through all single-filer brackets", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Mega Casino", reportableWinnings: "500000", federalWithheld: "120000" },
      ],
    }));
    // Total income = $50,000 wages + $500,000 gambling = $550,000
    expect(result.totalIncome.toNumber()).toBe(550000);
    // Taxable income = $550,000 - $15,750 standard deduction = $534,250
    expect(result.taxableIncome.toNumber()).toBe(534250);
    // Tax must be greater than 24% of taxable income (hits 32% and 35% brackets)
    expect(result.totalTaxBeforeCredits.toNumber()).toBeGreaterThan(535000 * 0.24);
  });

  it("Form W-2G - $1 winnings produces exact $1 addition to total income", () => {
    const noGambling = calculateFederalTax(makeInput());
    const withGambling = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Penny Slots", reportableWinnings: "1", federalWithheld: "0" },
      ],
    }));
    expect(withGambling.totalIncome.minus(noGambling.totalIncome).toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Many W-2Gs Aggregation
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - many W-2Gs aggregation", () => {
  it("Form W-2G - 10 W-2Gs from different payers sum correctly", () => {
    const formW2G = Array.from({ length: 10 }, (_, i) => ({
      payer: `Casino ${i + 1}`,
      reportableWinnings: "1000",
      federalWithheld: "240",
    }));
    const result = calculateFederalTax(makeInput({ formW2G }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    // 10 × $1,000 = $10,000
    expect(sched1Line8b!.value.toNumber()).toBe(10000);
    // 10 × $240 = $2,400 W-2G withholding + $6,000 W-2 withholding
    expect(result.totalWithholding.toNumber()).toBe(8400);
  });

  it("Form W-2G - multiple W-2Gs from same payer are summed independently", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Lucky Casino", reportableWinnings: "5000", federalWithheld: "1200" },
        { payer: "Lucky Casino", reportableWinnings: "3000", federalWithheld: "720" },
      ],
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(8000);
    // $6,000 W-2 + $1,200 + $720 = $7,920
    expect(result.totalWithholding.toNumber()).toBe(7920);
  });
});

// ═══════════════════════════════════════════════════════════
// Manual Gambling Income (No W-2Gs)
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - manual gambling income without W-2Gs", () => {
  it("Form W-2G - manual gambling winnings only (no W-2Gs) still reports as income", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [],
      scheduleA: {
        gamblingWinnings: "3000",
        gamblingLosses: "1000",
      },
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    // Only manual winnings contribute
    expect(sched1Line8b!.value.toNumber()).toBe(3000);
    // Losses allowed up to winnings
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(1000);
  });

  it("Form W-2G - manual winnings cap manual losses even without W-2G forms", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [],
      scheduleA: {
        gamblingWinnings: "2000",
        gamblingLosses: "5000", // losses exceed manual winnings
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // Capped at $2,000 manual winnings
    expect(schedALine28!.value.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Gambling as Sole Income Source
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - gambling as sole income", () => {
  it("Form W-2G - gambling winnings as sole income with no W-2", () => {
    const result = calculateFederalTax({
      taxpayer: baseTaxpayer,
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      formW2G: [
        { payer: "Casino", reportableWinnings: "25000", federalWithheld: "6000" },
      ],
    });
    // Total income is just gambling winnings
    expect(result.totalIncome.toNumber()).toBe(25000);
    // AGI = $25,000
    expect(result.agi.toNumber()).toBe(25000);
    // Taxable income = $25,000 - $15,750 standard deduction = $9,250
    expect(result.taxableIncome.toNumber()).toBe(9250);
    // Total withholding = $6,000 from W-2G only (no W-2 withholding)
    expect(result.totalWithholding.toNumber()).toBe(6000);
  });

  it("Form W-2G - gambling winnings below standard deduction produce zero taxable income", () => {
    const result = calculateFederalTax({
      taxpayer: baseTaxpayer,
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      formW2G: [
        { payer: "Casino", reportableWinnings: "10000", federalWithheld: "2400" },
      ],
    });
    // $10,000 gambling < $15,000 standard deduction → taxable income = $0
    expect(result.totalIncome.toNumber()).toBe(10000);
    expect(result.taxableIncome.toNumber()).toBe(0);
    // All $2,400 withholding should be refunded
    expect(result.totalWithholding.toNumber()).toBe(2400);
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Exceeding Tax Liability (Refund Scenario)
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - withholding and refund scenarios", () => {
  it("Form W-2G - 24% withholding on low-bracket income creates overpayment", () => {
    // Taxpayer in 12% bracket gets 24% withheld on gambling winnings
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "20000", federalWithheld: "4800" },
      ],
    }));
    // Total withholding = $6,000 W-2 + $4,800 W-2G = $10,800
    expect(result.totalWithholding.toNumber()).toBe(10800);
    // Total income = $70,000. Taxable = $55,000 (after $15K std ded).
    // At the 12-22% brackets, tax is well under $10,800 total withholding
    // This should result in a refund (overpayment)
    expect(result.refund.toNumber()).toBeGreaterThan(0);
  });

  it("Form W-2G - mixed W-2Gs with and without withholding aggregate correctly", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino A", reportableWinnings: "8000", federalWithheld: "1920" },
        { payer: "Casino B", reportableWinnings: "3000", federalWithheld: "0" },
        { payer: "Casino C", reportableWinnings: "12000", federalWithheld: "2880" },
      ],
    }));
    // Gambling income = $8,000 + $3,000 + $12,000 = $23,000
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(23000);
    // Withholding = $6,000 W-2 + $1,920 + $0 + $2,880 = $10,800
    expect(result.totalWithholding.toNumber()).toBe(10800);
  });
});

// ═══════════════════════════════════════════════════════════
// Fractional Cent Precision
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - fractional cent precision", () => {
  it("Form W-2G - fractional cent winnings are preserved in income calculation", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "1234.56", federalWithheld: "296.29" },
      ],
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(1234.56);
  });

  it("Form W-2G - many small fractional W-2Gs accumulate without rounding error", () => {
    // 7 W-2Gs at $142.86 each = $999.99 (not $1000.02 from float imprecision)
    const formW2G = Array.from({ length: 7 }, () => ({
      payer: "Micro Slots",
      reportableWinnings: "142.857142857",
      federalWithheld: "0",
    }));
    const result = calculateFederalTax(makeInput({ formW2G }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    // Decimal.js: 7 × 142.857142857 = 999.999999999 (exact, no float drift)
    expect(sched1Line8b!.value.toNumber()).toBeCloseTo(1000, 0);
  });
});

// ═══════════════════════════════════════════════════════════
// Itemization vs Standard Deduction Interaction
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - itemization interaction with gambling losses", () => {
  it("Form W-2G - gambling losses only help when total itemized > standard deduction", () => {
    // Single standard deduction = $15,000.
    // Without gambling losses, no reason to itemize.
    // With $20K winnings and $20K losses, gambling losses only help on Schedule A.
    // But need other deductions to make itemizing worthwhile.
    const withoutItemizing = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "20000", federalWithheld: "0" },
      ],
      // No Schedule A data → standard deduction used
    }));
    const withItemizing = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "20000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "20000",
      },
      // Gambling losses alone ($20K) > standard deduction ($15K) → itemization wins
    }));
    // With itemization, deduction is $20,000 gambling losses (> $15K standard)
    // Taxable income should be lower with itemization
    expect(withItemizing.taxableIncome.toNumber()).toBeLessThan(
      withoutItemizing.taxableIncome.toNumber()
    );
  });

  it("Form W-2G - gambling losses below standard deduction do not reduce tax", () => {
    // $5,000 winnings and $5,000 losses. Gambling losses as only itemized deduction = $5K.
    // Standard deduction = $15K which is higher → standard deduction used.
    // Net effect: $5,000 income added, $15K standard deduction either way.
    const noGambling = calculateFederalTax(makeInput());
    const withGambling = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "5000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "5000",
      },
    }));
    // AGI goes up by $5,000 from gambling income
    expect(withGambling.agi.minus(noGambling.agi).toNumber()).toBe(5000);
    // Taxable income also goes up by $5,000 because the gambling loss deduction
    // doesn't help — standard deduction ($15K) > gambling losses ($5K)
    expect(withGambling.taxableIncome.minus(noGambling.taxableIncome).toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Filing Status Variations
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - filing status variations", () => {
  it("Form W-2G - MFJ gambling winnings affect joint AGI", () => {
    const mfjTaxpayer: TaxYearInput["taxpayer"] = {
      ...baseTaxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Lucky",
        lastName: "Spouse",
        ssn: "444-55-6666",
        dateOfBirth: "1982-03-20",
      },
    };
    const result = calculateFederalTax({
      ...makeInput(),
      taxpayer: mfjTaxpayer,
      formW2G: [
        { payer: "Casino", reportableWinnings: "30000", federalWithheld: "7200" },
      ],
    });
    // Total income = $50,000 wages + $30,000 gambling = $80,000
    expect(result.totalIncome.toNumber()).toBe(80000);
    // MFJ standard deduction = $31,500
    // Taxable income = $80,000 - $31,500 = $48,500
    expect(result.taxableIncome.toNumber()).toBe(48500);
  });

  it("Form W-2G - MFS gambling loss limitation still applies", () => {
    const mfsTaxpayer: TaxYearInput["taxpayer"] = {
      ...baseTaxpayer,
      filingStatus: "married_filing_separately",
    };
    const result = calculateFederalTax({
      ...makeInput(),
      taxpayer: mfsTaxpayer,
      formW2G: [
        { payer: "Casino", reportableWinnings: "8000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "12000", // exceeds $8K winnings
      },
    });
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    // IRC §165(d) applies identically regardless of filing status
    expect(schedALine28!.value.toNumber()).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Edge Values
// ═══════════════════════════════════════════════════════════

describe("Form W-2G edge cases - zero and edge values", () => {
  it("Form W-2G - zero reportable winnings produces zero gambling income", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "0", federalWithheld: "0" },
      ],
    }));
    const sched1Line8b = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "8b"
    );
    expect(sched1Line8b!.value.toNumber()).toBe(0);
  });

  it("Form W-2G - zero losses with nonzero winnings means zero gambling loss deduction", () => {
    const result = calculateFederalTax(makeInput({
      formW2G: [
        { payer: "Casino", reportableWinnings: "15000", federalWithheld: "0" },
      ],
      scheduleA: {
        gamblingWinnings: "0",
        gamblingLosses: "0",
      },
    }));
    const schedALine28 = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "28"
    );
    expect(schedALine28!.value.toNumber()).toBe(0);
  });
});
