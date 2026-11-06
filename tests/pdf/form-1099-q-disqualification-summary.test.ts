/** Spec: spec/federal/form-1099-q-disqualification.yaml. Review reference only. */
import { expect, it } from "vitest";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { buildForm1099QReferenceSummary } from "@/pdf/fill-form-1099-q.js";
import { disqualifiedEducationSource, disqualifiedEducationSummary } from "../fixtures/education-disqualification-source.js";

it("requires actual disqualification facts and audit in the reference summary", () => {
  const source = disqualifiedEducationSource({ taxYear: 2025, prohibitedTransactionDate: "2025-06-01", grossDistribution: "1000.50", earnings: "300.50", prohibitedTransactionJanuary1Value: "1000.50" });
  const facts = disqualifiedEducationSummary({ taxYear: 2025 });
  const result = calculateForm1099Q([source], facts, { taxYear: 2025 });
  const shown = buildForm1099QReferenceSummary([source], result, facts);
  expect(shown.forms[0]?.box2Earnings).toBe("300.5");
  expect(shown.sourceLines.some(line => line.description.includes("January1") && line.value === "1000.5")).toBe(true);
  expect(shown.sourceLines.some(line => line.description.includes("Whole-dollar") && line.value === "301")).toBe(true);
  for (const changes of [
    { prohibitedTransactionQualifiedEducationExpenses: "1" },
    { prohibitedTransactionNoPostDisqualificationActivityConfirmed: false },
    { prohibitedTransactionPostDisqualificationSourceReference: undefined },
    { prohibitedTransactionBasis: "699" },
    { prohibitedTransactionKind: "pledged_portion" as const },
    { distributionCode: "1" as const },
    { prohibitedTransactionDate: "2025-07-01" },
  ]) expect(() => buildForm1099QReferenceSummary([{ ...source, ...changes }], result, facts)).toThrow(/disqualification|deemed|source|audit/i);
  expect(() => buildForm1099QReferenceSummary([source], { ...result, lines: result.lines.filter(line => line.form !== "Coverdell disqualification") }, facts)).toThrow(/audit/i);
});
