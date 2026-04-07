/**
 * Tests for Ohio SD 100 — School District Income Tax Return.
 * Spec: spec/state/oh-sd-100.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateOhioSD100 } from "@/engine/state/oh-sd-100.js";

// ---------------------------------------------------------------------------
// Helpers — reusable minimal inputs
// ---------------------------------------------------------------------------

/** Single full-year resident in a traditional district at 1.50%. */
function traditionalBase(overrides?: Record<string, unknown>) {
  return {
    taxYear: 2025,
    ohioAgi: 60000,
    businessIncomeDeduction: 0,
    exemptionAmount: 1900,
    districts: [
      {
        districtNumber: "5509",
        taxType: "traditional" as const,
        rate: "0.015",
      },
    ],
    ...overrides,
  };
}

/** Single full-year resident in an earned income district at 1.25%. */
function earnedIncomeBase(overrides?: Record<string, unknown>) {
  return {
    taxYear: 2025,
    ohioAgi: 60000,
    businessIncomeDeduction: 0,
    exemptionAmount: 1900,
    districts: [
      {
        districtNumber: "0404",
        taxType: "earned_income" as const,
        rate: "0.0125",
        wages: 55000,
        netSelfEmployment: 0,
      },
    ],
    ...overrides,
  };
}

describe("Ohio SD 100", () => {
  // =========================================================================
  // Lines 1–5: Common income base
  // =========================================================================

  it("OH SD 100 Line 1 - Ohio AGI flows from IT 1040", () => {
    const result = calculateOhioSD100(traditionalBase({ ohioAgi: 75000 }));
    expect(result.line1_ohioAgi.toNumber()).toBe(75000);
  });

  it("OH SD 100 Line 2 - business income deduction add-back", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 50000, businessIncomeDeduction: 30000 }),
    );
    expect(result.line2_businessIncomeDeduction.toNumber()).toBe(30000);
    expect(result.line3_magi.toNumber()).toBe(80000);
  });

  it("OH SD 100 Line 3 - MAGI floors at zero", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: -10000, businessIncomeDeduction: 5000 }),
    );
    expect(result.line3_magi.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 3 - MAGI with positive Ohio AGI and no business deduction", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, businessIncomeDeduction: 0 }),
    );
    expect(result.line3_magi.toNumber()).toBe(60000);
  });

  it("OH SD 100 Line 4 - exemptions from IT 1040", () => {
    const result = calculateOhioSD100(traditionalBase({ exemptionAmount: 4800 }));
    expect(result.line4_exemptions.toNumber()).toBe(4800);
  });

  it("OH SD 100 Line 5 - MAGI less exemptions floors at zero", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 5000, exemptionAmount: 7200 }),
    );
    expect(result.line5_magiLessExemptions.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 5 - MAGI less exemptions positive case", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    );
    // MAGI = 60000, MAGI-exemptions = 60000 - 1900 = 58100
    expect(result.line5_magiLessExemptions.toNumber()).toBe(58100);
  });

  // =========================================================================
  // Traditional Tax Base Schedule (lines 22–28)
  // =========================================================================

  it("OH SD 100 Line 22 - traditional tax base prorated by residency", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
          residencyFactor: "0.5",
        },
      ],
    });
    // MAGI-exemptions = 58100, prorated = 58100 × 0.5 = 29050
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(29050);
  });

  it("OH SD 100 Line 23 - traditional taxable amount is min of line 5 and line 22", () => {
    // Full-year resident: line 22 = line 5, so min = line 5
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    );
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(58100);
  });

  it("OH SD 100 Line 24 - district tax rate", () => {
    const result = calculateOhioSD100(traditionalBase());
    expect(result.districtDetails[0]!.rate.toNumber()).toBe(0.015);
  });

  it("OH SD 100 Line 25 - traditional district tax", () => {
    // 58100 × 1.50% = 871.50, rounds to 872
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    );
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(872);
  });

  it("OH SD 100 Line 26 - senior citizen credit", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      isSenior: true,
    });
    expect(result.districtDetails[0]!.seniorCredit.toNumber()).toBe(50);
  });

  it("OH SD 100 Line 26 - no senior credit when not senior", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      isSenior: false,
    });
    expect(result.districtDetails[0]!.seniorCredit.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 26 - senior credit capped at tax amount", () => {
    // Very low income: tax < $50
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 3000, exemptionAmount: 0 }),
      isSenior: true,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025", // 0.25%
        },
      ],
    });
    // 3000 × 0.25% = 7.50 rounds to 8; senior credit = min(50, 8) = 8
    const detail = result.districtDetails[0]!;
    expect(detail.grossTax.toNumber()).toBe(8);
    expect(detail.seniorCredit.toNumber()).toBe(8);
    expect(detail.taxAfterCredits.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 27 - traditional tax after credits", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      isSenior: true,
    });
    // 58100 × 1.50% = 872. Senior credit = 50. Tax = 822.
    expect(result.districtDetails[0]!.taxAfterCredits.toNumber()).toBe(822);
  });

  it("OH SD 100 Line 28 - total traditional tax to line 6", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    );
    // 58100 × 1.50% = 872 (no senior credit)
    expect(result.line6_traditionalTax.toNumber()).toBe(872);
  });

  it("OH SD 100 uses official district lookup when tax type and rate are omitted", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [{ districtNumber: "3122" }],
    });

    const detail = result.districtDetails[0]!;
    expect(detail.districtNumber).toBe("3122");
    expect(detail.taxType).toBe("traditional");
    expect(detail.rate.toNumber()).toBe(0.0125);
    expect(detail.grossTax.toNumber()).toBe(726);
  });

  it("OH SD 100 Line 24 - short numeric district identifiers are normalized before lookup", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [{ districtNumber: "404", wages: 55000, netSelfEmployment: 0 }],
    });

    const detail = result.districtDetails[0]!;
    expect(detail.districtNumber).toBe("0404");
    expect(detail.taxType).toBe("earned_income");
    expect(detail.rate.toNumber()).toBe(0.0125);
  });

  it("OH SD 100 Line 24 - official district names resolve through the rate table", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtName: "SD Geneva Area CSD",
          wages: 55000,
          netSelfEmployment: 0,
        },
      ],
    });

    const detail = result.districtDetails[0]!;
    expect(detail.districtNumber).toBe("0404");
    expect(detail.taxType).toBe("earned_income");
    expect(detail.rate.toNumber()).toBe(0.0125);
  });

  it("OH SD 100 caller-supplied district metadata overrides official lookup", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "0404",
          taxType: "traditional",
          rate: "0.015",
        },
      ],
    });

    const detail = result.districtDetails[0]!;
    expect(detail.taxType).toBe("traditional");
    expect(detail.rate.toNumber()).toBe(0.015);
    expect(detail.grossTax.toNumber()).toBe(872);
  });

  // =========================================================================
  // Earned Income Tax Base Schedule (lines 29–38)
  // =========================================================================

  it("OH SD 100 Line 29 - earned income wages", () => {
    const result = calculateOhioSD100(earnedIncomeBase());
    const detail = result.districtDetails[0]!;
    expect(detail.taxType).toBe("earned_income");
  });

  it("OH SD 100 resolves earned-income districts from official lookup", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "0404",
          wages: 55000,
          netSelfEmployment: 0,
        },
      ],
    });

    const detail = result.districtDetails[0]!;
    expect(detail.taxType).toBe("earned_income");
    expect(detail.rate.toNumber()).toBe(0.0125);
    expect(detail.grossTax.toNumber()).toBe(688);
  });

  it("OH SD 100 Line 30 - SE income", () => {
    const result = calculateOhioSD100({
      ...earnedIncomeBase(),
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 40000,
          netSelfEmployment: 10000,
        },
      ],
    });
    // Earned income = 40000 + 10000 = 50000
    // MAGI = 60000 → capped at min(50000, 60000) = 50000
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(50000);
  });

  it("OH SD 100 Line 31 - total earned income floors at zero", () => {
    const result = calculateOhioSD100({
      ...earnedIncomeBase(),
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 10000,
          netSelfEmployment: -15000,
        },
      ],
    });
    // Earned income = 10000 + (-15000) = -5000 → floor at 0
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(0);
    expect(detail.grossTax.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 32 - MAGI portion for earned income district", () => {
    const result = calculateOhioSD100({
      ...earnedIncomeBase(),
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 55000,
          netSelfEmployment: 0,
          residencyFactor: "0.5",
        },
      ],
    });
    // MAGI = 60000, prorated = 60000 × 0.5 = 30000
    // Earned = 55000, capped at 30000
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(30000);
  });

  it("OH SD 100 Line 22 - residency factor above 1 throws", () => {
    expect(() =>
      calculateOhioSD100({
        ...traditionalBase(),
        districts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
            residencyFactor: "1.01",
          },
        ],
      }),
    ).toThrow(/residency factor.*between 0 and 1 inclusive/i);
  });

  it("OH SD 100 Line 32 - negative residency factor throws", () => {
    expect(() =>
      calculateOhioSD100({
        ...earnedIncomeBase(),
        districts: [
          {
            districtNumber: "0404",
            taxType: "earned_income" as const,
            rate: "0.0125",
            wages: 55000,
            netSelfEmployment: 0,
            residencyFactor: "-0.01",
          },
        ],
      }),
    ).toThrow(/residency factor.*between 0 and 1 inclusive/i);
  });

  it("OH SD 100 Line 33 - taxable earned income capped at MAGI", () => {
    // Earned income > MAGI (large deductions reduced MAGI)
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 30000, // Low Ohio AGI due to deductions
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 50000, // Wages exceed MAGI
          netSelfEmployment: 0,
        },
      ],
    });
    // MAGI = 30000, earned = 50000 → capped at 30000
    const detail = result.districtDetails[0]!;
    expect(detail.taxBase.toNumber()).toBe(30000);
  });

  it("OH SD 100 Line 34 - earned income district rate", () => {
    const result = calculateOhioSD100(earnedIncomeBase());
    expect(result.districtDetails[0]!.rate.toNumber()).toBe(0.0125);
  });

  it("OH SD 100 Line 35 - earned income district tax", () => {
    // Wages 55000, MAGI 60000 → earned = min(55000, 60000) = 55000
    // 55000 × 1.25% = 687.50 → rounds to 688
    const result = calculateOhioSD100(earnedIncomeBase());
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(688);
  });

  it("OH SD 100 Line 36 - senior citizen credit earned income", () => {
    const result = calculateOhioSD100({
      ...earnedIncomeBase(),
      isSenior: true,
    });
    expect(result.districtDetails[0]!.seniorCredit.toNumber()).toBe(50);
  });

  it("OH SD 100 Line 37 - earned income tax after credits", () => {
    const result = calculateOhioSD100({
      ...earnedIncomeBase(),
      isSenior: true,
    });
    // 688 - 50 = 638
    expect(result.districtDetails[0]!.taxAfterCredits.toNumber()).toBe(638);
  });

  it("OH SD 100 Line 38 - total earned income tax to line 7", () => {
    const result = calculateOhioSD100(earnedIncomeBase());
    // 688 (no senior credit)
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(688);
  });

  // =========================================================================
  // Lines 6–8: Aggregation
  // =========================================================================

  it("OH SD 100 Line 6 - traditional district tax", () => {
    const result = calculateOhioSD100(
      traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    );
    expect(result.line6_traditionalTax.toNumber()).toBe(872);
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 7 - earned income district tax", () => {
    const result = calculateOhioSD100(earnedIncomeBase());
    expect(result.line6_traditionalTax.toNumber()).toBe(0);
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(688);
  });

  it("OH SD 100 Line 8 - total SD tax liability", () => {
    const result = calculateOhioSD100(earnedIncomeBase());
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(688);
  });

  it("OH SD 100 Line 8 - mixed traditional and earned income districts", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 80000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
          residencyFactor: "0.5",
        },
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 70000,
          netSelfEmployment: 0,
          residencyFactor: "0.5",
        },
      ],
    });
    // Traditional: MAGI-exemptions = 78100, prorated = 78100 × 0.5 = 39050
    //   min(78100, 39050) = 39050. Tax = 39050 × 1.5% = 585.75 → 586
    expect(result.line6_traditionalTax.toNumber()).toBe(586);
    // Earned: wages = 70000, MAGI = 80000, prorated MAGI = 40000
    //   earned = min(70000, 40000) = 40000. Tax = 40000 × 1.25% = 500
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(500);
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(1086);
  });

  // =========================================================================
  // Lines 9–21: Liability, payments, refund / balance due
  // =========================================================================

  it("OH SD 100 Line 9 - underpayment penalty defaults to zero", () => {
    const result = calculateOhioSD100(traditionalBase());
    expect(result.line9_underpaymentPenalty.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 9 - underpayment penalty adds to liability", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      underpaymentPenalty: 45,
    });
    // Tax = 872, penalty = 45, total = 917
    expect(result.line10_totalLiability.toNumber()).toBe(917);
  });

  it("OH SD 100 Line 10 - total liability before payments", () => {
    const result = calculateOhioSD100(traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }));
    expect(result.line10_totalLiability.toNumber()).toBe(872);
  });

  it("OH SD 100 Line 11 - SD withholding", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 500,
    });
    expect(result.line11_sdWithholding.toNumber()).toBe(500);
  });

  it("OH SD 100 Line 12 - estimated payments", () => {
    const result = calculateOhioSD100({
      ...traditionalBase(),
      estimatedPayments: 300,
    });
    expect(result.line12_estimatedPayments.toNumber()).toBe(300);
  });

  it("OH SD 100 Line 13 - total payments", () => {
    const result = calculateOhioSD100({
      ...traditionalBase(),
      sdWithholding: 500,
      estimatedPayments: 300,
    });
    expect(result.line13_totalPayments.toNumber()).toBe(800);
  });

  it("OH SD 100 Line 14 - amended overpayment defaults to zero", () => {
    const result = calculateOhioSD100(traditionalBase());
    expect(result.line14_amendedPriorOverpayment.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 15 - net payments", () => {
    const result = calculateOhioSD100({
      ...traditionalBase(),
      sdWithholding: 800,
      amendedPriorOverpayment: 100,
    });
    // 800 - 100 = 700
    expect(result.line15_netPayments.toNumber()).toBe(700);
  });

  it("OH SD 100 Line 16 - tax due when payments insufficient", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 500,
    });
    // Tax = 872, payments = 500, due = 372
    expect(result.line16_taxDue.toNumber()).toBe(372);
    expect(result.line19_overpayment.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 16 - zero tax due when payments sufficient", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 1000,
    });
    expect(result.line16_taxDue.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 16 - negative line 15 increases amount due", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 100,
      amendedPriorOverpayment: 200,
    });
    // Payments = 100, amended = 200, net = -100
    // Tax = 872, due = 872 - (-100) = 972
    expect(result.line15_netPayments.toNumber()).toBe(-100);
    expect(result.line16_taxDue.toNumber()).toBe(972);
  });

  it("OH SD 100 Line 17 - late payment interest defaults to zero", () => {
    const result = calculateOhioSD100(traditionalBase());
    expect(result.line17_latePaymentInterest.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 18 - total amount due", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 500,
      latePaymentInterest: 10,
    });
    // Due = 372, interest = 10, total = 382
    expect(result.line18_totalAmountDue.toNumber()).toBe(382);
  });

  it("OH SD 100 Line 19 - overpayment when payments exceed liability", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 1000,
    });
    // Tax = 872, payments = 1000, overpayment = 128
    expect(result.line19_overpayment.toNumber()).toBe(128);
    expect(result.line16_taxDue.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 20 - credit carryforward capped at overpayment", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 1000,
      creditCarryforward: 200, // More than overpayment of 128
    });
    expect(result.line20_creditCarryforward.toNumber()).toBe(128);
  });

  it("OH SD 100 Line 20 - credit carryforward partial", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 1000,
      creditCarryforward: 50, // Less than overpayment of 128
    });
    expect(result.line20_creditCarryforward.toNumber()).toBe(50);
    expect(result.line21_refund.toNumber()).toBe(78);
  });

  it("OH SD 100 Line 21 - refund is overpayment minus carryforward", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 1000,
    });
    // Overpayment = 128, no carryforward, refund = 128
    expect(result.line21_refund.toNumber()).toBe(128);
  });

  // =========================================================================
  // Edge cases and special scenarios
  // =========================================================================

  it("zero income produces zero tax", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 0,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
        },
      ],
    });
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(0);
  });

  it("negative Ohio AGI floors MAGI at zero", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: -20000,
      businessIncomeDeduction: 10000,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
        },
      ],
    });
    // MAGI = max(0, -20000 + 10000) = 0
    expect(result.line3_magi.toNumber()).toBe(0);
    expect(result.line5_magiLessExemptions.toNumber()).toBe(0);
    expect(result.line6_traditionalTax.toNumber()).toBe(0);
  });

  it("no districts produces zero tax", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 60000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [],
    });
    expect(result.line6_traditionalTax.toNumber()).toBe(0);
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(0);
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(0);
  });

  it("multiple traditional districts sum correctly", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 80000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
          residencyFactor: "0.5",
        },
        {
          districtNumber: "4712",
          taxType: "traditional" as const,
          rate: "0.02",
          residencyFactor: "0.5",
        },
      ],
    });
    // MAGI-exemptions = 78100
    // District 1: 78100 × 0.5 = 39050. min(78100, 39050) = 39050. Tax = 39050 × 1.5% = 585.75 → 586
    // District 2: 78100 × 0.5 = 39050. min(78100, 39050) = 39050. Tax = 39050 × 2.0% = 781.00 → 781
    expect(result.districtDetails).toHaveLength(2);
    expect(result.districtDetails[0]!.taxAfterCredits.toNumber()).toBe(586);
    expect(result.districtDetails[1]!.taxAfterCredits.toNumber()).toBe(781);
    expect(result.line6_traditionalTax.toNumber()).toBe(1367);
  });

  it("multiple earned income districts sum correctly", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 80000,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 60000,
          netSelfEmployment: 0,
          residencyFactor: "0.5",
        },
        {
          districtNumber: "2301",
          taxType: "earned_income" as const,
          rate: "0.02",
          wages: 60000,
          netSelfEmployment: 0,
          residencyFactor: "0.5",
        },
      ],
    });
    // District 1: wages=60000, MAGI prorated=40000, min(60000,40000)=40000. Tax=40000×1.25%=500
    // District 2: wages=60000, MAGI prorated=40000, min(60000,40000)=40000. Tax=40000×2.0%=800
    expect(result.line7_earnedIncomeTax.toNumber()).toBe(1300);
  });

  it("part-year resident traditional district with small residency factor", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 100000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
          residencyFactor: "0.1", // ~36 days
        },
      ],
    });
    // MAGI-exemptions = 98100, prorated = 98100 × 0.1 = 9810
    // Tax = 9810 × 1.5% = 147.15 → 147
    expect(result.districtDetails[0]!.taxBase.toNumber()).toBe(9810);
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(147);
  });

  it("earned income district with self-employment loss", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 40000,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 50000,
          netSelfEmployment: -20000,
        },
      ],
    });
    // Earned = max(0, 50000 + (-20000)) = 30000
    // MAGI = 40000, min(30000, 40000) = 30000
    // Tax = 30000 × 1.25% = 375
    expect(result.districtDetails[0]!.taxBase.toNumber()).toBe(30000);
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(375);
  });

  it("senior credit applies to both district types", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 80000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      isSenior: true,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
          residencyFactor: "0.5",
        },
        {
          districtNumber: "0404",
          taxType: "earned_income" as const,
          rate: "0.0125",
          wages: 70000,
          netSelfEmployment: 0,
          residencyFactor: "0.5",
        },
      ],
    });
    // Both districts get $50 senior credit
    expect(result.districtDetails[0]!.seniorCredit.toNumber()).toBe(50);
    expect(result.districtDetails[1]!.seniorCredit.toNumber()).toBe(50);
  });

  it("district detail captures all fields correctly", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
    });
    const detail = result.districtDetails[0]!;
    expect(detail.districtNumber).toBe("5509");
    expect(detail.taxType).toBe("traditional");
    expect(detail.rate.toNumber()).toBe(0.015);
    expect(detail.residencyFactor.toNumber()).toBe(1);
    expect(detail.taxBase.toNumber()).toBe(58100);
    expect(detail.grossTax.toNumber()).toBe(872);
    expect(detail.seniorCredit.toNumber()).toBe(0);
    expect(detail.taxAfterCredits.toNumber()).toBe(872);
  });

  it("audit trail records all lines", () => {
    const result = calculateOhioSD100({
      ...traditionalBase({ ohioAgi: 60000, exemptionAmount: 1900 }),
      sdWithholding: 500,
    });
    expect(result.lines.length).toBeGreaterThan(0);
    // Check some key audit entries exist
    const forms = result.lines.map((l) => l.form);
    expect(forms).toContain("OH-SD-100");
  });

  // =========================================================================
  // Rate boundary tests
  // =========================================================================

  it("lowest rate district (0.25%)", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 50000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025",
        },
      ],
    });
    // MAGI-exemptions = 48100, tax = 48100 × 0.25% = 120.25 → 120
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(120);
  });

  it("highest rate district (2.00%)", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 50000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "2907",
          taxType: "traditional" as const,
          rate: "0.02",
        },
      ],
    });
    // MAGI-exemptions = 48100, tax = 48100 × 2.0% = 962
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(962);
  });

  // =========================================================================
  // Full return scenario tests
  // =========================================================================

  it("full return - W-2 earner in traditional district with withholding and refund", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 75000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "3122",
          taxType: "traditional" as const,
          rate: "0.0125",
        },
      ],
      sdWithholding: 1000,
    });
    // MAGI = 75000, MAGI-exemptions = 73100
    // Tax = 73100 × 1.25% = 913.75 → 914
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(914);
    expect(result.line10_totalLiability.toNumber()).toBe(914);
    expect(result.line19_overpayment.toNumber()).toBe(86);
    expect(result.line21_refund.toNumber()).toBe(86);
  });

  it("full return - self-employed in earned income district owing tax", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 90000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "0502",
          taxType: "earned_income" as const,
          rate: "0.01",
          wages: 0,
          netSelfEmployment: 85000,
        },
      ],
    });
    // MAGI = 90000, earned = max(0, 0+85000)=85000, min(85000, 90000)=85000
    // Tax = 85000 × 1.0% = 850
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(850);
    expect(result.line16_taxDue.toNumber()).toBe(850);
    expect(result.line18_totalAmountDue.toNumber()).toBe(850);
  });

  it("full return - senior with overpayment and carryforward", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 50000,
      businessIncomeDeduction: 0,
      exemptionAmount: 1900,
      isSenior: true,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
        },
      ],
      sdWithholding: 800,
      creditCarryforward: 50,
    });
    // MAGI-exemptions = 48100, tax = 48100 × 1.5% = 721.50 → 722
    // Senior credit = 50, tax after = 672
    // Payments = 800, overpayment = 128
    // Carryforward = 50, refund = 78
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(672);
    expect(result.line19_overpayment.toNumber()).toBe(128);
    expect(result.line20_creditCarryforward.toNumber()).toBe(50);
    expect(result.line21_refund.toNumber()).toBe(78);
  });

  it("full return - business income deduction increases MAGI for traditional base", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 40000,
      businessIncomeDeduction: 100000,
      exemptionAmount: 1900,
      districts: [
        {
          districtNumber: "5509",
          taxType: "traditional" as const,
          rate: "0.015",
        },
      ],
    });
    // MAGI = 40000 + 100000 = 140000
    // MAGI - exemptions = 138100
    // Tax = 138100 × 1.5% = 2071.50 → 2072
    expect(result.line3_magi.toNumber()).toBe(140000);
    expect(result.line5_magiLessExemptions.toNumber()).toBe(138100);
    expect(result.districtDetails[0]!.grossTax.toNumber()).toBe(2072);
  });

  // =========================================================================
  // $1 or less threshold rule
  // =========================================================================

  it("OH SD 100 Line 18 - $1 or less amount due zeroed out", () => {
    // Need a scenario where tax due is exactly $1
    // Use a very low rate on small income
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 600,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025", // 0.25%
        },
      ],
      // tax = 600 × 0.25% = 1.50 → rounds to 2
      // Need withholding = 1 to leave $1 due
      sdWithholding: 1,
    });
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(2);
    expect(result.line16_taxDue.toNumber()).toBe(1);
    // $1 or less → zeroed
    expect(result.line18_totalAmountDue.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 18 - $2 amount due is kept", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 600,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025",
        },
      ],
    });
    // tax = 600 × 0.25% = 1.50 → rounds to 2
    expect(result.line8_totalTaxAfterCredits.toNumber()).toBe(2);
    expect(result.line18_totalAmountDue.toNumber()).toBe(2);
  });

  it("OH SD 100 Line 21 - $1 or less refund zeroed out", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 600,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025",
        },
      ],
      sdWithholding: 3, // tax is $2, overpayment = $1
    });
    expect(result.line19_overpayment.toNumber()).toBe(1);
    // $1 or less → zeroed
    expect(result.line21_refund.toNumber()).toBe(0);
  });

  it("OH SD 100 Line 21 - $2 refund is kept", () => {
    const result = calculateOhioSD100({
      taxYear: 2025,
      ohioAgi: 600,
      businessIncomeDeduction: 0,
      exemptionAmount: 0,
      districts: [
        {
          districtNumber: "8706",
          taxType: "traditional" as const,
          rate: "0.0025",
        },
      ],
      sdWithholding: 4, // tax is $2, overpayment = $2
    });
    expect(result.line19_overpayment.toNumber()).toBe(2);
    expect(result.line21_refund.toNumber()).toBe(2);
  });
});
