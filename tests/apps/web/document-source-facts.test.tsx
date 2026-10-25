// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DocumentSourceFacts } from "../../../apps/web/src/components/guided-interview/document-source-facts";
import { normalizeBankStatementAnalysis, normalizeSelfEmploymentIncomeDocumentAnalysis } from "../../../apps/web/src/lib/business-expense-analysis";
const facts = [
  { name: "loss", kind: "money", value: "-2.37", sourceId: "document:1", sourceQuote: "loss (2.37)" },
  { name: "withholding", kind: "money", value: "0.00", sourceId: "document:1", sourceQuote: "withholding 0.00" },
  { name: "date", kind: "date", value: null, sourceId: "document:1", sourceQuote: null },
];
it("retains source proposals through normalization without accepting income or expenses", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const payload = { label: "Statement", summary: "Review actual source", facts, suggestions: [] };
  const income = normalizeSelfEmploymentIncomeDocumentAnalysis(payload, "source.txt");
  const expense = normalizeBankStatementAnalysis(payload, "source.txt");
  expect(income?.sourceFacts).toEqual(facts); expect(expense?.sourceFacts).toEqual(facts);
  expect(normalizeSelfEmploymentIncomeDocumentAnalysis(income, "source.txt")?.sourceFacts).toEqual(facts);
  expect(normalizeBankStatementAnalysis(expense, "source.txt")?.sourceFacts).toEqual(facts);
  expect(income?.suggestions).toEqual([]); expect(expense?.suggestions).toEqual([]);
  expect(() => normalizeBankStatementAnalysis({ ...payload, facts: [{ ...facts[0], value: "NaN" }] }, "source.txt")).toThrow(/source proposal/i);
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<DocumentSourceFacts facts={income?.sourceFacts} label="Statement" />));
    expect(container.textContent).toContain("Unconfirmed source details");
    expect(container.textContent).toContain("-2.37"); expect(container.textContent).toContain("0.00");
    expect(container.textContent).toContain("Unknown"); expect(container.textContent).toContain("loss (2.37)");
    expect(container.textContent).toContain("have not been added");
    expect(container.querySelectorAll("input,button").length).toBe(0);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
