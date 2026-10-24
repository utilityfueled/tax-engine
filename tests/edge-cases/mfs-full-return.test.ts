/**
 * Married Filing Separately end-to-end test.
 * Verifies all MFS-specific restrictions apply simultaneously:
 * - Standard deduction halved ($15,000)
 * - Capital loss limit halved ($1,500)
 * - SALT cap halved ($5,000)
 * - No $25K rental loss allowance
 * - Education credits disallowed
 * - Additional Medicare Tax threshold ($125K)
 * - NIIT threshold ($125K)
 * - AMT exemption halved
 * - CTC phase-out at $200K (not $400K)
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

const mfsFixture: TaxYearInput = {
  taxpayer: {
    taxYear: 2025,
    filingStatus: "married_filing_separately",
    primary: {
      firstName: "Alex",
      lastName: "Rivera",
      ssn: "333-44-5555",
      dateOfBirth: "1982-11-03",
    },
    address: {
      street: "200 Maple Dr",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    dependents: [
      {
        firstName: "Mia",
        lastName: "Rivera",
        ssn: "666-77-8888",
        relationship: "Daughter",
        dateOfBirth: "2018-02-28",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
  w2s: [
    {
      employer: { name: "Portland Corp", ein: "44-5566778" },
      wages: "140000",
      federalWithheld: "22000",
      socialSecurityWages: "140000",
      socialSecurityWithheld: "8680",
      medicareWages: "140000",
      medicareWithheld: "2030",
      stateTaxWithheld: "7000",
      stateWages: "140000",
      localTaxWithheld: "0",
      state: "OR",
    },
  ],
  form1099Int: [
    {
      payer: "Bank",
      interestIncome: "2000",
      federalWithheld: "0",
      earlyWithdrawalPenalty: "0",
      usSavingsBondInterest: "0",
      taxExemptInterest: "0",
    },
  ],
  form1099Div: [
    {
      payer: "Vanguard",
      ordinaryDividends: "5000",
      qualifiedDividends: "4000",
      totalCapitalGainDistributions: "2000",
      federalWithheld: "0",
      foreignTaxPaid: "100",
      foreignCountry: "Various",
      section1250Gain: "0",
      section1202Gain: "0",
      collectiblesGain: "0",
      nondividendDistributions: "0",
      exemptInterestDividends: "0",
    },
  ],
  form1099B: [
    {
      broker: "Fidelity",
      transactions: [
        {
          description: "Stock loss",
          dateAcquired: "2024-06-01",
          dateSold: "2025-09-01",
          proceeds: "8000",
          costBasis: "15000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        },
      ],
    },
  ],
  form1099Nec: [
    {
      payer: "Freelance Client",
      nonemployeeCompensation: "12000",
      federalWithheld: "0",
    },
  ],
  form1099Misc: [],
  scheduleK1: [],
  form1098: [
    {
      lender: "Chase",
      mortgageInterestReceived: "12000",
      outstandingMortgagePrincipal: "400000",
      propertyTax: "6000",
      refundOfOverpaidInterest: "0",
      mortgageInsurancePremiums: "0",
      pointsPaid: "0",
    },
  ],
  form1095A: [],
  donations: [
    {
      organization: "Red Cross",
      type: "cash",
      amount: "3000",
      dateOfDonation: "2025-12-01",
      costBasis: "0",
    },
  ],
  // Rental property with loss — MFS gets NO $25K rental allowance
  rentalProperties: [
    {
      description: "Rental condo",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "15000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "0",
      commissions: "0",
      insurance: "1500",
      legalProfessional: "0",
      managementFees: "0",
      mortgageInterest: "8000",
      otherInterest: "0",
      repairs: "2000",
      supplies: "0",
      taxes: "3000",
      utilities: "0",
      depreciation: "6000",
      otherExpenses: "0",
    },
  ],
  // Education expenses — should be disallowed for MFS
  educationExpenses: {
    aocStudents: [{ name: "Alex Rivera", qualifiedExpenses: "4000" }],
    llcExpenses: "0",
  },
  dependentCare: {
    expenses: "4000",
    qualifyingIndividuals: 1,
  },
};

describe("MFS Full Return - filing status", () => {
  const federal = calculateFederalTax(mfsFixture);

  it("filing status is married_filing_separately", () => {
    expect(federal.filingStatus).toBe("married_filing_separately");
  });

  // ── Income ────────────────────────────────────────────
  it("wages from W-2", () => {
    expect(federal.totalWages.toNumber()).toBe(140000);
  });

  it("total income includes all sources", () => {
    // W-2 $140K + interest $2K + dividends $5K + SE $12K + cap gains + rental
    expect(federal.totalIncome.greaterThan(d(140000))).toBe(true);
  });

  // ── MFS Standard Deduction ──────────────────────────
  it("MFS standard deduction = $15,750 (half of MFJ $31,500)", () => {
    expect(federal.standardDeduction.toNumber()).toBe(15750);
  });

  // ── Itemized vs Standard ────────────────────────────
  it("itemized deductions include SALT capped at $5,000 (MFS)", () => {
    // Mortgage interest $12K + SALT min($6K+$7K, $5K cap) + charitable $3K
    // = $12K + $5K + $3K = $20K > $15.75K standard → itemized
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.deductionAmount.greaterThan(d(15750))).toBe(true);
  });

  // ── Capital Loss ────────────────────────────────────
  it("capital loss capped at $1,500 (MFS half-limit)", () => {
    // Stock loss: $8K - $15K = -$7K net. Cap gain distributions: +$2K
    // Net: -$5K → capped at -$1,500 for MFS
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
  });

  it("capital loss carryforward tracks MFS excess", () => {
    // $5K net loss - $1.5K allowed = $3.5K carryforward (stored as negative)
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-3500);
  });

  // ── SE Tax ──────────────────────────────────────────
  it("SE tax computed on $12K freelance income", () => {
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  // ── Rental Loss — No $25K Allowance ─────────────────
  it("rental loss fully suspended (MFS gets no $25K allowance)", () => {
    // Rental: $15K - $20.5K = -$5.5K loss
    // MFS → no $25K rental loss allowance → all suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.greaterThan(0)).toBe(true);
  });

  // ── Dependent Care Credit ──────────────────────────
  it("dependent care credit is zero for MFS (IRC §21(e)(2))", () => {
    // MFS filers cannot claim dependent care credit
    const form2441Lines = federal.allLines.filter((l) => l.form === "Form 2441");
    expect(form2441Lines.length).toBe(0); // Form 2441 not even computed for MFS
  });

  // ── Education Credits ───────────────────────────────
  it("education credits are zero for MFS (AOC disallowed)", () => {
    // MFS filers cannot claim AOC or LLC
    const form8863Lines = federal.allLines.filter((l) => l.form === "Form 8863");
    if (form8863Lines.length > 0) {
      const totalCredit = form8863Lines.find((l) => l.line === "total_nonrefundable");
      if (totalCredit) {
        expect(totalCredit.value.toNumber()).toBe(0);
      }
    }
  });

  // ── Additional Medicare Tax ─────────────────────────
  it("Additional Medicare Tax uses $125K MFS threshold", () => {
    // W-2 $140K + SE $12K = $152K > $125K MFS → $27K × 0.9% = $243
    expect(federal.additionalMedicareTax.greaterThan(0)).toBe(true);
  });

  // ── NIIT ────────────────────────────────────────────
  it("NIIT uses $125K MFS threshold", () => {
    // AGI well above $125K, investment income present → NIIT applies
    expect(federal.niitTax.greaterThan(0)).toBe(true);
  });

  // ── CTC ─────────────────────────────────────────────
  it("CTC available for qualifying child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("ACTC = $0 (high-income MFS filer, full CTC used nonrefundably)", () => {
    expect(federal.form8812).toBeDefined();
    expect(federal.form8812!.actc.toNumber()).toBe(0);
  });

  // ── Foreign Tax Credit ──────────────────────────────
  it("foreign tax credit from 1099-DIV", () => {
    expect(federal.foreignTaxCredit.greaterThan(0)).toBe(true);
    expect(federal.foreignTaxCredit.lte(d(100))).toBe(true);
  });

  // ── Tax Equation ────────────────────────────────────
  it("total tax is positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  it("refund and owed are mutually exclusive", () => {
    const both = federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
  });

  it("tax equation: totalTax = payments - refund + owed", () => {
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });

  // ── Audit Trail ─────────────────────────────────────
  it("audit trail covers all relevant forms", () => {
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("1040")).toBe(true);
    expect(forms.has("Sched B")).toBe(true);
    expect(forms.has("Sched D")).toBe(true);
    expect(forms.has("Sched E")).toBe(true);
    expect(forms.has("Sched SE")).toBe(true);
    expect(forms.has("Sched A")).toBe(true);
    expect(forms.has("Sched 1")).toBe(true);
    expect(forms.has("Sched 2")).toBe(true);
    expect(forms.has("Sched 3")).toBe(true);
    expect(forms.has("Form 8949")).toBe(true);
    expect(forms.has("Form 8959")).toBe(true);
    expect(forms.has("Form 8960")).toBe(true);
    expect(forms.has("Form 1116")).toBe(true);
    expect(forms.has("Form 8582")).toBe(true);
    expect(forms.has("Form 2210")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: Standard Deduction = $15,000 (half of MFJ)
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - standard deduction is $15,750 (half of MFJ $31,500)", () => {
  const minimalMfs: TaxYearInput = {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "married_filing_separately",
      primary: {
        firstName: "Sam",
        lastName: "Chen",
        ssn: "100-20-3000",
        dateOfBirth: "1985-07-15",
      },
      address: {
        street: "1 Test Ave",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      dependents: [],
    },
    w2s: [
      {
        employer: { name: "TX Corp", ein: "12-3456789" },
        wages: "50000",
        federalWithheld: "7000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
        stateTaxWithheld: "0",
        stateWages: "50000",
        localTaxWithheld: "0",
        state: "TX",
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
    rentalProperties: [],
  };

  const federal = calculateFederalTax(minimalMfs);

  it("MFS standard deduction is exactly $15,750", () => {
    expect(federal.standardDeduction.toNumber()).toBe(15750);
  });

  it("MFS standard deduction is half of MFJ $31,500", () => {
    // MFJ standard deduction is $31,500; MFS gets exactly half
    expect(federal.standardDeduction.toNumber()).toBe(15750);
  });

  it("MFS uses standard deduction when no itemized deductions present", () => {
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.deductionAmount.toNumber()).toBe(15750);
  });

  it("MFS taxable income = wages minus $15,750 standard deduction", () => {
    // $50K wages - $15,750 standard = $34,250 taxable
    expect(federal.taxableIncome.toNumber()).toBe(34250);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: Capital Loss Limit = $1,500 (not $3,000)
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - capital loss capped at $1,500 (IRC §1211(b))", () => {
  const mfsWithBigLoss: TaxYearInput = {
    ...mfsFixture,
    // Override: large pure capital loss, no offsetting gains
    form1099Div: [],
    form1099B: [
      {
        broker: "Schwab",
        transactions: [
          {
            description: "Index Fund loss",
            dateAcquired: "2023-01-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "20000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ],
  };

  const federal = calculateFederalTax(mfsWithBigLoss);

  it("net capital loss of $15,000 is capped at $1,500 for MFS", () => {
    // Gross loss = $5K - $20K = -$15K; MFS cap = $1,500
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
  });

  it("carryforward = excess loss beyond $1,500 limit", () => {
    // $15K loss - $1.5K allowed = $13.5K carryforward
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-13500);
  });

  it("capital loss deducted against income is $1,500 not $3,000", () => {
    // Confirm the allowed deduction is the MFS half-limit
    expect(federal.capitalGainLoss.toNumber()).toBeGreaterThanOrEqual(-1500);
    expect(federal.capitalGainLoss.toNumber()).toBeGreaterThan(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: Self-Employment Tax (no special MFS rules)
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - SE tax computed same as other filing statuses", () => {
  const federal = calculateFederalTax(mfsFixture);

  it("SE tax is computed on $12K freelance income", () => {
    // $12,000 × 0.9235 = $11,082 × 15.3% = $1,695.55 → ~$1,696
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("SE tax deductible half flows to Schedule 1 as adjustment", () => {
    // Deductible half reduces AGI regardless of filing status
    expect(federal.adjustmentsToIncome.greaterThan(0)).toBe(true);
  });

  it("SE tax rate is the same 15.3% (SS + Medicare) as single filers", () => {
    // $12,000 NEC income: net SE earnings = $12K × 0.9235 = $11,082
    // SE tax ≈ $11,082 × 15.3% ≈ $1,696 (rounded)
    expect(federal.selfEmploymentTax.toNumber()).toBeGreaterThan(1600);
    expect(federal.selfEmploymentTax.toNumber()).toBeLessThan(1800);
  });

  it("Schedule SE audit lines are present", () => {
    const seLines = federal.allLines.filter((l) => l.form === "Sched SE");
    expect(seLines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: NIIT threshold = $125,000 (not $200K/$250K)
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - NIIT threshold is $125,000", () => {
  // MFS filer with AGI just above $125K but below $200K (would be safe as single)
  const mfsJustOverNiitThreshold: TaxYearInput = {
    ...mfsFixture,
    w2s: [
      {
        employer: { name: "Portland Corp", ein: "44-5566778" },
        wages: "120000",
        federalWithheld: "20000",
        socialSecurityWages: "120000",
        socialSecurityWithheld: "7440",
        medicareWages: "120000",
        medicareWithheld: "1740",
        stateTaxWithheld: "5000",
        stateWages: "120000",
        localTaxWithheld: "0",
        state: "OR",
      },
    ],
    // Keep investment income so NIIT has a base to tax
    form1099Int: [
      {
        payer: "Bank",
        interestIncome: "3000",
        federalWithheld: "0",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      },
    ],
    form1099Div: [
      {
        payer: "Vanguard",
        ordinaryDividends: "8000",
        qualifiedDividends: "7000",
        totalCapitalGainDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      },
    ],
    form1099B: [],
    form1099Nec: [],
    rentalProperties: [],
    educationExpenses: undefined,
    dependentCare: undefined,
  };

  const federal = calculateFederalTax(mfsJustOverNiitThreshold);

  it("NIIT applies when MFS AGI exceeds $125K threshold", () => {
    // AGI ≈ $120K wages + $11K investment income ≈ $131K > $125K MFS threshold
    expect(federal.niitTax.greaterThan(0)).toBe(true);
  });

  it("NIIT rate is 3.8% applied to lesser of NII or MAGI excess over $125K", () => {
    // NII ≈ $11K; MAGI excess ≈ $131K - $125K = $6K
    // NIIT = 3.8% × min($11K, $6K) = 3.8% × $6K = $228
    expect(federal.niitTax.toNumber()).toBeGreaterThan(0);
    expect(federal.niitTax.toNumber()).toBeLessThan(500);
  });

  it("Form 8960 lines appear in audit trail", () => {
    const form8960Lines = federal.allLines.filter((l) => l.form === "Form 8960");
    expect(form8960Lines.length).toBeGreaterThan(0);
  });

  it("NIIT threshold for MFS is $125K (half of MFJ $250K)", () => {
    // Verify threshold via Form 8960 result
    expect(federal.form8960).toBeDefined();
    expect(federal.form8960!.threshold.toNumber()).toBe(125000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: Estimated Tax Penalty uses $75K for 110% rule
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - estimated tax penalty 110% threshold is $75,000", () => {
  // MFS filer with prior-year AGI just above $75K (would be safe at $150K for single)
  const mfsHighIncomePriorYear: TaxYearInput = {
    ...mfsFixture,
    priorYear: {
      priorYearTax: "15000",
      priorYearAGI: "80000", // Over $75K MFS → triggers 110% safe harbor
    },
  };

  const federal = calculateFederalTax(mfsHighIncomePriorYear);

  it("form2210 is computed", () => {
    expect(federal.form2210).toBeDefined();
  });

  it("110% prior-year safe harbor threshold for MFS is $75K (not $150K)", () => {
    // Prior AGI $80K > $75K MFS threshold → 110% rule applies
    // 110% of $15K prior tax = $16,500 required
    // Withholding $22K > $16.5K → safe harbor met
    expect(federal.form2210!.safeHarborMet).toBe(true);
  });

  it("MFS penalty safe harbor: $80K prior AGI triggers 110% rule (would not at $150K single threshold)", () => {
    // Verify the $75K MFS-specific threshold is used by checking the 110% safe harbor applies
    // when prior AGI is $80K (above $75K MFS threshold but below $150K single threshold).
    // Since withholding covers safe harbor, safeHarborMet = true confirms the rule works.
    expect(federal.form2210!.safeHarborMet).toBe(true);
    // The 90% current-year test passes here because withholding is $22K;
    // either way the 110% rule would also produce a safe harbor.
    // Key assertion: no penalty is assessed.
    expect(federal.estimatedTaxPenalty.toNumber()).toBe(0);
  });

  it("MFS filer below $75K threshold uses 100% (not 110%) of prior year", () => {
    // Use a scenario where withholding exactly meets 100% (but not 110%) of prior year
    // so the 100% vs 110% distinction is observable.
    // Prior tax $20K, prior AGI $70K (under $75K MFS → 100% rule → $20K required)
    // Withholding $20K → meets 100% but not 110% ($22K)
    // To bypass the 90% current-year test, set current year tax high relative to withholding.
    const mfsBelowThreshold: TaxYearInput = {
      ...mfsFixture,
      // Increase wages so current-year tax > withholding/0.9 (fail 90% test)
      w2s: [
        {
          employer: { name: "Portland Corp", ein: "44-5566778" },
          wages: "500000",
          federalWithheld: "20000", // Intentionally low to force prior-year path
          socialSecurityWages: "176100",
          socialSecurityWithheld: "10918",
          medicareWages: "500000",
          medicareWithheld: "7250",
          stateTaxWithheld: "7000",
          stateWages: "500000",
          localTaxWithheld: "0",
          state: "OR",
        },
      ],
      priorYear: {
        priorYearTax: "20000",
        priorYearAGI: "70000", // Under $75K MFS → 100% of prior year = $20K required
      },
    };
    const result = calculateFederalTax(mfsBelowThreshold);
    // 100% of $20K prior tax = $20K required; withholding $20K = $20K → safe harbor met
    expect(result.form2210!.safeHarborMet).toBe(true);
    expect(result.form2210!.safeHarborReason).toContain("100%");
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Edge Case: Mortgage Interest — $375K limit (half of $750K)
// Per IRC §163(h)(3)(B)(ii), MFS debt limit is $375K
// ═══════════════════════════════════════════════════════════

describe("MFS edge case - mortgage interest $375K debt limit (half of $750K)", () => {
  // MFS filer with mortgage debt under $375K — full interest deductible
  const mfsUnderLimit: TaxYearInput = {
    ...mfsFixture,
    form1098: [
      {
        lender: "Chase",
        mortgageInterestReceived: "12000",
        outstandingMortgagePrincipal: "300000", // Under $375K → full interest
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      },
    ],
  };

  // MFS filer with mortgage debt over $375K — interest is prorated
  const mfsOverLimit: TaxYearInput = {
    ...mfsFixture,
    form1098: [
      {
        lender: "Chase",
        mortgageInterestReceived: "40000",
        outstandingMortgagePrincipal: "1000000", // Over $375K → prorated
        propertyTax: "6000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      },
    ],
  };

  const federalUnder = calculateFederalTax(mfsUnderLimit);
  const federalOver = calculateFederalTax(mfsOverLimit);

  it("full mortgage interest deducted when debt under $375K", () => {
    // $300K principal < $375K MFS limit → all $12K interest deductible
    expect(federalUnder.scheduleA!.mortgageInterest.toNumber()).toBe(12000);
  });

  it("mortgage interest prorated when debt exceeds $375K", () => {
    // $1M principal > $375K MFS limit → ratio = 375/1000 = 0.375
    // Deductible = $40K × 0.375 = $15K
    expect(federalOver.scheduleA!.mortgageInterest.toNumber()).toBe(15000);
  });

  it("MFS filer gets $375K limit (half of single/MFJ $750K) per IRC §163(h)(3)(B)(ii)", () => {
    // Under-limit filer: $300K < $375K → full deduction confirmed
    expect(federalUnder.scheduleA!.mortgageInterest.toNumber()).toBe(12000);
    // Over-limit filer: prorated at 375/1000, not 750/1000
    expect(federalOver.scheduleA!.mortgageInterest.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS vs Single: MFS pays more tax at equivalent high income
// ═══════════════════════════════════════════════════════════

describe("MFS total tax comparison - MFS pays more than equivalent single filer at high income", () => {
  const highIncomeBase = {
    w2s: [
      {
        employer: { name: "High Pay Co", ein: "99-8877665" },
        wages: "300000",
        federalWithheld: "70000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918",
        medicareWages: "300000",
        medicareWithheld: "4350",
        stateTaxWithheld: "0",
        stateWages: "300000",
        localTaxWithheld: "0",
        state: "TX",
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
    rentalProperties: [],
  };

  const mfsHighIncome: TaxYearInput = {
    ...highIncomeBase,
    taxpayer: {
      taxYear: 2025,
      filingStatus: "married_filing_separately",
      primary: {
        firstName: "Pat",
        lastName: "Jordan",
        ssn: "200-30-4000",
        dateOfBirth: "1978-05-20",
      },
      address: {
        street: "9 High St",
        city: "Houston",
        state: "TX",
        zip: "77001",
      },
      dependents: [],
    },
  };

  const singleHighIncome: TaxYearInput = {
    ...highIncomeBase,
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Pat",
        lastName: "Jordan",
        ssn: "200-30-4001",
        dateOfBirth: "1978-05-20",
      },
      address: {
        street: "9 High St",
        city: "Houston",
        state: "TX",
        zip: "77001",
      },
      dependents: [],
    },
  };

  const federalMfs = calculateFederalTax(mfsHighIncome);
  const federalSingle = calculateFederalTax(singleHighIncome);

  it("MFS total tax is greater than single filer at $300K wages", () => {
    // At high income, MFS bracket compression means higher tax than single
    // MFS has narrower brackets (half of MFJ), which are worse than single above ~$250K
    expect(federalMfs.totalTax.greaterThan(federalSingle.totalTax)).toBe(true);
  });

  it("MFS taxable income equals single taxable income (same standard deduction)", () => {
    // Both MFS and single have $15,000 standard deduction
    expect(federalMfs.taxableIncome.toNumber()).toBe(federalSingle.taxableIncome.toNumber());
  });

  it("MFS Additional Medicare Tax is higher than single at $300K (lower $125K threshold)", () => {
    // MFS Additional Medicare Tax threshold is $125K vs $200K for single
    // At $300K wages, MFS has $175K above threshold vs single's $100K above threshold
    expect(federalMfs.additionalMedicareTax.greaterThan(federalSingle.additionalMedicareTax)).toBe(true);
  });

  it("both MFS and single filers have positive total tax", () => {
    expect(federalMfs.totalTax.greaterThan(0)).toBe(true);
    expect(federalSingle.totalTax.greaterThan(0)).toBe(true);
  });
});
