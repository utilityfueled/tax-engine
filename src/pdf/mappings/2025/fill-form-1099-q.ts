import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Form1099Q, QualifiedEducationExpenseSummary } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { roundDollar } from "@/utils/decimal.js";
import type { Form1099QResult } from "@/engine/forms/form-1099-q.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { assertDistinctEducationBeneficiaries } from "@/utils/education-beneficiary-identity.js";
import { readInKindTuitionEsaSource } from "@/utils/in-kind-tuition-esa-source.js";
import { readInKindTuitionAssistanceSource } from "@/utils/in-kind-tuition-assistance-source.js";
import { readInKindK12PlanSource } from "@/utils/in-kind-k12-plan-source.js";
import { isExpandedEducationDistributionAllowed } from "@/utils/education-distribution-date.js";
import { assertPreparedEducationReview, type PreparedEducationReview } from "../../education-review-context.js";

export const FORM_1099_Q_REFERENCE_FILENAME = "f1099q-reference-filled.pdf";
export interface Form1099QReferenceSummaryForm {
  taxYear?: number; payerName: string; accountType: string; box1GrossDistribution: string; box2Earnings: string; box3Basis: string;
  distributionForm?: string;
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

export function buildForm1099QReferenceSummary(forms: Form1099Q[], result: Form1099QResult, qeeSummary: QualifiedEducationExpenseSummary | undefined, prepared?: PreparedEducationReview): Form1099QReferenceSummary {
  if (!result) throw new Error("Education reference requires the calculated result and audit");
  assertPdfExportAllowed(2025, result.taxYear);
  if (prepared) assertPreparedEducationReview(forms, qeeSummary, result, prepared);
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
    const benefitSources = qeeSummary.sourceFacts.inKindBenefits ?? [];
    if (new Set(benefitSources.map(benefit => benefit.id)).size !== benefitSources.length || benefitSources.some(benefit => !forms.some(form => form.sourceId === benefit.sourceId && form.distributionMedium === "in_kind_prepaid_tuition"))) throw new Error("Education reference in-kind benefit sources are duplicated or unlinked");
    const sourceMoney = (value: string | undefined): Decimal => {
      if (value === undefined) throw new Error("Education reference actual in-kind source amount is missing");
      const amount = new Decimal(value);
      if (!amount.isFinite() || amount.lt(0)) throw new Error("Education reference actual in-kind source amount is invalid");
      return amount;
    };
    if (result.returnedContributions.length !== result.perDistribution.filter(row => row.treatment === "returned_contribution").length) throw new Error("Education reference correction source count does not reconcile");
    const seen = new Set<string>();
    for (const [index, row] of result.perDistribution.entries()) {
      const matches = forms.filter(form => form.sourceId === row.sourceId);
      const form = matches[0];
      if (!form || matches.length !== 1 || seen.has(row.sourceId) || form.sourceFactsConfirmed !== true || form.sourceFactsComplete === false || form.taxYear !== row.sourceTaxYear || form.accountId !== row.accountId || form.beneficiaryId !== row.beneficiaryId || form.accountType !== row.accountType || form.distributionMedium !== row.distributionMedium || form.recipientOwner !== row.recipientOwner || (form.recipientOwner === "other" ? form.recipientId : form.recipientOwner) !== row.recipientId || !new Decimal(form.grossDistribution).eq(row.grossDistribution)) throw new Error("Education reference statement identity or source amount disagrees with the calculation");
      if (row.distributionMedium === "in_kind_prepaid_tuition") {
        if (!qeeSummary.sourceFacts.inKindBenefits || row.treatment !== "ordinary" || form.accountType !== "529" || form.recipientNotBeneficiary !== false || form.isTrusteeToTrustee !== false || form.isQtpToRoth !== false || form.transfer?.kind !== "none") throw new Error("Education reference in-kind benefit source boundary is incomplete");
        const benefits = benefitSources.filter(benefit => benefit.sourceId === row.sourceId);
        const provided = benefits.reduce((total, benefit) => total.plus(sourceMoney(benefit.amount)), new Decimal(0));
        if (!provided.eq(row.grossDistribution)) throw new Error("Education reference in-kind benefits do not reconcile to Box1");
        sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:in-kind-provided`, provided), `Statement ${index + 1}: `));
        for (const [benefitIndex, benefit] of benefits.entries()) {
          const expenseMatches = qeeSummary.sourceFacts.expenses?.filter(expense => expense.id === benefit.expenseId) ?? [];
          const expense = expenseMatches[0];
          if (expenseMatches.length !== 1 || !expense || expense.beneficiaryId !== row.beneficiaryId || typeof benefit.qualificationConfirmed !== "boolean" || expense.qualificationConfirmed !== benefit.qualificationConfirmed || !benefit.sourceReference?.trim()) throw new Error("Education reference in-kind benefit expense or qualification source is inconsistent");
          const entry = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-benefit:${benefit.id}`, sourceMoney(benefit.amount));
          if (entry.inputs["Expense source"] !== expense.id || entry.inputs["Provided date"] !== benefit.providedDate || entry.inputs["Qualification"] !== (benefit.qualificationConfirmed ? "yes" : "no") || entry.inputs["Source reference"] !== benefit.sourceReference.trim()) throw new Error("Education reference in-kind benefit source disagrees with its audit");
          sourceLines.push(describe(entry, `Statement ${index + 1}, benefit ${benefitIndex + 1}: `));
          if (expense.qualificationConfirmed && expense.category.startsWith("k12_")) {
            if (!prepared) assertDistinctEducationBeneficiaries(forms, qeeSummary.sourceFacts);
            const inputs = readInKindK12PlanSource(benefit, qeeSummary.sourceFacts.beneficiaries?.find(source => source.id === row.beneficiaryId));
            const plan = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-k12:${benefit.id}`, sourceMoney(benefit.amount));
            if (Object.entries(inputs).some(([key, value]) => plan.inputs[key] !== value)) throw new Error("Education reference prepaid program sources disagree with the audit");
            sourceLines.push(describe(plan, `Statement ${index + 1}, benefit ${benefitIndex + 1}: `));
          }
        }
        const allocations = qeeSummary.sourceFacts.allocations?.filter(allocation => allocation.sourceId === row.sourceId) ?? [];
        const expenseIds = new Set([...benefits.map(benefit => benefit.expenseId), ...allocations.map(allocation => allocation.expenseId)]);
        let qualified = new Decimal(0);
        for (const expenseId of expenseIds) {
          const matches = allocations.filter(allocation => allocation.expenseId === expenseId);
          const linked = benefits.filter(benefit => benefit.expenseId === expenseId);
          if (matches.length !== 1 || !linked.length) throw new Error("Education reference in-kind benefit allocation source disagrees with the calculation");
          const allocation = matches[0];
          const expense = qeeSummary.sourceFacts.expenses?.find(item => item.id === expenseId);
          const assistance = sourceMoney(expense?.taxFreeAssistance);
          const providedCost = linked.reduce((total, benefit) => total.plus(sourceMoney(benefit.amount)), new Decimal(0));
          const exactBenefit = sourceMoney(allocation?.amount).plus(sourceMoney(allocation?.creditAmount)).plus(assistance).eq(providedCost);
          const esaCoordination = forms.some(source => source.beneficiaryId === row.beneficiaryId && source.accountType === "coverdell_esa") && (!exactBenefit || assistance.gt(0));
          if (esaCoordination) {
            if (!prepared) assertDistinctEducationBeneficiaries(forms, qeeSummary.sourceFacts);
            const inputs = readInKindTuitionEsaSource(forms, qeeSummary.sourceFacts, row.sourceId, expenseId);
            const entry = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-esa:${expenseId}`, sourceMoney(allocation?.amount));
            if (Object.entries(inputs).some(([key, value]) => !Decimal.isDecimal(entry.inputs[key]) || !(entry.inputs[key] as Decimal).eq(value))) {
              throw new Error("Education reference actual tuition ESA allocation sources disagree with the audit");
            }
            sourceLines.push(describe(entry, `Statement ${index + 1}: `));
          }
          if (!esaCoordination && !exactBenefit) throw new Error("Education reference in-kind benefit allocation and assistance source disagree with the calculation");
          if (assistance.gt(0) && !esaCoordination) {
            if (!prepared) assertDistinctEducationBeneficiaries(forms, qeeSummary.sourceFacts);
            const expected = readInKindTuitionAssistanceSource(forms, qeeSummary.sourceFacts, row.sourceId, expenseId);
            const assistanceLine = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-assistance:${expenseId}`, assistance);
            if (Object.entries(expected).some(([key, value]) => !Decimal.isDecimal(assistanceLine.inputs[key]) || !(assistanceLine.inputs[key] as Decimal).eq(value))) {
              throw new Error("Education reference actual assistance sources disagree with the audit");
            }
            sourceLines.push(describe(assistanceLine, `Statement ${index + 1}: `));
          }
          if (sourceMoney(allocation?.creditAmount).gt(0) && (expense?.category !== "postsecondary_tuition" || expense.qualificationConfirmed !== true)) throw new Error("Education reference in-kind credit requires its actual qualifying tuition source");
          const entry = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-allocation:${expenseId}`, sourceMoney(allocation?.amount));
          const credit = entry.inputs["Education credit expense"];
          if (!Decimal.isDecimal(credit) || !credit.eq(sourceMoney(allocation?.creditAmount))) throw new Error("Education reference in-kind credit allocation disagrees with its source audit");
          sourceLines.push(describe(entry, `Statement ${index + 1}: `));
          let qualifiedAllocation = expense?.qualificationConfirmed === true && isExpandedEducationDistributionAllowed(form, expense.category, result.taxYear, linked.map(benefit => benefit.providedDate)) ? sourceMoney(allocation?.amount) : new Decimal(0);
          if (expense?.qualificationConfirmed === true && expense.category === "postsecondary_room_board") {
            if (typeof expense.halfTimeStudent !== "boolean") throw new Error("Education reference actual room-and-board enrollment is missing");
            const amount = sourceMoney(expense.amount), refund = sourceMoney(expense.refundedAmount);
            const assistance = sourceMoney(expense.taxFreeAssistance), creditExpense = sourceMoney(expense.educationCreditAmount), other = sourceMoney(expense.otherTaxBenefitAmount);
            const allowance = sourceMoney(expense.roomBoardAllowance), housing = sourceMoney(expense.schoolOwnedHousingCharge);
            const category = expense.halfTimeStudent ? Decimal.min(amount.minus(refund), Decimal.max(allowance, housing)) : new Decimal(0);
            const eligible = Decimal.max(0, category.minus(assistance).minus(creditExpense).minus(other));
            const requested = (qeeSummary.sourceFacts.allocations ?? []).filter(source => source.expenseId === expense.id)
              .reduce((total, source) => total.plus(sourceMoney(source.amount)), new Decimal(0));
            qualifiedAllocation = requested.isZero() ? new Decimal(0) : sourceMoney(allocation?.amount).mul(Decimal.min(1, eligible.div(requested)));
            if (!qualifiedAllocation.eq(sourceMoney(allocation?.amount))) {
              if (!prepared) assertDistinctEducationBeneficiaries(forms, qeeSummary.sourceFacts);
              if (forms.filter(source => source.beneficiaryId === row.beneficiaryId).length !== 1
                || (qeeSummary.sourceFacts.expenses ?? []).filter(source => source.beneficiaryId === row.beneficiaryId).length !== 1
                || allocations.length !== 1 || [refund, assistance, creditExpense, other].some(value => !value.isZero())) {
                throw new Error("Education reference partial room-and-board source group is unsupported");
              }
            }
            const roomBoard = requireAudit("Form1099-Q", `${row.sourceId}:in-kind-room-board:${expense.id}`, qualifiedAllocation);
            const expected = {
              "Actual expense": amount, "School allowance": allowance, "School-owned housing charge": housing,
              "Refund": refund, "Tax-free assistance": assistance, "Education credit expense": creditExpense,
              "Other tax benefit": other, "Original allocation": sourceMoney(allocation?.amount),
            };
            if (roomBoard.inputs["Half-time enrollment"] !== (expense.halfTimeStudent ? "yes" : "no")
              || Object.entries(expected).some(([key, value]) => !Decimal.isDecimal(roomBoard.inputs[key]) || !(roomBoard.inputs[key] as Decimal).eq(value))) {
              throw new Error("Education reference room-and-board school sources disagree with the audit");
            }
            sourceLines.push(describe(roomBoard, `Statement ${index + 1}: `));
          }
          qualified = qualified.plus(qualifiedAllocation);
        }
        if (!qualified.eq(row.adjustedQEE)) throw new Error("Education reference in-kind qualified cost disagrees with its audit");
      }
      const correction = result.returnedContributions.find(item => item.sourceId === row.sourceId);
      if (row.treatment === "returned_contribution") {
        if (!correction || !["2", "3"].includes(form.distributionCode ?? "") || correction.incomeTaxYear !== correction.sourceTaxYear - (form.distributionCode === "3" ? 1 : 0) || result.returnedContributions.filter(item => item.sourceId === row.sourceId).length !== 1 || form.returnedContributionNetIncomeConfirmed !== true || form.returnedContributionBasisReconciled !== true
          || form.returnedContributionId !== correction.contributionId || form.returnedContributionTaxYear !== correction.incomeTaxYear || form.taxYear !== correction.sourceTaxYear || row.incomeTaxYear !== correction.incomeTaxYear
          || correction.accountId !== row.accountId || correction.recipientOwner !== row.recipientOwner || correction.recipientId !== row.recipientId
          || form.returnedContributionPrincipal === undefined || form.returnedContributionNetIncome === undefined || form.returnedContributionIncomePreviouslyReported === undefined
          || !new Decimal(form.returnedContributionPrincipal).eq(correction.returnedPrincipal) || !new Decimal(form.returnedContributionNetIncome).eq(correction.netIncome) || !new Decimal(form.returnedContributionIncomePreviouslyReported).eq(correction.previouslyReportedEarnings)
          || !row.earnings.eq(correction.netIncome) || !row.basis.eq(correction.returnedPrincipal)) throw new Error("Education reference correction source does not reconcile");
        for (const [line, amount] of [["returned-principal", correction.returnedPrincipal], ["returned-net-income", correction.netIncome], ["income-year-earnings", correction.taxableEarnings], ["previously-reported-earnings", correction.previouslyReportedEarnings], ["income-adjustment", correction.incomeAdjustment]] as const) sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:${line}`, amount), `Statement ${index + 1}: `));
      } else if (correction || ["2", "3"].includes(form.distributionCode ?? "") || row.incomeTaxYear !== result.taxYear) throw new Error("Education reference ordinary source year or correction identity does not reconcile");
      if (row.treatment === "account_disqualification") {
        const actualAmount = (value: string | undefined) => {
          if (value === undefined) throw new Error("Education reference disqualification source amount is missing");
          const amount = new Decimal(value);
          if (!amount.isFinite() || amount.lt(0)) throw new Error("Education reference disqualification source amount is invalid");
          return amount;
        };
        if (form.distributionCode !== "6" || form.accountType !== "coverdell_esa" || form.prohibitedTransactionKind !== "account_disqualification" || form.prohibitedTransactionSourceConfirmed !== true || !form.prohibitedTransactionSourceReference?.trim()
          || form.prohibitedTransactionNoPostDisqualificationActivityConfirmed !== true || !form.prohibitedTransactionPostDisqualificationSourceReference?.trim()
          || !actualAmount(form.prohibitedTransactionQualifiedEducationExpenses).isZero() || !actualAmount(form.prohibitedTransactionJanuary1Value).eq(row.grossDistribution)
          || !actualAmount(form.prohibitedTransactionBasis).eq(row.basis) || !row.basis.plus(row.earnings).eq(row.grossDistribution) || row.earnings.lt(0) || !roundDollar(row.earnings).eq(row.taxableEarnings)
          || form.transfer?.kind !== "none" || form.isTrusteeToTrustee || form.isQtpToRoth || form.recipientNotBeneficiary
          || [row.validTransfers, row.adjustedQEE, row.taxFreeEarnings, row.educationExpenseExcludedEarnings, row.transferExcludedEarnings, row.creditException, row.penaltyException].some(value => !value.isZero())) throw new Error("Education reference disqualification source boundary disagrees with the calculation");
        const facts = qeeSummary.sourceFacts;
        const beneficiaries = facts.beneficiaries?.filter(item => item.id === row.beneficiaryId) ?? [];
        if (beneficiaries.length !== 1 || !actualAmount(beneficiaries[0]?.outsideK12QualifiedDistributions).isZero()
          || forms.some(other => other.accountId === row.accountId && other.sourceId !== row.sourceId)
          || facts.coverdellAccounts?.some(item => item.accountId === row.accountId) || facts.expenses?.some(item => item.beneficiaryId === row.beneficiaryId)
          || facts.allocations?.some(item => item.sourceId === row.sourceId) || facts.penaltyExceptions?.some(item => item.sourceId === row.sourceId)) throw new Error("Education reference disqualification has conflicting source facts");
        const deemed = requireAudit("Coverdell disqualification", `${row.sourceId}:deemed-distribution`, row.grossDistribution);
        if (deemed.inputs["Deemed distribution date"] !== `${result.taxYear}-01-01` || deemed.inputs["Actual transaction date"] !== form.prohibitedTransactionDate) throw new Error("Education reference disqualification date audit disagrees with the actual source");
        sourceLines.push(describe(deemed, `Statement ${index + 1}: `));
        for (const [line, value] of [["basis", row.basis], ["earnings", row.earnings], ["taxable-earnings", row.taxableEarnings], ["qualified-expenses", new Decimal(0)]] as const) sourceLines.push(describe(requireAudit("Coverdell disqualification", `${row.sourceId}:${line}`, value), `Statement ${index + 1}: `));
      } else if (form.distributionCode === "6") throw new Error("Education reference code6 requires its actual disqualification method and audit");
      const hasReportedEarnings = form.earnings !== undefined;
      const hasReportedBasis = form.basis !== undefined;
      if (hasReportedEarnings !== hasReportedBasis || (form.accountType === "529" && !hasReportedEarnings)) throw new Error("Education reference reported source Boxes2/3 must be jointly reconciled");
      if (form.earnings !== undefined && form.basis !== undefined) {
        const earnings = new Decimal(form.earnings), basis = new Decimal(form.basis);
        if (!earnings.isFinite() || !basis.isFinite() || !earnings.plus(basis).eq(row.grossDistribution)) throw new Error("Education reference source Boxes2/3 do not reconcile to Box1");
        if (correction) {
          const expectedEarnings = correction.netIncome.lt(0) && form.finalDistribution !== true ? new Decimal(0) : correction.netIncome;
          if (!earnings.eq(expectedEarnings) || !basis.eq(row.grossDistribution.minus(expectedEarnings))) throw new Error("Education reference reported correction boxes disagree with the source calculation");
        } else {
          const roundedAccountWorksheet = form.accountType === "coverdell_esa" && row.treatment === "ordinary";
          const expectedEarnings = roundedAccountWorksheet ? roundDollar(earnings) : earnings;
          const expectedBasis = roundedAccountWorksheet ? roundDollar(basis) : basis;
          if (!expectedEarnings.eq(row.earnings) || !expectedBasis.eq(row.basis)) throw new Error("Education reference reported source boxes disagree with the calculation");
        }
      }
      seen.add(row.sourceId);
      for (const [line, field] of distributionFields) sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:${line}`, row[field]), `Statement ${index + 1}: `));
      if (form.transfer?.kind !== "none") sourceLines.push(describe(requireAudit("Form1099-Q", `${row.sourceId}:valid-transfer`, row.validTransfers), `Statement ${index + 1}: `));
    }
    for (const [index, beneficiary] of (qeeSummary.sourceFacts.beneficiaries ?? []).entries()) {
      if (!qeeSummary.sourceFacts.expenses?.some(expense => expense.beneficiaryId === beneficiary.id && expense.category.startsWith("k12_"))) continue;
      const cap = requireAudit("Form1099-Q", `${beneficiary.id}:k12-qualified`);
      const outside = sourceMoney(beneficiary.outsideK12QualifiedDistributions);
      const outsideAudit = cap.inputs["Outside-plan qualified distributions"];
      if (!Decimal.isDecimal(outsideAudit) || !outsideAudit.eq(outside)) throw new Error("Education reference outside K12 cash sources disagree with the audit");
      sourceLines.push(describe(cap, `Beneficiary ${index + 1}: `));
      qualifiedEducationExpenseInputs.push({ label: `Beneficiary ${index + 1}: Outside-plan qualified K-12 cash distributions`, value: outside.toFixed() });
    }
    const sumRows = (field: "grossDistribution" | "earnings" | "basis") => result.perDistribution.reduce((sum, row) => sum.plus(row[field]), new Decimal(0));
    if (!sumRows("grossDistribution").eq(result.grossDistribution) || !sumRows("earnings").eq(result.totalEarnings) || !sumRows("basis").eq(result.totalBasis)) throw new Error("Education source audit totals do not reconcile");
    if (result.perDistribution.some(source => result.perRecipient.filter(recipient => recipient.owner === source.recipientOwner && recipient.recipientId === source.recipientId).length !== 1)) throw new Error("Education reference recipient source audits are missing or duplicated");
    const ordinaryCoverdellSources = result.perDistribution.filter(row => row.accountType === "coverdell_esa" && row.treatment === "ordinary");
    const accountIds = new Set(ordinaryCoverdellSources.map(row => row.accountId));
    if (accountIds.size !== result.coverdellAccounts.length || result.coverdellAccounts.some(row => !accountIds.delete(row.accountId))) throw new Error("Education reference Coverdell account source audits do not reconcile");
    for (const [index, row] of result.coverdellAccounts.entries()) {
      const histories = (qeeSummary.sourceFacts.coverdellAccounts ?? []).filter(history => history.accountId === row.accountId);
      const history = histories[0];
      if (!history || histories.length !== 1) throw new Error("Education reference requires one actual Coverdell account history");
      const accountSources = ordinaryCoverdellSources.filter(source => source.accountId === row.accountId);
      if (accountSources.some(source => source.beneficiaryId !== row.beneficiaryId)) throw new Error("Education reference Coverdell beneficiary source does not reconcile");
      const sourceAmount = (value: string | undefined) => {
        if (value === undefined) throw new Error("Education reference actual Coverdell source amount is missing");
        const amount = new Decimal(value);
        if (!amount.isFinite() || amount.lt(0)) throw new Error("Education reference actual Coverdell source amount is invalid");
        return amount;
      };
      const incoming = sourceAmount(history.rolloverBasisReceived);
      const outgoing = accountSources.reduce((total, source) => source.validTransfers.isZero() ? total : total.plus(sourceAmount(forms.find(form => form.sourceId === source.sourceId)?.transfer?.coverdellTransferredBasis)), new Decimal(0));
      const expectedAuditForm = incoming.gt(0) || outgoing.gt(0) ? "Coverdell rollover worksheet" : "Pub970 WS6-3";
      if (row.auditForm !== expectedAuditForm) throw new Error("Education reference Coverdell worksheet identity disagrees with actual rollover sources");
      const priorBasis = sourceAmount(history.priorYearBasis), contributions = sourceAmount(history.currentYearContributions);
      const gross = accountSources.reduce((total, source) => total.plus(source.grossDistribution).minus(source.validTransfers), new Decimal(0));
      const yearEndValue = sourceAmount(history.yearEndValue), outstandingRollovers = sourceAmount(history.outstandingRollovers);
      for (const [line, amount] of [["prior-basis", priorBasis], ["current-contributions", contributions], ["rollover-basis-in", incoming], ["rollover-basis-out", outgoing], ["gross-distributions", gross], ["year-end-value", yearEndValue], ["outstanding-rollovers", outstandingRollovers]] as const) sourceLines.push(describe(requireAudit("Coverdell source", `${row.accountId}:${line}`, amount), `Coverdell account ${index + 1}, source: `));
      const sourceInputLines = new Map<string, Decimal>([["1", roundDollar(contributions)], ["2", roundDollar(priorBasis)], ["3", roundDollar(priorBasis).plus(roundDollar(contributions)).plus(roundDollar(incoming)).minus(roundDollar(outgoing))], ["4", roundDollar(gross)], ["7", roundDollar(yearEndValue.plus(outstandingRollovers))], ["rollover-basis-in", roundDollar(incoming)], ["rollover-basis-out", roundDollar(outgoing)]]);
      const worksheetLabel = row.auditForm === "Coverdell rollover worksheet" ? "rollover reconciliation" : "worksheet";
      for (const line of ["rollover-basis-in", "rollover-basis-out", "F", "G", "H", ...Array.from({ length: 15 }, (_, i) => String(i + 1))]) {
        const expected = line === "10" ? row.distributedBasis : line === "11" ? row.earnings : line === "15" ? row.endingBasis : sourceInputLines.get(line);
        sourceLines.push({ ...describe(requireAudit(row.auditForm, `${row.accountId}:${line}`, expected), `Coverdell account ${index + 1}, ${worksheetLabel} ${line}: `), ...(["H", "9", "12"].includes(line) ? { isRatio: true as const } : {}) });
      }
    }
    if (result.coverdellAccounts.length) {
      const hasRolloverWorksheet = result.coverdellAccounts.some(row => row.auditForm === "Coverdell rollover worksheet");
      const taxable = ordinaryCoverdellSources.reduce((total, row) => total.plus(row.taxableEarnings), new Decimal(0));
      sourceLines.push(describe(requireAudit(hasRolloverWorksheet ? "Coverdell rollover worksheet" : "Pub970 WS6-3", "16", taxable), `Coverdell ${hasRolloverWorksheet ? "rollover reconciliation" : "worksheet"} line 16: `));
    }
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
      if (expense.category === "postsecondary_room_board") {
        qualifiedEducationExpenseInputs.push({ label: `Expense ${index + 1}: Half-time enrollment`, value: yesNo(expense.halfTimeStudent) });
        for (const [field, label] of [["roomBoardAllowance", "School allowance"], ["schoolOwnedHousingCharge", "School-owned housing charge"]] as const) qualifiedEducationExpenseInputs.push({ label: `Expense ${index + 1}: ${label}`, value: knownAmount(expense[field]) });
      }
      const benefits = benefitSources.filter(benefit => benefit.expenseId === expense.id);
      if (benefits.length) {
        const inKindSourceIds = new Set(benefits.map(benefit => benefit.sourceId));
        const allocations = qeeSummary.sourceFacts.allocations?.filter(allocation => allocation.expenseId === expense.id && inKindSourceIds.has(allocation.sourceId)) ?? [];
        const remaining = sourceMoney(expense.amount).minus(sourceMoney(expense.refundedAmount)).minus(sourceMoney(expense.taxFreeAssistance)).minus(sourceMoney(expense.educationCreditAmount)).minus(sourceMoney(expense.otherTaxBenefitAmount)).minus(allocations.reduce((total, allocation) => total.plus(sourceMoney(allocation.amount)), new Decimal(0)));
        if (remaining.lt(0)) throw new Error("Education reference in-kind benefit costs exceed remaining actual expense");
        sourceLines.push(describe(requireAudit("Form1099-Q", `${expense.id}:after-in-kind`, remaining), `Expense ${index + 1}: `));
      }
    }
    for (const [index, row] of result.loanInterestSourceAdjustments.entries()) sourceLines.push(describe(requireAudit("Form1099-Q", `loan-expense:${row.expenseId}:loan-interest-reduction`, row.taxFreeEarningsUsedForInterest), `Loan expense ${index + 1}: `));
  } else {
    for (const [field, label] of [["totalQualifiedExpenses", "Total qualified education expenses"], ["taxFreeEducationalAssistance", "Tax-free educational assistance"], ["amountsUsedForEducationCredits", "Amounts used for education credits"], ["penaltyExceptionScholarshipAmount", "Scholarship penalty exception amount"], ["penaltyExceptionMilitaryAcademyAmount", "Military academy penalty exception amount"]] as const) qualifiedEducationExpenseInputs.push({ label, value: knownAmount(qeeSummary?.[field]) });
    qualifiedEducationExpenseInputs.push({ label: "Death exception", value: yesNo(qeeSummary?.penaltyExceptionDeath) }, { label: "Disability exception", value: yesNo(qeeSummary?.penaltyExceptionDisability) });
  }
  return {
    title: "Form 1099-Q Education Distribution Reference Summary", warningLabel: "REFERENCE SUMMARY ONLY", statementCount: forms.length,
    introduction: `Tax year ${result.taxYear}. Computed from ${forms.length} statement${forms.length === 1 ? "" : "s"} using ${result.sourceFactsVerified ? "confirmed actual source records and allocations" : "unverified historical aggregate inputs"}. Other-recipient income and additional tax are excluded from this return's totals.`,
    forms: forms.map((form, index) => ({ ...(form.taxYear !== undefined ? { taxYear: form.taxYear } : {}), payerName: form.payerName?.trim() || `Statement ${index + 1}`, accountType: form.accountType === "coverdell_esa" ? "Coverdell ESA" : "529 plan",
      ...(result.sourceFactsVerified ? { distributionForm: form.distributionMedium === "cash" ? "Cash distribution" : form.distributionMedium === "in_kind_prepaid_tuition" ? "Prepaid tuition or in-kind benefit" : "Not provided" } : {}),
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

export async function fillForm1099QReference(forms: Form1099Q[], result: Form1099QResult, qeeSummary: QualifiedEducationExpenseSummary | undefined, outputDir: string, prepared?: PreparedEducationReview): Promise<string> {
  const summary = buildForm1099QReferenceSummary(forms, result, qeeSummary, prepared);
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
    draw(`Statement ${index + 1}: ${form.payerName}`, true); draw(`Account type: ${form.accountType}`); if (form.taxYear !== undefined) draw(`Statement tax year: ${form.taxYear}`);
    if (form.distributionForm !== undefined) draw(`Distribution form: ${form.distributionForm}`);
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
