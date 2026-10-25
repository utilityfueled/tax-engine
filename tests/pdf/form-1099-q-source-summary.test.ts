/** Spec: spec/federal/form-1099-q-source.yaml. Synthetic actual-source review evidence only. */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { buildForm1099QReferenceSummary, fillForm1099QReference } from "@/pdf/fill-form-1099-q.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";

function source() {
  const forms = [Form1099QSchema.parse({ sourceId: "private-statement-link", accountId: "private-account-link", beneficiaryId: "private-beneficiary-link", recipientOwner: "primary", taxYear: 2025, payerName: "Actual synthetic Coverdell custodian", accountType: "coverdell_esa", grossDistribution: "850", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" } }),
    Form1099QSchema.parse({ sourceId: "other-statement-link", accountId: "other-account-link", beneficiaryId: "private-beneficiary-link", recipientOwner: "other", recipientId: "private-other-link", taxYear: 2025, payerName: "Other recipient plan", accountType: "529", grossDistribution: "1000", earnings: "200", basis: "800", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" } })];
  const summary = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: { taxYear: 2025, sourceFactsConfirmed: true, allDistributionsReconciled: true,
    beneficiaries: [{ id: "private-beneficiary-link", name: "Synthetic Student", studentTaxId: "123456789", outsideK12QualifiedDistributions: "0" }],
    expenses: [{ id: "private-expense-link", beneficiaryId: "private-beneficiary-link", category: "postsecondary_tuition", paidDate: "2025-08-15", amount: "700", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true }],
    allocations: [{ expenseId: "private-expense-link", sourceId: "private-statement-link", amount: "700", creditAmount: "0" }], loanBorrowers: [], penaltyExceptions: [],
    coverdellAccounts: [{ accountId: "private-account-link", priorYearBasis: "1500", currentYearContributions: "0", yearEndValue: "950", outstandingRollovers: "0", rolloverBasisReceived: "0" }],
  } });
  return { forms, summary, result: calculateForm1099Q(forms, summary, { taxYear: 2025 }) };
}

it("copies audited sources without inventing missing statement boxes", () => {
  const { forms, summary, result } = source();
  const output = buildForm1099QReferenceSummary(forms, result, summary);
  expect(output.introduction).toContain("confirmed actual");
  expect(output.forms[0]?.box2Earnings).toBe("Not reported");
  expect(output.forms[0]?.box3Basis).toBe("Not reported");
  expect(output.sourceLines.some(line => line.description.includes("distributed earnings") && line.value === "142")).toBe(true);
  expect(output.sourceLines.some(line => line.description.includes("outside this return") && line.value === "200")).toBe(true);
  expect(output.lines.find(line => line.line === "taxable-earnings")?.value).toBe("25");
  expect(output.qualifiedEducationExpenseInputs.some(line => line.label.includes("Expense 1") && line.value === "700")).toBe(true);
  expect(JSON.stringify(output)).not.toContain("123456789");
  const legacyForms = [{ accountType: "529" as const, grossDistribution: "100", earnings: "20", basis: "80" }];
  const legacy = buildForm1099QReferenceSummary(legacyForms, calculateForm1099Q(legacyForms), undefined);
  expect(legacy.introduction).toContain("unverified historical");
  expect(legacy.forms[0]?.box4TrusteeToTrusteeTransfer).toBeUndefined();
  expect(legacy.qualifiedEducationExpenseInputs.every(line => line.value === "Not provided")).toBe(true);
});

it("rejects missing duplicate wrong-form inconsistent and wrong-year education audits", () => {
  const { forms, summary, result } = source();
  const audit = result.lines.find(line => line.form === "Form1099-Q" && line.line === "private-statement-link:earnings");
  if (!audit) throw new Error("Expected source earnings audit");
  for (const lines of [
    result.lines.filter(line => line !== audit), [...result.lines, audit],
    result.lines.map(line => line === audit ? { ...line, value: new Decimal("NaN") } : line),
    result.lines.map(line => line === audit ? { ...line, value: new Decimal("143") } : line),
    result.lines.map(line => line === audit ? { ...line, form: "Other Form" } : line),
    result.lines.filter(line => line.line !== "private-account-link:15"),
  ]) expect(() => buildForm1099QReferenceSummary(forms, { ...result, lines }, summary)).toThrow(/audit/i);
  expect(() => buildForm1099QReferenceSummary(forms, { ...result, taxYear: 2026 }, summary)).toThrow(/year|mapping/i);
  expect(() => buildForm1099QReferenceSummary(forms.map(form => ({ ...form, grossDistribution: "999" })), result, summary)).toThrow(/source|statement/i);
  expect(() => buildForm1099QReferenceSummary(forms.map(form => ({ ...form, sourceFactsConfirmed: false })), result, summary)).toThrow(/source|statement/i);
  expect(() => buildForm1099QReferenceSummary(forms, { ...result, perRecipient: [...result.perRecipient, ...result.perRecipient] }, summary)).toThrow(/source|audit/i);
});

it("marks every education reference page and preserves source and recipient distinctions", async () => {
  const { forms, summary, result } = source(); const directory = await mkdtemp(join(tmpdir(), "education-source-pdf-"));
  try {
    const path = await fillForm1099QReference(forms, result, summary, directory);
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input: await readFile(path), encoding: "utf8" })) as string[];
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Box 2 earnings: Not reported");
    expect(text).toContain("distributed earnings: $142");
    expect(text).toContain("outside this return");
    expect(text).not.toContain("123456789"); expect(text).not.toContain("private-");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("reconciles reported statement boxes and actual outside recipient identity", () => {
  const { forms, summary, result } = source();
  for (const changed of [
    { earnings: "201", basis: "799" },
    { earnings: undefined, basis: undefined },
    { earnings: "NaN" },
    { recipientId: "different-actual-recipient" },
  ]) expect(() => buildForm1099QReferenceSummary(forms.map((form, index) => index === 1 ? { ...form, ...changed } : form), result, summary)).toThrow(/source|statement|recipient|box/i);
  for (const changed of [
    { earnings: "143", basis: "707" },
    { earnings: "142", basis: undefined },
    { earnings: "142.01", basis: "707.98" },
  ]) expect(() => buildForm1099QReferenceSummary(forms.map((form, index) => index === 0 ? { ...form, ...changed } : form), result, summary)).toThrow(/source|statement|box/i);
  const actualReportedCoverdell = forms.map((form, index) => index === 0 ? { ...form, earnings: "141.67", basis: "708.33" } : form);
  expect(buildForm1099QReferenceSummary(actualReportedCoverdell, result, summary).forms[0]?.box2Earnings).toBe("141.67");
});
