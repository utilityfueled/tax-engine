/** Spec: spec/federal/form-1099-q-coverdell-basis.yaml. */
import { expect, it } from "vitest";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { buildForm1099QReferenceSummary } from "@/pdf/fill-form-1099-q.js";
import { ordinaryCoverdellSource as source, ordinaryCoverdellSummary as summary } from "../fixtures/education-coverdell-source.js";

it("retains exact account sources and distinguishes rollover worksheet lines", () => {
  const form = source({ grossDistribution: "100" }), facts = summary({ priorYearBasis: "0", rolloverBasisReceived: "200.49", yearEndValue: "100" });
  const result = calculateForm1099Q([form], facts);
  const output = buildForm1099QReferenceSummary([form], result, facts);
  expect(output.sourceLines.some(row => row.description.includes("source") && row.value === "200.49")).toBe(true);
  expect(output.sourceLines.some(row => row.description.includes("rollover reconciliation") && row.line === "esa-account:2" && row.value === "0")).toBe(true);
  expect(() => buildForm1099QReferenceSummary([form], result, summary({ priorYearBasis: "0", rolloverBasisReceived: "201", yearEndValue: "100" }))).toThrow(/source|basis|audit/i);
  expect(() => buildForm1099QReferenceSummary([form], { ...result, lines: result.lines.filter(line => line.form !== "Coverdell source") }, facts)).toThrow(/source|audit/i);
  expect(() => buildForm1099QReferenceSummary([form], { ...result, coverdellAccounts: [] }, facts)).toThrow(/source|audit/i);
  expect(() => buildForm1099QReferenceSummary([form], { ...result, coverdellAccounts: result.coverdellAccounts.map(row => ({ ...row, auditForm: "Pub970 WS6-3" })) }, facts)).toThrow(/worksheet|source/i);
  for (const id of ["1", "2", "3", "4", "7", "rollover-basis-in", "rollover-basis-out"]) {
    const lines = result.lines.map(line => line.form === "Coverdell rollover worksheet" && line.line === `esa-account:${id}` ? { ...line, value: line.value.plus(1) } : line);
    expect(() => buildForm1099QReferenceSummary([form], { ...result, lines }, facts)).toThrow(/source|audit/i);
  }
});
