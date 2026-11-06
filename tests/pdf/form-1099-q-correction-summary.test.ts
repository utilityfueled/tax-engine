/** Spec: spec/federal/form-1099-q-corrections.yaml. Synthetic source worksheet evidence. */
import { expect, it } from "vitest";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { buildForm1099QReferenceSummary } from "@/pdf/fill-form-1099-q.js";
import { returnedEducationSource, educationCorrectionSummary } from "../fixtures/education-correction-source.js";

it("retains actual correction year income and loss evidence in review summaries", () => {
  const form = returnedEducationSource({ taxYear: 2026, distributionCode: "3", distributionDate: "2026-05-31", returnedContributionDate: "2025-12-01", returnedContributionTaxYear: 2025, returnedContributionIncomePreviouslyReported: "40" });
  const summary = educationCorrectionSummary(2025), result = calculateForm1099Q([form], summary, { taxYear: 2025 });
  const output = buildForm1099QReferenceSummary([form], result, summary);
  expect(output.forms[0]?.taxYear).toBe(2026);
  expect(output.sourceLines.some(line => line.description.includes("2025") && line.value === "60")).toBe(true);
  const source = returnedEducationSource({ taxYear: 2025, distributionDate: "2025-12-01", returnedContributionDate: "2025-01-15", returnedContributionTaxYear: 2025, grossDistribution: "980", earnings: "0", basis: "980", returnedContributionNetIncome: "-20" });
  const loss = calculateForm1099Q([source], summary, { taxYear: 2025 });
  const shown = buildForm1099QReferenceSummary([source], loss, summary);
  expect(shown.forms[0]?.box2Earnings).toBe("0");
  expect(shown.sourceLines.some(line => line.value === "-20")).toBe(true);
  expect(() => buildForm1099QReferenceSummary([{ ...source, returnedContributionNetIncome: "-19" }], loss, summary)).toThrow(/source|correction|reconcil/i);
  expect(() => buildForm1099QReferenceSummary([form], { ...result, lines: result.lines.filter(line => !line.line.endsWith(":income-adjustment")) }, summary)).toThrow(/audit/i);
});

it("rejects missing outside recipients and mismatched correction identities", () => {
  const form = returnedEducationSource({ taxYear: 2025, distributionDate: "2025-12-01", returnedContributionDate: "2025-01-15", returnedContributionTaxYear: 2025, recipientOwner: "other", recipientId: "actual-beneficiary" });
  const summary = educationCorrectionSummary(2025), result = calculateForm1099Q([form], summary, { taxYear: 2025 });
  expect(result.taxableEarnings.toFixed()).toBe("0");
  expect(() => buildForm1099QReferenceSummary([form], { ...result, perRecipient: [] }, summary)).toThrow(/recipient|source/i);
  for (const change of [{ accountId: "other-account" }, { recipientId: "other-person" }, { recipientOwner: "primary" as const }]) {
    expect(() => buildForm1099QReferenceSummary([form], { ...result, returnedContributions: result.returnedContributions.map(row => ({ ...row, ...change })) }, summary)).toThrow(/correction|source/i);
  }
  const correction = result.returnedContributions[0];
  if (!correction) throw new Error("Expected actual correction result");
  expect(() => buildForm1099QReferenceSummary([form], { ...result, returnedContributions: [...result.returnedContributions, { ...correction, sourceId: "extra-source" }] }, summary)).toThrow(/correction|source/i);
});
