/** Government payment sources. Spec: spec/federal/form-1099-g-sources.yaml. */
import Decimal from "decimal.js";
import type { Form1099G, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

type Owner = "primary" | "spouse";
export interface GovernmentPaymentSource {
  sourceId: string;
  accountHolder?: Owner;
  sourceFactsVerified: boolean;
  unemploymentReceived: Decimal;
  currentYearRepaid: Decimal;
  netUnemployment: Decimal;
  taxableFamilyLeave: Decimal;
  taxableRtaa: Decimal;
  taxableGrants: Decimal;
  federalWithheld: Decimal;
}
export interface GovernmentUnemploymentProgram {
  programId: string;
  accountHolder?: Owner;
  sourceIds: string[];
  netBenefits: Decimal;
  openingContributions: Decimal;
  contributionsRecovered: Decimal;
  endingContributions: Decimal;
  taxableUnemployment: Decimal;
}
export interface Form1099GResult {
  taxYear: number;
  sourceFactsVerified: boolean;
  taxableUnemployment: Decimal;
  currentYearRepaid: Decimal;
  taxableFamilyLeave: Decimal;
  taxableRtaa: Decimal;
  taxableGrants: Decimal;
  otherIncome: Decimal;
  federalWithheld: Decimal;
  sources: GovernmentPaymentSource[];
  programs: GovernmentUnemploymentProgram[];
  refundSources: Array<{ sourceId: string; accountHolder?: Owner; amount: Decimal; refundTaxYear: number }>;
  stateWithholding: Array<{ sourceId: string; accountHolder?: Owner; state: string; statePayerId?: string; amount: Decimal }>;
  lines: CalculatedLine[];
}

function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Form1099G requires actual ${label}; unknown is not zero.`);
  const number = new Decimal(value);
  if (!number.isFinite() || number.lt(0)) throw new Error(`Form1099G ${label} must be finite and nonnegative.`);
  return number;
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Form1099G requires actual ${label}.`);
  return value.trim();
}

export function calculateForm1099G(forms: Form1099G[], taxYear = 2025, filingStatus?: TaxYearInput["taxpayer"]["filingStatus"]): Form1099GResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error(`Form1099G source worksheet does not support tax year ${taxYear}.`);
  const audit = new AuditTrail();
  const seenIds = new Set<string>(), seenStatements = new Set<string>();
  const sources: GovernmentPaymentSource[] = [];
  const programs = new Map<string, GovernmentUnemploymentProgram>();
  const refundSources: Form1099GResult["refundSources"] = [];
  const stateWithholding: Form1099GResult["stateWithholding"] = [];
  for (const [index, form] of forms.entries()) {
    const sourceFields = ["sourceId", "accountReference", "taxYear", "sourceFormRevision", "sourceFactsConfirmed", "actualReceiptConfirmed", "additionalWorksheetRequired", "programType", "rtaaPayments", "taxableGrants", "grantIncomeCategory", "agriculturePayments", "tradeOrBusinessRefund", "marketGain", "familyLeaveBenefits", "familyLeaveProgramType", "currentYearRepaid", "priorYearRepaid", "unemploymentReceivedBeforeRepayment", "box1IncludesCurrentYearRepayment", "repaymentSourceReference", "unrecoveredAfterTaxContributions", "contributionProgramId", "contributionHistoryReference", "contributionBalanceReconciled", "allProgramPaymentsIncluded", "stateTaxReporting", "statePayerId"] as const;
    const verified = taxYear === 2026 || sourceFields.some(field => form[field] !== undefined);
    const sourceId = verified ? text(form.sourceId, "source identity") : `legacy-${index + 1}`;
    if (seenIds.has(sourceId)) throw new Error("Form1099G duplicate source identity.");
    seenIds.add(sourceId);
    const record = (line: string, description: string, value: Decimal, formula: string) => audit.record("Form1099-G", `${sourceId}:${line}`, description, value, formula);
    const box1 = amount(form.unemploymentCompensation, "Box1 unemployment");
    const withheld = amount(form.federalWithheld, "Box4 withholding");
    let received = box1, repayment = new Decimal(0), balance = new Decimal(0), family = new Decimal(0), rtaa = new Decimal(0), grants = new Decimal(0);
    let programId = sourceId, programKey = JSON.stringify(["source", sourceId]);
    if (verified) {
      if (form.sourceFactsComplete !== true || form.sourceFactsConfirmed !== true || form.actualReceiptConfirmed !== true) throw new Error("Form1099G requires complete confirmed actual source and receipt facts before defaults.");
      if (form.taxYear !== taxYear) throw new Error("Form1099G source year must match the return.");
      if (form.sourceFormRevision !== (taxYear === 2026 ? "2026-12" : "2024-03")) throw new Error("Form1099G source revision does not match the source year.");
      text(form.payer, "payer");
      const payerTin = text(form.payerTin, "payer TIN").replace(/-/g, "");
      if (!/^\d{9}$/.test(payerTin)) throw new Error("Form1099G requires the actual nine-digit payer TIN.");
      if (!form.accountHolder) throw new Error("Form1099G requires actual recipient owner.");
      if (form.accountHolder === "spouse" && filingStatus && filingStatus !== "married_filing_jointly") throw new Error("Form1099G spouse payments require a joint return.");
      const statementKey = JSON.stringify([payerTin, form.accountHolder, text(form.accountReference, "statement reference").toLowerCase(), taxYear]);
      if (seenStatements.has(statementKey)) throw new Error("Form1099G duplicate or corrected statement requires reconciliation.");
      seenStatements.add(statementKey);
      if (form.additionalWorksheetRequired !== false) throw new Error("Form1099G has a separate unresolved source worksheet.");
      if (form.programType !== "government-unemployment" && form.programType !== "other-government") throw new Error("Form1099G employer/private/union program requires separate source classification.");
      repayment = amount(form.currentYearRepaid, "current-year repayment");
      if (!amount(form.priorYearRepaid, "prior-year repayment").isZero()) throw new Error("Form1099G prior-year repayment requires the separate actual claim-of-right worksheet.");
      if (repayment.gt(0)) {
        text(form.repaymentSourceReference, "repayment source reference");
        received = amount(form.unemploymentReceivedBeforeRepayment, "gross receipts before repayment");
        if (typeof form.box1IncludesCurrentYearRepayment !== "boolean") throw new Error("Form1099G requires actual Box1 repayment reporting reconciliation.");
        if (repayment.gt(received)) throw new Error("Form1099G repayment exceeds actual current-year receipts.");
        const expectedBox = form.box1IncludesCurrentYearRepayment ? received : received.minus(repayment);
        if (!expectedBox.eq(box1)) throw new Error("Form1099G Box1 and actual repayment records do not reconcile.");
      } else if (form.unemploymentReceivedBeforeRepayment !== undefined && !amount(form.unemploymentReceivedBeforeRepayment, "gross receipts").eq(box1)) {
        throw new Error("Form1099G gross receipts do not reconcile to Box1 without a repayment.");
      }
      balance = amount(form.unrecoveredAfterTaxContributions, "unrecovered nondeductible unemployment contributions");
      if (form.programType !== "government-unemployment" && (received.gt(0) || balance.gt(0))) throw new Error("Form1099G unemployment amounts require actual government-unemployment program classification.");
      if (balance.gt(0) || form.contributionProgramId !== undefined) {
        programId = text(form.contributionProgramId, "contribution program identity");
        text(form.contributionHistoryReference, "contribution history reference");
        if (form.contributionBalanceReconciled !== true || form.allProgramPaymentsIncluded !== true) throw new Error("Form1099G actual contribution balance and complete program payment history must be reconciled.");
        programKey = JSON.stringify(["program", payerTin, form.accountHolder, programId]);
      }
      rtaa = amount(form.rtaaPayments, "Box5 RTAA");
      grants = amount(form.taxableGrants, "Box6 taxable grants");
      if (grants.gt(0) && form.grantIncomeCategory !== "nonbusiness") throw new Error("Form1099G taxable grant requires actual nonbusiness classification or separate business/farm worksheet.");
      if (amount(form.agriculturePayments, "Box7 agriculture payments").gt(0) || amount(form.marketGain, "Box9 market gain").gt(0)) throw new Error("Form1099G agriculture or CCC payments require the separate farm worksheet.");
      if (typeof form.tradeOrBusinessRefund !== "boolean") throw new Error("Form1099G requires actual Box8 business-refund status.");
      const refund = amount(form.stateOrLocalTaxRefund, "Box2 refund"), alias = amount(form.stateLocalIncomeTaxRefund, "legacy Box2 refund alias");
      if (refund.gt(0) && alias.gt(0) && !refund.eq(alias)) throw new Error("Form1099G refund aliases do not reconcile.");
      const refundAmount = Decimal.max(refund, alias);
      if (refundAmount.gt(0)) {
        if (!Number.isInteger(form.refundTaxYear) || form.refundTaxYear === undefined || form.refundTaxYear < 1900 || form.refundTaxYear > taxYear) throw new Error("Form1099G requires the actual refund origin year.");
        if (form.tradeOrBusinessRefund) throw new Error("Form1099G business refund requires its separate business tax-benefit worksheet.");
        refundSources.push({ sourceId, accountHolder: form.accountHolder, amount: refundAmount, refundTaxYear: form.refundTaxYear });
        record("2", `Refund for actual tax year ${form.refundTaxYear}`, refundAmount, "Source amount only; separate historical tax-benefit calculation required");
      }
      family = taxYear === 2026 ? amount(form.familyLeaveBenefits, "Box10 family leave") : amount(form.familyLeaveBenefits ?? "0", "family leave source");
      if (family.gt(0) && (taxYear !== 2026 || form.familyLeaveProgramType !== "state-pfml-family")) throw new Error("Form1099G family benefits require the actual 2026 source and state family-leave classification; medical/private benefits need separate treatment.");
      const stateTax = amount(form.stateWithheld, "state withholding");
      if (form.stateTaxReporting === "none") {
        if (!stateTax.isZero() || form.state?.trim() || form.statePayerId?.trim()) throw new Error("Form1099G saved state information contradicts no state reporting.");
      } else if (form.stateTaxReporting === "single") {
        const state = text(form.state, "source state").toUpperCase();
        if (!/^[A-Z]{2}$/.test(state)) throw new Error("Form1099G requires actual source state information.");
        stateWithholding.push({ sourceId, accountHolder: form.accountHolder, state, ...(form.statePayerId?.trim() ? { statePayerId: form.statePayerId.trim() } : {}), amount: stateTax });
        record(taxYear === 2026 ? "12" : "11", "Actual state withholding", stateTax, "Actual source state withholding; never an income reduction");
      } else throw new Error("Form1099G multiple or unknown state reporting needs separate actual state records.");
    } else {
      record("legacy", "Unverified historical unemployment", received, "Historical Box1 aggregate; actual program, repayment and contribution sources unresolved");
    }
    const net = received.minus(repayment);
    const existing = programs.get(programKey);
    if (existing) {
      if (!existing.openingContributions.eq(balance)) throw new Error("Form1099G shared program contribution balances do not reconcile.");
      existing.netBenefits = existing.netBenefits.plus(net);
      existing.sourceIds.push(sourceId);
    } else programs.set(programKey, { programId, accountHolder: form.accountHolder, sourceIds: [sourceId], netBenefits: net, openingContributions: balance, contributionsRecovered: new Decimal(0), endingContributions: new Decimal(0), taxableUnemployment: new Decimal(0) });
    sources.push({ sourceId, accountHolder: form.accountHolder, sourceFactsVerified: verified, unemploymentReceived: received, currentYearRepaid: repayment, netUnemployment: net, taxableFamilyLeave: family, taxableRtaa: rtaa, taxableGrants: grants, federalWithheld: withheld });
    record("1", "Actual reported unemployment Box1", box1, "Source Box1 before withholding; repayment reporting is separately reconciled");
    record("repayment", "Current-year unemployment repaid", repayment, "Actual current-year benefits repaid once; preserve Repaid return annotation");
    record("4", "Federal income tax withheld", withheld, "Source Box4 kept separate from taxable income");
    if (verified) {
      record("5", "RTAA other income", rtaa, "Publication525 RTAA; Schedule1 other income");
      record("6", "Actual nonbusiness taxable grant income", grants, "Confirmed nonbusiness Box6; separate business/farm grants excluded from this route");
      if (taxYear === 2026) record("10", "State PFML family-leave other income", family, "Rev.Rul.2025-4 situations2/5: full gross family benefits; no unemployment basis or wage treatment");
    }
  }
  for (const program of programs.values()) {
    program.contributionsRecovered = Decimal.min(program.netBenefits, program.openingContributions);
    program.endingContributions = program.openingContributions.minus(program.contributionsRecovered);
    program.taxableUnemployment = program.netBenefits.minus(program.contributionsRecovered);
    const prefix = `${program.sourceIds.join("+")}:program`;
    audit.record("Form1099-G", `${prefix}:contributions-recovered`, "Actual nondeductible unemployment contributions recovered", program.contributionsRecovered, "Minimum of pooled net program benefits and reconciled available balance; recovered once");
    audit.record("Form1099-G", `${prefix}:ending-contributions`, "Remaining nondeductible unemployment contributions", program.endingContributions, "Actual available balance less contributions recovered");
    audit.record("Form1099-G", `${prefix}:taxable-unemployment`, "Taxable government unemployment", program.taxableUnemployment, "Pooled actual receipts less current-year repayments and contribution recovery");
  }
  const sumSources = (key: "currentYearRepaid" | "taxableFamilyLeave" | "taxableRtaa" | "taxableGrants" | "federalWithheld") => sources.reduce((total, source) => total.plus(source[key]), new Decimal(0));
  const taxableUnemployment = [...programs.values()].reduce((total, program) => total.plus(program.taxableUnemployment), new Decimal(0));
  const taxableFamilyLeave = sumSources("taxableFamilyLeave"), taxableRtaa = sumSources("taxableRtaa"), taxableGrants = sumSources("taxableGrants");
  const otherIncome = taxableFamilyLeave.plus(taxableRtaa).plus(taxableGrants);
  audit.record("Form1099-G", "taxable-unemployment", "Total taxable unemployment", taxableUnemployment, "Sum reconciled source programs once; downstream line rounding remains separate");
  audit.record("Form1099-G", "other-income", "Separate government other income", otherIncome, "State PFML family benefits plus RTAA plus confirmed nonbusiness taxable grants");
  return { taxYear, sourceFactsVerified: sources.every(source => source.sourceFactsVerified), taxableUnemployment, currentYearRepaid: sumSources("currentYearRepaid"), taxableFamilyLeave, taxableRtaa, taxableGrants, otherIncome, federalWithheld: sumSources("federalWithheld"), sources, programs: [...programs.values()], refundSources, stateWithholding, lines: audit.getLines() };
}
