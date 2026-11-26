// Spec: spec/federal/itemized-deduction-limit.yaml
// Inject draft constants only in this focused test; production getConstants(2026) remains gated.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateFederalTax as calculatePublicFederalTax, parseInput } from "@/index.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { mortgageInput, mortgageLoan } from "../fixtures/mortgage-source.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
// These synthetic itemization scenarios have a confirmed full-year2025 US-resident return with no tax liability.
// This actual fixture fact avoids assuming an unpublished2027 penalty rate while testing deductions.
const form2210 = {calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  calculationMethod:"regular",withholdingMethod:"equal-installments",priorYearTaxStatus:"no-tax-liability",priorYearFullYear:true,
  priorYearResidentAllYear:true,priorYearTaxForForm2210:"0",priorYearTaxComputationConfirmed:true};
const base = { ...simpleW2Fixture,form2210, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "700000" }] };
const actualMortgage = (interest: string) => {
  const source = mortgageInput([mortgageLoan({interestPaid:interest,balance:{method:"highest_balance",amount:"100000",sourceReference:"Actual synthetic maximum"}})]);
  if (!source.mortgageInterestWorksheet) throw new Error("Missing synthetic mortgage worksheet");
  return {form1098:source.form1098.map(form=>({...form,taxYear:2026})),mortgageInterestWorksheet:{...source.mortgageInterestWorksheet,sourceTaxYear:2026}};
};

function directReitStatement(ordinaryDividends: string, section199ADividends = ordinaryDividends, account = 1, relatedPaymentAmount = "0") {
  return {
    taxYear: 2026, payer: "Synthetic Broker", accountReference: `Synthetic account ${account}`,
    ordinaryDividends, section199ADividends,
    directReitDividendFacts: {
      sourceTaxYear: 2026, sourceAsOfDate: "2026-07-30", sourceReference: `Synthetic original ${account}`,
      sourceFactsConfirmed: true, securityIdentifier: "SYNTHETIC-REIT", issuerName: "Synthetic REIT",
      originalBox5Amount: section199ADividends, acquiredOn: "2026-04-30", exDividendOn: "2026-06-15",
      paidOn: "2026-06-30", heldThrough: "2026-06-15", positionEnded: true, diminishedRiskDays: 0,
      relatedPaymentAmount, singleDirectReitDistributionConfirmed: true,
    },
  };
}

const reitCashReturn = (amount: string) => ({
  ...base,
  w2s: [],
  form1099Div: [directReitStatement("1000000")],
  donations: [{
    organization: "Synthetic public charity", type: "cash", amount, dateOfDonation: "2026-01-01",
    qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, recipientCategory: "fifty-percent",
  }],
});

describe("2026 federal itemized limitation integration", () => {
  it("reduces itemized deductions after the charitable floor without changing AGI", () => {
    const input = TaxYearInputSchema.parse({ ...base, donations: [{ organization: "Synthetic public charity", type: "cash", amount: "103500", dateOfDonation: "2026-01-01", qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, isPrivateFoundation: false }] });
    const result = calculateFederalTax(input);
    expect(result.agi.toString()).toBe("700000");
    expect(result.itemizedDeductionReduction?.toString()).toBe("3211");
    expect(result.deductionAmount.toString()).toBe("96789");
    expect(result.taxableIncome.toString()).toBe("603211");
    expect(result.form6251?.amti.toString()).toBe("600000");
  });
  it("switches to standard deduction when the overall limit makes it larger", () => {
    const input = TaxYearInputSchema.parse({ ...base, ...actualMortgage("16500") });
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toString()).toBe("16100");
  });
  it("computes QBI before section 68 and subtracts it from the reduction base", () => {
    const input = TaxYearInputSchema.parse({ ...base, w2s: [], form1099Div: [directReitStatement("700000")], ...actualMortgage("100000") });
    const result = calculateFederalTax(input);
    expect(result.form8995A?.qbiDeduction.toString()).toBe("120000");
    expect(result.itemizedDeductionReduction?.toString()).toBe("0");
    expect(result.taxableIncome.toString()).toBe("480000");
  });
  it("rejects unimplemented NOL coordination for 2026", () => {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...base, priorYear: { nolCarryforward: "1000" } }))).toThrow(/NOL.*coordination/i);
  });
  it("recomputes a taxable-income-limited QBI deduction after switching to standard", () => {
    const input = TaxYearInputSchema.parse({ ...base, w2s: [], form1099Div: [directReitStatement("1000000")], ...actualMortgage("16500") });
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe("standard");
    expect(result.form8995A?.qbiDeduction.toString()).toBe("196780");
    expect(result.taxableIncome.toString()).toBe("787120");
  });

  // spec/federal/itemized-deduction-limit.yaml, automatic-reit-cash-election
  it.each([
    { gift: "23100", election: undefined, method: "standard", tax: "277296", qbi: "196580", taxable: "786320", itemizedBalance: "-277362" },
    { gift: "25000", election: "automatic", method: "itemized", tax: "276837", qbi: "196000", taxable: "785081", itemizedBalance: "-276837" },
  ])("selects the better completed automatic return for a $gift eligible cash gift", ({ gift, election, method, tax, qbi, taxable, itemizedBalance }) => {
    const raw = { ...reitCashReturn(gift), deductionElection: election };
    const input = parseInput(raw);
    const original = structuredClone(input);
    const automatic = calculatePublicFederalTax(input);
    const elected = calculatePublicFederalTax(parseInput({ ...raw, deductionElection: method }));

    expect(automatic.deductionUsed).toBe(method);
    expect(automatic.totalTax.toFixed()).toBe(tax);
    expect(automatic.form8995A?.qbiDeduction.toFixed()).toBe(qbi);
    expect(automatic.taxableIncome.toFixed()).toBe(taxable);
    const { allLines, ...result } = automatic;
    const { allLines: electedLines, ...electedResult } = elected;
    expect(result).toEqual(electedResult);
    expect(allLines.slice(0, -1)).toEqual(electedLines);
    const comparison = allLines.at(-1);
    expect(comparison).toMatchObject({ form: "Deduction Selection", line: "automatic-comparison" });
    expect(String(comparison?.inputs["Itemized refund less amount owed"])).toBe(itemizedBalance);
    expect(String(comparison?.inputs["Standard refund less amount owed"])).toBe("-277296");
    expect(comparison?.value.toFixed()).toBe(`-${tax}`);
    expect(calculateFederalTax(structuredClone(original))).toEqual(automatic);
    expect(input).toEqual(original);
  });

  // spec/federal/itemized-deduction-limit.yaml, automatic-reit-dividend-precision
  it.each([
    {
      scenario: "matching cents", boxes: [["1000000.01", "1000000.01"]],
      ordinary: "1000000.01", line17: "1000000", method: "standard", balance: "277296",
    },
    {
      scenario: "an exact half dollar", boxes: [["1000000.50", "1000000.50"]],
      ordinary: "1000000.50", line17: "1000001", method: "standard", balance: "277296",
    },
    {
      scenario: "two statements that together reach half a dollar",
      boxes: [["600000.25", "600000.25"], ["400000.25", "400000.25"]],
      ordinary: "1000000.50", line17: "1000001", method: "standard", balance: "277296",
    },
    {
      scenario: "a raw box mismatch that rounds to the same dollar", boxes: [["1000000.01", "1000000.00"]],
      ordinary: "1000000.01", line17: "1000000", method: "itemized", balance: "277362",
    },
    {
      scenario: "a related-payment penny that rounds to the same dollar",
      boxes: [["1000000.00", "1000000.00"], ["0.01", "0.01", "0.01"]],
      ordinary: "1000000.01", line17: "1000000", method: "itemized", balance: "277362",
    },
  ])("reconciles REIT dividend source precision for $scenario", ({ boxes, ordinary, line17, method, balance }) => {
    const raw = {
      ...reitCashReturn("23100"), form1099Div: boxes.map(([ordinaryDividends, section199ADividends, relatedPaymentAmount], index) =>
        directReitStatement(ordinaryDividends, section199ADividends, index + 1, relatedPaymentAmount)),
    };
    const elected = calculatePublicFederalTax(parseInput({ ...raw, deductionElection: method }));
    const automatic = calculatePublicFederalTax(parseInput(raw));

    expect(elected.amountOwed.toFixed()).toBe(balance);
    expect(automatic.totalDividends.toFixed(2)).toBe(ordinary);
    expect(automatic.form8995A?.qualifiedReitDividends.toFixed()).toBe(line17);
    expect(automatic.deductionUsed).toBe(method);
    expect(automatic.amountOwed.toFixed()).toBe(balance);
    expect(automatic.allLines.some(line => line.line === "automatic-comparison")).toBe(method === "standard");
  });

  // spec/federal/itemized-deduction-limit.yaml, explicit-reit-cash-election
  it.each([
    { election: "itemized", deduction: "17122", reduction: "978", charity: "0", qbi: "196380", tax: "277362" },
    { election: "standard", deduction: "16100", reduction: "0", charity: "1000", qbi: "196580", tax: "277296" },
  ])("honors the explicit $election election without an automatic comparison", ({ election, deduction, reduction, charity, qbi, tax }) => {
    const input = parseInput({ ...reitCashReturn("23100"), deductionElection: election });
    const result = calculatePublicFederalTax(input);

    expect(result.deductionUsed).toBe(election);
    expect(result.deductionAmount.toFixed()).toBe(deduction);
    expect(result.itemizedDeductionReduction?.toFixed()).toBe(reduction);
    expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe(charity);
    expect(result.form8995A?.qbiDeduction.toFixed()).toBe(qbi);
    expect(result.totalTax.toFixed()).toBe(tax);
    expect(result.allLines.some(line => line.line === "automatic-comparison")).toBe(false);
  });

  it("keeps a return with dated Form 2210 withholding outside the comparison", () => {
    const input = parseInput({ ...reitCashReturn("23100"), form2210: { ...form2210, withholdingMethod: "actual-dates", withholdingPayments: [] } });
    const result = calculatePublicFederalTax(input);

    expect(result.deductionUsed).toBe("itemized");
    expect(result.form2210?.withholdingMethod).toBe("actual-dates");
    expect(result.allLines.some(line => line.line === "automatic-comparison")).toBe(false);
  });

  it("keeps current excess charitable gifts outside the comparison", () => {
    const result = calculatePublicFederalTax(parseInput(reitCashReturn("650000")));

    expect(result.deductionUsed).toBe("itemized");
    expect(result.carryforwards.charitableContributions.gt(0)).toBe(true);
    expect(result.allLines.some(line => line.line === "automatic-comparison")).toBe(false);
  });
});
