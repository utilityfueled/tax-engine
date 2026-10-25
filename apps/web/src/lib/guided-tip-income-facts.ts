import type { Schedule1AData } from "./guided-schedule-1-a-facts";
import { Form4137Schema, type Form4137Input } from "@/models/inputs";
import { getConstants } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { calculateForm4137, type Form4137PayrollContext } from "@/engine/forms/form-4137";
import type { FilingStatus, GuidedFlowState, W2EntryData } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

type Owner = "primary" | "spouse";
export interface TipEmployerData {
  sourceId: string; employerName: string; employerEin: string; w2SourceIds: string[];
  cashAndChargeTipsReceived: string; tipsReportedToEmployer: string; allocatedTips: string;
  adequateRecordsSupportUnreportedTips: boolean | null; railroadRetirementCovered: boolean | null;
  medicareOnlyGovernmentUnreportedTips: string; medicareOnlyGovernmentQualificationConfirmed: boolean | null;
  reportedTipsNotIncludedInBox7: string; box7TipsExcludedFromReportedTotal: string; reportedTipReconciliationReference: string;
  smallTipMonths: { month: string; totalCashAndChargeTips: string; tipsReportedToEmployer: string }[];
}
export interface TipIncomeAccountData {
  accountHolder: "" | Owner; sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null;
  allEmployersIncluded: boolean | null; reportingYearTreatmentConfirmed: boolean | null;
  railroadRetirementCompensation: string; noncashTipsNotIncludedInWages: string; employers: TipEmployerData[];
}
export const emptyTipIncomeAccount: TipIncomeAccountData = { accountHolder: "", sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null,
  allEmployersIncluded: null, reportingYearTreatmentConfirmed: null, railroadRetirementCompensation: "", noncashTipsNotIncludedInWages: "", employers: [] };
export const emptyTipEmployer: TipEmployerData = { sourceId: "", employerName: "", employerEin: "", w2SourceIds: [], cashAndChargeTipsReceived: "", tipsReportedToEmployer: "", allocatedTips: "", adequateRecordsSupportUnreportedTips: null,
  railroadRetirementCovered: null, medicareOnlyGovernmentUnreportedTips: "", medicareOnlyGovernmentQualificationConfirmed: null, reportedTipsNotIncludedInBox7: "", box7TipsExcludedFromReportedTotal: "", reportedTipReconciliationReference: "", smallTipMonths: [] };
function money(value: string | undefined, label: string) {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value);
}
export function tipIncomeW2Sources(entries: W2EntryData[] = []): Form4137PayrollContext["w2s"] {
  // These are the same complete source records and indexes emitted by buildW2Inputs.
  return entries.filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld)).map((entry, index) => {
    if (entry.accountHolder !== "primary" && entry.accountHolder !== "spouse") throw new Error("Actual tip payroll requires each W2's actual owner.");
    const allocated = "allocatedTips" in entry ? entry.allocatedTips : undefined;
    if (allocated !== undefined && typeof allocated !== "string") throw new Error("Enter actual W2 Box8 allocated tips.");
    return { sourceId: `formW2:${index}`, accountHolder: entry.accountHolder,
      employerName: entry.employerName, employerEin: entry.employerEin,
      socialSecurityWages: money(entry.socialSecurityWages, "W2 Box3"), socialSecurityTips: money(entry.socialSecurityTips, "W2 Box7"),
      allocatedTips: hasEnteredAmount(allocated) ? money(allocated, "W2 Box8") : undefined };
  });
}
export function buildTipIncomeInputs(accounts: TipIncomeAccountData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, w2Entries: W2EntryData[] = []) {
  if (!accounts) return undefined;
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus) throw new Error("Choose the actual return year and filing status for tip sources.");
  const result: Partial<Record<Owner, Form4137Input>> = {};
  if (accounts.length && w2Entries.some(entry => Object.values(entry.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation"))) throw new Error("Confirm original W2 source suggestions before reconciling tip sources.");
  const payroll = accounts.length ? tipIncomeW2Sources(w2Entries) : [];
  for (const account of accounts) {
    const owner = account.accountHolder;
    if (owner !== "primary" && owner !== "spouse") throw new Error("Enter the actual owner for each tip-income worksheet.");
    if (owner === "spouse" && filingStatus !== "mfj") throw new Error("A spouse's tip income requires the actual joint return.");
    if (result[owner]) throw new Error("Duplicate tip-income owner worksheet.");
    if (!/^\d{4}$/.test(account.sourceTaxYear) || Number(account.sourceTaxYear) !== taxYear) throw new Error("Tip source year must match the actual return year.");
    const facts = Form4137Schema.parse({ accountHolder: owner, sourceFacts: {
      sourceTaxYear: Number(account.sourceTaxYear), sourceReference: account.sourceReference,
      sourceFactsConfirmed: account.sourceFactsConfirmed ?? undefined, allEmployersIncluded: account.allEmployersIncluded ?? undefined, reportingYearTreatmentConfirmed: account.reportingYearTreatmentConfirmed ?? undefined,
      railroadRetirementCompensation: money(account.railroadRetirementCompensation, "actual railroad compensation").toFixed(), noncashTipsNotIncludedInWages: money(account.noncashTipsNotIncludedInWages, "actual noncash tips outside wages").toFixed(),
      employers: account.employers.map(employer => ({ ...employer,
        cashAndChargeTipsReceived: money(employer.cashAndChargeTipsReceived, "annual cash and charge tips received").toFixed(), tipsReportedToEmployer: money(employer.tipsReportedToEmployer, "annual tips reported").toFixed(), allocatedTips: money(employer.allocatedTips, "actual allocated tips").toFixed(),
        adequateRecordsSupportUnreportedTips: employer.adequateRecordsSupportUnreportedTips ?? undefined, railroadRetirementCovered: employer.railroadRetirementCovered ?? undefined,
        medicareOnlyGovernmentUnreportedTips: money(employer.medicareOnlyGovernmentUnreportedTips, "actual Medicare-only government tips").toFixed(), medicareOnlyGovernmentQualificationConfirmed: employer.medicareOnlyGovernmentQualificationConfirmed ?? undefined,
        reportedTipsNotIncludedInBox7: money(employer.reportedTipsNotIncludedInBox7, "reported tips outside Box7").toFixed(), box7TipsExcludedFromReportedTotal: money(employer.box7TipsExcludedFromReportedTotal, "Box7 tips outside the annual reported total").toFixed(),
        reportedTipReconciliationReference: employer.reportedTipReconciliationReference.trim() || undefined,
        smallTipMonths: employer.smallTipMonths.map(month => ({ month: /^\d{1,2}$/.test(month.month) ? Number(month.month) : undefined,
          totalCashAndChargeTips: money(month.totalCashAndChargeTips, "actual employer-month tips").toFixed(), tipsReportedToEmployer: money(month.tipsReportedToEmployer, "actual employer-month reported tips").toFixed() })),
      })),
    } });
    if (money(account.railroadRetirementCompensation, "actual railroad compensation").gt(0)) throw new Error("RRTA compensation requires its separate Medicare source worksheet before this guided return can calculate it.");
    calculateForm4137(facts, taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025), { sourcePayroll: { accountHolder: owner, w2s: payroll.filter(row => row.accountHolder === owner) } });
    result[owner] = facts;
  }
  return result;
}

export interface AdditionalDeductionsData { tipIncomeAccounts?: TipIncomeAccountData[]; schedule1A?: Schedule1AData }
export function tipIncomeW2Options(entries: W2EntryData[] = []) {
  return entries.filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld)).map((entry, index) => ({ sourceId: `formW2:${index}`, accountHolder: entry.accountHolder ?? "", employerName: entry.employerName, employerEin: entry.employerEin }));
}
export function tipIncomeFactErrors(state: GuidedFlowState): Record<string, string> {
  try { buildTipIncomeInputs(state.sectionData["additional-deductions"]?.tipIncomeAccounts, state.segmentation.filingStatus, state.taxYear, state.sectionData["income-w2"]?.entries); return {}; }
  catch (error) { return { tipSources: error instanceof Error ? error.message : "Complete the actual tip sources before calculating." }; }
}
