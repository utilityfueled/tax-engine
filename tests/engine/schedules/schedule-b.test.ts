/**
 * Tests for Schedule B — Interest and Ordinary Dividends
 * Spec: spec/federal/schedule-b.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

/** Minimal fixture with only interest */
function makeInterestFixture(
  interestForms: TaxYearInput["form1099Int"],
  k1s: TaxYearInput["scheduleK1"] = []
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099Int: interestForms,
    scheduleK1: k1s,
  };
}

/** Minimal fixture with only dividends */
function makeDividendFixture(
  divForms: TaxYearInput["form1099Div"],
  k1s: TaxYearInput["scheduleK1"] = []
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099Div: divForms,
    scheduleK1: k1s,
  };
}

// ═══════════════════════════════════════════════════════════
// Part I: Interest
// ═══════════════════════════════════════════════════════════

describe("Schedule B Part I - Interest", () => {
  it("includes separate Box 3 interest before the savings bond exclusion", () => {
    // Spec: spec/federal/schedule-b.yaml#box3-source. IRS i1099int excludes
    // Treasury Box 3 from Box 1; both are federal income before Form 8815.
    const input = makeInterestFixture([
      { payer: "Treasury", interestIncome: "100", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "2000", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input, d("1000"));
    expect(result.totalInterest.toString()).toBe("2100");
    expect(result.taxableInterest.toString()).toBe("1100");
    expect(result.interestPayers[0]?.amount.toString()).toBe("2100");
    const entry = result.lines.find((line) => line.form === "Sched B" && line.line === "1");
    expect(entry?.inputs?.["1099-INT Box 1"]?.toString()).toBe("100");
    expect(entry?.inputs?.["1099-INT Box 3"]?.toString()).toBe("2000");
    expect(input.form1099Int[0]?.interestIncome).toBe("100");
    expect(input.form1099Int[0]?.usSavingsBondInterest).toBe("2000");
    const federal = calculateFederalTax(input);
    expect(federal.totalInterest.toString()).toBe("2100");
    expect(federal.agi.toString()).toBe("87100");
  });
  it("Schedule B Line 1 - list interest payers", () => {
    const input = makeInterestFixture([
      { payer: "Bank A", interestIncome: "500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Bank B", interestIncome: "300", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(2);
    expect(result.interestPayers[0].name).toBe("Bank A");
    expect(result.interestPayers[0].amount.toNumber()).toBe(500);
    expect(result.interestPayers[1].name).toBe("Bank B");
    expect(result.interestPayers[1].amount.toNumber()).toBe(300);
  });

  it("Schedule B Line 1 - includes K-1 interest", () => {
    const input = makeInterestFixture(
      [{ payer: "Bank A", interestIncome: "1000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" }],
      [{
        partnershipName: "Fund LP", partnershipEIN: "12-3456789",
        ordinaryIncome: "0", interestIncome: "500", ordinaryDividends: "0",
        qualifiedDividends: "0", guaranteedPayments: "0",
        netShortTermCapitalGain: "0", netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0", isPassiveActivity: false,
        atRiskAmount: "10000",
        netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0",
        section1231Gain: "0", otherIncome: "0", section179Deduction: "0",
        otherDeductions: "0",
      }]
    );
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(2);
    expect(result.interestPayers[1].name).toBe("Fund LP (K-1)");
    expect(result.interestPayers[1].amount.toNumber()).toBe(500);
  });

  it("Schedule B Line 2 - total interest", () => {
    const input = makeInterestFixture([
      { payer: "Bank A", interestIncome: "1200", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Bank B", interestIncome: "800", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.totalInterest.toNumber()).toBe(2000);
  });

  it("Schedule B Line 3 - savings bond exclusion (Form 8815)", () => {
    const input = makeInterestFixture([
      { payer: "Treasury", interestIncome: "500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "200", taxExemptInterest: "0" },
    ]);
    // Without override, exclusion is $0
    const result = calculateScheduleB(input);
    expect(result.savingsBondExclusion.toNumber()).toBe(0);
  });

  it("Schedule B Line 3 - exclusion override reduces taxable interest", () => {
    const input = makeInterestFixture([
      { payer: "Treasury", interestIncome: "1000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "2000", taxExemptInterest: "0" },
    ]);
    // Actual Boxes 1 + 3 total $3,000; pass exclusion from Form 8815.
    const result = calculateScheduleB(input, d(1500));
    expect(result.savingsBondExclusion.toNumber()).toBe(1500);
    expect(result.taxableInterest.toNumber()).toBe(1500); // 3000 - 1500
  });

  it("Schedule B Line 4 - taxable interest to 1040", () => {
    const input = makeInterestFixture([
      { payer: "Bank", interestIncome: "3000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.taxableInterest.toNumber()).toBe(3000);
  });

  it("Schedule B Line 4 - zero interest", () => {
    const input = makeInterestFixture([]);
    const result = calculateScheduleB(input);
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.interestPayers).toHaveLength(0);
  });

  it("Schedule B Line 1 - audit trail itemizes 1099-OID netting and estate K-1 interest", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099OID: [
        {
          payer: "Treasury STRIP",
          originalIssueDiscount: "800",
          acquisitionPremium: "300",
          otherPeriodicInterest: "250",
          bondPremium: "50",
        },
      ],
      scheduleK1Form1041: [
        {
          estateTrustName: "Family Trust",
          estateTrustEIN: "12-3456789",
          interestIncome: "125",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          section1250UnrecapturedGain: "0",
          collectiblesGain28Percent: "0",
          alternativeMinimumTaxAdjustment: "0",
          taxExemptInterest: "0",
          foreignTaxesPaid: "0",
          credits: [],
          otherPortfolioIncome: "0",
          section199ADividends: "0",
          beneficiaryTaxPayments: "0",
          nonBusinessBadDebt: "0",
        },
      ],
    };

    const result = calculateScheduleB(input);
    const line1Entries = result.lines.filter((line) => line.form === "Sched B" && line.line === "1");

    expect(line1Entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Interest payer - Treasury STRIP (OID)",
          value: d(500),
          formula: "Form 1099-OID Box 1 - min(Box 1, Box 6 acquisition premium)",
        }),
        expect.objectContaining({
          description: "Interest payer - Treasury STRIP (interest)",
          value: d(200),
          formula: "Form 1099-OID Box 2 - min(Box 2, Box 11 bond premium)",
        }),
        expect.objectContaining({
          description: "Interest payer - Family Trust (K-1 1041)",
          value: d(125),
          formula: "Schedule K-1 (Form 1041) Box 1",
        }),
      ])
    );

    const line1Count = result.lines.find((line) => line.form === "Sched B" && line.line === "1-count");
    expect(line1Count?.value.toNumber()).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Ordinary Dividends
// ═══════════════════════════════════════════════════════════

describe("Schedule B Part II - Ordinary Dividends", () => {
  it("Schedule B Line 5 - list dividend payers", () => {
    const input = makeDividendFixture([
      {
        payer: "Vanguard", ordinaryDividends: "2000", qualifiedDividends: "1500",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Fidelity", ordinaryDividends: "800", qualifiedDividends: "600",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(2);
    expect(result.dividendPayers[0].name).toBe("Vanguard");
    expect(result.dividendPayers[0].amount.toNumber()).toBe(2000);
  });

  it("Schedule B Line 6 - total dividends to 1040", () => {
    const input = makeDividendFixture([
      {
        payer: "Vanguard", ordinaryDividends: "3000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(3000);
  });

  it("Schedule B Line 6 - includes K-1 dividends", () => {
    const input = makeDividendFixture(
      [{
        payer: "Vanguard", ordinaryDividends: "1000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      }],
      [{
        partnershipName: "Income Fund", partnershipEIN: "11-2233445",
        ordinaryIncome: "0", interestIncome: "0", ordinaryDividends: "500",
        qualifiedDividends: "400", guaranteedPayments: "0",
        netShortTermCapitalGain: "0", netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0", isPassiveActivity: false,
        atRiskAmount: "10000",
        netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0",
        section1231Gain: "0", otherIncome: "0", section179Deduction: "0",
        otherDeductions: "0",
      }]
    );
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(2);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(1500);
  });

  it("Schedule B Line 5 - audit trail itemizes estate K-1 dividends", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [
        {
          payer: "Vanguard",
          ordinaryDividends: "1000",
          qualifiedDividends: "0",
          totalCapitalGainDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
      ],
      scheduleK1Form1041: [
        {
          estateTrustName: "Grandparent Trust",
          estateTrustEIN: "98-7654321",
          interestIncome: "0",
          ordinaryDividends: "425",
          qualifiedDividends: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          section1250UnrecapturedGain: "0",
          collectiblesGain28Percent: "0",
          alternativeMinimumTaxAdjustment: "0",
          taxExemptInterest: "0",
          foreignTaxesPaid: "0",
          credits: [],
          otherPortfolioIncome: "0",
          section199ADividends: "0",
          beneficiaryTaxPayments: "0",
          nonBusinessBadDebt: "0",
        },
      ],
    };

    const result = calculateScheduleB(input);
    const line5Entries = result.lines.filter((line) => line.form === "Sched B" && line.line === "5");

    expect(line5Entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Dividend payer - Vanguard",
          value: d(1000),
          formula: "1099-DIV Box 1a",
        }),
        expect.objectContaining({
          description: "Dividend payer - Grandparent Trust (K-1 1041)",
          value: d(425),
          formula: "Schedule K-1 (Form 1041) Box 2a",
        }),
      ])
    );

    const line5Count = result.lines.find((line) => line.form === "Sched B" && line.line === "5-count");
    expect(line5Count?.value.toNumber()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Part III: Foreign Accounts
// ═══════════════════════════════════════════════════════════

describe("Schedule B Part III - Foreign Accounts", () => {
  it("Schedule B Line 7a - foreign account indicator from 1099-DIV", () => {
    const input = makeDividendFixture([
      {
        payer: "Intl Fund", ordinaryDividends: "2000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "150", foreignCountry: "Various",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
  });

  it("Schedule B Line 7a - no foreign accounts when no foreign tax paid", () => {
    const input = makeDividendFixture([
      {
        payer: "Domestic Fund", ordinaryDividends: "2000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(false);
  });

  it("Schedule B Line 7b - foreign account country", () => {
    const input = makeDividendFixture([
      {
        payer: "Intl Fund", ordinaryDividends: "1000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "50", foreignCountry: "United Kingdom",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.foreignAccountCountries).toContain("United Kingdom");
  });

  it("Schedule B Line 8 - foreign trust indicator from K-1", () => {
    // No foreign K-1s → false
    const result = calculateScheduleB(simpleW2Fixture);
    expect(result.hasForeignTrust).toBe(false);
  });

  it("Schedule B Line 8 - detects foreign partnership from K-1", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Foreign Fund LP", partnershipEIN: "98-7654321",
        ordinaryIncome: "5000",
        interestIncome: "0", ordinaryDividends: "0", qualifiedDividends: "0",
        guaranteedPayments: "0", netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0", selfEmploymentEarnings: "0",
        isPassiveActivity: false, isForeignPartnership: true,
        atRiskAmount: "50000",
        netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0",
        section1231Gain: "0", otherIncome: "0", section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleB(input);
    expect(result.hasForeignTrust).toBe(true);
    expect(result.isRequired).toBe(true); // Foreign trust requires Schedule B
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule B Required Determination
// ═══════════════════════════════════════════════════════════

describe("Schedule B - required determination", () => {
  it("not required when interest and dividends under $1,500", () => {
    const input = makeInterestFixture([
      { payer: "Bank", interestIncome: "500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(false);
  });

  it("required when interest exceeds $1,500", () => {
    const input = makeInterestFixture([
      { payer: "Bank", interestIncome: "1600", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
  });

  it("required when dividends exceed $1,500", () => {
    const input = makeDividendFixture([
      {
        payer: "Fund", ordinaryDividends: "2000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
  });

  it("required when foreign accounts exist", () => {
    const input = makeDividendFixture([
      {
        payer: "Intl Fund", ordinaryDividends: "100", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "10", foreignCountry: "Japan",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
  });

  it("complex MFJ fixture produces correct Schedule B", () => {
    const result = calculateScheduleB(complexMFJFixture);
    // 1099-INT: $2,500 + K-1: $500 = $3,000
    expect(result.totalInterest.toNumber()).toBe(3000);
    expect(result.taxableInterest.toNumber()).toBe(3000);
    // 1099-DIV: $8,000 (no K-1 dividends)
    expect(result.totalOrdinaryDividends.toNumber()).toBe(8000);
    expect(result.isRequired).toBe(true);
    // Foreign accounts from Vanguard 1099-DIV
    expect(result.hasForeignAccounts).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule B - audit trail", () => {
  it("produces audit trail for all lines", () => {
    const result = calculateScheduleB(complexMFJFixture);
    expect(result.lines.length).toBeGreaterThanOrEqual(8);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("2");
    expect(lineNumbers).toContain("3");
    expect(lineNumbers).toContain("4");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("6");
    expect(lineNumbers).toContain("7a");
    expect(lineNumbers).toContain("7b");
    expect(lineNumbers).toContain("8");
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Tests
// ═══════════════════════════════════════════════════════════

describe("Schedule B - single 1099-INT flows to Line 1 total", () => {
  it("single 1099-INT interest appears in interestPayers and totalInterest", () => {
    const input = makeInterestFixture([
      { payer: "First National Bank", interestIncome: "750", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(1);
    expect(result.interestPayers[0].name).toBe("First National Bank");
    expect(result.interestPayers[0].amount.toNumber()).toBe(750);
    expect(result.totalInterest.toNumber()).toBe(750);
    expect(result.taxableInterest.toNumber()).toBe(750);
  });
});

describe("Schedule B - multiple 1099-INTs from different banks aggregate", () => {
  it("three 1099-INTs from separate banks sum correctly on Line 2", () => {
    const input = makeInterestFixture([
      { payer: "Chase", interestIncome: "400", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Wells Fargo", interestIncome: "600", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Citibank", interestIncome: "250.50", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(3);
    expect(result.totalInterest.toNumber()).toBe(1250.5);
    expect(result.taxableInterest.toNumber()).toBe(1250.5);
  });
});

describe("Schedule B - single 1099-DIV ordinary dividends flow to Line 5 total", () => {
  it("single 1099-DIV ordinary dividends appear in dividendPayers and totalOrdinaryDividends", () => {
    const input = makeDividendFixture([
      {
        payer: "Schwab", ordinaryDividends: "1200", qualifiedDividends: "900",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(1);
    expect(result.dividendPayers[0].name).toBe("Schwab");
    expect(result.dividendPayers[0].amount.toNumber()).toBe(1200);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(1200);
  });
});

describe("Schedule B - multiple 1099-DIVs aggregate ordinary dividends", () => {
  it("four 1099-DIVs from different brokers sum correctly on Line 6", () => {
    const input = makeDividendFixture([
      {
        payer: "Vanguard", ordinaryDividends: "3000", qualifiedDividends: "2500",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Fidelity", ordinaryDividends: "1500", qualifiedDividends: "1200",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Schwab", ordinaryDividends: "800", qualifiedDividends: "600",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "iShares ETF", ordinaryDividends: "450.75", qualifiedDividends: "400",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(4);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(5750.75);
  });
});

describe("Schedule B - tax-exempt interest does not inflate taxable interest", () => {
  it("taxExemptInterest on 1099-INT is excluded from taxableInterest (Line 4)", () => {
    const input = makeInterestFixture([
      {
        payer: "Muni Bond Fund", interestIncome: "200", federalWithheld: "0",
        earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0",
        taxExemptInterest: "1800",
      },
    ]);
    const result = calculateScheduleB(input);
    // Only interestIncome contributes to taxableInterest, not taxExemptInterest
    expect(result.taxableInterest.toNumber()).toBe(200);
    expect(result.totalInterest.toNumber()).toBe(200);
  });

  it("taxExemptInterest combined with regular interest only taxes the taxable portion", () => {
    const input = makeInterestFixture([
      {
        payer: "State Bond Fund", interestIncome: "500", federalWithheld: "0",
        earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0",
        taxExemptInterest: "2500",
      },
      {
        payer: "Savings Account", interestIncome: "300", federalWithheld: "0",
        earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0",
        taxExemptInterest: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.taxableInterest.toNumber()).toBe(800); // 500 + 300
    expect(result.interestPayers).toHaveLength(2);
  });
});

describe("Schedule B - Line 7a foreign accounts from 1099-INT payer", () => {
  it("hasForeignAccounts is true when any 1099-DIV has foreignTaxPaid and foreignCountry", () => {
    const input = makeDividendFixture([
      {
        payer: "Deutsche Bank Fund", ordinaryDividends: "500", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "75", foreignCountry: "Germany",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Domestic Mutual Fund", ordinaryDividends: "300", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
    expect(result.foreignAccountCountries).toContain("Germany");
    expect(result.isRequired).toBe(true);
  });
});

describe("Schedule B - audit trail contains all line IDs", () => {
  it("audit trail includes every Schedule B line: 1, 2, 3, 4, 5, 6, 7a, 7b, 8", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [
        { payer: "Bank", interestIncome: "2000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      ],
      form1099Div: [
        {
          payer: "Fund", ordinaryDividends: "2000", qualifiedDividends: "0",
          totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
          section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
          nondividendDistributions: "0", exemptInterestDividends: "0",
        },
      ],
    };
    const result = calculateScheduleB(input);
    const lineIds = result.lines.map((l) => l.line);
    const requiredLines = ["1", "2", "3", "4", "5", "6", "7a", "7b", "8"];
    for (const id of requiredLines) {
      expect(lineIds, `Expected line "${id}" in audit trail`).toContain(id);
    }
  });
});

describe("Schedule B - zero interest and dividends produce zero totals", () => {
  it("no 1099-INT and no 1099-DIV yields all-zero totals and Schedule B not required", () => {
    const input = makeInterestFixture([]);
    const result = calculateScheduleB(input);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(0);
    expect(result.interestPayers).toHaveLength(0);
    expect(result.dividendPayers).toHaveLength(0);
    expect(result.isRequired).toBe(false);
  });
});

describe("Schedule B - savings bond exclusion edge cases", () => {
  it("exclusion greater than total interest floors at zero (no negative taxable interest)", () => {
    const input = makeInterestFixture([
      { payer: "Treasury", interestIncome: "0", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "500", taxExemptInterest: "0" },
    ]);
    // Exclusion $1000 > total interest $500 → taxableInterest = max(0, 500-1000) = 0
    const result = calculateScheduleB(input, d(1000));
    expect(result.taxableInterest.toNumber()).toBe(0);
    expect(result.savingsBondExclusion.toNumber()).toBe(1000);
  });

  it("partial exclusion reduces taxable interest correctly", () => {
    const input = makeInterestFixture([
      { payer: "Treasury", interestIncome: "500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "1500", taxExemptInterest: "0" },
      { payer: "Bank", interestIncome: "1000", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input, d(800));
    expect(result.totalInterest.toNumber()).toBe(3000);
    expect(result.taxableInterest.toNumber()).toBe(2200); // 3000 - 800
  });
});

describe("Schedule B - exactly $1,500 boundary for isRequired", () => {
  it("exactly $1,500 interest does NOT trigger required (threshold is > $1,500)", () => {
    const input = makeInterestFixture([
      { payer: "Bank", interestIncome: "1500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(false);
  });

  it("$1,500.01 interest triggers required", () => {
    const input = makeInterestFixture([
      { payer: "Bank", interestIncome: "1500.01", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
  });

  it("exactly $1,500 dividends does NOT trigger required", () => {
    const input = makeDividendFixture([
      {
        payer: "Fund", ordinaryDividends: "1500", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(false);
  });
});

describe("Schedule B - K-1 zero values are excluded from payers list", () => {
  it("K-1 with zero interest is not listed as interest payer", () => {
    const input = makeInterestFixture(
      [{ payer: "Bank", interestIncome: "500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" }],
      [{
        partnershipName: "Fund LP", partnershipEIN: "12-3456789",
        ordinaryIncome: "5000", interestIncome: "0", ordinaryDividends: "0",
        qualifiedDividends: "0", guaranteedPayments: "0",
        netShortTermCapitalGain: "0", netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0", isPassiveActivity: false,
        atRiskAmount: "10000",
        netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0",
        section1231Gain: "0", otherIncome: "0", section179Deduction: "0",
        otherDeductions: "0",
      }]
    );
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(1);
    expect(result.interestPayers[0].name).toBe("Bank");
  });

  it("K-1 with zero dividends is not listed as dividend payer", () => {
    const input = makeDividendFixture(
      [{
        payer: "Vanguard", ordinaryDividends: "1000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      }],
      [{
        partnershipName: "Fund LP", partnershipEIN: "12-3456789",
        ordinaryIncome: "5000", interestIncome: "0", ordinaryDividends: "0",
        qualifiedDividends: "0", guaranteedPayments: "0",
        netShortTermCapitalGain: "0", netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0", isPassiveActivity: false,
        atRiskAmount: "10000",
        netRentalIncome: "0", otherNetRentalIncome: "0", royalties: "0",
        section1231Gain: "0", otherIncome: "0", section179Deduction: "0",
        otherDeductions: "0",
      }]
    );
    const result = calculateScheduleB(input);
    expect(result.dividendPayers).toHaveLength(1);
    expect(result.dividendPayers[0].name).toBe("Vanguard");
  });
});

describe("Schedule B - multiple foreign countries detected", () => {
  it("two 1099-DIVs with different foreign countries lists both", () => {
    const input = makeDividendFixture([
      {
        payer: "UK Fund", ordinaryDividends: "1000", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "100", foreignCountry: "United Kingdom",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Japan Fund", ordinaryDividends: "500", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "50", foreignCountry: "Japan",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.hasForeignAccounts).toBe(true);
    expect(result.foreignAccountCountries).toHaveLength(2);
    expect(result.foreignAccountCountries).toContain("United Kingdom");
    expect(result.foreignAccountCountries).toContain("Japan");
  });

  it("duplicate foreign country deduplicated", () => {
    const input = makeDividendFixture([
      {
        payer: "Fund A", ordinaryDividends: "500", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "30", foreignCountry: "Germany",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Fund B", ordinaryDividends: "300", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0",
        foreignTaxPaid: "20", foreignCountry: "Germany",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.foreignAccountCountries).toHaveLength(1);
    expect(result.foreignAccountCountries[0]).toBe("Germany");
  });
});

describe("Schedule B - mixed interest and dividends from multiple sources", () => {
  it("multiple 1099-INTs and 1099-DIVs both aggregate correctly", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [
        { payer: "Bank A", interestIncome: "600", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
        { payer: "Bank B", interestIncome: "900", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
        { payer: "Credit Union", interestIncome: "150", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      ],
      form1099Div: [
        {
          payer: "Vanguard", ordinaryDividends: "4000", qualifiedDividends: "3200",
          totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
          section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
          nondividendDistributions: "0", exemptInterestDividends: "0",
        },
        {
          payer: "BlackRock", ordinaryDividends: "1250", qualifiedDividends: "1000",
          totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
          section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
          nondividendDistributions: "0", exemptInterestDividends: "0",
        },
      ],
      scheduleK1: [],
    };
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(3);
    expect(result.totalInterest.toNumber()).toBe(1650);
    expect(result.taxableInterest.toNumber()).toBe(1650);
    expect(result.dividendPayers).toHaveLength(2);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(5250);
    expect(result.isRequired).toBe(true); // both interest > 1500 and dividends > 1500
  });
});

// ═══════════════════════════════════════════════════════════
// New expanded tests
// ═══════════════════════════════════════════════════════════

describe("Schedule B - K-1 with both interest and dividends from same partnership", () => {
  it("single K-1 reporting both interest income and ordinary dividends appears in both payer lists", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [],
      form1099Div: [],
      scheduleK1: [{
        partnershipName: "Diversified Income LP",
        partnershipEIN: "33-4455667",
        ordinaryIncome: "0",
        interestIncome: "900",
        ordinaryDividends: "700",
        qualifiedDividends: "500",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "20000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(1);
    expect(result.interestPayers[0].name).toBe("Diversified Income LP (K-1)");
    expect(result.interestPayers[0].amount.toNumber()).toBe(900);
    expect(result.dividendPayers).toHaveLength(1);
    expect(result.dividendPayers[0].name).toBe("Diversified Income LP (K-1)");
    expect(result.dividendPayers[0].amount.toNumber()).toBe(700);
    expect(result.totalInterest.toNumber()).toBe(900);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(700);
  });
});

describe("Schedule B - K-1 interest flows into Line 2 total interest", () => {
  it("K-1 interest is included in totalInterest sum alongside 1099-INT amounts", () => {
    const input = makeInterestFixture(
      [
        { payer: "Bank A", interestIncome: "800", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
        { payer: "Bank B", interestIncome: "400", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      ],
      [{
        partnershipName: "Bond Fund LP",
        partnershipEIN: "44-5566778",
        ordinaryIncome: "0",
        interestIncome: "350",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "15000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }]
    );
    const result = calculateScheduleB(input);
    // 800 + 400 (1099-INT) + 350 (K-1) = 1550
    expect(result.totalInterest.toNumber()).toBe(1550);
    expect(result.taxableInterest.toNumber()).toBe(1550);
    expect(result.interestPayers).toHaveLength(3);
    expect(result.isRequired).toBe(true); // 1550 > 1500
  });
});

describe("Schedule B - required when interest is $1,501 (one dollar above threshold)", () => {
  it("interest of $1,501 triggers isRequired regardless of dividend level", () => {
    const input = makeInterestFixture([
      { payer: "Savings Account", interestIncome: "1501", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
    expect(result.totalInterest.toNumber()).toBe(1501);
  });
});

describe("Schedule B - required when dividends are $1,501 (one dollar above threshold)", () => {
  it("dividends of $1,501 triggers isRequired regardless of interest level", () => {
    const input = makeDividendFixture([
      {
        payer: "Equity Fund", ordinaryDividends: "1501", qualifiedDividends: "0",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(true);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(1501);
  });
});

describe("Schedule B - not required when interest and dividends each equal $1,500 exactly and no foreign", () => {
  it("interest $1,500 and dividends $1,500 with no foreign accounts does not require Schedule B", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [
        { payer: "Bank", interestIncome: "1500", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      ],
      form1099Div: [
        {
          payer: "Fund", ordinaryDividends: "1500", qualifiedDividends: "0",
          totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
          section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
          nondividendDistributions: "0", exemptInterestDividends: "0",
        },
      ],
      scheduleK1: [],
    };
    const result = calculateScheduleB(input);
    expect(result.isRequired).toBe(false);
    expect(result.hasForeignAccounts).toBe(false);
    expect(result.hasForeignTrust).toBe(false);
  });
});

describe("Schedule B - hasForeignTrust is false when K-1 isForeignPartnership is false", () => {
  it("K-1 with isForeignPartnership explicitly false does not set hasForeignTrust", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Domestic LLC",
        partnershipEIN: "22-3344556",
        ordinaryIncome: "10000",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        isForeignPartnership: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleB(input);
    expect(result.hasForeignTrust).toBe(false);
  });
});

describe("Schedule B - five 1099-INT payers aggregate to correct Line 2 total", () => {
  it("five 1099-INTs from different institutions sum to exact total on Line 2", () => {
    const input = makeInterestFixture([
      { payer: "Chase", interestIncome: "320", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Wells Fargo", interestIncome: "480", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Bank of America", interestIncome: "215.50", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Ally Bank", interestIncome: "550", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Marcus by Goldman", interestIncome: "184.50", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    expect(result.interestPayers).toHaveLength(5);
    // 320 + 480 + 215.50 + 550 + 184.50 = 1750
    expect(result.totalInterest.toNumber()).toBe(1750);
    expect(result.taxableInterest.toNumber()).toBe(1750);
    expect(result.isRequired).toBe(true);
  });
});

describe("Schedule B - savings bond exclusion exactly equals total interest yields zero taxable interest", () => {
  it("Form 8815 exclusion matching total interest produces taxableInterest of zero using Decimal precision", () => {
    const input = makeInterestFixture([
      { payer: "Treasury Direct", interestIncome: "0", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "1234.56", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input, d("1234.56"));
    expect(result.totalInterest.toNumber()).toBe(1234.56);
    expect(result.savingsBondExclusion.toNumber()).toBe(1234.56);
    expect(result.taxableInterest.toNumber()).toBe(0);
  });
});

describe("Schedule B - audit trail Line 2 value matches computed totalInterest", () => {
  it("audit trail Line 2 amount equals the totalInterest Decimal value", () => {
    const input = makeInterestFixture([
      { payer: "Bank A", interestIncome: "1200", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
      { payer: "Bank B", interestIncome: "900", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", taxExemptInterest: "0" },
    ]);
    const result = calculateScheduleB(input);
    const line2 = result.lines.find((l) => l.line === "2");
    expect(line2).toBeDefined();
    expect(line2!.value.toNumber()).toBe(result.totalInterest.toNumber());
    expect(line2!.value.toNumber()).toBe(2100);
  });
});

describe("Schedule B - audit trail Line 6 value matches computed totalOrdinaryDividends", () => {
  it("audit trail Line 6 amount equals the totalOrdinaryDividends Decimal value", () => {
    const input = makeDividendFixture([
      {
        payer: "Fidelity", ordinaryDividends: "2400", qualifiedDividends: "1800",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
      {
        payer: "Schwab", ordinaryDividends: "1100", qualifiedDividends: "900",
        totalCapitalGainDistributions: "0", federalWithheld: "0", foreignTaxPaid: "0",
        section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0",
        nondividendDistributions: "0", exemptInterestDividends: "0",
      },
    ]);
    const result = calculateScheduleB(input);
    const line6 = result.lines.find((l) => l.line === "6");
    expect(line6).toBeDefined();
    expect(line6!.value.toNumber()).toBe(result.totalOrdinaryDividends.toNumber());
    expect(line6!.value.toNumber()).toBe(3500);
  });
});

describe("Schedule B - foreign trust triggers isRequired even when income is low", () => {
  it("foreign partnership K-1 with minimal income still requires Schedule B via hasForeignTrust", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [],
      form1099Div: [],
      scheduleK1: [{
        partnershipName: "Offshore Partners LP",
        partnershipEIN: "98-1234567",
        ordinaryIncome: "50",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        isForeignPartnership: true,
        atRiskAmount: "1000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleB(input);
    expect(result.hasForeignTrust).toBe(true);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.totalOrdinaryDividends.toNumber()).toBe(0);
    expect(result.isRequired).toBe(true);
  });
});
