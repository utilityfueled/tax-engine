import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const zeroDualColumn = { columnA: "0", columnB: "0" };

describe("Illinois return attachment through calculateFederalTax", () => {
  it("calculateFederalTax attaches an Illinois resident return from TaxYearInput.stateReturns.illinois", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 1,
          hasChildUnder12: true,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [
              {
                relationship: "child",
                isUnder12: true,
                monthsInHome: 12,
              },
            ],
            federalEIC: "0",
          },
          ilWithholding: "2500",
          estimatedPayments: "200",
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "4000",
            propertyTaxProperties: [
              {
                county: "Sangamon",
                propertyNumber: "14-22-100-001",
              },
            ],
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "1000",
            volunteerEmergencyWorkerCount: 0,
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(2700);
    expect(result.stateReturns?.illinois?.overpayment.toNumber()).toBe(0);
    expect(result.stateReturns?.illinois?.taxDue.toNumber()).toBe(837);
    expect(result.stateReturns?.illinois?.scheduleICR?.propertyTaxProperties).toEqual([
      {
        county: "Sangamon",
        propertyNumber: "14-22-100-001",
      },
    ]);
  });

  it("calculateFederalTax carries the Illinois health insurance checkbox selections through the attached return", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Jamie",
          lastName: "Taxpayer",
          ssn: "987-65-4321",
          dateOfBirth: "1988-02-03",
        },
      },
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          spouseClaimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          healthInsuranceCheckbox: {
            selfUninsured: true,
            spouseUninsured: true,
            dependentsUninsured: false,
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.healthInsuranceCheckbox).toEqual({
      selfUninsured: true,
      spouseUninsured: true,
      dependentsUninsured: false,
      authorized: true,
    });
  });

  it("calculateFederalTax attaches an Illinois part-year return from TaxYearInput.stateReturns.illinois.scheduleNR", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          ilWithholding: "2200",
          scheduleNR: {
            taxYear: 2025,
            residencyType: "part_year",
            income: {
              wages: { columnA: "85000", columnB: "42500" },
              interest: zeroDualColumn,
              dividends: zeroDualColumn,
              taxableRefunds: zeroDualColumn,
              alimony: zeroDualColumn,
              businessIncome: zeroDualColumn,
              capitalGains: zeroDualColumn,
              otherGains: zeroDualColumn,
              iraDistributions: zeroDualColumn,
              pensions: zeroDualColumn,
              rentalAndPartnership: zeroDualColumn,
              farmIncome: zeroDualColumn,
              unemployment: zeroDualColumn,
              socialSecurity: zeroDualColumn,
              otherIncome: zeroDualColumn,
            },
            adjustments: {
              educatorExpenses: zeroDualColumn,
              certainBusinessExpenses: zeroDualColumn,
              hsaDeduction: zeroDualColumn,
              movingExpenses: zeroDualColumn,
              seTaxDeduction: zeroDualColumn,
              sepSimpleDeduction: zeroDualColumn,
              seHealthInsurance: zeroDualColumn,
              earlyWithdrawalPenalty: zeroDualColumn,
              alimonyPaid: zeroDualColumn,
              iraDeduction: zeroDualColumn,
              studentLoanInterest: zeroDualColumn,
              archerMSA: zeroDualColumn,
              otherAdjustments: zeroDualColumn,
            },
            additionsSubtractions: {
              taxExemptInterest: zeroDualColumn,
              otherAdditions: zeroDualColumn,
              retirementSubtraction: zeroDualColumn,
              ilRefundSubtraction: zeroDualColumn,
              otherSubtractions: zeroDualColumn,
            },
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.scheduleNR?.allocationDecimal.toNumber()).toBe(0.5);
    expect(result.stateReturns?.illinois?.scheduleNR?.ilBaseIncome.toNumber()).toBe(42500);
    expect(result.stateReturns?.illinois?.netIncome.toNumber()).toBe(41075);
    expect(result.stateReturns?.illinois?.incomeTax.toNumber()).toBe(2033);
    expect(result.stateReturns?.illinois?.overpayment.toNumber()).toBe(167);
  });

  it("calculateFederalTax leaves stateReturns undefined when no Illinois payload is supplied", () => {
    const result = calculateFederalTax(simpleW2Fixture);

    expect(result.stateReturns).toBeUndefined();
  });

  it("calculateFederalTax accepts volunteer emergency worker certificate support on the attached Illinois Schedule ICR", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "0",
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "0",
            volunteerEmergencyWorkerCount: 1,
            volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.scheduleICR?.volunteerCredit.toNumber()).toBe(500);
    expect(result.stateReturns?.illinois?.scheduleICRCredit.toNumber()).toBe(500);
  });

  it("calculateFederalTax attaches an Illinois Schedule ICR K-12 worksheet from the shared Illinois payload", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleICR: {
            taxYear: 2025,
            propertyTaxPaid: "0",
            propertyTaxBusinessDeduction: "0",
            k12EducationExpenses: "9999",
            k12EducationExpenseWorksheet: {
              taxYear: 2025,
              students: [
                {
                  studentName: "A Student",
                  studentSSN: "111-22-3333",
                  grade: "3",
                  schoolName: "Lincoln Elementary",
                  schoolCity: "Springfield",
                  schoolType: "public",
                  tuitionBookLabFees: "600",
                },
                {
                  studentName: "B Student",
                  studentSSN: "444-55-6666",
                  grade: "K",
                  schoolName: "home school",
                  schoolCity: "Naperville",
                  schoolType: "home_school",
                  tuitionBookLabFees: "650",
                },
              ],
            },
            volunteerEmergencyWorkerCount: 0,
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.scheduleICR?.k12EducationExpenseWorksheet?.totalQualifiedEducationExpenses.toNumber()).toBe(1250);
    expect(result.stateReturns?.illinois?.scheduleICR?.educationCredit.toNumber()).toBe(250);
    expect(result.stateReturns?.illinois?.scheduleICRCredit.toNumber()).toBe(250);
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from W-2 documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          state: "IL",
          stateWages: "85000",
          stateTaxWithheld: "1800",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(1800);
    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(1800);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(1800);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "W-2",
        payerId: "12-3456789",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisWithheld.toNumber()).toBe(1800);
  });

  it("calculateFederalTax keeps Illinois Line 25 withholding but skips auto-attached Schedule IL-WIT rows for joint W-2 documents without owner tags", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Casey",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1990-02-02",
        },
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          state: "IL",
          stateWages: "85000",
          stateTaxWithheld: "1800",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          spouseClaimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(1800);
    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(1800);
    expect(result.stateReturns?.illinois?.scheduleILWIT).toBeUndefined();
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from qualifying Illinois 1099-G documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      form1099G: [
        {
          payer: "Illinois Department of Employment Security",
          payerTin: "36-3042127",
          unemploymentCompensation: "2500",
          federalWithheld: "0",
          stateWithheld: "125",
          state: "IL",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(125);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(125);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "1099-G",
        payerId: "36-3042127",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.federalAmount.toNumber()).toBe(2500);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(2500);
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from qualifying Illinois 1099-R documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      form1099R: [
        {
          payer: "Prairie Pension Trust",
          payerTin: "36-5555555",
          grossDistribution: "5000",
          taxableAmount: "5000",
          stateDistribution: "5000",
          federalWithheld: "0",
          stateWithheld: "90",
          state: "IL",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(90);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(90);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "1099-R",
        payerId: "36-5555555",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.federalAmount.toNumber()).toBe(5000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(5000);
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from qualifying Illinois W-2G documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      formW2G: [
        {
          payer: "Casino Royale",
          payerTin: "36-7777777",
          reportableWinnings: "2000",
          stateWinnings: "2000",
          federalWithheld: "0",
          stateWithheld: "160",
          state: "IL",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(160);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(160);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "W-2G",
        payerId: "36-7777777",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.federalAmount.toNumber()).toBe(2000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(2000);
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from qualifying Illinois 1099-MISC, 1099-K, and 1099-NEC documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      form1099Misc: [
        {
          payer: "School District",
          payerTin: "36-4444444",
          rents: "500",
          royalties: "100",
          otherIncome: "400",
          stateIncome: "950",
          federalWithheld: "0",
          stateWithheld: "45",
          state: "IL",
        },
      ],
      form1099K: [
        {
          pse: "Marketplace Inc",
          statePayerNumber: "IL-778899",
          grossAmount: "4000",
          federalWithheld: "0",
          stateWithheld: "75",
          state: "IL",
          incomeType: "other",
        },
      ],
      form1099Nec: [
        {
          payer: "Freelance Client",
          payerTin: "36-5555555",
          nonemployeeCompensation: "1200",
          stateIncome: "1180",
          federalWithheld: "0",
          stateWithheld: "30",
          state: "IL",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(150);
    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(150);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(150);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "1099-MISC",
        payerId: "36-4444444",
      },
      {
        formType: "1099-K",
        payerId: "IL-778899",
      },
      {
        formType: "1099-NEC",
        payerId: "36-5555555",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.federalAmount.toNumber()).toBe(1000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(950);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[1]?.federalAmount.toNumber()).toBe(4000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[1]?.illinoisAmount.toNumber()).toBe(4000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[2]?.federalAmount.toNumber()).toBe(1200);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[2]?.illinoisAmount.toNumber()).toBe(1180);
  });

  it("calculateFederalTax auto-attaches Schedule IL-WIT from qualifying Illinois 1099-INT, 1099-DIV, and 1099-B documents when shared payload omits Illinois withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [
        {
          payer: "Prairie Bank",
          payerTin: "36-1111111",
          interestIncome: "400",
          federalWithheld: "0",
          stateWithheld: "20",
          state: "IL",
        },
      ],
      form1099Div: [
        {
          payer: "Midwest Mutual Fund",
          payerTin: "36-2222222",
          ordinaryDividends: "500",
          qualifiedDividends: "300",
          federalWithheld: "0",
          stateWithheld: "15",
          state: "IL",
        },
      ],
      form1099B: [
        {
          broker: "Great Lakes Brokerage",
          payerTin: "36-3333333",
          stateWithheld: "45",
          state: "IL",
          transactions: [
            {
              description: "ABC Corp",
              dateAcquired: "2020-01-01",
              dateSold: "2025-02-01",
              proceeds: "1200",
              costBasis: "900",
              holdingPeriod: "long",
            },
            {
              description: "XYZ Fund",
              dateAcquired: "2024-06-01",
              dateSold: "2025-03-01",
              proceeds: "800",
              costBasis: "850",
              holdingPeriod: "short",
            },
          ],
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [],
            federalEIC: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(80);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(80);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords).toMatchObject([
      {
        formType: "1099-INT",
        payerId: "36-1111111",
      },
      {
        formType: "1099-DIV",
        payerId: "36-2222222",
      },
      {
        formType: "1099-B",
        payerId: "36-3333333",
      },
    ]);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.federalAmount.toNumber()).toBe(400);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(400);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[1]?.federalAmount.toNumber()).toBe(500);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[1]?.illinoisAmount.toNumber()).toBe(300);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[2]?.federalAmount.toNumber()).toBe(2000);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.primaryRecords[2]?.illinoisAmount.toNumber()).toBe(2000);
  });

  it("calculateFederalTax derives Illinois Line 25 withholding from supported raw tax documents including 1099-INT, 1099-DIV, and 1099-B when shared payload omits it", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          state: "IL",
          stateWages: "85000",
          stateTaxWithheld: "1800",
        },
      ],
      form1099R: [
        {
          payer: "Prairie Pension Trust",
          payerTin: "36-5555555",
          grossDistribution: "5000",
          taxableAmount: "5000",
          stateDistribution: "5000",
          federalWithheld: "0",
          stateWithheld: "90",
          state: "IL",
        },
        {
          payer: "Out of State Pension",
          grossDistribution: "6000",
          taxableAmount: "6000",
          federalWithheld: "0",
          stateWithheld: "900",
          state: "IN",
        },
      ],
      form1099G: [
        {
          payer: "Illinois Department of Employment Security",
          payerTin: "36-3042127",
          unemploymentCompensation: "2500",
          federalWithheld: "0",
          stateWithheld: "125",
          state: "IL",
        },
      ],
      form1099K: [
        {
          pse: "Marketplace Inc",
          statePayerNumber: "IL-778899",
          grossAmount: "4000",
          federalWithheld: "0",
          stateWithheld: "75",
          state: "IL",
          incomeType: "other",
        },
      ],
      form1099Int: [
        {
          payer: "Prairie Bank",
          payerTin: "36-1111111",
          interestIncome: "400",
          federalWithheld: "0",
          stateWithheld: "20",
          state: "IL",
        },
      ],
      form1099Div: [
        {
          payer: "Midwest Mutual Fund",
          payerTin: "36-2222222",
          ordinaryDividends: "500",
          qualifiedDividends: "300",
          federalWithheld: "0",
          stateWithheld: "15",
          state: "IL",
        },
      ],
      form1099B: [
        {
          broker: "Great Lakes Brokerage",
          payerTin: "36-3333333",
          stateWithheld: "45",
          state: "IL",
          transactions: [
            {
              description: "ABC Corp",
              dateAcquired: "2020-01-01",
              dateSold: "2025-02-01",
              proceeds: "1200",
              costBasis: "900",
              holdingPeriod: "long",
            },
            {
              description: "XYZ Fund",
              dateAcquired: "2024-06-01",
              dateSold: "2025-03-01",
              proceeds: "800",
              costBasis: "850",
              holdingPeriod: "short",
            },
          ],
        },
      ],
      form1099Misc: [
        {
          payer: "School District",
          payerTin: "36-4444444",
          otherIncome: "900",
          federalWithheld: "0",
          stateWithheld: "45",
          stateIncome: "900",
          state: "IL",
        },
      ],
      form1099Nec: [
        {
          payer: "Freelance Client",
          payerTin: "36-6666666",
          nonemployeeCompensation: "1200",
          federalWithheld: "0",
          stateWithheld: "30",
          stateIncome: "1200",
          state: "IL",
        },
      ],
      formW2G: [
        {
          payer: "Casino Royale",
          payerTin: "36-7777777",
          reportableWinnings: "2000",
          stateWinnings: "2000",
          federalWithheld: "0",
          stateWithheld: "160",
          state: "IL",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(2405);
    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(2405);
    expect(result.stateReturns?.illinois?.scheduleILWIT?.totalWithholding.toNumber()).toBe(2405);
  });

  it("calculateFederalTax preserves a manual Illinois Line 25 amount instead of overriding it with derived document withholding", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          state: "IL",
          stateWages: "85000",
          stateTaxWithheld: "1800",
        },
      ],
      form1099G: [
        {
          payer: "Illinois Department of Employment Security",
          unemploymentCompensation: "2500",
          federalWithheld: "0",
          stateWithheld: "125",
          state: "IL",
        },
      ],
      form1099K: [
        {
          pse: "Marketplace Inc",
          grossAmount: "4000",
          federalWithheld: "0",
          stateWithheld: "75",
          state: "IL",
          incomeType: "other",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          ilWithholding: "2400",
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilWithholding.toNumber()).toBe(2400);
    expect(result.stateReturns?.illinois?.totalPayments.toNumber()).toBe(2400);
  });

  it("calculateFederalTax carries validated Illinois direct deposit details onto the attached return", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          ilWithholding: "5000",
          voluntaryCharitableDonations: "100",
          refundAmountRequested: "500",
          refundMethod: "direct_deposit",
          directDeposit: {
            routingNumber: "07-1000130",
            accountType: "checking",
            accountNumber: "1234-5678-9012",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.refund.toNumber()).toBe(500);
    expect(result.stateReturns?.illinois?.refundMethod).toBe("direct_deposit");
    expect(result.stateReturns?.illinois?.directDeposit).toEqual({
      routingNumber: "071000130",
      accountType: "checking",
      accountNumber: "123456789012",
      destination: "checking_or_savings",
    });
  });

  it("calculateFederalTax maps Illinois Schedule G donations onto attached IL-1040 Line 35", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          ilWithholding: "5000",
          voluntaryCharitableDonations: "100",
          scheduleG: {
            taxYear: 2025,
            wildlifePreservationFund: "25",
            alzheimersFund: "10",
            assistanceToHomelessFund: "0",
            diabetesResearchFund: "0",
            hungerReliefFund: "5",
            ronaldMcDonaldHouseCharitiesFund: "0",
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.scheduleG?.totalDonations.toNumber()).toBe(40);
    expect(result.stateReturns?.illinois?.voluntaryCharitableDonations.toNumber()).toBe(40);
    expect(
      result.stateReturns?.illinois?.preliminaryOverpayment
        .minus(result.stateReturns?.illinois?.overpayment ?? 0)
        .toNumber(),
    ).toBe(40);
  });

  it("calculateFederalTax derives Illinois Schedule M Line 22 from taxable federal savings bond interest when the shared Illinois payload omits Line 22", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      w2s: [],
      form1099Int: [
        {
          payer: "US Treasury",
          interestIncome: "3000",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "3000",
          taxExemptInterest: "0",
        },
      ],
      savingsBondRedemptions: [
        {
          proceeds: "15000",
          interest: "3000",
          qualifiedExpenses: "7500",
        },
      ],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.form8815?.excludableSavingsBondInterest.toNumber()).toBe(1500);
    expect(result.stateReturns?.illinois?.scheduleM?.lines.find((line) => line.line === "22")?.value.toNumber()).toBe(1500);
    expect(result.agi.toNumber()).toBe(1500);
    expect(result.stateReturns?.illinois?.baseIncome.toNumber()).toBe(0);
  });

  it("calculateFederalTax maps Illinois K-1 retirement payments into Schedule M Line 14 on the attached return", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          k1RetirementPaymentsSubtraction: "3200",
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.retirementIncomeSubtraction.toNumber()).toBe(0);
    expect(result.stateReturns?.illinois?.scheduleM?.lines.find((line) => line.line === "14")?.value.toNumber()).toBe(3200);
    expect(result.stateReturns?.illinois?.scheduleM?.totalSubtractions.toNumber()).toBe(3200);
  });

  it("calculateFederalTax preserves IL-2210 annualized child tax credit timing from the shared Illinois payload", () => {
    const input = TaxYearInputSchema.parse({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Alex",
          lastName: "Rivera",
          ssn: "123-45-6789",
          dateOfBirth: "1990-01-01",
        },
        address: {
          street: "1 Main St",
          city: "Chicago",
          state: "IL",
          zip: "60601",
        },
        dependents: [
          {
            firstName: "Casey",
            lastName: "Rivera",
            ssn: "111-22-3333",
            relationship: "Son",
            dateOfBirth: "2018-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
            qualifiesForEIC: true,
          },
        ],
      },
      w2s: [
        {
          employer: { name: "Employer", ein: "12-3456789" },
          wages: "20000",
          federalWithheld: "500",
          socialSecurityWages: "20000",
          socialSecurityWithheld: "1240",
          medicareWages: "20000",
          medicareWithheld: "290",
          stateTaxWithheld: "1000",
          stateWages: "20000",
          localTaxWithheld: "0",
          state: "IL",
        },
      ],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1099G: [],
      formW2G: [],
      form1099K: [],
      form1099C: [],
      form1099Q: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 1,
          hasChildUnder12: true,
          scheduleEEIC: {
            taxYear: 2025,
            dependents: [
              {
                relationship: "child",
                isUnder12: true,
                monthsInHome: 12,
              },
            ],
            federalEIC: "4325",
          },
          il2210: {
            priorYearTax: "1000",
            priorYearReturnFiled: true,
            estimatedPaymentsByQuarter: ["0", "0", "0", "0"],
            annualizedInstallmentMethod: {
              periods: [
                {
                  baseIncome: "20000",
                  exemptions: "3850",
                  surcharges: "0",
                  credits: "50",
                  ilChildTaxCredit: "40",
                },
                {
                  baseIncome: "20000",
                  exemptions: "3850",
                  surcharges: "0",
                  credits: "50",
                  ilChildTaxCredit: "40",
                },
                {
                  baseIncome: "20000",
                  exemptions: "3850",
                  surcharges: "0",
                  credits: "50",
                  ilChildTaxCredit: "40",
                },
                {
                  baseIncome: "20000",
                  exemptions: "3850",
                  surcharges: "0",
                  credits: "50",
                  ilChildTaxCredit: "40",
                },
              ],
            },
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.ilChildTaxCredit.toNumber()).toBe(346);
    expect(result.stateReturns?.illinois?.il2210?.annualizedWorksheet?.columns.map((column) => column.credits.toNumber())).toEqual([
      50,
      50,
      90,
      90,
    ]);
  });

  it("calculateFederalTax normalizes an attached Illinois Schedule 1299-C into IL-1040 Line 17", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      stateReturns: {
        illinois: {
          claimedAsDependent: false,
          age65OrOlderCount: 0,
          blindCount: 0,
          dependentCount: 0,
          hasChildUnder12: false,
          schedule1299CCredit: "999",
          schedule1299C: {
            taxYear: 2025,
            credits: [
              {
                yearsLeftToCarry: 0,
                carryforwardPeriodYears: 0,
                creditCode: "2200",
                creditYearEnding: "2025-12",
                creditEarnedOrCarried: "200",
              },
            ],
          },
        },
      },
    });

    const result = calculateFederalTax(input);

    expect(result.stateReturns?.illinois?.schedule1299CCredit.toNumber()).toBe(200);
    expect(result.stateReturns?.illinois?.schedule1299C?.credit.toNumber()).toBe(200);
  });
});
