// Spec: spec/federal/educator-education-exclusions.yaml.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

function educator(amount = "500", changes: Record<string, unknown> = {}) {
  return {
    accountHolder: "primary", taxYear: 2026, schoolYear: "2025-2026", sourceFactsConfirmed: true,
    schools: [{ name: "Synthetic school", role: "teacher", level: "k12", schoolEligible: true, hoursWorked: "900" }],
    expenses: [{ sourceId: changes.accountHolder === "spouse" ? "spouse-classroom" : "classroom", datePaid: "2026-03-01", description: "Actual classroom supplies", category: "classroom", amount,
      ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false,
      itemizedReimbursements: "0", itemizedTaxFreeFunding: "0" }],
    reimbursementsNotInWages: "0", excludedSavingsBondInterest: "0",
    nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0", ...changes,
  };
}
const base = {
  ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1980-01-01" } },
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "20000" }],
};
const calculate = (value: unknown) => calculateFederalTax(TaxYearInputSchema.parse(value));
function distributions() {
  const rows = [
    { sourceId: "qtp", accountId: "qtp", beneficiaryId: "student", recipientOwner: "primary", accountType: "529", grossDistribution: "1000", earnings: "200.10", basis: "799.90", distributionMedium: "cash" },
    { sourceId: "esa", accountId: "esa", beneficiaryId: "student", recipientOwner: "primary", accountType: "coverdell_esa", grossDistribution: "850" },
  ];
  return {
    form1099Q: rows.map(row => ({ ...row, taxYear: 2026, payerName: "Synthetic plan", isTrusteeToTrustee: false, isQtpToRoth: false,
      recipientNotBeneficiary: row.accountType === "529", sourceFactsConfirmed: true, transfer: { kind: "none" } })),
    qualifiedEducationExpenses: { sourceFacts: {
      taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
      beneficiaries: [{ id: "student", name: "Synthetic student", outsideK12QualifiedDistributions: "0" }],
      expenses: rows.map(row => ({ id: row.sourceId, beneficiaryId: "student", category: "postsecondary_tuition", paidDate: "2026-08-15",
        amount: row.grossDistribution, refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true })),
      allocations: rows.map(row => ({ expenseId: row.sourceId, sourceId: row.sourceId, amount: row.grossDistribution, creditAmount: "0" })),
      loanBorrowers: [], penaltyExceptions: [],
      coverdellAccounts: [{ accountId: "esa", priorYearBasis: "1500", currentYearContributions: "0", yearEndValue: "950", outstandingRollovers: "0", rolloverBasisReceived: "0" }],
    } },
  };
}
describe("Educator federal exclusion conservation", () => {
  it("routes fully excluded joint interest to the actual educator income owners", () => {
    const value = {
      ...base, taxpayer: { ...base.taxpayer, filingStatus: "married_filing_jointly", spouse: { firstName: "Sam", lastName: "Doe", ssn: "222-33-4444", dateOfBirth: "1980-01-01" } },
      w2s: base.w2s.map(row => ({ ...row, accountHolder: "primary" })),
      form1099Int: [{ payer: "Synthetic Treasury statement", interestIncome: "0", usSavingsBondInterest: "2000" }],
      savingsBondRedemptions: [{ sourceId: "joint-bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer_and_spouse", ageTestOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "500",
        incomeOwnership: { taxpayerPurchaseFunds: "6000", spousePurchaseFunds: "2000", taxpayerPriorYearInterestReported: "100", spousePriorYearInterestReported: "400", communityProperty: false, ownershipUnchangedSinceIssueConfirmed: true, sourceFactsConfirmed: true, sourceReference: "Actual original purchase and interest records" } }],
      form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "500", americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
        educationExpenses: [{ sourceId: "college", beneficiaryName: "Jane Doe", beneficiaryTaxId: simpleW2Fixture.taxpayer.primary.ssn, relationship: "taxpayer", institutionName: "Synthetic college", institutionAddress: "1 College Road", expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] },
      adjustments: { educatorExpenseSources: [educator("1550", { excludedSavingsBondInterest: "1400" }), educator("125", { accountHolder: "spouse", excludedSavingsBondInterest: "100" })] },
    };
    const result = calculate(value);
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1500");
    expect(result.scheduleB?.previouslyReportedSavingsBondInterest.toFixed()).toBe("500");
    expect(result.totalInterest.toFixed()).toBe("0");
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe("175");
    expect(result.agi.toFixed()).toBe("49825");
    expect(result.allLines.filter(line => line.form === "Educator education exclusions" && line.line.endsWith(":bond-exclusion")).map(line => line.value.toFixed())).toEqual(["1400", "100"]);
    value.savingsBondRedemptions[0].incomeOwnership.spousePurchaseFunds = "2001";
    expect(() => calculate(value)).toThrow(/purchase|principal/i);
  });
  it("reconciles cash and Coverdell earnings against the actual educator deduction", () => {
    const education = distributions();
    const source = educator("500", { nontaxableQualifiedTuitionProgramAmount: "200", nontaxableCoverdellEarnings: "142" });
    expect(() => calculate({ ...base, ...education, adjustments: { educatorExpenseSources: [educator()] } })).toThrow(/reconcile.*educator/i);
    const result = calculate({ ...base, ...education, adjustments: { educatorExpenseSources: [source] } });
    expect(result.schedule1?.educatorExpenses.toString()).toBe("158");
    expect(result.agi.toString()).toBe("49842");
    expect(result.form1099Q?.taxableEarnings.toString()).toBe("0");
    expect(result.allLines.filter(line => line.form === "Educator education exclusions").map(line => line.value.toString())).toEqual(["0", "200", "142"]);
    expect(() => calculate({ ...base, ...education, form1099Q: education.form1099Q.map(row => ({ ...row, distributionMedium: undefined })),
      adjustments: { educatorExpenseSources: [source] } })).toThrow(/cash|medium/i);
  });
  it("binds the final sole-owner bond exclusion and rejects an unsupported positive declaration", () => {
    const source = educator("2200", { excludedSavingsBondInterest: "2000" });
    const bonds = {
      form1099Int: [{ payer: "Synthetic Treasury statement", interestIncome: "0", usSavingsBondInterest: "2000" }],
      savingsBondRedemptions: [{ sourceId: "bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15",
        ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0" }],
      form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0",
        americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
        educationExpenses: [{ sourceId: "college", beneficiaryName: "Jane Doe", beneficiaryTaxId: simpleW2Fixture.taxpayer.primary.ssn, relationship: "taxpayer", institutionName: "Synthetic college", institutionAddress: "1 College Road",
          expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "10000", qualificationConfirmed: true, coordinationConfirmed: true,
          directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] },
    };
    expect(() => calculate({ ...base, adjustments: { educatorExpenseSources: [source] } })).toThrow(/reconcile.*educator/i);
    const result = calculate({ ...base, ...bonds, adjustments: { educatorExpenseSources: [source] } });
    expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("2000");
    expect(result.schedule1?.educatorExpenses.toString()).toBe("200");
    expect(result.agi.toString()).toBe("49800");
    expect(result.allLines.find(line => line.form === "Educator education exclusions" && line.line === "primary:bond-exclusion")?.value.toString()).toBe("2000");
    expect(() => calculate({ ...base, ...bonds, adjustments: { educatorExpenseSources: [educator("2200", { excludedSavingsBondInterest: "1999" })] } })).toThrow(/reconcile.*educator/i);
  });
});
