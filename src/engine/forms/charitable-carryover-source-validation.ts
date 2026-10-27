/** Shared source-only validation; no income, itemization or deduction estimate. */
import type { TaxYearInput } from "@/models/inputs.js";
import type { CharitableCategory } from "./charitable-contribution-worksheet.js";
import { d, sum } from "@/utils/decimal.js";
import Decimal from "decimal.js";
import { calculateCharitableFilingUnitHistory, type CharitableFilingUnitResult } from './charitable-filing-unit-history.js';
import { charitableFilingUnitAmount } from '@/utils/charitable-filing-unit-ratios.js';
import { assertDeterminedCharitableJointPools } from '@/utils/charitable-filing-unit-pools.js';
import { validateCharitableFilingUnitTimeline } from '@/utils/charitable-filing-unit-timeline.js';
export interface CharitableCarryoverBalance {
  sourceId: string; taxYear: number; category: CharitableCategory; medium: "cash" | "noncash"; amount: Decimal;
  /** Derived original histories; a pooled current balance does not assign later use to an owner. */
  filingUnitSources?: CharitableFilingUnitResult[];
}
type Identity = Pick<TaxYearInput["taxpayer"]["primary"], "firstName" | "lastName" | "ssn">;
export interface CharitableSourceValidationInput {
  taxpayer: { taxYear: number; filingStatus: TaxYearInput["taxpayer"]["filingStatus"]; primary: Identity; spouse?: Identity };
  charitableCarryoverSources?: TaxYearInput["charitableCarryoverSources"];
  standardDeductionFacts?: Pick<NonNullable<TaxYearInput["standardDeductionFacts"]>, "primaryDeathDate" | "spouseDeathDate">;
  priorYear?: Partial<Pick<NonNullable<TaxYearInput["priorYear"]>, "charitableCarryforward" | "charitableCarryforwardByYear">>;
}
const categories: CharitableCategory[] = ["cash_60", "noncash_50", "capital_gain_30", "other_30", "capital_gain_20"];
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Charitable history ${label} requires an actual nonnegative amount`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Charitable history ${label} must be finite and nonnegative`);
  return result;
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Charitable history requires actual ${label}`);
  return value.trim();
}
function normalizedName(value: string): string { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }
function requireIdentity(input: CharitableSourceValidationInput): void {
  const sources = input.charitableCarryoverSources;
  if (!sources) throw new Error("Charitable carryover requires an actual source history packet");
  const matches = (name: string | undefined, last4: string | undefined, person: CharitableSourceValidationInput["taxpayer"]["primary"] | undefined) => person !== undefined
    && name !== undefined && normalizedName(name) === normalizedName(`${person.firstName} ${person.lastName}`)
    && /^\d{4}$/.test(last4 ?? "") && /^\d{9}$/.test(person.ssn.replaceAll("-", "")) && person.ssn.replaceAll("-", "").slice(-4) === last4;
  if (!matches(sources.primaryName, sources.primaryTaxpayerIdLast4, input.taxpayer.primary)) throw new Error("Charitable history primary identity must match the actual return");
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  const changed = sources.returnMembership === 'changed_filing_unit';
  if (changed ? sources.membershipUnchangedConfirmed === true
    : sources.membershipUnchangedConfirmed !== true || sources.returnMembership !== (joint ? "same_spouses_joint" : "continuous_individual")) {
    throw new Error("Charitable carryover requires the actual unchanged return membership; changed filing units need their separate method");
  }
  if (!changed && sources.filingUnitHistory !== undefined) throw new Error('Charitable filing history requires the explicit changed-unit source method');
  if (joint && !matches(sources.spouseName, sources.spouseTaxpayerIdLast4, input.taxpayer.spouse)) throw new Error("Charitable history spouse identity must match the actual return");
  if (!joint && (sources.spouseName !== undefined || sources.spouseTaxpayerIdLast4 !== undefined)) throw new Error("Charitable history must not assign joint ownership to an individual return");
}
export function validateCharitableCarryoverSources(input: CharitableSourceValidationInput): CharitableCarryoverBalance[] {
  if (![2025, 2026].includes(input.taxpayer.taxYear)) throw new Error("Unsupported charitable source year");
  requireIdentity(input);
  const sources = input.charitableCarryoverSources;
  if (!sources || sources.sourceTaxYear !== input.taxpayer.taxYear || sources.sourceFactsConfirmed !== true
    || sources.allCarryoversIncluded !== true || sources.calendarYearTaxpayer !== true || !Array.isArray(sources.vintages)) {
    throw new Error("Charitable carryover requires confirmed actual year and complete calendar-year source history");
  }
  text(sources.sourceReference, "source reference");
  const taxYear = input.taxpayer.taxYear;
  const ids = new Set<string>(), vintageKeys = new Set<string>();
  const changed = sources.returnMembership === 'changed_filing_unit';
  const timeline = changed ? validateCharitableFilingUnitTimeline(input.taxpayer, sources.filingUnitHistory, input.standardDeductionFacts) : undefined;
  const originalRecords: CharitableCarryoverBalance[] = sources.vintages.map(source => {
    const sourceId = text(source.sourceId, "vintage source identity");
    if (ids.has(sourceId)) throw new Error("Duplicate charitable vintage source identity");
    ids.add(sourceId);
    text(source.sourceReference, "vintage source reference");
    const year = source.contributionYear;
    if (year === undefined || !Number.isInteger(year) || year < 1900 || year >= taxYear) throw new Error("Charitable history requires an actual prior contribution year");
    if (!categories.includes(source.category as CharitableCategory)) throw new Error("Charitable history category is missing or requires a separate conservation/special-election method");
    const category = source.category as CharitableCategory;
    if (source.ordinaryPercentageMethodConfirmed !== true) throw new Error("Charitable history requires actual ordinary-percentage method confirmation");
    if (!source.medium || (category === "cash_60" && source.medium !== "cash") || (["noncash_50", "capital_gain_30", "capital_gain_20"].includes(category) && source.medium !== "noncash")) throw new Error("Charitable history category and actual contribution medium must reconcile");
    const key = `${year}:${category}:${source.medium}${changed ? `:${text(source.filingUnitOrigin?.returnSourceId, 'original filing unit')}` : ''}`;
    if (vintageKeys.has(key)) throw new Error("Duplicate charitable year/category/medium requires a single reconciled source vintage");
    vintageKeys.add(key);
    if (source.allHistoryIncluded !== true || source.adjustedThroughTaxYear !== taxYear - 1 || !Array.isArray(source.history)) throw new Error("Charitable vintage requires complete actual intervening history through the prior year");
    if (changed) {
      const result = calculateCharitableFilingUnitHistory({ taxpayer: input.taxpayer, timeline: sources.filingUnitHistory, vintage: source });
      return { sourceId, taxYear: year, category, medium: source.medium, amount: charitableFilingUnitAmount([result.openingBalance]), filingUnitSources: [result] };
    }
    if (source.filingUnitOrigin !== undefined || source.history.some(row => row.filingUnitUses !== undefined)) {
      throw new Error('Charitable ownership facts require their explicit filing-unit timeline');
    }
    let remaining = amount(source.originalExcess, "original excess").minus(amount(source.originNolReduction, "origin NOL reduction"));
    if (remaining.lt(0)) throw new Error("Charitable history origin reduction exceeds original excess");
    if (source.history.length !== taxYear - year - 1) throw new Error("Charitable history must include every intervening year");
    const history = [...source.history].sort((a, b) => (a.taxYear ?? 0) - (b.taxYear ?? 0));
    history.forEach((entry, index) => {
      if (entry.taxYear !== year + index + 1) throw new Error("Charitable history must include each actual intervening year once");
      text(entry.sourceReference, "intervening history reference");
      remaining = remaining.minus(amount(entry.treatedAsPaid, "treated-paid amount")).minus(amount(entry.nolReduction, "NOL reduction amount"));
      if (remaining.lt(0)) throw new Error("Charitable history use and reductions exceed remaining excess");
    });
    const opening = amount(source.openingCarryforward, "opening carryforward");
    if (!opening.eq(remaining)) throw new Error("Charitable opening carryforward must reconcile exactly to original excess and actual history");
    return { sourceId, taxYear: year, category, medium: source.medium, amount: opening };
  }).sort((a, b) => a.taxYear - b.taxYear || a.sourceId.localeCompare(b.sourceId));
  if (timeline) assertDeterminedCharitableJointPools(originalRecords, timeline);
  // The category consumers have one row per year/category/medium. A current
  // joint pool can contain several actual original returns, never several copies
  // of the same annual allowance or an arbitrary per-owner consumption order.
  const records: CharitableCarryoverBalance[] = [];
  for (const row of originalRecords) {
    const group = changed ? records.find(value => value.taxYear === row.taxYear && value.category === row.category && value.medium === row.medium) : undefined;
    if (!group) records.push({ ...row });
    else {
      group.filingUnitSources = [...(group.filingUnitSources ?? []), ...(row.filingUnitSources ?? [])].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      group.amount = charitableFilingUnitAmount(group.filingUnitSources.map(value => value.openingBalance));
    }
  }
  if (changed) for (const row of records) {
    row.sourceId = `filing-unit:${row.taxYear}:${row.category}:${row.medium}:${JSON.stringify(row.filingUnitSources!.map(value => value.sourceId))}`;
  }
  const openingTotal = sum(...records.map(record => record.amount));
  const legacy = d(input.priorYear?.charitableCarryforward);
  if (!legacy.isFinite() || legacy.lt(0) || (legacy.gt(0) && !legacy.eq(openingTotal))) throw new Error("Legacy charitable carryover must reconcile to actual source history");
  const legacyByYear = input.priorYear?.charitableCarryforwardByYear ?? [];
  if (legacyByYear.length) {
    const seen = new Set<string>();
    for (const row of legacyByYear) {
      const matching = records.filter(source => source.taxYear === row.taxYear && (row.category === undefined || source.category === row.category));
      if (!matching.length || matching.some(source => seen.has(source.sourceId))
        || !sum(...matching.map(source => source.amount)).eq(amount(row.amount, "legacy source amount"))) throw new Error("Legacy charitable year/category balances must reconcile to actual source history");
      matching.forEach(source => seen.add(source.sourceId));
    }
    if (seen.size !== records.length) throw new Error("Legacy charitable balances must reconcile all actual source categories");
  }
  return records;
}
