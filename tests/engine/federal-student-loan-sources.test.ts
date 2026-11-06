// Spec: spec/federal/student-loan-interest-return.yaml.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const loan = (patch: Record<string, unknown> = {}) => ({
  sourceId: "loan1", borrowerId: "borrower1", accountHolder: "primary", lender: "Synthetic lender", sourceKind: "lender_statement",
  loanOriginationDate: "2010-08-01", interestPaid: "1200.15", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
  legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
  enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self",
  expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
  employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0",
  qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [], ...patch,
});
const facts = (year = 2025, patch: Record<string, unknown> = {}) => ({
  sourceTaxYear: year, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
  puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans: [loan()], ...patch,
});
const raw = (year = 2025) => ({ ...simpleW2Fixture,
  taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725" }],
  studentLoanInterestFacts: facts(year),
});
const calculate = (input: unknown) => calculateFederalTax(TaxYearInputSchema.parse(input));
const deduction = (input: unknown) => calculate(input).schedule1?.studentLoanInterest.toString();

describe("Canonical actual student loan return worksheet", () => {
  it("routes actual loan sources once and preserves eligibility and unknown distinctions", () => {
    const result = calculate(raw());
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("1200");
    expect(result.adjustmentsToIncome.toString()).toBe("1200");
    expect(result.agi.toString()).toBe("48800");
    expect(deduction(raw(2026))).toBe("1200");
    expect(deduction({ ...raw(), studentLoanInterestFacts: facts(2025, { primaryClaimedAsDependent: true }) })).toBe("0");
    expect(() => calculate({ ...raw(2026), studentLoanInterestFacts: undefined, adjustments: { studentLoanInterest: "1200" } })).toThrow(/student.loan.*source|source.*student.loan/i);
    expect(() => calculate({ ...raw(), studentLoanInterestFacts: facts(2025, { sourceFactsConfirmed: false }) })).toThrow(/confirm/i);
  });
  it("uses all return income and actual possession addbacks for the phaseout", () => {
    const input = raw();
    const result = calculate({ ...input, w2s: [{ ...input.w2s[0], wages: "85000" }],
      form1099Int: [{ payer: "Treasury custodian", interestIncome: "0", usSavingsBondInterest: "8000" }],
      studentLoanInterestFacts: facts(2025, { loans: [loan({ interestPaid: "2500" })], puertoRicoIncomeExclusion: "1000" }),
    });
    // 85,000 wages + 8,000 Treasury + 1,000 actual possession exclusion = 94,000 MAGI.
    // 2,500 x (1 - 9,000/15,000) = 1,000 deduction; AGI excludes the possession addback.
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("1000");
    expect(result.agi.toString()).toBe("92000");
    expect(result.allLines.find(line => line.form === "Student Loan MAGI Worksheet" && line.line === "magi")?.value.toString()).toBe("94000");
  });
  it("uses the final allowed passive loss rather than the unallowed rental loss", () => {
    const input = raw();
    const result = calculate({ ...input, w2s: [{ ...input.w2s[0], wages: "120000", federalWithheld: "25000" }],
      studentLoanInterestFacts: facts(2025, { loans: [loan({ interestPaid: "2500" })] }),
      rentalProperties: [{ description: "Synthetic ordinary rental", propertyType: "single_family", rentalDays: 365, personalUseDays: 0, rents: "10000", repairs: "40000", isActiveParticipant: true }],
    });
    expect(result.agi.toString()).toBe("105000");
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("0");
    expect(result.schedule1?.supplementalIncome.toString()).toBe("-15000");
  });
  it("includes taxable benefits before the phaseout and retains the completed excluded deduction", () => {
    const input = raw();
    const result = calculate({ ...input, w2s: [{ ...input.w2s[0], wages: "80000" }],
      formSSA1099: [{ recipient: "Synthetic taxpayer", netBenefits: "10000", federalWithheld: "0" }],
      studentLoanInterestFacts: facts(2025, { loans: [loan({ interestPaid: "2500" })] }),
    });
    // 8,500 taxable benefits are included before 2,500 x (1 - 3,500/15,000), rounded to 1,917.
    expect(result.socialSecurityBenefitsTaxable.toString()).toBe("8500");
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("1917");
    expect(result.agi.toString()).toBe("86583");
    const excludedSource = result.socialSecurityBenefitsWorksheet?.lines.find(line =>
      line.inputs?.["Excluded Schedule 1 student loan interest"] !== undefined);
    expect(excludedSource?.inputs?.["Excluded Schedule 1 student loan interest"].toString()).toBe("1917");
    expect(result.allLines.filter(line => line.form === "1040" && line.line === "10")).toHaveLength(1);
  });
  it("uses the allowed savings-bond exclusion before the loan deduction", () => {
    const input = raw();
    input.taxpayer.primary = { ...input.taxpayer.primary, dateOfBirth: "1980-01-01" };
    const result = calculate({ ...input, w2s: [{ ...input.w2s[0], wages: "97000", federalWithheld: "25000" }],
      studentLoanInterestFacts: facts(2025, { loans: [loan({ interestPaid: "2500" })] }),
      form1099Int: [{ payer: "Treasury", interestIncome: "0", usSavingsBondInterest: "4000" }],
      savingsBondRedemptions: [{ sourceId: "bond1", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2025-06-15",
        ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true, faceValue: "12000", priorYearInterestReported: "0" }],
      form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
        priorYearInterestIncludedInCurrentStatements: "0", americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
        educationExpenses: [{ sourceId: "college1", beneficiaryName: "Jane Doe", beneficiaryTaxId: simpleW2Fixture.taxpayer.primary.ssn, relationship: "taxpayer", institutionName: "Synthetic College",
          institutionAddress: "1 College Rd, Example, NY10001", expenseType: "tuition_and_required_fees", paidTaxYear: 2025, amountPaid: "10000",
          qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }],
      },
    });
    expect(result.form8815?.modifiedAGI.toString()).toBe("101000");
    expect(result.form8815?.excludableSavingsBondInterest.toString()).toBe("3600");
    expect(result.allLines.find(line => line.form === "Student Loan MAGI Worksheet" && line.line === "magi")?.value.toString()).toBe("97400");
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("433");
    expect(result.agi.toString()).toBe("96967");
  });
  it("preserves basis-funded interest while coordinating actual529 excluded earnings", () => {
    const result = calculate({ ...raw(), studentLoanInterestFacts: facts(2025, { loans: [loan({ interestPaid: "1000", qtpTaxFreeEarningsUsedForInterest: "200", educationExpenseIds: ["expense1"] })] }),
      form1099Q: [{ sourceId: "q1", accountId: "account1", beneficiaryId: "student1", recipientOwner: "primary", taxYear: 2025,
        payerName: "Synthetic plan", accountType: "529", grossDistribution: "10000", earnings: "2000", basis: "8000",
        isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" } }],
      qualifiedEducationExpenses: { sourceFacts: { taxYear: 2025, sourceFactsConfirmed: true, allDistributionsReconciled: true,
        beneficiaries: [{ id: "student1", outsideK12QualifiedDistributions: "0" }],
        expenses: [{ id: "expense1", beneficiaryId: "student1", category: "student_loan", paidDate: "2025-08-15", amount: "10000",
          refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true,
          borrowerId: "borrower1", beneficiaryOrSibling: true, studentLoanInterestAmount: "1000", studentLoanInterestDeducted: "800" }],
        allocations: [{ expenseId: "expense1", sourceId: "q1", amount: "10000", creditAmount: "0", loanInterestAmount: "1000" }],
        loanBorrowers: [{ id: "borrower1", owner: "primary", priorQualifiedDistributions: "0", otherCurrentQualifiedDistributions: "0" }],
        coverdellAccounts: [], penaltyExceptions: [],
      } },
    });
    expect(result.form1099Q?.taxableEarnings.toString()).toBe("0");
    expect(result.form1099Q?.loanInterestSourceAdjustments[0]?.taxFreeEarningsUsedForInterest.toString()).toBe("200");
    expect(result.schedule1?.studentLoanInterest.toString()).toBe("800");
    expect(result.agi.toString()).toBe("49200");
  });
  it("refuses a material actual loan and NOL claim without coupled source computation", () => {
    expect(() => calculate({ ...raw(), priorYear: { nolCarryforward: "10000" } })).toThrow(/loan.*NOL|NOL.*loan/i);
  });
});
