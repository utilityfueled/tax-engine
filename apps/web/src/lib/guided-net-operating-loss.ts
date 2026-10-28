import Decimal from 'decimal.js';
import { assertNolFilingUnitAgreement } from '@/utils/nol-filing-unit-timeline';
import { buildNolFilingUnitTimeline, buildNolFilingUnitOrigin, buildNolFilingUnitUses, buildNolSameCoupleJointHistory, type NolFilingUnitHistoryData, type NolFilingUnitOriginData, type NolFilingUnitUseData, type NolSameCoupleJointHistoryData } from './guided-nol-filing-unit';
import { NetOperatingLossSourcesSchema, type TaxYearInput } from '@/models/inputs';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss';
import type { DeductionData, FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { parseGuidedQbiLossPacket, type K1LossSourcesData } from './guided-qbi-loss-data';
import { calculateQbiEblNol } from '@/engine/forms/qbi-ebl-nol';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient';
import { validateCharitableNolOriginHistories } from '@/utils/charitable-nol-origins';
import { buildGuidedCharitableCarryover, type CharitableCarryoverData } from './guided-charitable-carryover';

export interface NolHistoryData { filingUnitUses?: NolFilingUnitUseData[]; taxYear?: string; nolUsed?: string; attributeReduction?: string; sourceReference?: string }
export interface NolVintageData {
  sourceId?: string; lossTaxYear?: string; sourceReference?: string;
  originKind?: '' | 'individual_nol' | 'excess_business_loss' | 'estate_termination';
  originalLoss?: string; openingCarryforward?: string; section1411OriginalLoss?: string;
  carrybackTreatment?: '' | 'not_required' | 'waived' | 'completed'; carrybackSourceReference?: string;
  ordinaryHistoricalCarrybackConfirmed?: boolean | null; adjustedThroughTaxYear?: string;
  historySourceReference?: string; allHistoryIncluded?: boolean | null; farmingLossIncluded?: boolean | null;
  history?: NolHistoryData[]; filingUnitOrigin?: NolFilingUnitOriginData;
}
export interface NolAlternativeData {
  sourceReference?: string; sourceFactsConfirmed?: boolean | null; allCarryoversIncluded?: boolean | null;
  specialDisasterCarryIncluded?: boolean | null; currentYearAdjustmentsCompleteConfirmed?: boolean | null;
  regularBasisAndLossLimitsSameAsAlternativeConfirmed?: boolean | null; vintages?: NolVintageData[];
  charitableCarryoverHistory?: NolCharitableHistoryData; filingUnitHistory?: NolFilingUnitHistoryData;
  sameCoupleJointHistory?: NolSameCoupleJointHistoryData;
}
export interface NolCharitableCarryData {
  taxYear?: string; category?: '' | 'cash_60' | 'noncash_50' | 'capital_gain_30' | 'other_30' | 'capital_gain_20';
  amount?: string; sourceReference?: string;
}
export interface NolCharitableHistoryData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null; allCarryoversIncluded?: boolean | null;
  priorRegularCarryovers?: NolCharitableCarryData[]; priorAlternativeCarryovers?: NolCharitableCarryData[];
  alternativeCarryoverSources?: CharitableCarryoverData;
}
export interface NetOperatingLossData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  allCarryoversIncluded?: boolean | null; calendarYearTaxpayer?: boolean | null;
  returnMembership?: '' | 'continuous_individual' | 'same_spouses_joint' | 'changed_membership';
  filingUnitHistory?: NolFilingUnitHistoryData; membershipUnchangedConfirmed?: boolean | null;
  sameCoupleJointHistory?: NolSameCoupleJointHistoryData;
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
function vintages(rows: NolVintageData[] | undefined, regular: boolean, actualEblSources: boolean) {
  if (!Array.isArray(rows)) throw new Error(`Confirm the complete ${regular ? 'regular' : 'AMT'} loss vintages, including an explicit empty list when none.`);
  return rows.map(row => {
    if (row.originKind !== 'individual_nol' && !(actualEblSources && row.originKind === 'excess_business_loss')) throw new Error('NOL estate and excess-business-loss sources need their separate origin and QBI character method; retain those records for reconciliation.');
    const lossTaxYear = year(row.lossTaxYear, 'originating loss tax year');
    const originalLoss = filed(row.originalLoss, 'original loss');
    const section1411OriginalLoss = regular || row.section1411OriginalLoss?.trim() ? filed(row.section1411OriginalLoss, 'originating Section1411 loss') : undefined;
    if (section1411OriginalLoss !== undefined && (new Decimal(section1411OriginalLoss).gt(originalLoss) || (lossTaxYear < 2013 && !new Decimal(section1411OriginalLoss).isZero()))) throw new Error('Reconcile the actual Section1411 loss with its originating regular loss and tax year.');
    if (!Array.isArray(row.history)) throw new Error('Confirm actual prior uses and reductions, including an explicit empty history when none.');
    return { sourceId: row.sourceId?.trim(), lossTaxYear, sourceReference: row.sourceReference?.trim(), originKind: row.originKind,
      filingUnitOrigin: buildNolFilingUnitOrigin(row.filingUnitOrigin),
      originalLoss, openingCarryforward: filed(row.openingCarryforward, 'opening carryforward'), section1411OriginalLoss,
      carrybackTreatment: row.carrybackTreatment || undefined, carrybackSourceReference: row.carrybackSourceReference?.trim() || undefined,
      ordinaryHistoricalCarrybackConfirmed: row.ordinaryHistoricalCarrybackConfirmed ?? undefined,
      adjustedThroughTaxYear: year(row.adjustedThroughTaxYear, 'history adjusted-through year'), historySourceReference: row.historySourceReference?.trim(),
      allHistoryIncluded: row.allHistoryIncluded ?? undefined, farmingLossIncluded: row.farmingLossIncluded ?? undefined,
      history: row.history.map(item => ({ taxYear: year(item.taxYear, 'historical use or reduction year'),
        nolUsed: filed(item.nolUsed, 'historical NOL use'), attributeReduction: filed(item.attributeReduction, 'historical attribute reduction'), sourceReference: item.sourceReference?.trim(), filingUnitUses: buildNolFilingUnitUses(item.filingUnitUses) })),
    };
  });
}
export function buildGuidedNetOperatingLoss(data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, deductions?: DeductionData, qbiSources?: K1LossSourcesData): TaxYearInput['netOperatingLoss'] {
  return collectGuidedNetOperatingLoss(true, data, taxYear, filingStatus, personal, deductions, qbiSources);
}
/** Section navigation validates this section's originals; the strict builder binds later Deductions too. */
export function buildGuidedNetOperatingLossForNavigation(...args: Parameters<typeof buildGuidedNetOperatingLoss>): TaxYearInput['netOperatingLoss'] {
  return collectGuidedNetOperatingLoss(false, ...args);
}
function collectGuidedNetOperatingLoss(validateDeductions: boolean, data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, deductions?: DeductionData, qbiSources?: K1LossSourcesData): TaxYearInput['netOperatingLoss'] {
  if (!data) return undefined;
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal) throw new Error('Confirm the actual return year, filing status and household before binding NOL sources.');
  const alternative = data.alternativeTax;
  if (!alternative || alternative.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.allCarryoversIncluded !== true || alternative.specialDisasterCarryIncluded !== false
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true) {
    throw new Error('Confirm the separate actual AMT carry history and current source classification. Special-disaster or differing basis/loss-limit methods need their separate worksheet.');
  }
  const history = alternative.charitableCarryoverHistory;
  const hasOriginalCharitableSources = deductions?.k1CharitableSources !== undefined || deductions?.cryptoDonations !== undefined;
  const hasGifts = [deductions?.charitableContributions, ...(deductions?.donationEntries?.map(row => row.amount) ?? [])]
    .some(value => value?.trim() && !parseGuidedCurrency(value).isZero());
  const positiveAlternative = alternative.vintages?.some(row => row.openingCarryforward?.trim() && parseGuidedCurrency(row.openingCarryforward).gt(0));
  const positiveRegular = data.vintages?.some(row => row.openingCarryforward?.trim() && parseGuidedCurrency(row.openingCarryforward).gt(0));
  const hasNonPublicCashGift = deductions?.donationEntries?.some(row => row.amount?.trim()
    && parseGuidedCurrency(row.amount).gt(0) && row.qualifiedOrganization !== false
    && (row.type !== 'cash' || resolveCharitableRecipient(row).percentageCategory !== 'fifty-percent'));
  if (history !== undefined || hasOriginalCharitableSources || (positiveAlternative && hasGifts) || (positiveRegular && hasNonPublicCashGift)) {
    if (!history || year(history.sourceTaxYear, 'charitable histories source year') !== taxYear - 1 || !history.sourceReference?.trim()
      || history.sourceFactsConfirmed !== true || history.allCarryoversIncluded !== true
      || (!history.alternativeCarryoverSources && (!Array.isArray(history.priorRegularCarryovers) || !Array.isArray(history.priorAlternativeCarryovers)))) {
      throw new Error('Confirm the complete independent prior regular and AMT charitable histories, including each explicitly empty list when none.');
    }
    if (((history.priorRegularCarryovers?.length ?? 0) > 0 || (history.priorAlternativeCarryovers?.length ?? 0) > 0) && !history.alternativeCarryoverSources) {
      throw new Error('Retain actual prior charitable carryovers and supply the independent complete regular and AMT source histories.');
    }
  }
  const summaries = (rows: NolCharitableCarryData[] | undefined) => rows?.map(row => {
    if (!row.amount?.trim() || parseGuidedCurrency(row.amount).isNegative()) throw new Error('Enter the actual nonnegative prior charitable opening amount, including known zero.');
    return { ...row, taxYear: year(row.taxYear, 'original charitable contribution year'), category: row.category || undefined,
      amount: row.amount.trim().replaceAll(',', ''), sourceReference: row.sourceReference?.trim() };
  });
  const facts = NetOperatingLossSourcesSchema.parse({
    sourceTaxYear: year(data.sourceTaxYear, 'carry source tax year'), sourceReference: data.sourceReference?.trim(), sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allCarryoversIncluded: data.allCarryoversIncluded ?? undefined, calendarYearTaxpayer: data.calendarYearTaxpayer ?? undefined,
    filingUnitHistory: buildNolFilingUnitTimeline(data.filingUnitHistory),
    sameCoupleJointHistory: buildNolSameCoupleJointHistory(data.sameCoupleJointHistory),
    returnMembership: data.returnMembership || undefined, membershipUnchangedConfirmed: data.membershipUnchangedConfirmed ?? undefined,
    primaryName: data.primaryName?.trim(), primaryTaxpayerIdLast4: data.primaryTaxpayerIdLast4?.trim(), spouseName: data.spouseName?.trim() || undefined, spouseTaxpayerIdLast4: data.spouseTaxpayerIdLast4?.trim() || undefined,
    vintages: vintages(data.vintages, true, qbiSources !== undefined), alternativeTax: { sourceReference: alternative.sourceReference.trim(), sourceFactsConfirmed: true,
      filingUnitHistory: buildNolFilingUnitTimeline(alternative.filingUnitHistory),
      sameCoupleJointHistory: buildNolSameCoupleJointHistory(alternative.sameCoupleJointHistory),
      allCarryoversIncluded: true, specialDisasterCarryIncluded: false, currentYearAdjustmentsCompleteConfirmed: true,
      regularBasisAndLossLimitsSameAsAlternativeConfirmed: true, vintages: vintages(alternative.vintages, false, qbiSources !== undefined),
      ...(history ? { charitableCarryoverHistory: { sourceTaxYear: year(history.sourceTaxYear, 'charitable histories source year'),
        sourceReference: history.sourceReference?.trim(), sourceFactsConfirmed: history.sourceFactsConfirmed ?? undefined,
        allCarryoversIncluded: history.allCarryoversIncluded ?? undefined,
        priorRegularCarryovers: summaries(history.priorRegularCarryovers), priorAlternativeCarryovers: summaries(history.priorAlternativeCarryovers),
        ...(history.alternativeCarryoverSources ? { alternativeCarryoverSources: buildGuidedCharitableCarryover(history.alternativeCarryoverSources, taxYear, filingStatus, personal) } : {}) } } : {}) },
  });
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const taxpayer = { primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
    spouse: filingStatus === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn } : undefined };
  const death = personal.standardDeductionFacts;
  const standardDeductionFacts = { primaryDeathDate: death?.primaryDeceased === false ? null : death?.primaryDeathDate?.trim() || undefined,
    ...(filingStatus === 'mfj' ? { spouseDeathDate: death?.spouseDeceased === false ? null : death?.spouseDeathDate?.trim() || undefined } : {}) };
  const context = { taxYear, filingStatus: statuses[filingStatus], taxpayer, standardDeductionFacts };
  if (validateDeductions && history?.alternativeCarryoverSources) validateCharitableNolOriginHistories({ taxpayer: { ...taxpayer, taxYear, filingStatus: statuses[filingStatus] },
    netOperatingLoss: facts, charitableCarryoverSources: buildGuidedCharitableCarryover(deductions?.charitableCarryoverSources, taxYear, filingStatus, personal) });
  calculateNetOperatingLoss({ ...context, facts });
  calculateNetOperatingLoss({ ...context, facts: { ...facts, ...facts.alternativeTax,
    filingUnitHistory: facts.alternativeTax?.filingUnitHistory, sameCoupleJointHistory: facts.alternativeTax?.sameCoupleJointHistory } });
  if (facts.returnMembership === 'changed_membership') assertNolFilingUnitAgreement({ ...taxpayer, taxYear, filingStatus: statuses[filingStatus] }, facts.filingUnitHistory, facts.alternativeTax?.filingUnitHistory, standardDeductionFacts);
  if (qbiSources) calculateQbiEblNol({ taxpayer: { ...taxpayer, taxYear, filingStatus: statuses[filingStatus] },
    qbiLossSources: parseGuidedQbiLossPacket(qbiSources), netOperatingLoss: facts });
  return facts;
}
export function netOperatingLossFactErrors(data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, required = false, deductions?: DeductionData, qbiSources?: K1LossSourcesData): Record<string, string> {
  return validateGuidedNetOperatingLoss(buildGuidedNetOperatingLoss, data, taxYear, filingStatus, personal, required, deductions, qbiSources);
}
export function netOperatingLossNavigationFactErrors(...args: Parameters<typeof netOperatingLossFactErrors>): Record<string, string> {
  return validateGuidedNetOperatingLoss(buildGuidedNetOperatingLossForNavigation, ...args);
}
function validateGuidedNetOperatingLoss(build: typeof buildGuidedNetOperatingLoss, data: NetOperatingLossData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, required = false, deductions?: DeductionData, qbiSources?: K1LossSourcesData): Record<string, string> {
  try {
    if (required && !data) throw new Error('Enter the actual NOL source packet or remove the NOL carry life event if it does not apply.');
    build(data, taxYear, filingStatus, personal, deductions, qbiSources); return {};
  } catch (error) { return { netOperatingLoss: error instanceof Error ? error.message : 'Reconcile the actual NOL source packet.' }; }
}
export function updateNetOperatingLossSources(previous: NetOperatingLossData, patch: Partial<NetOperatingLossData>): NetOperatingLossData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateNetOperatingLossSources(next) : next;
}
export function invalidateNetOperatingLossSources(next: NetOperatingLossData): NetOperatingLossData {
  return { ...next, sourceFactsConfirmed: null,
    ...(next.filingUnitHistory ? { filingUnitHistory: { ...next.filingUnitHistory, sourceFactsConfirmed: null } } : {}),
    ...(next.sameCoupleJointHistory ? { sameCoupleJointHistory: { ...next.sameCoupleJointHistory, sourceFactsConfirmed: null } } : {}),
    ...(next.vintages ? { vintages: invalidateNolOwnerUses(next.vintages) } : {}),
    ...(next.alternativeTax ? { alternativeTax: { ...next.alternativeTax, sourceFactsConfirmed: null,
      ...(next.alternativeTax.filingUnitHistory ? { filingUnitHistory: { ...next.alternativeTax.filingUnitHistory, sourceFactsConfirmed: null } } : {}),
      ...(next.alternativeTax.sameCoupleJointHistory ? { sameCoupleJointHistory: { ...next.alternativeTax.sameCoupleJointHistory, sourceFactsConfirmed: null } } : {}),
      ...(next.alternativeTax.vintages ? { vintages: invalidateNolOwnerUses(next.alternativeTax.vintages) } : {}),
      ...(next.alternativeTax.charitableCarryoverHistory ? { charitableCarryoverHistory: { ...next.alternativeTax.charitableCarryoverHistory, sourceFactsConfirmed: null,
        ...(next.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources ? { alternativeCarryoverSources: { ...next.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources, sourceFactsConfirmed: null, ...(next.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources.filingUnitHistory ? { filingUnitHistory: { ...next.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources.filingUnitHistory, sourceFactsConfirmed: null } } : {}) } } : {}) } } : {}) } } : {}) };
}

function invalidateNolOwnerUses(rows: NolVintageData[]): NolVintageData[] {
  return rows.map(row => ({ ...row, ...(row.history ? { history: row.history.map(year => ({ ...year,
    ...(year.filingUnitUses ? { filingUnitUses: year.filingUnitUses.map(use => ({ ...use, sourceFactsConfirmed: null })) } : {}),
  })) } : {}) }));
}
