/**
 * Tests for Ohio Input Adapter.
 * Spec: spec/state/oh-input-adapter.yaml
 *
 * Validates that the adapter correctly extracts Ohio-relevant data from
 * federal tax documents (W-2s, 1099-Rs) and the federal TaxReturnResult.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  extractOhioWithholding,
  extractSchoolDistrictWithholding,
  extractRetirementIncome,
  extractQualifyingBusinessIncome,
  extractFederalInterestExemptFromOhio,
  extractStateMunicipalTaxRefunds,
  determineSeniorStatus,
  countExemptions,
  determineBothSpousesQualifyingIncome,
  mapFilingStatus,
  buildOhioResidentReturnInput,
} from "@/engine/state/oh-input-adapter.js";
import type {
  W2,
  Form1099R,
  Form1099Int,
  Form1099G,
  Form1099Misc,
  Form1099Nec,
  Form1099K,
  FormW2G,
  TaxYearInput,
  ScheduleK1,
} from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";

// ---------------------------------------------------------------------------
// Helpers — minimal W-2, 1099-R, TaxYearInput, TaxReturnResult stubs
// ---------------------------------------------------------------------------

function makeW2(overrides: Partial<W2> = {}): W2 {
  return {
    employer: { name: "Acme Corp", ein: "12-3456789" },
    wages: "50000",
    federalWithheld: "5000",
    socialSecurityWages: "50000",
    socialSecurityWithheld: "3100",
    medicareWages: "50000",
    medicareWithheld: "725",
    stateTaxWithheld: "0",
    localTaxWithheld: "0",
    stateWages: "0",
    box12CodeW: "0",
    box12CodeD: "0",
    box12CodeE: "0",
    box12CodeF: "0",
    box12CodeG: "0",
    box12CodeH: "0",
    box12CodeS: "0",
    box12CodeAA: "0",
    box12CodeBB: "0",
    box12CodeEE: "0",
    box12CodeT: "0",
    socialSecurityTips: "0",
    ...overrides,
  };
}

function make1099R(overrides: Partial<Form1099R> = {}): Form1099R {
  return {
    payer: "Fidelity",
    grossDistribution: "10000",
    taxableAmount: "10000",
    taxableAmountNotDetermined: false,
    eligibleGovernmental457bPlan: false,
    eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0",
    rothConversionAmount: "0",
    rothContributionOrConversionMadeBefore2021: false,
    qualifiedRothDistribution: false,
    rothIraRolledOverAmount: "0",
    returnedContributionByDueDate: false,
    excessContributionReturnedWithoutEarnings: false,
    qualifiedCharitableDistribution: "0",
    federalWithheld: "0",
    employeeContributions: "0",
    retiredPublicSafetyOfficerInsurancePremiums: "0",
    iraSepSimple: false,
    disabilityPensionBeforeMinimumRetirementAge: false,
    separationFromServiceAfterAge55ExceptionApplies: false,
    qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false,
    qualifiedDomesticRelationsOrderExceptionApplies: false,
    terminalIllnessExceptionApplies: false,
    ...overrides,
  };
}

function makeW2G(overrides: Partial<FormW2G> = {}): FormW2G {
  return {
    payer: "Ohio Casino",
    reportableWinnings: "1000",
    federalWithheld: "0",
    stateWithheld: "0",
    ...overrides,
  };
}

function make1099K(overrides: Partial<Form1099K> = {}): Form1099K {
  return {
    pse: "Stripe",
    grossAmount: "0",
    incomeType: "other",
    ...overrides,
  };
}

function make1099Nec(overrides: Partial<Form1099Nec> = {}): Form1099Nec {
  return {
    payer: "Gig Platform",
    nonemployeeCompensation: "0",
    ...overrides,
  };
}

function make1099Misc(overrides: Partial<Form1099Misc> = {}): Form1099Misc {
  return {
    payer: "Misc Payer",
    otherIncome: "0",
    ...overrides,
  };
}

function makeTaxInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Jane",
        lastName: "Doe",
        ssn: "123-45-6789",
        dateOfBirth: "1980-06-15",
      },
      address: { street: "123 Main St", city: "Columbus", state: "OH", zip: "43215" },
      dependents: [],
    },
    w2s: [],
    ...overrides,
  } as unknown as TaxYearInput;
}

function makeFederalResult(overrides: Partial<TaxReturnResult> = {}): TaxReturnResult {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalWages: new Decimal(50000),
    totalInterest: new Decimal(0),
    totalDividends: new Decimal(0),
    qualifiedDividends: new Decimal(0),
    iraDistributionsGross: new Decimal(0),
    iraDistributionsTaxable: new Decimal(0),
    pensionDistributionsGross: new Decimal(0),
    pensionDistributionsTaxable: new Decimal(0),
    socialSecurityBenefitsGross: new Decimal(0),
    socialSecurityBenefitsTaxable: new Decimal(0),
    capitalGainLoss: new Decimal(0),
    otherIncome: new Decimal(0),
    nolDeduction: new Decimal(0),
    totalIncome: new Decimal(50000),
    adjustmentsToIncome: new Decimal(0),
    agi: new Decimal(50000),
    standardDeduction: new Decimal(15000),
    itemizedDeductions: new Decimal(0),
    deductionUsed: "standard",
    deductionAmount: new Decimal(15000),
    taxableIncome: new Decimal(35000),
    ordinaryTax: new Decimal(3500),
    capitalGainsTax: new Decimal(0),
    totalTaxBeforeCredits: new Decimal(3500),
    childTaxCredit: new Decimal(0),
    foreignTaxCredit: new Decimal(0),
    otherCredits: new Decimal(0),
    totalCredits: new Decimal(0),
    earnedIncomeCredit: new Decimal(0),
    amt: new Decimal(0),
    selfEmploymentTax: new Decimal(0),
    additionalMedicareTax: new Decimal(0),
    niitTax: new Decimal(0),
    estimatedTaxPenalty: new Decimal(0),
    totalAdditionalTaxes: new Decimal(0),
    totalTax: new Decimal(3500),
    totalPayments: new Decimal(5000),
    totalWithholding: new Decimal(5000),
    estimatedTaxPayments: new Decimal(0),
    amountOwed: new Decimal(0),
    refund: new Decimal(1500),
    carryforwards: {
      capitalLoss: new Decimal(0),
      shortTermCapitalLoss: new Decimal(0),
      longTermCapitalLoss: new Decimal(0),
      suspendedPassiveLosses: [],
      suspendedPTPLosses: [],
      foreignTaxCreditCarryforward: new Decimal(0),
      foreignTaxCreditCarryforwardByCategory: {},
      qbiLossCarryforward: new Decimal(0),
      investmentInterestExpense: new Decimal(0),
      minimumTaxCredit: new Decimal(0),
      charitableContributions: new Decimal(0),
      charitableContributionsByYear: [],
      excessBusinessLossNOL: new Decimal(0),
      nolCarryforward: new Decimal(0),
      generalBusinessCredit: new Decimal(0),
      suspendedBusinessInterest: [],
      partnerBasis: [],
    },
    ...overrides,
  } as TaxReturnResult;
}

// ---------------------------------------------------------------------------
// extractOhioWithholding
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Ohio Withholding", () => {
  it("extracts Ohio withholding from W-2s W-2Gs and supported 1099s", () => {
    const w2s = [
      makeW2({ state: "OH", stateTaxWithheld: "1200" }),
      makeW2({ state: "OH", stateTaxWithheld: "800" }),
    ];
    const formW2G = [
      makeW2G({ state: "OH", stateWithheld: "75" }),
      makeW2G({ state: "IN", stateWithheld: "10" }),
    ];
    const form1099G = [
      make1099G({ state: "OH", stateWithheld: "55" }),
      make1099G({ state: "MI", stateWithheld: "40" }),
    ];
    const form1099K = [
      make1099K({ state: "OH", stateWithheld: "45" }),
      make1099K({ state: "PA", stateWithheld: "35" }),
    ];
    const form1099R = [
      make1099R({ state: "OH", stateWithheld: "125" }),
      make1099R({ state: "PA", stateWithheld: "50" }),
    ];
    const form1099Nec = [
      make1099Nec({ state: "OH", stateWithheld: "85" }),
      make1099Nec({ state: "PA", stateWithheld: "40" }),
    ];
    const form1099Misc = [
      make1099Misc({ state: "OH", stateWithheld: "95" }),
      make1099Misc({ state: "MI", stateWithheld: "25" }),
    ];
    expect(
      extractOhioWithholding(
        w2s,
        formW2G,
        form1099G,
        form1099K,
        form1099R,
        form1099Nec,
        form1099Misc,
      ).toNumber(),
    ).toBe(2480);
  });

  it("Ohio withholding — no Ohio W-2s yields zero", () => {
    const w2s = [makeW2({ state: "PA", stateTaxWithheld: "500" })];
    expect(extractOhioWithholding(w2s).toNumber()).toBe(0);
  });

  it("Ohio withholding — W-2 with no state field excluded", () => {
    const w2s = [makeW2({ stateTaxWithheld: "500" })];
    expect(extractOhioWithholding(w2s).toNumber()).toBe(0);
  });

  it("Ohio withholding — mixed states sums only OH", () => {
    const w2s = [
      makeW2({ state: "OH", stateTaxWithheld: "1500" }),
      makeW2({ state: "PA", stateTaxWithheld: "700" }),
      makeW2({ state: "oh", stateTaxWithheld: "300" }), // lowercase
    ];
    expect(extractOhioWithholding(w2s).toNumber()).toBe(1800);
  });

  it("Ohio withholding — statements with no Ohio state code are excluded", () => {
    const w2s = [makeW2({ stateTaxWithheld: "500" })];
    const formW2G = [makeW2G({ stateWithheld: "75" })];
    const form1099G = [make1099G({ stateWithheld: "55" })];
    const form1099K = [make1099K({ stateWithheld: "45" })];
    const form1099R = [make1099R({ stateWithheld: "125" })];
    const form1099Nec = [make1099Nec({ stateWithheld: "85" })];
    const form1099Misc = [make1099Misc({ stateWithheld: "95" })];
    expect(
      extractOhioWithholding(
        w2s,
        formW2G,
        form1099G,
        form1099K,
        form1099R,
        form1099Nec,
        form1099Misc,
      ).toNumber(),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractSchoolDistrictWithholding
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — SD Withholding", () => {
  it("extracts SD withholding from Ohio W-2s and supported 1099-R statements", () => {
    const w2s = [
      makeW2({ state: "OH", localTaxWithheld: "250", localityName: "2503" }),
      makeW2({ state: "OH", localTaxWithheld: "150", localityName: "SD 2501" }),
    ];
    const form1099Rs = [
      make1099R({ state: "OH", localTaxWithheld: "75" } as Partial<Form1099R>),
      make1099R({ state: "MI", localTaxWithheld: "40" } as Partial<Form1099R>),
    ];
    expect(extractSchoolDistrictWithholding(w2s, form1099Rs).toNumber()).toBe(475);
  });

  it("SD withholding includes Ohio school district locality codes abbreviated names and excludes city locality labels", () => {
    const w2s = [
      makeW2({ state: "OH", localTaxWithheld: "250", localityName: "2503" }),
      makeW2({ state: "OH", localTaxWithheld: "80", localityName: "SD 2501" }),
      makeW2({ state: "OH", localTaxWithheld: "65", localityName: "SD Geneva Area CSD" }),
      makeW2({ state: "OH", localTaxWithheld: "150", localityName: "RITA" }),
      makeW2({ state: "OH", localTaxWithheld: "110", localityName: "COLUMBUS" }),
      makeW2({ state: "OH", localTaxWithheld: "125", localityName: "r1234" }),
      makeW2({ state: "OH", localTaxWithheld: "90", localityName: "R123" }),
    ];
    const form1099Rs = [
      make1099R({ state: "OH", localTaxWithheld: "75" } as Partial<Form1099R>),
    ];

    expect(extractSchoolDistrictWithholding(w2s, form1099Rs).toNumber()).toBe(470);
  });

  it("SD withholding — no Ohio W-2s yields zero", () => {
    const w2s = [makeW2({ state: "PA", localTaxWithheld: "100" })];
    const form1099Rs = [make1099R({ state: "PA", localTaxWithheld: "25" } as Partial<Form1099R>)];
    expect(extractSchoolDistrictWithholding(w2s, form1099Rs).toNumber()).toBe(0);
  });

  it("SD withholding — W-2 with no localTaxWithheld excluded", () => {
    const w2s = [makeW2({ state: "OH" })];
    const form1099Rs = [make1099R({ state: "OH" })];
    expect(extractSchoolDistrictWithholding(w2s, form1099Rs).toNumber()).toBe(0);
  });

  it("SD withholding excludes Ohio W-2s with no locality name", () => {
    const w2s = [makeW2({ state: "OH", localTaxWithheld: "100" })];

    expect(extractSchoolDistrictWithholding(w2s).toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractRetirementIncome
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Retirement Income", () => {
  it("extracts retirement income from 1099-Rs", () => {
    const forms = [
      make1099R({ taxableAmount: "15000" }),
      make1099R({ taxableAmount: "5000" }),
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(20000);
  });

  it("retirement income — no 1099-Rs yields zero", () => {
    expect(extractRetirementIncome([]).toNumber()).toBe(0);
  });

  it("retirement income — Roth conversions excluded", () => {
    const forms = [
      make1099R({ taxableAmount: "15000", rothConversionAmount: "15000" }),
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(0);
  });

  it("retirement income — returned contributions excluded", () => {
    const forms = [
      make1099R({ taxableAmount: "2000", returnedContributionByDueDate: true }),
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(0);
  });

  it("retirement income — excess contributions returned without earnings excluded", () => {
    const forms = [
      make1099R({ taxableAmount: "1000", excessContributionReturnedWithoutEarnings: true }),
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(0);
  });

  it("retirement income — taxableAmountNotDetermined uses grossDistribution", () => {
    const forms = [
      make1099R({
        grossDistribution: "25000",
        taxableAmount: undefined,
        taxableAmountNotDetermined: true,
      }),
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(25000);
  });

  it("retirement income — QCD excluded from taxable amount", () => {
    const forms = [
      make1099R({
        grossDistribution: "10000",
        taxableAmount: "10000",
        qualifiedCharitableDistribution: "3000",
      }),
    ];
    // 10000 - 3000 = 7000
    expect(extractRetirementIncome(forms).toNumber()).toBe(7000);
  });

  it("retirement income — mixed qualifying and non-qualifying", () => {
    const forms = [
      make1099R({ taxableAmount: "12000" }), // qualifying
      make1099R({ taxableAmount: "8000", rothConversionAmount: "8000" }), // excluded
      make1099R({ taxableAmount: "5000" }), // qualifying
    ];
    expect(extractRetirementIncome(forms).toNumber()).toBe(17000);
  });
});

// ---------------------------------------------------------------------------
// determineSeniorStatus
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Senior Status", () => {
  it("determines senior status from date of birth", () => {
    // Born 1960-06-15, in 2025 is age 65 → senior
    expect(determineSeniorStatus("1960-06-15", undefined, 2025)).toBe(true);
  });

  it("senior status — born Dec 31 of cutoff year qualifies", () => {
    // Born 1960-12-31, in 2025 is exactly age 65 → qualifies
    expect(determineSeniorStatus("1960-12-31", undefined, 2025)).toBe(true);
  });

  it("senior status — born Jan 1 after cutoff year does not qualify", () => {
    // Born 1961-01-01, in 2025 is age 64 → not senior
    expect(determineSeniorStatus("1961-01-01", undefined, 2025)).toBe(false);
  });

  it("senior status — non-senior taxpayer with senior spouse qualifies", () => {
    // Taxpayer born 1975, spouse born 1955
    expect(determineSeniorStatus("1975-03-01", "1955-07-01", 2025)).toBe(true);
  });

  it("senior status — neither spouse qualifies", () => {
    expect(determineSeniorStatus("1975-03-01", "1970-06-01", 2025)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countExemptions
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Exemptions", () => {
  it("counts exemptions from taxpayer info", () => {
    expect(countExemptions("single", 0)).toBe(1);
  });

  it("exemptions — MFJ adds spouse", () => {
    expect(countExemptions("married_filing_jointly", 0)).toBe(2);
  });

  it("exemptions — MFJ with dependents", () => {
    expect(countExemptions("married_filing_jointly", 3)).toBe(5);
  });

  it("exemptions — single with dependents", () => {
    expect(countExemptions("single", 2)).toBe(3);
  });

  it("exemptions — head of household no spouse", () => {
    expect(countExemptions("head_of_household", 1)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// determineBothSpousesQualifyingIncome
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Both Spouses Qualifying Income", () => {
  it("determines both spouses qualifying income from W-2s", () => {
    const w2s = [
      makeW2({ accountHolder: "primary", wages: "30000" }),
      makeW2({ accountHolder: "spouse", wages: "25000" }),
    ];
    expect(determineBothSpousesQualifyingIncome("married_filing_jointly", w2s)).toBe(true);
  });

  it("qualifying income — non-MFJ returns false", () => {
    const w2s = [makeW2({ accountHolder: "primary", wages: "30000" })];
    expect(determineBothSpousesQualifyingIncome("single", w2s)).toBe(false);
  });

  it("qualifying income — spouse below $500 threshold", () => {
    const w2s = [
      makeW2({ accountHolder: "primary", wages: "30000" }),
      makeW2({ accountHolder: "spouse", wages: "400" }),
    ];
    expect(determineBothSpousesQualifyingIncome("married_filing_jointly", w2s)).toBe(false);
  });

  it("qualifying income — no accountHolder info defaults false", () => {
    const w2s = [makeW2({ wages: "50000" })];
    expect(determineBothSpousesQualifyingIncome("married_filing_jointly", w2s)).toBe(false);
  });

  it("qualifying income — exactly $500 each qualifies", () => {
    const w2s = [
      makeW2({ accountHolder: "primary", wages: "500" }),
      makeW2({ accountHolder: "spouse", wages: "500" }),
    ];
    expect(determineBothSpousesQualifyingIncome("married_filing_jointly", w2s)).toBe(true);
  });

  it("qualifying income excludes business income deducted on the Ohio Schedule of Adjustments", () => {
    const w2s = [makeW2({ accountHolder: "primary", wages: "200" })];
    const w2gs = [makeW2G({ accountHolder: "spouse", reportableWinnings: "250" })];
    const form1099Gs = [make1099G({ accountHolder: "primary", unemploymentCompensation: "400" })];
    const form1099Necs = [make1099Nec({ accountHolder: "spouse", nonemployeeCompensation: "300" })];
    const form1099Miscs = [make1099Misc({ accountHolder: "primary", otherIncome: "50" })];
    const form1099Rs = [
      make1099R({
        accountHolder: "spouse",
        taxableAmount: "100",
        disabilityPensionBeforeMinimumRetirementAge: true,
        distributionCode: "3",
      }),
    ];

    expect(
      determineBothSpousesQualifyingIncome(
        "married_filing_jointly",
        w2s,
        undefined,
        undefined,
        w2gs,
        form1099Gs,
        form1099Necs,
        form1099Miscs,
        form1099Rs,
      ),
    ).toBe(false);
  });

  it("qualifying income includes only residual business income above the Ohio deduction cap", () => {
    const w2s = [
      makeW2({ accountHolder: "primary", wages: "400" }),
      makeW2({ accountHolder: "spouse", wages: "400" }),
    ];
    const form1099Necs = [
      make1099Nec({ accountHolder: "primary", nonemployeeCompensation: "600" }),
      make1099Nec({ accountHolder: "spouse", nonemployeeCompensation: "600" }),
    ];

    expect(
      determineBothSpousesQualifyingIncome(
        "married_filing_jointly",
        w2s,
        undefined,
        undefined,
        [],
        [],
        form1099Necs,
        [],
        [],
        251200,
        250000,
      ),
    ).toBe(true);
  });

  it("qualifying income excludes rents royalties and retirement distributions", () => {
    const w2s = [];
    const w2gs = [];
    const form1099Gs = [];
    const form1099Necs = [];
    const form1099Miscs = [
      make1099Misc({
        accountHolder: "primary",
        otherIncome: "0",
        rents: "900",
        royalties: "700",
      }),
    ];
    const form1099Rs = [
      make1099R({
        accountHolder: "spouse",
        taxableAmount: "12000",
        disabilityPensionBeforeMinimumRetirementAge: false,
        distributionCode: "7",
      }),
    ];

    expect(
      determineBothSpousesQualifyingIncome(
        "married_filing_jointly",
        w2s,
        undefined,
        undefined,
        w2gs,
        form1099Gs,
        form1099Necs,
        form1099Miscs,
        form1099Rs,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapFilingStatus
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Filing Status", () => {
  it("passes filing status through", () => {
    expect(mapFilingStatus("single")).toBe("single");
    expect(mapFilingStatus("married_filing_jointly")).toBe("married_filing_jointly");
    expect(mapFilingStatus("married_filing_separately")).toBe("married_filing_separately");
    expect(mapFilingStatus("head_of_household")).toBe("head_of_household");
    expect(mapFilingStatus("qualifying_surviving_spouse")).toBe("qualifying_surviving_spouse");
  });

  it("filing status - unsupported status throws", () => {
    expect(() => mapFilingStatus("unknown_status")).toThrow(
      "Ohio input adapter does not support federal filing status: unknown_status",
    );
  });
});

// ---------------------------------------------------------------------------
// buildOhioResidentReturnInput — integration
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — buildOhioResidentReturnInput", () => {
  it("extracts federal AGI from federal result", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult({ agi: new Decimal(75000) });
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(d(result.federalAgi).toNumber()).toBe(75000);
  });

  it("extracts taxable Social Security from federal result", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult({
      socialSecurityBenefitsTaxable: new Decimal(8500),
    });
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(d(result.taxableSocialSecurity!).toNumber()).toBe(8500);
  });

  it("extracts federal EIC from federal result", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult({
      earnedIncomeCredit: new Decimal(2000),
    });
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(d(result.federalEarnedIncomeCredit!).toNumber()).toBe(2000);
  });

  it("extracts federal Form 2441 values from federal result", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult({
      form2441: {
        qualifyingExpenses: new Decimal(3000),
        earnedIncomeLimit: new Decimal(3000),
        creditPercentage: new Decimal(0.2),
        credit: new Decimal(600),
        lines: [],
      },
    });
    const result = buildOhioResidentReturnInput(taxInput, fedResult);

    expect(d(result.federal2441Line9c!).toNumber()).toBe(3000);
    expect(d(result.federal2441Line11!).toNumber()).toBe(600);
  });

  it("builds complete input with Ohio W-2s and overlay", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "1500",
          localTaxWithheld: "200",
          localityName: "2501",
          wages: "60000",
        }),
      ],
      form1099R: [
        make1099R({ taxableAmount: "10000", state: "OH", localTaxWithheld: "45" } as Partial<Form1099R>),
      ],
    });
    const fedResult = makeFederalResult({
      agi: new Decimal(70000),
      earnedIncomeCredit: new Decimal(500),
      socialSecurityBenefitsTaxable: new Decimal(3000),
    });
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      ohio529Contributions: [{ beneficiaryId: "child-a", amount: 2000 }],
      campaignContributions: 50,
    });

    expect(d(result.federalAgi).toNumber()).toBe(70000);
    expect(d(result.ohioWithholding!).toNumber()).toBe(1500);
    expect(d(result.sdWithholding!).toNumber()).toBe(245);
    expect(d(result.retirementIncome!).toNumber()).toBe(10000);
    expect(d(result.federalEarnedIncomeCredit!).toNumber()).toBe(500);
    expect(d(result.taxableSocialSecurity!).toNumber()).toBe(3000);
    expect(result.ohio529Contributions).toHaveLength(1);
    expect(d(result.campaignContributions!).toNumber()).toBe(50);
  });

  it("excludes uniformed services retirement from auto-extracted retirement income when provided in overlay", () => {
    const taxInput = makeTaxInput({
      form1099R: [
        make1099R({ taxableAmount: "24000" }),
      ],
    });
    const fedResult = makeFederalResult();

    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      uniformedServicesRetirement: 18000,
    });

    expect(d(result.retirementIncome!).toNumber()).toBe(6000);
    expect(d(result.uniformedServicesRetirement!).toNumber()).toBe(18000);
  });

  it("builds Ohio withholding from W-2 W-2G and supported 1099 statements", () => {
    const taxInput = makeTaxInput({
      w2s: [makeW2({ state: "OH", stateTaxWithheld: "900" })],
      formW2G: [makeW2G({ state: "OH", stateWithheld: "60" })],
      form1099G: [make1099G({ state: "OH", stateWithheld: "25" })],
      form1099K: [make1099K({ state: "OH", stateWithheld: "15" })],
      form1099R: [make1099R({ state: "OH", stateWithheld: "140" })],
      form1099Nec: [make1099Nec({ state: "OH", stateWithheld: "85" })],
      form1099Misc: [make1099Misc({ state: "OH", stateWithheld: "95" })],
    });
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult);

    expect(d(result.ohioWithholding!).toNumber()).toBe(1320);
  });

  it("auto-derives school districts from official Ohio W-2 locality codes", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          localityName: "2501",
          wages: "42000",
          stateWages: "40000",
        }),
        makeW2({
          state: "OH",
          localityName: "SD 0404",
          wages: "32000",
          stateWages: "30000",
        }),
        makeW2({
          state: "OH",
          localityName: "SD0404",
          wages: "5000",
        }),
        makeW2({
          state: "OH",
          localityName: "SD Geneva Area CSD",
          wages: "6000",
          stateWages: "5500",
        }),
        makeW2({
          state: "OH",
          localityName: "R1234",
          wages: "12000",
          stateWages: "12000",
        }),
        makeW2({
          state: "OH",
          localityName: "0101",
          wages: "7000",
          stateWages: "7000",
        }),
        makeW2({
          state: "PA",
          localityName: "2501",
          wages: "9000",
          stateWages: "9000",
        }),
      ],
    });
    const fedResult = makeFederalResult();

    const result = buildOhioResidentReturnInput(taxInput, fedResult);

    expect(result.schoolDistricts).toHaveLength(2);

    const traditionalDistrict = result.schoolDistricts!.find(
      (district) => district.districtNumber === "2501",
    );
    expect(traditionalDistrict).toBeDefined();
    expect(traditionalDistrict!.taxType).toBe("traditional");
    expect(d(traditionalDistrict!.rate!).toFixed(4)).toBe("0.0075");
    expect(traditionalDistrict!.wages).toBeUndefined();

    const earnedIncomeDistrict = result.schoolDistricts!.find(
      (district) => district.districtNumber === "0404",
    );
    expect(earnedIncomeDistrict).toBeDefined();
    expect(earnedIncomeDistrict!.taxType).toBe("earned_income");
    expect(d(earnedIncomeDistrict!.rate!).toFixed(4)).toBe("0.0125");
    expect(d(earnedIncomeDistrict!.wages!).toNumber()).toBe(40500);
  });

  it("explicit schoolDistricts overlay overrides auto-derived W-2 districts", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({ state: "OH", localityName: "2501", wages: "40000" }),
      ],
    });
    const fedResult = makeFederalResult();
    const schoolDistricts = [
      {
        districtNumber: "3102",
        residencyFactor: "0.5",
        taxType: "traditional" as const,
        rate: "0.0175",
      },
    ];

    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      schoolDistricts,
    });

    expect(result.schoolDistricts).toEqual(schoolDistricts);
  });

  it("overlay school district names resolve to official district metadata", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();

    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      schoolDistricts: [{ districtName: "Bexley CSD" }],
    });

    expect(result.schoolDistricts).toHaveLength(1);
    expect(result.schoolDistricts![0]!.districtNumber).toBe("2501");
    expect(result.schoolDistricts![0]!.taxType).toBe("traditional");
    expect(d(result.schoolDistricts![0]!.rate!).toFixed(4)).toBe("0.0075");
  });

  it("abbreviated school district names resolve through W-2 locality labels and overlay names", () => {
    // W-2 locality label using abbreviated district name (without CSD suffix)
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          localityName: "SD Geneva Area",
          wages: "30000",
          stateWages: "28000",
        }),
      ],
    });
    const fedResult = makeFederalResult();

    const autoResult = buildOhioResidentReturnInput(taxInput, fedResult);
    const earnedIncomeDistrict = autoResult.schoolDistricts?.find(
      (district) => district.districtNumber === "0404",
    );
    expect(earnedIncomeDistrict).toBeDefined();
    expect(earnedIncomeDistrict!.taxType).toBe("earned_income");
    expect(d(earnedIncomeDistrict!.rate!).toFixed(4)).toBe("0.0125");

    // Overlay entry using abbreviated district name (without CSD suffix)
    const overlayResult = buildOhioResidentReturnInput(taxInput, fedResult, {
      schoolDistricts: [{ districtName: "Geneva Area" }],
    });
    expect(overlayResult.schoolDistricts).toHaveLength(1);
    expect(overlayResult.schoolDistricts![0]!.districtNumber).toBe("0404");
    expect(overlayResult.schoolDistricts![0]!.taxType).toBe("earned_income");
    expect(d(overlayResult.schoolDistricts![0]!.rate!).toFixed(4)).toBe("0.0125");
  });

  it("passes through Ohio 529 carryforward overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      ohio529Carryforwards: [{ beneficiaryId: "child-a", amount: 1750 }],
    });

    expect(result.ohio529Carryforwards).toHaveLength(1);
    expect(d(result.ohio529Carryforwards![0]!.amount).toNumber()).toBe(1750);
  });

  it("passes through STABLE contribution overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      stableContributions: [{ beneficiaryId: "beneficiary-a", amount: 2400 }],
      stableCarryforwards: [{ beneficiaryId: "beneficiary-a", amount: 900 }],
    });

    expect(result.stableContributions).toHaveLength(1);
    expect(d(result.stableContributions![0]!.amount).toNumber()).toBe(2400);
    expect(result.stableCarryforwards).toHaveLength(1);
    expect(d(result.stableCarryforwards![0]!.amount).toNumber()).toBe(900);
  });

  it("passes through medical savings account overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      medicalSavingsAccountTaxpayerContributions: 4000,
      medicalSavingsAccountSpouseContributions: 2500,
      medicalSavingsAccountEarnings: 125,
      medicalSavingsAccountNonmedicalWithdrawals: 300,
    });

    expect(d(result.medicalSavingsAccountTaxpayerContributions!).toNumber()).toBe(4000);
    expect(d(result.medicalSavingsAccountSpouseContributions!).toNumber()).toBe(2500);
    expect(d(result.medicalSavingsAccountEarnings!).toNumber()).toBe(125);
    expect(d(result.medicalSavingsAccountNonmedicalWithdrawals!).toNumber()).toBe(300);
  });

  it("passes through medical and health care expense overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility: 800,
      medicalLongTermCareInsurancePremiums: 250,
      medicalInsurancePremiumsDuringMedicareOrEmployerEligibility: 1200,
      medicalCareExpenses: 3400,
    });

    expect(d(result.medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility!).toNumber()).toBe(800);
    expect(d(result.medicalLongTermCareInsurancePremiums!).toNumber()).toBe(250);
    expect(d(result.medicalInsurancePremiumsDuringMedicareOrEmployerEligibility!).toNumber()).toBe(1200);
    expect(d(result.medicalCareExpenses!).toNumber()).toBe(3400);
  });

  it("passes through qualified organ donor expense overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      qualifiedOrganDonorExpenses: [
        { donorId: "taxpayer", amount: 4800 },
        { donorId: "spouse", amount: 1250 },
      ],
    });

    expect(result.qualifiedOrganDonorExpenses).toHaveLength(2);
    expect(d(result.qualifiedOrganDonorExpenses![0]!.amount).toNumber()).toBe(4800);
    expect(result.qualifiedOrganDonorExpenses![1]!.donorId).toBe("spouse");
  });

  it("passes through Ohio Homebuyer Plus overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      homebuyerPlusAccounts: [
        { contributorId: "taxpayer", accountId: "acct-1", amount: 4200 },
      ],
    });

    expect(result.homebuyerPlusAccounts).toHaveLength(1);
    expect(d(result.homebuyerPlusAccounts![0]!.amount).toNumber()).toBe(4200);
  });

  it("passes through pregnancy resource center and Ohio educator expense overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      pregnancyResourceCenterContributions: [
        { contributorId: "taxpayer", amount: 700, contributionDate: "2025-10-15" },
      ],
      ohioEducatorExpenses: [
        { educatorId: "teacher-1", amount: 325 },
      ],
    });

    expect(result.pregnancyResourceCenterContributions).toHaveLength(1);
    expect(d(result.pregnancyResourceCenterContributions![0]!.amount).toNumber()).toBe(700);
    expect(result.pregnancyResourceCenterContributions![0]!.contributionDate).toBe("2025-10-15");
    expect(result.ohioEducatorExpenses).toHaveLength(1);
    expect(d(result.ohioEducatorExpenses![0]!.amount).toNumber()).toBe(325);
  });

  it("passes through college grant, rural practice, and adopted student overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      collegeGrantRoomAndBoardEntries: [
        {
          recipientId: "student-1",
          grantType: "federal_pell_grant",
          amountIncludedInFederalAgi: 1800,
          qualifyingRoomAndBoardExpenses: 1500,
        },
      ],
      ruralPracticeIncentiveRepayments: 9000,
      adoptedStudentGrantPayments: 2500,
    });

    expect(result.collegeGrantRoomAndBoardEntries).toHaveLength(1);
    expect(
      d(result.collegeGrantRoomAndBoardEntries![0]!.amountIncludedInFederalAgi).toNumber(),
    ).toBe(1800);
    expect(result.collegeGrantRoomAndBoardEntries![0]!.grantType).toBe("federal_pell_grant");
    expect(d(result.ruralPracticeIncentiveRepayments!).toNumber()).toBe(9000);
    expect(d(result.adoptedStudentGrantPayments!).toNumber()).toBe(2500);
  });

  it("passes through home school credit overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      homeSchoolExpenses: 325,
      homeSchoolQualifyingStudents: 2,
    });

    expect(d(result.homeSchoolExpenses!).toNumber()).toBe(325);
    expect(result.homeSchoolQualifyingStudents).toBe(2);
  });

  it("passes through education credit overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      scholarshipDonations: 700,
      noncharteredSchoolTuition: 1200,
    });

    expect(d(result.scholarshipDonations!).toNumber()).toBe(700);
    expect(d(result.noncharteredSchoolTuition!).toNumber()).toBe(1200);
  });

  it("federal Form 2441 overlay overrides auto-extracted values", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult({
      form2441: {
        qualifyingExpenses: new Decimal(3000),
        earnedIncomeLimit: new Decimal(3000),
        creditPercentage: new Decimal(0.2),
        credit: new Decimal(600),
        lines: [],
      },
    });
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      federal2441Line9c: 2200,
      federal2441Line11: 440,
    });

    expect(d(result.federal2441Line9c!).toNumber()).toBe(2200);
    expect(d(result.federal2441Line11!).toNumber()).toBe(440);
  });

  it("passes through IT SD 2210 overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      computeUnderpaymentPenalty: true,
      priorYearTaxLiability: 1800,
      priorYearTimelyFiled: false,
      estimatedPaymentSchedule: [
        { paymentDate: "2026-01-10", amount: 200 },
        { paymentDate: "2026-01-15", amount: 150 },
      ],
    });

    expect(result.computeUnderpaymentPenalty).toBe(true);
    expect(d(result.priorYearTaxLiability!).toNumber()).toBe(1800);
    expect(result.priorYearTimelyFiled).toBe(false);
    expect(result.estimatedPaymentSchedule).toEqual([
      { paymentDate: "2026-01-10", amount: 200 },
      { paymentDate: "2026-01-15", amount: 150 },
    ]);
  });

  it("passes through school district IT SD 2210 overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      sdUnderpaymentPenalty: 35,
      sdEstimatedPayments: 120,
      sdPriorYearTaxLiability: 400,
      sdPriorYearTimelyFiled: false,
    });

    expect(d(result.sdUnderpaymentPenalty!).toNumber()).toBe(35);
    expect(d(result.sdEstimatedPayments!).toNumber()).toBe(120);
    expect(d(result.sdPriorYearTaxLiability!).toNumber()).toBe(400);
    expect(result.sdPriorYearTimelyFiled).toBe(false);
  });

  it("passes through displaced worker worksheet overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      displacedWorkerRecipients: [
        { expenses: 1200, priorYearCredit: 0 },
        { expenses: 800, priorYearCredit: 100 },
      ],
    });

    expect(result.displacedWorkerRecipients).toEqual([
      { expenses: 1200, priorYearCredit: 0 },
      { expenses: 800, priorYearCredit: 100 },
    ]);
  });

  it("passes through lump sum distribution worksheet overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      lumpSumDistributionRecipientAges: [70, 68],
    });

    expect(result.lumpSumDistributionRecipientAges).toEqual([70, 68]);
  });

  it("passes through lump sum retirement worksheet overlay fields", () => {
    const taxInput = makeTaxInput();
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      lumpSumRetirementRecipients: [
        { age: 65, retirementIncome: 40000 },
        { age: 70, retirementIncome: 32000 },
      ],
    });

    expect(result.lumpSumRetirementRecipients).toEqual([
      { age: 65, retirementIncome: 40000 },
      { age: 70, retirementIncome: 32000 },
    ]);
  });

  it("overlay overrides take precedence over extracted values", () => {
    const taxInput = makeTaxInput({
      w2s: [makeW2({ state: "OH", stateTaxWithheld: "1500" })],
    });
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      ohioWithholdingOverride: 9999,
      retirementIncomeOverride: 5555,
      isSeniorOverride: true,
      exemptionsOverride: 7,
    });

    expect(d(result.ohioWithholding!).toNumber()).toBe(9999);
    expect(d(result.retirementIncome!).toNumber()).toBe(5555);
    expect(result.isSenior).toBe(true);
    expect(result.exemptions).toBe(7);
  });

  it("qualifying income overlay overrides W-2 proxy", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Casey",
          lastName: "Joint",
          ssn: "101-10-1001",
          dateOfBirth: "1986-02-14",
        },
        spouse: {
          firstName: "Morgan",
          lastName: "Joint",
          ssn: "202-20-2002",
          dateOfBirth: "1987-07-09",
        },
        address: { street: "10 High", city: "Columbus", state: "OH", zip: "43215" },
        dependents: [],
      },
      w2s: [
        makeW2({ accountHolder: "primary", wages: "30000" }),
        makeW2({ accountHolder: "spouse", wages: "30000" }),
      ],
    });
    const fedResult = makeFederalResult({ filingStatus: "married_filing_jointly" });

    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      primaryQualifyingIncome: 800,
      spouseQualifyingIncome: 400,
    });

    expect(d(result.primaryQualifyingIncome!).toNumber()).toBe(800);
    expect(d(result.spouseQualifyingIncome!).toNumber()).toBe(400);
    expect(result.bothSpousesHaveQualifyingIncome).toBe(false);
  });

  it("derives spouse-level qualifying income amounts from supported federal documents after excluding business income", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Casey",
          lastName: "Joint",
          ssn: "101-10-1001",
          dateOfBirth: "1986-02-14",
        },
        spouse: {
          firstName: "Morgan",
          lastName: "Joint",
          ssn: "202-20-2002",
          dateOfBirth: "1987-07-09",
        },
        address: { street: "10 High", city: "Columbus", state: "OH", zip: "43215" },
        dependents: [],
      },
      w2s: [makeW2({ accountHolder: "primary", wages: "200" })],
      formW2G: [makeW2G({ accountHolder: "spouse", reportableWinnings: "250" })],
      form1099G: [make1099G({ accountHolder: "primary", unemploymentCompensation: "400" })],
      form1099Nec: [make1099Nec({ accountHolder: "spouse", nonemployeeCompensation: "300" })],
      form1099Misc: [make1099Misc({ accountHolder: "primary", otherIncome: "50" })],
      form1099R: [
        make1099R({
          accountHolder: "spouse",
          taxableAmount: "100",
          disabilityPensionBeforeMinimumRetirementAge: true,
          distributionCode: "3",
        }),
      ],
    });
    const fedResult = makeFederalResult({ filingStatus: "married_filing_jointly" });

    const result = buildOhioResidentReturnInput(taxInput, fedResult);

    expect(d(result.primaryQualifyingIncome!).toNumber()).toBe(650);
    expect(d(result.spouseQualifyingIncome!).toNumber()).toBe(350);
    expect(result.bothSpousesHaveQualifyingIncome).toBe(false);
  });

  it("derives spouse-level qualifying income amounts including residual business income above the Ohio deduction cap", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Casey",
          lastName: "Joint",
          ssn: "101-10-1001",
          dateOfBirth: "1986-02-14",
        },
        spouse: {
          firstName: "Morgan",
          lastName: "Joint",
          ssn: "202-20-2002",
          dateOfBirth: "1987-07-09",
        },
        address: { street: "10 High", city: "Columbus", state: "OH", zip: "43215" },
        dependents: [],
      },
      w2s: [
        makeW2({ accountHolder: "primary", wages: "400" }),
        makeW2({ accountHolder: "spouse", wages: "400" }),
      ],
      form1099Nec: [
        make1099Nec({ accountHolder: "primary", nonemployeeCompensation: "600" }),
        make1099Nec({ accountHolder: "spouse", nonemployeeCompensation: "600" }),
      ],
    });
    const fedResult = makeFederalResult({ filingStatus: "married_filing_jointly" });

    const result = buildOhioResidentReturnInput(taxInput, fedResult, {
      qualifyingBusinessIncome: 251200,
    });

    expect(d(result.primaryQualifyingIncome!).toNumber()).toBe(1000);
    expect(d(result.spouseQualifyingIncome!).toNumber()).toBe(1000);
    expect(result.bothSpousesHaveQualifyingIncome).toBe(true);
  });

  it("senior status extracted from taxpayer primary dateOfBirth", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Bob",
          lastName: "Smith",
          ssn: "111-22-3333",
          dateOfBirth: "1958-03-15", // age 67 in 2025 → senior
        },
        address: { street: "456 Oak", city: "Akron", state: "OH", zip: "44301" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(result.isSenior).toBe(true);
  });

  it("non-senior taxpayer correctly identified from primary dateOfBirth", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Young",
          lastName: "Earner",
          ssn: "222-33-4444",
          dateOfBirth: "1990-06-01", // age 35 in 2025 → not senior
        },
        address: { street: "789 Elm", city: "Toledo", state: "OH", zip: "43601" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(result.isSenior).toBe(false);
  });

  it("MFJ spouse dateOfBirth triggers senior status", () => {
    const taxInput = makeTaxInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Young",
          lastName: "Spouse",
          ssn: "333-44-5555",
          dateOfBirth: "1985-01-01", // age 40 → not senior
        },
        spouse: {
          firstName: "Elder",
          lastName: "Spouse",
          ssn: "444-55-6666",
          dateOfBirth: "1955-12-31", // age 70 → senior
        },
        address: { street: "101 Pine", city: "Dayton", state: "OH", zip: "45401" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult({ filingStatus: "married_filing_jointly" });
    const result = buildOhioResidentReturnInput(taxInput, fedResult);
    expect(result.isSenior).toBe(true);
    expect(result.exemptions).toBe(2); // taxpayer + spouse
  });
});

// ---------------------------------------------------------------------------
// End-to-end: adapter → full Ohio return pipeline
// ---------------------------------------------------------------------------

import { calculateOhioResidentReturn } from "@/engine/state/oh-return.js";

describe("Ohio Input Adapter → Full Return Pipeline", () => {
  it("single W-2 filer $65K income — adapter through complete return", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "1800",
          localTaxWithheld: "0",
          wages: "65000",
          accountHolder: "primary",
        }),
      ],
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Jane",
          lastName: "Worker",
          ssn: "123-45-6789",
          dateOfBirth: "1990-06-15",
        },
        address: { street: "123 Main St", city: "Columbus", state: "OH", zip: "43215" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult({
      agi: new Decimal(65000),
      earnedIncomeCredit: new Decimal(0),
    });

    const adapterOutput = buildOhioResidentReturnInput(taxInput, fedResult);
    const result = calculateOhioResidentReturn(adapterOutput);

    // Verify adapter extraction
    expect(d(adapterOutput.federalAgi).toNumber()).toBe(65000);
    expect(d(adapterOutput.ohioWithholding!).toNumber()).toBe(1800);
    expect(adapterOutput.exemptions).toBe(1);
    expect(adapterOutput.isSenior).toBe(false);

    // Verify full return computation
    expect(result.it1040.line1_federalAgi.toNumber()).toBe(65000);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(65000); // no adjustments
    // MAGI = 65000 (no business deduction), exemption tier: $40,001-$80,000 → $2,150
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(2150);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(2150); // 1 × $2,150
    // Taxable income = 65000 - 2150 = 62850
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(62850);
    // Nonbusiness tax: $342 + 2.75% × (62850 - 26050) = $342 + 2.75% × 36800
    //   = $342 + $1,012 = $1,354
    expect(result.it1040.line8a_nonbusinessTax.toNumber()).toBe(1354);
    // Withholding $1800 > tax $1354 → overpayment
    expect(result.it1040.line14_ohioWithholding.toNumber()).toBe(1800);
    expect(result.it1040.line23_overpayment.toNumber()).toBe(446);
    expect(result.it1040.line26_refund.toNumber()).toBe(446);
    expect(result.sd100).toBeNull(); // no school districts
  });

  it("MFJ retiree couple with Social Security, 1099-R, and senior credit", () => {
    const taxInput = makeTaxInput({
      w2s: [],
      form1099R: [
        make1099R({ taxableAmount: "24000", payer: "State Teachers Retirement" }),
        make1099R({ taxableAmount: "6000", payer: "Fidelity IRA" }),
      ],
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Robert",
          lastName: "Retiree",
          ssn: "555-66-7777",
          dateOfBirth: "1955-04-20", // age 70 → senior
        },
        spouse: {
          firstName: "Mary",
          lastName: "Retiree",
          ssn: "666-77-8888",
          dateOfBirth: "1957-09-10", // age 68 → senior
        },
        address: { street: "200 Oak Ln", city: "Cincinnati", state: "OH", zip: "45201" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult({
      filingStatus: "married_filing_jointly",
      agi: new Decimal(48000), // 24000+6000 pension + 18000 SS taxable
      socialSecurityBenefitsTaxable: new Decimal(18000),
      earnedIncomeCredit: new Decimal(0),
    });

    const adapterOutput = buildOhioResidentReturnInput(taxInput, fedResult);
    const result = calculateOhioResidentReturn(adapterOutput);

    // Adapter extractions
    expect(adapterOutput.isSenior).toBe(true);
    expect(adapterOutput.exemptions).toBe(2); // taxpayer + spouse
    expect(d(adapterOutput.retirementIncome!).toNumber()).toBe(30000); // 24000 + 6000
    expect(d(adapterOutput.taxableSocialSecurity!).toNumber()).toBe(18000);

    // Ohio return: Social Security deducted on Schedule of Adjustments
    expect(result.scheduleOfAdjustments.line17_socialSecurityDeduction.toNumber()).toBe(18000);
    // Ohio AGI = 48000 - 18000 = 30000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(30000);
    // MAGI = 30000 (no business deduction), exemption tier: ≤ $40,000 → $2,400
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(2400);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(4800); // 2 × $2,400

    // Taxable income = max(0, 30000 - 4800) = 25200
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(25200);
    // All in the 0% bracket (≤ $26,050) → $0 tax
    expect(result.it1040.line8a_nonbusinessTax.toNumber()).toBe(0);
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);

    // Credits: retirement credit = $200 (income > $8000), senior = $50
    // But tax is $0, so credits are capped at $0
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(200);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(0); // capped at $0 tax
  });

  it("auto-derived school district locality codes feed SD 100 without a manual overlay", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "1800",
          localTaxWithheld: "250",
          localityName: "SD 2501",
          wages: "65000",
          stateWages: "65000",
          accountHolder: "primary",
        }),
      ],
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Jane",
          lastName: "District",
          ssn: "123-45-6789",
          dateOfBirth: "1990-06-15",
        },
        address: { street: "123 Main St", city: "Bexley", state: "OH", zip: "43209" },
        dependents: [],
      },
    });
    const fedResult = makeFederalResult({
      agi: new Decimal(65000),
      earnedIncomeCredit: new Decimal(0),
    });

    const adapterOutput = buildOhioResidentReturnInput(taxInput, fedResult);
    const result = calculateOhioResidentReturn(adapterOutput);

    expect(adapterOutput.schoolDistricts).toHaveLength(1);
    expect(adapterOutput.schoolDistricts![0]!.districtNumber).toBe("2501");
    expect(adapterOutput.schoolDistricts![0]!.taxType).toBe("traditional");
    expect(d(adapterOutput.schoolDistricts![0]!.rate!).toFixed(4)).toBe("0.0075");

    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.districtDetails).toHaveLength(1);
    expect(result.sd100!.districtDetails[0]!.districtNumber).toBe("2501");
    expect(result.sd100!.line11_sdWithholding.toNumber()).toBe(250);
  });

  it("MFJ family with 529, other-state income, school district — full pipeline", () => {
    const taxInput = makeTaxInput({
      w2s: [
        makeW2({
          state: "OH",
          stateTaxWithheld: "3000",
          localTaxWithheld: "500",
          localityName: "3102",
          wages: "90000",
          accountHolder: "primary",
        }),
        makeW2({
          state: "OH",
          stateTaxWithheld: "1200",
          localTaxWithheld: "200",
          localityName: "3102",
          wages: "40000",
          accountHolder: "spouse",
        }),
        makeW2({
          state: "KY",
          stateTaxWithheld: "800",
          wages: "15000", // earned while working in KY
          accountHolder: "primary",
        }),
      ],
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: {
          firstName: "Tom",
          lastName: "Family",
          ssn: "777-88-9999",
          dateOfBirth: "1985-03-01",
        },
        spouse: {
          firstName: "Sarah",
          lastName: "Family",
          ssn: "888-99-0000",
          dateOfBirth: "1987-07-15",
        },
        address: { street: "500 Maple Dr", city: "Mason", state: "OH", zip: "45040" },
        dependents: [
          {
            firstName: "Kid1", lastName: "Family", ssn: "111-00-1111",
            relationship: "son", dateOfBirth: "2015-01-01",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
          {
            firstName: "Kid2", lastName: "Family", ssn: "222-00-2222",
            relationship: "daughter", dateOfBirth: "2018-06-01",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
        ],
      },
    });
    const fedResult = makeFederalResult({
      filingStatus: "married_filing_jointly",
      agi: new Decimal(145000),
      earnedIncomeCredit: new Decimal(0),
    });

    const adapterOutput = buildOhioResidentReturnInput(taxInput, fedResult, {
      ohio529Contributions: [
        { beneficiaryId: "kid-1", amount: 4000 },
        { beneficiaryId: "kid-2", amount: 3000 },
      ],
      otherStateTaxes: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 15000, taxPaid: 750 },
      ],
      schoolDistricts: [
        {
          districtNumber: "3102",
          taxType: "traditional" as const,
          rate: "0.0175",
        },
      ],
    });

    const result = calculateOhioResidentReturn(adapterOutput);

    // Adapter: 529 deduction = $4,000 + $3,000 = $7,000
    expect(result.scheduleOfAdjustments.line22_ohio529Deduction.toNumber()).toBe(7000);
    // Ohio AGI = 145000 - 7000 = 138000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(138000);

    // Exemptions: 4 (taxpayer + spouse + 2 kids), MAGI = 138000 → $1,900 each
    expect(adapterOutput.exemptions).toBe(4);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(7600); // 4 × $1,900

    // Taxable income = 138000 - 7600 = 130400
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(130400);
    // Tax bracket 3: $2,394.32 + 3.125% × (130400 - 100000)
    // = $2,394.32 + 3.125% × 30400 = $2,394.32 + $950 = $3,344.32 → $3,344
    expect(result.it1040.line8a_nonbusinessTax.toNumber()).toBe(3344);

    // Joint filing credit: MAGI less exemptions = 138000 - 7600 = 130400 (> $75,000 → 5%)
    // Both spouses have $500+ → eligible
    expect(adapterOutput.bothSpousesHaveQualifyingIncome).toBe(true);

    // Resident credit computed from KY taxes
    expect(result.residentCredit).not.toBeNull();
    expect(result.residentCredit!.stateDetails).toHaveLength(1);
    expect(result.residentCredit!.stateDetails[0]!.stateCode).toBe("KY");

    // Ohio withholding = $3000 + $1200 (excludes KY W-2)
    expect(result.it1040.line14_ohioWithholding.toNumber()).toBe(4200);

    // SD 100 computed for Mason district
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.districtDetails).toHaveLength(1);
    expect(result.sd100!.districtDetails[0]!.districtNumber).toBe("3102");
    expect(result.sd100!.line11_sdWithholding.toNumber()).toBe(700); // 500 + 200

    // Combined audit trail includes all modules
    expect(result.lines.length).toBeGreaterThan(0);
    const formNames = new Set(result.lines.map((l) => l.form));
    expect(formNames.has("OH-SCHEDULE-ADJ")).toBe(true);
    expect(formNames.has("OH-IT-1040")).toBe(true);
    expect(formNames.has("OH-SCHEDULE-CREDITS")).toBe(true);
    expect(formNames.has("OH-RESIDENT-CREDIT")).toBe(true);
    expect(formNames.has("OH-SD-100")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractQualifyingBusinessIncome
// ---------------------------------------------------------------------------

function makeK1(overrides: Partial<ScheduleK1> = {}): ScheduleK1 {
  return {
    partnershipName: "Test LLC",
    partnershipEIN: "99-8765432",
    ordinaryIncome: new Decimal(0),
    isPassiveActivity: false,
    isPubliclyTradedPartnership: false,
    ptpFullyDisposedInTaxableTransaction: false,
    ...overrides,
  } as ScheduleK1;
}

describe("Ohio Input Adapter — Qualifying Business Income Extraction", () => {
  it("extracts Schedule C net profit from federal result", () => {
    const fed = makeFederalResult({
      scheduleC: {
        grossReceipts: d(100000),
        returnsAndAllowances: d(0),
        costOfGoodsSold: d(0),
        grossIncome: d(100000),
        grossProfit: d(100000),
        depreciationAndSection179Deduction: d(0),
        expenseBreakdown: {},
        totalExpenses: d(20000),
        tentativeProfit: d(80000),
        homeOfficeDeduction: d(0),
        netProfit: d(80000),
        lines: [],
      },
    });
    const result = extractQualifyingBusinessIncome(fed, []);
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(80000);
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(80000);
  });

  it("extracts Schedule F net farm profit from federal result", () => {
    const fed = makeFederalResult({
      scheduleF: {
        netPurchasedLivestock: d(0),
        grossFarmIncome: d(150000),
        conservationDeduction: d(0),
        conservationCarryforward: d(0),
        totalExpenses: d(90000),
        expenseBreakdown: {},
        netFarmProfit: d(60000),
        lines: [],
      },
    });
    const result = extractQualifyingBusinessIncome(fed, []);
    expect(result.line2_scheduleFNetFarmProfit.toNumber()).toBe(60000);
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(60000);
  });

  it("extracts K-1 guaranteed payments from all K-1s", () => {
    const k1s = [
      makeK1({ partnershipName: "LLC A", guaranteedPayments: d(30000) }),
      makeK1({ partnershipName: "LLC B", guaranteedPayments: d(20000) }),
    ];
    const result = extractQualifyingBusinessIncome(makeFederalResult(), k1s);
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(50000);
  });

  it("extracts K-1 ordinary income only from active entities", () => {
    const k1s = [
      makeK1({ partnershipName: "Active", ordinaryIncome: d(100000), isPassiveActivity: false }),
      makeK1({ partnershipName: "Passive", ordinaryIncome: d(50000), isPassiveActivity: true }),
    ];
    const result = extractQualifyingBusinessIncome(makeFederalResult(), k1s);
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(100000);
  });

  it("guaranteed payments qualify even from passive K-1s", () => {
    const k1s = [
      makeK1({ partnershipName: "Passive LP", guaranteedPayments: d(25000), ordinaryIncome: d(80000), isPassiveActivity: true }),
    ];
    const result = extractQualifyingBusinessIncome(makeFederalResult(), k1s);
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(25000);
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(0);
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(25000);
  });

  it("combines all sources: Schedule C, F, K-1, and other", () => {
    const fed = makeFederalResult({
      scheduleC: { netProfit: d(40000) } as TaxReturnResult["scheduleC"],
      scheduleF: { netFarmProfit: d(20000) } as TaxReturnResult["scheduleF"],
    });
    const k1s = [
      makeK1({ partnershipName: "LLC", guaranteedPayments: d(10000), ordinaryIncome: d(30000) }),
    ];
    const result = extractQualifyingBusinessIncome(fed, k1s, 5000);
    // 40000 + 20000 + 10000 + 30000 + 5000 = 105000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(105000);
  });

  it("no business income sources produces zero", () => {
    const result = extractQualifyingBusinessIncome(makeFederalResult(), []);
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildOhioResidentReturnInput — qualifying business income auto-extraction
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Business Income via IT BUS in Full Adapter", () => {
  it("auto-extracts qualifying business income when overlay does not provide it", () => {
    const fed = makeFederalResult({
      scheduleC: { netProfit: d(95000) } as TaxReturnResult["scheduleC"],
    });
    const taxInput = makeTaxInput();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    // Should auto-extract $95,000 from Schedule C
    expect(d(result.qualifyingBusinessIncome).toNumber()).toBe(95000);
  });

  it("overlay qualifyingBusinessIncome overrides auto-extraction", () => {
    const fed = makeFederalResult({
      scheduleC: { netProfit: d(95000) } as TaxReturnResult["scheduleC"],
    });
    const taxInput = makeTaxInput();
    const result = buildOhioResidentReturnInput(taxInput, fed, {
      qualifyingBusinessIncome: 50000, // manual override
    });
    expect(d(result.qualifyingBusinessIncome).toNumber()).toBe(50000);
  });

  it("auto-extracts K-1 business income from scheduleK1 in tax input", () => {
    const k1s = [
      makeK1({ partnershipName: "Law Firm", guaranteedPayments: d(120000), ordinaryIncome: d(80000) }),
    ];
    const taxInput = makeTaxInput({ scheduleK1: k1s });
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    // GP: 120000, active ordinary: 80000 → total 200000
    expect(d(result.qualifyingBusinessIncome).toNumber()).toBe(200000);
  });

  it("otherBusinessIncome in overlay adds to auto-extracted total", () => {
    const fed = makeFederalResult({
      scheduleC: { netProfit: d(60000) } as TaxReturnResult["scheduleC"],
    });
    const taxInput = makeTaxInput();
    const result = buildOhioResidentReturnInput(taxInput, fed, {
      otherBusinessIncome: 10000,
    });
    // 60000 (Sch C) + 10000 (other) = 70000
    expect(d(result.qualifyingBusinessIncome).toNumber()).toBe(70000);
  });

  it("zero business income when no federal sources and no overlay", () => {
    const taxInput = makeTaxInput();
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.qualifyingBusinessIncome).toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper factories for 1099-INT and 1099-G
// ---------------------------------------------------------------------------

function make1099Int(overrides: Partial<Form1099Int> = {}): Form1099Int {
  return {
    payer: "Big Bank",
    interestIncome: "500",
    ...overrides,
  };
}

function make1099G(overrides: Partial<Form1099G> = {}): Form1099G {
  return {
    payer: "State of Ohio",
    unemploymentCompensation: "0",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractFederalInterestExemptFromOhio
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Federal Interest Exempt from Ohio", () => {
  it("extracts federal interest exempt from Ohio from 1099-INTs", () => {
    const forms = [
      make1099Int({ payer: "Treasury Direct", usSavingsBondInterest: "1200" }),
      make1099Int({ payer: "Fidelity", usSavingsBondInterest: "800" }),
    ];
    expect(extractFederalInterestExemptFromOhio(forms).toNumber()).toBe(2000);
  });

  it("federal interest — no 1099-INTs yields zero", () => {
    expect(extractFederalInterestExemptFromOhio([]).toNumber()).toBe(0);
  });

  it("federal interest — 1099-INT with no usSavingsBondInterest excluded", () => {
    const forms = [make1099Int({ interestIncome: "5000" })]; // no box 3
    expect(extractFederalInterestExemptFromOhio(forms).toNumber()).toBe(0);
  });

  it("federal interest — mixed 1099-INTs with and without box 3", () => {
    const forms = [
      make1099Int({ usSavingsBondInterest: "350" }),
      make1099Int({ interestIncome: "1000" }), // no box 3
      make1099Int({ usSavingsBondInterest: "150" }),
    ];
    expect(extractFederalInterestExemptFromOhio(forms).toNumber()).toBe(500);
  });

  it("federal interest — single 1099-INT with large Treasury interest", () => {
    const forms = [make1099Int({ usSavingsBondInterest: "25000.50" })];
    expect(extractFederalInterestExemptFromOhio(forms).toNumber()).toBe(25000.50);
  });
});

// ---------------------------------------------------------------------------
// extractStateMunicipalTaxRefunds
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — State Municipal Tax Refunds", () => {
  it("extracts state municipal tax refunds from 1099-Gs", () => {
    const forms = [
      make1099G({ payer: "State of Ohio", stateOrLocalTaxRefund: "500", state: "OH" }),
      make1099G({ payer: "State of PA", stateOrLocalTaxRefund: "300", state: "PA" }),
    ];
    expect(extractStateMunicipalTaxRefunds(forms).toNumber()).toBe(800);
  });

  it("state refunds — no 1099-Gs yields zero", () => {
    expect(extractStateMunicipalTaxRefunds([]).toNumber()).toBe(0);
  });

  it("state refunds — 1099-G with no stateOrLocalTaxRefund excluded", () => {
    const forms = [make1099G({ unemploymentCompensation: "5000" })]; // no box 2
    expect(extractStateMunicipalTaxRefunds(forms).toNumber()).toBe(0);
  });

  it("state refunds — multiple 1099-Gs from different states summed", () => {
    const forms = [
      make1099G({ stateOrLocalTaxRefund: "200", state: "OH" }),
      make1099G({ stateOrLocalTaxRefund: "450", state: "KY" }),
      make1099G({ stateOrLocalTaxRefund: "150", state: "IN" }),
    ];
    expect(extractStateMunicipalTaxRefunds(forms).toNumber()).toBe(800);
  });

  it("state refunds — single large refund", () => {
    const forms = [make1099G({ stateOrLocalTaxRefund: "12345.67" })];
    expect(extractStateMunicipalTaxRefunds(forms).toNumber()).toBe(12345.67);
  });
});

// ---------------------------------------------------------------------------
// buildOhioResidentReturnInput — Federal Interest & Tax Refund Auto-Extraction
// ---------------------------------------------------------------------------

describe("Ohio Input Adapter — Federal Interest & Tax Refund Auto-Extraction in Full Adapter", () => {
  it("auto-extracts federal interest exempt from Ohio from 1099-INTs", () => {
    const form1099Int = [
      make1099Int({ usSavingsBondInterest: "3000" }),
      make1099Int({ usSavingsBondInterest: "1500" }),
    ];
    const taxInput = makeTaxInput({ form1099Int } as Partial<TaxYearInput>);
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.federalInterestExemptFromOhio).toNumber()).toBe(4500);
  });

  it("overlay federalInterestExemptFromOhio overrides auto-extraction", () => {
    const form1099Int = [make1099Int({ usSavingsBondInterest: "3000" })];
    const taxInput = makeTaxInput({ form1099Int } as Partial<TaxYearInput>);
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {
      federalInterestExemptFromOhio: 999,
    });
    expect(d(result.federalInterestExemptFromOhio).toNumber()).toBe(999);
  });

  it("zero federal interest when no 1099-INTs and no overlay", () => {
    const taxInput = makeTaxInput();
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.federalInterestExemptFromOhio).toNumber()).toBe(0);
  });

  it("auto-extracts state municipal tax refunds from 1099-Gs", () => {
    const form1099G = [
      make1099G({ stateOrLocalTaxRefund: "750", state: "OH" }),
      make1099G({ stateOrLocalTaxRefund: "250", state: "PA" }),
    ];
    const taxInput = makeTaxInput({ form1099G } as Partial<TaxYearInput>);
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.stateMunicipalTaxRefunds).toNumber()).toBe(1000);
  });

  it("overlay stateMunicipalTaxRefunds overrides auto-extraction", () => {
    const form1099G = [make1099G({ stateOrLocalTaxRefund: "750" })];
    const taxInput = makeTaxInput({ form1099G } as Partial<TaxYearInput>);
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {
      stateMunicipalTaxRefunds: 200,
    });
    expect(d(result.stateMunicipalTaxRefunds).toNumber()).toBe(200);
  });

  it("zero state refunds when no 1099-Gs and no overlay", () => {
    const taxInput = makeTaxInput();
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.stateMunicipalTaxRefunds).toNumber()).toBe(0);
  });

  it("1099-G with unemployment only (no box 2) yields zero refunds", () => {
    const form1099G = [make1099G({ unemploymentCompensation: "8000" })];
    const taxInput = makeTaxInput({ form1099G } as Partial<TaxYearInput>);
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {});
    expect(d(result.stateMunicipalTaxRefunds).toNumber()).toBe(0);
  });

  it("passes grape production qualifying property cost through the Ohio overlay", () => {
    const taxInput = makeTaxInput();
    const fed = makeFederalResult();
    const result = buildOhioResidentReturnInput(taxInput, fed, {
      grapeProductionQualifyingPropertyCost: 12345,
    });

    expect(d(result.grapeProductionQualifyingPropertyCost).toNumber()).toBe(12345);
  });
});
