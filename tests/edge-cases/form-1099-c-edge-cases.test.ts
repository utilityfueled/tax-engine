/**
 * Edge case tests for Form 1099-C — Cancellation of Debt
 * Spec: spec/federal/form-1099-c.yaml
 *
 * Covers: exclusion priority ordering, insolvency boundary precision,
 * QPR cap boundaries ($750K/$375K MFS), multi-exclusion stacking,
 * filing status cap variations, and remaining-COD limiting.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099C } from "@/engine/forms/form-1099-c.js";
import type { Form1099C, CodExclusion } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";

const DEFAULT_CONSTANTS = {
  qualifiedPrincipalResidenceExclusion: {
    maxExclusion: new Decimal(750000),
    maxExclusionMFS: new Decimal(375000),
  },
};

function make1099C(overrides: Partial<Form1099C> = {}): Form1099C {
  return {
    creditor: overrides.creditor ?? "Test Creditor",
    amountDischarged: overrides.amountDischarged ?? "0",
    interestIncluded: overrides.interestIncluded,
    debtDescription: overrides.debtDescription,
    personallyLiable: overrides.personallyLiable ?? false,
    identifiableEventCode: overrides.identifiableEventCode,
    fmvOfProperty: overrides.fmvOfProperty,
  };
}

function calc(
  forms: Form1099C[],
  exclusion?: CodExclusion,
  filingStatus: FilingStatus = "single",
  constants = DEFAULT_CONSTANTS,
) {
  return calculateForm1099C(forms, exclusion, filingStatus, constants);
}

describe("Form 1099-C edge cases — insolvency boundary precision", () => {
  it("Form 1099-C insolvency - liabilities exceed assets by exactly $1 excludes $1", () => {
    const result = calc(
      [make1099C({ amountDischarged: "10000" })],
      { insolvency: { totalLiabilities: "50001", totalAssets: "50000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(1));
    expect(result.taxableCodIncome).toEqual(new Decimal(9999));
  });

  it("Form 1099-C insolvency - liabilities equal assets yields zero exclusion (solvent)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "25000" })],
      { insolvency: { totalLiabilities: "100000", totalAssets: "100000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(25000));
  });

  it("Form 1099-C insolvency - assets exceed liabilities yields zero exclusion (solvent)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "15000" })],
      { insolvency: { totalLiabilities: "80000", totalAssets: "80001" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(15000));
  });

  it("Form 1099-C insolvency - insolvency amount exactly equals COD (perfect match)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "20000" })],
      { insolvency: { totalLiabilities: "120000", totalAssets: "100000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(20000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C insolvency - insolvency exceeds COD by $1 still caps at COD", () => {
    const result = calc(
      [make1099C({ amountDischarged: "20000" })],
      { insolvency: { totalLiabilities: "120001", totalAssets: "100000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(20000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C insolvency - insolvency $1 less than COD leaves $1 taxable", () => {
    const result = calc(
      [make1099C({ amountDischarged: "20000" })],
      { insolvency: { totalLiabilities: "119999", totalAssets: "100000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(19999));
    expect(result.taxableCodIncome).toEqual(new Decimal(1));
  });
});

describe("Form 1099-C edge cases — qualified principal residence cap boundaries", () => {
  it("Form 1099-C QPR - discharged exactly at $750,000 cap (single)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "750000" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "750000" } },
      "single",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(750000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR - discharged $1 over $750,000 cap (single) — excess is taxable", () => {
    const result = calc(
      [make1099C({ amountDischarged: "750001" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "750001" } },
      "single",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(750000));
    expect(result.taxableCodIncome).toEqual(new Decimal(1));
  });

  it("Form 1099-C QPR - discharged $1 under $750,000 cap (single)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "749999" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "749999" } },
      "single",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(749999));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR - MFS at exactly $375,000 cap", () => {
    const result = calc(
      [make1099C({ amountDischarged: "375000" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "375000" } },
      "married_filing_separately",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(375000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR - MFS $1 over $375,000 cap — excess is taxable", () => {
    const result = calc(
      [make1099C({ amountDischarged: "375001" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "375001" } },
      "married_filing_separately",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(375000));
    expect(result.taxableCodIncome).toEqual(new Decimal(1));
  });

  it("Form 1099-C QPR - MFJ uses $750,000 cap, not MFS", () => {
    const result = calc(
      [make1099C({ amountDischarged: "600000" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "600000" } },
      "married_filing_jointly",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(600000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR - HoH uses $750,000 cap", () => {
    const result = calc(
      [make1099C({ amountDischarged: "750000" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "750000" } },
      "head_of_household",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(750000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR - QSS uses $750,000 cap", () => {
    const result = calc(
      [make1099C({ amountDischarged: "750000" })],
      { qualifiedPrincipalResidence: { dischargedAmount: "750000" } },
      "qualifying_surviving_spouse",
    );
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(750000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });
});

describe("Form 1099-C edge cases — exclusion priority and stacking", () => {
  it("Form 1099-C priority - bankruptcy preempts insolvency (insolvency gets $0)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "50000" })],
      {
        bankruptcy: true,
        insolvency: { totalLiabilities: "200000", totalAssets: "100000" },
      },
    );
    expect(result.bankruptcyExclusion).toEqual(new Decimal(50000));
    expect(result.insolvencyExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C priority - bankruptcy preempts QPR (QPR gets $0)", () => {
    const result = calc(
      [make1099C({ amountDischarged: "100000" })],
      {
        bankruptcy: true,
        qualifiedPrincipalResidence: { dischargedAmount: "100000" },
      },
    );
    expect(result.bankruptcyExclusion).toEqual(new Decimal(100000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C priority - bankruptcy preempts all other exclusions", () => {
    const result = calc(
      [make1099C({ amountDischarged: "200000" })],
      {
        bankruptcy: true,
        insolvency: { totalLiabilities: "500000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "200000" },
        qualifiedFarmExclusion: "50000",
        qualifiedRealPropertyBusinessExclusion: "50000",
      },
    );
    expect(result.bankruptcyExclusion).toEqual(new Decimal(200000));
    expect(result.insolvencyExclusion).toEqual(new Decimal(0));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(0));
    expect(result.qualifiedFarmExclusion).toEqual(new Decimal(0));
    expect(result.qualifiedRealPropertyBusinessExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C stacking - insolvency partially excludes, QPR handles remainder up to cap", () => {
    // $80K COD, $30K insolvency → $50K remaining, QPR covers $50K (under cap)
    const result = calc(
      [make1099C({ amountDischarged: "80000" })],
      {
        insolvency: { totalLiabilities: "130000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "80000" },
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(30000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(50000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C stacking - insolvency + QPR + farm all apply, each limited to remaining", () => {
    // $100K COD, insolvency $20K, QPR (discharged $50K, under cap) $50K, farm $30K
    const result = calc(
      [make1099C({ amountDischarged: "100000" })],
      {
        insolvency: { totalLiabilities: "120000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "50000" },
        qualifiedFarmExclusion: "40000",
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(20000));
    // QPR: min(remaining $80K, discharged $50K, cap $750K) = $50K
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(50000));
    // Farm: min(remaining $30K, claimed $40K) = $30K (limited to remaining)
    expect(result.qualifiedFarmExclusion).toEqual(new Decimal(30000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C stacking - farm and real property business both apply in order", () => {
    // $50K COD, no insolvency/QPR, farm $20K, real property $40K
    const result = calc(
      [make1099C({ amountDischarged: "50000" })],
      {
        qualifiedFarmExclusion: "20000",
        qualifiedRealPropertyBusinessExclusion: "40000",
      },
    );
    expect(result.qualifiedFarmExclusion).toEqual(new Decimal(20000));
    // Real property: min(remaining $30K, claimed $40K) = $30K
    expect(result.qualifiedRealPropertyBusinessExclusion).toEqual(new Decimal(30000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C stacking - all five exclusions at once, each consuming remaining COD", () => {
    // $500K total COD
    // Bankruptcy = false, insolvency $100K, QPR $200K, farm $100K, real prop $150K
    // Total exclusions should cap at $500K
    const result = calc(
      [make1099C({ amountDischarged: "500000" })],
      {
        insolvency: { totalLiabilities: "200000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "200000" },
        qualifiedFarmExclusion: "100000",
        qualifiedRealPropertyBusinessExclusion: "150000",
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(100000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(200000));
    expect(result.qualifiedFarmExclusion).toEqual(new Decimal(100000));
    expect(result.qualifiedRealPropertyBusinessExclusion).toEqual(new Decimal(100000));
    expect(result.totalExclusions).toEqual(new Decimal(500000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C stacking - total exclusions exceed COD, later exclusions get reduced", () => {
    // $30K COD, insolvency $20K, QPR $20K, farm $10K — farm capped to $0
    const result = calc(
      [make1099C({ amountDischarged: "30000" })],
      {
        insolvency: { totalLiabilities: "120000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "20000" },
        qualifiedFarmExclusion: "10000",
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(20000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(10000));
    expect(result.qualifiedFarmExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });
});

describe("Form 1099-C edge cases — QPR limited by remaining COD after prior exclusions", () => {
  it("Form 1099-C QPR after insolvency - QPR limited to remaining COD, not discharged amount", () => {
    // $100K COD, insolvency $90K, QPR discharged $100K → QPR only gets $10K (remaining)
    const result = calc(
      [make1099C({ amountDischarged: "100000" })],
      {
        insolvency: { totalLiabilities: "190000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "100000" },
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(90000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(10000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C QPR after full insolvency - QPR gets $0 when insolvency covers all COD", () => {
    const result = calc(
      [make1099C({ amountDischarged: "50000" })],
      {
        insolvency: { totalLiabilities: "200000", totalAssets: "100000" },
        qualifiedPrincipalResidence: { dischargedAmount: "50000" },
      },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(50000));
    expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });
});

describe("Form 1099-C edge cases — multiple 1099-C forms with exclusions", () => {
  it("Form 1099-C multiple forms - aggregate COD from 3 creditors with partial insolvency", () => {
    const result = calc(
      [
        make1099C({ creditor: "Bank A", amountDischarged: "10000" }),
        make1099C({ creditor: "Bank B", amountDischarged: "15000" }),
        make1099C({ creditor: "Bank C", amountDischarged: "25000" }),
      ],
      { insolvency: { totalLiabilities: "130000", totalAssets: "100000" } },
    );
    expect(result.totalCancelledDebt).toEqual(new Decimal(50000));
    expect(result.insolvencyExclusion).toEqual(new Decimal(30000));
    expect(result.taxableCodIncome).toEqual(new Decimal(20000));
  });

  it("Form 1099-C multiple forms - total interest tracked separately from exclusions", () => {
    const result = calc(
      [
        make1099C({ amountDischarged: "5000", interestIncluded: "500" }),
        make1099C({ amountDischarged: "3000", interestIncluded: "200" }),
      ],
      { insolvency: { totalLiabilities: "110000", totalAssets: "100000" } },
    );
    expect(result.totalCancelledDebt).toEqual(new Decimal(8000));
    expect(result.totalInterestIncluded).toEqual(new Decimal(700));
    expect(result.insolvencyExclusion).toEqual(new Decimal(8000)); // insolvency $10K > COD $8K
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });
});

describe("Form 1099-C edge cases — zero and extreme values", () => {
  it("Form 1099-C zero COD - $0 discharged produces all-zero result", () => {
    const result = calc(
      [make1099C({ amountDischarged: "0" })],
      { insolvency: { totalLiabilities: "200000", totalAssets: "100000" } },
    );
    expect(result.totalCancelledDebt).toEqual(new Decimal(0));
    expect(result.insolvencyExclusion).toEqual(new Decimal(0));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C very large - $10M COD with large insolvency", () => {
    const result = calc(
      [make1099C({ amountDischarged: "10000000" })],
      { insolvency: { totalLiabilities: "15000000", totalAssets: "3000000" } },
    );
    expect(result.insolvencyExclusion).toEqual(new Decimal(10000000));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });

  it("Form 1099-C $1 COD - minimum meaningful amount", () => {
    const result = calc(
      [make1099C({ amountDischarged: "1" })],
    );
    expect(result.totalCancelledDebt).toEqual(new Decimal(1));
    expect(result.taxableCodIncome).toEqual(new Decimal(1));
  });

  it("Form 1099-C $1 COD with bankruptcy - $1 fully excluded", () => {
    const result = calc(
      [make1099C({ amountDischarged: "1" })],
      { bankruptcy: true },
    );
    expect(result.bankruptcyExclusion).toEqual(new Decimal(1));
    expect(result.taxableCodIncome).toEqual(new Decimal(0));
  });
});
