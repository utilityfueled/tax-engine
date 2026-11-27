import Decimal from 'decimal.js';
import {ordinarySourcePrecision}from '@/engine/state/pa-ordinary-source-precision';
import {statePaymentFactErrors}from './guided-state-facts';
import type { CreditsData, FilingStatus, RetirementEntryData, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { isBeforeAge59AndHalfDate } from "@/utils/retirement-age";
import { amountError, currentLocalCivilDate, guidedAmountChanged, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { buildGuidedIraBasisSources, type GuidedIraBasisContext } from "./guided-ira-basis";
import {reconcileGuidedRetirementWithholding}from "./guided-retirement-withholding-reconciliation";
import {
  guidedSimplifiedMethodPlanReference, isGuidedQcdStatement, isGuidedQualifiedLumpSum, isStartedRetirement, needsGuidedSimplifiedMethod, normalizeGuidedRetirementCode,
  retirementQcdAmounts, retirementQcdConfirmations, retirementQcdTextFields, retirementSourceInput,
  simplifiedMethodPlanIdentifier, simplifiedMethodWholeNumber,
  type GuidedRetirementQcdSource, type GuidedRetirementSimplifiedMethod,
} from "./guided-retirement-source-inputs";
import { buildGuidedFirstHomeSource, guidedCode1IraOriginalSnapshot, guidedFirstHomeOriginalError, type GuidedFirstHomeWorksheet } from "./guided-retirement-first-home";
import { buildGuidedIraEducationSource, guidedIraEducationOriginalError, guidedIraEducationOwnerFingerprint, type GuidedIraEducationOriginal, type GuidedIraEducationWorksheet } from "./guided-retirement-education";
import { buildGuidedDisabilityPensionSource, guidedDisabilityPensionOriginal, type GuidedDisabilityPensionWorksheet } from "./guided-retirement-disability";
export { isStartedRetirement } from "./guided-retirement-source-inputs";

function guidedRetirementSourceIdentity(entry: RetirementEntryData) {
  return [
    entry.sourceTaxYear,
    entry.accountHolder,
    entry.payerTin?.replaceAll("-", "") ?? "",
    entry.accountReference?.trim().toLowerCase() ?? "",
  ] as const;
}

function pensionCoverageIdentity(entry: RetirementEntryData): string {
  return JSON.stringify([...guidedRetirementSourceIdentity(entry), guidedSimplifiedMethodPlanReference(entry)]);
}

export function clearGuidedPensionCoverage(entry: RetirementEntryData, sourceYearChanged = false): RetirementEntryData {
  const worksheet = entry.simplifiedMethod;
  if (!worksheet) return entry;
  if (worksheet.statementCoversContractConfirmed === null && entry.sourceFactsConfirmed === null
    && (!sourceYearChanged || (worksheet.monthsPaid === "" && worksheet.priorRecovered === ""))) return entry;
  return {
    ...entry,
    sourceFactsConfirmed: null,
    simplifiedMethod: {
      ...worksheet,
      statementCoversContractConfirmed: null,
      ...(sourceYearChanged ? { monthsPaid: "", priorRecovered: "" } : {}),
    },
  };
}

export function invalidateEditedGuidedPensionCoverage(previous: RetirementEntryData, next: RetirementEntryData): RetirementEntryData {
  if (!previous.simplifiedMethod || !next.simplifiedMethod || pensionCoverageIdentity(previous) === pensionCoverageIdentity(next)) return next;
  return clearGuidedPensionCoverage(next, previous.sourceTaxYear !== next.sourceTaxYear);
}

function pensionCoverageGroups(entries: RetirementEntryData[]): Map<string, RetirementEntryData[]> {
  const groups = new Map<string, RetirementEntryData[]>();
  for (const entry of entries) {
    if (!entry.simplifiedMethod) continue;
    const key = pensionCoverageIdentity(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

function samePensionWorksheetFacts(previous?: GuidedRetirementSimplifiedMethod, next?: GuidedRetirementSimplifiedMethod): boolean {
  return !!previous && !!next
    && previous.qualifiedPlanConfirmed === next.qualifiedPlanConfirmed
    && previous.singleLifeAnnuitantConfirmed === next.singleLifeAnnuitantConfirmed
    && previous.startingDate?.trim() === next.startingDate?.trim()
    && simplifiedMethodWholeNumber(previous.ageAtStart) === simplifiedMethodWholeNumber(next.ageAtStart)
    && simplifiedMethodWholeNumber(previous.monthsPaid) === simplifiedMethodWholeNumber(next.monthsPaid)
    && !guidedAmountChanged(previous.costInPlan, next.costInPlan)
    && !guidedAmountChanged(previous.priorRecovered, next.priorRecovered);
}

export function updateGuidedPensionCoverage(previous: RetirementEntryData[], next: RetirementEntryData[]): RetirementEntryData[] {
  const previousGroups = pensionCoverageGroups(previous);
  if (previousGroups.size === 0) return next;
  const nextGroups = pensionCoverageGroups(next);
  if (nextGroups.size === 0) return next;
  const displaced = previous.filter(entry => {
    if (!entry.simplifiedMethod) return false;
    const key = pensionCoverageIdentity(entry);
    return (nextGroups.get(key)?.length ?? 0) < (previousGroups.get(key)?.length ?? 0);
  });
  const displacedReview = displaced.some(entry => entry.simplifiedMethod?.statementCoversContractConfirmed != null);
  const updated = next.map(entry => {
    if (!entry.simplifiedMethod) return entry;
    const key = pensionCoverageIdentity(entry);
    const previousGroup = previousGroups.get(key);
    if (previousGroup) {
      // A removed original can be replaced under an existing key without changing that key's count.
      const countChanged = previousGroup.length !== nextGroups.get(key)?.length;
      const replacementPossible = displacedReview
        && !previousGroup.some(original => samePensionWorksheetFacts(original.simplifiedMethod, entry.simplifiedMethod));
      if (!countChanged && !replacementPossible) return entry;
    }
    const statementAccount = JSON.stringify(guidedRetirementSourceIdentity(entry).slice(1));
    const sourceYearChanged = displaced.some(previousEntry => previousEntry.sourceTaxYear !== entry.sourceTaxYear
      && (JSON.stringify(guidedRetirementSourceIdentity(previousEntry).slice(1)) === statementAccount
        || samePensionWorksheetFacts(previousEntry.simplifiedMethod, entry.simplifiedMethod)));
    return previousGroup || displacedReview || sourceYearChanged ? clearGuidedPensionCoverage(entry, sourceYearChanged) : entry;
  });
  return updated.some((entry, index) => entry !== next[index]) ? updated : next;
}

export interface RetirementSourceData {
  sourceTaxYear?: string;
  payerTin?: string;
  accountReference?: string;
  accountHolder?: "primary" | "spouse" | "";
  taxableAmountNotDetermined?: boolean | null;
  taxableAmountConfirmed?: boolean | null;
  employeeContributions?: string;
  capitalGainIncluded?: string;
  netUnrealizedAppreciation?: string;
  otherSourceAmount?: string;
  inPlanRothRolloverAmount?: string;
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  stateWithheld?: string;
  stateDistribution?: string;
  localTaxReporting?: "none" | "single" | "multiple" | "";
  locality?: string;
  localTaxWithheld?: string;
  localDistribution?: string;
  iraBasisConfirmedZero?: boolean | null;
  code1IraAgeSource?: { singlePaymentConfirmed?: boolean | null; ownerBirthDate?: string; distributionDate?: string };
  code1IraFirstHomeSource?: GuidedFirstHomeWorksheet;
  code1IraEducationSource?: GuidedIraEducationWorksheet;
  code3DisabilitySource?: GuidedDisabilityPensionWorksheet;
  qcdSource?: GuidedRetirementQcdSource;
  simplifiedMethod?: GuidedRetirementSimplifiedMethod;
  qualifiedLumpSumReporting?: "ordinary_pension" | "form_4972" | null;
  eligibleGovernmental457bPlan?: boolean | null;
  governmental457bTransferredTaxableAmount?: string;
  directRolloverConfirmed?: boolean | null;
  militaryPensionOrSurvivorBenefit?: boolean | null;
  qualifiedJointSurvivorAnnuity?: boolean | null;
  trumpAccount?: boolean | null;
  excessContributionEarnings?: string;
  additionalWorksheetRequired?: boolean | null;
  otherRetirementWorksheetRequired?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
}

export const retirementSourceAmounts = [
  ["employeeContributions", "Employee contributions / insurance premiums (Box 5)"],
  ["capitalGainIncluded", "Capital gain included in Box 2a (Box 3)"],
  ["netUnrealizedAppreciation", "Net unrealized appreciation (Box 6)"],
  ["otherSourceAmount", "Other source amount (Box 8 / 2026 Box 8a)"],
  ["inPlanRothRolloverAmount", "Amount allocable to in-plan Roth rollover within five years (Box 10)"],
] as const;

export function guidedDatedRetirementOwnerBirthDate(
  entries: RetirementEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null,
  primaryDateOfBirth?: string, hasIraBasisWorksheet = false,
): string | undefined {
  const originals = entries?.filter(isStartedRetirement);
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || filingStatus === "mfj" || hasIraBasisWorksheet
    || originals?.length !== 1 || originals[0]?.sourceTaxYear !== String(taxYear)
    || !isActualDate(primaryDateOfBirth)) return undefined;
  return primaryDateOfBirth;
}

export function hasStartedGuidedCode1IraAgeSource(entry: RetirementEntryData): boolean {
  return entry.code1IraAgeSource?.singlePaymentConfirmed === true || !!entry.code1IraAgeSource?.distributionDate;
}

export function guidedCode1IraAgeFacts(entry: RetirementEntryData, ownerBirthDate?: string) {
  if (hasStartedGuidedCode1IraAgeSource(entry) && entry.code1IraAgeSource?.ownerBirthDate !== ownerBirthDate) return undefined;
  const box5 = entry.employeeContributions;
  const sourceYear = entry.sourceTaxYear;
  if (!ownerBirthDate || (sourceYear !== "2025" && sourceYear !== "2026") || entry.accountHolder !== "primary"
    || entry.requiresCodeConfirmation || entry.requiresIraConfirmation || entry.qcdSource || entry.simplifiedMethod
    || normalizeGuidedRetirementCode(entry.distributionCode) !== "1" || entry.isIraSepSimple !== true
    || entry.iraBasisConfirmedZero !== true || entry.eligibleGovernmental457bPlan !== false
    || entry.taxableAmountNotDetermined !== false || entry.taxableAmountConfirmed !== true
    || amountError(entry.grossDistribution, "Box 1") || amountError(entry.taxableAmount, "Box 2a")
    || !box5 || amountError(box5, "Box 5")) return undefined;
  if (sourceYear === "2026" && (entry.trumpAccount !== false
    || amountError(entry.excessContributionEarnings, "Box 7d")
    || !parseGuidedCurrency(entry.excessContributionEarnings).isZero())) return undefined;

  const gross = parseGuidedCurrency(entry.grossDistribution);
  if (!gross.gt(0) || !gross.eq(parseGuidedCurrency(entry.taxableAmount))
    || !parseGuidedCurrency(box5).isZero()) return undefined;

  const proof = entry.code1IraAgeSource;
  const date = proof?.distributionDate;
  const distributionDate = proof?.singlePaymentConfirmed === true && date && isActualDate(date)
    && date.startsWith(`${sourceYear}-`) && date >= ownerBirthDate && date <= currentLocalCivilDate() ? date : undefined;
  return {
    distributionDate,
    ageException: distributionDate !== undefined && !isBeforeAge59AndHalfDate(
      new Date(`${ownerBirthDate}T00:00:00Z`), new Date(`${distributionDate}T00:00:00Z`),
    ),
  };
}

export function guidedCode1IraOriginal(entry: RetirementEntryData, ownerBirthDate?: string) {
  const age = guidedCode1IraAgeFacts(entry, ownerBirthDate);
  return guidedCode1IraOriginalSnapshot(entry, ownerBirthDate, age?.ageException ? undefined : age?.distributionDate);
}

export function guidedCode1IraEducationOriginal(entry: RetirementEntryData, ownerBirthDate?: string, ownerFingerprint?: string): GuidedIraEducationOriginal | undefined {
  if (entry.sourceTaxYear !== "2026" || !ownerFingerprint) return undefined;
  const original = guidedCode1IraOriginal(entry, ownerBirthDate);
  return original ? { ...original, ownerFingerprint } : undefined;
}

function simplifiedMethodFactError(entry: RetirementEntryData, dateOfBirth?: string): string | undefined {
  const year = Number(entry.sourceTaxYear);
  const worksheet = entry.simplifiedMethod;
  if (!worksheet) return `Enter the actual ${year} Simplified Method pension worksheet.`;
  if (hasEnteredAmount(entry.taxableAmount)) return "This Simplified Method route requires the original Box 2a to be blank. Review the printed form and the worksheet.";
  const grossError = amountError(entry.grossDistribution, "gross distribution");
  if (grossError) return grossError;
  if (parseGuidedCurrency(entry.grossDistribution).isZero()) return "Reconcile the reported payment months with the gross distribution in Box 1.";
  if (!worksheet.planReference?.trim()) return "Enter the local reference for the actual annuity contract.";
  if (worksheet.qualifiedPlanConfirmed !== true || entry.eligibleGovernmental457bPlan === true) return "Confirm that the pension is from a qualified employee plan, qualified employee annuity or 403(b) plan.";
  if (worksheet.singleLifeAnnuitantConfirmed !== true || entry.qualifiedJointSurvivorAnnuity === true) return "Confirm that the recipient is the only annuitant and receives periodic payments for their own life.";
  if (worksheet.statementCoversContractConfirmed !== true) return `Confirm that Box 1 on this original reports all ${year} periodic payments for this contract, with no other payments included.`;
  const start = worksheet.startingDate;
  if (!start || !isActualDate(start) || start < "1998-01-01" || start > `${year}-12-31`) return `Enter the actual annuity starting date from 1998 through ${year}.`;
  const startsThisYear = start.startsWith(`${year}-`);
  const age = simplifiedMethodWholeNumber(worksheet.ageAtStart);
  if (age === undefined || age >= 75) return "Enter the annuitant's actual age at the starting date. This worksheet covers starts before age 75.";
  if (dateOfBirth && isActualDate(dateOfBirth)) {
    const ageOnStart = Number(start.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - Number(start.slice(5) < dateOfBirth.slice(5));
    if (age !== ageOnStart) return "Reconcile the annuitant's age at the starting date with the recipient's date of birth.";
    if (year === 2025 && startsThisYear && entry.distributionCode.trim() === "1") {
      const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
      if (isBeforeAge59AndHalfDate(birthDate, new Date(Date.UTC(year, 0, 1)))
        && !isBeforeAge59AndHalfDate(birthDate, new Date(`${start}T00:00:00Z`))) {
        return "Review the actual payment dates and any modified payment series for the original Code 1.";
      }
    }
  }
  const months = simplifiedMethodWholeNumber(worksheet.monthsPaid);
  const availableMonths = startsThisYear ? 13 - Number(start.slice(5, 7)) : 12;
  if (months === undefined || months < 1 || months > availableMonths) return `Enter the actual months covered by ${year} annuity payments from the start of cost recovery onward.`;
  const costError = amountError(worksheet.costInPlan, "net cost in the plan at the annuity starting date");
  if (costError) return costError;
  const recoveryError = amountError(worksheet.priorRecovered, `amount recovered or eligible for tax-free recovery through ${year - 1}, including zero`);
  if (recoveryError) return recoveryError;
  const recovery = parseGuidedCurrency(worksheet.priorRecovered);
  if (recovery.gt(parseGuidedCurrency(worksheet.costInPlan)) || (startsThisYear && !recovery.isZero())) {
    return `Reconcile the amount recovered before ${year} with the plan cost and annuity starting date.`;
  }
}

export function retirementFactErrors(entries: RetirementEntryData[] | undefined, requireTaxableAmount = true, filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData, basisContext?: GuidedIraBasisContext, credits?: CreditsData): Record<string, string> {
  const errors: Record<string, string> = {};
  let basisBound = false;
  if (basisContext?.data) {
    try {
      basisBound = !!buildGuidedIraBasisSources(basisContext.data, entries, taxYear, filingStatus, basisContext.personal, basisContext.adjustments);
    } catch (error) { errors['retirement-basis-sources'] = error instanceof Error ? error.message : 'Complete and reconcile actual IRA basis sources.'; }
  }
  const reconciledOriginals=new Set<number>();
  if(stateData?.paResidencySources?.retirementSources!==undefined&&stateData.additionalStateWithholdingEntries?.length){
    try{
      const rows=stateData.additionalStateWithholdingEntries;
      if(Object.keys(statePaymentFactErrors(stateData,taxYear,'PA')).length)throw new Error('Reconcile the exact whole saved source ledger before retirement validation.');
      if(rows.some(row=>row.documentType!=='1099-R'&&row.documentType!=='1099-MISC'))throw new Error('Additional source types require their separate actual source reconciliation.');
      if(rows.some(row=>row.documentType==='1099-MISC')&&!stateData.zeroIncomeMiscSources?.length)throw new Error('Actual finite MISC originals are required before mixed-source validation.');
      const retirement=rows.filter(row=>row.documentType==='1099-R');
      const Money=Decimal.clone({precision:ordinarySourcePrecision(stateData,entries,rows.map(row=>parseGuidedCurrency(row.amount).toFixed())),rounding:Decimal.ROUND_HALF_UP});
      const retirementData={...stateData,additionalStateWithholdingEntries:retirement,additionalStateWithholding:retirement.reduce((sum,row)=>sum.plus(parseGuidedCurrency(row.amount)),new Money(0)).toFixed()};
      const started=(entries??[]).map((entry,index)=>({entry,index})).filter(({entry})=>isStartedRetirement(entry));
      const match=reconcileGuidedRetirementWithholding(started.map(({entry})=>retirementSourceInput(entry)),retirementData,taxYear??0);
      for(const index of match.matchedOriginalIndices)reconciledOriginals.add(started[index].index);
    }catch(error){errors['retirement-withholding-reconciliation']=error instanceof Error?error.message:'Reconcile actual retirement withholding sources.';}
  }
  const sourceIds = new Set<string>();
  const simplifiedMethodPlans = new Set<string>();
  const ownerBirthDate = guidedDatedRetirementOwnerBirthDate(
    entries, filingStatus, taxYear, basisContext?.personal?.dateOfBirth, !!basisContext?.data,
  );
  (entries ?? []).forEach((entry, index) => {
    const startedAgeSource = hasStartedGuidedCode1IraAgeSource(entry);
    const firstHome = entry.code1IraFirstHomeSource;
    const education = entry.code1IraEducationSource;
    if (!isStartedRetirement(entry) && !startedAgeSource && firstHome === undefined) return;
    const boundIra = basisBound && entry.isIraSepSimple === true;
    const fail = (key: string, message: string) => { errors[`retirement-${index}-${key}`] = message; };
    if (!entry.payer.trim()) fail("payer", "Enter the actual retirement payer.");
    const [sourceYear, accountHolder, payerTin, accountReference] = guidedRetirementSourceIdentity(entry);
    const validPayerTin = /^\d{9}$/.test(payerTin);
    if (!validPayerTin) fail("payer-tin", "Enter the actual nine-digit payer TIN from the source form.");
    if (!accountReference) fail("account", "Enter a local account reference that distinguishes this retirement statement.");
    const validYear = ["2025", "2026"].includes(entry.sourceTaxYear ?? "")
      && (taxYear == null || entry.sourceTaxYear === String(taxYear));
    if (!validYear) fail("year", "Confirm the actual retirement statement year matches this return.");
    const validRecipient = entry.accountHolder === "primary" || entry.accountHolder === "spouse";
    if (!validRecipient) fail("owner", "Confirm the actual retirement distribution recipient.");
    if (filingStatus && filingStatus !== "mfj" && entry.accountHolder === "spouse") fail("owner", "A spouse's retirement income requires a joint return or their separate return.");
    if (validPayerTin && accountReference && validYear && validRecipient) {
      const comparableAccount = sourceYear === "2026" ? accountReference.replace(/\s+/gu, " ") : accountReference;
      const sourceId = JSON.stringify([sourceYear, accountHolder, payerTin, comparableAccount]);
      if (sourceIds.has(sourceId)) {
        fail("duplicate", sourceYear === "2026"
          ? "Compare the original statements and reconcile potentially duplicate or corrected entries for this retirement account before calculating."
          : "Reconcile duplicate or corrected statements for this retirement account before calculating.");
      }
      sourceIds.add(sourceId);
    }
    const code = normalizeGuidedRetirementCode(entry.distributionCode);
    const qualifiedLumpSum = isGuidedQualifiedLumpSum(entry);
    const qcdStatement = isGuidedQcdStatement(entry);
    const needsSimplifiedMethod = needsGuidedSimplifiedMethod(entry);
    const earlyPension2026 = entry.sourceTaxYear === "2026" && code === "1"
      && entry.isIraSepSimple === false && entry.taxableAmountNotDetermined === true;
    if (needsSimplifiedMethod) {
      const personal = basisContext?.personal;
      const dateOfBirth = entry.accountHolder === "spouse" ? personal?.spouse?.dateOfBirth : personal?.dateOfBirth;
      const problem = simplifiedMethodFactError(entry, dateOfBirth);
      if (problem) fail("taxable-worksheet", problem);
      else {
        const plan = simplifiedMethodPlanIdentifier(entry);
        if (simplifiedMethodPlans.has(plan)) fail("taxable-worksheet", "Reconcile multiple originals against this same annuity contract and recipient before calculating.");
        simplifiedMethodPlans.add(plan);
      }
    } else if (entry.simplifiedMethod !== undefined && !earlyPension2026) {
      fail("taxable-worksheet", "Reconcile the saved Simplified Method worksheet with the original statement year, distribution code and Box 2b answer.");
    }
    const is2026Statement = taxYear === 2026 && entry.sourceTaxYear === "2026";
    const code3Statement = is2026Statement && code === "3";
    const code3WithCodeD = is2026Statement && (code === "3D" || code === "D3");
    if (!/^[1-9ABCDEFGHJKLMNPQRSTUWY]{1,2}$/.test(code)) fail("code", "Enter the actual Form 1099-R distribution code from Box 7 (2026 Box 7a).");
    else if (!code3Statement && !code3WithCodeD && !qualifiedLumpSum && !qcdStatement
      && !["1", "2", "4", "7", "G", "H", "1D", "2D", "4D", "7D", "D1", "D2", "D4", "D7"].includes(code)) {
      fail("code", "This distribution code needs its actual basis, Roth, disability, QCD or other special worksheet; the ordinary guided route cannot calculate it yet.");
    }
    if (code3Statement || entry.code3DisabilitySource !== undefined) {
      try {
        buildGuidedDisabilityPensionSource(entry.code3DisabilitySource, guidedDisabilityPensionOriginal(
          entry, ownerBirthDate, guidedIraEducationOwnerFingerprint(basisContext?.personal),
        ));
      } catch (error) {
        fail("code3-disability", error instanceof Error ? error.message : "Reconcile the saved disability pension worksheet.");
      }
    }
    const qcd = entry.qcdSource;
    if (qcd && !qcdStatement) fail("qcd-source", "Reconcile this QCD worksheet with the original retirement statement year and distribution code.");
    if (qcdStatement) {
      if (!qcd) fail("qcd-source", "Enter the actual QCD transfer and owner adjustment worksheet.");
      else {
        if (basisBound || entry.isIraSepSimple !== true || entry.iraBasisConfirmedZero !== true) fail("qcd-basis", "This QCD worksheet requires an actual ordinary traditional IRA with zero nondeductible owner basis.");
        for (const [field, label] of retirementQcdTextFields) if (!qcd[field]?.trim()) fail(`qcd-${field}`, `Enter the ${label.toLowerCase()}.`);
        if (!isActualDate(qcd.distributionDate) || !qcd.distributionDate?.startsWith(`${entry.sourceTaxYear}-`)) fail("qcd-date", "Enter the actual QCD transfer date in this return year.");
        for (const [field, label] of retirementQcdAmounts) {
          const problem = amountError(qcd[field], label.toLowerCase());
          if (problem) fail(`qcd-${field}`, problem);
        }
        if (!amountError(qcd.transferAmount, "transfer amount") && !amountError(entry.grossDistribution, "gross distribution")) {
          const transfer = parseGuidedCurrency(qcd.transferAmount);
          if (transfer.lte(0) || transfer.gt(parseGuidedCurrency(entry.grossDistribution))) fail("qcd-transferAmount", "Reconcile the positive QCD transfer amount with the gross distribution.");
        }
        for (const [field, label] of retirementQcdConfirmations) if (qcd[field] !== true) fail(`qcd-${field}`, `Confirm this QCD fact from actual records. ${label}`);
      }
      if (entry.taxableAmountNotDetermined !== true && !hasEnteredAmount(entry.taxableAmount)) fail("qcd-box2a", "Enter the printed Box 2a amount or confirm that Box 2b was checked.");
    }
    if (qualifiedLumpSum) {
      if (entry.isIraSepSimple !== false) fail("lump-sum-source", "The Code A reporting decision requires an actual non-IRA source.");
      if (entry.qualifiedLumpSumReporting === "form_4972") fail("lump-sum-reporting", "The separate Form 4972 calculation is required for this election.");
      else if (entry.qualifiedLumpSumReporting !== "ordinary_pension") fail("lump-sum-reporting", "Choose the actual reporting method for this qualified lump-sum distribution.");
    }
    if (code.includes("D") && (entry.isIraSepSimple !== false || entry.eligibleGovernmental457bPlan !== false)) fail("nonqualified-plan", "Code D identifies a nonqualified source; reconcile the actual IRA and governmental-plan classifications.");
    if (entry.requiresIraConfirmation) fail("isIraSepSimple", "Reconfirm the actual IRA checkbox; older versions prefilled an unchecked answer.");
    if (entry.requiresCodeConfirmation) fail("code", "Reconfirm the saved distribution code from the actual Form 1099-R; older versions prefilled code 7.");
    const needsConfirmedTaxableAmount = qualifiedLumpSum || (requireTaxableAmount && !boundIra && !qcdStatement && !needsSimplifiedMethod);
    for (const [field, label] of [["grossDistribution", "gross distribution"], ...(needsConfirmedTaxableAmount || hasEnteredAmount(entry.taxableAmount) ? [["taxableAmount", "taxable amount; unknown amounts need their actual worksheet"]] : []), ["federalWithheld", "federal tax withheld"], ...retirementSourceAmounts] as [keyof RetirementEntryData, string][]) {
      const message = amountError(entry[field] as string | undefined, label); if (message) fail(field, message);
    }
    if (hasEnteredAmount(entry.taxableAmount) && !amountError(entry.taxableAmount, "taxable amount") && !amountError(entry.grossDistribution, "gross distribution") && parseGuidedCurrency(entry.taxableAmount).gt(parseGuidedCurrency(entry.grossDistribution))) fail("taxableAmount", "Taxable amount cannot exceed gross distribution; review the source form.");
    for (const field of ["isIraSepSimple", "taxableAmountNotDetermined", "eligibleGovernmental457bPlan", "militaryPensionOrSurvivorBenefit", "qualifiedJointSurvivorAnnuity"] as const) if (typeof entry[field] !== "boolean") fail(field, "Confirm the actual retirement source checkbox or classification; blank is not no.");
    if (needsConfirmedTaxableAmount && entry.taxableAmountConfirmed !== true) fail("taxable-confirmation", "Confirm taxability from the actual source and applicable basis records; Box 2a or a default zero alone cannot establish it.");
    if (entry.isIraSepSimple === true && !boundIra && entry.iraBasisConfirmedZero !== true) fail("ira-basis", "An IRA with unknown or positive nondeductible basis requires the actual Form 8606 owner worksheet before calculation.");
    if (entry.eligibleGovernmental457bPlan === true) {
      if (entry.isIraSepSimple !== false) fail("457-plan", "A governmental 457(b) distribution cannot also be an IRA distribution.");
      const message = amountError(entry.governmental457bTransferredTaxableAmount, "457(b) taxable amount attributable to transferred qualified-plan funds");
      if (message) fail("457-transfer", message);
      else if (!amountError(entry.taxableAmount, "taxable amount") && parseGuidedCurrency(entry.governmental457bTransferredTaxableAmount).gt(parseGuidedCurrency(entry.taxableAmount))) fail("457-transfer", "The transferred-fund taxable amount cannot exceed this distribution's taxable amount.");
    }
    if (entry.eligibleGovernmental457bPlan === false && hasEnteredAmount(entry.governmental457bTransferredTaxableAmount) && (amountError(entry.governmental457bTransferredTaxableAmount, "457(b) transferred amount") || !parseGuidedCurrency(entry.governmental457bTransferredTaxableAmount).isZero())) fail("457-transfer", "Reconcile saved 457(b) transferred funds with the answer that this is not a governmental 457(b) plan.");
    if (entry.isIraSepSimple === true && entry.militaryPensionOrSurvivorBenefit === true) fail("military-plan", "An IRA distribution is not a U.S. military pension or survivor benefit. Reconcile the actual source classification.");
    if (earlyPension2026) fail("taxable-worksheet", "Keep the original Code 1 and review the payment dates, any modified payment series and applicable early-distribution treatment before calculating this pension.");
    else if (entry.isIraSepSimple === false && entry.taxableAmountNotDetermined === true && !needsSimplifiedMethod && entry.simplifiedMethod === undefined) fail("taxable-worksheet", "A pension with taxable amount not determined needs the actual Simplified Method or General Rule worksheet; this ordinary route cannot use a guessed Box 2a.");
    if (qualifiedLumpSum && entry.qualifiedLumpSumReporting === "ordinary_pension") {
      if (!amountError(entry.capitalGainIncluded, "Box 3") && !amountError(entry.taxableAmount, "Box 2a")
        && parseGuidedCurrency(entry.capitalGainIncluded).gt(parseGuidedCurrency(entry.taxableAmount))) {
        fail("capitalGainIncluded", "Box 3 cannot exceed the taxable amount in Box 2a.");
      }
    } else if (!amountError(entry.capitalGainIncluded, "Box 3") && parseGuidedCurrency(entry.capitalGainIncluded).gt(0)) {
      fail("capitalGainIncluded", "Preserve this actual source amount; it needs its additional retirement worksheet before calculation.");
    }
    for (const field of ["netUnrealizedAppreciation", "otherSourceAmount", "inPlanRothRolloverAmount"] as const) if (!amountError(entry[field], field) && parseGuidedCurrency(entry[field]).gt(0)) fail(field, "Preserve this actual source amount; it needs its additional retirement worksheet before calculation.");
    if (entry.isIraSepSimple === true && !amountError(entry.employeeContributions, "employee contributions") && parseGuidedCurrency(entry.employeeContributions).gt(0)) fail("ira-employee-contributions", "Positive IRA contribution/basis amounts need their actual Form 8606 history.");
    if (["G", "H"].includes(code)) {
      if (entry.directRolloverConfirmed !== true) fail("rollover", "Confirm the actual direct rollover destination and completion from source records.");
      if (!amountError(entry.taxableAmount, "taxable amount") && !parseGuidedCurrency(entry.taxableAmount).isZero()) fail("rollover-taxable", "Taxable rollover or conversion amounts need the actual conversion and basis worksheet.");
    }
    if (entry.sourceTaxYear === "2026") {
      if (entry.trumpAccount !== false) fail("trump-account", "Confirm the actual Box 7c checkbox. Trump-account distributions require their separate source worksheet and are not supported by this ordinary route.");
      const message = amountError(entry.excessContributionEarnings, "Box 7d earnings on excess contributions");
      if (message) fail("excess-earnings", message);
      else if (parseGuidedCurrency(entry.excessContributionEarnings).gt(0)) fail("excess-earnings", "Earnings on excess contributions need their actual return-of-contributions worksheet.");
    }
    for (const location of ["state", "local"] as const) {
      const reporting = location === "state" ? entry.stateTaxReporting : entry.localTaxReporting;
      const identity = location === "state" ? entry.state?.trim().toUpperCase() : entry.locality?.trim();
      const withheld = location === "state" ? entry.stateWithheld : entry.localTaxWithheld;
      const distribution = location === "state" ? entry.stateDistribution : entry.localDistribution;
      if (reporting === "single") {
        if (!identity || (location === "state" && !/^[A-Z]{2}$/.test(identity))) fail(`${location}-identity`, `Enter the actual ${location} identity from the retirement form.`);
        for (const [value, label] of [[withheld, `${location} tax withheld`], [distribution, `${location} distribution`]] as const) { const message = amountError(value, label); if (message) fail(`${location}-${label}`, message); }
      } else if (reporting === "none") {
        if (identity || [withheld, distribution].some(value => hasEnteredAmount(value) && (amountError(value, "source amount") || !parseGuidedCurrency(value).isZero()))) fail(`${location}-reporting`, `Reconcile saved ${location} amounts with the answer that no ${location} section was reported.`);
      } else fail(`${location}-reporting`, reporting === "multiple" ? `Multiple ${location} retirement records need their separate source allocations.` : `Confirm actual ${location} reporting on the source form.`);
    }
    if (!reconciledOriginals.has(index) && entry.stateTaxReporting === "single" && stateData?.additionalStateWithholdingEntries?.some(other => other.documentType === "1099-R" && other.payer.trim().toLowerCase() === entry.payer.trim().toLowerCase() && other.state === entry.state && other.taxYear === entry.sourceTaxYear)) fail("duplicate-withholding", "This retirement source withholding was also entered as additional state withholding. Reconcile it before counting the payment twice.");
    const ageFacts = guidedCode1IraAgeFacts(entry, ownerBirthDate);
    if (startedAgeSource && !ageFacts) {
      fail("code1-ira-age-date", "Reconcile the saved Code 1 IRA receipt date with the current statement and return before calculating.");
    } else if (startedAgeSource && !ageFacts?.distributionDate) {
      fail("code1-ira-age-date", `Confirm the single Box 1 payment and enter its actual receipt date in the ${entry.sourceTaxYear} statement year, on or before today.`);
    }
    if (firstHome !== undefined) {
      try {
        buildGuidedFirstHomeSource(firstHome, guidedCode1IraOriginal(entry, ownerBirthDate));
      } catch (error) {
        fail("code1-ira-first-home", error instanceof Error ? error.message : guidedFirstHomeOriginalError);
      }
    }
    if (education !== undefined) {
      if (firstHome !== undefined) fail("code1-ira-education", "Reconcile the competing college tuition and first-home IRA worksheets for this payment.");
      else {
        try {
          buildGuidedIraEducationSource(education, guidedCode1IraEducationOriginal(
            entry, ownerBirthDate, guidedIraEducationOwnerFingerprint(basisContext?.personal),
          ), credits);
        } catch (error) {
          fail("code1-ira-education", error instanceof Error ? error.message : guidedIraEducationOriginalError);
        }
      }
    }
    if (boundIra ? entry.otherRetirementWorksheetRequired !== false : entry.additionalWorksheetRequired !== false) {
      const question = boundIra ? "Confirm whether another retirement method beyond the ordinary IRA basis records is needed."
        : qcdStatement ? "Confirm whether another retirement method beyond this QCD worksheet is needed."
        : needsSimplifiedMethod ? "Confirm whether a penalty exception or another retirement worksheet is needed for this pension."
        : firstHome !== undefined ? "Confirm whether another retirement worksheet is needed beyond this first-home IRA worksheet."
        : education !== undefined ? "Confirm whether another retirement worksheet is needed beyond this college tuition IRA worksheet."
        : entry.code3DisabilitySource !== undefined ? "Confirm whether another retirement worksheet is needed beyond this disability pension worksheet."
        : ageFacts?.ageException ? "Confirm whether another retirement worksheet is needed beyond the documented Code 1 age exception."
        : "Confirm whether basis, Roth/conversion, QCD, contribution returns, disaster relief, penalty exceptions or other retirement worksheets are needed. Those unresolved facts must be completed before the ordinary route can calculate.";
      fail("additional-worksheet", question);
    }
    if (entry.sourceFactsConfirmed !== true) fail("confirmation", "Confirm the complete retirement source facts after the last edit.");
  });
  return errors;
}
