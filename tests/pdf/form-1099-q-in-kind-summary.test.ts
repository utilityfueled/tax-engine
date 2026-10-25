// Spec: spec/federal/form-1099-q-in-kind.yaml. Synthetic review-only source evidence.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { buildForm1099QReferenceSummary, fillForm1099QReference } from "@/pdf/fill-form-1099-q.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";

function fixture() {
  const form = Form1099QSchema.parse({ sourceId: "private-prepaid", accountId: "private-account", beneficiaryId: "private-student", recipientOwner: "primary", taxYear: 2025, payerName: "Synthetic prepaid plan", accountType: "529", distributionMedium: "in_kind_prepaid_tuition", grossDistribution: "4000.01", earnings: "800", basis: "3200.01", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" } });
  const summary = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
    taxYear: 2025, sourceFactsConfirmed: true, allDistributionsReconciled: true,
    beneficiaries: [{ id: "private-student", studentTaxId: "111223333", outsideK12QualifiedDistributions: "0" }],
    expenses: [{ id: "private-expense", beneficiaryId: "private-student", category: "postsecondary_tuition", paidDate: "2025-08-15", amount: "6000.01", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true }],
    allocations: [{ sourceId: "private-prepaid", expenseId: "private-expense", amount: "4000.01", creditAmount: "0" }],
    inKindBenefits: [{ id: "private-benefit", sourceId: "private-prepaid", expenseId: "private-expense", amount: "4000.01", providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "private-plan-reference" }],
    loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
  } });
  return { form, summary, result: calculateForm1099Q([form], summary, { taxYear: 2025 }) };
}

it("binds actual in-kind benefit sources to the reference audit", () => {
  const { form, summary, result } = fixture();
  const shown = buildForm1099QReferenceSummary([form], result, summary);
  expect(shown.sourceLines.some(line => line.description.includes("in-kind QTP benefit costs") && line.value === "4000.01")).toBe(true);
  expect(shown.sourceLines.some(line => line.description.includes("remaining after actual in-kind") && line.value === "2000")).toBe(true);
  expect(() => buildForm1099QReferenceSummary([{ ...form, distributionMedium: "cash" }], result, summary)).toThrow(/medium|source|statement/i);
  for (const changes of [{ amount: "4000" }, { providedDate: "2025-08-16" }, { sourceReference: "changed-reference" }, { qualificationConfirmed: false }, { expenseId: "changed-expense" }]) {
    const changed = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: { ...summary.sourceFacts, inKindBenefits: summary.sourceFacts?.inKindBenefits?.map(row => ({ ...row, ...changes })) } });
    expect(() => buildForm1099QReferenceSummary([form], result, changed)).toThrow(/in-kind|benefit|source|audit/i);
  }
  const missing = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: { ...summary.sourceFacts, inKindBenefits: undefined } });
  expect(() => buildForm1099QReferenceSummary([form], result, missing)).toThrow(/in-kind|benefit|source/i);
  expect(() => buildForm1099QReferenceSummary([form], { ...result, lines: result.lines.filter(line => !line.line.includes("in-kind")) }, summary)).toThrow(/audit/i);
});

it("prints in-kind cost ordering with a review notice on every page", async () => {
  const { form, summary, result } = fixture();
  const directory = await mkdtemp(join(tmpdir(), "education-in-kind-"));
  try {
    const path = await fillForm1099QReference([form], result, summary, directory);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input: await readFile(path), encoding: "utf8" })) as string[];
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Actual in-kind QTP benefit costs: $4000.01");
    expect(text).toContain("Expense remaining after actual in-kind benefit costs: $2000");
    expect(text).not.toContain("private-"); expect(text).not.toContain("111223333");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("rejects changed allocation and remaining expense source records", () => {
  const { form, summary, result } = fixture();
  const facts = summary.sourceFacts;
  if (!facts) throw new Error("Synthetic fixture requires source facts");
  for (const changes of [
    { inKindBenefits: [...(facts.inKindBenefits ?? []), ...(facts.inKindBenefits ?? [])] },
    { allocations: facts.allocations?.map(row => ({ ...row, amount: "4000" })) },
    { allocations: facts.allocations?.map(row => ({ ...row, creditAmount: "0.01" })) },
    { allocations: [] },
    { expenses: facts.expenses?.map(row => ({ ...row, amount: "6000.02" })) },
    { expenses: facts.expenses?.map(row => ({ ...row, refundedAmount: "1" })) },
  ]) {
    const changed = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: { ...facts, ...changes } });
    expect(() => buildForm1099QReferenceSummary([form], result, changed)).toThrow(/in-kind|benefit|audit/i);
  }
});
