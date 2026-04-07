import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePANonresidentReturn,
} from "@/engine/state/pa-nonresident-orchestrator.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Taylor",
        lastName: "Filer",
        ssn: "000-00-0001",
        dateOfBirth: "1985-01-01",
      },
      address: {
        street: "1 Market St",
        city: "Camden",
        state: "NJ",
        zip: "08101",
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

describe("Pennsylvania nonresident and part-year orchestrator", () => {
  it("PA nonresident orchestrator resolves nested supplemental input and lets explicit overrides win", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        paTaxableInterest: "25",
        useTax: "7",
        otherCredits: "10",
      },
    }), {
      paTaxableInterest: d(40),
      useTax: d(3),
    });

    expect(result.residencyStatus).toBe("nonresident");
    expect(result.taxableIncome.interest.toNumber()).toBe(40);
    expect(result.pa40.useTax.toNumber()).toBe(3);
    expect(result.pa40.otherCredits.toNumber()).toBe(10);
  });

  it("PA nonresident orchestrator computes use tax from the supported worksheet and preserves raw Line 25 override precedence", () => {
    const input = makeInput({
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "50000",
        useTaxWorksheet: {
          locality: "remainder_of_pa",
          taxableItemPurchases: "500",
          taxableServicePurchases: "250",
          electEstimatedTable: true,
          salesTaxAlreadyPaid: "10",
        },
      },
    });

    const nestedWorksheetResult = calculatePANonresidentReturn(input);
    expect(nestedWorksheetResult.pa40.totalPATaxableIncome.toNumber()).toBe(50000);
    expect(nestedWorksheetResult.pa40.useTax.toNumber()).toBe(52);

    const explicitWorksheetOverride = calculatePANonresidentReturn(input, {
      useTaxWorksheet: {
        locality: "philadelphia",
        taxableItemPurchases: d(200),
        taxableServicePurchases: d(50),
        electEstimatedTable: true,
        salesTaxAlreadyPaid: d(0),
      },
    });
    expect(explicitWorksheetOverride.pa40.useTax.toNumber()).toBe(42);

    const rawOverrideWins = calculatePANonresidentReturn(input, {
      useTax: d(40),
      useTaxWorksheet: {
        locality: "philadelphia",
        taxableItemPurchases: d(200),
        taxableServicePurchases: d(50),
        electEstimatedTable: true,
        salesTaxAlreadyPaid: d(0),
      },
    });
    expect(rawOverrideWins.pa40.useTax.toNumber()).toBe(40);
  });

  it("PA nonresident orchestrator computes Schedule NRH compensation and settles the PA-40", () => {
    const result = calculatePANonresidentReturn(makeInput({
      w2s: [{
        employer: { name: "Keystone Services", ein: "12-3456789" },
        wages: "100000",
        federalWithheld: "10000",
        stateTaxWithheld: "2000",
        state: "PA",
      }],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        scheduleNRH: {
          compensation: {
            method: "working_days",
            grossCompensation: "100000",
            totalDaysForEmployer: 365,
            nonworkingDays: 115,
            daysWorkedInPennsylvania: 150,
          },
        },
      },
    }));

    expect(result.scheduleNRH?.apportionedGrossCompensation.toNumber()).toBe(60000);
    expect(result.taxableIncome.compensation.toNumber()).toBe(60000);
    expect(result.pa40.taxLiability.toNumber()).toBe(1842);
    expect(result.pa40.stateWithholding.toNumber()).toBe(2000);
    expect(result.pa40.netOverpayment.toNumber()).toBe(158);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
    expect(result.scheduleGL.totalCredit.toNumber()).toBe(0);
  });

  it("PA nonresident orchestrator defaults nonreciprocal-state compensation from PA W-2 wages", () => {
    const result = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        address: {
          street: "1 Market St",
          city: "Wilmington",
          state: "DE",
          zip: "19801",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Keystone Manufacturing", ein: "98-7654321" },
        wages: "28000",
        federalWithheld: "2500",
        stateWages: "28000",
        stateTaxWithheld: "860",
        state: "PA",
      }],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
      },
    }));

    expect(result.taxableIncome.compensation.toNumber()).toBe(28000);
    expect(result.pa40.taxLiability.toNumber()).toBe(860);
    expect(result.pa40.stateWithholding.toNumber()).toBe(860);
    expect(result.pa40.netOverpayment.toNumber()).toBe(0);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
  });

  it("PA part-year orchestrator applies Schedule NRH business income and resident credit", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paNonresidentReturn: {
        residencyStatus: "part_year",
        scheduleNRH: {
          businessApportionment: {
            propertyEverywhere: "300000",
            propertyPennsylvania: "120000",
            payrollEverywhere: "200000",
            payrollPennsylvania: "100000",
            salesEverywhere: "500000",
            salesPennsylvania: "150000",
            totalNetProfits: "90000",
          },
        },
        paTaxableInterest: "500",
        estimatedPayments: "600",
        otherStateCredits: [
          {
            stateCode: "DE",
            incomeTaxableByBothStates: "5000",
            taxPaidToOtherState: "250",
          },
        ],
        additionalEligibilityIncome: "10000",
      },
    }));

    expect(result.scheduleNRH?.paNetProfits?.toNumber()).toBe(36000);
    expect(result.taxableIncome.netBusinessIncome.toNumber()).toBe(36000);
    expect(result.pa40.taxLiability.toNumber()).toBe(1121);
    expect(result.scheduleGL.totalCredit.toNumber()).toBe(154);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(367);
  });

  it("PA part-year orchestrator uses all-source eligibility income for Schedule SP tax forgiveness", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "4000",
        additionalEligibilityIncome: "2000",
      },
    }));

    expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(6000);
    expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    expect(result.scheduleSP.taxForgivenessCredit.toNumber()).toBe(123);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
    expect(result.pa40.netOverpayment.toNumber()).toBe(0);
  });

  it("PA nonresident orchestrator defaults reciprocal-state PA wages into Schedule SP nontaxable income", () => {
    const result = calculatePANonresidentReturn(makeInput({
      w2s: [{
        employer: { name: "Keystone Services", ein: "12-3456789" },
        wages: "18000",
        stateWages: "20000",
        federalWithheld: "1500",
        stateTaxWithheld: "0",
        state: "PA",
      }],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        paTaxableNetBusinessIncome: "5000",
      },
    }));

    expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(20000);
    expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(25000);
    expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(0);
    expect(result.pa40.taxLiability.toNumber()).toBe(154);
    expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(0);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(154);
  });

  it("PA nonresident orchestrator keeps reciprocal-state PA W-2 compensation out of taxable income by default", () => {
    const result = calculatePANonresidentReturn(makeInput({
      w2s: [{
        employer: { name: "Keystone Services", ein: "12-3456789" },
        wages: "20000",
        stateWages: "20000",
        federalWithheld: "1500",
        stateTaxWithheld: "614",
        state: "PA",
      }],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
      },
    }));

    expect(result.taxableIncome.compensation.toNumber()).toBe(0);
    expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(20000);
    expect(result.pa40.taxLiability.toNumber()).toBe(0);
    expect(result.pa40.netOverpayment.toNumber()).toBe(614);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
  });

  it("PA nonresident orchestrator honors an explicit $0 Schedule SP nontaxable-income override over the reciprocal-state default", () => {
    const result = calculatePANonresidentReturn(makeInput({
      w2s: [{
        employer: { name: "Keystone Services", ein: "12-3456789" },
        wages: "18000",
        stateWages: "20000",
        federalWithheld: "1500",
        stateTaxWithheld: "0",
        state: "PA",
      }],
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        paTaxableNetBusinessIncome: "5000",
        nontaxableIncome: "0",
      },
    }));

    expect(result.scheduleSP.nontaxableIncome.toNumber()).toBe(0);
    expect(result.scheduleSP.eligibilityIncome.toNumber()).toBe(5000);
    expect(result.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);
    expect(result.pa40.taxForgivenessCredit.toNumber()).toBe(154);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(0);
  });

  it("PA nonresident orchestrator maps married filing separately to the correct Schedule SP filing category", () => {
    const marriedTable = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: true,
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Jordan",
          lastName: "Filer",
          ssn: "000-00-0002",
          dateOfBirth: "1986-02-02",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "7000",
      },
    }));
    expect(marriedTable.scheduleSP.filingCategory).toBe("married");
    expect(marriedTable.scheduleSP.baseThreshold.toNumber()).toBe(13000);

    const separatedOverride = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: true,
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Jordan",
          lastName: "Filer",
          ssn: "000-00-0002",
          dateOfBirth: "1986-02-02",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "7000",
      },
    }), {
      scheduleSPSeparatedStatusApplies: true,
    });
    expect(separatedOverride.scheduleSP.filingCategory).toBe("unmarried");
    expect(separatedOverride.scheduleSP.baseThreshold.toNumber()).toBe(6500);

    const livedApartAllYear = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: false,
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Jordan",
          lastName: "Filer",
          ssn: "000-00-0002",
          dateOfBirth: "1986-02-02",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "7000",
      },
    }));
    expect(livedApartAllYear.scheduleSP.filingCategory).toBe("unmarried");
    expect(livedApartAllYear.scheduleSP.baseThreshold.toNumber()).toBe(6500);
  });

  it("PA nonresident orchestrator rejects married filing jointly when a spouse is claimed as a dependent on another person's federal return", () => {
    expect(() => calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Paula",
          lastName: "Example",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Scott",
          lastName: "Example",
          ssn: "000-00-0002",
          dateOfBirth: "1986-06-15",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "7000",
        spouseIsClaimedAsDependentOnAnotherFederalReturn: true,
      },
    }))).toThrow(
      "PA Schedule SP requires married taxpayers to file separately when either spouse is claimed as a dependent on another person's federal return",
    );
  });

  it("PA nonresident orchestrator includes spouse eligibility income only when Schedule SP uses the married table", () => {
    const marriedTable = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: true,
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Jordan",
          lastName: "Filer",
          ssn: "000-00-0002",
          dateOfBirth: "1986-02-02",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "6700",
        spouseEligibilityIncome: "500",
      },
    }));

    expect(marriedTable.scheduleSP.additionalEligibilityIncome.toNumber()).toBe(500);
    expect(marriedTable.scheduleSP.eligibilityIncome.toNumber()).toBe(7200);
    expect(marriedTable.scheduleSP.forgivenessPercentage.toNumber()).toBe(100);

    const separatedTable = calculatePANonresidentReturn(makeInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: true,
        primary: {
          firstName: "Taylor",
          lastName: "Filer",
          ssn: "000-00-0001",
          dateOfBirth: "1985-01-01",
        },
        spouse: {
          firstName: "Jordan",
          lastName: "Filer",
          ssn: "000-00-0002",
          dateOfBirth: "1986-02-02",
        },
        address: {
          street: "1 Market St",
          city: "Camden",
          state: "NJ",
          zip: "08101",
        },
        dependents: [],
      },
      paNonresidentReturn: {
        residencyStatus: "part_year",
        paTaxableCompensation: "6700",
        spouseEligibilityIncome: "500",
        scheduleSPSeparatedStatusApplies: true,
      },
    }));

    expect(separatedTable.scheduleSP.filingCategory).toBe("unmarried");
    expect(separatedTable.scheduleSP.additionalEligibilityIncome.toNumber()).toBe(0);
    expect(separatedTable.scheduleSP.eligibilityIncome.toNumber()).toBe(6700);
    expect(separatedTable.scheduleSP.forgivenessPercentage.toNumber()).toBe(90);
  });

  it("PA part-year orchestrator carries PA statement income classes and withholding into the PA-40", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paPassThroughStatements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          businessIncome: "1000",
          interestIncome: "50",
          dividendIncome: "25",
          netGainOrLoss: "200",
          netRentalIncome: "300",
          estateTrustIncome: "80",
          gamblingIncome: "10",
        },
        {
          entityName: "Beta Ventures LLC",
          entityEIN: "22-2222222",
          sourceDocument: "pa_nrk_1",
          businessIncome: "400",
          netGainOrLoss: "-50",
          netRentalIncome: "40",
          estateTrustIncome: "20",
          gamblingIncome: "5",
          nonresidentTaxWithheld: "30",
        },
      ],
      paScheduleJStatements: [
        {
          estateOrTrustName: "Gamma Family Trust",
          federalEIN: "33-3333333",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "600",
          nonresidentTaxWithheld: "18",
        },
      ],
      paNonresidentReturn: {
        residencyStatus: "part_year",
        additionalEligibilityIncome: "40000",
      },
    }));

    expect(result.taxableIncome.interest.toNumber()).toBe(50);
    expect(result.taxableIncome.dividends.toNumber()).toBe(25);
    expect(result.taxableIncome.netBusinessIncome.toNumber()).toBe(1400);
    expect(result.taxableIncome.netGainOrLoss.toNumber()).toBe(150);
    expect(result.taxableIncome.netRentalIncome.toNumber()).toBe(340);
    expect(result.taxableIncome.estateTrustIncome.toNumber()).toBe(700);
    expect(result.taxableIncome.gamblingIncome.toNumber()).toBe(15);
    expect(result.pa40.totalPATaxableIncome.toNumber()).toBe(2680);
    expect(result.pa40.taxLiability.toNumber()).toBe(82);
    expect(result.pa40.nonresidentTaxWithheld.toNumber()).toBe(48);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(34);
  });

  it("PA nonresident orchestrator lets explicit Line 17 withholding override statement-derived withholding", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paPassThroughStatements: [
        {
          entityName: "Beta Ventures LLC",
          entityEIN: "22-2222222",
          sourceDocument: "pa_nrk_1",
          businessIncome: "10000",
          nonresidentTaxWithheld: "30",
        },
      ],
      paScheduleJStatements: [
        {
          estateOrTrustName: "Gamma Family Trust",
          federalEIN: "33-3333333",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "5000",
          nonresidentTaxWithheld: "18",
        },
      ],
      paNonresidentReturn: {
        residencyStatus: "part_year",
        nonresidentTaxWithheld: "0",
      },
    }));

    expect(result.taxableIncome.netBusinessIncome.toNumber()).toBe(10000);
    expect(result.taxableIncome.estateTrustIncome.toNumber()).toBe(5000);
    expect(result.pa40.taxLiability.toNumber()).toBe(461);
    expect(result.pa40.nonresidentTaxWithheld.toNumber()).toBe(0);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(461);
  });

  it("PA nonresident orchestrator ignores Schedule G-L entries for nonresident returns", () => {
    const result = calculatePANonresidentReturn(makeInput({
      paNonresidentReturn: {
        residencyStatus: "nonresident",
        paTaxableCompensation: "20000",
        otherStateCredits: [
          {
            stateCode: "DE",
            incomeTaxableByBothStates: "20000",
            taxPaidToOtherState: "250",
          },
        ],
      },
    }));

    expect(result.scheduleGL.totalCredit.toNumber()).toBe(0);
    expect(result.scheduleSP.taxPaidToOtherStates.toNumber()).toBe(0);
    expect(result.pa40.residentCredit.toNumber()).toBe(0);
    expect(result.pa40.taxLiability.toNumber()).toBe(614);
    expect(result.pa40.totalAmountDue.toNumber()).toBe(614);
  });
});
