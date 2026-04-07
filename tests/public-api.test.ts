import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePA40,
  calculatePALocalEIT,
  calculatePANonresidentReturn,
  calculatePhiladelphiaWageTax,
  calculatePAScheduleA,
  calculatePAScheduleB,
  calculatePAScheduleC,
  calculatePAScheduleD,
  calculatePAScheduleE,
  calculatePAScheduleF,
  calculatePAReturn,
  calculatePAScheduleNRH,
  calculatePAScheduleO,
  calculatePAScheduleRK1,
  calculatePAScheduleT,
  calculatePAUseTax,
  calculatePAWorkingPennsylvaniansTaxCredit,
  calculateREV1630,
  calculateScheduleDC,
  calculateScheduleGL,
  calculateScheduleJ,
  calculateScheduleOC,
  calculateScheduleSD,
  calculateScheduleSP,
  calculateScheduleUE,
  type PA40Input,
  type PA40Result,
  type PALocalEITInput,
  type PALocalEITResult,
  type PhiladelphiaWageTaxInput,
  type PhiladelphiaWageTaxResult,
  type PAPassThroughStatement,
  type PANonresidentReturn,
  type PAScheduleAInput,
  type PAScheduleAResult,
  type PAScheduleBInput,
  type PAScheduleBResult,
  type PAScheduleCInput,
  type PAScheduleCResult,
  type PAScheduleDInput,
  type PAScheduleDResult,
  type PAScheduleFInput,
  type PAScheduleFResult,
  type PAScheduleGLStatement,
  type PAScheduleJStatement,
  type PAScheduleNRHInput,
  type PAScheduleNRHResult,
  type PAScheduleOInput,
  type PAScheduleOResult,
  type PAResidentReturn,
  type PAScheduleRK1Input,
  type PAScheduleRK1Result,
  TaxYearInputSchema,
  type PAScheduleTInput,
  type PAScheduleTResult,
  type PAUseTaxInput,
  type PAUseTaxResult,
  type PAWorkingPennsylvaniansTaxCreditInput,
  type PAWorkingPennsylvaniansTaxCreditResult,
  type PAScheduleEInput,
  type PAScheduleEResult,
  type PAOrchestratorOverrides,
  type PAOrchestratorResult,
  type PANonresidentOrchestratorOverrides,
  type PANonresidentOrchestratorResult,
  type REV1630Input,
  type REV1630Result,
  type ScheduleDCInput,
  type ScheduleDCResult,
  type ScheduleGLInput,
  type ScheduleGLResult,
  type ScheduleJInput,
  type ScheduleJResult,
  type ScheduleOCInput,
  type ScheduleOCResult,
  type ScheduleSDInput,
  type ScheduleSDResult,
  type ScheduleSPInput,
  type ScheduleSPResult,
  type ScheduleUEInput,
  type ScheduleUEResult,
  type TaxYearInput,
} from "@/index.js";

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Test",
        lastName: "Filer",
        ssn: "000-00-0001",
        dateOfBirth: "1985-01-01",
      },
      address: {
        street: "100 Main St",
        city: "Philadelphia",
        state: "PA",
        zip: "19101",
      },
      dependents: [],
    },
    w2s: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    form1099G: [],
    formW2G: [],
    form1099K: [],
    form1099C: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    rentalProperties: [],
    savingsBondRedemptions: [],
    form6252: [],
    form8814: [],
    homeSales: [],
    ...overrides,
  };
}

describe("Public API", () => {
  it("exports the TaxYearInput schema with PA resident and nonresident return supplements", () => {
    const paResidentReturn: PAResidentReturn = {
      estimatedPayments: "100",
      nonresidentTaxWithheld: "25",
      isClaimedAsDependentOnAnotherFederalReturn: true,
      spouseIsClaimedAsDependentOnAnotherFederalReturn: false,
      claimingHouseholdQualifiesForTaxForgiveness: true,
      scheduleSPSeparatedStatusApplies: true,
      localMunicipality: "Lower Merion Township",
      localEITRate: "0.01",
      quarterlyEstimatedPayments: ["25", "25", "25", "25"],
      scheduleT: {
        additionalEntries: [
          {
            description: "PA Lottery car giveaway",
            winnings: "18000",
            isLottery: true,
            lotteryState: "PA",
            prizeType: "noncash",
          },
        ],
      },
      scheduleA: {
        additionAdjustments: [
          { description: "Nominee interest", amount: "10" },
        ],
        paObligationInterest: "15",
        reductionAdjustments: [
          { description: "Federal K-1 U.S. obligations", amount: "5" },
        ],
        charitableGiftAnnuityIncome: "12",
      },
      scheduleB: {
        paExemptInterestDividends: "30",
        reductionAdjustments: [
          { description: "Part-year nonresident period", amount: "4" },
        ],
      },
      scheduleOC: {
        otherCredits: [
          { creditType: "reap", amount: "50", description: "REAP credit" },
        ],
      },
      useTaxWorksheet: {
        locality: "remainder_of_pa",
        taxableItemPurchases: "250",
        taxableServicePurchases: "100",
        electEstimatedTable: true,
        salesTaxAlreadyPaid: "5",
      },
      otherStateCredits: [
        {
          stateCode: "NJ",
          incomeTaxableByBothStates: "10000",
          taxPaidToOtherState: "500",
        },
      ],
      scheduleO: {
        qualifiedTuitionContributions: [
          {
            beneficiaryName: "Alex Student",
            beneficiarySSN: "111-11-1111",
            taxpayerContribution: "1000",
          },
        ],
        studentLoanInterestDeduction: "2500",
      },
    };
    const paNonresidentReturn: PANonresidentReturn = {
      residencyStatus: "part_year",
      paTaxableCompensation: "4500",
      additionalEligibilityIncome: "2000",
      spouseIsClaimedAsDependentOnAnotherFederalReturn: false,
      useTaxWorksheet: {
        locality: "philadelphia",
        taxableItemPurchases: "120",
        taxableServicePurchases: "30",
        electEstimatedTable: true,
        salesTaxAlreadyPaid: "4",
      },
      scheduleNRH: {
        compensation: {
          method: "working_days",
          grossCompensation: "10000",
          totalDaysForEmployer: 365,
          nonworkingDays: 115,
          daysWorkedInPennsylvania: 25,
        },
      },
    };
    const paScheduleGLStatements: PAScheduleGLStatement[] = [
      {
        stateCode: "NJ",
        incomeTaxableByBothStates: "10000",
        taxPaidToOtherState: "500",
      },
    ];
    const paScheduleJStatements: PAScheduleJStatement[] = [
      {
        estateOrTrustName: "Family Trust",
        federalEIN: "12-3456789",
        sourceDocument: "pa_nrk_1",
        incomeAmount: "250",
        nonresidentTaxWithheld: "25",
      },
    ];
    const paPassThroughStatements: PAPassThroughStatement[] = [
      {
        entityName: "Alpha Partners LP",
        entityEIN: "12-3456789",
        sourceDocument: "pa_rk_1",
        businessIncome: "5000",
        interestIncome: "50",
        netRentalIncome: "200",
      },
    ];

    const parsed = TaxYearInputSchema.parse(makeInput({
      w2s: [{
        employer: { name: "US Army", ein: "12-3456789" },
        wages: "52000",
        federalWithheld: "4000",
        stateTaxWithheld: "600",
        stateWages: "52000",
        state: "PA",
        militaryService: {
          activeDuty: true,
          dutyState: "AE",
        },
      }],
      paResidentReturn,
      paNonresidentReturn,
      paScheduleGLStatements,
      paScheduleJStatements,
      paPassThroughStatements,
    }));

    expect(parsed.w2s[0]?.militaryService?.activeDuty).toBe(true);
    expect(parsed.w2s[0]?.militaryService?.dutyState).toBe("AE");
    expect(parsed.paResidentReturn?.estimatedPayments).toBe("100");
    expect(parsed.paResidentReturn?.nonresidentTaxWithheld).toBe("25");
    expect(parsed.paResidentReturn?.isClaimedAsDependentOnAnotherFederalReturn).toBe(true);
    expect(parsed.paResidentReturn?.spouseIsClaimedAsDependentOnAnotherFederalReturn).toBe(false);
    expect(parsed.paResidentReturn?.claimingHouseholdQualifiesForTaxForgiveness).toBe(true);
    expect(parsed.paResidentReturn?.scheduleSPSeparatedStatusApplies).toBe(true);
    expect(parsed.paResidentReturn?.localMunicipality).toBe("Lower Merion Township");
    expect(parsed.paResidentReturn?.quarterlyEstimatedPayments?.[2]).toBe("25");
    expect(parsed.paResidentReturn?.scheduleT?.additionalEntries?.[0]?.prizeType).toBe("noncash");
    expect(parsed.paResidentReturn?.scheduleA?.paObligationInterest).toBe("15");
    expect(parsed.paResidentReturn?.scheduleA?.reductionAdjustments?.[0]?.amount).toBe("5");
    expect(parsed.paResidentReturn?.scheduleB?.paExemptInterestDividends).toBe("30");
    expect(parsed.paResidentReturn?.scheduleB?.reductionAdjustments?.[0]?.amount).toBe("4");
    expect(parsed.paResidentReturn?.scheduleOC?.otherCredits?.[0]?.creditType).toBe("reap");
    expect(parsed.paResidentReturn?.useTaxWorksheet?.locality).toBe("remainder_of_pa");
    expect(parsed.paResidentReturn?.useTaxWorksheet?.taxableServicePurchases).toBe("100");
    expect(parsed.paResidentReturn?.otherStateCredits?.[0]?.stateCode).toBe("NJ");
    expect(parsed.paResidentReturn?.scheduleO?.qualifiedTuitionContributions?.[0]?.taxpayerContribution).toBe("1000");
    expect(parsed.paNonresidentReturn?.residencyStatus).toBe("part_year");
    expect(parsed.paNonresidentReturn?.scheduleNRH?.compensation?.method).toBe("working_days");
    expect(parsed.paNonresidentReturn?.additionalEligibilityIncome).toBe("2000");
    expect(parsed.paNonresidentReturn?.spouseIsClaimedAsDependentOnAnotherFederalReturn).toBe(false);
    expect(parsed.paNonresidentReturn?.useTaxWorksheet?.locality).toBe("philadelphia");
    expect(parsed.paNonresidentReturn?.useTaxWorksheet?.salesTaxAlreadyPaid).toBe("4");
    expect(parsed.paScheduleGLStatements?.[0]?.stateCode).toBe("NJ");
    expect(parsed.paScheduleJStatements?.[0]?.sourceDocument).toBe("pa_nrk_1");
    expect(parsed.paPassThroughStatements?.[0]?.sourceDocument).toBe("pa_rk_1");
    expect(parsed.paPassThroughStatements?.[0]?.businessIncome).toBe("5000");
  });

  it("exports the Pennsylvania orchestrator and related types", () => {
    const overrides: PAOrchestratorOverrides = {
      estimatedPayments: new Decimal("100"),
    };

    const result: PAOrchestratorResult = calculatePAReturn(makeInput({
      w2s: [{
        employer: { name: "Acme Corp", ein: "12-3456789" },
        wages: "10000",
        federalWithheld: "1200",
        stateWages: "10000",
        stateTaxWithheld: "307",
        state: "PA",
      }],
    }), overrides);

    expect(result.pa40.taxLiability.toString()).toBe("307");
    expect(result.pa40.estimatedPayments.toString()).toBe("100");
  });

  it("exports the Pennsylvania nonresident orchestrator and related types", () => {
    const overrides: PANonresidentOrchestratorOverrides = {
      residencyStatus: "part_year",
      paTaxableCompensation: new Decimal("4000"),
      additionalEligibilityIncome: new Decimal("2000"),
    };

    const result: PANonresidentOrchestratorResult = calculatePANonresidentReturn(makeInput(), overrides);

    expect(result.residencyStatus).toBe("part_year");
    expect(result.scheduleSP.taxForgivenessCredit.toString()).toBe("123");
    expect(result.pa40.totalAmountDue.toString()).toBe("0");
  });

  it("exports Pennsylvania Schedule E calculation types and function", () => {
    const input: PAScheduleEInput = {
      taxYear: 2025,
      rentalProperties: [
        {
          description: "Chestnut Street duplex",
          propertyType: "single_family",
          rents: "12000",
          taxes: "1500",
          insurance: "900",
          depreciation: "2000",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
      form1099Misc: [],
      scheduleK1: [],
    };

    const result: PAScheduleEResult = calculatePAScheduleE(input);

    expect(result.propertyGrossRents.toString()).toBe("12000");
    expect(result.totalAllowableExpenses.toString()).toBe("4400");
    expect(result.netRentalRoyaltyIncome.toString()).toBe("7600");
  });

  it("exports Pennsylvania Schedule A calculation types and function", () => {
    const input: PAScheduleAInput = {
      taxYear: 2025,
      federalInterestIncome: new Decimal("100"),
      taxExemptInterest: new Decimal("25"),
      usGovernmentInterest: new Decimal("10"),
    };

    const result: PAScheduleAResult = calculatePAScheduleA(input);

    expect(result.line4.toString()).toBe("125");
    expect(result.line9.toString()).toBe("10");
    expect(result.line16.toString()).toBe("115");
  });

  it("exports Pennsylvania Schedule B calculation types and function", () => {
    const input: PAScheduleBInput = {
      taxYear: 2025,
      federalDividendIncome: new Decimal("100"),
      exemptInterestDividends: new Decimal("40"),
      capitalGainDistributions: new Decimal("25"),
    };

    const result: PAScheduleBResult = calculatePAScheduleB(input);

    expect(result.line7.toString()).toBe("40");
    expect(result.line10.toString()).toBe("25");
    expect(result.line12.toString()).toBe("165");
  });

  it("exports Pennsylvania Schedule C calculation types and function", () => {
    const input: PAScheduleCInput = {
      taxYear: 2025,
      grossReceipts: new Decimal("25000"),
      expenses: {
        contractLabor: new Decimal("5000"),
        travel: new Decimal("200"),
        meals: new Decimal("100"),
      },
    };

    const result: PAScheduleCResult = calculatePAScheduleC(input);

    expect(result.line5.toNumber()).toBe(25000);
    expect(result.line31.toNumber()).toBe(300);
    expect(result.line38.toNumber()).toBe(5300);
    expect(result.line39.toNumber()).toBe(19700);
  });

  it("exports Pennsylvania Schedule F calculation types and function", () => {
    const input: PAScheduleFInput = {
      taxYear: 2025,
      salesOfProductsRaised: "20000",
      cropInsuranceProceeds: "4000",
      priorYearDeferredCropInsurance: "3000",
      expenses: {
        feed: "5000",
      },
    };

    const result: PAScheduleFResult = calculatePAScheduleF(input);

    expect(result.excludedPriorYearDeferredCropInsurance.toNumber()).toBe(3000);
    expect(result.line12.toNumber()).toBe(24000);
    expect(result.line39.toNumber()).toBe(19000);
  });

  it("exports the broader Pennsylvania calculator surface", () => {
    const calculators = [
      calculatePA40,
      calculatePALocalEIT,
      calculatePhiladelphiaWageTax,
      calculatePAScheduleF,
      calculatePAScheduleD,
      calculatePAScheduleNRH,
      calculatePAScheduleO,
      calculatePAScheduleRK1,
      calculatePAScheduleT,
      calculatePAUseTax,
      calculatePAWorkingPennsylvaniansTaxCredit,
      calculateREV1630,
      calculateScheduleDC,
      calculateScheduleGL,
      calculateScheduleJ,
      calculateScheduleOC,
      calculateScheduleSD,
      calculateScheduleSP,
      calculateScheduleUE,
    ];

    expect(calculators).toHaveLength(19);

    const pa40Input: PA40Input = {
      taxYear: 2025,
      compensation: new Decimal("10000"),
      unreimbursedExpenses: new Decimal("0"),
      interest: new Decimal("0"),
      dividends: new Decimal("0"),
      netBusinessIncome: new Decimal("0"),
      netGainOrLoss: new Decimal("0"),
      netRentalIncome: new Decimal("0"),
      estateTrustIncome: new Decimal("0"),
      gamblingIncome: new Decimal("0"),
      otherDeductions: new Decimal("0"),
      taxForgivenessEligibilityIncome: new Decimal("0"),
      useTax: new Decimal("0"),
      stateWithholding: new Decimal("307"),
      creditFromPriorYear: new Decimal("0"),
      estimatedPayments: new Decimal("0"),
      extensionPayment: new Decimal("0"),
      nonresidentTaxWithheld: new Decimal("0"),
      refundableCredits: new Decimal("0"),
      taxForgivenessCredit: new Decimal("0"),
      residentCredit: new Decimal("0"),
      otherCredits: new Decimal("0"),
      underpaymentPenalty: new Decimal("0"),
      lateFilingOrPaymentPenalty: new Decimal("0"),
      latePaymentInterest: new Decimal("0"),
    };
    const pa40Result: PA40Result = calculatePA40(pa40Input);

    const scheduleSPInput: ScheduleSPInput = {
      taxYear: 2025,
      filingCategory: "unmarried",
      dependents: 0,
      paTaxableIncome: new Decimal("6000"),
      nontaxableIncome: new Decimal("0"),
      taxLiability: new Decimal("184"),
      taxPaidToOtherStates: new Decimal("0"),
    };
    const scheduleSPResult: ScheduleSPResult = calculateScheduleSP(scheduleSPInput);

    const scheduleGLInput: ScheduleGLInput = {
      taxYear: 2025,
      paTaxLiability: new Decimal("307"),
      otherStateCredits: [
        {
          stateCode: "NJ",
          incomeTaxableByBothStates: new Decimal("10000"),
          taxPaidToOtherState: new Decimal("500"),
        },
      ],
    };
    const scheduleGLResult: ScheduleGLResult = calculateScheduleGL(scheduleGLInput);

    const scheduleUEInput: ScheduleUEInput = {
      taxYear: 2025,
      otherExpenses: {
        unionDues: new Decimal("120"),
        subscriptions: new Decimal("30"),
      },
    };
    const scheduleUEResult: ScheduleUEResult = calculateScheduleUE(scheduleUEInput);

    const scheduleOCInput: ScheduleOCInput = {
      taxYear: 2025,
      otherCredits: [
        { creditType: "reap", amount: new Decimal("75"), description: "REAP" },
      ],
    };
    const scheduleOCResult: ScheduleOCResult = calculateScheduleOC(scheduleOCInput);

    const scheduleOInput: PAScheduleOInput = {
      taxYear: 2025,
      qualifiedTuitionContributions: [
        {
          beneficiaryName: "Student",
          beneficiarySSN: "111-11-1111",
          taxpayerContribution: new Decimal("500"),
        },
      ],
      medicalSavingsAccountDeduction: new Decimal("100"),
      spouseMedicalSavingsAccountDeduction: new Decimal("0"),
      healthSavingsAccountDeduction: new Decimal("250"),
      spouseHealthSavingsAccountDeduction: new Decimal("0"),
      studentLoanInterestDeduction: new Decimal("300"),
      spouseStudentLoanInterestDeduction: new Decimal("0"),
      taxpayerPATaxableIncome: new Decimal("60000"),
      spousePATaxableIncome: new Decimal("0"),
    };
    const scheduleOResult: PAScheduleOResult = calculatePAScheduleO(scheduleOInput);

    const scheduleDInput: PAScheduleDInput = {
      taxYear: 2025,
      filingStatus: "single",
      form1099B: [],
      scheduleK1: [],
      form6252: [],
      homeSales: [],
    };
    const scheduleDResult: PAScheduleDResult = calculatePAScheduleD(scheduleDInput);

    const scheduleTInput: PAScheduleTInput = {
      taxYear: 2025,
      additionalEntries: [
        {
          description: "Casino winnings",
          winnings: new Decimal("500"),
          wageringCosts: new Decimal("150"),
        },
      ],
    };
    const scheduleTResult: PAScheduleTResult = calculatePAScheduleT(scheduleTInput);

    const scheduleJInput: ScheduleJInput = {
      taxYear: 2025,
      statements: [
        {
          estateOrTrustName: "Family Trust",
          federalEIN: "12-3456789",
          sourceDocument: "pa_nrk_1",
          incomeAmount: new Decimal("200"),
          nonresidentTaxWithheld: new Decimal("10"),
        },
      ],
    };
    const scheduleJResult: ScheduleJResult = calculateScheduleJ(scheduleJInput);

    const scheduleRK1Input: PAScheduleRK1Input = {
      taxYear: 2025,
      statements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "12-3456789",
          sourceDocument: "pa_rk_1",
          businessIncome: new Decimal("1000"),
          interestIncome: new Decimal("25"),
        },
      ],
    };
    const scheduleRK1Result: PAScheduleRK1Result = calculatePAScheduleRK1(scheduleRK1Input);

    const rev1630Input: REV1630Input = {
      taxYear: 2025,
      taxLiability: new Decimal("1000"),
      withholdingAndCredits: new Decimal("300"),
      quarterlyEstimatedPayments: [
        new Decimal("150"),
        new Decimal("150"),
        new Decimal("150"),
        new Decimal("150"),
      ],
    };
    const rev1630Result: REV1630Result = calculateREV1630(rev1630Input);

    const localEITInput: PALocalEITInput = {
      taxYear: 2025,
      municipality: "Abington Township",
      localEITRate: new Decimal("0.01"),
      compensation: new Decimal("50000"),
      netSelfEmploymentIncome: new Decimal("0"),
      nonresidentCredits: [],
      localWithholding: new Decimal("500"),
    };
    const localEITResult: PALocalEITResult = calculatePALocalEIT(localEITInput);

    const philadelphiaWageTaxInput: PhiladelphiaWageTaxInput = {
      taxYear: 2025,
      residencyStatus: "resident",
      taxableCompensationPreJuly: new Decimal("20000"),
      taxableCompensationPostJuly: new Decimal("30000"),
      scheduleSPApproved: true,
      withholding: new Decimal("900"),
    };
    const philadelphiaWageTaxResult: PhiladelphiaWageTaxResult =
      calculatePhiladelphiaWageTax(philadelphiaWageTaxInput);

    const scheduleSDInput: ScheduleSDInput = {
      taxYear: 2025,
      method: "PSD",
      schoolDistrictRate: new Decimal("0.01"),
      paTotalTaxableIncome: new Decimal("50000"),
      netCompensation: new Decimal("50000"),
      netBusinessIncome: new Decimal("0"),
      otherDeductions: new Decimal("0"),
      forgivenessPercentage: new Decimal("0"),
      schoolDistrictWithholding: new Decimal("500"),
      estimatedPayments: new Decimal("0"),
    };
    const scheduleSDResult: ScheduleSDResult = calculateScheduleSD(scheduleSDInput);

    const useTaxInput: PAUseTaxInput = {
      taxYear: 2025,
      paTaxableIncome: new Decimal("50000"),
      locality: "remainder_of_pa",
      taxableItemPurchases: new Decimal("1000"),
      taxableServicePurchases: new Decimal("200"),
      electEstimatedTable: false,
      salesTaxAlreadyPaid: new Decimal("0"),
    };
    const useTaxResult: PAUseTaxResult = calculatePAUseTax(useTaxInput);

    const scheduleDCInput: ScheduleDCInput = {
      taxYear: 2025,
      qualifyingPersons: 1,
      paTaxableIncome: new Decimal("20000"),
      federalCredit: new Decimal("300"),
    };
    const scheduleDCResult: ScheduleDCResult = calculateScheduleDC(scheduleDCInput);

    const wptcInput: PAWorkingPennsylvaniansTaxCreditInput = {
      taxYear: 2025,
      paEarnedIncome: new Decimal("20000"),
      federalEarnedIncomeCredit: new Decimal("800"),
      isClaimedAsDependentOnAnotherFederalReturn: false,
    };
    const wptcResult: PAWorkingPennsylvaniansTaxCreditResult =
      calculatePAWorkingPennsylvaniansTaxCredit(wptcInput);

    const scheduleNRHInput: PAScheduleNRHInput = {
      taxYear: 2025,
      compensation: {
        method: "working_days",
        grossCompensation: new Decimal("10000"),
        totalDaysForEmployer: 200,
        nonworkingDays: 0,
        daysWorkedInPennsylvania: 50,
      },
    };
    const scheduleNRHResult: PAScheduleNRHResult = calculatePAScheduleNRH(scheduleNRHInput);

    expect(pa40Result.taxLiability.toString()).toBe("307");
    expect(scheduleSPResult.taxForgivenessCredit.toString()).toBe("184");
    expect(scheduleGLResult.totalCredit.toString()).toBe("307");
    expect(scheduleUEResult.netUnreimbursedExpenses.toString()).toBe("150");
    expect(scheduleOCResult.totalOtherCredits.toString()).toBe("75");
    expect(scheduleOResult.totalOtherDeductions.toString()).toBe("1150");
    expect(scheduleDResult.reportableNetGainOrLoss.toString()).toBe("0");
    expect(scheduleTResult.totalTaxableWinnings.toString()).toBe("350");
    expect(scheduleJResult.totalEstateTrustIncome.toString()).toBe("200");
    expect(scheduleRK1Result.totalBusinessIncome.toString()).toBe("1000");
    expect(rev1630Result.totalInterest.greaterThanOrEqualTo(0)).toBe(true);
    expect(localEITResult.balanceDue.toString()).toBe("0");
    expect(philadelphiaWageTaxResult.finalTax.toFixed(2)).toBe("750.00");
    expect(scheduleSDResult.amountOwed.toString()).toBe("0");
    expect(useTaxResult.totalUseTaxLiability.toString()).toBe("72");
    expect(scheduleDCResult.credit.toString()).toBe("300");
    expect(wptcResult.credit.toString()).toBe("80");
    expect(scheduleNRHResult.netPATaxableCompensation.toString()).toBe("2500");
  });
});
