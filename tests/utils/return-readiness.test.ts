import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePANonresidentReturn } from "@/engine/state/pa-nonresident-orchestrator.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { assessReturnReadiness } from "@/utils/return-readiness.js";
import { actualDigitalAssetSource } from "../fixtures/digital-asset-sources.js";

function makeInput() {
  return TaxYearInputSchema.parse({
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Jordan",
        lastName: "Northwind",
        ssn: "111-22-3333",
        dateOfBirth: "1990-01-01",
      },
      address: {
        street: "123 Main St",
        city: "Columbus",
        state: "OH",
        zip: "43215",
      },
      dependents: [],
    },
    w2s: [
      {
        employer: {
          name: "Northwind Labs",
          ein: "12-3456789",
        },
        wages: "75000",
        federalWithheld: "8200",
        socialSecurityWages: "75000",
        socialSecurityWithheld: "4650",
        medicareWages: "75000",
        medicareWithheld: "1088",
        state: "OH",
        stateWages: "75000",
        stateTaxWithheld: "3750",
      },
    ],
    form1099Nec: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099R: [],
    form1099G: [],
    formW2G: [],
    form1099K: [],
    form1099Misc: [],
  });
}

describe("assessReturnReadiness", () => {
  // Spec: spec/federal/form-8949-digital-reporting.yaml packet-completeness.
  it("marks original digital disposition packets partial when Form8949 detail is missing", () => {
    for (const costBasis of ["90.24", "100.49"]) {
      const original = structuredClone(actualDigitalAssetSource);
      original.transactions[0].costBasis = costBasis;
      const taxInput = TaxYearInputSchema.parse({ ...makeInput(), form1099DA: [original] });
      const federalResult = calculateFederalTax(taxInput);
      expect(taxInput.form1099B).toHaveLength(0);
      const missing = assessReturnReadiness({ taxInput, federalResult, includedForms: ["f1040-filled.pdf", "f1040sd-filled.pdf"] });
      expect(missing.packetCompleteness).toBe("partial");
      expect(missing.lineCompleteness).toBe("partial");
      expect(missing.findings).toContain("Capital transaction detail exists, but Form 8949 detail pages are not present in the packet.");
      expect(missing.filingQualified).toBe(false);
      const complete = assessReturnReadiness({ taxInput, federalResult, includedForms: ["f1040-filled.pdf", "f1040sd-filled.pdf", "f8949-filled.pdf"] });
      expect(complete.findings).not.toContain("Capital transaction detail exists, but Form 8949 detail pages are not present in the packet.");
      expect(complete.filingQualified).toBe(false);
      expect(complete.businessRuleValidation).toBe("not-validated");
    }
  });

  it("marks Ohio packets partial when only reference-summary forms are present", () => {
    const taxInput = makeInput();
    const result = calculateFederalTax(taxInput);

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "oh-it-1040-reference.pdf"],
      stateCode: "OH",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.businessRuleValidation).toBe("not-validated");
    expect(assessment.findings).toContain(
      "Ohio packet output is currently generated as reference-summary pages, not official filled Ohio PDFs.",
    );
  });

  it("marks Form 3800 reference-summary packets partial", () => {
    const taxInput = TaxYearInputSchema.parse({
      ...makeInput(),
      form3800: {
        currentYearCredits: "2500",
        passiveActivityCredits: "0",
        carryforward: "0",
      },
    });
    const result = calculateFederalTax(taxInput);

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "f3800-reference-filled.pdf"],
    });

    expect(result.form3800?.totalCredit.gt(0)).toBe(true);
    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.businessRuleValidation).toBe("not-validated");
    expect(assessment.findings).toContain(
      "Form 3800 is included as a reference summary, not an official filed Form 3800.",
    );
  });

  it("marks partner basis schedule reference-summary packets partial", () => {
    const taxInput = TaxYearInputSchema.parse({
      ...makeInput(),
      scheduleK1: [
        {
          partnershipName: "Alpha LP",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "-18000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "5000",
          section179Deduction: "0",
          otherDeductions: "0",
          taxExemptInterest: "1000",
          otherTaxExemptIncome: "0",
          nondeductibleExpenses: "500",
          distributions: "3000",
          beginningBasis: "10000",
        },
      ],
    });
    const result = calculateFederalTax(taxInput);

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "partner-basis-schedule-reference-filled.pdf"],
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.businessRuleValidation).toBe("not-validated");
    expect(assessment.findings).toContain(
      "Partner/shareholder basis schedules are included as a reference summary, not an official filed basis attachment or Form 7203 copy.",
    );
  });

  it("flags missing Ohio packet artifacts as unsupported", () => {
    const taxInput = makeInput();
    const result = calculateFederalTax(taxInput);

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf"],
      stateCode: "OH",
    });

    expect(assessment.packetCompleteness).toBe("unsupported");
    expect(assessment.findings).toContain(
      "Ohio was selected, but no Ohio packet artifacts were generated.",
    );
  });

  it("marks Pennsylvania packets partial when only a PA local EIT reference summary is available", () => {
    const taxInput = TaxYearInputSchema.parse({
      ...makeInput(),
      taxpayer: {
        ...makeInput().taxpayer,
        address: {
          ...makeInput().taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...makeInput().w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
          localWages: "75000",
          localTaxWithheld: "500",
        },
      ],
      paResidentReturn: {
        localMunicipality: "Pittsburgh",
        localEITRate: "0.01",
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-local-eit-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania local EIT is included as a reference summary, not an official local earned income tax return.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule A reference summary is attached", () => {
    const taxInput = TaxYearInputSchema.parse({
      ...makeInput(),
      taxpayer: {
        ...makeInput().taxpayer,
        address: {
          ...makeInput().taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...makeInput().w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      form1099Int: [
        {
          payer: "Keystone Bank",
          interestIncome: "3000",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "0",
          taxExemptInterest: "0",
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-a-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule A is included as a reference summary, not an official PA-40 Schedule A filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule B reference summary is attached", () => {
    const taxInput = TaxYearInputSchema.parse({
      ...makeInput(),
      taxpayer: {
        ...makeInput().taxpayer,
        address: {
          ...makeInput().taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...makeInput().w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      form1099Div: [
        {
          payer: "Keystone Brokerage",
          ordinaryDividends: "2000",
          qualifiedDividends: "0",
          totalCapitalGainDistributions: "500",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          section199ADividends: "0",
          foreignTaxPaid: "0",
          exemptInterestDividends: "0",
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-b-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule B is included as a reference summary, not an official PA-40 Schedule B filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule SP reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          wages: "6000",
          federalWithheld: "450",
          socialSecurityWages: "6000",
          socialSecurityWithheld: "372",
          medicareWages: "6000",
          medicareWithheld: "87",
          state: "PA",
          stateWages: "6000",
          stateTaxWithheld: "184",
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-sp-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule SP is included as a reference summary, not an official PA Schedule SP filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule C reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      form1099Nec: [
        {
          payer: "Northwind Design Studio",
          nonemployeeCompensation: "18000",
          federalWithheld: "0",
        },
      ],
      scheduleC: {
        businessName: "Northwind Design Studio",
        grossReceipts: "18000",
        expenses: {
          advertising: "250",
          officeExpense: "600",
          supplies: "500",
          travel: "300",
          meals: "200",
          utilities: "150",
          otherExpenses: "800",
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-c-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule C is included as a reference summary, not an official PA-40 Schedule C filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule E reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      rentalProperties: [
        {
          description: "123 Walnut St",
          propertyType: "single_family",
          rents: "18000",
          advertising: "250",
          cleaning: "300",
          insurance: "1200",
          legalProfessional: "450",
          managementFees: "1500",
          mortgageInterest: "3200",
          repairs: "900",
          supplies: "175",
          taxes: "2100",
          utilities: "600",
          depreciation: "2500",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-e-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule E is included as a reference summary, not an official PA Schedule E filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule F reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      scheduleF: {
        principalCropOrActivity: "Corn and soybeans",
        accountingMethod: "cash",
        salesOfProductsRaised: "40000",
        cooperativeDistributions: "3000",
        expenses: {
          feed: "12000",
          fertilizersAndLime: "4000",
          utilities: "1800",
          otherExpenses: "700",
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-f-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule F is included as a reference summary, not an official PA-40 Schedule F filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule D reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      form1099B: [
        {
          broker: "Keystone Brokerage",
          transactions: [
            {
              description: "PA Utility Fund",
              dateAcquired: "2020-02-01",
              dateSold: "2025-08-15",
              proceeds: "8000",
              costBasis: "5000",
              holdingPeriod: "long",
            },
          ],
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-d-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule D is included as a reference summary, not an official PA Schedule D filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule UE reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      paResidentReturn: {
        scheduleUE: {
          vehicle: {
            method: "standard",
            totalMiles: 12000,
            businessMiles: 4000,
            parkingAndTolls: "200",
          },
          otherExpenses: {
            unionDues: "300",
          },
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-ue-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule UE is included as a reference summary, not an official PA Schedule UE filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule J reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      paScheduleJStatements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          incomeAmount: "1500",
        },
        {
          estateOrTrustName: "Beta Nonresident Estate",
          federalEIN: "22-2222222",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "500",
          nonresidentTaxWithheld: "125",
        },
      ],
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-j-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule J is included as a reference summary, not an official PA Schedule J filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule NRH reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "NJ",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "NJ",
          stateWages: "75000",
          stateTaxWithheld: "3750",
        },
      ],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        scheduleNRH: {
          compensation: {
            method: "working_days",
            grossCompensation: "75000",
            totalDaysForEmployer: 260,
            nonworkingDays: 10,
            daysWorkedInPennsylvania: 90,
            unreimbursedEmployeeBusinessExpenses: "1000",
          },
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePANonresidentReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-nrh-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule NRH is included as a reference summary, not an official PA Schedule NRH filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule DC reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
        dependents: [
          {
            firstName: "Sofia",
            lastName: "Northwind",
            ssn: "333-44-5555",
            dateOfBirth: "2020-07-01",
            relationship: "daughter",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
          },
        ],
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      dependentCare: {
        expenses: "5000",
        qualifyingIndividuals: 1,
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-dc-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule DC is included as a reference summary, not an official PA Schedule DC filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule G-L reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          wages: "100000",
          federalWithheld: "12000",
          socialSecurityWages: "100000",
          socialSecurityWithheld: "6200",
          medicareWages: "100000",
          medicareWithheld: "1450",
          state: "PA",
          stateWages: "100000",
          stateTaxWithheld: "3070",
        },
      ],
      paResidentReturn: {
        otherStateCredits: [
          {
            stateCode: "NJ",
            incomeTaxableByBothStates: "50000",
            taxPaidToOtherState: "2000",
          },
        ],
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-g-l-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule G-L is included as a reference summary, not an official PA Schedule G-L filing copy or the required copy of the other state's return.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule O reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      paResidentReturn: {
        scheduleO: {
          qualifiedTuitionContributions: [
            {
              beneficiaryName: "Taylor Northwind",
              beneficiarySSN: "111-22-3333",
              taxpayerContribution: "3000",
            },
          ],
          healthSavingsAccountDeduction: "1200",
          taxpayerPATaxableIncome: "75000",
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-o-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule O is included as a reference summary, not an official PA Schedule O filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule T reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          state: "PA",
          stateWages: "75000",
          stateTaxWithheld: "2303",
        },
      ],
      formW2G: [
        {
          payer: "PA Lottery",
          reportableWinnings: "1000",
          typeOfWager: "lottery",
          prizeType: "cash",
          state: "PA",
          stateWithheld: "31",
        },
      ],
      paResidentReturn: {
        scheduleT: {
          additionalEntries: [
            {
              description: "Poker tournament",
              winnings: "300",
              wageringCosts: "50",
            },
          ],
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-t-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule T is included as a reference summary, not an official PA Schedule T filing copy.",
    );
  });

  it("marks Pennsylvania packets partial when a PA Schedule SD reference summary is attached", () => {
    const baseInput = makeInput();
    const taxInput = TaxYearInputSchema.parse({
      ...baseInput,
      taxpayer: {
        ...baseInput.taxpayer,
        address: {
          ...baseInput.taxpayer.address,
          state: "PA",
        },
      },
      w2s: [
        {
          ...baseInput.w2s[0],
          wages: "50000",
          federalWithheld: "6500",
          state: "PA",
          stateWages: "50000",
          stateTaxWithheld: "1535",
        },
      ],
      scheduleC: {
        businessName: "Northwind Studio",
        grossReceipts: "10000",
      },
      paResidentReturn: {
        unreimbursedExpenses: "2000",
        otherDeductions: "3000",
        scheduleSD: {
          method: "EI",
          schoolDistrictRate: "0.01",
          schoolDistrictWithholding: "500",
          estimatedPayments: "25",
        },
      },
    });
    const federalResult = calculateFederalTax(taxInput);
    const result = {
      ...federalResult,
      stateReturns: {
        ...(federalResult.stateReturns ?? {}),
        pennsylvania: calculatePAReturn(taxInput),
      },
    };

    const assessment = assessReturnReadiness({
      taxInput,
      federalResult: result,
      includedForms: ["f1040-filled.pdf", "pa-40-filled.pdf", "pa-schedule-sd-reference.pdf"],
      stateCode: "PA",
    });

    expect(assessment.packetCompleteness).toBe("partial");
    expect(assessment.findings).toContain(
      "Pennsylvania Schedule SD is included as a reference summary, not an official PA-40 SD filing copy.",
    );
  });
});
