// @vitest-environment jsdom
// Spec: spec/federal/guided-direct-reit-dividend.yaml.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveQualifiedReitBox5 } from "@/engine/qbi-reit-dividend-source.js";
import { Form1099DivSchema } from "@/models/inputs.js";
import { SectionInvestmentIncome } from "@/components/guided-interview/section-investment-income";
import { buildDividendInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type DividendEntryData } from "@/lib/guided-interview-flow";
import { completeDividendSource, startCompleteInterview } from "./complete-facts";

const directSource = {
  sourceTaxYear: "2026", sourceReference: "Synthetic brokerage lot and issuer distribution records", sourceAsOfDate: "2026-06-30", sourceFactsConfirmed: true,
  securityIdentifier: "SYNTHREIT1", issuerName: "Synthetic Direct REIT", originalBox5Amount: "1000",
  acquiredOn: "2026-04-30", exDividendOn: "2026-06-15", paidOn: "2026-06-30", heldThrough: "2026-06-15",
  positionEnded: true, diminishedRiskDays: "0", relatedPaymentAmount: "0", singleDirectReitDistributionConfirmed: true,
};
const sourceStatement = { ...completeDividendSource, sourceTaxYear: "2026", accountReference: "Synthetic brokerage account A", ordinaryDividends: "1000", section199ADividends: "1000" };
const completed = { ...sourceStatement, directReitDividendFacts: directSource };

function household(entry: DividendEntryData, taxYear = 2026) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
  const data = { interestEntries: [], dividendEntries: [entry], brokerageEntries: [] };
  state.taxYear = taxYear;
  if (taxYear === 2026) state.sectionData.review = { qof2026Disclosure: false };
  state.sectionData["income-investments"] = data;
  return { state, data };
}

beforeEach(() => vi.setSystemTime(new Date(2026, 10, 26, 12)));
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

it("requires confirmed originals and reconciles 2026 Box 5 without rewriting reported income", () => {
  const missing = household(sourceStatement).state;
  expect(validateSection(missing, "income-investments").fieldErrors).toHaveProperty("dividend-0-directReitDividendFacts");
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  expect(() => buildDividendInputs([sourceStatement], 2026)).toThrow(/REIT|Box 5/i);
  const done = household(completed).state;
  expect(validateSection(done, "income-investments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(done)?.form1099Div[0]).toMatchObject({
    ordinaryDividends: "1000", section199ADividends: "1000",
    directReitDividendFacts: { ...directSource, sourceTaxYear: 2026, diminishedRiskDays: 0 },
  });
  const qualifiedBox5 = (entry: DividendEntryData) => resolveQualifiedReitBox5(Form1099DivSchema.parse(buildDividendInputs([entry], 2026)[0]), 2026, "2026-11-26").toFixed();
  expect(qualifiedBox5(completed)).toBe("1000");
  expect(qualifiedBox5({ ...completed, directReitDividendFacts: { ...directSource, acquiredOn: "2026-05-01" } })).toBe("0");
  for (const patch of [{ relatedPaymentAmount: "" }, { relatedPaymentAmount: "500" }, { diminishedRiskDays: "" }, { positionEnded: null },
    { sourceFactsConfirmed: false }, { singleDirectReitDistributionConfirmed: false }, { originalBox5Amount: "999" },
    { sourceAsOfDate: "" }, { sourceAsOfDate: "2999-01-01" }, { heldThrough: "2999-01-01" }, { paidOn: "2999-01-01" }]) {
    expect(buildTaxInputFromGuidedData(household({ ...completed, directReitDividendFacts: { ...directSource, ...patch } }).state)).toBeNull();
  }
  expect(buildTaxInputFromGuidedData(household({ ...completed, qualifiedDividends: "1" }).state)).toBeNull();
  const fullyObligated = { ...completed, directReitDividendFacts: { ...directSource, relatedPaymentAmount: "1000" } };
  expect(buildTaxInputFromGuidedData(household(fullyObligated).state)?.form1099Div[0]).toMatchObject({ ordinaryDividends: "1000", section199ADividends: "1000" });
  expect(qualifiedBox5(fullyObligated)).toBe("0");
  expect(buildTaxInputFromGuidedData(household({ ...sourceStatement, section199ADividends: "0" }).state)?.form1099Div[0]?.section199ADividends).toBe("0");
  expect(buildTaxInputFromGuidedData(household({ ...completed, section199ADividends: "0" }).state)).toBeNull();
  expect(buildTaxInputFromGuidedData(household({ ...completed, sourceTaxYear: "2025" }, 2025).state)?.form1099Div[0]).toMatchObject({ section199ADividends: "1000" });
  expect(buildDividendInputs([{ ...completed, sourceTaxYear: "2025" }], 2025)[0]?.directReitDividendFacts).toBeUndefined();
});

it("requires an actual account and rejects aliases of the same dividend across statements", () => {
  for (const accountReference of [" ", "****1234", "1234"]) {
    const ambiguous = { ...completed, accountReference };
    expect(validateSection(household(ambiguous).state, "income-investments").fieldErrors).toHaveProperty("dividend-0-directReitDividendFacts");
    expect(buildTaxInputFromGuidedData(household(ambiguous).state)).toBeNull();
    expect(() => buildDividendInputs([ambiguous], 2026)).toThrow(/account/i);
  }
  const alias = { ...completed, payer: "Renamed payer", payerTin: "22-2222222", accountReference: " Synthetic brokerage-account A ",
    directReitDividendFacts: { ...directSource, sourceReference: "Renamed source reference" } };
  const { state, data } = household(completed);
  data.dividendEntries.push(alias);
  expect(validateSection(state, "income-investments").fieldErrors).toHaveProperty("dividend-1-directReitDividendFacts");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(() => buildDividendInputs(data.dividendEntries, 2026)).toThrow(/repeated direct REIT distribution/i);

  data.dividendEntries[1] = { ...alias, accountReference: "Synthetic brokerage account B" };
  expect(validateSection(state, "income-investments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.form1099Div).toHaveLength(2);
  expect(buildTaxInputFromGuidedData(state)?.form1099Div[0]).toMatchObject({ accountReference: sourceStatement.accountReference, accountHolder: "primary" });
  state.segmentation.filingStatus = "mfj";
  data.dividendEntries = [{ ...completed, accountHolder: "" }];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("shows direct qualification controls only for positive 2026 Box 5 or retained facts", () => {
  const render = (entry: DividendEntryData, taxYear: number) => renderToStaticMarkup(createElement(SectionInvestmentIncome, {
    taxYear, dividendEntries: [entry], interestEntries: [], brokerageEntries: [],
    onDividendEntriesChange: () => {}, onInterestEntriesChange: () => {}, onBrokerageEntriesChange: () => {},
  }));
  const legend = "2026 Box 5 direct REIT distribution";
  expect(render(sourceStatement, 2025)).not.toContain(legend);
  expect(render({ ...sourceStatement, section199ADividends: "0" }, 2026)).not.toContain(legend);
  expect(render(sourceStatement, 2026)).toContain(legend);
  expect(render(completed, 2025)).toContain(legend);
});

it("retains actual zero and false on reopen and invalidates edited source evidence", () => {
  const stillHeld = { ...completed, directReitDividendFacts: { ...directSource, heldThrough: "2026-06-16", positionEnded: false } };
  const { state, data } = household(stillHeld);
  saveGuidedFlowState(localStorage, "direct-reit-dividend", state);
  const reopened = loadGuidedFlowState(localStorage, "direct-reit-dividend");
  if (!reopened) throw new Error("Reopen saved direct REIT interview");
  expect(reopened.sectionData["income-investments"]?.dividendEntries[0]?.directReitDividendFacts).toEqual(stillHeld.directReitDividendFacts);
  expect(buildTaxInputFromGuidedData(reopened)?.form1099Div[0]?.directReitDividendFacts).toMatchObject({ positionEnded: false, diminishedRiskDays: 0, relatedPaymentAmount: "0" });
  for (const entry of [{ ...stillHeld, payer: "Other issuer or broker" }, { ...stillHeld, payerTin: "22-1111111" },
    { ...stillHeld, accountReference: "changed-account" }, { ...stillHeld, section199ADividends: "950" },
    { ...stillHeld, directReitDividendFacts: { ...stillHeld.directReitDividendFacts, diminishedRiskDays: "1" } }]) {
    const updated = updateSectionData(reopened, "income-investments", { ...data, dividendEntries: [entry] });
    expect(updated.sectionData["income-investments"]?.dividendEntries[0]?.directReitDividendFacts?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(updated)).toBeNull();
  }
  const ownerChanged = updateSectionData(reopened, "personal-info", { ...reopened.sectionData["personal-info"], ssn: "100-20-3000" });
  const yearChanged = setInterviewTaxYear(reopened, 2025);
  for (const changed of [ownerChanged, yearChanged]) {
    expect(changed.sectionData["income-investments"]?.dividendEntries[0]?.directReitDividendFacts).toMatchObject({ sourceFactsConfirmed: null, positionEnded: false });
  }
});
