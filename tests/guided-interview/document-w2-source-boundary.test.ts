// Spec: spec/federal/guided-input.yaml#w2-document-benefits-and-sparse-boxes
import { expect, it } from "vitest";
import { parseUploadedW2Text } from "@/lib/uploaded-document-detection";
import { buildWorkspaceEngineInput } from "@tax-engine/engine";
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactRecord, WorkspaceStructuredFactMachineValue } from "@tax-engine/contracts";
import { workspaceTaxpayerFixture } from "../helpers/workspace-taxpayer";

const text = `2025 Form W-2
Employer's name, address, and ZIP code
Actual Employer
Employer's FED ID number
12-3456789
1 Wages, tips, other comp.
10000.00
2 Federal income tax withheld
1000.00
3 Social security wages
10000.00
4 Social security tax withheld
620.00
5 Medicare wages and tips
10000.00
6 Medicare tax withheld
145.00
7 Social security tips
0.00
10 Dependent care benefits
0.00
15 State Employer's state ID no.
NY 123456
16 State wages, tips, etc.
10000.00
17 State income tax
0.00`;
const document: WorkspaceDocumentRecord = { id: "source", name: "source.pdf", taxYear: 2025, kind: "w2", coverage: "supported", label: "Actual W-2", notes: "Synthetic source test", size: 1, uploadedAt: "2026-01-01T00:00:00Z", matchedFixtureId: null, seededFactIds: ["wages", "withholding"] };
const summary: WorkspaceReturnSummary = { status: "ready-to-recompute", targetTaxYear: 2025, taxYearState: "single", answeredFactCount: 2, totalFactCount: 2, readyItemCount: 1, itemCount: 1, blockers: [], items: [{ id: "wages-and-withholding", label: "Wages", status: "ready", engineTargets: [], relatedFactIds: ["wages", "withholding"], sourceDocumentIds: ["source"], answeredFactCount: 2, factCount: 2 }] };
function input(machineValue: WorkspaceStructuredFactMachineValue, factId = "actual-wages") {
  const fact: WorkspaceStructuredFactRecord = { id: factId, factId: "wages", kind: "document-detected", sourceType: "upload", value: "Actual source boxes", label: "Source", confidence: "high", questionId: null, updatedAt: document.uploadedAt, sourceDocumentIds: [document.id], machineValue };
  return buildWorkspaceEngineInput([document], summary, [fact], workspaceTaxpayerFixture());
}
it("preserves actual dependent care amounts and keeps absent or conflicting Box 10 unknown", () => {
  for (const amount of ["0.00", "125.45", "9007199254740993.01"]) {
    expect(parseUploadedW2Text(text.replace("10 Dependent care benefits\n0.00", `10 Dependent care benefits\n${amount}`))?.detectedFacts[0].machineValue).toHaveProperty("box10DependentCareBenefits", amount);
  }
  for (const source of [text.replace("10 Dependent care benefits\n0.00", "10 Dependent care benefits"), `${text}\n10 Dependent care benefits\n1.00`]) {
    const parsed = parseUploadedW2Text(source);
    expect(parsed?.detectedFacts[0].machineValue).not.toHaveProperty("box10DependentCareBenefits");
    expect(parsed?.coverage).toBe("partially-supported");
  }
});
it("requires actual tips and benefits before document defaults and routes positive benefits to source qualification", () => {
  const actual = { ...parseUploadedW2Text(text)!.detectedFacts[0].machineValue!, accountHolder: "primary" as const, box10DependentCareBenefits: "0" } as WorkspaceStructuredFactMachineValue;
  expect(input(actual)?.taxInput.w2s[0]).toHaveProperty("box10DependentCareBenefits", "0");
  for (const field of ["socialSecurityTips", "box10DependentCareBenefits"]) {
    const incomplete = { ...actual } as Record<string, unknown>; delete incomplete[field];
    expect(input(incomplete as unknown as WorkspaceStructuredFactMachineValue)).toBeNull();
  }
  expect(input({ ...actual, box10DependentCareBenefits: "5000" } as WorkspaceStructuredFactMachineValue)).toBeNull();
  const legacy = { ...actual } as Record<string, unknown>; delete legacy.sourceFactsVersion;
  expect(input(legacy as unknown as WorkspaceStructuredFactMachineValue, "wages:parsed-w2-summary")).toBeNull();
  expect(input(actual, "wages:parsed-w2-summary")).not.toBeNull();
});
it("never resolves conflicting or blank payroll boxes by choosing another source amount", () => {
  const conflicting = parseUploadedW2Text(`${text}\n4 Social security tax withheld\n621.00\n5 Medicare wages and tips\n10000.00`);
  expect(conflicting?.detectedFacts[0].machineValue).not.toHaveProperty("socialSecurityWithheld");
  expect(conflicting?.coverage).toBe("partially-supported");
  const blank = parseUploadedW2Text(text.replace("4 Social security tax withheld\n620.00", "4 Social security tax withheld"));
  expect(blank?.detectedFacts[0].machineValue).not.toHaveProperty("socialSecurityWithheld");
});
it("keeps known wages when withholding is blank and refuses unrelated or conflicting employer identity", () => {
  const blank = parseUploadedW2Text(text.replace("2 Federal income tax withheld\n1000.00", "2 Federal income tax withheld"));
  expect(blank?.detectedFacts[0].machineValue).toMatchObject({ wages: "10000.00", federalWithheld: "" });
  expect(blank?.coverage).toBe("partially-supported");
  const unrelated = parseUploadedW2Text(text.replace("Employer's FED ID number\n12-3456789", "Unrelated identifier\n98-7654321"));
  expect(unrelated?.detectedFacts[0].machineValue).toHaveProperty("employerEin", "");
  const conflicting = parseUploadedW2Text(`${text}\nEmployer's FED ID number\n98-7654321`);
  expect(conflicting?.detectedFacts[0].machineValue).toHaveProperty("employerEin", "");
});
it("does not replace missing or conflicting employer names with the next field label", () => {
  const missing = parseUploadedW2Text(text.replace("Actual Employer\n", ""));
  expect(missing?.detectedFacts[0].machineValue).toHaveProperty("employerName", "");
  const conflicting = parseUploadedW2Text(`${text}\nEmployer's name, address, and ZIP code\nDifferent Employer`);
  expect(conflicting?.detectedFacts[0].machineValue).toHaveProperty("employerName", "");
});
it("maps exact paired source columns without ranking amounts by size", () => {
  const paired = text
    .replace("1 Wages, tips, other comp.\n10000.00\n2 Federal income tax withheld\n1000.00", "1 Wages, tips, other comp. 2 Federal income tax withheld\n0.00 9007199254740993.01")
    .replace("3 Social security wages\n10000.00\n4 Social security tax withheld\n620.00", "3 Social security wages 4 Social security tax withheld\n0.00 620.00")
    .replace("5 Medicare wages and tips\n10000.00\n6 Medicare tax withheld\n145.00", "5 Medicare wages and tips 6 Medicare tax withheld\n0.00 145.00");
  expect(parseUploadedW2Text(paired)?.detectedFacts[0].machineValue).toMatchObject({ wages: "0.00", federalWithheld: "9007199254740993.01", socialSecurityWages: "0.00", socialSecurityWithheld: "620.00", medicareWages: "0.00", medicareWithheld: "145.00" });
  const ambiguous = parseUploadedW2Text(paired.replace("0.00 620.00", "620.00"));
  expect(ambiguous?.detectedFacts[0].machineValue).not.toHaveProperty("socialSecurityWages");
  expect(ambiguous?.detectedFacts[0].machineValue).not.toHaveProperty("socialSecurityWithheld");
});
