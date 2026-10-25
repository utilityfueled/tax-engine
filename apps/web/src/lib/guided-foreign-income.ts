import Decimal from "decimal.js";
import { Form2555Schema, type Form2555Input } from "@/models/inputs";
import { calculateForm2555 } from "@/engine/forms/form-2555";
import { resolveForm2555Sources, type Form2555SourceContext } from "@/engine/forms/form-2555-source-binding";
import { getConstants } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import type { GuidedFlowState } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { isStartedNec, sumKnownBusinessAmounts } from "./guided-business-facts";
import { actualCompensationSourceYear } from "./guided-compensation-reporting";

type Owner = "primary" | "spouse";
export const foreignIncomePartIVKeys = ["wages", "businessPersonalServices", "partnershipPersonalServices", "noncashLodging", "noncashMeals", "noncashCar", "noncashOther", "allowanceCostOfLiving", "allowanceFamily", "allowanceEducation", "allowanceHomeLeave", "allowanceQuarters", "allowanceOther", "otherEarnedIncome", "section119MealsAndLodging"] as const;
export interface ForeignIncomeSourceData {
  sourceId: string; sourceTaxYear: string; accountHolder: "" | Owner; sourceReference: string; payerName: string; payerEin: string;
  foreignEarnedIncome: string; priorYearIncomeReceived: string; notIncludedInW2Confirmed: boolean | null;
  businessGrossReceipts: string; businessReturnsAndAllowances: string; businessCostOfGoodsSold: string; businessOtherIncome: string;
}
export interface ForeignIncomeData {
  sourceTaxYear: string; sourceReference: string; accountHolder: "" | Owner; taxpayerName: string; taxpayerTaxIdLast4: string;
  sourceFactsConfirmed: boolean | null; allSourcesIncluded: boolean | null; oneOwnerOnlyConfirmed: boolean | null;
  taxHomeCountry: string; taxHomeStartDate: string; taxHomeEndDate: string; taxHomeConfirmed: boolean | null;
  citizenshipStatus: "" | "us_citizen" | "resident_alien"; servicesQualify: boolean | null;
  foreignCountriesQualify: boolean | null; cubaTravelPermittedConfirmed: boolean | null;
  qualificationMethod: "" | "physical_presence" | "bona_fide_residence"; qualificationReference: string;
  testPeriodStartDate: string; testPeriodEndDate: string; testPeriodCompleted: boolean | null; qualifyingDays: string;
  fullForeignPeriods: { country: string; startDate: string; endDate: string }[];
  bonaFideResidenceConfirmed: boolean | null; nonresidenceStatementDisqualifies: boolean | null; treatyResidentEligibilityConfirmed: boolean | null;
  electionsValidConfirmed: boolean | null; claimForeignEarnedIncomeExclusion: boolean | null; claimHousingExclusionOrDeduction: boolean | null;
  partIV: Record<typeof foreignIncomePartIVKeys[number], string>; sources: ForeignIncomeSourceData[];
  noncashValuationReference: string; section119QualificationConfirmed: boolean | null; otherIncomeDescription: string;
  businessCapitalMaterialIncomeProducing: boolean | null;
  qualifiedHousingExpenses: string; housingExpensesQualificationConfirmed: boolean | null; housingExpenseReference: string;
  housingNoDuplicateClaimConfirmed: boolean | null; nontaxableGovernmentHousingAllowance: string;
  housingLocationPeriods: { locationId: string; days: string; noticeTaxYear: string; priorYearLocationId: string }[];
  deductionsAllocableToExcludedIncome: string; foreignEarnedIncomeTaxWorksheetDisallowedDeductions: string; deductionWorksheetReference: string;
  priorYearHousingDeductionCarryover: string; priorYearHousingCarryoverTaxYear: string; priorYearHousingCarryoverConfirmed: boolean | null; priorYearHousingReference: string;
  priorYearIncomeExclusion: string; priorYearIncomeExclusionTaxYear: string; priorYearUnusedExclusion: string;
  priorYearIncomeStatementConfirmed: boolean | null; priorYearIncomeAlreadyReportedConfirmed: boolean | null; priorYearIncomeReference: string;
}
export const emptyForeignIncomeSource: ForeignIncomeSourceData = { sourceId: "", sourceTaxYear: "", accountHolder: "", sourceReference: "", payerName: "", payerEin: "", foreignEarnedIncome: "", priorYearIncomeReceived: "", notIncludedInW2Confirmed: null, businessGrossReceipts: "", businessReturnsAndAllowances: "", businessCostOfGoodsSold: "", businessOtherIncome: "" };
export const emptyForeignIncome: ForeignIncomeData = {
  sourceTaxYear: "", sourceReference: "", accountHolder: "", taxpayerName: "", taxpayerTaxIdLast4: "", sourceFactsConfirmed: null, allSourcesIncluded: null, oneOwnerOnlyConfirmed: null,
  taxHomeCountry: "", taxHomeStartDate: "", taxHomeEndDate: "", taxHomeConfirmed: null, citizenshipStatus: "", servicesQualify: null, foreignCountriesQualify: null, cubaTravelPermittedConfirmed: null,
  qualificationMethod: "", qualificationReference: "", testPeriodStartDate: "", testPeriodEndDate: "", testPeriodCompleted: null, qualifyingDays: "", fullForeignPeriods: [],
  bonaFideResidenceConfirmed: null, nonresidenceStatementDisqualifies: null, treatyResidentEligibilityConfirmed: null,
  electionsValidConfirmed: null, claimForeignEarnedIncomeExclusion: null, claimHousingExclusionOrDeduction: null,
  partIV: Object.fromEntries(foreignIncomePartIVKeys.map(key => [key, ""])) as ForeignIncomeData["partIV"], sources: [],
  noncashValuationReference: "", section119QualificationConfirmed: null, otherIncomeDescription: "", businessCapitalMaterialIncomeProducing: null,
  qualifiedHousingExpenses: "", housingExpensesQualificationConfirmed: null, housingExpenseReference: "", housingNoDuplicateClaimConfirmed: null, nontaxableGovernmentHousingAllowance: "", housingLocationPeriods: [],
  deductionsAllocableToExcludedIncome: "", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "", deductionWorksheetReference: "",
  priorYearHousingDeductionCarryover: "", priorYearHousingCarryoverTaxYear: "", priorYearHousingCarryoverConfirmed: null, priorYearHousingReference: "",
  priorYearIncomeExclusion: "", priorYearIncomeExclusionTaxYear: "", priorYearUnusedExclusion: "", priorYearIncomeStatementConfirmed: null, priorYearIncomeAlreadyReportedConfirmed: null, priorYearIncomeReference: "",
};
function money(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
function known(value: boolean | null | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Confirm the actual ${label}; an unanswered fact stays unknown.`);
  return value;
}
function integer(value: string, label: string, min: number, max: number): number {
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new Error(`Enter actual ${label} between ${min} and ${max}.`);
  return Number(value);
}
function day(value: string, label: string): number {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Enter the actual ${label} date.`);
  return date.getTime() / 86_400_000;
}
const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;

/** Matches the bridge's canonical W2 order, rejecting unconfirmed suggestions. */
function sourceContext(state: GuidedFlowState): Form2555SourceContext {
  const status = state.segmentation.filingStatus;
  if (!status || (state.taxYear !== 2025 && state.taxYear !== 2026)) throw new Error("Select the actual foreign-income return year and filing status.");
  const entries = state.sectionData["income-w2"]?.entries ?? [];
  if (entries.some(entry => Object.values(entry.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation"))) throw new Error("Confirm original W2 suggestions before binding foreign income.");
  const business = state.sectionData["income-self-employment"];
  const facts = business?.businessFacts;
  const necs = business?.necEntries.filter(isStartedNec) ?? [];
  const gross = business ? sumKnownBusinessAmounts([...necs.map(entry => entry.nonemployeeCompensation), business.manualGrossReceipts]) : null;
  return {
    taxpayer: { taxYear: state.taxYear, filingStatus: statuses[status], spouse: status === "mfj" ? state.sectionData["personal-info"]?.spouse : undefined },
    w2s: entries.filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld)).map(entry => ({ employer: { name: entry.employerName.trim(), ein: entry.employerEin.trim() },
      accountHolder: entry.accountHolder || undefined, taxYear: actualCompensationSourceYear(entry.sourceTaxYear), wages: hasEnteredAmount(entry.wages) ? money(entry.wages, "original W2 wages") : undefined })),
    scheduleC: facts ? { accountHolder: facts.accountHolder || undefined, businessName: facts.businessName?.trim(), ein: facts.ein?.trim(), grossReceipts: gross?.toFixed(),
      returnsAndAllowances: hasEnteredAmount(facts.returnsAndAllowances) ? money(facts.returnsAndAllowances, "business returns") : undefined,
      costOfGoodsSold: hasEnteredAmount(facts.costOfGoodsSold) ? money(facts.costOfGoodsSold, "business cost of goods sold") : undefined,
      otherIncome: hasEnteredAmount(facts.otherIncome) ? money(facts.otherIncome, "business other income") : undefined } : undefined,
    form1099Nec: necs.map(entry => ({ accountHolder: entry.accountHolder || undefined, nonemployeeCompensation: hasEnteredAmount(entry.nonemployeeCompensation) ? money(entry.nonemployeeCompensation, "original NEC compensation") : undefined })),
  };
}
export function foreignIncomeSourceOptions(state: GuidedFlowState): { sourceId: string; label: string }[] {
  const result = (state.sectionData["income-w2"]?.entries ?? []).filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld))
    .map((entry, index) => ({ sourceId: `formW2:${index}`, label: `W-2 ${index + 1}: ${entry.employerName || "Unnamed employer"}` }));
  if (state.sectionData["income-self-employment"]?.businessFacts) result.push({ sourceId: "scheduleC", label: `Schedule C: ${state.sectionData["income-self-employment"]?.businessFacts?.businessName || "Actual business"}` });
  return result;
}
function qualification(data: ForeignIncomeData, year: number) {
  if (!data.taxHomeCountry.trim() || !data.qualificationReference.trim()) throw new Error("Identify the actual foreign tax home and completed qualification worksheet.");
  if (!["us_citizen", "resident_alien"].includes(data.citizenshipStatus)) throw new Error("Confirm actual U.S. citizen or resident-alien eligibility.");
  const homeStart = day(data.taxHomeStartDate, "foreign tax-home start"), homeEnd = day(data.taxHomeEndDate, "foreign tax-home end");
  const start = day(data.testPeriodStartDate, "qualifying test-period start"), end = day(data.testPeriodEndDate, "qualifying test-period end");
  if (homeEnd < homeStart || end < start) throw new Error("Actual foreign tax-home and qualification dates must be ordered.");
  if (data.testPeriodCompleted !== true) throw new Error("Use a completed, documented test period; future expected qualification is not established.");
  const home = known(data.taxHomeConfirmed, "foreign tax-home test including the abode rule");
  const services = known(data.servicesQualify, "qualifying foreign personal services, excluding U.S. Government employee pay");
  const geography = known(data.foreignCountriesQualify, "foreign-country geography qualification");
  const countryNames = [data.taxHomeCountry, ...data.fullForeignPeriods.map(period => period.country)].map(value => normalized(value).replace(/[.]/g, ""));
  const excludedPlaces = new Set(["us", "usa", "united states", "united states of america", "puerto rico", "guam", "american samoa", "us virgin islands", "united states virgin islands", "virgin islands of the united states", "northern mariana islands", "commonwealth of the northern mariana islands", "antarctica", "international waters", "international airspace"]);
  if (geography && countryNames.some(name => excludedPlaces.has(name))) throw new Error("Reconcile foreign-country geography: U.S. places, territories, Antarctica and international waters do not qualify.");
  const permittedTravel = countryNames.some(name => name === "cuba" || name === "republic of cuba") ? known(data.cubaTravelPermittedConfirmed, "Cuba travel permissions under U.S. restrictions") : true;
  let test: boolean;
  if (data.qualificationMethod === "physical_presence") {
    const anniversary = new Date(`${data.testPeriodStartDate}T00:00:00Z`); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1); anniversary.setUTCDate(anniversary.getUTCDate() - 1);
    if (end !== anniversary.getTime() / 86_400_000) throw new Error("Physical presence requires an actual twelve-month period.");
    const intervals = data.fullForeignPeriods.map(period => {
      if (!period.country.trim()) throw new Error("Identify each actual foreign country, excluding U.S. territories and international travel.");
      const first = day(period.startDate, "full foreign-day start"), last = day(period.endDate, "full foreign-day end");
      if (last < first || first < start || last > end) throw new Error("Full foreign-day periods must fit the actual twelve-month test period.");
      return [first, last] as const;
    }).sort((a, b) => a[0] - b[0]);
    let count = 0; let priorEnd = -Infinity;
    for (const [first, last] of intervals) { if (first <= priorEnd) throw new Error("Full foreign-day periods cannot overlap or duplicate days."); count += last - first + 1; priorEnd = last; }
    test = count >= 330;
    if (!test && home && services && geography && permittedTravel) throw new Error("Actual physical presence has fewer than330 full foreign days; a waiver requires its separate method.");
  } else if (data.qualificationMethod === "bona_fide_residence") {
    if (data.fullForeignPeriods.length) throw new Error("Reconcile retained physical-presence periods before choosing the distinct bona fide residence method.");
    test = known(data.bonaFideResidenceConfirmed, "bona fide residence facts") && !known(data.nonresidenceStatementDisqualifies, "foreign nonresidence-statement disqualification");
    if (data.citizenshipStatus === "resident_alien") test = known(data.treatyResidentEligibilityConfirmed, "resident-alien treaty eligibility") && test;
    const firstYear = new Date(start * 86_400_000).getUTCFullYear();
    const completeYear = start <= day(`${firstYear}-01-01`, "calendar start") ? firstYear : firstYear + 1;
    if (test && end < day(`${completeYear}-12-31`, "calendar end")) throw new Error("Bona fide residence requires an uninterrupted period containing an entire calendar tax year.");
  } else throw new Error("Choose the actual physical-presence or bona fide residence test.");
  const eligible = home && services && geography && permittedTravel && test;
  const days = integer(data.qualifyingDays, "current-year qualifying days", 0, 365);
  const expected = eligible ? Math.max(0, Math.min(end, homeEnd, day(`${year}-12-31`, "return-year end")) - Math.max(start, homeStart, day(`${year}-01-01`, "return-year start")) + 1) : 0;
  if (days !== expected) throw new Error("Actual qualifying days must reconcile to the tax-home, test-period and return-year dates; known ineligibility has zero qualifying days.");
  return { eligible, days };
}
export function buildForeignIncomeInput(data: ForeignIncomeData | undefined, state: GuidedFlowState): Form2555Input | undefined {
  if (!data) return undefined;
  const context = sourceContext(state), year = context.taxpayer.taxYear;
  if (data.sourceTaxYear !== String(year)) throw new Error("Original foreign-income worksheet year must match the actual return year.");
  if (!data.sourceReference.trim() || data.sourceFactsConfirmed !== true || data.allSourcesIncluded !== true || data.oneOwnerOnlyConfirmed !== true) throw new Error("Confirm all actual sources for one foreign-income taxpayer after the last edit; two-owner claims need separate forms.");
  const owner = data.accountHolder;
  if (owner !== "primary" && owner !== "spouse") throw new Error("Select the actual foreign-income taxpayer.");
  const personal = state.sectionData["personal-info"];
  const person = owner === "spouse" ? (state.segmentation.filingStatus === "mfj" ? personal?.spouse : undefined) : personal;
  if (!person || normalized(data.taxpayerName) !== normalized(`${person.firstName} ${person.lastName}`) || !/^\d{4}$/.test(data.taxpayerTaxIdLast4)
    || person.ssn.replace(/\D/g, "").length !== 9 || data.taxpayerTaxIdLast4 !== person.ssn.replace(/\D/g, "").slice(-4)) throw new Error("Reconcile the actual foreign-income taxpayer name and tax ID with the return household.");
  if (owner === "primary" && personal?.standardDeductionFacts?.nonresidentAlien === true) {
    if (data.citizenshipStatus === "us_citizen") throw new Error("Reconcile the primary taxpayer's actual U.S. citizenship with the household nonresident-alien answer.");
    if (state.segmentation.filingStatus !== "mfj" || personal.standardDeductionFacts.residentJointElection !== true) throw new Error("An actual nonresident claimant needs the known resident-joint election on a joint return before using the physical-presence rule.");
  }
  const { eligible, days } = qualification(data, year);
  const partIV = Object.fromEntries(foreignIncomePartIVKeys.map(key => [key, money(data.partIV[key], `foreign ${key}`)])) as NonNullable<Form2555Input["partIV"]>;
  const noncash = [partIV.noncashLodging, partIV.noncashMeals, partIV.noncashCar, partIV.noncashOther].reduce((total, value) => total.plus(value), new Decimal(0));
  if (noncash.gt(0) && !data.noncashValuationReference.trim()) throw new Error("Retain the actual noncash compensation valuation source.");
  if (new Decimal(partIV.section119MealsAndLodging).gt(0) && data.section119QualificationConfirmed !== true) throw new Error("Confirm actual section119 meals/lodging qualification, including employer premises, convenience and required lodging.");
  if (new Decimal(partIV.otherEarnedIncome).gt(0) && !data.otherIncomeDescription.trim()) throw new Error("Describe the actual other foreign earned income source.");
  if (new Decimal(partIV.businessPersonalServices).gt(0)) {
    if (known(data.businessCapitalMaterialIncomeProducing, "business capital and personal-services classification")) throw new Error("A business with capital as a material income-producing factor needs the separate30-percent net-profit source worksheet.");
  }
  if (data.sources.some(row => row.sourceId === "scheduleC")) {
    if (context.scheduleC?.grossReceipts === undefined) throw new Error("Complete the actual business receipts ledger, including known zero manual receipts, before binding foreign sources.");
    const business = state.sectionData["income-self-employment"];
    if (business?.businessFacts?.singleBusinessConfirmed !== true || business.businessFacts.incomeReconciled !== true) throw new Error("Confirm the complete single-business income ledger before binding foreign receipts.");
    if (context.form1099Nec.some(source => source.accountHolder !== owner)) throw new Error("Every included original NEC must have the actual foreign business owner.");
  }
  const rows = data.sources.map(row => ({ sourceId: row.sourceId, sourceTaxYear: integer(row.sourceTaxYear, "original income source year", year, year), accountHolder: row.accountHolder,
    sourceReference: row.sourceReference, payerName: row.payerName, payerEin: row.payerEin.trim() || undefined,
    foreignEarnedIncome: money(row.foreignEarnedIncome, "current foreign source receipts"), priorYearIncomeReceived: money(row.priorYearIncomeReceived, "prior-year services received this year"),
    notIncludedInW2Confirmed: row.notIncludedInW2Confirmed ?? undefined,
    ...Object.fromEntries((["businessGrossReceipts", "businessReturnsAndAllowances", "businessCostOfGoodsSold", "businessOtherIncome"] as const)
      .filter(key => row.sourceId === "scheduleC" || hasEnteredAmount(row[key])).map(key => [key, money(row[key], `actual ${key}`)])),
  }));
  const sourceSums = { foreignEmploymentIncomeIncludedOnW2: new Decimal(0), foreignEmploymentIncomeNotOnW2: new Decimal(0), foreignBusinessIncomeAlreadyReported: new Decimal(0), foreignPartnershipIncomeAlreadyReported: new Decimal(0), otherForeignIncomeAlreadyReported: new Decimal(0) };
  let priorReceived = new Decimal(0);
  for (const row of rows) {
    const key = /^formW2:/.test(row.sourceId) ? "foreignEmploymentIncomeIncludedOnW2" : row.sourceId === "scheduleC" ? "foreignBusinessIncomeAlreadyReported" : /^foreignEmployment:/.test(row.sourceId) ? "foreignEmploymentIncomeNotOnW2" : undefined;
    if (!key) throw new Error("Choose an actual W2, ScheduleC or separately identified foreign employment source; other source methods are not represented.");
    sourceSums[key] = sourceSums[key].plus(row.foreignEarnedIncome); priorReceived = priorReceived.plus(row.priorYearIncomeReceived);
  }
  const foreignEarnedIncome = foreignIncomePartIVKeys.filter(key => key !== "section119MealsAndLodging").reduce((total, key) => total.plus(partIV[key]), new Decimal(0)).minus(partIV.section119MealsAndLodging);
  if (foreignEarnedIncome.isNegative()) throw new Error("Actual section119 exclusion cannot exceed foreign receipts.");
  const housing = money(data.qualifiedHousingExpenses, "qualified housing costs");
  const housingQualified = known(data.housingExpensesQualificationConfirmed, "housing expense qualification");
  if (new Decimal(housing).gt(0) && (!data.housingExpenseReference.trim() || !data.housingLocationPeriods.length)) throw new Error("Retain actual housing expense references and original notice locations/days.");
  if (data.housingNoDuplicateClaimConfirmed !== true) throw new Error("Confirm actual housing allocation has no duplicate spouse, section119 or other claim.");
  if (new Decimal(money(data.nontaxableGovernmentHousingAllowance, "nontaxable government housing allowance")).gt(0)) throw new Error("Nontaxable government housing allowances require their separate qualified-housing coordination method.");
  if (!data.deductionWorksheetReference.trim()) throw new Error("Retain the completed actual worksheet for deductions allocable to excluded income, including known zero.");
  const carry = money(data.priorYearHousingDeductionCarryover, "prior-year housing deduction carryover");
  const priorExclusion = money(data.priorYearIncomeExclusion, "prior-year income exclusion");
  const priorHousingApplies = new Decimal(carry).gt(0) || !!data.priorYearHousingCarryoverTaxYear || !!data.priorYearHousingReference || typeof data.priorYearHousingCarryoverConfirmed === "boolean";
  const priorIncomeApplies = priorReceived.gt(0) || new Decimal(priorExclusion).gt(0) || !!data.priorYearIncomeExclusionTaxYear || !!data.priorYearUnusedExclusion || !!data.priorYearIncomeReference || typeof data.priorYearIncomeStatementConfirmed === "boolean" || typeof data.priorYearIncomeAlreadyReportedConfirmed === "boolean";
  if (priorHousingApplies && (!data.priorYearHousingReference.trim() || data.priorYearHousingCarryoverConfirmed !== true)) throw new Error("Confirm the actual prior-year housing carryover worksheet and source reference.");
  if (priorIncomeApplies && (!data.priorYearIncomeReference.trim() || data.priorYearIncomeStatementConfirmed !== true || data.priorYearIncomeAlreadyReportedConfirmed !== true)) throw new Error("Confirm the actual prior-year income statement and its inclusion in this year's original gross source.");
  const result = Form2555Schema.parse({ taxYear: year, accountHolder: owner, sourceFactsConfirmed: true, eligibilityConfirmed: eligible,
    electionsValidConfirmed: known(data.electionsValidConfirmed, "exclusion election validity including revocations and IRS consent"),
    claimForeignEarnedIncomeExclusion: known(data.claimForeignEarnedIncomeExclusion, "foreign earned income exclusion election"),
    claimHousingExclusionOrDeduction: known(data.claimHousingExclusionOrDeduction, "housing exclusion or deduction election"),
    qualifyingDays: days, totalDaysInYear: 365, partIV, foreignEarnedIncome: foreignEarnedIncome.toFixed(), isSelfEmployed: sourceSums.foreignBusinessIncomeAlreadyReported.gt(0),
    incomeSources: Object.fromEntries(Object.entries(sourceSums).map(([key, value]) => [key, value.toFixed()])), incomeSourceMappingConfirmed: true,
    employerProvidedForeignEarnedIncome: sourceSums.foreignEmploymentIncomeIncludedOnW2.plus(sourceSums.foreignEmploymentIncomeNotOnW2).toFixed(),
    sourceMapping: { sourceReference: data.sourceReference, sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true, rows },
    qualifiedHousingExpenses: housing, housingExpensesQualificationConfirmed: housingQualified,
    housingLocationPeriods: data.housingLocationPeriods.map(period => ({ locationId: period.locationId, days: integer(period.days, "actual housing location days", 1, 365), noticeTaxYear: integer(period.noticeTaxYear, "actual housing notice year", 2025, 2026), priorYearLocationId: period.priorYearLocationId.trim() || undefined })),
    deductionsAllocableToExcludedIncome: money(data.deductionsAllocableToExcludedIncome, "AGI deductions allocable to excluded income"),
    foreignEarnedIncomeTaxWorksheetDisallowedDeductions: money(data.foreignEarnedIncomeTaxWorksheetDisallowedDeductions, "itemized deductions disallowed for excluded foreign income"),
    priorYearHousingDeductionCarryover: carry, priorYearIncomeExclusion: priorExclusion, priorYearIncomeReceived: priorReceived.toFixed(),
    ...(priorHousingApplies ? { priorYearHousingCarryoverTaxYear: integer(data.priorYearHousingCarryoverTaxYear, "prior housing source year", year - 1, year - 1), priorYearHousingCarryoverConfirmed: true } : {}),
    ...(priorIncomeApplies ? { priorYearIncomeExclusionTaxYear: integer(data.priorYearIncomeExclusionTaxYear, "prior service source year", year - 1, year - 1), priorYearIncomeStatementConfirmed: true, priorYearIncomeAlreadyReportedConfirmed: true, priorYearUnusedExclusion: money(data.priorYearUnusedExclusion, "actual prior unused exclusion") } : {}),
  });
  resolveForm2555Sources({ ...context, form2555: result });
  calculateForm2555(result, year === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025));
  return result;
}
export function foreignIncomeFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    if (!state.sectionData.adjustments?.foreignIncome && state.segmentation.lifeEvents.includes("foreign-earned-income")) throw new Error("Enter the actual foreign-income sources and qualification worksheet, or correct the selected foreign-work event.");
    buildForeignIncomeInput(state.sectionData.adjustments?.foreignIncome, state); return {};
  } catch (error) { return { foreignIncome: error instanceof Error ? error.message : "Reconcile the actual foreign-income source facts." }; }
}
