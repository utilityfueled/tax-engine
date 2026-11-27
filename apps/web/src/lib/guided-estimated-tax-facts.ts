import Decimal from "decimal.js";
import { assertActualFederalBalanceDueDates, assertPriorReturnCreditSource } from "@/engine/forms/federal-payment-date-sources";
import { buildEstimatedInvestmentElection, type EstimatedInvestmentElectionData } from "./guided-estimated-investment-election";
import { Form2210Schema, type TaxYearInput } from "@/models/inputs";
import type { EstimatedPaymentEntry, FilingStatus, PaymentData } from "./guided-interview-flow";
import { amountError, isActualDate, normalizeFederalPaymentReceiptReference } from "./guided-required-facts";
import { parseGuidedCurrency, parseGuidedDisplayAmount } from "./guided-currency";

export interface EstimatedTaxReturnPaymentEntry extends EstimatedPaymentEntry {
  processedReceipt?: { reference: string; confirmedFor: { date: string; amount: string; reference: string } | false | null };
}

export interface EstimatedTaxFactsData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPaymentRecordsIncluded: boolean | null;
  calendarYearTaxpayer: boolean | null; residentReturn: boolean | null; farmerOrFisher: boolean | null; disasterReliefClaimed: boolean | null; waiverRequested: boolean | null;
  calculationMethod: "" | "regular" | "annualized"; withholdingMethod: "" | "equal-installments" | "actual-dates";
  annualizedIncomePeriods?: AnnualizedPeriodData[]; bothSpousesSelfEmployed?: boolean | null; selfEmploymentOwnerPeriods?: AnnualizedOwnerData[];
  ordinaryPreferentialPeriodsConfirmed?: boolean | null;
  specialRatePeriodsConfirmed?: boolean | null;
  investmentElectionSources?: EstimatedInvestmentElectionData;
  farmingIncomeTwoThirdsConfirmed?: boolean | null; waiverKind?: "" | "full" | "partial"; waiverAmount?: string;
  waiverReason?: "" | "retirement_or_disability" | "casualty_disaster_or_unusual_circumstance"; waiverStatementReference?: string;
  priorYearTaxStatus: "" | "return-filed" | "no-return" | "no-tax-liability";
  priorYearFullYear: boolean | null; priorYearResidentAllYear: boolean | null; priorYearJointReturn: boolean | null;
  priorYearTaxForForm2210: string; priorYearAgiForForm2210: string; priorYearTaxComputationConfirmed: boolean | null;
  withholdingPayments: EstimatedPaymentEntry[]; priorYearCreditPayments: (EstimatedPaymentEntry & { appliedCreditIndex: string })[]; returnPayments: EstimatedTaxReturnPaymentEntry[];
  earlyReturnExceptionClaimed: boolean | null; returnFiledDate: string; returnPaidInFullDate: string;
}
export const emptyEstimatedTaxFacts: EstimatedTaxFactsData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allPaymentRecordsIncluded: null,
  calendarYearTaxpayer: null, residentReturn: null, farmerOrFisher: null, disasterReliefClaimed: null, waiverRequested: null,
  calculationMethod: "", withholdingMethod: "", priorYearTaxStatus: "", priorYearFullYear: null, priorYearResidentAllYear: null, priorYearJointReturn: null,
  priorYearTaxForForm2210: "", priorYearAgiForForm2210: "", priorYearTaxComputationConfirmed: null,
  withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: null, returnFiledDate: "", returnPaidInFullDate: "",
};
function known(value: boolean | null | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Confirm the actual ${label}; an unanswered fact is unknown.`); return value;
}
function money(value: string | undefined, label: string, required = true, signed = false): string | undefined {
  if (!value?.trim() && !required) return undefined;
  if (signed) { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return parseGuidedCurrency(value).toFixed(); }
  const error = amountError(value, label); if (error) throw new Error(error); return parseGuidedCurrency(value).toFixed();
}

export function confirmedReturnPaymentReference(payment: EstimatedTaxReturnPaymentEntry): string {
  const receipt = payment.processedReceipt;
  const reference = normalizeFederalPaymentReceiptReference(receipt?.reference);
  const checked = receipt?.confirmedFor;
  if (!reference || !checked || checked.date !== payment.date || reference !== normalizeFederalPaymentReceiptReference(checked.reference)
    || amountError(checked.amount, "checked payment amount") || amountError(payment.amount, "payment amount")) return "";
  return parseGuidedCurrency(checked.amount).eq(parseGuidedCurrency(payment.amount)) ? reference : "";
}

function reconcileReturnPaymentReceipts(data: PaymentData, originals: EstimatedTaxReturnPaymentEntry[], returns: { date: string; amount: string }[]) {
  if (!returns.some(payment => payment.amount !== "0")) return returns;
  const references = new Set<string>();
  const matchingPaymentsVerified = new Map<string, boolean>();
  const matchingReturnPaymentKeys = new Set<string>();
  for (const payment of [...data.estimatedPayments ?? [], ...data.extensionPayments ?? []]) {
    if (!isActualDate(payment.date) || amountError(payment.amount, "payment amount")) continue;
    const amount = parseGuidedCurrency(payment.amount);
    if (amount.isZero()) continue;
    const reference = normalizeFederalPaymentReceiptReference(payment.receiptReference);
    const key = `${payment.date}:${amount.toFixed()}`;
    matchingPaymentsVerified.set(key, !!reference && (matchingPaymentsVerified.get(key) ?? true));
    if (reference) references.add(reference);
  }
  for (const [index, payment] of returns.entries()) {
    if (payment.amount === "0") continue;
    const original = originals[index];
    const reference = normalizeFederalPaymentReceiptReference(original.processedReceipt?.reference);
    if (reference && references.has(reference)) throw new Error("A return payment receipt reference is already used for another federal payment. Reconcile the original IRS records before calculating.");
    const key = `${payment.date}:${payment.amount}`;
    const verified = !!confirmedReturnPaymentReference(original);
    const earlierPaymentsVerified = matchingPaymentsVerified.get(key);
    if (earlierPaymentsVerified !== undefined && (!verified || !earlierPaymentsVerified)) {
      throw new Error("A return payment matches a federal estimated or extension payment or another return payment. Reconcile the original IRS records and confirm distinct processed payment references before calculating.");
    }
    if ((reference || original.processedReceipt?.confirmedFor) && !verified) {
      throw new Error("Confirm the processed IRS payment reference for the current return payment date and amount before calculating.");
    }
    if (earlierPaymentsVerified !== undefined) matchingReturnPaymentKeys.add(key);
    matchingPaymentsVerified.set(key, verified);
    if (reference) references.add(reference);
  }
  return returns.map((payment, index) => matchingReturnPaymentKeys.has(`${payment.date}:${payment.amount}`)
    ? { ...payment, receiptReference: `guided-balance-due-receipt-${index + 1}` }
    : payment);
}
export const ANNUALIZED_PERIOD_FIELDS = [
  ["adjustedGrossIncome", "Adjusted gross income", true], ["itemizedDeductions", "Itemized deductions, or 0 if you do not itemize", false],
  ["qbiDeduction", "Schedule AI line 9 QBI deduction", false], ["qualifiedDividends", "Qualified dividends", false], ["netCapitalGain", "Net capital gain", false],
  ["netProfitFromSelfEmployment", "Net profit from self-employment", true], ["socialSecurityWages", "Self-employed person's wages subject to social security tax", false],
  ["otherTaxes", "Schedule AI line 16 other taxes", false], ["credits", "Schedule AI line 18 credits", false],
  ["schedule1AAdjustment", "Schedule 1-A deduction through this period, not annualized, or 0 if none", false],
] as const;
export const SPECIAL_RATE_PERIOD_FIELDS = [["rate28GainLoss", "Signed 28% worksheet sum of lines 1 through 6, including capital losses", true], ["unrecaptured1250BeforeLosses", "Unrecaptured section 1250 worksheet line 13 before capital losses", false]] as const;
export type AnnualizedPeriodData = Record<(typeof ANNUALIZED_PERIOD_FIELDS)[number][0], string> & Partial<Record<(typeof SPECIAL_RATE_PERIOD_FIELDS)[number][0], string>>;
export interface AnnualizedOwnerData {
  accountHolder: ''|'primary'|'spouse'; sourceTaxYear:string; sourceReference:string; sourceFactsConfirmed:boolean|null;
  periods:{netProfitFromSelfEmployment:string;socialSecurityWages:string}[];
}
export const emptyAnnualizedOwner=():AnnualizedOwnerData=>({accountHolder:'',sourceTaxYear:'',sourceReference:'',sourceFactsConfirmed:null,periods:Array.from({length:4},()=>({netProfitFromSelfEmployment:'',socialSecurityWages:''}))});
function buildOwnerPeriods(facts:EstimatedTaxFactsData,taxYear:number){
  if(facts.calculationMethod!=="annualized")return undefined;
  const rows=facts.selfEmploymentOwnerPeriods;if(rows===undefined)return undefined;
  if(facts.calculationMethod!=='annualized'||facts.bothSpousesSelfEmployed!==true||rows.length!==2||new Set(rows.map(row=>row.accountHolder)).size!==2||rows.some(row=>row.accountHolder!== 'primary'&&row.accountHolder!=='spouse'))throw new Error('Schedule AI requires two actual separate owner PartII sources and both-spouse self-employment confirmation.');
  const built=rows.map(row=>{
    if(row.sourceTaxYear!==String(taxYear)||!row.sourceReference.trim()||row.sourceFactsConfirmed!==true||row.periods.length!==4)throw new Error('Confirm every actual owner source year, reference and four periods after the last edit.');
    return {accountHolder:row.accountHolder as 'primary'|'spouse',sourceTaxYear:taxYear,sourceReference:row.sourceReference,sourceFactsConfirmed:true,periods:row.periods.map((period,index)=>({netProfitFromSelfEmployment:money(period.netProfitFromSelfEmployment,`${row.accountHolder} period ${index+1} net profit`,true,true) as string,socialSecurityWages:money(period.socialSecurityWages,`${row.accountHolder} period ${index+1} SocialSecurity payroll`) as string}))};
  });
  for(let i=0;i<4;i++){
    const actual=built.map(row=>{const period=row.periods[i];if(!period)throw new Error('Missing actual owner period');return period;});
    const profit=Decimal.sum(...actual.map(row=>row.netProfitFromSelfEmployment)),wages=Decimal.sum(...actual.map(row=>row.socialSecurityWages)),period=facts.annualizedIncomePeriods?.[i];
    if(!period||!profit.eq(money(period.netProfitFromSelfEmployment,`combined period ${i+1} net profit`,true,true) as string)||!wages.eq(money(period.socialSecurityWages,`combined period ${i+1} payroll`) as string))throw new Error('Combined Schedule AI period profit/payroll contradict actual owner source sums.');
  }
  return built;
}
export const emptyAnnualizedPeriods = (): AnnualizedPeriodData[] => Array.from({ length: 4 }, () =>
  Object.fromEntries(ANNUALIZED_PERIOD_FIELDS.map(([key]) => [key, ""])) as AnnualizedPeriodData);
export function hasOrdinaryPreferentialPeriodAmounts(periods: readonly AnnualizedPeriodData[]): boolean {
  return periods.some(period => [period.qualifiedDividends, period.netCapitalGain]
    .some(value => parseGuidedDisplayAmount(value).gt(0)));
}
function buildAnnualizedPeriods(facts: EstimatedTaxFactsData): AnnualizedPeriodData[] {
  if (facts.annualizedIncomePeriods?.length !== 4) throw new Error("Annualized income needs all four actual cumulative periods.");
  const special = facts.specialRatePeriodsConfirmed === true || facts.annualizedIncomePeriods.some(period => SPECIAL_RATE_PERIOD_FIELDS.some(([key]) => !!period[key]?.trim()));
  if (special && facts.specialRatePeriodsConfirmed !== true) throw new Error("Confirm the actual special-rate period worksheet sources.");
  const periods = facts.annualizedIncomePeriods.map((period, index) => Object.fromEntries(ANNUALIZED_PERIOD_FIELDS.map(([key, label, signed]) =>
    [key, money(period[key], `period ${index + 1} ${label.toLowerCase()}`, true, signed)]).concat(special ? SPECIAL_RATE_PERIOD_FIELDS.map(([key, label, signed]) => [key, money(period[key], `period ${index + 1} ${label.toLowerCase()}`, true, signed)]) : [])) as AnnualizedPeriodData);
  if (hasOrdinaryPreferentialPeriodAmounts(periods) && !special && facts.ordinaryPreferentialPeriodsConfirmed !== true) {
    throw new Error("Confirm the ordinary preferential period sources for qualified dividends or net capital gain.");
  }
  return periods;
}
export function buildEstimatedTaxFacts(
  data: PaymentData | undefined,
  taxYear?: number | null,
  filingStatus?: FilingStatus | null,
): TaxYearInput["form2210"] {
  const facts = data?.estimatedTaxFacts; if (!facts) return undefined;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Select the actual supported return year before the estimated-tax worksheet.");
  const year = taxYear;
  if (facts.sourceTaxYear !== String(taxYear)) throw new Error("Estimated-tax source year must match the actual return year.");
  if (!facts.sourceReference.trim() || facts.sourceFactsConfirmed !== true || facts.allPaymentRecordsIncluded !== true) throw new Error("Confirm the actual prior-return and complete payment history after the last edit, including its source reference.");
  for (const [key, expected, label] of [
    ["calendarYearTaxpayer", true, "calendar-year taxpayer"], ["residentReturn", true, "resident return"], ["disasterReliefClaimed", false, "disaster relief"],
  ] as const) if (known(facts[key], label) !== expected) throw new Error(`The ${label} scenario needs its separate estimated-tax method; retain these actual facts for review.`);
  const farmer = known(facts.farmerOrFisher, "farmer or fisher rule"), waiver = known(facts.waiverRequested, "penalty waiver request");
  if (farmer && facts.farmingIncomeTwoThirdsConfirmed !== true) throw new Error("Confirm that at least two-thirds of gross income for either year came from farming or fishing.");
  if (farmer && facts.calculationMethod === "annualized") throw new Error("Form 2210-F has no annualized method. Choose regular installments.");
  if (waiver && (!facts.waiverKind || !facts.waiverReason || !facts.waiverStatementReference?.trim() || (facts.waiverKind === "partial" && !facts.waiverAmount?.trim()))) throw new Error("Enter the waiver kind, reason, amount if partial, and the statement you will attach.");
  if (facts.calculationMethod !== "regular" && facts.calculationMethod !== "annualized") throw new Error("Choose the actual estimated-tax method.");
  const annualizedIncomePeriods = facts.calculationMethod === "annualized" ? buildAnnualizedPeriods(facts) : undefined;
  if (facts.withholdingMethod !== "equal-installments" && facts.withholdingMethod !== "actual-dates") throw new Error("Choose the actual withholding timing method.");
  if (!["return-filed", "no-return", "no-tax-liability"].includes(facts.priorYearTaxStatus)) throw new Error("Confirm actual prior-year return/tax status.");
  if (facts.priorYearTaxStatus !== "no-return") {
    known(facts.priorYearFullYear, "prior return covering a full12 months");
    known(facts.priorYearJointReturn, "prior-year joint-return status");
    if (facts.priorYearFullYear) {
      if (facts.priorYearTaxComputationConfirmed !== true) throw new Error("Confirm actual prior-year tax under the Form2210 line8 instructions before any110% multiplier, including any filing-status allocation.");
      const prior = money(facts.priorYearTaxForForm2210, "prior-year Form2210 tax");
      if (facts.priorYearTaxStatus === "return-filed") money(facts.priorYearAgiForForm2210, "prior-year AGI", true, true);
      else {
        if (prior !== "0") throw new Error("The actual no-tax-liability status conflicts with the prior-year tax amount.");
        known(facts.priorYearResidentAllYear, "prior-year full-year U.S. citizenship or residence");
      }
    }
  } else if (facts.priorYearJointReturn === true) throw new Error("No prior return conflicts with a prior joint return.");
  // Validate even retained values that the chosen prior-return branch will not use.
  const priorTax = money(facts.priorYearTaxForForm2210, "prior-year Form2210 tax", false);
  const priorAgi = money(facts.priorYearAgiForForm2210, "prior-year AGI", false, true);
  function dated(entries: EstimatedPaymentEntry[], label: string, withinYear: boolean, afterYear = false) {
    if (!Array.isArray(entries)) throw new Error(`Enter the actual ${label} history, including an empty list if there were none.`);
    return entries.map((entry, index) => {
      if (!isActualDate(entry.date) || entry.date < `${year}-01-01` || entry.date > `${year + (withinYear ? 0 : 1)}-12-31`
        || (afterYear && entry.date <= `${year}-12-31`)) throw new Error(`Enter the actual ${label} ${index + 1} date within its source payment period.`);
      return { date: entry.date, amount: money(entry.amount, `${label} ${index + 1} amount`) as string };
    });
  }
  const withholdingPayments = dated(facts.withholdingPayments, "withholding", true);
  const priorYearCreditPayments = dated(facts.priorYearCreditPayments, "applied-credit", false);
  const datedReturnPayments = dated(facts.returnPayments, "return payment", false, true);
  const returnPayments = year === 2026 ? reconcileReturnPaymentReceipts(data, facts.returnPayments, datedReturnPayments) : datedReturnPayments;
  const credits = data.priorYearAppliedCredits ?? [], allocated = credits.map(() => new Decimal(0));
  facts.priorYearCreditPayments.forEach((entry, index) => {
    if (!/^(0|[1-9]\d*)$/.test(entry.appliedCreditIndex)) throw new Error("Link each actual effective-date payment to its original applied-refund source.");
    const sourceIndex = Number(entry.appliedCreditIndex), original = credits[sourceIndex];
    if (!Number.isSafeInteger(sourceIndex) || !original || original.sourceTaxYear !== String(taxYear - 1)) throw new Error("The effective-date entry has no matching actual prior-year credit source.");
    allocated[sourceIndex] = allocated[sourceIndex].plus(priorYearCreditPayments[index].amount);
  });
  credits.forEach((credit, index) => {
    if (credit.sourceTaxYear !== String(taxYear - 1)) throw new Error("Applied refund source year must be the actual immediately preceding tax year.");
    const original = new Decimal(money(credit.amount, "original applied refund") as string);
    assertPriorReturnCreditSource(original, facts.priorYearTaxStatus || undefined, filingStatus != null && filingStatus !== "mfj");
    if (!allocated[index].eq(original) || (original.gt(0) && !facts.priorYearCreditPayments.some(row => row.appliedCreditIndex === String(index)))) throw new Error("Actual effective-date payments must reconcile every original applied-refund source, including zero.");
  });
  const early = known(facts.earlyReturnExceptionClaimed, "early filing and full-payment exception");
  const hasDates = !!facts.returnFiledDate || !!facts.returnPaidInFullDate;
  if (early || hasDates) {
    if (!isActualDate(facts.returnFiledDate) || !isActualDate(facts.returnPaidInFullDate)
      || [facts.returnFiledDate, facts.returnPaidInFullDate].some(date => date <= `${taxYear}-12-31` || date > `${taxYear + 1}-12-31`)) throw new Error("Enter both actual filing and full-payment dates after the tax year.");
    const deadline = facts.farmerOrFisher === true ? (taxYear === 2025 ? "2026-03-02" : "2027-03-01") : (taxYear === 2025 ? "2026-02-02" : "2027-02-01");
    if (early !== (facts.returnFiledDate <= deadline && facts.returnPaidInFullDate <= deadline)) throw new Error("Actual filing/payment dates conflict with the early-return exception answer.");
  }
  const filingDates = {
    returnFiledDate: facts.returnFiledDate || undefined,
    returnPaidInFullDate: facts.returnPaidInFullDate || undefined,
  };
  assertActualFederalBalanceDueDates(year, { returnPayments, ...filingDates });
  return Form2210Schema.parse({
    calendarYearTaxpayer: facts.calendarYearTaxpayer, residentReturn: facts.residentReturn, farmerOrFisher: facts.farmerOrFisher,
    disasterReliefClaimed: facts.disasterReliefClaimed, waiverRequested: facts.waiverRequested, calculationMethod: facts.calculationMethod, withholdingMethod: facts.withholdingMethod,
    investmentElectionSources: buildEstimatedInvestmentElection(facts.investmentElectionSources, year, facts.calculationMethod, annualizedIncomePeriods, facts.specialRatePeriodsConfirmed),
    annualizedIncomePeriods, selfEmploymentOwnerPeriods:buildOwnerPeriods(facts,year), bothSpousesSelfEmployed: facts.bothSpousesSelfEmployed ?? undefined,
    ordinaryPreferentialPeriodsConfirmed: annualizedIncomePeriods ? facts.ordinaryPreferentialPeriodsConfirmed ?? undefined : undefined,
    specialRatePeriodsConfirmed: annualizedIncomePeriods ? facts.specialRatePeriodsConfirmed ?? undefined : undefined,
    farmingIncomeTwoThirdsConfirmed: facts.farmingIncomeTwoThirdsConfirmed ?? undefined, waiverKind: facts.waiverKind || undefined,
    waiverAmount: facts.waiverAmount?.trim() ? parseGuidedCurrency(facts.waiverAmount).toFixed() : undefined, waiverReason: facts.waiverReason || undefined,
    waiverStatementReference: facts.waiverStatementReference?.trim() || undefined,
    priorYearTaxStatus: facts.priorYearTaxStatus, priorYearFullYear: facts.priorYearFullYear ?? undefined, priorYearResidentAllYear: facts.priorYearResidentAllYear ?? undefined,
    priorYearJointReturn: facts.priorYearJointReturn ?? undefined, priorYearTaxComputationConfirmed: facts.priorYearTaxComputationConfirmed ?? undefined,
    priorYearTaxForForm2210: priorTax, priorYearAgiForForm2210: priorAgi, withholdingPayments, priorYearCreditPayments, returnPayments,
    ...filingDates,
  });
}
export function estimatedTaxFactErrors(data: PaymentData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Record<string, string> {
  try { buildEstimatedTaxFacts(data, taxYear, filingStatus); return {}; } catch (error) { return { estimatedTaxFacts: error instanceof Error ? error.message : "Reconcile the actual estimated-tax source worksheet." }; }
}
