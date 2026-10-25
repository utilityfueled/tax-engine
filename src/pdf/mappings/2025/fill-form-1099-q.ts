import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Form1099Q, QualifiedEducationExpenseSummary } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { roundDollar } from "@/utils/decimal.js";
import type { Form1099QResult } from "@/engine/forms/form-1099-q.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";

export const FORM_1099_Q_REFERENCE_FILENAME = "f1099q-reference-filled.pdf";
export interface Form1099QReferenceSummaryForm {
  payerName: string; accountType: string; box1GrossDistribution: string; box2Earnings: string; box3Basis: string;
  box4TrusteeToTrusteeTransfer: boolean | undefined;
  box4bQtpToRothTransfer?: boolean; box6RecipientNotBeneficiary?: boolean;
}
export interface Form1099QReferenceSummaryValue { label: string; value: string }
export interface Form1099QReferenceSummaryLine { line: string; description: string; value: string; isRatio?: true }
export interface Form1099QReferenceSummary {
  title: string; warningLabel: string; statementCount: number; introduction: string;
  forms: Form1099QReferenceSummaryForm[]; qualifiedEducationExpenseInputs: Form1099QReferenceSummaryValue[];
  lines: Form1099QReferenceSummaryLine[]; sourceLines: Form1099QReferenceSummaryLine[];
}
const aggregateFields = [
  ["gross-distribution", "grossDistribution"], ["total-earnings", "totalEarnings"], ["total-basis", "totalBasis"],
  ["adjusted-qee", "adjustedQEE"], ["taxable-earnings", "taxableEarnings"], ["tax-free-earnings", "taxFreeEarnings"],
  ["penalty-amount", "grossPenalty"], ["penalty-exception-amount", "penaltyExceptionAmount"], ["net-penalty", "netPenalty"],
] as const;
const distributionFields = [
  ["gross", "grossDistribution"], ["earnings", "earnings"], ["basis", "basis"], ["adjusted-qee", "adjustedQEE"],
  ["taxable-earnings", "taxableEarnings"], ["education-excluded-earnings", "educationExpenseExcludedEarnings"],
  ["transfer-excluded-earnings", "transferExcludedEarnings"], ["credit-exception", "creditException"], ["exception", "penaltyException"],
] as const;
function knownAmount(value: string | undefined, absent = "Not provided"): string {
  if (value === undefined) return absent;
  const amount = new Decimal(value);
  if (!amount.isFinite()) throw new Error("Education reference source amount must be finite");
  return amount.toFixed();
}
function yesNo(value: boolean | undefined): string { return value === undefined ? "Not provided" : value ? "Yes" : "No"; }
function shownValue(value: string): string { return /^-?\d+(\.\d+)?$/.test(value) ? `$${value}` : value; }

export function buildForm1099QReferenceSummary(forms: Form1099Q[], result: Form1099QResult, qeeSummary: QualifiedEducationExpenseSummary | undefined): Form1099QReferenceSummary {
  if (!result) throw new Error("Education reference requires the calculated result and audit");
  assertPdfExportAllowed(2025, result.taxYear);
  const audit = new Map<string, CalculatedLine>();
  for (const line of result.lines) {
    const key = `${line.form}\u0000${line.line}`;
    if (audit.has(key) || !Decimal.isDecimal(line.value) || !line.value.isFinite()) throw new Error("Education reference requires unique finite audit lines");
    audit.set(key, line);
  }
  const requireAudit = (form: string, line: string, expected?: Decimal): CalculatedLine => {
    const entry = audit.get(`${form}\u0000${line}`);
    if (!entry || (expected !== undefined && !entry.value.eq(expected))) throw new Error(`Education reference missing or inconsistent audit ${form} ${line}`);
    return entry;
  };
  const describe = (entry: CalculatedLine, prefix = ""): Form1099QReferenceSummaryLine => ({ line: entry.line, description: `${prefix}${entry.description}`, value: entry.value.toFixed() });
  const aggregateForm = result.sourceFactsVerified ? "Form1099-Q" : "Form 1099-Q";
  const lines = aggregateFields.map(([line, field]) => describe(requireAudit(aggregateForm, line, result[field])));
  const sourceLines: Form1099QReferenceSummaryLine[] = [];
  const qualifiedEducationExpenseInputs: Form1099QReferenceSummaryValue[] = [];
  if (result.sourceFactsVerified) {
    if (!qeeSummary?.sourceFacts || qeeSummary.sourceFacts.sourceFactsConfirmed !== true || qeeSummary.sourceFacts.allDistributionsReconciled !== true || qeeSummary.sourceFacts.taxYear !== result.taxYear || forms.length !== result.perDistribution.length) throw new Error("Education reference source confirmation, year or statement count is inconsistent");
    const seen = new Set<string>();
    for (const [index, row] of result.perDistribution.entries()) {
      const matches = forms.filter(form => form.sourceId === row.sourceId);
      const form = matches[0];
      if (!form || matches.length !== 1 || seen.has(row.sourceId) || form.sourceFactsConfirmed !== true || form.sourceFactsComplete === false || form.taxYear !== result.taxYear || form.accountId !== row.accountId || form.beneficiaryId !== row.beneficiaryId || form.accountType !== row.accountType || form.recipientOwner !== row.recipientOwner || (form.recipientOwner === "other" ? form.recipientId : form.recipientOwner) !== row.recipientId || !new Decimal(form.grossDistribution).eq(row.grossDistribution)) throw new Error("Education reference statement identity or source amount disagrees with the calculation");
      const hasReportedEarnings = form.earnings !== undefined;
      const hasReportedBasis = form.basis !== undefined;
      if (hasReportedEarnings !== hasReportedBasis || (form.accountType === "529" && !hasReportedEarnings)) throw new Error("Education reference reported source Boxes2/3 must be jointly reconciled");
      if (form.earnings !== undefined && form.basis !== undefined) {
        const earnings = new Decimal(form.earnings), basis = new Decimal(form.basis);
        if (!earnings.isFinite() || !basis.isFinite() || !earnings.plus(basis).eq(row.grossDistribution)) throw new Error("Education reference source Boxes2/3 do not reconcile to Box1");
        const expectedEarnings = form.accountType === "coverdell_esa" ? roundDollar(earnings) : earnings;
        const expectedBasis = form.accountType === "coverdell_esa" ? roundDollar(basis) : basis;
        if (!expectedEarnings.eq(row.earnings) || !expectedBasis.eq(row.basis)) throw new Error("Education reference reported source boxes disagree with the calculation");
      }
      seen.add(row.sourceId);
      for (const [line, field] of distributionFields) sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:${line}`, row[field]), `Statement ${index + 1}: `));
      if (form.transfer?.kind !== "none") sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:valid-transfer`, row.validTransfers), `Statement ${index + 1}: `));
    }
    const sumRows = (field: "grossDistribution" | "earnings" | "basis") => result.perDistribution.reduce((sum, row) => sum.plus(row[field]), new Decimal(0));
    if (!sumRows("grossDistribution").eq(result.grossDistribution) || !sumRows("earnings").eq(result.totalEarnings) || !sumRows("basis").eq(result.totalBasis)) throw new Error("Education source audit totals do not reconcile");
    for (const [index, row] of result.coverdellAccounts.entries()) {
      for (const line of ["rollover-basis-in", "rollover-basis-out", "F", "G", "H", ...Array.from({ length: 15 }, (_, i) => String(i + 1))]) {
        const expected = line === "10" ? row.distributedBasis : line === "11" ? row.earnings : line === "15" ? row.endingBasis : undefined;
        sourceLines.push({ ...describe(requireAudit("Pub970 WS6-3", `${row.accountId}:${line}`, expected), `Coverdell account ${index + 1}, worksheet ${line}: `), ...(["H", "9", "12"].includes(line) ? { isRatio: true as const } : {}) });
      }
    }
    if (result.coverdellAccounts.length) sourceLines.push(describe(requireAudit("Pub970 WS6-3", "16"), "Coverdell worksheet line 16: "));
    for (const [index, row] of result.perRecipient.entries()) {
      const label = row.owner === "other" ? `Recipient outside this return ${index + 1}` : row.owner === "spouse" ? "Spouse" : "Primary taxpayer";
      const key = `${row.owner}:${row.recipientId}`;
      const sources = result.perDistribution.filter(source => source.recipientOwner === row.owner && source.recipientId === row.recipientId);
      if (!sources.length || result.perRecipient.filter(other => other.owner === row.owner && other.recipientId === row.recipientId).length !== 1 || !sources.reduce((sum, source) => sum.plus(source.taxableEarnings), new Decimal(0)).eq(row.taxableEarnings) || !sources.reduce((sum, source) => sum.plus(source.penaltyException), new Decimal(0)).eq(row.penaltyException)) throw new Error("Education recipient source audit does not reconcile");
      for (const [line, amount] of [["5", row.taxableEarnings], ["6", row.penaltyException], ["7", row.taxableEarnings.minus(row.penaltyException)], ["8", row.additionalTax]] as const) sourceLines.push(describe(requireAudit("Form5329 education", `${key}:${line}`, amount), `${label}, Form 5329 line ${line}: `));
    }
    const ownRecipients = result.perRecipient.filter(row => row.owner !== "other");
    if (!ownRecipients.reduce((sum, row) => sum.plus(row.taxableEarnings), new Decimal(0)).eq(result.taxableEarnings) || !ownRecipients.reduce((sum, row) => sum.plus(row.additionalTax), new Decimal(0)).eq(result.netPenalty)) throw new Error("Education recipient audit totals do not reconcile");
    for (const [index, expense] of (qeeSummary.sourceFacts.expenses ?? []).entries()) {
      for (const [field, label] of [["amount", "Actual paid expense"], ["refundedAmount", "Refund"], ["taxFreeAssistance", "Tax-free assistance"], ["educationCreditAmount", "Expense used for education credit"], ["otherTaxBenefitAmount", "Expense used for another benefit"]] as const) qualifiedEducationExpenseInputs.push({ label: `Expense ${index + 1}: ${label}`, value: knownAmount(expense[field]) });
    }
    for (const [index, row] of result.loanInterestSourceAdjustments.entries()) sourceLines.push(describe(requireAudit("Form1099-Q", `loan-expense:${row.expenseId}:loan-interest-reduction`, row.taxFreeEarningsUsedForInterest), `Loan expense ${index + 1}: `));
  } else {
    for (const [field, label] of [["totalQualifiedExpenses", "Total qualified education expenses"], ["taxFreeEducationalAssistance", "Tax-free educational assistance"], ["amountsUsedForEducationCredits", "Amounts used for education credits"], ["penaltyExceptionScholarshipAmount", "Scholarship penalty exception amount"], ["penaltyExceptionMilitaryAcademyAmount", "Military academy penalty exception amount"]] as const) qualifiedEducationExpenseInputs.push({ label, value: knownAmount(qeeSummary?.[field]) });
    qualifiedEducationExpenseInputs.push({ label: "Death exception", value: yesNo(qeeSummary?.penaltyExceptionDeath) }, { label: "Disability exception", value: yesNo(qeeSummary?.penaltyExceptionDisability) });
  }
  return {
    title: "Form 1099-Q Education Distribution Reference Summary", warningLabel: "REFERENCE SUMMARY ONLY", statementCount: forms.length,
    introduction: `Tax year ${result.taxYear}. Computed from ${forms.length} statement${forms.length === 1 ? "" : "s"} using ${result.sourceFactsVerified ? "confirmed actual source records and allocations" : "unverified historical aggregate inputs"}. Other-recipient income and additional tax are excluded from this return's totals.`,
    forms: forms.map((form, index) => ({ payerName: form.payerName?.trim() || `Statement ${index + 1}`, accountType: form.accountType === "coverdell_esa" ? "Coverdell ESA" : "529 plan",
      box1GrossDistribution: knownAmount(form.grossDistribution), box2Earnings: knownAmount(form.earnings, "Not reported"), box3Basis: knownAmount(form.basis, "Not reported"), box4TrusteeToTrusteeTransfer: form.isTrusteeToTrustee,
      ...(result.sourceFactsVerified ? { box4bQtpToRothTransfer: form.isQtpToRoth, box6RecipientNotBeneficiary: form.recipientNotBeneficiary } : {}),
    })), qualifiedEducationExpenseInputs, lines, sourceLines,
  };
}

function safeText(text: string, font: PDFFont): string {
  return [...text.replace(/[−–—]/g, "-").replace(/→/g, "->").replace(/\b(Form|Schedule|line|year)(?=\d)/gi, "$1 ")].map(character => {
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
}
function wrapped(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = []; let current = "";
  for (const word of safeText(text, font).split(/\s+/).filter(Boolean)) {
    if (current && font.widthOfTextAtSize(`${current} ${word}`, size) <= width) { current += ` ${word}`; continue; }
    if (current) result.push(current);
    current = "";
    for (const character of word) {
      if (current && font.widthOfTextAtSize(current + character, size) > width) { result.push(current); current = ""; }
      current += character;
    }
  }
  if (current) result.push(current);
  return result;
}

export async function fillForm1099QReference(forms: Form1099Q[], result: Form1099QResult, qeeSummary: QualifiedEducationExpenseSummary | undefined, outputDir: string): Promise<string> {
  const summary = buildForm1099QReferenceSummary(forms, result, qeeSummary);
  const doc = await PDFDocument.create(); const regular = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]), y = 750;
  const draw = (value: string, emphasis = false, size = 10) => {
    if (emphasis && y < 95) { page = doc.addPage([612, 792]); y = 750; }
    const font = emphasis ? bold : regular;
    for (const line of wrapped(value, font, size, 532)) {
      if (y < 48) { page = doc.addPage([612, 792]); y = 750; }
      page.drawText(line, { x: 40, y, size, font, color: rgb(0.15, 0.15, 0.15) }); y -= size + 4;
    }
    y -= 4;
  };
  draw(summary.title, true, 18); draw(summary.warningLabel, true, 12); draw(summary.introduction);
  draw("This is a calculation reference, not a payer-issued Form 1099-Q. Blank source boxes remain unreported; calculated Coverdell earnings and basis appear in the account audit below.");
  for (const [index, form] of summary.forms.entries()) {
    draw(`Statement ${index + 1}: ${form.payerName}`, true); draw(`Account type: ${form.accountType}`);
    draw(`Box 1 gross distribution: ${shownValue(form.box1GrossDistribution)}`); draw(`Box 2 earnings: ${shownValue(form.box2Earnings)}`); draw(`Box 3 basis: ${shownValue(form.box3Basis)}`);
    draw(`Box 4a trustee-to-trustee transfer: ${yesNo(form.box4TrusteeToTrusteeTransfer)}`);
    if (result.sourceFactsVerified) { draw(`Box 4b QTP-to-Roth transfer: ${yesNo(form.box4bQtpToRothTransfer)}`); draw(`Box 6 recipient is not the beneficiary: ${yesNo(form.box6RecipientNotBeneficiary)}`); }
  }
  draw("Actual education expense records", true, 12);
  for (const row of summary.qualifiedEducationExpenseInputs) draw(`${row.label}: ${shownValue(row.value)}`);
  draw("Return calculation audit", true, 12);
  for (const row of summary.lines) draw(`${row.description}: ${shownValue(row.value)}`);
  if (summary.sourceLines.length) draw("Statement, account and recipient audit", true, 12);
  for (const row of summary.sourceLines) draw(`${row.description}: ${row.isRatio ? row.value : shownValue(row.value)}`);
  await markReviewPdf(doc);
  await mkdir(outputDir, { recursive: true }); const path = join(outputDir, FORM_1099_Q_REFERENCE_FILENAME);
  await writeFile(path, await doc.save({ useObjectStreams: false })); return path;
}
