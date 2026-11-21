/**
 * Tests for Form 8615 — Tax for Certain Children Who Have Unearned Income (Kiddie Tax).
 * Spec: spec/federal/form-8615.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8615 } from "@/engine/forms/form-8615.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { Form8615Schema, TaxYearInputSchema, type TaxYearInput, type Form8615Input } from "@/models/inputs.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { calculateTaxFromBrackets, calculateCapitalGainsTax } from "@/utils/tax-math.js";

const constants = getConstants(2025);
const ordinaryParentWorksheet = {
  parentTaxableIncome: "200000",
  parentFilingStatus: "single",
  preferentialWorksheetFacts: {
    parentTaxMethod: "ordinary",
    parentAdjustedLine16Tax: "41063",
    noOtherChildUsesParentReturn: true,
    childUsesOrdinaryQdcgWorksheet: true,
  },
} satisfies Partial<Form8615Input>;
const dependentDeductionFacts = {
  primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "0", primaryBlind: false,
  primaryDeathDate: null, dualStatusAlien: false, nonresidentAlien: false,
  shortTaxYear: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false,
};

function makeInput(overrides: Partial<Form8615Input> = {}): Form8615Input {
  return {
    childUnearnedIncome: "5000",
    childItemizesDeductions: false,
    childQualifiedDividends: "0",
    childNetLTCG: "0",
    parentTaxableIncome: "150000",
    parentFilingStatus: "married_filing_jointly",
    parentQualifiedDividends: "0",
    parentNetLTCG: "0",
    parentSection1250Gain: "0",
    parentCollectiblesGain: "0",
    otherChildrenNetUnearnedIncome: "0",
    ...overrides,
  };
}

function makeFederalInput(form8615Overrides?: Partial<Form8615Input>, extraInput: Record<string, unknown> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Child",
        lastName: "Taxpayer",
        ssn: "999-88-7777",
        dateOfBirth: "2010-03-15",
      },
      address: { street: "123 Main St", city: "Anytown", state: "TX", zip: "75001" },
      dependents: [],
    },
    w2s: [],
    form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Bank", interestIncome: "5000" }],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    form1099G: [],
    formW2G: [],
    form1098: [],
    form1095A: [],
    scheduleK1: [],
    donations: [],
    rentalProperties: [],
    savingsBondRedemptions: [],
    form8615: {
      childUnearnedIncome: "5000",
      childItemizesDeductions: false,
      childQualifiedDividends: "0",
      childNetLTCG: "0",
      parentTaxableIncome: "150000",
      parentFilingStatus: "married_filing_jointly",
      parentQualifiedDividends: "0",
      parentNetLTCG: "0",
      parentSection1250Gain: "0",
      parentCollectiblesGain: "0",
      otherChildrenNetUnearnedIncome: "0",
      ...form8615Overrides,
    },
    ...extraInput,
  } as TaxYearInput;
}

describe("Form 8615 — Tax for Certain Children Who Have Unearned Income", () => {
  // ─── Applicability ─────────────────────────────────────────

  it("Form 8615 applicability - unearned income at or below $2,700 does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2700" }),
      new Decimal(2700),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8615 applicability - unearned income of $2,701 triggers the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });

  it("Form 8615 applicability - zero unearned income does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "0" }),
      new Decimal(0),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
  });

  // ─── Line-by-Line ─────────────────────────────────────────

  it("Form 8615 Line 1 - child's unearned income flows from input", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8000),
      "single",
      constants
    );
    const line1 = result.lines.find(l => l.form === "8615" && l.line === "1");
    expect(line1?.value.toNumber()).toBe(8000);
  });

  it("Form 8615 Line 2 - non-itemizing child uses $2,700 threshold", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000", childItemizesDeductions: false }),
      new Decimal(5000),
      "single",
      constants
    );
    const line2 = result.lines.find(l => l.form === "8615" && l.line === "2");
    expect(line2?.value.toNumber()).toBe(2700);
  });

  it("Form 8615 Line 2 - reproduces the IRS Eleanor example", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "15900",
        childItemizesDeductions: true,
        childDirectlyConnectedItemizedDeductions: "1500",
      }),
      new Decimal(14400),
      "single",
      constants
    );
    const line2 = result.lines.find(l => l.form === "8615" && l.line === "2");
    expect(line2?.value.toString()).toBe("2850");
    expect(result.netUnearnedIncome.toString()).toBe("13050");
  });

  it("requires a nonnegative directly connected itemized deduction amount for itemizers", () => {
    for (const amount of [undefined, "-1"]) {
      const input = makeInput({
        childItemizesDeductions: true,
        childDirectlyConnectedItemizedDeductions: amount,
      });
      expect(Form8615Schema.safeParse(input).success).toBe(false);
      expect(() => calculateForm8615(input, new Decimal(5000), "single", constants)).toThrow(/directly connected/i);
    }
    expect(Form8615Schema.parse(makeInput({
      childItemizesDeductions: true,
      childDirectlyConnectedItemizedDeductions: "0",
    })).childDirectlyConnectedItemizedDeductions).toBe("0");
  });

  it.each(["childQualifiedDividends", "childNetLTCG"] as const)(
    "requires a separate worksheet for an itemizing child with positive %s",
    (field) => {
      const input = makeInput({
        childItemizesDeductions: true,
        childDirectlyConnectedItemizedDeductions: "1500",
        [field]: "500",
      });
      expect(() => calculateForm8615(input, new Decimal(5000), "single", constants)).toThrow(/separate worksheet/i);
    },
  );

  it.each([
    ["2849", "1000", "-1", ["1", "2", "3"]],
    ["2850", "1000", "0", ["1", "2", "3"]],
    ["5000", "0", "2150", ["1", "2", "3", "4", "5"]],
  ] as const)(
    "does not require the preferential worksheet with $%s of unearned income and $%s of taxable income",
    (childUnearnedIncome, taxableIncome, line3, auditLines) => {
      const result = calculateForm8615(makeInput({
        childUnearnedIncome,
        childItemizesDeductions: true,
        childDirectlyConnectedItemizedDeductions: "1500",
        childQualifiedDividends: "500",
      }), new Decimal(taxableIncome), "single", constants);

      expect(result.lines.find(line => line.line === "2")?.value.toString()).toBe("2850");
      expect(result.lines.find(line => line.line === "3")?.value.toString()).toBe(line3);
      expect(result.lines.map(line => line.line)).toEqual(auditLines);
      expect(result.netUnearnedAtParentRate.toString()).toBe("0");
      expect(result.applies).toBe(false);
    },
  );

  it("Form 8615 Line 3 - net unearned income is unearned minus threshold", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(5000),
      "single",
      constants
    );
    // 5000 - 2700 = 2300
    expect(result.netUnearnedIncome.toNumber()).toBe(2300);
  });

  it("Form 8615 Line 4 - child's taxable income from Form 1040", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(3650),
      "single",
      constants
    );
    const line4 = result.lines.find(l => l.form === "8615" && l.line === "4");
    expect(line4?.value.toNumber()).toBe(3650);
  });

  it("Form 8615 Line 5 - net unearned income capped at child's taxable income", () => {
    // Unearned income is $5000, threshold is $2700, so net = $2300
    // But child's taxable income is only $1500 (after deductions)
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(1500),
      "single",
      constants
    );
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(1500);
  });

  it("Form 8615 Worksheet 1 treats allocated child dividends as preferential at the parent rate", () => {
    const result = calculateForm8615(makeInput({
      ...ordinaryParentWorksheet,
      childUnearnedIncome: "10800",
      childQualifiedDividends: "10800",
    }), new Decimal("9450"), "single", constants);

    const amount = (line: string) => result.lines.find(row => row.line === line)?.value.toFixed();
    expect(amount("5")).toBe("8100");
    expect(amount("9")).toBe("42278");
    expect(amount("10")).toBe("41063");
    expect(amount("15")).toBe("0");
    expect(amount("17")).toBe("0");
    expect(result.tax.toFixed()).toBe("1215");
  });

  it("Form 8615 Worksheet 2 allocates both kinds of preferential income after connected deductions", () => {
    const input = Form8615Schema.parse(makeInput({
      ...ordinaryParentWorksheet,
      childUnearnedIncome: "16000",
      childQualifiedDividends: "4000",
      childNetLTCG: "4000",
      childItemizesDeductions: true,
      childDirectlyConnectedItemizedDeductions: "1650",
      preferentialWorksheetFacts: {
        ...ordinaryParentWorksheet.preferentialWorksheetFacts,
        childPreferentialIncomeConnectedDeductions: "800",
      },
    }));
    const result = calculateForm8615(input, new Decimal("14000"), "single", constants);
    const amount = (line: string) => result.lines.find(row => row.line === line)?.value.toFixed();

    // IRS Worksheet 2: each $4,000 preference loses $400 and 25% of $1,350.
    expect(result.lines.find(row => row.line === "9")?.inputs).toMatchObject({
      childQualifiedDividendsOnLine5: new Decimal("3262.50"),
      childNetCapitalGainOnLine5: new Decimal("3262.50"),
    });
    expect(amount("2")).toBe("3000");
    expect(amount("5")).toBe("13000");
    // The tax worksheet rounds each $3,262.50 allocation to $3,263.
    // The parent's $6,474 ordinary increment is taxed at 32%, and $6,526 at 15%.
    expect(amount("9")).toBe("44114");
    expect(amount("14")).toBe("1000");
    expect(amount("15")).toBe("0");
    // At the child's rates, the $6,000 ordinary portion uses the $6,000–$6,050 table row.
    expect(amount("17")).toBe("603");
    expect(amount("18")).toBe("3051");
  });

  const itemizingWorksheet = {
    ...ordinaryParentWorksheet,
    childItemizesDeductions: true,
    childDirectlyConnectedItemizedDeductions: "2000",
    childUnearnedIncome: "10000",
    childQualifiedDividends: "3000",
    childNetLTCG: "2000",
    preferentialWorksheetFacts: {
      ...ordinaryParentWorksheet.preferentialWorksheetFacts,
      childPreferentialIncomeConnectedDeductions: "500",
    },
  } satisfies Partial<Form8615Input>;

  it("Form 8615 Worksheet 1 uses only the threshold allocation for an itemizer at $2,700", () => {
    const input = TaxYearInputSchema.parse(makeFederalInput({
      ...ordinaryParentWorksheet,
      childItemizesDeductions: true,
      childDirectlyConnectedItemizedDeductions: "1350",
      childUnearnedIncome: "10000", childQualifiedDividends: "2000", childNetLTCG: "500",
    }, {
      standardDeductionFacts: dependentDeductionFacts,
      form4952: { investmentInterestExpense: "1350", grossInvestmentIncome: "7500" },
      donations: [{
        organization: "Public charity", type: "cash", amount: "650", dateOfDonation: "2025-12-01",
        qualifiedOrganization: true, isPrivateFoundation: false,
      }],
      form1099Int: [{ ...makeFederalInput().form1099Int[0], interestIncome: "7500" }],
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "2000", qualifiedDividends: "2000",
        totalCapitalGainDistributions: "500",
      }],
    }));
    const result = calculateFederalTax(input);
    const form = result.form8615;

    expect(result.deductionUsed).toBe("itemized");
    expect(result.itemizedDeductions.toFixed()).toBe("2000");
    expect(form?.lines.find(row => row.line === "2")?.value.toFixed()).toBe("2700");
    expect(form?.netUnearnedIncome.toFixed()).toBe("7300");
    expect(form?.netUnearnedAtParentRate.toFixed()).toBe("7300");
    expect(form?.lines.find(row => row.line === "9")?.inputs).toMatchObject({
      line5Worksheet: "1",
      childQualifiedDividendsOnLine5: new Decimal("1460"),
      childNetCapitalGainOnLine5: new Decimal("365"),
    });
    // The $700 remainder includes $675 in preferential income and $25 of ordinary income.
    expect(form?.childRateIncome.toFixed()).toBe("700");
    expect(form?.taxOnChildRateIncome.toFixed()).toBe("4");
    expect(form?.taxAtChildOwnRate.toFixed()).toBe("553");
    expect(result.allLines).toContainEqual(expect.objectContaining({
      form: "1040", line: "16", description: "Tax (Form 8615)", value: new Decimal("2030"),
    }));
  });

  it("uses Worksheet 2 on the federal return with reconciled Schedule A and investment income", () => {
    const input = makeFederalInput(itemizingWorksheet, {
      standardDeductionFacts: dependentDeductionFacts,
      deductionElection: "itemized",
      form4952: { investmentInterestExpense: "2000", grossInvestmentIncome: "5000" },
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "3000", qualifiedDividends: "3000",
        totalCapitalGainDistributions: "2000", exemptInterestDividends: "0",
        specifiedPrivateActivityBondInterest: "0",
      }],
    });
    const result = calculateFederalTax(input);
    const form = result.form8615;

    expect(result.itemizedDeductions.toFixed()).toBe("2000");
    expect(form?.netUnearnedAtParentRate.toFixed()).toBe("6650");
    expect(form?.childRateIncome.toFixed()).toBe("1350");
    // Line 14 has $705 qualified dividends, $470 net gain and $175 ordinary income.
    expect(form?.taxOnChildRateIncome.toFixed()).toBe("19");
    expect(form?.taxAtChildOwnRate.toFixed()).toBe("303");
    expect(result.allLines).toContainEqual(expect.objectContaining({
      form: "1040", line: "16", description: "Tax (Form 8615)", value: new Decimal("1497"),
    }));
    expect(() => calculateFederalTax({
      ...input, form8615: { ...makeInput(itemizingWorksheet), childNetLTCG: undefined },
    })).toThrow(/Form 8615.*reconcile.*federal/);
    expect(() => calculateFederalTax({
      ...input, form8615: { ...makeInput(itemizingWorksheet), childUnearnedIncome: "1000" },
    })).toThrow(/Form 8615.*reconcile.*federal/);
  });

  it("stops at Line 3 on an itemized return with preferences and an early withdrawal penalty", () => {
    const input = makeFederalInput({
      childItemizesDeductions: true,
      childDirectlyConnectedItemizedDeductions: "1500",
      childUnearnedIncome: "2800",
      childQualifiedDividends: "300",
    }, {
      standardDeductionFacts: dependentDeductionFacts,
      deductionElection: "itemized",
      form4952: { investmentInterestExpense: "1500", grossInvestmentIncome: "2500" },
      form1099Int: [{ ...makeFederalInput().form1099Int[0], interestIncome: "2600", earlyWithdrawalPenalty: "100" }],
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "300", qualifiedDividends: "300",
        exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
      }],
    });
    const result = calculateFederalTax(input);
    expect(result.form8615?.applies).toBe(false);
    expect(result.form8615?.lines.find(row => row.line === "3")?.value.toFixed()).toBe("-50");
    expect(result.allLines).toContainEqual(expect.objectContaining({
      form: "1040", line: "16", value: new Decimal("101"),
    }));
  });

  it.each([undefined, "-0.01", "2000.01"])("requires Worksheet 2 connected expenses within the Line 2 amount (%s)", amount => {
    const input = makeInput({
      ...itemizingWorksheet,
      preferentialWorksheetFacts: {
        ...itemizingWorksheet.preferentialWorksheetFacts,
        childPreferentialIncomeConnectedDeductions: amount,
      },
    });
    expect(() => calculateForm8615(input, new Decimal("8000"), "single", constants))
      .toThrow(/Worksheet 2 requires explicit deductible/);
  });

  it("accepts explicitly reported zero preferential expenses for Worksheet 2", () => {
    const input = makeInput({
      ...itemizingWorksheet,
      preferentialWorksheetFacts: {
        ...itemizingWorksheet.preferentialWorksheetFacts,
        childPreferentialIncomeConnectedDeductions: "0",
      },
    });
    const result = calculateForm8615(input, new Decimal("8000"), "single", constants);
    expect(result.lines.find(row => row.line === "9")?.inputs).toMatchObject({
      line5Worksheet: "2",
      childQualifiedDividendsOnLine5: new Decimal("2595"),
      childNetCapitalGainOnLine5: new Decimal("1730"),
    });
  });

  it("Form 8615 Worksheet 3 allocates itemized deductions using actual federal AGI and Schedule A", () => {
    const input = TaxYearInputSchema.parse(makeFederalInput(itemizingWorksheet, {
      standardDeductionFacts: dependentDeductionFacts,
      form4952: { investmentInterestExpense: "2000", grossInvestmentIncome: "5000" },
      donations: [{
        organization: "Public charity", type: "cash", amount: "2000", dateOfDonation: "2025-12-01",
        qualifiedOrganization: true, isPrivateFoundation: false,
      }],
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "3000", qualifiedDividends: "3000",
        totalCapitalGainDistributions: "2000",
      }],
    }));
    const result = calculateFederalTax(input);
    const form = result.form8615;

    expect(result.agi.toFixed()).toBe("10000");
    expect(result.itemizedDeductions.toFixed()).toBe("4000");
    expect(form?.netUnearnedIncome.toFixed()).toBe("6650");
    expect(form?.netUnearnedAtParentRate.toFixed()).toBe("6000");
    // Worksheet 3 allocates $500 directly and half of the remaining $3,500, each split 60:40.
    expect(form?.lines.find(row => row.line === "9")?.inputs).toMatchObject({
      line5Worksheet: "3",
      childQualifiedDividendsOnLine5: new Decimal("1650"),
      childNetCapitalGainOnLine5: new Decimal("1100"),
    });
    expect(form?.childRateIncome.toFixed()).toBe("0");
    expect(form?.taxOnChildRateIncome.toFixed()).toBe("0");
    expect(form?.taxAtChildOwnRate.toFixed()).toBe("101");
    // The parent has $3,250 of additional ordinary income at 32% and $2,750 at 15%.
    expect(result.allLines).toContainEqual(expect.objectContaining({
      form: "1040", line: "16", description: "Tax (Form 8615)", value: new Decimal("1453"),
    }));
    expect(() => calculateFederalTax({
      ...input,
      form8615: makeInput({
        ...itemizingWorksheet,
        preferentialWorksheetFacts: ordinaryParentWorksheet.preferentialWorksheetFacts,
      }),
    })).toThrow(/Worksheet 3 requires explicit deductible/);
  });

  it("Form 8615 Worksheet 3 uses the selected standard deduction and includes wages in AGI", () => {
    const input = TaxYearInputSchema.parse(makeFederalInput({
      ...ordinaryParentWorksheet,
      childUnearnedIncome: "20000", childQualifiedDividends: "3000", childNetLTCG: "2000",
    }, {
      standardDeductionFacts: { ...dependentDeductionFacts, primaryCanBeClaimedAsDependent: false },
      w2s: [{
        employer: { name: "Employer", ein: "12-3456789" }, wages: "2500", federalWithheld: "0",
        socialSecurityWages: "2500", socialSecurityWithheld: "155", medicareWages: "2500", medicareWithheld: "36.25",
      }],
      form1099Int: [{ ...makeFederalInput().form1099Int[0], interestIncome: "15000" }],
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "3000", qualifiedDividends: "3000",
        totalCapitalGainDistributions: "2000",
      }],
    }));
    const result = calculateFederalTax(input);
    const form = result.form8615;

    expect(result.agi.toFixed()).toBe("22500");
    expect(form?.netUnearnedIncome.toFixed()).toBe("17300");
    expect(form?.netUnearnedAtParentRate.toFixed()).toBe("6750");
    // $15,750 times $5,000 / $22,500 gives $3,500, split 60:40.
    expect(form?.lines.find(row => row.line === "9")?.inputs).toMatchObject({
      line5Worksheet: "3",
      childQualifiedDividendsOnLine5: new Decimal("900"),
      childNetCapitalGainOnLine5: new Decimal("600"),
    });
    expect(form?.tax.toFixed()).toBe("1905");
  });

  it.each([
    { preferentialWorksheetFacts: undefined },
    { otherChildrenNetUnearnedIncome: "1000" },
    { parentCollectiblesGain: "100" },
  ])("rejects unconfirmed Worksheet 1 compositions %o", overrides => {
    expect(() => calculateForm8615(makeInput({
      ...ordinaryParentWorksheet,
      childQualifiedDividends: "2000",
      ...overrides,
    }), new Decimal("3650"), "single", constants)).toThrow(/confirmed 2025 Worksheet 1/);
  });

  it("rejects Worksheet 3 without actual federal AGI and deduction context", () => {
    expect(() => calculateForm8615(makeInput(itemizingWorksheet), new Decimal("6600"), "single", constants))
      .toThrow(/Worksheet 3 requires actual federal AGI and selected deduction/);
    const input = makeInput({ ...ordinaryParentWorksheet, childQualifiedDividends: "2000" });
    expect(() => calculateForm8615(input, new Decimal("2000"), "single", constants))
      .toThrow(/Worksheet 3 requires actual federal AGI and selected deduction/);
  });

  it("rejects a conflicting parent's adjusted tax", () => {
    expect(() => calculateForm8615({
      ...makeInput({ ...ordinaryParentWorksheet, childQualifiedDividends: "2000" }),
      preferentialWorksheetFacts: { ...ordinaryParentWorksheet.preferentialWorksheetFacts, parentAdjustedLine16Tax: "41062" },
    }, new Decimal("3650"), "single", constants)).toThrow(/adjusted Form 1040 Line 16 tax does not reconcile/);
  });

  it.each(["qualified dividends", "net capital gain"] as const)(
    "reconciles actual %s with Form 8615 Worksheet 1 in the federal return",
    incomeType => {
      const isDividend = incomeType === "qualified dividends";
      const input = makeFederalInput({
        ...ordinaryParentWorksheet,
        childUnearnedIncome: "10000",
        childQualifiedDividends: isDividend ? "5000" : "0",
        childNetLTCG: isDividend ? "0" : "5000",
      }, {
        standardDeductionFacts: dependentDeductionFacts,
        form1099Div: [{
          payer: "Fund",
          ordinaryDividends: isDividend ? "5000" : "0",
          qualifiedDividends: isDividend ? "5000" : "0",
          totalCapitalGainDistributions: isDividend ? "0" : "5000",
          exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
        }],
      });
      const result = calculateFederalTax(input);

      expect(result.agi.toFixed()).toBe("10000");
      expect(result.taxableIncome.toFixed()).toBe("8650");
      const line9 = result.form8615?.lines.find(line => line.line === "9");
      expect(line9?.inputs[isDividend ? "childQualifiedDividendsOnLine5" : "childNetCapitalGainOnLine5"]?.toString()).toBe("3650");
      expect(result.form8615?.tax.toFixed()).toBe("1716");
      expect(result.allLines).toContainEqual(expect.objectContaining({
        form: "1040", line: "16", description: "Tax (Form 8615)", value: new Decimal("1716"),
      }));
      expect(() => calculateFederalTax({
        ...input,
        form8615: makeInput({ ...input.form8615, childUnearnedIncome: "10001" }),
      })).toThrow(/Form 8615.*reconcile.*federal/i);
      expect(() => calculateFederalTax({
        ...input,
        form8615: makeInput({ ...input.form8615, childUnearnedIncome: "0" }),
      })).toThrow(/Form 8615.*reconcile.*federal/i);
      expect(() => calculateFederalTax({
        ...input,
        form8615: makeInput({ ...input.form8615, childQualifiedDividends: "0", childNetLTCG: "0" }),
      })).toThrow(/Form 8615.*reconcile.*federal/i);
    },
  );

  it("keeps normal federal tax when evidenced W-2 wages and dividends produce a Line 3 stop", () => {
    const input = makeFederalInput({ childUnearnedIncome: "2000", childQualifiedDividends: "2000" }, {
      w2s: [{
        employer: { name: "Employer", ein: "12-3456789" }, wages: "5000", federalWithheld: "0",
        socialSecurityWages: "5000", socialSecurityWithheld: "310", medicareWages: "5000", medicareWithheld: "72.50",
      }],
      form1099Int: [],
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "2000", qualifiedDividends: "2000",
        exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
      }],
      standardDeductionFacts: { ...dependentDeductionFacts, dependentEarnedIncome: "5000" },
    });
    const result = calculateFederalTax(input);

    expect(result.taxableIncome.toFixed()).toBe("1550");
    expect(result.form8615?.applies).toBe(false);
    expect(result.form8615?.lines.find(line => line.line === "3")?.value.toFixed()).toBe("-700");
    expect(result.allLines).not.toContainEqual(expect.objectContaining({
      form: "1040", line: "16", description: "Tax (Form 8615)",
    }));
  });

  it("rejects an offsetting Schedule 1 loss even when federal AGI matches reported unearned income", () => {
    const input = TaxYearInputSchema.parse(makeFederalInput({
      ...ordinaryParentWorksheet, childUnearnedIncome: "10000", childQualifiedDividends: "5000",
    }, {
      standardDeductionFacts: dependentDeductionFacts,
      form1099Div: [{
        payer: "Fund", ordinaryDividends: "5000", qualifiedDividends: "5000",
        exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0",
      }],
      scheduleC: {
        businessName: "Synthetic Consulting", businessCode: "541511", grossReceipts: "1000",
        expenses: { advertising: "4000" },
      },
      form1099Misc: [{ payer: "Other Source", otherIncome: "3000" }],
    }));
    expect(calculateFederalTax({ ...input, form8615: undefined }).agi.toFixed()).toBe("10000");
    expect(() => calculateFederalTax(input)).toThrow(/Form 8615.*reconcile.*federal/i);
  });

  it("Form 8615 Line 14 - remainder taxed at child's own rate", () => {
    // Child has $8000 unearned income, $2000 earned income, taxable = $8650
    // Net unearned = 8000 - 2700 = 5300
    // Line 5 = min(5300, 8650) = 5300
    // Line 14 = 8650 - 5300 = 3350
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8650),
      "single",
      constants
    );
    expect(result.childRateIncome.toNumber()).toBe(3350);
    expect(result.lines.find(line => line.line === "14")?.value.toString()).toBe("3350");
  });

  it("Form 8615 Line 6 - parent's taxable income from input", () => {
    const result = calculateForm8615(
      makeInput({ parentTaxableIncome: "200000" }),
      new Decimal(5000),
      "single",
      constants
    );
    const line6 = result.lines.find(l => l.form === "8615" && l.line === "6");
    expect(line6?.value.toNumber()).toBe(200000);
  });

  it("Form 8615 Line 6 - floors parent's taxable income before computing the sibling allocation", () => {
    const result = calculateForm8615(makeInput({
      childUnearnedIncome: "22700",
      parentTaxableIncome: "-10000",
      parentFilingStatus: "single",
      otherChildrenNetUnearnedIncome: "180000",
    }), new Decimal("20000"), "single", constants);

    const line = (id: string) => result.lines.find(row => row.line === id)?.value.toString();
    // The published single-filer worksheet assigns $41,063 to $200,000 in 2025.
    expect([line("6"), line("8"), line("9"), line("10")]).toEqual(["0", "200000", "41063", "0"]);
    expect(result.tax.toString()).toBe("4106");
  });

  it("Form 8615 Line 7 - leaves sibling net unearned income blank when none", () => {
    const result = calculateForm8615(
      makeInput({ otherChildrenNetUnearnedIncome: "0" }),
      new Decimal(5000),
      "single",
      constants
    );
    expect(result.lines.filter(row => ["7", "12a", "12b"].includes(row.line))).toEqual([]);
  });

  // ─── Parent Rate Computation ─────────────────────────────

  it("Form 8615 Line 9 - tax on combined income uses parent's rates", () => {
    // Parent has $150,000 taxable income, MFJ
    // Child's net unearned = 5000 - 2700 = 2300
    // Combined = 150000 + 2300 = 152300
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const expectedLine9 = calculateTaxFromBrackets(
      new Decimal(152300),
      constants.taxBrackets.married_filing_jointly
    );
    const line9 = result.lines.find(l => l.form === "8615" && l.line === "9");
    expect(line9?.value.toNumber()).toBe(expectedLine9.toNumber());
  });

  it("Form 8615 Line 10 - tax on parent's income alone", () => {
    const result = calculateForm8615(
      makeInput({
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const expectedLine10 = calculateTaxFromBrackets(
      new Decimal(150000),
      constants.taxBrackets.married_filing_jointly
    );
    const line10 = result.lines.find(l => l.form === "8615" && l.line === "10");
    expect(line10?.value.toNumber()).toBe(expectedLine10.toNumber());
  });

  it("Form 8615 Line 11 - allocable parental tax is the marginal increase", () => {
    const input = makeInput({
      childUnearnedIncome: "5000",
      parentTaxableIncome: "150000",
      parentFilingStatus: "married_filing_jointly",
    });
    const result = calculateForm8615(input, new Decimal(5000), "single", constants);

    // At $150,000 MFJ, the parent is in the 22% bracket (96,950 - 206,700)
    // Net unearned = 2300, so allocable tax should be roughly 2300 * 22% = 506
    const taxOnCombined = calculateTaxFromBrackets(
      new Decimal(152300), constants.taxBrackets.married_filing_jointly
    );
    const taxOnParent = calculateTaxFromBrackets(
      new Decimal(150000), constants.taxBrackets.married_filing_jointly
    );
    expect(result.allocableParentalTax.toNumber()).toBe(
      taxOnCombined.minus(taxOnParent).toNumber()
    );
  });

  it("Form 8615 Line 13 - single child gets full allocable parental tax", () => {
    const result = calculateForm8615(
      makeInput({ otherChildrenNetUnearnedIncome: "0" }),
      new Decimal(5000),
      "single",
      constants
    );
    expect(result.childShareOfParentalTax.toNumber()).toBe(
      result.allocableParentalTax.toNumber()
    );
  });

  it("Form 8615 Line 15 - tax on child's remaining income at child's rate", () => {
    // Child: $8000 unearned, taxable = $8650
    // Net unearned = 5300, line 5 = 5300, line 14 = 3350
    // Published2025 single3350–3400 row338.
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8650),
      "single",
      constants
    );
    const expectedLine15 = new Decimal(338); // Published table, not exact3350*10percent.
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.toNumber());
  });

  it("Form 8615 Line 17 - tax at child's own rate on full taxable income", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(5000),
      "single",
      constants
    );
    const expectedLine17 = new Decimal(503); // Published5000–5050 single row.
    expect(result.taxAtChildOwnRate.toNumber()).toBe(expectedLine17.toNumber());
  });

  it("Form 8615 Line 18 - final tax is the greater of tentative and child-rate tax", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(10000),
      "single",
      constants
    );
    expect(result.tax.toNumber()).toBe(
      Math.max(result.tentativeTax.toNumber(), result.taxAtChildOwnRate.toNumber())
    );
    // Parent's rate is higher, so tentative tax should win
    expect(result.tax.toNumber()).toBe(result.tentativeTax.toNumber());
  });

  it("Form 8615 Line 18 - child's own rate applies when higher than parent's", () => {
    // Parent has very low income ($5000 MFJ) → 10% bracket
    // Child has high income → taxes at child's single rate may be higher
    // if the child's full-rate tax exceeds the tentative tax
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "50000",
        parentTaxableIncome: "5000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(50000),
      "single",
      constants
    );
    // At MFJ $5000, parent is in 10% bracket. Net unearned = 47300.
    // Combined = 52300 → still mostly 10% bracket.
    // Child at single rate on $50000 → spans 10% and 12% brackets.
    // Line 17 (child's own rate) could match or exceed line 16.
    expect(result.tax.toNumber()).toBe(
      Math.max(result.tentativeTax.toNumber(), result.taxAtChildOwnRate.toNumber())
    );
  });

  // ─── Sibling Allocation ────────────────────────────────────

  it("Form 8615 Lines 7–13 - records and allocates parental tax among siblings", () => {
    // Sharon in the IRS line 12b example has $3,000 on line 5 and $6,000 on line 7.
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5700",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
        otherChildrenNetUnearnedIncome: "6000",
      }),
      new Decimal(3000),
      "single",
      constants
    );

    const line = (id: string) => result.lines.find(row => row.line === id)?.value;
    expect([line("7"), line("8"), line("11"), line("12a"), line("13")].map(value => value?.toString()))
      .toEqual(["6000", "209000", "2880", "9000", "960"]);
    expect(line("12b")?.toFixed(3)).toBe("0.333");
    expect(line("12b")?.eq(new Decimal(1).dividedBy(3))).toBe(true);
    expect(result.childShareOfParentalTax.toString()).toBe("960");
  });

  it("Form 8615 Line 13 - rounds the sibling's exact half-dollar allocation up", () => {
    const result = calculateForm8615(makeInput({
      childUnearnedIncome: "2704",
      parentTaxableIncome: "71",
      parentFilingStatus: "single",
      otherChildrenNetUnearnedIncome: "100",
    }), new Decimal("1354"), "single", constants);

    // Published tax table amounts of $19 and $6 yield a $13 increase.
    // The child's exact $13 × $4 / $104 share is $0.50.
    expect(result.allocableParentalTax.toString()).toBe("13");
    expect(result.childShareOfParentalTax.toString()).toBe("1");
  });

  // ─── QDCG Interaction ─────────────────────────────────────

  it("Form 8615 Lines 9–10 - parent with QDCG uses preferential rate computation", () => {
    // Parent with $10,000 qualified dividends at MFJ
    const input = makeInput({
      childUnearnedIncome: "5000",
      parentTaxableIncome: "100000",
      parentFilingStatus: "married_filing_jointly",
      parentQualifiedDividends: "10000",
      parentNetLTCG: "0",
    });
    const result = calculateForm8615(input, new Decimal(5000), "single", constants);

    // Tax on combined should use QDCG
    const netUnearned = new Decimal(2300);
    const combined = new Decimal(102300);
    const taxCombined = calculateCapitalGainsTax(
      combined, new Decimal(10000), new Decimal(0), "married_filing_jointly", constants
    );
    const taxParent = calculateCapitalGainsTax(
      new Decimal(100000), new Decimal(10000), new Decimal(0), "married_filing_jointly", constants
    );

    const line9 = result.lines.find(l => l.form === "8615" && l.line === "9");
    expect(line9?.value.toNumber()).toBe(taxCombined.tax.toNumber());
    const line10 = result.lines.find(l => l.form === "8615" && l.line === "10");
    expect(line10?.value.toNumber()).toBe(taxParent.tax.toNumber());
  });

  it("Form 8615 Line 15 - child's qualified dividends exceeding Line 5 get QDCG treatment", () => {
    const result = calculateForm8615(
      makeInput({
        ...ordinaryParentWorksheet,
        childUnearnedIncome: "10000",
        childQualifiedDividends: "10000",
      }),
      new Decimal(12000),
      "single",
      constants
    );

    // $2,700 residual dividends leave $2,000 ordinary. The 2025 single Tax Table gives $201.
    expect(result.childRateIncome.toNumber()).toBe(4700);
    expect(result.taxOnChildRateIncome.toFixed()).toBe("201");
  });

  it("Form 8615 Line 17 - child's QDCG applies to full taxable income at child's rate", () => {
    const result = calculateForm8615(
      makeInput({
        ...ordinaryParentWorksheet,
        childUnearnedIncome: "5000",
        childQualifiedDividends: "3000",
        childNetLTCG: "1000",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    expect(result.taxAtChildOwnRate.toFixed()).toBe("101");
  });

  // ─── Filing Status Variations ─────────────────────────────

  it("Form 8615 - single parent uses single tax brackets", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "100000",
        parentFilingStatus: "single",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const combined = new Decimal(102300);
    const expectedTax = calculateTaxFromBrackets(combined, constants.taxBrackets.single);
    const line9 = result.lines.find(l => l.form === "8615" && l.line === "9");
    expect(line9?.value.toNumber()).toBe(expectedTax.toNumber());
  });

  it("Form 8615 - head of household parent uses HoH tax brackets", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "100000",
        parentFilingStatus: "head_of_household",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const combined = new Decimal(102300);
    const expectedTax = calculateTaxFromBrackets(combined, constants.taxBrackets.head_of_household);
    const line9 = result.lines.find(l => l.form === "8615" && l.line === "9");
    expect(line9?.value.toNumber()).toBe(expectedTax.toNumber());
  });

  // ─── Edge Cases ────────────────────────────────────────────

  it("Form 8615 - net unearned income of $1 produces a valid computation", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
    expect(result.tax.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("Form 8615 - itemizing child with $2,701 unearned income and zero directly connected deductions triggers the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701", childItemizesDeductions: true, childDirectlyConnectedItemizedDeductions: "0" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });

  it("Form 8615 - itemizing child with $2,700 unearned income and zero directly connected deductions does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2700", childItemizesDeductions: true, childDirectlyConnectedItemizedDeductions: "0" }),
      new Decimal(2700),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
  });

  it("Form 8615 - child's taxable income of zero produces zero tax even with high unearned income", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "10000" }),
      new Decimal(0),
      "single",
      constants
    );
    // Net unearned = 7300, but capped at taxable income = 0
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8615 - parent in highest bracket produces maximum marginal rate on child's income", () => {
    // Parent at $800,000 single = 37% bracket
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "800000",
        parentFilingStatus: "single",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    // Net unearned = 7300, entirely in parent's 37% bracket
    // Allocable parental tax ≈ 7300 * 0.37 = 2701
    expect(result.allocableParentalTax.toNumber()).toBe(2701);
  });

  it("Form 8615 - line 14 of zero produces zero line 15 tax", () => {
    // All child's taxable income is net unearned income
    // Unearned = 5000, taxable = 2300 (5000 - 2700 standard deduction)
    // Net unearned = 5000 - 2700 = 2300 = taxable, so line 5 = 2300, line 14 = 0
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(2300),
      "single",
      constants
    );
    expect(result.childRateIncome.toNumber()).toBe(0);
    expect(result.taxOnChildRateIncome.toNumber()).toBe(0);
  });

  it("Form 8615 - high-income parent with LTCG and section 1250 gain", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "300000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "20000",
        parentNetLTCG: "30000",
        parentSection1250Gain: "5000",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    // Verify a preferential worksheet is used for the parent computation.
    const line9 = result.lines.find(l => l.form === "8615" && l.line === "9");
    expect(line9?.formula).toContain("preferential tax worksheet");

    // The tax should be higher than without QDCG because the children's unearned
    // income stacks on top, potentially pushing ordinary income into higher brackets
    expect(result.applies).toBe(true);
    expect(result.tax.greaterThan(0)).toBe(true);
  });

  it("Form 8615 - child with LTCG allocated between Lines 5 and 14", () => {
    const result = calculateForm8615(
      makeInput({
        ...ordinaryParentWorksheet,
        childUnearnedIncome: "15000",
        childQualifiedDividends: "8000",
        childNetLTCG: "5000",
      }),
      new Decimal(15000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(2700);
    const line9 = result.lines.find(line => line.line === "9");
    expect(line9?.inputs.childQualifiedDividendsOnLine5?.toString()).toBe("6560");
    expect(line9?.inputs.childNetCapitalGainOnLine5?.toString()).toBe("4100");
    // The remaining $360 ordinary taxable income falls in the $350–$375 Tax Table row.
    expect(result.taxOnChildRateIncome.toFixed()).toBe("36");
  });

  // ─── Integration with federal.ts ──────────────────────────

  it("Form 8615 - federal orchestrator uses Form 8615 tax when input is provided", () => {
    // Child needs enough income to exceed the $15,000 standard deduction
    const result = calculateFederalTax(makeFederalInput({
      childUnearnedIncome: "25000",
      parentTaxableIncome: "200000",
      parentFilingStatus: "single",
    }, {
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Trust Fund", interestIncome: "25000" }],
    }));

    expect(result.form8615).toBeDefined();
    expect(result.form8615!.applies).toBe(true);
    // The income tax (line 16) should come from Form 8615
    const form8615Tax = result.form8615!.tax;
    expect(form8615Tax.greaterThan(0)).toBe(true);
  });

  it("Form 8615 - audit trail includes Form 8615 lines", () => {
    const result = calculateFederalTax(makeFederalInput({
      childUnearnedIncome: "25000",
      parentTaxableIncome: "200000",
      parentFilingStatus: "single",
    }, {
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Trust Fund", interestIncome: "25000" }],
    }));

    const form8615Lines = result.allLines.filter(l => l.form === "8615");
    expect(form8615Lines.length).toBeGreaterThan(0);
    const line18 = form8615Lines.find(l => l.line === "18");
    expect(line18).toBeDefined();
  });

  // ─── Comprehensive Scenario ────────────────────────────────

  it("Form 8615 - realistic scenario: 16-year-old with trust income, parents in 24% bracket", () => {
    // Child: $20,000 interest + $5,000 QD from trust, plus $3,000 summer job
    // Total income = $28,000, unearned = $25,000
    // Standard deduction = max($1,350, $3,000 + $450) = $3,450
    // Taxable income = $28,000 - $3,450 = $24,550
    // Net unearned = $25,000 - $2,700 = $22,300
    // Line 5 = min($22,300, $24,550) = $22,300
    // Line 14 = $24,550 - $22,300 = $2,250
    // Parent: $350,000 MFJ taxable → in 24% bracket
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "25000",
        childQualifiedDividends: "5000",
        parentTaxableIncome: "350000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "15000",
        parentNetLTCG: "10000",
        preferentialWorksheetFacts: {
          ...ordinaryParentWorksheet.preferentialWorksheetFacts,
          parentTaxMethod: "qualified-dividends-and-capital-gain",
          parentAdjustedLine16Tax: "67444",
        },
      }),
      new Decimal(24550),
      "single",
      constants
    );

    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(22300);
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(22300);
    expect(result.childRateIncome.toNumber()).toBe(2250);

    // The child pays significantly more than their own-rate tax
    expect(result.tentativeTax.greaterThan(result.taxAtChildOwnRate)).toBe(true);
    expect(result.tax.toNumber()).toBe(result.tentativeTax.toNumber());
    expect(result.tax.toFixed()).toBe("5122");

    expect(result.lines.map(line => line.line)).toEqual([
      "1", "2", "3", "4", "5", "6", "8", "9", "10", "11", "13", "14", "15", "16", "17", "18",
    ]);
  });
});
