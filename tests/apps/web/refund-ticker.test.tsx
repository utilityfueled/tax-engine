import { describe, expect, it } from "vitest";
import {
  formatFilingStatus,
  formatTickerCurrency,
  formatAnimatedCurrency,
  computeRawTarget,
  computeTickerLabel,
  computeTickerClass,
  computeTickerDisplayValue,
  computeBreakdownRows,
  computeStateTickerInfo,
  computeStateBreakdownRows,
  computeFederalTickerInfo,
  buildCombinedInputFromPreview,
  computeNetResult,
  computeHeroAmount,
  computeCombinedTickerLabel,
  computeCombinedTickerClass,
  computeTickerHeroState,
  computeTickerHeroText,
  type CombinedTickerInput,
  type TickerHeroState,
} from "../../../apps/web/src/components/refund-ticker";
import type { WorkspaceEnginePreview } from "@tax-engine/contracts";

function buildPreview(
  overrides: Partial<WorkspaceEnginePreview> & {
    metrics?: Partial<WorkspaceEnginePreview["metrics"]>;
  } = {}
): WorkspaceEnginePreview {
  const defaults: WorkspaceEnginePreview = {
    mode: "engine-recompute",
    title: "2025 Federal Return",
    taxYear: 2025,
    filingStatus: "single",
    sourceDocumentIds: [],
    sourceFixtureIds: [],
    assumptions: [],
    metrics: {
      totalIncome: "50000",
      agi: "47000",
      taxableIncome: "32000",
      totalTax: "3600",
      totalPayments: "5000",
      refund: "1400",
      amountOwed: "0",
    },
    highlightedLines: [],
  };

  return {
    ...defaults,
    ...overrides,
    metrics: { ...defaults.metrics, ...overrides.metrics },
  };
}

describe("formatTickerCurrency", () => {
  it("formats a number as USD with no decimals", () => {
    expect(formatTickerCurrency(1400)).toBe("$1,400");
  });

  it("formats a string-number as USD", () => {
    expect(formatTickerCurrency("50000")).toBe("$50,000");
  });

  it("formats zero", () => {
    expect(formatTickerCurrency(0)).toBe("$0");
  });

  it("formats large values with commas", () => {
    expect(formatTickerCurrency(1234567)).toBe("$1,234,567");
  });

  it("returns em dash for undefined", () => {
    expect(formatTickerCurrency(undefined)).toBe("\u2014");
  });

  it("returns em dash for NaN string", () => {
    expect(formatTickerCurrency("not-a-number")).toBe("\u2014");
  });

  it("formats negative number with minus sign", () => {
    expect(formatTickerCurrency(-1400)).toBe("-$1,400");
  });

  it("rounds fractional cents to nearest dollar", () => {
    expect(formatTickerCurrency(1400.75)).toBe("$1,401");
    expect(formatTickerCurrency("999.49")).toBe("$999");
  });

  it("formats string with decimal as USD", () => {
    expect(formatTickerCurrency("50000.00")).toBe("$50,000");
  });
});

describe("formatAnimatedCurrency", () => {
  it("formats a positive number as USD", () => {
    expect(formatAnimatedCurrency(1400)).toBe("$1,400");
  });

  it("formats zero", () => {
    expect(formatAnimatedCurrency(0)).toBe("$0");
  });

  it("formats negative number", () => {
    expect(formatAnimatedCurrency(-500)).toBe("-$500");
  });
});

describe("formatFilingStatus", () => {
  it("formats single", () => {
    expect(formatFilingStatus("single")).toBe("Single");
  });

  it("formats married_filing_jointly", () => {
    expect(formatFilingStatus("married_filing_jointly")).toBe("Married Filing Jointly");
  });

  it("formats married_filing_separately", () => {
    expect(formatFilingStatus("married_filing_separately")).toBe("Married Filing Separately");
  });

  it("formats head_of_household", () => {
    expect(formatFilingStatus("head_of_household")).toBe("Head of Household");
  });

  it("formats qualifying_surviving_spouse", () => {
    expect(formatFilingStatus("qualifying_surviving_spouse")).toBe("Qualifying Surviving Spouse");
  });

  it("returns unknown values as-is", () => {
    expect(formatFilingStatus("some_future_status")).toBe("some_future_status");
  });
});

describe("computeRawTarget", () => {
  it("returns 0 when preview is null", () => {
    expect(computeRawTarget(null)).toBe(0);
  });

  it("returns positive value for refund", () => {
    const preview = buildPreview({ metrics: { refund: "1400", amountOwed: "0" } });
    expect(computeRawTarget(preview)).toBe(1400);
  });

  it("returns negative value for amount owed", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "2300" } });
    expect(computeRawTarget(preview)).toBe(-2300);
  });

  it("returns 0 when both refund and owed are zero", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "0" } });
    expect(computeRawTarget(preview)).toBe(0);
  });

  it("prefers refund when both are positive", () => {
    const preview = buildPreview({ metrics: { refund: "500", amountOwed: "200" } });
    expect(computeRawTarget(preview)).toBe(500);
  });

  it("handles decimal string metrics", () => {
    const preview = buildPreview({ metrics: { refund: "1400.50", amountOwed: "0" } });
    expect(computeRawTarget(preview)).toBe(1400.5);
  });
});

describe("computeTickerLabel", () => {
  it("returns Estimated Refund when refund is positive", () => {
    const preview = buildPreview({ metrics: { refund: "1400", amountOwed: "0" } });
    expect(computeTickerLabel(preview)).toBe("Estimated Refund");
  });

  it("returns Estimated Balance Due when amount owed is positive", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "800" } });
    expect(computeTickerLabel(preview)).toBe("Estimated Balance Due");
  });

  it("returns Estimated Result when both are zero", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "0" } });
    expect(computeTickerLabel(preview)).toBe("Estimated Result");
  });
});

describe("computeTickerClass", () => {
  it("returns positive class for positive value", () => {
    expect(computeTickerClass(1400)).toBe("guided-ticker-positive");
  });

  it("returns negative class for negative value", () => {
    expect(computeTickerClass(-800)).toBe("guided-ticker-negative");
  });

  it("returns empty string for zero", () => {
    expect(computeTickerClass(0)).toBe("");
  });
});

describe("computeTickerDisplayValue", () => {
  it("formats the absolute animated value as currency", () => {
    expect(computeTickerDisplayValue(1400, 1400, 0)).toBe("$1,400");
  });

  it("formats negative animated value using absolute", () => {
    expect(computeTickerDisplayValue(-800, 0, 800)).toBe("$800");
  });

  it("returns $0 when everything is zero", () => {
    expect(computeTickerDisplayValue(0, 0, 0)).toBe("$0");
  });

  it("formats mid-animation value when refund is still resolving", () => {
    // During animation, animatedValue may be 700 while target is 1400
    expect(computeTickerDisplayValue(700, 1400, 0)).toBe("$700");
  });

  it("formats zero animated value but non-zero refund as $0 (not special case)", () => {
    // animatedValue is 0 but refund > 0 means animation is starting
    expect(computeTickerDisplayValue(0, 1400, 0)).toBe("$0");
  });
});

describe("computeBreakdownRows", () => {
  it("returns 6 rows for standard metrics", () => {
    const preview = buildPreview();
    const rows = computeBreakdownRows(preview.metrics);
    expect(rows).toHaveLength(6);
  });

  it("labels rows in the correct order", () => {
    const preview = buildPreview();
    const labels = computeBreakdownRows(preview.metrics).map((r) => r.label);
    expect(labels).toEqual([
      "Total Income",
      "Adjusted Gross Income",
      "Taxable Income",
      "Total Tax",
      "Total Payments / Withholding",
      "Refund",
    ]);
  });

  it("formats all values as currency", () => {
    const preview = buildPreview({
      metrics: {
        totalIncome: "50000",
        agi: "47000",
        taxableIncome: "32000",
        totalTax: "3600",
        totalPayments: "5000",
        refund: "1400",
        amountOwed: "0",
      },
    });
    const rows = computeBreakdownRows(preview.metrics);
    expect(rows[0].value).toBe("$50,000");
    expect(rows[1].value).toBe("$47,000");
    expect(rows[2].value).toBe("$32,000");
    expect(rows[3].value).toBe("$3,600");
    expect(rows[4].value).toBe("$5,000");
    expect(rows[5].value).toBe("$1,400");
  });

  it("uses Refund label and refund class when refund is positive", () => {
    const preview = buildPreview({ metrics: { refund: "1400", amountOwed: "0" } });
    const rows = computeBreakdownRows(preview.metrics);
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Refund");
    expect(resultRow.className).toContain("guided-ticker-breakdown-refund");
  });

  it("uses Balance Due label and owed class when amount owed is positive", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "2300" } });
    const rows = computeBreakdownRows(preview.metrics);
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Balance Due");
    expect(resultRow.value).toBe("$2,300");
    expect(resultRow.className).toContain("guided-ticker-breakdown-owed");
  });

  it("uses Result label with em dash when both are zero", () => {
    const preview = buildPreview({ metrics: { refund: "0", amountOwed: "0" } });
    const rows = computeBreakdownRows(preview.metrics);
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Result");
    expect(resultRow.value).toBe("\u2014");
  });

  it("applies separator class to Total Tax row", () => {
    const preview = buildPreview();
    const rows = computeBreakdownRows(preview.metrics);
    const taxRow = rows.find((r) => r.label === "Total Tax");
    expect(taxRow?.className).toContain("guided-ticker-breakdown-separator");
  });

  it("applies result class to the last row", () => {
    const preview = buildPreview();
    const rows = computeBreakdownRows(preview.metrics);
    const resultRow = rows[rows.length - 1];
    expect(resultRow.className).toContain("guided-ticker-breakdown-result");
  });
});

describe("computeStateTickerInfo", () => {
  it("returns refund info with positive class when state has refund", () => {
    const info = computeStateTickerInfo({
      stateCode: "OH",
      stateTax: "1200",
      totalPayments: "1800",
      refund: "600",
      amountOwed: "0",
    });
    expect(info.stateCode).toBe("OH");
    expect(info.label).toBe("OH Refund");
    expect(info.value).toBe("$600");
    expect(info.className).toContain("guided-ticker-positive");
    expect(info.rawTarget).toBe(600);
  });

  it("returns balance due info with negative class when state has balance due", () => {
    const info = computeStateTickerInfo({
      stateCode: "ca",
      stateTax: "3000",
      totalPayments: "2500",
      refund: "0",
      amountOwed: "500",
    });
    expect(info.stateCode).toBe("CA");
    expect(info.label).toBe("CA Balance Due");
    expect(info.value).toBe("$500");
    expect(info.className).toContain("guided-ticker-negative");
    expect(info.rawTarget).toBe(-500);
  });

  it("returns zero result when state has no refund or balance due", () => {
    const info = computeStateTickerInfo({
      stateCode: "PA",
      stateTax: "1000",
      totalPayments: "1000",
      refund: "0",
      amountOwed: "0",
    });
    expect(info.stateCode).toBe("PA");
    expect(info.label).toBe("PA Result");
    expect(info.value).toBe("$0");
    expect(info.className).toBe("guided-ticker-sub");
    expect(info.rawTarget).toBe(0);
  });

  it("uppercases state code from input", () => {
    const info = computeStateTickerInfo({
      stateCode: "ny",
      stateTax: "0",
      totalPayments: "0",
      refund: "0",
      amountOwed: "0",
    });
    expect(info.stateCode).toBe("NY");
    expect(info.label).toBe("NY Result");
  });
});

describe("computeStateBreakdownRows", () => {
  it("returns 4 rows for state breakdown", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "OH",
      stateTax: "1200",
      totalPayments: "1800",
      refund: "600",
      amountOwed: "0",
    });
    expect(rows).toHaveLength(4);
  });

  it("includes state header with uppercase state code", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "oh",
      stateTax: "1200",
      totalPayments: "1800",
      refund: "600",
      amountOwed: "0",
    });
    expect(rows[0].label).toBe("OH State Return");
    expect(rows[0].className).toContain("guided-ticker-breakdown-state-header");
  });

  it("formats state tax and payments as currency", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "PA",
      stateTax: "2500",
      totalPayments: "3000",
      refund: "500",
      amountOwed: "0",
    });
    expect(rows[1].label).toBe("State Tax");
    expect(rows[1].value).toBe("$2,500");
    expect(rows[2].label).toBe("State Payments / Withholding");
    expect(rows[2].value).toBe("$3,000");
  });

  it("shows Refund with refund class when state has refund", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "IL",
      stateTax: "1000",
      totalPayments: "1500",
      refund: "500",
      amountOwed: "0",
    });
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Refund");
    expect(resultRow.value).toBe("$500");
    expect(resultRow.className).toContain("guided-ticker-breakdown-refund");
  });

  it("shows Balance Due with owed class when state has balance due", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "NY",
      stateTax: "4000",
      totalPayments: "3200",
      refund: "0",
      amountOwed: "800",
    });
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Balance Due");
    expect(resultRow.value).toBe("$800");
    expect(resultRow.className).toContain("guided-ticker-breakdown-owed");
  });

  it("shows Result with em dash when state has neither refund nor balance due", () => {
    const rows = computeStateBreakdownRows({
      stateCode: "WA",
      stateTax: "0",
      totalPayments: "0",
      refund: "0",
      amountOwed: "0",
    });
    const resultRow = rows[rows.length - 1];
    expect(resultRow.label).toBe("Result");
    expect(resultRow.value).toBe("\u2014");
  });
});

// ── Combined federal + state ticker helpers ──────────────────────────────────

function fedOnly(refund: number, owed: number): CombinedTickerInput {
  return { federalRefund: refund, federalOwed: owed, stateRefund: null, stateOwed: null };
}

function fedAndState(
  fedRefund: number,
  fedOwed: number,
  stRefund: number,
  stOwed: number,
): CombinedTickerInput {
  return { federalRefund: fedRefund, federalOwed: fedOwed, stateRefund: stRefund, stateOwed: stOwed };
}

describe("computeNetResult", () => {
  it("returns federal refund when no state", () => {
    expect(computeNetResult(fedOnly(1400, 0))).toBe(1400);
  });

  it("returns negative when federal owed and no state", () => {
    expect(computeNetResult(fedOnly(0, 800))).toBe(-800);
  });

  it("combines federal refund and state refund", () => {
    expect(computeNetResult(fedAndState(1400, 0, 600, 0))).toBe(2000);
  });

  it("combines federal refund with state owed", () => {
    expect(computeNetResult(fedAndState(1400, 0, 0, 500))).toBe(900);
  });

  it("returns negative when state owed exceeds federal refund", () => {
    expect(computeNetResult(fedAndState(300, 0, 0, 500))).toBe(-200);
  });

  it("returns zero when everything cancels out", () => {
    expect(computeNetResult(fedAndState(500, 0, 0, 500))).toBe(0);
  });

  it("combines both owed amounts", () => {
    expect(computeNetResult(fedAndState(0, 800, 0, 200))).toBe(-1000);
  });

  it("treats null state as zero contribution", () => {
    const input: CombinedTickerInput = { federalRefund: 1000, federalOwed: 0, stateRefund: null, stateOwed: null };
    expect(computeNetResult(input)).toBe(1000);
  });
});

describe("computeHeroAmount", () => {
  it("returns federal refund when no state", () => {
    expect(computeHeroAmount(fedOnly(1400, 0))).toBe(1400);
  });

  it("returns federal owed when no state and owed", () => {
    expect(computeHeroAmount(fedOnly(0, 800))).toBe(800);
  });

  it("returns 0 when federal is zero and no state", () => {
    expect(computeHeroAmount(fedOnly(0, 0))).toBe(0);
  });

  it("returns absolute combined value when state is present", () => {
    expect(computeHeroAmount(fedAndState(1400, 0, 600, 0))).toBe(2000);
  });

  it("returns absolute combined when state owed exceeds federal refund", () => {
    expect(computeHeroAmount(fedAndState(300, 0, 0, 500))).toBe(200);
  });

  it("returns 0 when everything cancels out", () => {
    expect(computeHeroAmount(fedAndState(500, 0, 0, 500))).toBe(0);
  });
});

describe("computeCombinedTickerLabel", () => {
  it("returns Estimated Refund for federal-only refund", () => {
    expect(computeCombinedTickerLabel(fedOnly(1400, 0))).toBe("Estimated Refund");
  });

  it("returns Estimated Balance Due for federal-only owed", () => {
    expect(computeCombinedTickerLabel(fedOnly(0, 800))).toBe("Estimated Balance Due");
  });

  it("returns Estimated Result for federal-only zero", () => {
    expect(computeCombinedTickerLabel(fedOnly(0, 0))).toBe("Estimated Result");
  });

  it("returns Total Estimated Refund when combined net is positive", () => {
    expect(computeCombinedTickerLabel(fedAndState(1400, 0, 600, 0))).toBe("Total Estimated Refund");
  });

  it("returns Total Estimated Balance Due when combined net is negative", () => {
    expect(computeCombinedTickerLabel(fedAndState(0, 800, 0, 400))).toBe("Total Estimated Balance Due");
  });

  it("returns Estimated Result when combined net is zero", () => {
    expect(computeCombinedTickerLabel(fedAndState(500, 0, 0, 500))).toBe("Estimated Result");
  });

  it("returns Total Estimated Refund when state refund outweighs federal owed", () => {
    expect(computeCombinedTickerLabel(fedAndState(0, 300, 800, 0))).toBe("Total Estimated Refund");
  });
});

describe("computeCombinedTickerClass", () => {
  it("returns positive class for federal-only refund", () => {
    expect(computeCombinedTickerClass(fedOnly(1400, 0))).toBe("guided-ticker-positive");
  });

  it("returns negative class for federal-only owed", () => {
    expect(computeCombinedTickerClass(fedOnly(0, 800))).toBe("guided-ticker-negative");
  });

  it("returns empty string for federal-only zero", () => {
    expect(computeCombinedTickerClass(fedOnly(0, 0))).toBe("");
  });

  it("returns positive class when combined net is positive", () => {
    expect(computeCombinedTickerClass(fedAndState(1400, 0, 600, 0))).toBe("guided-ticker-positive");
  });

  it("returns negative class when combined net is negative", () => {
    expect(computeCombinedTickerClass(fedAndState(0, 800, 0, 400))).toBe("guided-ticker-negative");
  });

  it("returns empty string when combined net is zero", () => {
    expect(computeCombinedTickerClass(fedAndState(500, 0, 0, 500))).toBe("");
  });
});

// ── Federal ticker info (sub-item in combined mode) ─────────────────────────

describe("computeFederalTickerInfo", () => {
  it("returns refund info with positive class when federal has refund", () => {
    const info = computeFederalTickerInfo({
      totalIncome: "50000",
      agi: "47000",
      taxableIncome: "32000",
      totalTax: "3600",
      totalPayments: "5000",
      refund: "1400",
      amountOwed: "0",
    });
    expect(info.label).toBe("Federal Refund");
    expect(info.value).toBe("$1,400");
    expect(info.className).toContain("guided-ticker-positive");
  });

  it("returns balance due info with negative class when federal owes", () => {
    const info = computeFederalTickerInfo({
      totalIncome: "80000",
      agi: "80000",
      taxableIncome: "65000",
      totalTax: "10000",
      totalPayments: "7700",
      refund: "0",
      amountOwed: "2300",
    });
    expect(info.label).toBe("Federal Balance Due");
    expect(info.value).toBe("$2,300");
    expect(info.className).toContain("guided-ticker-negative");
  });

  it("returns zero result when federal has no refund or balance due", () => {
    const info = computeFederalTickerInfo({
      totalIncome: "0",
      agi: "0",
      taxableIncome: "0",
      totalTax: "0",
      totalPayments: "0",
      refund: "0",
      amountOwed: "0",
    });
    expect(info.label).toBe("Federal Result");
    expect(info.value).toBe("$0");
    expect(info.className).toBe("guided-ticker-sub");
  });
});

// ── buildCombinedInputFromPreview ───────────────────────────────────────────

describe("buildCombinedInputFromPreview", () => {
  it("returns federal-only input when no state metrics", () => {
    const preview = buildPreview({ metrics: { refund: "1400", amountOwed: "0" } });
    const result = buildCombinedInputFromPreview(preview);
    expect(result.federalRefund).toBe(1400);
    expect(result.federalOwed).toBe(0);
    expect(result.stateRefund).toBeNull();
    expect(result.stateOwed).toBeNull();
  });

  it("returns combined input when state metrics are present", () => {
    const preview = buildPreview({
      metrics: { refund: "1400", amountOwed: "0" },
      stateMetrics: {
        stateCode: "OH",
        stateTax: "1200",
        totalPayments: "1800",
        refund: "600",
        amountOwed: "0",
      },
    });
    const result = buildCombinedInputFromPreview(preview);
    expect(result.federalRefund).toBe(1400);
    expect(result.federalOwed).toBe(0);
    expect(result.stateRefund).toBe(600);
    expect(result.stateOwed).toBe(0);
  });

  it("handles state balance due", () => {
    const preview = buildPreview({
      metrics: { refund: "500", amountOwed: "0" },
      stateMetrics: {
        stateCode: "CA",
        stateTax: "3000",
        totalPayments: "2500",
        refund: "0",
        amountOwed: "500",
      },
    });
    const result = buildCombinedInputFromPreview(preview);
    expect(result.federalRefund).toBe(500);
    expect(result.stateOwed).toBe(500);
    expect(result.stateRefund).toBe(0);
  });
});

// ── Ticker hero state (empty / computing / ready) ───────────────────────────

describe("computeTickerHeroState", () => {
  it("returns 'computing' when computing flag is true, regardless of preview", () => {
    expect(computeTickerHeroState(null, true)).toBe("computing");
    expect(computeTickerHeroState(buildPreview(), true)).toBe("computing");
  });

  it("returns 'empty' when preview is null and not computing", () => {
    expect(computeTickerHeroState(null, false)).toBe("empty");
  });

  it("returns 'ready' when preview exists and not computing", () => {
    expect(computeTickerHeroState(buildPreview(), false)).toBe("ready");
  });
});

describe("computeTickerHeroText", () => {
  it("returns upload prompt for empty state with no workspace status", () => {
    expect(computeTickerHeroText("empty")).toBe("Upload tax documents to get an estimate");
  });

  it("returns upload prompt for empty state with 'empty' workspace status", () => {
    expect(computeTickerHeroText("empty", "empty")).toBe("Upload tax documents to get an estimate");
  });

  it("returns interview prompt for empty state with 'awaiting-interview' workspace status", () => {
    expect(computeTickerHeroText("empty", "awaiting-interview")).toBe("Answer interview questions to see your estimate");
  });

  it("returns review prompt for empty state with 'needs-review' workspace status", () => {
    expect(computeTickerHeroText("empty", "needs-review")).toBe("Review flagged items to see your estimate");
  });

  it("returns preparing text for empty state with 'ready-to-recompute' workspace status", () => {
    expect(computeTickerHeroText("empty", "ready-to-recompute")).toBe("Preparing your estimate\u2026");
  });

  it("returns upload prompt for empty state with null workspace status", () => {
    expect(computeTickerHeroText("empty", null)).toBe("Upload tax documents to get an estimate");
  });

  it("returns calculating text for computing state regardless of workspace status", () => {
    expect(computeTickerHeroText("computing")).toBe("Calculating\u2026");
    expect(computeTickerHeroText("computing", "empty")).toBe("Calculating\u2026");
    expect(computeTickerHeroText("computing", "awaiting-interview")).toBe("Calculating\u2026");
  });

  it("returns null for ready state regardless of workspace status", () => {
    expect(computeTickerHeroText("ready")).toBeNull();
    expect(computeTickerHeroText("ready", "awaiting-interview")).toBeNull();
    expect(computeTickerHeroText("ready", "ready-to-recompute")).toBeNull();
  });
});
