import { buildVehicleRefinancingSources, type VehicleRefinancingData } from "./guided-vehicle-refinancing";
import { calculateVehicleRefinancing } from "@/engine/forms/vehicle-refinancing";
import { Schedule1ASchema, type Schedule1AInput } from "@/models/inputs";
import type { GuidedFlowState } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { isStartedNec } from "./guided-business-facts";
import { buildTipIncomeInputs } from "./guided-tip-income-facts";
import { buildStandardDeductionFacts } from "./guided-standard-deduction-facts";
import Decimal from "decimal.js";
type Owner = "primary" | "spouse";
type TipQualificationData = { owner: "" | Owner; occupationCode: string; eligibleOccupation: boolean | null; voluntaryCashTips: boolean | null; lawfulActivity: boolean | null; meetsSstbRuleOrTransition: boolean | null };
export interface EmployeeTipDeductionData extends TipQualificationData { employer: string; w2SourceIds: string[]; form4137EmployerSourceId: string; reportingMethod: "" | "w2" | "employer_statement" | "form4070" | "form4137"; reportingSourceReference: string; reportedEmployerTips: string; qualifiedW2Tips: string; qualifiedForm4137Tips: string }
export interface BusinessTipDeductionData extends TipQualificationData { businessSourceId: string; reportedTipSources: { sourceId: string; qualifiedTips: string }[] }
export interface OvertimeDeductionData { owner: "" | Owner; compensationSourceId: string; compensationExcludedFromWages: string; qualifiedPremium: string; requiredByFlsa: boolean | null; reportingSourceReference: string }
export interface VehicleInterestData {
  owner: "" | Owner; lenderName: string; loanAccountReference: string; sourceTaxYear: string; sourceReference: string; borrowerQualificationConfirmed: boolean | null;
  vin: string; acquiredDate: string; loanOriginationDate: string; interestPaid: string; businessInterestDeducted: string; nonqualifyingInterest: string;
  firstLien: boolean | null; originalUse: boolean | null; finalAssemblyUnitedStates: boolean | null; personalUse: boolean | null;
  vehicleType: "" | Schedule1AInput["vehicleLoans"][number]["vehicleType"]; grossVehicleWeightRating: string;
  refinancingSources?: VehicleRefinancingData;
  relatedParty: boolean | null; lease: boolean | null; fleet: boolean | null; salvageOrScrap: boolean | null; refinanced: boolean | null;
}
export interface Schedule1AData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allSourcesIncluded: boolean | null;
  excludedPuertoRicoIncome: string; form4563Exclusion: string; employeeTips: EmployeeTipDeductionData[]; businessTips: BusinessTipDeductionData[]; overtime: OvertimeDeductionData[]; vehicleLoans: VehicleInterestData[]; seniorOwners: ("" | Owner)[];
}
export const emptySchedule1AData: Schedule1AData = { sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allSourcesIncluded: null, excludedPuertoRicoIncome: "", form4563Exclusion: "", employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] };
const emptyTipQualification: TipQualificationData = { owner: "", occupationCode: "", eligibleOccupation: null, voluntaryCashTips: null, lawfulActivity: null, meetsSstbRuleOrTransition: null };
export const emptyEmployeeTipDeduction: EmployeeTipDeductionData = { ...emptyTipQualification, employer: "", w2SourceIds: [], form4137EmployerSourceId: "", reportingMethod: "", reportingSourceReference: "", reportedEmployerTips: "", qualifiedW2Tips: "", qualifiedForm4137Tips: "" };
export const emptyBusinessTipDeduction: BusinessTipDeductionData = { ...emptyTipQualification, businessSourceId: "", reportedTipSources: [] };
export const emptyOvertimeDeduction: OvertimeDeductionData = { owner: "", compensationSourceId: "", compensationExcludedFromWages: "", qualifiedPremium: "", requiredByFlsa: null, reportingSourceReference: "" };
export const emptyVehicleInterest: VehicleInterestData = { owner: "", lenderName: "", loanAccountReference: "", sourceTaxYear: "", sourceReference: "", borrowerQualificationConfirmed: null, vin: "", acquiredDate: "", loanOriginationDate: "", interestPaid: "", businessInterestDeducted: "", nonqualifyingInterest: "", firstLien: null, originalUse: null, finalAssemblyUnitedStates: null, personalUse: null, vehicleType: "", grossVehicleWeightRating: "", relatedParty: null, lease: null, fleet: null, salvageOrScrap: null, refinanced: null };
function money(value: string | undefined, label: string) { const error = amountError(value, label); if (error) throw new Error(error); return parseGuidedCurrency(value); }
function flag(value: boolean | null | undefined, label: string): boolean { if (typeof value !== "boolean") throw new Error(`Confirm actual ${label}; unknown is not false.`); return value; }
function text(value: string | undefined, label: string) { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return value.trim(); }
function sourceYear(value: string | undefined, year: number) { if (!/^\d{4}$/.test(value ?? "") || Number(value) !== year) throw new Error("Actual source year must match the return year."); return year; }
const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function schedule1ACompensationSources(state: GuidedFlowState) {
  const w2 = (state.sectionData["income-w2"]?.entries ?? []).filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld)).map((entry, index) => ({ sourceId: `formW2:${index}`, kind: "w2" as const, accountHolder: entry.accountHolder, name: entry.employerName, amount: entry.wages, entry }));
  const nec = (state.sectionData["income-self-employment"]?.necEntries ?? []).filter(isStartedNec).map((entry, index) => ({ sourceId: `form1099Nec:${index}`, kind: "nec" as const, accountHolder: entry.accountHolder, name: entry.payerName, amount: entry.nonemployeeCompensation, entry }));
  return [...w2, ...nec];
}
export function buildSchedule1AInput(data: Schedule1AData | undefined, state: GuidedFlowState): Schedule1AInput | undefined {
  if (!data) return undefined;
  const year = state.taxYear; if ((year !== 2025 && year !== 2026) || !state.segmentation.filingStatus) throw new Error("Choose the actual return year and filing status.");
  sourceYear(data.sourceTaxYear, year); text(data.sourceReference, "deduction source reference");
  if (data.sourceFactsConfirmed !== true || data.allSourcesIncluded !== true) throw new Error("Confirm all actual additional deduction sources after the last edit.");
  const household = state.sectionData["personal-info"];
  const primarySsnEligible = flag(household?.employmentValidSsnIssuedByDueDate, "primary SSN eligibility in About You");
  const requireOwner = (owner: string): Owner => { if (owner !== "primary" && owner !== "spouse") throw new Error("Choose the actual source owner."); if (owner === "spouse" && (state.segmentation.filingStatus !== "mfj" || !household?.spouse)) throw new Error("Spouse sources require the actual joint household."); return owner; };
  const sources = schedule1ACompensationSources(state); const usedReportedTips = new Map<string, Decimal>(); const usedOvertime = new Map<string, Decimal>();
  const findSource = (id: string, owner: Owner) => { const source = sources.find(row => row.sourceId === id); if (!source || source.accountHolder !== owner) throw new Error("Deduction compensation source is missing or belongs to another owner."); sourceYear(source.entry.sourceTaxYear, year); if (source.kind === "w2" && Object.values(source.entry.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation")) throw new Error("Confirm the original W2 source before claiming its deduction."); return source; };
  const qualify = (entry: TipQualificationData) => ({ owner: requireOwner(entry.owner), occupationCode: text(entry.occupationCode, "tipped occupation code"), eligibleOccupation: flag(entry.eligibleOccupation, "listed tipped occupation"), voluntaryCashTips: flag(entry.voluntaryCashTips, "voluntary cash or charge tips"), lawfulActivity: flag(entry.lawfulActivity, "lawful activity"), meetsSstbRuleOrTransition: flag(entry.meetsSstbRuleOrTransition, "applicable service-business rule or current-year transition") });
  const tipInputs = data.employeeTips.some(entry => entry.form4137EmployerSourceId.trim() || money(entry.qualifiedForm4137Tips, "qualified total Form4137 tips").gt(0)) ? buildTipIncomeInputs(state.sectionData["additional-deductions"]?.tipIncomeAccounts, state.segmentation.filingStatus, year, state.sectionData["income-w2"]?.entries) : undefined;
  const employeeTips = data.employeeTips.map(entry => {
    const qualification = qualify(entry); const w2Tips = money(entry.qualifiedW2Tips, "qualified employer-reported tips"); const formTips = money(entry.qualifiedForm4137Tips, "qualified total Form4137 tips");
    const linked = entry.w2SourceIds.map(id => { const source = findSource(id, qualification.owner); if (source.kind !== "w2" || normal(source.name) !== normal(entry.employer)) throw new Error("Actual employee tips must link to the same employer's W2 source."); return source; });
    if (new Set(entry.w2SourceIds).size !== entry.w2SourceIds.length) throw new Error("Duplicate employee W2 source.");
    if (w2Tips.gt(0) && !linked.length) throw new Error("Positive employer-reported tips require their actual W2 source.");
    if (w2Tips.gt(0) || entry.reportingMethod) { text(entry.reportingMethod, "tip reporting method"); text(entry.reportingSourceReference, "tip reporting reference"); }
    let reportLimit: Decimal;
    if (entry.reportingMethod === "form4137") {
      if (!w2Tips.isZero() || !entry.form4137EmployerSourceId.trim()) throw new Error("Direct Form4137 source requires actual zero employer-reported qualified tips and the actual employer ledger.");
      reportLimit = new Decimal(0);
    } else if (year === 2026) {
      if (entry.reportingMethod !== "w2") throw new Error("2026 tips require the actual W2 reporting source; the2025 transition method is not a substitute.");
      reportLimit = linked.reduce((total, source) => { if (!source.entry.treasuryTippedOccupationCodes?.length) throw new Error("Enter the actual2026 reported tipped occupation codes; an independent actual occupation claim may be a third occupation not listed in the two-code report."); return total.plus(money(source.entry.box12CodeTP, "actual2026 reported W2TP tips")); }, new Decimal(0));
    } else if (entry.reportingMethod === "w2") reportLimit = linked.reduce((total, source) => total.plus(money(source.entry.socialSecurityTips, "actual W2Box7 tips")), new Decimal(0));
    else reportLimit = money(entry.reportedEmployerTips, "actual employer-reported tip statement total");
    if (w2Tips.gt(reportLimit)) throw new Error("Qualified employer-reported tips exceed the actual reported source.");
    const ledger = entry.form4137EmployerSourceId.trim() ? tipInputs?.[qualification.owner]?.sourceFacts?.employers?.find(row => row.sourceId === entry.form4137EmployerSourceId) : undefined;
    if (formTips.gt(0) || entry.form4137EmployerSourceId.trim()) {
      if (!ledger || normal(ledger.employerName ?? "") !== normal(entry.employer)) throw new Error("Actual Form4137 employer source does not match the claimed tips.");
      if (w2Tips.gt(money(ledger.cashAndChargeTipsReceived, "actual column1(c) tips")) || (year === 2025 && ["form4070", "employer_statement"].includes(entry.reportingMethod) && !reportLimit.eq(money(ledger.tipsReportedToEmployer, "actual annual employer reports")))) throw new Error("Reconcile conflicting employer and Form4137 tip reports for this reporting year.");
      if (formTips.gt(money(ledger.cashAndChargeTipsReceived, "actual column1(c) tips"))) throw new Error("Qualified Form4137 tips exceed that employer's actual column1(c) source.");
    }
    return { ...qualification, employer: text(entry.employer, "employer name"), w2SourceIds: [...entry.w2SourceIds], form4137EmployerSourceId: entry.form4137EmployerSourceId.trim() || undefined, reportingMethod: entry.reportingMethod || undefined, reportingSourceReference: entry.reportingSourceReference.trim() || undefined, reportedEmployerTips: year === 2025 && ["form4070", "employer_statement"].includes(entry.reportingMethod) ? reportLimit.toFixed() : undefined, qualifiedW2Tips: w2Tips.toFixed(), qualifiedForm4137Tips: formTips.toFixed() };
  });
  const businessTips = data.businessTips.map(entry => {
    const qualification = qualify(entry); const business = state.sectionData["income-self-employment"]?.businessFacts;
    if (entry.businessSourceId !== "scheduleC" || !business || business.accountHolder !== qualification.owner) throw new Error("Select the actual supported business and source owner; another business requires its source worksheet.");
    const reportedTipSources = entry.reportedTipSources.map(row => {
      const source = findSource(row.sourceId, qualification.owner); if (source.kind !== "nec") throw new Error("This guided business tip must link to the actual business NEC source.");
      const amount = money(row.qualifiedTips, "actual qualified tips in this source"); let limit = money(source.amount, "actual reported business compensation");
      if (year === 2026) { if (!source.entry.treasuryTippedOccupationCodes?.length) throw new Error("Enter the actual2026 business reported occupation codes."); limit = money(source.entry.cashTips, "actual2026 reported NEC cash tips"); }
      const total = (usedReportedTips.get(row.sourceId) ?? new Decimal(0)).plus(amount); if (total.gt(limit)) throw new Error("Qualified business tips exceed the actual reported source."); usedReportedTips.set(row.sourceId, total);
      return { sourceId: row.sourceId, qualifiedTips: amount.toFixed() };
    });
    if (!reportedTipSources.length) throw new Error("Add the actual information-return source for business tips.");
    return { ...qualification, businessSourceId: entry.businessSourceId, businessName: text(business.businessName || business.activityDescription, "business name or activity"), reportedTipSources, qualifiedReportedTips: reportedTipSources.reduce((total, row) => total.plus(row.qualifiedTips), new Decimal(0)).toFixed() };
  });
  const overtime = data.overtime.map(entry => {
    const owner = requireOwner(entry.owner); const source = findSource(entry.compensationSourceId, owner); const premium = money(entry.qualifiedPremium, "actual FLSA overtime premium"); const excluded = source.kind === "w2" ? money(entry.compensationExcludedFromWages, "actual payroll compensation excluded from wages") : new Decimal(0); const reported = money(source.amount, "actual reported compensation").plus(excluded);
    let limit = reported; if (year === 2026) limit = money(source.kind === "w2" ? source.entry.box12CodeTT : source.entry.qualifiedOvertimeCompensation, "actual2026 reported overtime source");
    const total = (usedOvertime.get(source.sourceId) ?? new Decimal(0)).plus(premium); if (total.gt(limit) || total.gt(reported)) throw new Error("Qualified overtime exceeds the actual reported source."); usedOvertime.set(source.sourceId, total);
    return { owner, compensationSourceId: source.sourceId, qualifiedPremium: premium.toFixed(), reportedCompensation: reported.toFixed(), compensationExcludedFromWages: source.kind === "w2" ? excluded.toFixed() : undefined, requiredByFlsa: flag(entry.requiredByFlsa, "FLSA premium requirement"), reportingSourceReference: text(entry.reportingSourceReference, "overtime reporting reference") };
  });
  const vehicleLoans = data.vehicleLoans.map(loan => {
    const owner = requireOwner(loan.owner); sourceYear(loan.sourceTaxYear, year);
    if (loan.refinanced !== true && loan.refinancingSources !== undefined) throw new Error("Saved refinancing records conflict with the actual refinanced-loan answer.");
    const flags = Object.fromEntries((["borrowerQualificationConfirmed", "firstLien", "originalUse", "finalAssemblyUnitedStates", "personalUse", "relatedParty", "lease", "fleet", "salvageOrScrap", "refinanced"] as const).map(key => [key, flag(loan[key], key)]));
    return { ...loan, ...flags, refinancingSources: loan.refinanced === true ? buildVehicleRefinancingSources(loan.refinancingSources) : undefined, owner, sourceTaxYear: year, lenderName: text(loan.lenderName, "lender"), loanAccountReference: text(loan.loanAccountReference, "loan account reference"), sourceReference: text(loan.sourceReference, "loan source reference"), grossVehicleWeightRating: /^\d+$/.test(loan.grossVehicleWeightRating) ? Number(loan.grossVehicleWeightRating) : undefined, interestPaid: money(loan.interestPaid, "original loan interest").toFixed(), businessInterestDeducted: money(loan.businessInterestDeducted, "interest already deducted elsewhere").toFixed(), nonqualifyingInterest: money(loan.nonqualifyingInterest, "nonqualifying loan interest").toFixed() };
  });
  const seniorOwners = data.seniorOwners.map(requireOwner); if (seniorOwners.length) buildStandardDeductionFacts(household?.standardDeductionFacts, state.segmentation.filingStatus, year, household);
  const excludedPuertoRicoIncome = money(data.excludedPuertoRicoIncome, "actual excluded PuertoRico income"); const form4563Exclusion = money(data.form4563Exclusion, "actual Form4563 exclusion");
  for (const [actual, other] of [[excludedPuertoRicoIncome, household?.childTaxCredit?.puertoRicoExcludedIncome], [form4563Exclusion, household?.childTaxCredit?.form4563ExcludedIncome], [excludedPuertoRicoIncome, state.sectionData["income-social-security"]?.puertoRicoIncomeExclusion], [form4563Exclusion, state.sectionData["income-social-security"]?.americanSamoaIncomeExclusion]] as const) if (hasEnteredAmount(other) && !actual.eq(money(other, "other supplied exclusion source"))) throw new Error("Reconcile the conflicting actual income exclusions across household worksheets.");
  const needsSpouse = [...employeeTips, ...businessTips, ...overtime, ...vehicleLoans].some(entry => entry.owner === "spouse") || seniorOwners.includes("spouse");
  const result = Schedule1ASchema.parse({ sourceTaxYear: year, sourceReference: data.sourceReference, sourceFactsConfirmed: true, allSourcesIncluded: true, primarySsnEligible, spouseSsnEligible: needsSpouse ? flag(household?.spouse?.employmentValidSsnIssuedByDueDate, "spouse SSN eligibility in About You") : undefined, excludedPuertoRicoIncome: excludedPuertoRicoIncome.toFixed(), form4563Exclusion: form4563Exclusion.toFixed(), employeeTips, businessTips, overtime, vehicleLoans, seniorOwners });
  for (const loan of result.vehicleLoans) if (loan.refinanced) calculateVehicleRefinancing(loan, year);
  return result;
}
export function schedule1AFactErrors(state: GuidedFlowState): Record<string, string> {
  try { buildSchedule1AInput(state.sectionData["additional-deductions"]?.schedule1A, state); return {}; }
  catch (error) { return { additionalDeductionSources: error instanceof Error ? error.message : "Complete actual additional deduction sources." }; }
}
