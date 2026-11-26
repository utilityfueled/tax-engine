import Decimal from "decimal.js";
import { TAX_CONSTANTS } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import type { Form8889Input, TaxYearInput } from "@/models/inputs";
import type { FilingStatus, PersonalInfoData, W2EntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, guidedAmountChanged, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";
import { isStartedW2 } from "./guided-w2-facts";
import { buildHsaDistributionInputs, hsaDistributionFactErrors, type HsaDistributionSource } from "./guided-hsa-distribution-facts";

import { buildHsaTimelyCorrectionOriginal, hsaCorrectionRecipient, hsaTimelyCorrectionAccountErrors } from "./guided-hsa-excess-correction-facts";

export type HsaCoverageFact = "" | "none" | "self_only" | "family";
export interface HsaAccountData {
  id: string;
  accountOwner: "" | "primary" | "spouse";
  contributionTaxYear: string;
  coverageByMonth: HsaCoverageFact[];
  medicareByMonth: (boolean | null)[];
  otherDisqualifyingCoverageByMonth: (boolean | null)[];
  canBeClaimedAsDependent: boolean | null;
  monthlyEligibilityConfirmed: boolean | null;
  contributionsMade: string;
  contributionTimingConfirmed: boolean | null;
  employerW2Contributions: string;
  employerPriorYearContributions: string;
  employerFollowingYearContributions: string;
  employerWorksheetConfirmed: boolean | null;
  excessEmployerContributionsAlreadyInWages: string;
  bothSpousesHaveHsas: boolean | null;
  spouseAllocatedLimit: string;
  otherSpouseAllocatedLimit: string;
  allocationWorksheetConfirmed: boolean | null;
  useLastMonthRule: boolean | null;
  lastMonthRuleAcknowledged: boolean | null;
  archerMsaContributions: string;
  qualifiedFundingDistribution: string;
  priorYearExcessContributions: string;
  priorYearSourceTaxYear: string;
  priorYearAdditionalTax: string;
  yearEndFairMarketValue: string;
  annualExcessSourcesConfirmed?: boolean | null;
  hasDistributions: boolean | null;
  distributions?: HsaDistributionSource[];
  correctionsRequired: boolean | null;
  testingPeriodFailure: boolean | null;
  sourceFactsConfirmed: boolean | null;
  testingPeriod?: {
    failureDate: string;
    rule: "" | "last_month_rule" | "qualified_funding" | "both";
    deathOrDisabilityException: boolean | null;
    contributionTaxYear?: string;
    lastMonthRuleContributions?: string;
    redeterminedLimit?: string;
    fundingDistributionDate?: string;
    fundingDistributionAmount?: string;
  };
}
export function emptyHsaAccount(id: string): HsaAccountData {
  return { id, accountOwner: "", contributionTaxYear: "", coverageByMonth: Array(12).fill(""), medicareByMonth: Array(12).fill(null), otherDisqualifyingCoverageByMonth: Array(12).fill(null), canBeClaimedAsDependent: null, monthlyEligibilityConfirmed: null, contributionsMade: "", contributionTimingConfirmed: null, employerW2Contributions: "", employerPriorYearContributions: "", employerFollowingYearContributions: "", employerWorksheetConfirmed: null, excessEmployerContributionsAlreadyInWages: "", bothSpousesHaveHsas: null, spouseAllocatedLimit: "", otherSpouseAllocatedLimit: "", allocationWorksheetConfirmed: null, useLastMonthRule: null, lastMonthRuleAcknowledged: null, archerMsaContributions: "", qualifiedFundingDistribution: "", priorYearExcessContributions: "", priorYearSourceTaxYear: "", priorYearAdditionalTax: "", yearEndFairMarketValue: "", hasDistributions: null, correctionsRequired: null, testingPeriodFailure: null, sourceFactsConfirmed: null };
}

const hsaEligibilitySources = ["coverageByMonth", "medicareByMonth", "otherDisqualifyingCoverageByMonth", "canBeClaimedAsDependent"] as const;
const hsaEmployerSources = ["employerW2Contributions", "employerPriorYearContributions", "employerFollowingYearContributions", "excessEmployerContributionsAlreadyInWages"] as const;
const hsaAnnualExcessAmounts = ["priorYearExcessContributions", "priorYearAdditionalTax", "yearEndFairMarketValue"] as const;

export function invalidateEditedHsaAccount(previous: HsaAccountData, next: HsaAccountData, ownerSourceChanged = false): HsaAccountData {
  const yearOrOwnerChanged = ownerSourceChanged || previous.accountOwner !== next.accountOwner
    || previous.contributionTaxYear?.trim() !== next.contributionTaxYear?.trim();
  const eligibilityChanged = yearOrOwnerChanged
    || hsaEligibilitySources.some(field => guidedSourceValuesChanged(previous[field], next[field]));
  const timingChanged = yearOrOwnerChanged || guidedAmountChanged(previous.contributionsMade, next.contributionsMade);
  const employerSourcesChanged = yearOrOwnerChanged || hsaEmployerSources.some(field => guidedAmountChanged(previous[field], next[field]));
  const allocationChanged = eligibilityChanged || previous.bothSpousesHaveHsas !== next.bothSpousesHaveHsas
    || guidedAmountChanged(previous.spouseAllocatedLimit, next.spouseAllocatedLimit)
    || guidedAmountChanged(previous.otherSpouseAllocatedLimit, next.otherSpouseAllocatedLimit);
  const lastMonthRuleChanged = eligibilityChanged || previous.useLastMonthRule !== next.useLastMonthRule;
  const annualReviewTracked = previous.annualExcessSourcesConfirmed !== undefined;
  const annualSourcesEntered = annualReviewTracked
    || hsaAnnualExcessAmounts.some(field => hasEnteredAmount(previous[field]));
  const annualSourcesChanged = (annualSourcesEntered && (yearOrOwnerChanged
    || previous.priorYearSourceTaxYear?.trim() !== next.priorYearSourceTaxYear?.trim()))
    || hsaAnnualExcessAmounts.some(field => (annualReviewTracked || hasEnteredAmount(previous[field])) && guidedAmountChanged(previous[field], next[field]));
  const annualExcessSourcesConfirmed = annualSourcesChanged ? null
    : next.annualExcessSourcesConfirmed === undefined ? previous.annualExcessSourcesConfirmed : next.annualExcessSourcesConfirmed;
  const requiresReview = eligibilityChanged || timingChanged || employerSourcesChanged || allocationChanged || lastMonthRuleChanged || annualSourcesChanged;
  if (!requiresReview && annualExcessSourcesConfirmed === next.annualExcessSourcesConfirmed) return next;
  return {
    ...next,
    ...(requiresReview ? { sourceFactsConfirmed: null } : {}),
    ...(eligibilityChanged ? { monthlyEligibilityConfirmed: null } : {}),
    ...(timingChanged ? { contributionTimingConfirmed: null } : {}),
    ...(employerSourcesChanged ? { employerWorksheetConfirmed: null } : {}),
    ...(allocationChanged ? { allocationWorksheetConfirmed: null } : {}),
    ...(lastMonthRuleChanged ? { lastMonthRuleAcknowledged: null } : {}),
    ...(annualExcessSourcesConfirmed !== undefined ? { annualExcessSourcesConfirmed } : {}),
  };
}

export function invalidateEditedHsaAccounts(previous: HsaAccountData[] | undefined, next: HsaAccountData[] | undefined): HsaAccountData[] | undefined {
  if (!previous?.length || !next?.length) return next;
  const previousAccounts = new Map(previous.map(account => [account.id, account]));
  const nextOwnersById = new Map(next.map(account => [account.id, account.accountOwner]));
  const displacedAccounts = new Map(previous
    .filter(account => account.accountOwner && nextOwnersById.get(account.id) !== account.accountOwner)
    .map(account => [account.accountOwner, account]));
  const reviewed = next.map(account => {
    const retained = previousAccounts.get(account.id);
    if (retained) return retained === account ? account : invalidateEditedHsaAccount(retained, account);
    const replaced = displacedAccounts.get(account.accountOwner);
    return replaced ? invalidateEditedHsaAccount(replaced, account, true) : account;
  });
  return reviewed.some((account, index) => account !== next[index]) ? reviewed : next;
}

export const hsaAmountFields = ["contributionsMade", "employerW2Contributions", "employerPriorYearContributions", "employerFollowingYearContributions", "archerMsaContributions", "qualifiedFundingDistribution", "priorYearExcessContributions", "priorYearAdditionalTax", "yearEndFairMarketValue"] as const;
const knownBooleanFields = ["canBeClaimedAsDependent", "bothSpousesHaveHsas", "useLastMonthRule", "hasDistributions", "correctionsRequired", "testingPeriodFailure"] as const;
const confirmedFields = ["monthlyEligibilityConfirmed", "contributionTimingConfirmed", "employerWorksheetConfirmed", "sourceFactsConfirmed"] as const;
const activeFamily = (account: HsaAccountData, index: number) => account.coverageByMonth[index] === "family" && account.medicareByMonth[index] === false && account.otherDisqualifyingCoverageByMonth[index] === false && account.canBeClaimedAsDependent === false;

export function hsaFactErrors(accounts: HsaAccountData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, w2s?: W2EntryData[], personal?: PersonalInfoData, required = false): Record<string, string> {
  const errors: Record<string, string> = {};
  const hasKnownPayroll = (w2s ?? []).some(w2 => hasEnteredAmount(w2.box12CodeW) && !amountError(w2.box12CodeW, "code W") && parseGuidedCurrency(w2.box12CodeW).gt(0));
  if (!accounts?.length) return required || hasKnownPayroll ? { hsaSources: "Enter the actual HSA eligibility and source facts, including known zero amounts, or remove the HSA selection." } : errors;
  const sourceW2s = (w2s ?? []).filter(isStartedW2);
  const owners = new Set<string>();
  const ids = new Set<string>();
  const distributionSourceIds = new Set<string>();
  const correctionOriginalReferences = new Set<string>();
  const distributionAccountOwners = new Map<string, string>();
  for (const [index, account] of accounts.entries()) {
    const key = `hsa-${index}`;
    const add = (field: string, message: string) => { errors[`${key}-${field}`] = message; };
    const year = Number(account.contributionTaxYear);
    const married = filingStatus === "mfj" || filingStatus === "mfs";
    if (!account.id || ids.has(account.id)) add("id", "Keep one uniquely identified HSA worksheet per owner."); ids.add(account.id);
    if (!["primary", "spouse"].includes(account.accountOwner) || owners.has(account.accountOwner)) add("owner", "Select each actual HSA owner once; combine that owner's ordinary HSA contribution statements."); owners.add(account.accountOwner);
    if (account.accountOwner === "spouse" && filingStatus && filingStatus !== "mfj") add("spouse", "Saved spouse HSA facts require a joint return. Keep them saved while reconciling the return.");
    if (![2025, 2026].includes(year) || (taxYear != null && year !== taxYear)) add("year", "Enter the actual tax year designated for these HSA contributions.");
    if (account.priorYearSourceTaxYear !== String(year - 1)) add("priorSourceYear", "Enter the actual immediately preceding tax year for the excess-contribution source worksheet.");
    for (const field of hsaAmountFields) { const error = amountError(account[field], field); if (error) add(field, error); }
    for (const field of knownBooleanFields) if (typeof account[field] !== "boolean") add(field, "Answer the actual HSA eligibility or history question; blank is unknown.");
    for (const field of confirmedFields) if (account[field] !== true) add(field, "Check the actual HSA sources after the last edit.");
    if (account.annualExcessSourcesConfirmed !== undefined && account.annualExcessSourcesConfirmed !== true) {
      add("annualExcessSourcesConfirmed", "Check the prior Form 5329 amounts and year-end HSA value for their actual years.");
    }
    if (account.coverageByMonth?.length !== 12 || account.coverageByMonth.some(value => !["none", "self_only", "family"].includes(value))) add("coverage", "Enter actual coverage on the first day of each of the twelve months.");
    for (const field of ["medicareByMonth", "otherDisqualifyingCoverageByMonth"] as const) if (account[field]?.length !== 12 || account[field].some(value => typeof value !== "boolean")) add(field, "Answer Medicare and other disqualifying coverage for every month, including retroactive coverage.");
    const declaredDependent = account.accountOwner === "spouse" ? personal?.standardDeductionFacts?.spouseCanBeClaimedAsDependent : personal?.standardDeductionFacts?.primaryCanBeClaimedAsDependent;
    if (typeof declaredDependent === "boolean" && typeof account.canBeClaimedAsDependent === "boolean" && declaredDependent !== account.canBeClaimedAsDependent) add("dependency", "Reconcile HSA dependency with the actual taxpayer dependency facts.");
    if (account.useLastMonthRule === true) {
      if (account.lastMonthRuleAcknowledged !== true) add("testingAcknowledgment", "Acknowledge the testing period through December of the following year; future eligibility is not assumed.");
      if (account.coverageByMonth[11] === "none" || account.medicareByMonth[11] === true || account.otherDisqualifyingCoverageByMonth[11] === true || account.canBeClaimedAsDependent === true) add("lastMonthRule", "The last-month rule requires actual eligibility on December 1.");
    }
    if (filingStatus === "mfs" && account.bothSpousesHaveHsas === true) add("separateSpouse", "A separate return with two HSAs needs the actual other-spouse eligibility and allocation worksheet; keep these facts for that coordinated treatment.");
    if (!married && filingStatus && account.bothSpousesHaveHsas === true) add("married", "Reconcile the saved spouse HSA allocation after the filing-status change.");
    if (account.bothSpousesHaveHsas === true && account.coverageByMonth.some(value => value === "family")) {
      for (const field of ["spouseAllocatedLimit", "otherSpouseAllocatedLimit"] as const) { const error = amountError(account[field], field); if (error) add(field, error); }
      if (account.allocationWorksheetConfirmed !== true) add("allocationConfirmation", "Confirm both spouses' actual agreed contribution-limit shares, before each person's catch-up amount.");
      const annualFamily = account.coverageByMonth.every((_, month) => activeFamily(account, month)) || (account.useLastMonthRule === true && activeFamily(account, 11));
      if (!annualFamily) add("mixedAllocation", "Mixed eligible family/self-only or Medicare periods with two HSAs need the complete spouse allocation worksheet; this ordinary allocation remains unsupported.");
      const limits = year === 2026 ? FEDERAL_2026_CONSTANTS.hsa : TAX_CONSTANTS[year]?.hsa;
      if (limits && annualFamily && !errors[`${key}-spouseAllocatedLimit`] && !errors[`${key}-otherSpouseAllocatedLimit`] && !parseGuidedCurrency(account.spouseAllocatedLimit).plus(parseGuidedCurrency(account.otherSpouseAllocatedLimit)).eq(limits.familyContributionLimit)) add("allocationTotal", "The two actual shares must reconcile to the annual family contribution limit before separate catch-up amounts.");
    }
    for (const field of ["archerMsaContributions", "qualifiedFundingDistribution"] as const) if (!errors[`${key}-${field}`] && parseGuidedCurrency(account[field]).gt(0)) add(field, "This positive special HSA source needs its separate coordinated worksheet; preserve it and complete that treatment before calculating.");
    if (!errors[`${key}-priorYearExcessContributions`] && !errors[`${key}-priorYearAdditionalTax`] && parseGuidedCurrency(account.priorYearAdditionalTax).gt(0) && parseGuidedCurrency(account.priorYearExcessContributions).isZero()) add("priorTax", "A positive prior additional tax requires the actual prior excess balance; reconcile the source form.");
    if (account.hasDistributions === true && account.accountOwner) {
      const birthDate = personal ? (account.accountOwner === "spouse" ? personal.spouse?.dateOfBirth : personal.dateOfBirth) ?? "" : undefined;
      for (const [field, message] of Object.entries(hsaDistributionFactErrors(account.distributions, account.accountOwner, year, birthDate, hsaCorrectionRecipient(personal, account.accountOwner)))) add(field, message);
    }
    if (account.hasDistributions !== true && account.distributions?.length) add("savedDistributions", "Saved distribution sources remain. Reconcile the applicability answer or explicitly remove the records after checking the actual sources.");
    for (const source of account.distributions ?? []) {
      if (source.distributionCode === "2" && source.excessCorrection) for (const identity of [`contribution:${source.excessCorrection.contributionReference?.trim()}`, `distribution:${source.excessCorrection.returnReference?.trim()}`]) {
        if (correctionOriginalReferences.has(identity)) add("correctionOriginalCopy", "Keep each actual contribution and return original assigned to one owner only.");
        correctionOriginalReferences.add(identity);
      }
      if (distributionSourceIds.has(source.id)) add("distributionSourceCopy", "The same HSA source identifier appears in more than one owner worksheet; reconcile the actual recipient.");
      distributionSourceIds.add(source.id);
      const identity = [source.sourceTaxYear, source.payerTin.replace(/-/g, ""), source.accountReference.trim()].join("|");
      const existingOwner = distributionAccountOwners.get(identity);
      if (existingOwner && existingOwner !== account.accountOwner) add("distributionAccountCopy", "The same HSA account is assigned to different owners. Reconcile actual source ownership and use account references that distinguish separate accounts.");
      distributionAccountOwners.set(identity, account.accountOwner);
    }
    for (const [field, message] of Object.entries(hsaTimelyCorrectionAccountErrors(account, personal))) add(field, message);
    if (!errors[`${key}-employerPriorYearContributions`] && !errors[`${key}-employerW2Contributions`] && parseGuidedCurrency(account.employerPriorYearContributions).gt(parseGuidedCurrency(account.employerW2Contributions))) add("priorEmployer", "Prior-year amounts cannot exceed the current W-2 code W total that includes them.");
    if (!errors[`${key}-employerW2Contributions`] && !errors[`${key}-employerFollowingYearContributions`]) {
      const employerSources = parseGuidedCurrency(account.employerW2Contributions).plus(parseGuidedCurrency(account.employerFollowingYearContributions));
      if (employerSources.gt(0) || hasEnteredAmount(account.excessEmployerContributionsAlreadyInWages)) {
        const error = amountError(account.excessEmployerContributionsAlreadyInWages, "excess employer HSA contributions already included in wages");
        if (error) add("employerExcessWages", error);
        else if (parseGuidedCurrency(account.excessEmployerContributionsAlreadyInWages).gt(employerSources)) add("employerExcessWages", "The amount already in wages cannot exceed the actual employer HSA contributions.");
      }
    }
    if (w2s !== undefined) {
      const matching = sourceW2s.filter(w2 => w2.accountHolder === account.accountOwner);
      if (sourceW2s.some(w2 => !w2.accountHolder || amountError(w2.box12CodeW, "W-2 code W"))) add("w2Unknown", "Enter each W-2's actual owner and code W amount, including known zero, to reconcile HSA employer contributions.");
      else if (!errors[`${key}-employerW2Contributions`]) {
        const actual = matching.reduce((total, w2) => total.plus(parseGuidedCurrency(w2.box12CodeW)), new Decimal(0));
        if (!actual.eq(parseGuidedCurrency(account.employerW2Contributions))) add("w2Total", "Reconcile this owner's HSA worksheet with that owner's actual W-2 code W amounts.");
      }
    }
    if (account.testingPeriodFailure !== true && account.testingPeriod && Object.values(account.testingPeriod).some(value => value !== "" && value !== null && value !== undefined)) add("savedHistory", "Reconcile the saved testing-period history or explicitly clear it after checking the source; it cannot be silently excluded.");
    if (account.testingPeriodFailure === true) {
      const history = account.testingPeriod;
      if (!history || !isActualDate(history.failureDate) || !history.failureDate.startsWith(`${year}-`)) add("failureDate", "Enter the actual testing-period failure date in this tax year.");
      if (!history || !["last_month_rule", "qualified_funding", "both"].includes(history.rule)) add("failureRule", "Identify the actual prior last-month rule and/or qualified-funding testing period.");
      if (typeof history?.deathOrDisabilityException !== "boolean") add("failureException", "Confirm whether death or disability caused the testing-period failure.");
      if (history?.rule === "last_month_rule" || history?.rule === "both") {
        if (history.contributionTaxYear !== String(year - 1)) add("failureContributionYear", "Last-month recapture must use the actual immediately preceding contribution year.");
        if (history.deathOrDisabilityException === false) for (const field of ["lastMonthRuleContributions", "redeterminedLimit"] as const) { const error = amountError(history[field], field); if (error) add(field, error); }
      }
      if (history?.rule === "qualified_funding" || history?.rule === "both") {
        if (!isActualDate(history.fundingDistributionDate ?? "") || !isActualDate(history.failureDate)) add("fundingDate", "Enter the actual qualified IRA-to-HSA funding date and failure date.");
        else {
          const funding = new Date(`${history.fundingDistributionDate}T00:00:00Z`);
          const end = new Date(Date.UTC(funding.getUTCFullYear() + 1, funding.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
          if (history.failureDate < (history.fundingDistributionDate ?? "") || history.failureDate > end) add("fundingPeriod", "The failure date must fall within the actual funding distribution's testing period.");
        }
        if (history.deathOrDisabilityException === false) { const error = amountError(history.fundingDistributionAmount, "qualified funding subject to recapture"); if (error) add("fundingAmount", error); }
      }
    }
  }
  if (filingStatus === "mfj" && accounts.some(account => account.bothSpousesHaveHsas === true) && !["primary", "spouse"].every(owner => owners.has(owner))) errors.hsaSpouseWorksheet = "Enter both actual owner worksheets when both spouses have HSAs on a joint return.";
  if (accounts.length === 2) {
    if (accounts.some(account => account.bothSpousesHaveHsas !== true)) errors.hsaBothOwners = "Reconcile the two owner records with the answer that both spouses have HSAs.";
    const [first, second] = accounts;
    if (first && second && first.coverageByMonth.some((coverage, index) => (coverage === "family" || second.coverageByMonth[index] === "family") && coverage !== second.coverageByMonth[index])) errors.hsaSpouseCoverage = "Reconcile both eligible spouses as family-covered when either has family HDHP coverage. Different eligibility periods need the coordinated spouse worksheet.";
    if (first && second && first.coverageByMonth.some(value => value === "family") && [first.spouseAllocatedLimit, first.otherSpouseAllocatedLimit, second.spouseAllocatedLimit, second.otherSpouseAllocatedLimit].every(value => hasEnteredAmount(value) && !amountError(value, "allocation"))) {
      if (!parseGuidedCurrency(first.spouseAllocatedLimit).eq(parseGuidedCurrency(second.otherSpouseAllocatedLimit)) || !parseGuidedCurrency(second.spouseAllocatedLimit).eq(parseGuidedCurrency(first.otherSpouseAllocatedLimit))) errors.hsaAllocationOwners = "Both owner worksheets must report the same agreed allocation shares.";
    }
  }
  if (sourceW2s.some(w2 => hasEnteredAmount(w2.box12CodeW) && !amountError(w2.box12CodeW, "W-2 code W") && parseGuidedCurrency(w2.box12CodeW).gt(0) && !owners.has(w2.accountHolder ?? ""))) errors.hsaUnrepresentedPayroll = "An actual W-2 code W amount needs the matching owner's HSA worksheet.";
  return errors;
}

export function buildHsaInputs(accounts: HsaAccountData[] | undefined, personal?: PersonalInfoData): { form8889ByOwner?: { primary?: Partial<Form8889Input>; spouse?: Partial<Form8889Input> }; form5329HsaByOwner?: TaxYearInput["form5329HsaByOwner"]; form1099SA?: TaxYearInput["form1099SA"] } {
  if (!accounts?.length) return {};
  const errors = hsaFactErrors(accounts, undefined, undefined, undefined, personal);
  if (Object.keys(errors).length) throw new Error(`Missing required HSA source facts: ${Object.values(errors).join(" ")}`);
  const forms: { primary?: Partial<Form8889Input>; spouse?: Partial<Form8889Input> } = {};
  const excessSources: NonNullable<TaxYearInput["form5329HsaByOwner"]> = {};
  const distributions: NonNullable<TaxYearInput["form1099SA"]> = [];
  for (const account of accounts) {
    if (!account.accountOwner) throw new Error("Actual HSA owner is required");
    const history = account.testingPeriodFailure === true ? account.testingPeriod : undefined;
    const ordinaryLastMonth = history?.rule === "last_month_rule" || history?.rule === "both";
    const fundingRecapture = history?.rule === "qualified_funding" || history?.rule === "both";
    const money = (value?: string) => hasEnteredAmount(value) ? parseGuidedCurrency(value).toString() : undefined;
    const distributionInput = account.hasDistributions === true ? buildHsaDistributionInputs(account.distributions ?? [], account.accountOwner, Number(account.contributionTaxYear), (account.accountOwner === "spouse" ? personal?.spouse?.dateOfBirth : personal?.dateOfBirth) ?? "", hsaCorrectionRecipient(personal, account.accountOwner)) : undefined;
    if (distributionInput) distributions.push(...distributionInput.form1099SA);
    excessSources[account.accountOwner] = {
      sourceTaxYear: Number(account.contributionTaxYear),
      sourceFactsConfirmed: account.sourceFactsConfirmed ?? undefined,
      priorYearSourceTaxYear: Number(account.priorYearSourceTaxYear),
      priorYearExcessContributions: money(account.priorYearExcessContributions),
      priorYearAdditionalTax: money(account.priorYearAdditionalTax),
      valueDec31: money(account.yearEndFairMarketValue),
      excessEmployerContributionsAlreadyInWages: money(account.excessEmployerContributionsAlreadyInWages),
      // The actual no-corrections answer, or qualified original no-special-relief facts, excludes amended-return relief.
      ...(account.distributions?.[0]?.distributionCode === "2" ? { timelyPersonalContributionReturn: buildHsaTimelyCorrectionOriginal(account.distributions[0], account.accountOwner) } : {}),
      returnedExcessContributionsUnder9100Relief: "0",
      returnedExcessContributionEarningsUnder9100Relief: "0",
    };
    forms[account.accountOwner] = {
      accountOwner: account.accountOwner,
      coverageByMonth: account.coverageByMonth.map((coverage, month) => account.otherDisqualifyingCoverageByMonth[month] === true ? "none" : coverage as "none" | "self_only" | "family"),
      medicareMonths: account.medicareByMonth.flatMap((value, month) => value === true ? [month + 1] : []),
      isDependent: account.canBeClaimedAsDependent ?? undefined,
      contributionsMade: money(account.contributionsMade),
      employerContributions: parseGuidedCurrency(account.employerW2Contributions).minus(parseGuidedCurrency(account.employerPriorYearContributions)).plus(parseGuidedCurrency(account.employerFollowingYearContributions)).toString(),
      bothSpousesHaveHsas: account.bothSpousesHaveHsas ?? undefined,
      spouseAllocatedLimit: account.bothSpousesHaveHsas === true && account.coverageByMonth.includes("family") ? money(account.spouseAllocatedLimit) : undefined,
      archerMSAContributions: money(account.archerMsaContributions),
      qualifiedFundingDistribution: money(account.qualifiedFundingDistribution),
      useLastMonthRule: account.useLastMonthRule ?? undefined,
      ...distributionInput?.form8889,
      ...(history ? { testingPeriodFailureDueToDeathOrDisability: history.deathOrDisabilityException ?? undefined, ...(ordinaryLastMonth ? { lastMonthRuleContributions: money(history.lastMonthRuleContributions), lastMonthRuleRedeterminedLimit: money(history.redeterminedLimit) } : {}), ...(fundingRecapture ? { recaptureQualifiedFundingDistribution: money(history.fundingDistributionAmount) } : {}) } : {}),
    };
  }
  return { form8889ByOwner: forms, form5329HsaByOwner: excessSources, ...(distributions.length ? { form1099SA: distributions } : {}) };
}
