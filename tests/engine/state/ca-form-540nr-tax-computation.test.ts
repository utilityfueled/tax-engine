/**
 * Tests for California Form 540NR tax computation.
 * Spec: spec/state/ca-form-540nr-tax-computation.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import { calculateCAForm540ExemptionCredits } from "@/engine/state/ca-form-540-exemption-credits.js";
import { calculateCAForm540NRTaxComputation } from "@/engine/state/ca-form-540nr-tax-computation.js";
import { calculateCAForm540TaxRateSchedules } from "@/engine/state/ca-form-540-tax-rate-schedules.js";
import { calculateCAForm540TaxTable } from "@/engine/state/ca-form-540-tax-table.js";
import { roundDollar } from "@/utils/decimal.js";

describe("CA Form 540NR tax computation", () => {
  it("CA Form 540NR tax computation Line 31 - taxable income at $100,000 stays on the tax-table path", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "60000",
      filingStatus: "single",
      federalAgi: "100000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });
    const taxTable = calculateCAForm540TaxTable({
      taxableIncome: "100000",
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.line31Source).toBe("tax_table");
    expect(result.line31.toString()).toBe(taxTable.tax.toString());
  });

  it("CA Form 540NR tax computation Line 36 - the effective tax rate is rounded to four decimals before line 37", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100001",
      californiaTaxableIncome: "50000",
      filingStatus: "single",
      federalAgi: "100001",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });
    const rateSchedule = calculateCAForm540TaxRateSchedules({
      taxableIncome: "100001",
      filingStatus: "single",
      taxYear: 2025,
    });
    const expectedLine36 = rateSchedule.tax
      .dividedBy(new Decimal(100001))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const expectedLine37 = roundDollar(new Decimal(50000).times(expectedLine36));

    expect(result.line31Source).toBe("tax_rate_schedule");
    expect(result.line36.toString()).toBe(expectedLine36.toString());
    expect(result.line37.toString()).toBe(expectedLine37.toString());
  });

  it("CA Form 540NR tax computation Line 38 - California taxable income above total taxable income caps the exemption-credit percentage at 1.0000", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "20000",
      californiaTaxableIncome: "30000",
      filingStatus: "single",
      federalAgi: "20000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.line35.toString()).toBe("30000");
    expect(result.line38.toString()).toBe("1");
  });

  it("CA Form 540NR tax computation Line 39 - AGI limitation applies before the California proration percentage", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "80000",
      californiaTaxableIncome: "40000",
      filingStatus: "single",
      federalAgi: "255000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });
    const exemptionCredits = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: "255000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(exemptionCredits.line32ExemptionCredits.toString()).toBe("604");
    expect(result.supportedResidentExemptionCredits.toString()).toBe("604");
    expect(result.line38.toString()).toBe("0.5");
    expect(result.line39.toString()).toBe("302");
  });

  it("CA Form 540NR tax computation Line 40 - prorated exemption credits cannot reduce tax below zero", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "1000",
      californiaTaxableIncome: "1000",
      filingStatus: "single",
      federalAgi: "1000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 5,
      taxYear: 2025,
    });

    expect(result.line37.toNumber()).toBeGreaterThan(0);
    expect(result.line39.toNumber()).toBeGreaterThan(result.line37.toNumber());
    expect(result.line40.toNumber()).toBe(0);
  });

  it("CA Form 540NR tax computation Line 42 - line 41 additional tax adds to the regular-tax subtotal before credits", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "60000",
      filingStatus: "single",
      federalAgi: "100000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "17",
      taxYear: 2025,
    });

    expect(result.line41Tax.toString()).toBe("17");
    expect(result.line42TaxBeforeCredits.toString()).toBe(result.line40.plus(17).toString());
  });

  it("CA Form 540NR tax computation Line 55 - line 38 prorates supported line 51 through line 53 credits with whole-dollar rounding", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line51JointCustodyHeadOfHouseholdCreditInput: {
        notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
        livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
        furnishedOverOneHalfHomeCost: true,
        qualifyingChildRelationshipMet: true,
        qualifyingChildLivedInHomeDays: 180,
        custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
        qualifyingChildMarriedOrRegisteredDomesticPartner: false,
        entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      },
      line53SeniorHeadOfHouseholdCreditInput: {
        agiForQualification: "90000",
        age65OrOlderOnDecember31: true,
        qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      },
      taxYear: 2025,
    });

    expect(result.line54CreditPercentage.toString()).toBe("0.3333");
    expect(result.line51Credit.toString()).toBe("610");
    expect(result.line52Credit.toString()).toBe("0");
    expect(result.line53Credit.toString()).toBe("1860");
    expect(result.line55Credit.toString()).toBe("823");
  });

  it("CA Form 540NR tax computation Line 55 - direct line 55 input cannot be mixed with supported line 51 through line 53 inputs", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "50000",
        filingStatus: "single",
        federalAgi: "100000",
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line55Credit: "120",
        line51Credit: "610",
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 55 direct input cannot be combined with supported line 51 through line 53 amounts"
    );
  });

  it("CA Form 540NR tax computation Line 74 - Schedule P (540NR) can limit line 50, line 55, line 60, line 61, and line 71 in one supported path", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line50Credit: "200",
      line51Credit: "610",
      line52Credit: "610",
      line53Credit: "1860",
      line61Credit: "60",
      schedulePTentativeMinimumTax: "1800",
      schedulePAlternativeMinimumTax: "50",
      line60SchedulePAdditionalCarryoverCredits: [
        {
          code: "197",
          name: "Child Adoption Costs",
          amount: "500",
        },
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: "200",
        },
      ],
      line60OtherStateTaxCreditAmount: "300",
      line60PassThroughEntityElectiveTaxCreditAmount: "400",
      line71SolarEnergyCreditCarryoverAmount: "30",
      line71CommercialSolarEnergyCreditCarryoverAmount: "25",
      taxYear: 2025,
    });

    const nonresidentLine50 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "50");
    const nonresidentLine55 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "55");
    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");
    const nonresidentLine61 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "61");
    const nonresidentLine71 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "71");

    expect(result.line42TaxBeforeCredits.toString()).toBe("2113");
    expect(result.line50Credit.toString()).toBe("200");
    expect(result.line55Credit.toString()).toBe("1026");
    expect(result.line60Credit.toString()).toBe("827");
    expect(result.line61Credit.toString()).toBe("60");
    expect(result.line62TotalCredits.toString()).toBe("2113");
    expect(result.line63TaxAfterCredits.toString()).toBe("0");
    expect(result.line71AlternativeMinimumTax.toString()).toBe("0");
    expect(result.line74TotalTax.toString()).toBe("0");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(2);
    expect(result.line60PassThroughEntityElectiveTaxCreditCarryover.toString()).toBe("400");
    expect(result.line71CommercialSolarEnergyCreditCarryover.toString()).toBe("5");
    expect(nonresidentLine50?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "5",
    });
    expect(nonresidentLine55?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "12,13,14",
    });
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16,17,20,21",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 197 used this year"]?.toString()).toBe("500");
    expect(nonresidentLine60?.inputs?.["Credit code 233 used this year"]?.toString()).toBe("200");
    expect(nonresidentLine60?.inputs?.["Credit code 187 used this year"]?.toString()).toBe("127");
    expect(nonresidentLine60?.inputs?.["Credit code 242 carryover"]?.toString()).toBe("400");
    expect(nonresidentLine61?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "15",
    });
    expect(nonresidentLine71?.inputs).toMatchObject({
      "Computation path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "25",
    });
    expect(nonresidentLine71?.inputs?.["Credit code 181 carryover"]?.toString()).toBe("5");
  });

  it("CA Form 540NR tax computation Line 60 - a supported Child Adoption Costs worksheet can feed Schedule P (540NR) and preserve carryover", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "100000",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line60ChildAdoptionCostsCreditInput: {
        qualifiedAdoptionCosts: "10001",
        adoptionDecreeFinalInTaxYear: true,
        childIsUsCitizenOrLegalResident: true,
        childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      },
      line61Credit: "60",
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");

    expect(result.line60Credit.toString()).toBe("2500");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("197");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("2500");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("2501");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 197 used this year"]?.toString()).toBe("2500");
    expect(nonresidentLine60?.inputs?.["Credit code 197 carryover"]?.toString()).toBe("2501");
  });

  it("CA Form 540NR tax computation Line 58 - a supported FTB 3510 input feeds code 188 without a direct line amount", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "100000",
      filingStatus: "single",
      federalAgi: "100000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line58PriorYearAlternativeMinimumTaxCreditInput: {
        priorYearFilingStatus: "single",
        priorYearItemizedDeductions: false,
        priorYearLine1ExclusionAlternativeMinimumTaxableIncome: "1000",
        priorYearLine5ExemptionWorksheetLine1Amount: "1000",
        priorYearLine6ExemptionWorksheetLine3Amount: "2000",
        priorYearLine28AlternativeMinimumTax: "50",
        priorYearLine31UnusedAmtCreditCarryover: "50",
        currentYearLine34ExemptionAndOtherAllowableCredits: "0",
        currentYearLine36TentativeMinimumTax: "0",
      },
      taxYear: 2025,
    });

    const nonresidentLine58 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "58");

    expect(result.line58Credit.toString()).toBe("100");
    expect(result.line62TotalCredits.toString()).toBe("100");
    expect(nonresidentLine58?.inputs).toMatchObject({
      "Computation path": "ca_ftb_3510_supported_input",
    });
    expect(nonresidentLine58?.inputs?.["Credit code 188 allowed this year"]?.toString()).toBe("100");
    expect(nonresidentLine58?.inputs?.["Credit code 188 carryover to next year"]?.toString()).toBe("0");
  });

  it("CA Form 540NR tax computation Line 60 and Line 73 - a supported FTB 3531 California Competes input feeds Schedule P and adds recapture to other taxes", async () => {
    vi.resetModules();
    const { calculateCAForm540NRTaxComputation: calculateFreshCAForm540NRTaxComputation } = await import(
      "@/engine/state/ca-form-540nr-tax-computation.js"
    );
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line60CaliforniaCompetesCreditInput: {
        currentYearAgreementCredits: [
          { agreementNumber: "CCTC-2025-A", creditEarned: "150" },
          { agreementNumber: "CCTC-2025-B", creditEarned: "50" },
        ],
        passThroughCredits: [
          { agreementNumber: "CCTC-K1-2024", amount: "25", yearEarned: 2024 },
        ],
        priorYearCarryover: "25",
        creditRecapture: "40",
        previouslyUsedRecapturedCredit: "15",
      },
      line61Credit: "60",
      line73OtherTaxes: "5",
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");
    const nonresidentLine73 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "73");

    expect(result.line60Credit.toString()).toBe("250");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("233");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("250");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("0");
    expect(result.line61Credit.toString()).toBe("60");
    expect(result.line62TotalCredits.toString()).toBe("310");
    expect(result.line63TaxAfterCredits.toString()).toBe("1803");
    expect(result.line73OtherTaxes.toString()).toBe("20");
    expect(result.line74TotalTax.toString()).toBe("1823");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
      "Credit codes": "233",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 233 used this year"]?.toString()).toBe("250");
    expect(nonresidentLine73?.inputs?.["Supported upstream Form 540NR line 73 amount"]?.toString()).toBe("5");
    expect(nonresidentLine73?.inputs?.["Credit code 233 recapture from FTB 3531 line 10b"]?.toString()).toBe("15");
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3592 College Access input feeds Schedule P and preserves carryover", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line60CollegeAccessTaxCreditInput: {
        certificateNumber: "CATC-2025-010",
        certificateCreditAmount: "2200",
        passThroughCredits: [
          {
            entityName: "College Access Fund",
            entityId: "95-0000001",
            amount: "200",
          },
        ],
        priorYearCarryover: "100",
        electedRefundableCreditAmount: "50",
      },
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");

    expect(result.line60Credit.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("235");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("337");
    expect(result.line62TotalCredits.toString()).toBe("2113");
    expect(result.line63TaxAfterCredits.toString()).toBe("0");
    expect(result.line74TotalTax.toString()).toBe("0");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
      "Credit codes": "235",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 235 available credit from FTB 3592 line 5"]?.toString()).toBe("2500");
    expect(nonresidentLine60?.inputs?.["Credit code 235 used this year"]?.toString()).toBe("2113");
    expect(nonresidentLine60?.inputs?.["Credit code 235 carryover"]?.toString()).toBe("337");
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3592 input cannot be mixed with a duplicate manual code 235 carryover credit", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "33330",
        filingStatus: "single",
        federalAgi: "90000",
        personalExemptionCount: 0,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line60CollegeAccessTaxCreditInput: {
          certificateNumber: "CATC-2025-011",
          certificateCreditAmount: "100",
        },
        line60SchedulePAdditionalCarryoverCredits: [
          {
            code: "235",
            name: "College Access Tax Credit",
            amount: "100",
          },
        ],
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 60 cannot accept both a College Access FTB 3592 input and a duplicate manual Schedule P code 235 carryover credit"
    );
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3503 Natural Heritage Preservation input feeds Schedule P and preserves carryover", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line60NaturalHeritagePreservationCreditInput: {
        fairMarketValue: "4000",
        passThroughCredits: [
          {
            entityName: "Habitat Preservation LP",
            entityId: "94-1234567",
            amount: "300",
          },
        ],
        priorYearCarryover: "250",
        electedRefundableCreditAmount: "50",
      },
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");

    expect(result.line60Credit.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("213");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("587");
    expect(result.line62TotalCredits.toString()).toBe("2113");
    expect(result.line63TaxAfterCredits.toString()).toBe("0");
    expect(result.line74TotalTax.toString()).toBe("0");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
      "Credit codes": "213",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 213 available credit from FTB 3503 line 6"]?.toString()).toBe("2750");
    expect(nonresidentLine60?.inputs?.["Credit code 213 used this year"]?.toString()).toBe("2113");
    expect(nonresidentLine60?.inputs?.["Credit code 213 carryover"]?.toString()).toBe("587");
    expect(nonresidentLine60?.inputs?.["Credit code 213 elected refundable amount from FTB 3503 line 7c"]?.toString()).toBe("50");
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3503 input cannot be mixed with a duplicate manual code 213 carryover credit", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "33330",
        filingStatus: "single",
        federalAgi: "90000",
        personalExemptionCount: 0,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line60NaturalHeritagePreservationCreditInput: {
          fairMarketValue: "100",
        },
        line60SchedulePAdditionalCarryoverCredits: [
          {
            code: "213",
            name: "Natural Heritage Preservation Credit",
            amount: "100",
          },
        ],
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 60 cannot accept both a Natural Heritage Preservation FTB 3503 input and a duplicate manual Schedule P code 213 carryover credit"
    );
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3523 Research Credit input feeds Schedule P and preserves carryover", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line60ResearchCreditInput: {
        currentYearNonPassiveResearchCredit: "2000",
        currentYearCreditSourceLine: "31a",
        passThroughCredits: [
          {
            entityName: "Innovation Fund LP",
            entityId: "94-1234567",
            amount: "300",
          },
        ],
        passiveActivityCreditIncludedOnLine32: "100",
        allowablePassiveActivityCredit: "50",
        priorYearNonPassiveCarryover: "250",
        electedRefundableCreditAmount: "50",
      },
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");

    expect(result.line60Credit.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("183");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("337");
    expect(result.line62TotalCredits.toString()).toBe("2113");
    expect(result.line63TaxAfterCredits.toString()).toBe("0");
    expect(result.line74TotalTax.toString()).toBe("0");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
      "Credit codes": "183",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 183 available credit from FTB 3523 line 38"]?.toString()).toBe("2500");
    expect(nonresidentLine60?.inputs?.["Credit code 183 used this year"]?.toString()).toBe("2113");
    expect(nonresidentLine60?.inputs?.["Credit code 183 carryover"]?.toString()).toBe("337");
    expect(nonresidentLine60?.inputs?.["Credit code 183 elected refundable amount from FTB 3523 line 41"]?.toString()).toBe("50");
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3523 input cannot be mixed with a duplicate manual code 183 carryover credit", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "33330",
        filingStatus: "single",
        federalAgi: "90000",
        personalExemptionCount: 0,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line60ResearchCreditInput: {
          currentYearNonPassiveResearchCredit: "100",
          currentYearCreditSourceLine: "17a",
        },
        line60SchedulePAdditionalCarryoverCredits: [
          {
            code: "183",
            name: "Research Credit",
            amount: "100",
          },
        ],
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 60 cannot accept both a Research Credit FTB 3523 input and a duplicate manual Schedule P code 183 carryover credit"
    );
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3521 Low-Income Housing Credit input feeds Schedule P and preserves carryover", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "100000",
      californiaTaxableIncome: "33330",
      filingStatus: "single",
      federalAgi: "90000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "200",
      line60LowIncomeHousingCreditInput: {
        currentYearCredit: "2000",
        currentYearCreditSource: "taxpayer_certification",
        passThroughCredits: [
          {
            entityName: "Central Valley Housing LP",
            entityId: "94-1234567",
            buildingIdentificationNumber: "CA99-00001",
            amount: "300",
          },
        ],
        passiveActivityCreditIncludedOnLine4: "100",
        allowablePassiveActivityCredit: "50",
        priorYearCarryover: "250",
      },
      taxYear: 2025,
    });

    const nonresidentLine60 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "60");

    expect(result.line60Credit.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits).toHaveLength(1);
    expect(result.line60AdditionalCarryoverCredits[0].code).toBe("172");
    expect(result.line60AdditionalCarryoverCredits[0].creditUsedThisYear.toString()).toBe("2113");
    expect(result.line60AdditionalCarryoverCredits[0].carryover.toString()).toBe("387");
    expect(result.line62TotalCredits.toString()).toBe("2113");
    expect(result.line63TaxAfterCredits.toString()).toBe("0");
    expect(result.line74TotalTax.toString()).toBe("0");
    expect(nonresidentLine60?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "16",
      "Credit codes": "172",
    });
    expect(nonresidentLine60?.inputs?.["Credit code 172 available credit from FTB 3521 line 11"]?.toString()).toBe("2500");
    expect(nonresidentLine60?.inputs?.["Credit code 172 used this year"]?.toString()).toBe("2113");
    expect(nonresidentLine60?.inputs?.["Credit code 172 carryover"]?.toString()).toBe("387");
  });

  it("CA Form 540NR tax computation Line 60 - a supported FTB 3521 input cannot be mixed with a duplicate manual code 172 carryover credit", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "33330",
        filingStatus: "single",
        federalAgi: "90000",
        personalExemptionCount: 0,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line60LowIncomeHousingCreditInput: {
          currentYearCredit: "100",
          currentYearCreditSource: "taxpayer_certification",
        },
        line60SchedulePAdditionalCarryoverCredits: [
          {
            code: "172",
            name: "Low-Income Housing Credit",
            amount: "100",
          },
        ],
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 60 cannot accept both a Low-Income Housing Credit FTB 3521 input and a duplicate manual Schedule P code 172 carryover credit"
    );
  });

  it("CA Form 540NR tax computation Line 71 - direct line 71 input cannot be mixed with supported Schedule P (540NR) Section C inputs", () => {
    expect(() =>
      calculateCAForm540NRTaxComputation({
        totalTaxableIncome: "100000",
        californiaTaxableIncome: "50000",
        filingStatus: "single",
        federalAgi: "100000",
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line71AlternativeMinimumTax: "10",
        schedulePAlternativeMinimumTax: "20",
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540NR line 71 direct input cannot be combined with supported Schedule P (540NR) Section C inputs"
    );
  });

  it("CA Form 540NR tax computation Line 71 - supported Schedule P (540NR) AMT worksheet input computes line 71 without direct line 43 or line 45 amounts", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "144460",
      californiaTaxableIncome: "30000",
      filingStatus: "single",
      federalAgi: "150000",
      personalExemptionCount: 0,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      schedulePAmtWorksheetInput: {
        itemizedDeductions: false,
        standardDeduction: "5540",
        taxableIncome: "144460",
        californiaAdjustedGrossIncome: "150000",
      },
      line71SolarEnergyCreditCarryoverAmount: "100",
      line71CommercialSolarEnergyCreditCarryoverAmount: "250",
      taxYear: 2025,
    });

    const expectedLine43 = new Decimal(4005);
    const expectedLine45 = Decimal.max(new Decimal(0), expectedLine43.minus(result.line37));
    const expectedLine71 = Decimal.max(new Decimal(0), expectedLine45.minus(100).minus(250));
    const nonresidentLine71 = result.lines.find((line) => line.form === "CA-540NR-TC" && line.line === "71");

    expect(result.line71AlternativeMinimumTax.toString()).toBe(expectedLine71.toString());
    expect(nonresidentLine71?.inputs).toMatchObject({
      "Computation path": "ca_schedule_p_540nr_supported_credits",
      "Schedule P line": "25",
    });
  });

  it("CA Form 540NR tax computation Line 74 - total tax adds credits, alternative minimum tax, Behavioral Health Services Tax, and other taxes", () => {
    const result = calculateCAForm540NRTaxComputation({
      totalTaxableIncome: "1000050",
      californiaTaxableIncome: "1000050",
      filingStatus: "single",
      federalAgi: "1000050",
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Tax: "11",
      line50Credit: "75",
      line55Credit: "120",
      line58Credit: "30",
      line59Credit: "40",
      line60Credit: "50",
      line61Credit: "60",
      line71AlternativeMinimumTax: "7",
      line73OtherTaxes: "9",
      taxYear: 2025,
    });

    expect(result.line62TotalCredits.toString()).toBe("375");
    expect(result.line72BehavioralHealthServicesTax.toString()).toBe("1");
    expect(result.line63TaxAfterCredits.toString()).toBe(result.line42TaxBeforeCredits.minus(375).toString());
    expect(result.line74TotalTax.toString()).toBe(
      result.line63TaxAfterCredits.plus(7).plus(1).plus(9).toString()
    );
  });
});
