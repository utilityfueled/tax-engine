// Spec: spec/federal/net-operating-loss-return.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { actualNolInput } from "../fixtures/net-operating-loss.js";

import { qsbsFullExclusionFundInput } from "../fixtures/section-1202.js";

const input = actualNolInput;
it("nets restored1202 gain before disallowing the remaining modified capital loss", () => {
  for (const [loss, reportedCapital, modifiedAgi, claim, absorbed] of [
    ["-700", "-200", "100300", "67240", "67640"],
    ["-4000", "-3000", "100000", "65000", "67400"],
  ]) {
    const qsbs = qsbsFullExclusionFundInput("500", "1000");
    qsbs.scheduleDSpecialGainSources!.priorShortTermCapitalLoss = loss!;
    const source = input("100000", { priorYear: { shortTermCapitalLoss: loss },
      form1099Div: qsbs.form1099Div, section1202Sources: qsbs.section1202Sources,
      scheduleDSpecialGainSources: qsbs.scheduleDSpecialGainSources,
    });
    const result = calculateFederalTax(source);
    expect(result.capitalGainLoss.toFixed()).toBe(reportedCapital);
    expect(result.netOperatingLoss?.modifiedIncome.agi.toFixed()).toBe(modifiedAgi);
    expect(result.nolDeduction.toFixed()).toBe(claim);
    expect(result.netOperatingLoss?.absorbed.toFixed()).toBe(absorbed);
  }
});
it("removes QBI from modified alternative carry income without removing it from current AMTI", () => {
  const source = input("0", { w2s: [], scheduleC: { businessName: "Actual sole proprietorship", accountHolder: "primary", grossReceipts: "100000" } });
  const vintage = source.netOperatingLoss?.vintages?.[0];
  if (!vintage || !source.netOperatingLoss?.alternativeTax) throw new Error("Missing synthetic source");
  source.netOperatingLoss.alternativeTax.vintages = [{ ...vintage, sourceId: "amt2021", section1411OriginalLoss: undefined }];
  const result = calculateFederalTax(source);
  expect(result.nolDeduction.toFixed()).toBe("59348");
  expect(result.agi.toFixed()).toBe("30587");
  expect(result.netOperatingLoss?.alternativeTax.amtiBeforeAtnol.toFixed()).toBe("86968");
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe("78271");
  expect(result.netOperatingLoss?.alternativeTax.modifiedAmtiBeforeAtnol.toFixed()).toBe("92935");
  expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe("83642");
});

it("replays the actual earlier vintage deduction on the modified income basis", () => {
  const source = input("118750");
  const first = source.netOperatingLoss?.vintages?.[0];
  if (!first || !source.netOperatingLoss?.vintages) throw new Error("Missing synthetic source");
  source.netOperatingLoss.vintages.push({ ...first, sourceId: "loss2022", lossTaxYear: 2022 });
  const result = calculateFederalTax(source);
  expect(result.nolDeduction.toFixed()).toBe("80000");
  expect(result.netOperatingLoss?.vintages.map(row => row.absorbed?.toFixed())).toEqual(["82400", "0"]);
  expect(result.netOperatingLoss?.modifiedVintageIncome[1]?.retainedEarlierDeduction.toFixed()).toBe("82400");
  expect(result.netOperatingLoss?.modifiedVintageIncome[1]?.income.taxableIncome.toFixed()).toBe("20600");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("117600");
});
it("transfers the actual originating investment fraction without using carry absorption", () => {
  const source = input("250000", { form1099Int: [{ payer: "Actual domestic bank", interestIncome: "100000", federalWithheld: "20000" }] });
  const vintage = source.netOperatingLoss?.vintages?.[0];
  if (!vintage) throw new Error("Missing synthetic source");
  vintage.section1411OriginalLoss = "30000";
  const result = calculateFederalTax(source);
  expect(result.agi.toFixed()).toBe("247000");
  expect(result.netOperatingLoss?.section1411Deduction.toFixed()).toBe("30000");
  expect(result.allLines.find(row => row.form === "Form 8960" && row.line === "7")?.value.toFixed()).toBe("-30000");
  expect(result.niitTax.toFixed()).toBe("1786");
});
it("requires independent consistent carry sources and investment origins", () => {
  const missing = input("100000");
  if (!missing.netOperatingLoss) throw new Error("Missing synthetic source");
  missing.netOperatingLoss.alternativeTax = undefined;
  expect(() => calculateFederalTax(missing)).toThrow(/separate actual complete AMT/);
  const unknown = input("100000");
  const vintage = unknown.netOperatingLoss?.vintages?.[0];
  if (!vintage) throw new Error("Missing synthetic source");
  vintage.section1411OriginalLoss = undefined;
  expect(() => calculateFederalTax(unknown)).toThrow(/originating Section1411/);
  const mismatch = input("100000", { priorYear: { nolCarryforward: "99999" } });
  expect(() => calculateFederalTax(mismatch)).toThrow(/Legacy NOL aggregate/);
  const different = input("100000", { scheduleK1: [{ partnershipName: "Actual business", partnershipEIN: "12-3456789", ordinaryIncome: "0", amtDepreciationAdjustment: "100" }] });
  expect(() => calculateFederalTax(different)).toThrow(/AMT basis/);
});
it("rejects unresolved charity and current loss carry interactions", () => {
  expect(() => calculateFederalTax(input("50000", { priorYear: {}, donations: [{ organization: "Actual public charity", type: "cash", amount: "30000", dateOfDonation: "2025-05-01" }] }))).toThrow(/Charitable.*qualification/);
  expect(() => calculateFederalTax(input("0", { scheduleC: { businessName: "Actual loss business", grossReceipts: "0", expenses: { otherExpenses: "30000" } } }))).toThrow(/current.year.*loss/i);
  expect(() => calculateFederalTax(input("100000", { form1099C: [{ creditor: "Actual lender", amountDischarged: "1000" }], codExclusion: { bankruptcy: true } }))).toThrow(/vintage attribute/);
});
it("requires the missing foreign loss allocation before a general credit", () => {
  expect(() => calculateFederalTax(input("100000", { form1099Int: [{ payer: "Actual foreign bank", interestIncome: "1000", foreignTaxPaid: "100", foreignCountry: "Canada" }] }))).toThrow(/NOL.*foreign.source/i);
});
it("refigures source-qualified student loan interest for current and modified income", () => {
  const result = calculateFederalTax(input("94000", { studentLoanInterestFacts: {
    sourceTaxYear: 2025, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
    puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans: [{
      sourceId: "loan1", borrowerId: "borrower1", accountHolder: "primary", lender: "Actual synthetic lender", sourceKind: "lender_statement",
      loanOriginationDate: "2010-08-01", interestPaid: "2500", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
      legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self", expensesWithinReasonablePeriod: true,
      relatedLender: false, employerPlanLoan: false, employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0",
      qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [],
    }],
  } }));
  expect(result.nolDeduction.toFixed()).toBe("59000");
  expect(result.netOperatingLoss?.absorbed.toFixed()).toBe("61800");
  expect(result.schedule1?.studentLoanInterest.toFixed()).toBe("2500");
  expect(result.agi.toFixed()).toBe("29500");
});

it("refigures actual IRA income for the claim modified carry and final return", () => {
  const result = calculateFederalTax(input("88000", { iraDeductionWorksheet: {
    primaryContributions: "7000", primaryIsActiveParticipant: true, primaryCompensation: "88000",
    primaryRothContributions: "0", primarySection501c18Contributions: "0", sourceFactsConfirmed: true,
  } }));
  expect(result.nolDeduction.toFixed()).toBe("53160");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("42760");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("7000");
  expect(result.agi.toFixed()).toBe("24840");
});

it("calculates the separate ATNOL from canonical current and modified AMTI", () => {
  const actual = input("100000");
  const regular = actual.netOperatingLoss?.vintages?.[0];
  if (!actual.netOperatingLoss?.alternativeTax || !regular) throw new Error("Missing synthetic source");
  actual.netOperatingLoss.alternativeTax.vintages = [{ ...regular, sourceId: "amt-2021", section1411OriginalLoss: undefined }];
  const result = calculateFederalTax(actual);
  expect(result.nolDeduction.toFixed()).toBe("65000");
  expect(result.agi.toFixed()).toBe("32000");
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe("87300");
  expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe("10000");
  expect(result.form6251?.amti.toFixed()).toBe("9700");
  expect(result.allLines.find(line => line.form === "Form 6251" && line.line === "2e")?.value.toFixed()).toBe("65000");
  expect(result.allLines.find(line => line.form === "Form 6251" && line.line === "2f")?.value.toFixed()).toBe("-87300");
});
it("refigures taxable Social Security rather than retaining the no-NOL amount", () => {
  const result = calculateFederalTax(input("25000", { formSSA1099: [{ recipient: "primary", netBenefits: "20000", federalWithheld: "0" }] }));
  expect(result.nolDeduction.toFixed()).toBe("7800");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("88320");
  expect(result.socialSecurityBenefitsTaxable.toFixed()).toBe("0");
  expect(result.agi.toFixed()).toBe("14200");
});
it("refigures the passive rental allowance before carrying an actual NOL", () => {
  const result = calculateFederalTax(input("125000", { rentalProperties: [{ description: "Actual rental", rents: "0", otherExpenses: "40000",
    propertyType: "single_family", rentalDays: 365, personalUseDays: 0, isActiveParticipant: true }] }));
  expect(result.nolDeduction.toFixed()).toBe("73800");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("22600");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("25000");
  expect(result.agi.toFixed()).toBe("23200");
});
it("refigures the medical floor without treating the claimed NOL as carry absorption", () => {
  const result = calculateFederalTax(input("100000", { scheduleA: { medicalExpenses: "30000" } }));
  expect(result.nolDeduction.toFixed()).toBe("59420");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("38000");
  expect(result.agi.toFixed()).toBe("37580");
  expect(result.deductionAmount.toFixed()).toBe("27181");
});
