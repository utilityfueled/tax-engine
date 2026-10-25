import Decimal from 'decimal.js';
import { NetOperatingLossSourcesSchema, type TaxYearInput } from '@/models/inputs';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

export interface NolHistoryData { taxYear?: string; nolUsed?: string; attributeReduction?: string; sourceReference?: string }
export interface NolVintageData {
  sourceId?: string; lossTaxYear?: string; sourceReference?: string;
  originKind?: '' | 'individual_nol' | 'excess_business_loss' | 'estate_termination';
  originalLoss?: string; openingCarryforward?: string; section1411OriginalLoss?: string;
  carrybackTreatment?: '' | 'not_required' | 'waived' | 'completed'; carrybackSourceReference?: string;
  ordinaryHistoricalCarrybackConfirmed?: boolean | null; adjustedThroughTaxYear?: string;
  historySourceReference?: string; allHistoryIncluded?: boolean | null; farmingLossIncluded?: boolean | null;
  history?: NolHistoryData[];
}
export interface NolAlternativeData {
  sourceReference?: string; sourceFactsConfirmed?: boolean | null; allCarryoversIncluded?: boolean | null;
  specialDisasterCarryIncluded?: boolean | null; currentYearAdjustmentsCompleteConfirmed?: boolean | null;
  regularBasisAndLossLimitsSameAsAlternativeConfirmed?: boolean | null; vintages?: NolVintageData[];
}
export interface NetOperatingLossData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  allCarryoversIncluded?: boolean | null; calendarYearTaxpayer?: boolean | null;
  returnMembership?: '' | 'continuous_individual' | 'same_spouses_joint'; membershipUnchangedConfirmed?: boolean | null;
  primaryName?: string; primaryTaxpayerIdLast4?: string; spouseName?: string; spouseTaxpayerIdLast4?: string;
  vintages?: NolVintageData[]; alternativeTax?: NolAlternativeData;
}
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
function year(value: string | undefined, label: string): number {
  if (!value || !/^\d{4}$/.test(value)) throw new Error(`Enter the actual ${label}.`);
  return Number(value);
}
function filed(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual filed ${label}, including zero when established by the source.`);
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger()) throw new Error(`${label} must be an actual nonnegative filed whole-dollar amount; do not round an unverified source.`);
  return amount.toFixed(0);
}
function vintages(rows: NolVintageData[] | undefined, regular: boolean) {
  if (!Array.isArray(rows)) throw new Error(`Confirm the complete ${regular ? 'regular' : 'AMT'} loss vintages, including an explicit empty list when none.`);
  return rows.map(row => {
    if (row.originKind !== 'individual_nol') throw new Error('NOL estate and excess-business-loss sources need their separate origin and QBI character method; retain those records for reconciliation.');
    const lossTaxYear = year(row.lossTaxYear, 'originating loss tax year');
    const originalLoss = filed(row.originalLoss, 'original loss');
    const section1411OriginalLoss = regular || row.section1411OriginalLoss?.trim() ? filed(row.section1411OriginalLoss, 'originating Section1411 loss') : undefined;
    if (section1411OriginalLoss !== undefined && (new Decimal(section1411OriginalLoss).gt(originalLoss) || (lossTaxYear < 2013 && !new Decimal(section1411OriginalLoss).isZero()))) throw new Error('Reconcile the actual Section1411 loss with its originating regular loss and tax year.');
    if (!Array.isArray(row.history)) throw new Error('Confirm actual prior uses and reductions, including an explicit empty history when none.');
    return { sourceId: row.sourceId?.trim(), lossTaxYear, sourceReference: row.sourceReference?.trim(), originKind: row.originKind,
      originalLoss, openingCarryforward: filed(row.openingCarryforward, 'opening carryforward'), section1411OriginalLoss,
      carrybackTreatment: row.carrybackTreatment || undefined, carrybackSourceReference: row.carrybackSourceReference?.trim() || undefined,
      ordinaryHistoricalCarrybackConfirmed: row.ordinaryHistoricalCarrybackConfirmed ?? undefined,
      adjustedThroughTaxYear: year(row.adjustedThroughTaxYear, 'history adjusted-through year'), historySourceReference: row.historySourceReference?.trim(),
      allHistoryIncluded: row.allHistoryIncluded ?? undefined, farmingLossIncluded: row.farmingLossIncluded ?? undefined,
      history: row.history.map(item => ({ taxYear: year(item.taxYear, 'historical use or reduction year'),
        nolUsed: filed(item.nolUsed, 'historical NOL use'), attributeReduction: filed(item.attributeReduction, 'historical attribute reduction'), sourceReference: item.sourceReference?.trim() })),
    };
  });
}
export function buildGuidedNetOperatingLoss(data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): TaxYearInput['netOperatingLoss'] {
  if (!data) return undefined;
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal) throw new Error('Confirm the actual return year, filing status and household before binding NOL sources.');
  const alternative = data.alternativeTax;
  if (!alternative || alternative.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.allCarryoversIncluded !== true || alternative.specialDisasterCarryIncluded !== false
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true) {
    throw new Error('Confirm the separate actual AMT carry history and current source classification. Special-disaster or differing basis/loss-limit methods need their separate worksheet.');
  }
  const facts = NetOperatingLossSourcesSchema.parse({
    sourceTaxYear: year(data.sourceTaxYear, 'carry source tax year'), sourceReference: data.sourceReference?.trim(), sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allCarryoversIncluded: data.allCarryoversIncluded ?? undefined, calendarYearTaxpayer: data.calendarYearTaxpayer ?? undefined,
    returnMembership: data.returnMembership || undefined, membershipUnchangedConfirmed: data.membershipUnchangedConfirmed ?? undefined,
    primaryName: data.primaryName?.trim(), primaryTaxpayerIdLast4: data.primaryTaxpayerIdLast4?.trim(), spouseName: data.spouseName?.trim() || undefined, spouseTaxpayerIdLast4: data.spouseTaxpayerIdLast4?.trim() || undefined,
    vintages: vintages(data.vintages, true), alternativeTax: { sourceReference: alternative.sourceReference.trim(), sourceFactsConfirmed: true,
      allCarryoversIncluded: true, specialDisasterCarryIncluded: false, currentYearAdjustmentsCompleteConfirmed: true,
      regularBasisAndLossLimitsSameAsAlternativeConfirmed: true, vintages: vintages(alternative.vintages, false) },
  });
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const taxpayer = { primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
    spouse: filingStatus === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn } : undefined };
  const context = { taxYear, filingStatus: statuses[filingStatus], taxpayer };
  calculateNetOperatingLoss({ ...context, facts });
  calculateNetOperatingLoss({ ...context, facts: { ...facts, ...facts.alternativeTax } });
  return facts;
}
export function netOperatingLossFactErrors(data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, required = false): Record<string, string> {
  try {
    if (required && !data) throw new Error('Enter the actual NOL source packet or remove the NOL carry life event if it does not apply.');
    buildGuidedNetOperatingLoss(data, taxYear, filingStatus, personal); return {};
  } catch (error) { return { netOperatingLoss: error instanceof Error ? error.message : 'Reconcile the actual NOL source packet.' }; }
}
export function updateNetOperatingLossSources(previous: NetOperatingLossData, patch: Partial<NetOperatingLossData>): NetOperatingLossData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null,
    ...(next.alternativeTax ? { alternativeTax: { ...next.alternativeTax, sourceFactsConfirmed: null } } : {}) } : next;
}
