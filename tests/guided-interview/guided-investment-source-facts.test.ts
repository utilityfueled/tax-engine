// Spec: spec/federal/guided-input.yaml, investment-source-records
import { describe, expect, it } from "vitest";
import { buildBrokerageInputs, buildDividendInputs, buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildInterestInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { investmentFactErrors } from "@/lib/guided-investment-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { completeBrokerageSource, completeDividendSource, completeInterestSource, completeTransactionSource, startCompleteInterview } from "./complete-facts";
import { emptyStateReturnData } from "@/lib/guided-interview-flow";

function interview() { return startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null }); }

describe("guided investment source records", () => {
  it("preserves explicit zero records and actual investment amounts without invented payers", () => {
    expect(buildInterestInputs([completeInterestSource])).toEqual([expect.objectContaining({ payer: "Actual bank", interestIncome: "0", earlyWithdrawalPenalty: "0", taxExemptInterest: "0", federalWithheld: "0" })]);
    expect(buildDividendInputs([completeDividendSource])).toEqual([expect.objectContaining({ payer: "Actual fund", ordinaryDividends: "0", section1250Gain: "0", exemptInterestDividends: "0" })]);
    expect(buildBrokerageInputs([completeBrokerageSource])[0].transactions).toHaveLength(1);
    expect(buildInterestInputs([{ ...completeInterestSource, payer: "", interestIncome: "9007199254740993.01", federalWithheld: "" }])[0]).toMatchObject({ payer: "", interestIncome: "9007199254740993.01", federalWithheld: undefined });
  });
  it("requires actual owners and every source amount before calculating a started record", () => {
    const state = interview();
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "12.34" }], dividendEntries: [], brokerageEntries: [] };
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
    for (const field of ["payer", "accountHolder", "federalWithheld", "earlyWithdrawalPenalty", "usSavingsBondInterest", "foreignTaxPaid", "taxExemptInterest", "stateTaxReporting"] as const) {
      state.sectionData["income-investments"].interestEntries = [{ ...completeInterestSource, interestIncome: "12.34", [field]: "" }];
      expect(buildTaxInputFromGuidedData(state), field).toBeNull();
    }
  });
  it("blocks unconfirmed old sale classifications and impossible source dates", () => {
    const state = interview();
    state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [{ ...completeBrokerageSource, transactions: [{ ...completeTransactionSource, proceeds: "1", costBasis: "2" }] }] };
    expect(buildTaxInputFromGuidedData(state)?.form1099B[0].transactions[0]).toMatchObject({ proceeds: "1", costBasis: "2", basisReportedToIRS: false, digitalAsset: false });
    for (const update of [{ sourceClassificationConfirmed: undefined }, { basisReportedToIRS: null }, { digitalAsset: null }, { dateSold: "2025-02-30" }, { dateSold: "2026-02-03" }, { dateAcquired: "2025-03-01" }, { holdingPeriod: "" }]) {
      state.sectionData["income-investments"].brokerageEntries = [{ ...completeBrokerageSource, transactions: [{ ...completeTransactionSource, ...update }] }];
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(update)).toBeNull();
    }
  });
  it("retains but blocks unsupported source amounts rather than discarding them", () => {
    const state = interview();
    for (const field of ["privateActivityBondInterest", "marketDiscount", "bondPremium", "treasuryBondPremium", "taxExemptBondPremium"] as const) {
      state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, [field]: "0.01" }], dividendEntries: [], brokerageEntries: [] };
      expect(buildTaxInputFromGuidedData(state), field).toBeNull();
    }
    state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [{ ...completeDividendSource, nondividendDistributions: "0.01" }], brokerageEntries: [] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [{ ...completeBrokerageSource, federalWithheld: "0.01" }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("preserves source-state withholding once and requires reconciliation of duplicate additional records", () => {
    const state = interview();
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "100", stateTaxReporting: "single", state: "NY", stateWithheld: "0.01" }], dividendEntries: [], brokerageEntries: [] };
    expect(buildTaxInputFromGuidedData(state)?.form1099Int[0]).toMatchObject({ state: "NY", stateWithheld: "0.01" });
    state.sectionData["state-return"] = { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: "Actual bank", documentType: "1099-INT", state: "NY", taxYear: "2025", amount: "0.01" }] };
    expect(Object.values(investmentFactErrors(state.sectionData["income-investments"], "single", 2025, state.sectionData["state-return"])).join(" ")).toMatch(/already|duplicate|twice/i);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    state.sectionData["state-return"] = undefined;
    state.sectionData["income-investments"].interestEntries[0].stateTaxReporting = "none";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("preserves actual wash-sale adjustments while rejecting contradictory or missing source classifications", () => {
    const state = interview();
    state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [{ ...completeBrokerageSource, transactions: [{ ...completeTransactionSource, proceeds: "600", costBasis: "1000", washSale: true, washSaleDisallowed: "300" }] }] };
    expect(buildTaxInputFromGuidedData(state)?.form1099B[0].transactions[0]).toMatchObject({ proceeds: "600", costBasis: "1000", washSale: true, washSaleDisallowed: "300", adjustments: "0" });
    state.sectionData["income-investments"].brokerageEntries[0].transactions[0].washSale = false;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("keeps zero and incomplete source records visible without inventing ledger totals", () => {
    const state = interview();
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "0.10", usSavingsBondInterest: "0.20" }], dividendEntries: [completeDividendSource], brokerageEntries: [completeBrokerageSource] };
    expect(buildGuidedFactAnswers(state)).toContainEqual({ factId: "taxable-interest", answerText: "Taxable interest entered: $0.30." });
    expect(buildGuidedFactAnswers(state)).toContainEqual({ factId: "ordinary-dividends", answerText: "Ordinary dividends entered: $0." });
    expect(buildGuidedSyntheticDocuments(state)).toHaveLength(3);
    state.sectionData["income-investments"].interestEntries[0].interestIncome = "incomplete";
    expect(buildGuidedFactAnswers(state)).toContainEqual({ factId: "taxable-interest", answerText: "Interest source records entered; some taxable amounts still need review." });
    expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "1099-int")?.coverage).toBe("partially-supported");
  });
  it("credits only matching source-state investment withholding with exact cents", () => {
    const state = interview();
    state.segmentation.stateCode = "PA";
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, stateTaxReporting: "single", state: "PA", stateWithheld: "0.10" }], dividendEntries: [{ ...completeDividendSource, stateTaxReporting: "single", state: "PA", stateWithheld: "0.20" }], brokerageEntries: [{ ...completeBrokerageSource, stateTaxReporting: "single", state: "NY", stateWithheld: "400" }] };
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0.3");
    state.sectionData["income-investments"].brokerageEntries[0].state = "PA";
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("400.3");
  });
});
