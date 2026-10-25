import { energySource, sourceImprovement, sourceCleanProperty } from "../fixtures/energy-source";
import { completeCareSource } from "./care-source-fixture";
import { completeRentalSource, completeNecSource, completeBusinessSection, completeBusinessExpenses, completeMortgageSource, completeRetirementSource, completeSocialSecuritySource, completeSocialSecurityTreatment, completeUnemploymentSource } from "./complete-facts";
import { completeBrokerageSource, completeDividendSource, completeInterestSource, completeTransactionSource } from "./complete-facts";
import { completeW2Entry, startCompleteInterview as startInterview, completePersonalInfo, completeDependent, completeAocEligibility, completeEducationClaimant, completeHouseholdEmployee } from "./complete-facts";
import { describe, it, expect } from "vitest";
import {
  buildTaxInputFromGuidedData,
  buildW2Inputs,
  buildNecInputs,
  buildScheduleCInput,
  buildDependents,
  buildInterestInputs,
  buildDividendInputs,
  buildBrokerageInputs,
  buildRetirementInputs,
  buildSocialSecurityInputs,
  buildUnemploymentInputs,
  buildScheduleAInput,
  buildForm1098Inputs,
  buildDonationsInput,
  buildAdjustmentsInput,
  buildEstimatedPaymentsInput,
  buildDependentCareInput,
  buildEducationInput,
  buildEnergyCreditsInput,
  buildScheduleHInput,
  buildRentalPropertyInputs,
  buildGuidedFactAnswers,
  buildGuidedSyntheticDocuments,
  mapFilingStatus,
} from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import {
  type GuidedFlowState,
  emptyW2Entry,
  emptyNecEntry,
  emptyScheduleCExpenses,
  emptyPersonalInfo,
  emptyDeductionData,
  emptyAdjustmentData,
  emptyCreditsData,
  emptyDependentCareData,
  emptyEducationCreditData,
  emptyEducationStudent,
  emptyEnergyCreditData,
  emptyOtherTaxesData,
  emptyPaymentData,
  emptyInterestEntry,
  emptyDividendEntry,
  emptyBrokerageEntry,
  emptyCapitalGainTransaction,
  emptyRetirementEntry,
  emptyRentalPropertyEntry,
  emptySocialSecurityData,
  emptyUnemploymentData,
  emptyStateReturnData,
  type StateReturnData,
  emptyDependentEntry,
  updateSectionData,
} from "@/lib/guided-interview-flow";

// ── Filing status mapping ───────────────────────────────────────────────────

describe("mapFilingStatus", () => {
  it("maps single", () => {
    expect(mapFilingStatus("single")).toBe("single");
  });

  it("maps mfj to married_filing_jointly", () => {
    expect(mapFilingStatus("mfj")).toBe("married_filing_jointly");
  });

  it("maps mfs to married_filing_separately", () => {
    expect(mapFilingStatus("mfs")).toBe("married_filing_separately");
  });

  it("maps hoh to head_of_household", () => {
    expect(mapFilingStatus("hoh")).toBe("head_of_household");
  });

  it("maps qss to qualifying_surviving_spouse", () => {
    expect(mapFilingStatus("qss")).toBe("qualifying_surviving_spouse");
  });
});

// ── W-2 conversion ──────────────────────────────────────────────────────────

describe("buildW2Inputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildW2Inputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(buildW2Inputs([])).toEqual([]);
  });

  it("skips entries with no wages or withholding", () => {
    expect(buildW2Inputs([emptyW2Entry])).toEqual([]);
  });

  it("converts a W-2 entry with wages", () => {
    const entry = { ...emptyW2Entry, employerName: "Acme Corp", wages: "52000", federalWithheld: "5000" };
    const result = buildW2Inputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].employer.name).toBe("Acme Corp");
    expect(result[0].wages).toBe("52000");
    expect(result[0].federalWithheld).toBe("5000");
  });

  it("keeps missing employer identifiers empty", () => {
    const entry = { ...emptyW2Entry, wages: "50000" };
    const result = buildW2Inputs([entry]);
    expect(result[0].employer.name).toBe("");
    expect(result[0].employer.ein).toBe("");
  });

  it("handles multiple W-2s", () => {
    const entries = [
      { ...emptyW2Entry, wages: "50000", federalWithheld: "5000" },
      { ...emptyW2Entry, wages: "30000", federalWithheld: "3000" },
    ];
    const result = buildW2Inputs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].wages).toBe("50000");
    expect(result[1].wages).toBe("30000");
  });

  it("strips commas from dollar amounts", () => {
    const entry = { ...emptyW2Entry, wages: "52,000", federalWithheld: "5,000" };
    const result = buildW2Inputs([entry]);
    expect(result[0].wages).toBe("52000");
    expect(result[0].federalWithheld).toBe("5000");
  });

  it("preserves blank payroll sub-fields as unknown", () => {
    const entry = { ...emptyW2Entry, wages: "50000" };
    const result = buildW2Inputs([entry]);
    expect(result[0].socialSecurityWages).toBeUndefined();
    expect(result[0].medicareWages).toBeUndefined();
  });

  it("ignores AI-filled wages and withholding until they are confirmed", () => {
    const entry = {
      ...emptyW2Entry,
      employerName: "Official fixture employer",
      employerEin: "12-3456789",
      wages: "52000",
      federalWithheld: "5000",
      aiSuggestedFields: {
        employerName: {
          sourceLabel: "2026 Form W-2 (official info-copy PDF)",
          status: "pending-confirmation" as const,
        },
        employerEin: {
          sourceLabel: "2026 Form W-2 (official info-copy PDF)",
          status: "pending-confirmation" as const,
        },
        wages: {
          sourceLabel: "2026 Form W-2 (official info-copy PDF)",
          status: "pending-confirmation" as const,
        },
        federalWithheld: {
          sourceLabel: "2026 Form W-2 (official info-copy PDF)",
          status: "pending-confirmation" as const,
        },
      },
    };

    expect(buildW2Inputs([entry])).toEqual([]);
  });

  it("keeps extended W-2 boxes out of engine input until they are confirmed", () => {
    const entry = {
      ...emptyW2Entry,
      employerName: "Uploaded employer",
      employerEin: "12-3456789",
      wages: "52000",
      federalWithheld: "5000",
      socialSecurityWages: "52000",
      socialSecurityWithheld: "3224",
      medicareWages: "52000",
      medicareWithheld: "754",
      stateWages: "52000",
      stateWithheld: "2100",
      aiSuggestedFields: {
        socialSecurityWages: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
        socialSecurityWithheld: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
        medicareWages: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
        medicareWithheld: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
        stateWages: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
        stateWithheld: {
          sourceLabel: "Uploaded W-2",
          status: "pending-confirmation" as const,
        },
      },
    };

    expect(buildW2Inputs([entry])).toEqual([
      expect.objectContaining({
        wages: "52000",
        federalWithheld: "5000",
        socialSecurityWages: undefined,
        socialSecurityWithheld: undefined,
        medicareWages: undefined,
        medicareWithheld: undefined,
        stateWages: undefined,
        stateTaxWithheld: undefined,
      }),
    ]);
  });
});

// ── 1099-NEC conversion ─────────────────────────────────────────────────────

describe("buildNecInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildNecInputs(undefined)).toEqual([]);
  });

  it("skips untouched entries without inventing a zero amount", () => {
    expect(buildNecInputs([emptyNecEntry])).toEqual([]);
  });

  it("converts a NEC entry", () => {
    const entry = { ...emptyNecEntry, payerName: "Client A", nonemployeeCompensation: "10000" };
    const result = buildNecInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].payer).toBe("Client A");
    expect(result[0].nonemployeeCompensation).toBe("10000");
    expect(result[0].stateWithheld).toBeUndefined();
  });
});

// ── Schedule C conversion ───────────────────────────────────────────────────

describe("buildScheduleCInput", () => {
  it("returns undefined when no income and no expenses", () => {
    expect(buildScheduleCInput(undefined, undefined, undefined)).toBeUndefined();
    expect(buildScheduleCInput([], undefined, undefined)).toBeUndefined();
  });

  it("builds grossReceipts from NEC entries", () => {
    const entries = [
      { ...emptyNecEntry, nonemployeeCompensation: "5000" },
      { ...emptyNecEntry, nonemployeeCompensation: "3000" },
    ];
    const result = buildScheduleCInput(entries, "0", emptyScheduleCExpenses);
    expect(result?.grossReceipts).toBe("8000");
  });

  it("adds manual gross receipts to NEC totals", () => {
    const entries = [{ ...emptyNecEntry, nonemployeeCompensation: "5000" }];
    const result = buildScheduleCInput(entries, "1750", emptyScheduleCExpenses);
    expect(result?.grossReceipts).toBe("6750");
  });

  it("includes mapped expenses", () => {
    const expenses = { ...emptyScheduleCExpenses, officeExpense: "500", travel: "1200" };
    const entries = [{ ...emptyNecEntry, nonemployeeCompensation: "10000" }];
    const result = buildScheduleCInput(entries, undefined, expenses);
    expect(result?.expenses?.officeExpense).toBe("500");
    expect(result?.expenses?.travel).toBe("1200");
    expect(result?.expenses?.advertising).toBeUndefined();
  });
});

// ── Dependents ──────────────────────────────────────────────────────────────

describe("buildDependents", () => {
  it("returns an empty list only for an explicit zero or no entries", () => {
    expect(buildDependents("0")).toEqual([]);
    expect(buildDependents(undefined)).toEqual([]);
    expect(() => buildDependents("")).toThrow();
  });
  it("rejects missing details rather than making eligible children", () => {
    for (const count of ["1", "2", "100", "-1", "2.5"]) expect(() => buildDependents(count)).toThrow();
    expect(() => buildDependents("1", [emptyDependentEntry])).toThrow();
    expect(() => buildDependents("1", [{ ...completeDependent, dateOfBirth: "" }])).toThrow();
  });
  it("preserves supplied dependent identity and eligibility", () => {
    expect(buildDependents("1", [completeDependent])).toEqual([{ ...completeDependent, monthsLivedWithYou: 12 }]);
    const older = { ...completeDependent, dateOfBirth: "2006-06-01", qualifiesForCTC: false, qualifiesForODC: true };
    expect(buildDependents("1", [older])[0].qualifiesForCTC).toBe(false);
    expect(buildDependents("1", [older])[0].qualifiesForODC).toBe(true);
  });
});

// ── 1099-INT conversion ─────────────────────────────────────────────────

describe("buildInterestInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildInterestInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(buildInterestInputs([])).toEqual([]);
  });

  it("skips entries with no interest income", () => {
    expect(buildInterestInputs([emptyInterestEntry])).toEqual([]);
  });

  it("converts an interest entry", () => {
    const entry = { ...emptyInterestEntry, payer: "Chase Bank", interestIncome: "150" };
    const result = buildInterestInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].payer).toBe("Chase Bank");
    expect(result[0].interestIncome).toBe("150");
    expect(result[0].federalWithheld).toBeUndefined();
  });

  it("preserves a missing payer name for validation", () => {
    const entry = { ...emptyInterestEntry, interestIncome: "100" };
    const result = buildInterestInputs([entry]);
    expect(result[0].payer).toBe("");
  });

  it("handles multiple entries", () => {
    const entries = [
      { ...emptyInterestEntry, payer: "Bank A", interestIncome: "200" },
      { ...emptyInterestEntry, payer: "Bank B", interestIncome: "300" },
    ];
    const result = buildInterestInputs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].interestIncome).toBe("200");
    expect(result[1].interestIncome).toBe("300");
  });

  it("strips commas from dollar amounts", () => {
    const entry = { ...emptyInterestEntry, interestIncome: "1,500" };
    const result = buildInterestInputs([entry]);
    expect(result[0].interestIncome).toBe("1500");
  });
});

// ── 1099-DIV conversion ─────────────────────────────────────────────────

describe("buildDividendInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildDividendInputs(undefined)).toEqual([]);
  });

  it("skips entries with no dividends or capital gains", () => {
    expect(buildDividendInputs([emptyDividendEntry])).toEqual([]);
  });

  it("converts a dividend entry with ordinary dividends", () => {
    const entry = {
      ...emptyDividendEntry,
      payer: "Vanguard",
      ordinaryDividends: "2000",
      qualifiedDividends: "1500",
      section199ADividends: "25",
      foreignTaxPaid: "10",
    };
    const result = buildDividendInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].payer).toBe("Vanguard");
    expect(result[0].ordinaryDividends).toBe("2000");
    expect(result[0].qualifiedDividends).toBe("1500");
    expect(result[0].totalCapitalGainDistributions).toBeUndefined();
    expect(result[0].section199ADividends).toBe("25");
    expect(result[0].foreignTaxPaid).toBe("10");
  });

  it("includes entries with only capital gain distributions", () => {
    const entry = { ...emptyDividendEntry, capitalGainDistributions: "500" };
    const result = buildDividendInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].totalCapitalGainDistributions).toBe("500");
  });

  it("preserves a missing payer name for validation", () => {
    const entry = { ...emptyDividendEntry, ordinaryDividends: "100" };
    const result = buildDividendInputs([entry]);
    expect(result[0].payer).toBe("");
  });
});

// ── 1099-B conversion ───────────────────────────────────────────────────

describe("buildBrokerageInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildBrokerageInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(buildBrokerageInputs([])).toEqual([]);
  });

  it("skips entries with no transactions with proceeds or cost basis", () => {
    expect(buildBrokerageInputs([emptyBrokerageEntry])).toEqual([]);
  });

  it("converts a brokerage entry with transactions", () => {
    const entry = {
      broker: "Fidelity",
      transactions: [
        { ...emptyCapitalGainTransaction, description: "100 AAPL", proceeds: "15000", costBasis: "10000", holdingPeriod: "long" as const },
      ],
    };
    const result = buildBrokerageInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].broker).toBe("Fidelity");
    expect(result[0].transactions).toHaveLength(1);
    expect(result[0].transactions[0].proceeds).toBe("15000");
    expect(result[0].transactions[0].costBasis).toBe("10000");
    expect(result[0].transactions[0].holdingPeriod).toBe("long");
    expect(result[0].transactions[0].basisReportedToIRS).toBeUndefined();
    expect(result[0].transactions[0].digitalAsset).toBeUndefined();
  });

  it("preserves basis-reporting and digital-asset flags from guided transactions", () => {
    const entry = {
      broker: "Coinbase",
      transactions: [
        {
          ...emptyCapitalGainTransaction,
          description: "ETH",
          proceeds: "0.40",
          costBasis: "0.70",
          holdingPeriod: "long" as const,
          basisReportedToIRS: false,
          digitalAsset: true,
        },
      ],
    };
    const result = buildBrokerageInputs([entry]);

    expect(result[0].transactions[0]).toMatchObject({
      basisReportedToIRS: false,
      digitalAsset: true,
    });
  });

  it("preserves missing broker and property names for validation", () => {
    const entry = {
      broker: "",
      transactions: [
        { ...emptyCapitalGainTransaction, proceeds: "5000", costBasis: "3000" },
      ],
    };
    const result = buildBrokerageInputs([entry]);
    expect(result[0].broker).toBe("");
    expect(result[0].transactions[0].description).toBe("");
  });

  it("filters out transactions with no proceeds or cost basis", () => {
    const entry = {
      broker: "Schwab",
      transactions: [
        { ...emptyCapitalGainTransaction, description: "GOOG", proceeds: "10000", costBasis: "8000" },
        emptyCapitalGainTransaction, // empty — should be filtered
      ],
    };
    const result = buildBrokerageInputs([entry]);
    expect(result[0].transactions).toHaveLength(1);
  });

  it("handles multiple brokerages with multiple transactions", () => {
    const entries = [
      {
        broker: "Fidelity",
        transactions: [
          { ...emptyCapitalGainTransaction, proceeds: "5000", costBasis: "3000", holdingPeriod: "short" as const },
          { ...emptyCapitalGainTransaction, proceeds: "20000", costBasis: "15000", holdingPeriod: "long" as const },
        ],
      },
      {
        broker: "Schwab",
        transactions: [
          { ...emptyCapitalGainTransaction, proceeds: "8000", costBasis: "6000", holdingPeriod: "long" as const },
        ],
      },
    ];
    const result = buildBrokerageInputs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].transactions).toHaveLength(2);
    expect(result[1].transactions).toHaveLength(1);
  });
});

// ── Full TaxYearInput builder ───────────────────────────────────────────────

describe("buildTaxInputFromGuidedData", () => {
  it("returns null when filing status is not set", () => {
    const state: GuidedFlowState = {
      phase: "segmentation",
      segmentation: { filingStatus: null, incomeTypes: [], lifeEvents: [], stateCode: null },
      currentSectionIndex: 0,
      completedSections: [],
      sectionData: {},
    };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });

  it("builds an input from an explicit year and complete taxpayer facts", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.taxpayer.filingStatus).toBe("single");
    expect(input!.taxpayer.taxYear).toBe(2025);
    expect(input!.w2s).toEqual([]);
  });

  it("includes personal info when provided", () => {
    let state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "CA",
    });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      middleName: "Quinn",
      lastName: "Doe",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.taxpayer.primary.firstName).toBe("Jane Q");
    expect(input!.taxpayer.primary.lastName).toBe("Doe");
    expect(input!.taxpayer.address.city).toBe("Los Angeles");
    expect(input!.taxpayer.filingStatus).toBe("married_filing_jointly");
  });

  it("includes W-2 data when provided", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, employerName: "Acme", wages: "75000", federalWithheld: "8000" }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.w2s).toHaveLength(1);
    expect(input!.w2s[0].wages).toBe("75000");
  });

  it("includes self-employment data when provided", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, payerName: "Client", nonemployeeCompensation: "50000" }],
      manualGrossReceipts: "0",
      expenses: { ...completeBusinessExpenses, officeExpense: "1000" },
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.form1099Nec).toHaveLength(1);
    expect(input!.scheduleC?.grossReceipts).toBe("50000");
    expect(input!.scheduleC?.expenses?.officeExpense).toBe("1000");
  });

  it("includes manual self-employment income without a 1099-NEC", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "18500",
      expenses: { ...completeBusinessExpenses, supplies: "250" },
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.form1099Nec).toEqual([]);
    expect(input!.scheduleC?.grossReceipts).toBe("18500");
    expect(input!.scheduleC?.expenses?.supplies).toBe("250");
  });

  it("includes explicitly supplied dependents from personal info", () => {
    let state = startInterview({
      filingStatus: "hoh",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      dependentCount: "2",
      dependents: [completeDependent, { ...completeDependent, firstName: "Blair", ssn: "444-55-6666" }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.taxpayer.dependents).toHaveLength(2);
  });

  it("includes investment data when provided", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, payer: "Chase", interestIncome: "500" }],
      dividendEntries: [{ ...completeDividendSource, payer: "Vanguard", ordinaryDividends: "2000", qualifiedDividends: "1500" }],
      brokerageEntries: [{
        ...completeBrokerageSource,
        broker: "Fidelity",
        transactions: [{ ...completeTransactionSource, proceeds: "15000", costBasis: "10000", holdingPeriod: "long" as const }],
      }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.form1099Int).toHaveLength(1);
    expect(input!.form1099Int[0].interestIncome).toBe("500");
    expect(input!.form1099Div).toHaveLength(1);
    expect(input!.form1099Div[0].ordinaryDividends).toBe("2000");
    expect(input!.form1099B).toHaveLength(1);
    expect(input!.form1099B[0].transactions).toHaveLength(1);
    expect(input!.form1099B[0].transactions[0].proceeds).toBe("15000");
  });

  it("returns empty investment arrays when no investment data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.form1099Int).toEqual([]);
    expect(input!.form1099Div).toEqual([]);
    expect(input!.form1099B).toEqual([]);
  });
});

// ── End-to-end preview computation ──────────────────────────────────────────

describe("computeGuidedPreview", () => {
  it("returns null when guided state is missing at runtime", () => {
    expect(computeGuidedPreview(null)).toBeNull();
  });

  it("returns null when filing status is not set", () => {
    const state: GuidedFlowState = {
      phase: "segmentation",
      segmentation: { filingStatus: null, incomeTypes: [], lifeEvents: [], stateCode: null },
      currentSectionIndex: 0,
      completedSections: [],
      sectionData: {},
    };
    expect(computeGuidedPreview(state)).toBeNull();
  });

  it("returns preview metrics for a zero-income filer", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(preview!.totalIncome).toBe("0");
    expect(preview!.totalTax).toBe("0");
    expect(preview!.refund).toBe("0");
    expect(preview!.amountOwed).toBe("0");
  });

  it("computes refund for W-2 filer with withholding exceeding tax", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    // Wages $30,000 with $5,000 withheld — should get a refund
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "30000", federalWithheld: "5000" }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThan(0);
    expect(Number(preview!.totalPayments)).toBeGreaterThanOrEqual(5000);
    expect(Number(preview!.refund)).toBeGreaterThan(0);
  });

  it("does not use pending AI-filled W-2 values in the live preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{
        ...completeW2Entry,
        employerName: "Official fixture employer",
        employerEin: "12-3456789",
        wages: "52000",
        federalWithheld: "5000",
        aiSuggestedFields: {
          employerName: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          employerEin: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          wages: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          federalWithheld: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
        },
      }],
    });

    const preview = computeGuidedPreview(state);
    expect(preview).toBeNull();
  });

  it("computes preview for filer with explicitly supplied dependents", () => {
    let state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages"],
      lifeEvents: ["had-baby"],
      stateCode: null,
    });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
      dependentCount: "2",
      dependents: [completeDependent, { ...completeDependent, firstName: "Blair", ssn: "444-55-6666" }],
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "80000", federalWithheld: "10000" }],
    });
    const preview = computeGuidedPreview(state);
    // This was previously null because of missing qualifiesForCTC field
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThan(0);
  });

  it("computes preview for filer with detailed dependents", () => {
    let state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
      dependentCount: "1",
      dependents: [{
        ...completeDependent,
        firstName: "Junior",
        lastName: "Doe",
        dateOfBirth: "2018-05-10",
        relationship: "child",
        monthsLivedWithYou: "12",
        qualifiesForCTC: true,
        qualifiesForODC: false,
        qualifiesForEIC: true,
      }],
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "80000", federalWithheld: "10000" }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThan(0);
    // With CTC-qualifying dependent, refund should be higher than without
    expect(Number(preview!.refund)).toBeGreaterThan(0);
  });

  it("computes tax owed for high-income W-2 filer with no withholding", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "200000", federalWithheld: "0" }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalTax)).toBeGreaterThan(0);
    expect(Number(preview!.amountOwed)).toBeGreaterThan(0);
  });

  it("includes self-employment income in preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "50000" }],
      expenses: { ...completeBusinessExpenses, officeExpense: "5000" },
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThan(0);
    expect(Number(preview!.totalTax)).toBeGreaterThan(0);
  });

  it("computes combined W-2 and self-employment income", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "60000", federalWithheld: "8000" }],
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "30000" }],
      expenses: completeBusinessExpenses,
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    // Total income should be at least $60k + $30k
    expect(Number(preview!.totalIncome)).toBeGreaterThanOrEqual(90000);
  });

  it("includes interest income in preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    // Use a large enough amount to exceed the standard deduction
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "25000" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThanOrEqual(25000);
    expect(Number(preview!.totalTax)).toBeGreaterThan(0);
  });

  it("includes dividend income in preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [emptyInterestEntry],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "8000", qualifiedDividends: "6000" }],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThanOrEqual(8000);
  });

  it("includes capital gains in preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [emptyInterestEntry],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [{
        ...completeBrokerageSource,
        broker: "Fidelity",
        transactions: [{ ...completeTransactionSource, proceeds: "20000", costBasis: "10000", holdingPeriod: "long" as const }],
      }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    // Capital gain of $10,000 should show up in income
    expect(Number(preview!.totalIncome)).toBeGreaterThanOrEqual(10000);
  });

  it("computes combined W-2 and investment income", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "80000", federalWithheld: "12000" }],
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "1000" }],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "3000", qualifiedDividends: "2000" }],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    // Total income should be at least $80k + $1k + $3k
    expect(Number(preview!.totalIncome)).toBeGreaterThanOrEqual(84000);
  });

  it("includes estimated payments in preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "100000" }],
      expenses: completeBusinessExpenses,
    });
    state = updateSectionData(state, "payments", {
      estimatedPayments: [
        { date: "2025-04-15", amount: "10000" },
        { date: "2025-06-15", amount: "10000" },
      ],
      otherPayments: "",
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalPayments)).toBeGreaterThanOrEqual(20000);
  });

  it("includes adjustments in preview (reduces AGI)", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: ["hsa-contributions"],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "80000" }],
      expenses: completeBusinessExpenses,
    });
    // First compute without adjustments
    const previewWithout = computeGuidedPreview(state);

    // Now add HSA deduction
    state = updateSectionData(state, "adjustments", {
      ...emptyAdjustmentData,
      hsaDeduction: "3600",
    });
    const previewWith = computeGuidedPreview(state);

    expect(previewWithout).not.toBeNull();
    expect(previewWith).not.toBeNull();
    // AGI should be lower with the HSA deduction
    expect(Number(previewWith!.agi)).toBeLessThan(Number(previewWithout!.agi));
  });
});

// ── Schedule A conversion ──────────────────────────────────────────────────

describe("buildScheduleAInput", () => {
  it("returns undefined for undefined data", () => {
    expect(buildScheduleAInput(undefined)).toBeUndefined();
  });

  it("returns undefined for standard deduction method", () => {
    expect(buildScheduleAInput(emptyDeductionData)).toBeUndefined();
  });

  it("returns undefined for itemized with all zeroes", () => {
    expect(buildScheduleAInput({ ...emptyDeductionData, method: "itemized" })).toBeUndefined();
  });

  it("converts itemized deduction data", () => {
    const result = buildScheduleAInput({
      ...emptyDeductionData,
      method: "itemized",
      medicalExpenses: "5000",
      stateLocalTaxes: "8000",
      realEstateTaxes: "3000",
    });
    expect(result).not.toBeUndefined();
    expect(result!.medicalExpenses).toBe("5000");
    expect(result!.additionalStateLocalIncomeTaxes).toBe("8000");
    expect(result!.realEstateTaxes).toBe("3000");
    expect(result!.personalPropertyTaxes).toBeUndefined();
  });
});

// ── Form 1098 (mortgage interest) conversion ──────────────────────────────

describe("buildForm1098Inputs", () => {
  it("returns empty array for undefined data", () => {
    expect(buildForm1098Inputs(undefined)).toEqual([]);
  });

  it("returns empty array for standard deduction method", () => {
    expect(buildForm1098Inputs(emptyDeductionData)).toEqual([]);
  });

  it("returns empty array for itemized with no mortgage interest", () => {
    expect(buildForm1098Inputs({ ...emptyDeductionData, method: "itemized" })).toEqual([]);
  });

  it("converts mortgage interest to Form 1098 entry", () => {
    const result = buildForm1098Inputs({
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "12000",
      mortgageEntries: [{ ...completeMortgageSource, lender: "Actual Lender", mortgageInterest: "12000", outstandingPrincipal: "250000", originationDate: "2019-06-01" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].mortgageInterestReceived).toBe("12000");
    expect(result[0].lender).toBe("Actual Lender");
  });
});

// ── Charitable donations conversion ────────────────────────────────────────

describe("buildDonationsInput", () => {
  it("returns empty array for undefined data", () => {
    expect(buildDonationsInput(undefined)).toEqual([]);
  });

  it("returns empty array for standard deduction method", () => {
    expect(buildDonationsInput(emptyDeductionData)).toEqual([]);
  });

  it("returns empty array for itemized with no contributions", () => {
    expect(buildDonationsInput({ ...emptyDeductionData, method: "itemized" })).toEqual([]);
  });

  it("converts charitable contributions to donation entry", () => {
    const result = buildDonationsInput({
      ...emptyDeductionData,
      method: "itemized",
      charitableContributions: "5000",
      donationEntries: [{ organization: "Actual Charity", type: "cash", amount: "5000", date: "2025-10-01", costBasis: "", isLongTermCapitalGain: null, isPrivateFoundation: false }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe("5000");
    expect(result[0].type).toBe("cash");
    expect(result[0].organization).toBe("Actual Charity");
  });
});

// ── Itemized deductions flow through engine preview ────────────────────────

describe("itemized deductions in preview", () => {
  it("mortgage interest and charitable contributions affect the preview", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: ["bought-home"],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "100000", federalWithheld: "15000" }],
    });

    // Standard deduction baseline
    const previewStandard = computeGuidedPreview(state);
    expect(previewStandard).not.toBeNull();

    // Itemized with mortgage and charitable
    state = updateSectionData(state, "deductions", {
      ...emptyDeductionData,
      method: "itemized",
      mortgageInterest: "18000",
      mortgageEntries: [{ ...completeMortgageSource, lender: "Actual Lender", mortgageInterest: "18000", outstandingPrincipal: "250000", originationDate: "2019-06-01" }],
      charitableContributions: "5000",
      donationEntries: [{ organization: "Actual Charity", type: "cash", amount: "5000", date: "2025-10-01", costBasis: "", isLongTermCapitalGain: null, isPrivateFoundation: false }],
      stateLocalTaxes: "10000",
    });
    const previewItemized = computeGuidedPreview(state);
    expect(previewItemized).not.toBeNull();

    // Itemized total ($33k) exceeds standard deduction for single ($15k),
    // so taxable income should be lower
    expect(Number(previewItemized!.taxableIncome)).toBeLessThan(
      Number(previewStandard!.taxableIncome)
    );
  });
});

// ── Adjustments conversion ─────────────────────────────────────────────────

describe("buildAdjustmentsInput", () => {
  it("returns undefined for undefined data", () => {
    expect(buildAdjustmentsInput(undefined)).toBeUndefined();
  });

  it("returns undefined for all-zero adjustments", () => {
    expect(buildAdjustmentsInput(emptyAdjustmentData)).toBeUndefined();
  });

  it("converts adjustment data", () => {
    const result = buildAdjustmentsInput({
      ...emptyAdjustmentData,
      hsaDeduction: "3600",
      studentLoanInterest: "2500",
    });
    expect(result).not.toBeUndefined();
    expect(result!.hsaDeduction).toBe("3600");
    expect(result!.studentLoanInterest).toBe("2500");
    expect(result!.selfEmployedHealthInsurance).toBe("0");
    expect(result!.primaryEducatorExpenses).toBe("0");
  });

  it("maps educator expenses to primaryEducatorExpenses", () => {
    const result = buildAdjustmentsInput({
      ...emptyAdjustmentData,
      educatorExpenses: "300",
    });
    expect(result!.primaryEducatorExpenses).toBe("300");
  });
});

// ── Estimated payments conversion ──────────────────────────────────────────

describe("buildEstimatedPaymentsInput", () => {
  it("returns empty array for undefined data", () => {
    expect(buildEstimatedPaymentsInput(undefined)).toEqual([]);
  });

  it("returns empty array for no payments", () => {
    expect(buildEstimatedPaymentsInput(emptyPaymentData)).toEqual([]);
  });

  it("rejects an unknown payment amount", () => {
    expect(() => buildEstimatedPaymentsInput({
      estimatedPayments: [{ date: "2025-04-15", amount: "" }], otherPayments: "",
    })).toThrow(/actual payment amount/i);
  });

  it("converts payment entries", () => {
    const result = buildEstimatedPaymentsInput({
      estimatedPayments: [
        { date: "2025-04-15", amount: "5000" },
        { date: "2025-06-15", amount: "5000" },
      ],
      otherPayments: "",
    });
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2025-04-15");
    expect(result[0].amount).toBe("5000");
    expect(result[0].type).toBe("federal");
    expect(result[1].date).toBe("2025-06-15");
  });

  it("rejects an unknown payment date", () => {
    expect(() => buildEstimatedPaymentsInput({
      estimatedPayments: [{ date: "", amount: "3000" }], otherPayments: "",
    })).toThrow(/actual payment date/i);
  });

  it("strips commas from amounts", () => {
    const result = buildEstimatedPaymentsInput({
      estimatedPayments: [{ date: "2025-04-15", amount: "10,000" }],
      otherPayments: "",
    });
    expect(result[0].amount).toBe("10000");
  });
});

// ── Full builder with deductions/adjustments/payments ──────────────────────

describe("buildTaxInputFromGuidedData with deductions/adjustments/payments", () => {
  it("includes scheduleA when itemized deductions are selected", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "deductions", {
      ...emptyDeductionData,
      method: "itemized",
      medicalExpenses: "10000",
      stateLocalTaxes: "5000",
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.scheduleA).toBeDefined();
    expect(input!.scheduleA!.medicalExpenses).toBe("10000");
  });

  it("omits scheduleA when standard deduction is selected", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "deductions", emptyDeductionData);
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.scheduleA).toBeUndefined();
  });

  it("includes adjustments with estimated payments", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: ["hsa-contributions"],
      stateCode: null,
    });
    state = updateSectionData(state, "adjustments", {
      ...emptyAdjustmentData,
      hsaDeduction: "3600",
    });
    state = updateSectionData(state, "payments", {
      estimatedPayments: [{ date: "2025-04-15", amount: "5000" }],
      otherPayments: "",
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.adjustments).toBeDefined();
    expect(input!.adjustments!.hsaDeduction).toBe("3600");
    expect(input!.adjustments!.estimatedTaxPayments).toHaveLength(1);
    expect(input!.adjustments!.estimatedTaxPayments[0].amount).toBe("5000");
  });

  it("includes estimated payments even without other adjustments", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "payments", {
      estimatedPayments: [{ date: "2025-04-15", amount: "8000" }],
      otherPayments: "",
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.adjustments).toBeDefined();
    expect(input!.adjustments!.estimatedTaxPayments).toHaveLength(1);
  });

  it("omits adjustments when nothing entered", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.adjustments).toBeUndefined();
  });
});

// ── Dependent care credit conversion ────────────────────────────────────────

describe("buildDependentCareInput", () => {
  it("returns undefined for empty credits data", () => {
    expect(buildDependentCareInput(undefined)).toBeUndefined();
  });

  it("returns undefined when expenses are empty", () => {
    expect(buildDependentCareInput(emptyCreditsData)).toBeUndefined();
  });

  it("converts dependent care expenses and qualifying count", () => {
    const data = {
      ...emptyCreditsData,
      dependentCare: completeCareSource({ expenses: "5,000", qualifyingIndividuals: "2", primaryEarnedIncome: "30000", spouseEarnedIncome: undefined, providers: completeCareSource().providers?.map(provider => ({ ...provider, amountPaid: "5000" })), qualifyingPersons: completeCareSource().qualifyingPersons?.map((person, index) => ({ ...person, qualifiedExpenses: index === 0 ? "5000" : "0" })) }),
    };
    const result = buildDependentCareInput(data);
    expect(result).toEqual({
      expenses: "5000",
      qualifyingIndividuals: 2,
      primaryEarnedIncome: "30000",
      excludedDependentCareBenefits: "0",
      eligibilityConfirmed: true,
      priorYearExpenseCredit: "0", sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false,
      providers: data.dependentCare.providers, qualifyingPersons: data.dependentCare.qualifyingPersons,
    });
  });

  it("does not build dependent care input until qualifying individuals are selected", () => {
    const data = {
      ...emptyCreditsData,
      dependentCare: { expenses: "3000", qualifyingIndividuals: "" },
    };
    expect(() => buildDependentCareInput(data)).toThrow(/qualifying individuals/);
  });
});

// ── Education credit conversion ─────────────────────────────────────────────

describe("buildEducationInput", () => {
  it("returns undefined for empty credits data", () => {
    expect(buildEducationInput(undefined)).toBeUndefined();
  });

  it("returns undefined when no students and no LLC expenses", () => {
    expect(buildEducationInput(emptyCreditsData)).toBeUndefined();
  });

  it("converts AOC student with qualified expenses", () => {
    const data = {
      ...emptyCreditsData,
      education: {
        ...completeEducationClaimant,
        refundableAocEligible: false,
        aocStudents: [
          { ...completeAocEligibility, name: "Jane", qualifiedExpenses: "4,000", priorYearsClaimed: "1" },
        ],
        llcExpenses: "",
      },
    };
    const result = buildEducationInput(data);
    expect(result!.aocStudents).toHaveLength(1);
    expect(result!.aocStudents[0].name).toBe("Jane");
    expect(result!.aocStudents[0].qualifiedExpenses).toBe("4000");
    expect(result!.aocStudents[0].priorYearsClaimed).toBe(1);
  });

  it("rejects a started student with unknown expenses", () => {
    const data = {
      ...emptyCreditsData,
      education: {
        ...completeEducationClaimant,
        refundableAocEligible: false,
        aocStudents: [
          { ...completeAocEligibility, name: "Jane", qualifiedExpenses: "4000", priorYearsClaimed: "0" },
          { name: "Empty", qualifiedExpenses: "", priorYearsClaimed: "0" },
        ],
        llcExpenses: "",
      },
    };
    expect(() => buildEducationInput(data)).toThrow(/actual qualified education expenses/i);
  });

  it("includes LLC expenses when filled", () => {
    const data = {
      ...emptyCreditsData,
      education: {
        ...completeEducationClaimant,
        refundableAocEligible: false,
        aocStudents: [],
        llcStudents: [{ ...completeAocEligibility, name: "Jordan Example", qualifiedExpenses: "8500", courseEligibilityConfirmed: true }],
        llcExpenses: "8,500",
      },
    };
    const result = buildEducationInput(data);
    expect(result!.aocStudents).toHaveLength(0);
    expect(result!.llcExpenses).toBe("8500");
  });

  it("requires the actual student name", () => {
    const data = {
      ...emptyCreditsData,
      education: {
        ...completeEducationClaimant,
        refundableAocEligible: false,
        aocStudents: [{ name: "", qualifiedExpenses: "2000", priorYearsClaimed: "0" }],
        llcExpenses: "",
      },
    };
    expect(() => buildEducationInput(data)).toThrow(/actual student name/i);
  });
});

// ── Energy credits conversion ───────────────────────────────────────────────

describe("buildEnergyCreditsInput", () => {
  it("returns undefined for empty credits data", () => {
    expect(buildEnergyCreditsInput(undefined)).toBeUndefined();
  });

  it("returns undefined when all energy fields are empty", () => {
    expect(buildEnergyCreditsInput(emptyCreditsData)).toBeUndefined();
  });

  it("converts confirmed solar property without repeating the legacy total", () => {
    const result = buildEnergyCreditsInput({ ...emptyCreditsData, energy: { ...emptyEnergyCreditData, ...energySource, qualifiedImprovements: [], carryforwardSourceTaxYear: "2024", solarElectricCost: "25,000", residenceEligibilityConfirmed: true, cleanEnergyProperties: [{ ...sourceCleanProperty, category: "solar_electric", qualifiedCost: "25,000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true }] } }, 2025, "single");
    expect(result?.cleanEnergyProperties?.[0].qualifiedCost).toBe("25000");
    expect(result).not.toHaveProperty("solarElectricCost");
  });

  it("keeps insulation and individual doors distinct and excludes confirmed ordinary roofing", () => {
    const result = buildEnergyCreditsInput({ ...emptyCreditsData, energy: { ...emptyEnergyCreditData, ...energySource, cleanEnergyProperties: [], carryforwardSourceTaxYear: "2024", insulationCost: "1000", exteriorDoorsWindowsCost: "2000", roofCost: "3000", legacyRoofTreatment: "not_eligible", residenceEligibilityConfirmed: true, qualifiedImprovements: [
      { ...sourceImprovement, sourceId: "insulation", category: "insulation", qualifiedCost: "1000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true },
      { ...sourceImprovement, category: "exterior_door", qualifiedCost: "2000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true, manufacturerQualifiedId: "A1B2" },
    ] } }, 2025, "single");
    expect(result?.qualifiedImprovements?.map(({ category, qualifiedCost }) => ({ category, qualifiedCost }))).toEqual([{ category: "insulation", qualifiedCost: "1000" }, { category: "exterior_door", qualifiedCost: "2000" }]);
    expect(result).not.toHaveProperty("insulationCost");
  });

  it("keeps HVAC and heat-pump expenses in their actual categories", () => {
    const result = buildEnergyCreditsInput({ ...emptyCreditsData, energy: { ...emptyEnergyCreditData, ...energySource, cleanEnergyProperties: [], carryforwardSourceTaxYear: "2024", energyEfficientHvacCost: "5,000", waterHeaterHeatPumpCost: "3,000", residenceEligibilityConfirmed: true, qualifiedImprovements: [
      { ...sourceImprovement, sourceId: "ac", category: "central_ac", qualifiedCost: "5,000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true, manufacturerQualifiedId: "A1B2" },
      { ...sourceImprovement, sourceId: "heat", category: "heat_pump", qualifiedCost: "3,000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true, manufacturerQualifiedId: "A1B2" },
    ] } }, 2025, "single");
    expect(result?.qualifiedImprovements?.map(({ category, qualifiedCost }) => ({ category, qualifiedCost }))).toEqual([{ category: "central_ac", qualifiedCost: "5000" }, { category: "heat_pump", qualifiedCost: "3000" }]);
    expect(result).not.toHaveProperty("energyPropertyCost");
  });

  it("includes actual clean energy and home-efficiency records together", () => {
    const result = buildEnergyCreditsInput({ ...emptyCreditsData, energy: { ...emptyEnergyCreditData, ...energySource, carryforwardSourceTaxYear: "2024", residenceEligibilityConfirmed: true,
      cleanEnergyProperties: [{ ...sourceCleanProperty, category: "solar_electric", qualifiedCost: "20000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true }],
      qualifiedImprovements: [{ ...sourceImprovement, sourceId: "insulation", category: "insulation", qualifiedCost: "1500", installationCompletedDate: "2025-06-01", qualificationConfirmed: true }],
    } }, 2025, "single");
    expect(result?.cleanEnergyProperties?.[0].qualifiedCost).toBe("20000");
    expect(result?.qualifiedImprovements?.[0].qualifiedCost).toBe("1500");
  });
});

// ── Credits in buildTaxInputFromGuidedData ──────────────────────────────────

describe("buildTaxInputFromGuidedData — credits", () => {
  it("includes dependentCare in engine input when filled", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      dependentCare: completeCareSource({ expenses: "6000", qualifyingIndividuals: "1", primaryEarnedIncome: "30000", spouseEarnedIncome: undefined, providers: completeCareSource().providers?.map(provider => ({ ...provider, amountPaid: "6000" })), qualifyingPersons: completeCareSource().qualifyingPersons?.slice(0, 1).map(person => ({ ...person, qualifiedExpenses: "6000" })) }),
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.dependentCare).toEqual({
      expenses: "6000",
      qualifyingIndividuals: 1,
      primaryEarnedIncome: "30000",
      excludedDependentCareBenefits: "0",
      eligibilityConfirmed: true,
      priorYearExpenseCredit: "0", sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false,
      providers: completeCareSource().providers?.map(provider => ({ ...provider, amountPaid: "6000" })),
      qualifyingPersons: completeCareSource().qualifyingPersons?.slice(0, 1).map(person => ({ ...person, qualifiedExpenses: "6000" })),
    });
  });

  it("includes educationExpenses in engine input when filled", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      education: {
        ...completeEducationClaimant,
        refundableAocEligible: false,
        aocStudents: [{ ...completeAocEligibility, name: "Test", qualifiedExpenses: "4000", priorYearsClaimed: "0" }],
        llcExpenses: "",
      },
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.educationExpenses).toBeDefined();
    expect(input!.educationExpenses!.aocStudents).toHaveLength(1);
  });

  it("includes energyCredits in engine input when filled", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "credits", {
      ...emptyCreditsData,
      energy: { ...emptyEnergyCreditData, ...energySource, qualifiedImprovements: [], carryforwardSourceTaxYear: "2024", solarElectricCost: "15000", residenceEligibilityConfirmed: true, cleanEnergyProperties: [{ ...sourceCleanProperty, category: "solar_electric", qualifiedCost: "15000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true }] },
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.energyCredits).toBeDefined();
    expect(input!.energyCredits!.cleanEnergyProperties?.[0].qualifiedCost).toBe("15000");
  });

  it("omits all credit fields when credits section is empty", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.dependentCare).toBeUndefined();
    expect(input!.educationExpenses).toBeUndefined();
    expect(input!.energyCredits).toBeUndefined();
  });
});

// ── Retirement income (1099-R) conversion ─────────────────────────────────

describe("buildRetirementInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildRetirementInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(buildRetirementInputs([])).toEqual([]);
  });

  it("skips entries with no gross distribution or taxable amount", () => {
    expect(buildRetirementInputs([emptyRetirementEntry])).toEqual([]);
  });

  it("converts a 1099-R entry with distribution data", () => {
    const entry = {
      ...completeRetirementSource,
      payer: "Fidelity",
      grossDistribution: "25000",
      taxableAmount: "25000",
      federalWithheld: "3000",
      distributionCode: "7",
      isIraSepSimple: true,
    };
    const result = buildRetirementInputs([entry]);
    expect(result).toHaveLength(1);
    expect(result[0].payer).toBe("Fidelity");
    expect(result[0].grossDistribution).toBe("25000");
    expect(result[0].taxableAmount).toBe("25000");
    expect(result[0].federalWithheld).toBe("3000");
    expect(result[0].distributionCode).toBe("7");
    expect(result[0].iraSepSimple).toBe(true);
  });

  it("requires the actual payer name", () => {
    const entry = { ...emptyRetirementEntry, grossDistribution: "10000", taxableAmount: "10000" };
    expect(() => buildRetirementInputs([entry])).toThrow(/actual retirement payer/i);
  });

  it("handles multiple 1099-Rs", () => {
    const entries = [
      { ...completeRetirementSource, accountReference: "Vanguard-source", distributionCode: "7", payer: "Vanguard", grossDistribution: "20000", taxableAmount: "20000" },
      { ...completeRetirementSource, accountReference: "Schwab-source", distributionCode: "7", payer: "Schwab", grossDistribution: "15000", taxableAmount: "15000" },
    ];
    const result = buildRetirementInputs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].payer).toBe("Vanguard");
    expect(result[1].payer).toBe("Schwab");
  });
});

// ── Social Security (SSA-1099) conversion ─────────────────────────────────

describe("buildSocialSecurityInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildSocialSecurityInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty data", () => {
    expect(buildSocialSecurityInputs(emptySocialSecurityData)).toEqual([]);
  });

  it("converts SSA-1099 data with net benefits", () => {
    const data = { ...completeSocialSecurityTreatment, netBenefits: "18000", federalWithheld: "2000", entries: [{ ...completeSocialSecuritySource, benefitsPaid: "18000", netBenefits: "18000", federalWithheld: "2000" }] };
    const result = buildSocialSecurityInputs(data);
    expect(result).toHaveLength(1);
    expect(result[0].netBenefits).toBe("18000");
    expect(result[0].federalWithheld).toBe("2000");
  });

  it("converts an explicitly supplied zero withholding", () => {
    const data = { ...completeSocialSecurityTreatment, netBenefits: "22000", federalWithheld: "0", entries: [{ ...completeSocialSecuritySource, benefitsPaid: "22000", netBenefits: "22000" }] };
    const result = buildSocialSecurityInputs(data);
    expect(result).toHaveLength(1);
    expect(result[0].federalWithheld).toBe("0");
  });
});

// ── Unemployment (1099-G) conversion ──────────────────────────────────────

describe("buildUnemploymentInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildUnemploymentInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty data", () => {
    expect(buildUnemploymentInputs(emptyUnemploymentData)).toEqual([]);
  });

  it("converts 1099-G data", () => {
    const data = { compensation: "12000", federalWithheld: "1200", entries: [{ ...completeUnemploymentSource, compensation: "12000", federalWithheld: "1200" }] };
    const result = buildUnemploymentInputs(data);
    expect(result).toHaveLength(1);
    expect(result[0].unemploymentCompensation).toBe("12000");
    expect(result[0].federalWithheld).toBe("1200");
  });

  it("rejects legacy government amounts without actual payer and withholding facts", () => {
    const data = { compensation: "8000", federalWithheld: "" };
    expect(() => buildUnemploymentInputs(data)).toThrow();
  });
});

// ── buildTaxInputFromGuidedData with new income types ─────────────────────

describe("buildTaxInputFromGuidedData retirement and SS and unemployment", () => {
  it("includes form1099R when retirement data is present", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["retirement"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-retirement", {
      entries: [{ ...completeRetirementSource, distributionCode: "7", payer: "Fidelity", grossDistribution: "30000", taxableAmount: "30000", federalWithheld: "4500" }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.form1099R).toHaveLength(1);
    expect(input!.form1099R![0].payer).toBe("Fidelity");
  });

  it("includes formSSA1099 when social security data is present", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["social-security"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-social-security", {
      ...completeSocialSecurityTreatment, netBenefits: "20000", federalWithheld: "2000", entries: [{ ...completeSocialSecuritySource, benefitsPaid: "20000", netBenefits: "20000", federalWithheld: "2000" }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.formSSA1099).toHaveLength(1);
    expect(input!.formSSA1099![0].netBenefits).toBe("20000");
  });

  it("includes form1099G when unemployment data is present", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["unemployment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-unemployment", {
      compensation: "15000",
      federalWithheld: "1500",
      entries: [{ ...completeUnemploymentSource, compensation: "15000", federalWithheld: "1500" }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.form1099G).toHaveLength(1);
    expect(input!.form1099G![0].unemploymentCompensation).toBe("15000");
  });

  it("computes preview with retirement income", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["retirement"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-retirement", {
      entries: [{
        ...completeRetirementSource,
        payer: "401k Plan",
        grossDistribution: "50000",
        taxableAmount: "50000",
        federalWithheld: "7500",
        distributionCode: "7",
        isIraSepSimple: false,
      }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(Number(preview!.totalIncome)).toBeGreaterThan(0);
  });

  it("includes scheduleH when household employment wages are present", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "other-taxes", {
      ...emptyOtherTaxesData,
      householdEmploymentWages: "5000",
      householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "5000" }],
      futaApplies: false,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.scheduleH).toBeDefined();
    expect(input!.scheduleH!.employees).toHaveLength(1);
    expect(input!.scheduleH!.employees[0].cashWages).toBe("5000");
  });

  it("omits scheduleH when household employment wages are empty", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "other-taxes", emptyOtherTaxesData);
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.scheduleH).toBeUndefined();
  });

  it("omits scheduleH when other-taxes section data is not present", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.scheduleH).toBeUndefined();
  });
});

// ── Schedule H (household employment) conversion ────────────────────────────

describe("buildScheduleHInput", () => {
  it("returns undefined for undefined data", () => {
    expect(buildScheduleHInput(undefined)).toBeUndefined();
  });

  it("returns undefined for empty other-taxes data", () => {
    expect(buildScheduleHInput(emptyOtherTaxesData)).toBeUndefined();
  });

  it("returns undefined for zero wages", () => {
    expect(buildScheduleHInput({
      ...emptyOtherTaxesData,
      householdEmploymentWages: "0",
    })).toBeUndefined();
  });

  it("returns undefined for blank string wages", () => {
    expect(buildScheduleHInput({
      ...emptyOtherTaxesData,
      householdEmploymentWages: "",
    })).toBeUndefined();
  });

  it("builds single employee entry for positive wages", () => {
    const result = buildScheduleHInput({
      ...emptyOtherTaxesData,
      householdEmploymentWages: "4500",
      householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "4500" }],
      futaApplies: false,
    });
    expect(result).toEqual({
      employees: [{ ...completeHouseholdEmployee, cashWages: "4500" }],
      futaApplies: false,
    });
  });

  it("strips commas from wages", () => {
    const result = buildScheduleHInput({
      ...emptyOtherTaxesData,
      householdEmploymentWages: "12,500",
      householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "12,500" }],
      futaApplies: false,
    });
    expect(result).toEqual({
      employees: [{ ...completeHouseholdEmployee, cashWages: "12500" }],
      futaApplies: false,
    });
  });

  it("handles decimal wages", () => {
    const result = buildScheduleHInput({
      ...emptyOtherTaxesData,
      householdEmploymentWages: "3200.50",
      householdEmployees: [{ ...completeHouseholdEmployee, cashWages: "3200.50" }],
      futaApplies: false,
    });
    expect(result).toEqual({
      employees: [{ ...completeHouseholdEmployee, cashWages: "3200.50" }],
      futaApplies: false,
    });
  });
});

// ── Rental property (Schedule E) conversion ──────────────────────────────────

describe("buildRentalPropertyInputs", () => {
  it("returns empty array for undefined", () => {
    expect(buildRentalPropertyInputs(undefined)).toEqual([]);
  });

  it("returns empty array for empty entries", () => {
    expect(buildRentalPropertyInputs([])).toEqual([]);
  });

  it("preserves started entries with unknown or zero rents", () => {
    const entries = [
      { ...emptyRentalPropertyEntry, description: "123 Main St", rents: "" },
      { ...emptyRentalPropertyEntry, description: "456 Oak Ave", rents: "0" },
    ];
    expect(buildRentalPropertyInputs(entries).map(entry => entry.rents)).toEqual([undefined, "0"]);
  });

  it("converts a single rental property with all fields", () => {
    const entries = [{
      ...emptyRentalPropertyEntry,
      description: "123 Main St",
      propertyType: "single_family" as const,
      rents: "24000",
      mortgageInterest: "8000",
      taxes: "3000",
      insurance: "1500",
      repairs: "2000",
      utilities: "600",
      depreciation: "5000",
      otherExpenses: "400",
    }];
    const result = buildRentalPropertyInputs(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      description: "123 Main St",
      propertyType: "single_family",
      rents: "24000",
      mortgageInterest: "8000",
      taxes: "3000",
      insurance: "1500",
      repairs: "2000",
      utilities: "600",
      depreciation: "5000",
      otherExpenses: "400",
    });
  });

  it("preserves an unknown property description", () => {
    const entries = [{ ...emptyRentalPropertyEntry, rents: "12000" }];
    const result = buildRentalPropertyInputs(entries);
    expect(result[0].description).toBe("");
  });

  it("preserves empty expense fields as unknown", () => {
    const entries = [{ ...emptyRentalPropertyEntry, rents: "18000" }];
    const result = buildRentalPropertyInputs(entries);
    expect(result[0].mortgageInterest).toBeUndefined();
    expect(result[0].taxes).toBeUndefined();
    expect(result[0].insurance).toBeUndefined();
    expect(result[0].repairs).toBeUndefined();
    expect(result[0].utilities).toBeUndefined();
    expect(result[0].depreciation).toBeUndefined();
    expect(result[0].otherExpenses).toBeUndefined();
  });

  it("strips commas from monetary values", () => {
    const entries = [{
      ...emptyRentalPropertyEntry,
      rents: "36,000",
      mortgageInterest: "12,500",
      taxes: "4,200",
    }];
    const result = buildRentalPropertyInputs(entries);
    expect(result[0].rents).toBe("36000");
    expect(result[0].mortgageInterest).toBe("12500");
    expect(result[0].taxes).toBe("4200");
  });

  it("handles multiple rental properties", () => {
    const entries = [
      { ...emptyRentalPropertyEntry, description: "Property A", rents: "24000" },
      { ...emptyRentalPropertyEntry, description: "Property B", rents: "0" },
      { ...emptyRentalPropertyEntry, description: "Property C", rents: "36000" },
    ];
    const result = buildRentalPropertyInputs(entries);
    expect(result).toHaveLength(3);
    expect(result[0].description).toBe("Property A");
    expect(result[1].description).toBe("Property B");
    expect(result[2].description).toBe("Property C");
  });

  it("preserves propertyType for different property types", () => {
    const entries = [
      { ...emptyRentalPropertyEntry, rents: "2400", propertyType: "vacation" as const },
      { ...emptyRentalPropertyEntry, rents: "5000", propertyType: "commercial" as const },
    ];
    const result = buildRentalPropertyInputs(entries);
    expect(result[0].propertyType).toBe("vacation");
    expect(result[1].propertyType).toBe("commercial");
  });
});

describe("buildTaxInputFromGuidedData — rental income", () => {
  it("includes rental properties in tax input", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["rental"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-rental", {
      entries: [{
        ...completeRentalSource,
        description: "123 Oak St",
        rents: "30000",
        mortgageInterest: "10000",
        taxes: "4000",
      }],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    expect(input!.rentalProperties).toHaveLength(1);
    expect(input!.rentalProperties[0].description).toBe("123 Oak St");
    expect(input!.rentalProperties[0].rents).toBe("30000");
    expect(input!.rentalProperties[0].mortgageInterest).toBe("10000");
    expect(input!.rentalProperties[0].taxes).toBe("4000");
  });

  it("returns empty rental array when no rental data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.rentalProperties).toEqual([]);
  });

  it("keeps an actual zero-rent property", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["rental"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-rental", {
      entries: [
        { ...completeRentalSource, description: "A", rents: "20000" },
        { ...completeRentalSource, description: "B", rents: "0" },
      ],
    });
    const input = buildTaxInputFromGuidedData(state);
    expect(input!.rentalProperties).toHaveLength(2);
    expect(input!.rentalProperties[0].description).toBe("A");
    expect(input!.rentalProperties[1].rents).toBe("0");
  });
});

describe("computeGuidedPreview — rental income", () => {
  it("computes preview with rental income affecting AGI", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["rental"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-rental", {
      entries: [{
        ...completeRentalSource,
        description: "Rental House",
        rents: "30000",
        mortgageInterest: "5000",
        taxes: "3000",
        insurance: "1200",
      }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    // Net rental income = 30000 - 5000 - 3000 - 1200 = 20800
    expect(preview!.totalIncome).toBe("20800");
    expect(preview!.agi).toBe("20800");
  });

  it("computes preview with rental loss", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["rental"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-rental", {
      entries: [{
        ...completeRentalSource,
        description: "Rental Condo",
        rents: "12000",
        mortgageInterest: "15000",
        taxes: "4000",
        insurance: "2000",
        repairs: "3000",
      }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    // This is a loss scenario (12000 - 24000 = -12000)
    // Active participation allows up to $25k deduction
    expect(preview!.totalIncome).toBe("-12000");
  });
});

// ── State return — preview with state estimated payments ────────────────────

describe("computeGuidedPreview with state return data", () => {
  function buildStateFlowState(stateReturnData?: StateReturnData): GuidedFlowState {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "PA",
    });
    state = updateSectionData(state, "personal-info", {
      ...completePersonalInfo,
      firstName: "Jane",
      lastName: "Doe",
      state: "PA",
      dependentCount: "0",
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{
        ...completeW2Entry,
        employerName: "Acme Corp",
        wages: "60000",
        federalWithheld: "8000",
        stateTaxReporting: "single", state: "PA", stateWages: "60000",
        stateWithheld: "2000",
      }],
    });
    if (stateReturnData) {
      state = updateSectionData(state, "state-return", stateReturnData);
    }
    return state;
  }

  it("computes state preview without state return section data", () => {
    const state = buildStateFlowState();
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(preview!.state).not.toBeNull();
    expect(preview!.state!.stateCode).toBe("PA");
    expect(Number(preview!.state!.stateWithholding)).toBe(2000);
  });

  it("includes additional state withholding from state-return section", () => {
    const state = buildStateFlowState({
      stateEstimatedPayments: [],
      additionalStateWithholding: "500",
      additionalStateWithholdingEntries: [{ payer: "Example Pension", documentType: "1099-R", state: "PA", taxYear: "2025", amount: "500" }],
    });
    const preview = computeGuidedPreview(state);
    expect(preview).not.toBeNull();
    expect(preview!.state).not.toBeNull();
    // Withholding should be W-2 (2000) + additional (500) = 2500
    expect(Number(preview!.state!.stateWithholding)).toBe(2500);
  });

  it("includes state estimated payments in the preview calculation", () => {
    const stateWithoutPayments = buildStateFlowState({
      stateEstimatedPayments: [],
      additionalStateWithholding: "",
    });
    const stateWithPayments = buildStateFlowState({
      stateEstimatedPayments: [
        { state: "PA", date: "2025-04-15", amount: "1000" },
        { state: "PA", date: "2025-06-15", amount: "1000" },
      ],
      additionalStateWithholding: "",
    });

    const previewWithout = computeGuidedPreview(stateWithoutPayments);
    const previewWith = computeGuidedPreview(stateWithPayments);

    expect(previewWithout).not.toBeNull();
    expect(previewWith).not.toBeNull();
    expect(previewWithout!.state).not.toBeNull();
    expect(previewWith!.state).not.toBeNull();

    // The state refund should be higher (or balance due lower) with payments
    const refundWithout = Number(previewWithout!.state!.stateRefund) - Number(previewWithout!.state!.stateAmountOwed);
    const refundWith = Number(previewWith!.state!.stateRefund) - Number(previewWith!.state!.stateAmountOwed);
    expect(refundWith).toBeGreaterThan(refundWithout);
  });

  it("empty state return data does not change the state preview", () => {
    const stateDefault = buildStateFlowState();
    const stateEmpty = buildStateFlowState({ ...emptyStateReturnData });

    const previewDefault = computeGuidedPreview(stateDefault);
    const previewEmpty = computeGuidedPreview(stateEmpty);

    expect(previewDefault!.state!.stateRefund).toBe(previewEmpty!.state!.stateRefund);
    expect(previewDefault!.state!.stateAmountOwed).toBe(previewEmpty!.state!.stateAmountOwed);
    expect(previewDefault!.state!.stateWithholding).toBe(previewEmpty!.state!.stateWithholding);
  });
});

// ── Guided → workspace fact sync ──────────────────────────────────────────

describe("buildGuidedFactAnswers", () => {
  it("returns empty array for state with no section data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    expect(buildGuidedFactAnswers(state)).toEqual([]);
  });

  it("produces wages and withholding facts from W-2 data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "52,000", federalWithheld: "6,000" }],
    });
    const answers = buildGuidedFactAnswers(state);
    const factIds = answers.map((a) => a.factId);
    expect(factIds).toContain("wages");
    expect(factIds).toContain("withholding");
    const wagesFact = answers.find((a) => a.factId === "wages");
    expect(wagesFact!.answerText).toContain("$52,000");
    const withholdingFact = answers.find((a) => a.factId === "withholding");
    expect(withholdingFact!.answerText).toContain("$6,000");
  });

  it("does not sync W-2 facts from pending AI-filled values", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{
        ...completeW2Entry,
        employerName: "Official fixture employer",
        employerEin: "12-3456789",
        wages: "52,000",
        federalWithheld: "6,000",
        aiSuggestedFields: {
          employerName: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          employerEin: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          wages: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          federalWithheld: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
        },
      }],
    });

    expect(buildGuidedFactAnswers(state)).toEqual([]);
  });

  it("produces NEC facts from self-employment data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "25000" }],
      manualGrossReceipts: "0",
      expenses: completeBusinessExpenses,
    });
    const answers = buildGuidedFactAnswers(state);
    const factIds = answers.map((a) => a.factId);
    expect(factIds).toContain("nonemployee-compensation");
    expect(factIds).toContain("schedule-c-expense-review");
  });

  it("produces Schedule C facts from manual self-employment income without a 1099-NEC", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "9300",
      expenses: completeBusinessExpenses,
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factId: "nonemployee-compensation",
        answerText: expect.stringContaining("Business gross receipts entered: $9,300"),
      }),
      expect.objectContaining({
        factId: "schedule-c-expense-review",
      }),
    ]));
  });

  it("produces interest fact from investment data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "1500" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers.find((a) => a.factId === "taxable-interest")).toBeTruthy();
    expect(answers.find((a) => a.factId === "taxable-interest")!.answerText).toContain("$1,500");
  });

  it("produces dividend facts from investment data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [emptyInterestEntry],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "3000", qualifiedDividends: "2000", capitalGainDistributions: "500" }],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const answers = buildGuidedFactAnswers(state);
    const factIds = answers.map((a) => a.factId);
    expect(factIds).toContain("ordinary-dividends");
    expect(factIds).toContain("qualified-dividends");
    expect(factIds).toContain("capital-gain-distributions");
  });

  it("produces brokerage facts from capital gains data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [emptyInterestEntry],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [{
        ...completeBrokerageSource,
        broker: "Fidelity",
        transactions: [{ ...completeTransactionSource, proceeds: "20000", costBasis: "15000" }],
      }],
    });
    const answers = buildGuidedFactAnswers(state);
    const factIds = answers.map((a) => a.factId);
    expect(factIds).toContain("broker-proceeds");
    expect(factIds).toContain("cost-basis-review");
  });

  it("produces retirement fact from 1099-R data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["retirement"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-retirement", {
      entries: [{ ...emptyRetirementEntry, grossDistribution: "30000", taxableAmount: "25000" }],
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers.find((a) => a.factId === "retirement-distribution-review")).toBeTruthy();
    expect(answers.find((a) => a.factId === "retirement-distribution-review")!.answerText).toContain("$25,000");
  });

  it("produces Social Security fact from SSA-1099 data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["social-security"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-social-security", {
      ...emptySocialSecurityData,
      netBenefits: "18000",
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers.find((a) => a.factId === "social-security-benefits-review")).toBeTruthy();
  });

  it("produces unemployment fact from 1099-G data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["unemployment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-unemployment", {
      ...emptyUnemploymentData,
      compensation: "8500",
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers.find((a) => a.factId === "government-payments-review")).toBeTruthy();
  });

  it("produces facts for complex filer with multiple income types", () => {
    let state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "self-employment", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "80000", federalWithheld: "12000" }],
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "40000" }],
      expenses: completeBusinessExpenses,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "1000" }],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "2000" }],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const answers = buildGuidedFactAnswers(state);
    const factIds = answers.map((a) => a.factId);
    expect(factIds).toContain("wages");
    expect(factIds).toContain("withholding");
    expect(factIds).toContain("nonemployee-compensation");
    expect(factIds).toContain("schedule-c-expense-review");
    expect(factIds).toContain("taxable-interest");
    expect(factIds).toContain("ordinary-dividends");
  });

  it("skips W-2 entries with no data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [emptyW2Entry],
    });
    const answers = buildGuidedFactAnswers(state);
    expect(answers.find((a) => a.factId === "wages")).toBeUndefined();
  });
});

describe("buildGuidedSyntheticDocuments", () => {
  it("returns empty array for state with no section data", () => {
    const state = startInterview({
      filingStatus: "single",
      incomeTypes: [],
      lifeEvents: [],
      stateCode: null,
    });
    expect(buildGuidedSyntheticDocuments(state)).toEqual([]);
  });

  it("creates W-2 synthetic document from W-2 data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe("guided:w2");
    expect(docs[0].kind).toBe("w2");
    expect(docs[0].seededFactIds).toContain("wages");
    expect(docs[0].seededFactIds).toContain("withholding");
    expect(docs[0].coverage).toBe("supported");
  });

  it("does not create a guided W-2 document from pending AI-filled values", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{
        ...completeW2Entry,
        employerName: "Official fixture employer",
        employerEin: "12-3456789",
        wages: "50000",
        federalWithheld: "5000",
        aiSuggestedFields: {
          employerName: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          employerEin: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          wages: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
          federalWithheld: {
            sourceLabel: "2026 Form W-2 (official info-copy PDF)",
            status: "pending-confirmation",
          },
        },
      }],
    });

    expect(buildGuidedSyntheticDocuments(state)).toEqual([]);
  });

  it("creates 1099-NEC synthetic document from self-employment data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "25000" }],
      manualGrossReceipts: "0",
      expenses: completeBusinessExpenses,
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs.map(document => document.id)).toEqual(["guided:1099-nec", "guided:schedule-c"]);
    expect(docs[0].kind).toBe("1099-nec");
  });

  it("creates a Schedule C synthetic document for manual self-employment income", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["self-employment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [emptyNecEntry],
      manualGrossReceipts: "12000",
      expenses: completeBusinessExpenses,
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "guided:schedule-c",
        kind: "schedule-c-support",
      }),
    ]));
  });

  it("creates investment documents for interest, dividends, and brokerage", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "500" }],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "1000" }],
      brokerageEntries: [{
        ...completeBrokerageSource,
        broker: "Fidelity",
        transactions: [{ ...completeTransactionSource, proceeds: "10000", costBasis: "8000" }],
      }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const kinds = docs.map((d) => d.kind);
    expect(kinds).toContain("1099-int");
    expect(kinds).toContain("1099-div");
    expect(kinds).toContain("1099-b");
  });

  it("creates retirement document from 1099-R data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["retirement"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-retirement", {
      entries: [{ ...emptyRetirementEntry, grossDistribution: "30000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs.find((d) => d.kind === "1099-r")).toBeTruthy();
  });

  it("creates SSA-1099 document from Social Security data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["social-security"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-social-security", {
      ...emptySocialSecurityData,
      netBenefits: "18000",
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs.find((d) => d.kind === "ssa-1099")).toBeTruthy();
  });

  it("creates 1099-G document from unemployment data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["unemployment"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-unemployment", {
      ...emptyUnemploymentData,
      compensation: "8500",
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs.find((d) => d.kind === "1099-g")).toBeTruthy();
  });

  it("creates multiple documents for complex filer", () => {
    let state = startInterview({
      filingStatus: "mfj",
      incomeTypes: ["w2-wages", "self-employment", "investments", "retirement"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "80000" }],
    });
    state = updateSectionData(state, "income-self-employment", {
      ...completeBusinessSection,
      necEntries: [{ ...completeNecSource, nonemployeeCompensation: "40000" }],
      expenses: completeBusinessExpenses,
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "1000" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    state = updateSectionData(state, "income-retirement", {
      entries: [{ ...emptyRetirementEntry, taxableAmount: "20000" }],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    const kinds = docs.map((d) => d.kind);
    expect(kinds).toContain("w2");
    expect(kinds).toContain("1099-nec");
    expect(kinds).toContain("1099-int");
    expect(kinds).toContain("1099-r");
  });

  it("skips documents for empty section data", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [emptyW2Entry],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    expect(docs).toHaveLength(0);
  });

  it("all synthetic document IDs are prefixed with guided:", () => {
    let state = startInterview({
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: null,
    });
    state = updateSectionData(state, "income-w2", {
      entries: [{ ...completeW2Entry, wages: "50000" }],
    });
    state = updateSectionData(state, "income-investments", {
      interestEntries: [{ ...completeInterestSource, interestIncome: "500" }],
      dividendEntries: [emptyDividendEntry],
      brokerageEntries: [emptyBrokerageEntry],
    });
    const docs = buildGuidedSyntheticDocuments(state);
    for (const doc of docs) {
      expect(doc.id.startsWith("guided:")).toBe(true);
    }
  });
});
