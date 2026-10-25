// Spec: spec/federal/form-172-itemized-origin.yaml. Derived source examples.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { currentOriginInput } from "../fixtures/form-172-origin.js";
import { mortgageInput, mortgageLoan } from "../fixtures/mortgage-source.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing synthetic itemized source");
  return value;
}

function interestSource(gross: string) {
  return { sourceTaxYear: 2025, sourceReference: "Actual completed ordinary investment-interest worksheet", sourceFactsConfirmed: true,
    investmentInterestExpense: "6000", priorYearDisallowed: "0", grossInvestmentIncome: gross,
    qualifiedDividendsIncluded: "0", netGainFromInvestmentProperty: "0", netCapitalGainFromInvestmentProperty: "0",
    electedPreferentialIncome: "0", investmentExpenses: "0" };
}

it("computes medical and property deductions independently for regular and alternative origins", () => {
  const medical = calculateFederalTax(currentOriginInput("100000", { scheduleA: { medicalExpenses: "50000" } }));
  expect(medical.deductionUsed).toBe("itemized");
  for (const form of [medical.form172?.regular, medical.form172?.alternativeTax]) {
    expect(form?.partI[1].toFixed()).toBe("-125000");
    expect(form?.partI[6].toFixed()).toBe("50000");
    expect(form?.partI[9].toFixed()).toBe("45000");
    expect(form?.netOperatingLoss.toFixed()).toBe("80000");
  }
  const property = calculateFederalTax(currentOriginInput("100000", { scheduleA: { medicalExpenses: "2000", realEstateTaxes: "20000" } }));
  expect(property.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(property.form6251?.amti.toFixed()).toBe("-77000");
  expect(property.form172?.alternativeTax.partI[6].toFixed()).toBe("2000");
  expect(property.form172?.alternativeTax.partI[9].toFixed()).toBe("0");
  expect(property.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("77000");
});

it("uses actual elected receipt sales taxes and rejects unclassified income taxes", () => {
  const input = currentOriginInput("100000", { scheduleA: { realEstateTaxes: "20000" },
    salesTaxDeduction: { state: "TX", method: "actual", actualGeneralSalesTax: "1000.25", autoCompare: false } });
  input.w2s[0].stateTaxWithheld = "3000";
  const result = calculateFederalTax(input);
  expect(result.scheduleA?.salesTaxElected).toBe(true);
  expect(result.deductionAmount.toFixed()).toBe("21000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
  expect(input.salesTaxDeduction?.actualGeneralSalesTax).toBe("1000.25");
  required(input.scheduleA).realEstateTaxes = "20000.25";
  expect(calculateFederalTax(input).deductionAmount.toFixed()).toBe("21001");
  required(input.salesTaxDeduction).autoCompare = true;
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*income.tax.*classification/i);
  required(input.salesTaxDeduction).method = "table";
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*sales.tax.*source/i);
});

it("uses verified main-home mortgage deductions and preserves unknown AMT dwelling facts", () => {
  const mortgage = mortgageInput([mortgageLoan({ interestPaid: "10000", balance: { method: "highest_balance", amount: "200000", sourceReference: "Actual annual maximum" } })]);
  const input = currentOriginInput("100000", { form1098: mortgage.form1098, mortgageInterestWorksheet: mortgage.mortgageInterestWorksheet,
    scheduleA: { realEstateTaxes: "10000" } });
  const result = calculateFederalTax(input);
  expect(result.deductionAmount.toFixed()).toBe("20000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("80000");
  required(input.mortgageInterestWorksheet).loans[0].points = { method: "ratable", originalPoints: "4800", originalPrincipal: "200000",
    loanTermMonths: 240, paymentsInYear: 12, paymentIntervalMonths: 1, unamortizedPointsAtStartOfYear: "3600",
    cashMethod: true, comparableLoanTerms: true, pointsAreInterest: true, paidDate: "2020-01-01" };
  const points = calculateFederalTax(input);
  expect(points.scheduleA?.mortgageWorksheet.deductiblePoints.toFixed()).toBe("240");
  expect(points.form172?.alternativeTax.partI[6].toFixed()).toBe("10240");
  expect(points.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("80000");
  required(input.mortgageInterestWorksheet).loans[0].homeUse = "second";
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*AMT.*dwelling/i);
  input.mortgageInterestWorksheet = undefined;
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*mortgage.*source/i);
});

it("requires AMT dwelling sources for prior points rather than current cash payments", () => {
  const loan = mortgageLoan({ interestPaid: "0", pointsPaid: "0",
    balance: { method: "highest_balance", amount: "200000", sourceReference: "Actual annual maximum" },
    points: { method: "ratable", originalPoints: "4800", originalPrincipal: "200000", loanTermMonths: 240,
      paymentsInYear: 12, paymentIntervalMonths: 1, unamortizedPointsAtStartOfYear: "3600",
      cashMethod: true, comparableLoanTerms: true, pointsAreInterest: true, paidDate: "2020-01-01" } });
  const mortgage = mortgageInput([loan]);
  const input = currentOriginInput("100000", { form1098: mortgage.form1098,
    mortgageInterestWorksheet: mortgage.mortgageInterestWorksheet, scheduleA: { realEstateTaxes: "20000" } });
  const result = calculateFederalTax(input);
  expect(result.scheduleA?.mortgageWorksheet.deductiblePoints.toFixed()).toBe("240");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.partI[6].toFixed()).toBe("240");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75240");
  required(input.mortgageInterestWorksheet).loans[0].homeUse = "second";
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*AMT.*dwelling/i);
  const firstLoan = required(input.mortgageInterestWorksheet).loans[0];
  firstLoan.points = { method: "completed_amortization", sourceTaxYear: 2025,
    worksheetReference: "Actual prior-point deduction worksheet", deductibleAmountBeforeLimit: "240",
    unamortizedPointsAvailable: "3600", reportedOnCurrentForm1098: false, serviceFeesExcludedConfirmed: true };
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*AMT.*dwelling/i);
  firstLoan.homeUse = "main";
  const other = mortgageLoan({ sourceId: "ineligible-second", form1098SourceId: undefined, homeId: "other-home",
    homeUse: "second", qualifiedResidence: false, interestPaid: "1000", pointsPaid: "0" });
  required(input.mortgageInterestWorksheet).loans.push(other);
  expect(calculateFederalTax(input).form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75240");
});

it("recomputes independent investment interest without copying regular AMT amounts", () => {
  const input = currentOriginInput("100000", { form4952: interestSource("5000"), form4952Amt: interestSource("5500"), scheduleA: { realEstateTaxes: "20000" } });
  const bank = input.form1099Int[0];
  bank.taxExemptInterest = "500"; bank.privateActivityBondInterest = "500"; bank.accountHolder = "primary";
  bank.privateActivityBondFacts = { taxYear: 2025, sourceId: "Actual PAB source", recipientAmountsConfirmed: true, otherwiseAllowableDeduction: "0" };
  const result = calculateFederalTax(input);
  expect(result.form4952?.line8.toFixed()).toBe("5000");
  expect(result.form4952Amt?.line8.toFixed()).toBe("5500");
  expect(result.form6251?.amti.toFixed()).toBe("-80000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.partI[6].toFixed()).toBe("5500");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe("0");
  required(input.form4952Amt).grossInvestmentIncome = "5501";
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*investment.*income/i);
  input.form4952Amt = undefined;
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*separate.*AMT.*investment/i);
});

it("preserves exact itemized sources and rejects unclassified deductions", () => {
  const input = currentOriginInput("100000", { scheduleA: { medicalExpenses: "2000.25", realEstateTaxes: "20000.25" } });
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("77000");
  expect(JSON.stringify(input)).toBe(before);
  required(input.scheduleA).medicalExpenses = "-1";
  expect(() => calculateFederalTax(input)).toThrow(/Form172.*nonnegative/i);
  const interest = currentOriginInput("100000", { scheduleA: { investmentInterestExpense: "1000", realEstateTaxes: "20000" } });
  expect(() => calculateFederalTax(interest)).toThrow(/Form172.*investment.*source/i);
  const standard = calculateFederalTax(currentOriginInput("100000", { scheduleA: { medicalExpenses: "2000" } }));
  expect(standard.deductionUsed).toBe("standard");
  expect(standard.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
});
