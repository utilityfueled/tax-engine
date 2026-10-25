import { ScheduleDSpecialGainSourcesSchema, type TaxYearInput } from '@/models/inputs.js';
import type { BrokerageEntryData, DividendEntryData, FilingStatus, PersonalInfoData } from './guided-interview-flow';
import type { ChildElectionData } from './guided-child-election-facts';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { isStartedDigitalAsset, type DigitalAssetEntryData } from './guided-digital-asset-facts';

type Identity = { firstName?: string; lastName?: string; ssnLast4?: string };
type Source = { sourceId?: string; sourceTaxYear?: string; sourceReference?: string; accountHolder?: string; payerName?: string };
export type ScheduleDAssetSource = Source & Partial<Record<'description' | 'dateAcquired' | 'dateSold' | 'proceeds' | 'costBasis' | 'adjustments' | 'washSaleDisallowed' | 'character', string>> & { washSale?: boolean | null };
export type ScheduleDReportedSource = Source & Partial<Record<'netLongTermCapitalGain' | 'collectiblesGain' | 'unrecapturedSection1250Gain' | 'section1202Gain', string>>;
export interface ScheduleDSourceData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null; allSourcesIncluded?: boolean | null;
  primary?: Identity; spouse?: Identity; priorShortTermCapitalLoss?: string; priorLongTermCapitalLoss?: string; section1231Lookback?: string;
  amtBasisAndCarryoversSameAsRegularConfirmed?: boolean | null; form2439Present?: boolean | null;
  partnershipInterestDispositionPresent?: boolean | null; other1250DispositionPresent?: boolean | null;
  longTermAssets?: ScheduleDAssetSource[]; reportedGains?: ScheduleDReportedSource[];
}
type InvestmentSources = { brokerageEntries: BrokerageEntryData[]; dividendEntries: DividendEntryData[]; digitalAssetEntries?: DigitalAssetEntryData[]; childElections?: ChildElectionData[]; scheduleDSources?: ScheduleDSourceData };
const started = (entry: object) => Object.values(entry).some(value => typeof value === 'string' && value.trim() !== '');
const normalized = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function actual(value: string | undefined, label: string): string { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return value.trim(); }
function amount(value: string | undefined, label: string) { return parseGuidedCurrency(actual(value, `${label}, including known zero`)).toFixed(); }
function sourceYear(value: string | undefined) { if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual original capital source year.'); return Number(value); }
function identity(source: Identity | undefined, person: { firstName?: string; lastName?: string; ssn?: string } | undefined) {
  if (!person?.ssn || !source || normalized(source.firstName) !== normalized(person.firstName) || normalized(source.lastName) !== normalized(person.lastName)
    || source.ssnLast4 !== person.ssn.replace(/-/g, '').slice(-4)) throw new Error('Match the capital worksheet identity to the actual return household.');
}

/** Explicit user capture of entered source values; unknowns are copied as unknowns. */
export function captureScheduleDRecords(investments: InvestmentSources): { longTermAssets: ScheduleDAssetSource[]; reportedGains: ScheduleDReportedSource[] } {
  return {
    longTermAssets: [...investments.brokerageEntries.filter(form => started(form) || form.transactions.some(started)).flatMap((form, formIndex) =>
      form.transactions.filter(started).flatMap((transaction, transactionIndex) => transaction.holdingPeriod !== 'long' ? [] : [{
        sourceId: `form1099B:${formIndex}:transaction:${transactionIndex}`, sourceTaxYear: form.sourceTaxYear, sourceReference: form.sourceId,
        accountHolder: form.accountHolder, payerName: form.broker, description: transaction.description, dateAcquired: transaction.dateAcquired,
        dateSold: transaction.dateSold, proceeds: transaction.proceeds, costBasis: transaction.costBasis, adjustments: transaction.adjustments,
        washSale: transaction.washSale, washSaleDisallowed: transaction.washSaleDisallowed, character: transaction.specialGainCharacter,
      }])), ...(investments.digitalAssetEntries ?? []).filter(isStartedDigitalAsset).flatMap((form, formIndex) =>
      (form.transactions ?? []).flatMap((transaction, transactionIndex) => transaction.holdingPeriod !== 'long' ? [] : [{
        sourceId: `form1099DA:${formIndex}:transaction:${transactionIndex}`, sourceTaxYear: form.taxYear,
        sourceReference: form.sourceId?.trim() && transaction.sourceId?.trim() ? JSON.stringify([form.sourceId.trim(), transaction.sourceId.trim()]) : undefined,
        accountHolder: form.accountHolder, payerName: form.brokerName,
        description: transaction.digitalAssetName ? `${transaction.digitalAssetName.trim()}${transaction.ticker?.trim() ? ` (${transaction.ticker.trim()})` : ''}` : undefined,
        dateAcquired: transaction.dateAcquired, dateSold: transaction.dateSold, proceeds: transaction.proceeds, costBasis: transaction.costBasis,
        adjustments: transaction.adjustments, washSale: transaction.washSale, washSaleDisallowed: transaction.washSaleDisallowed,
        character: transaction.capitalAssetConfirmed === true && transaction.nftOrCollectible === false && transaction.ordinaryIncome === false ? 'ordinary' : undefined,
      }]))],
    reportedGains: investments.dividendEntries.filter(started).map((form, index) => ({ sourceId: `form1099Div:${index}`,
      accountHolder: form.accountHolder, payerName: form.payer, netLongTermCapitalGain: form.capitalGainDistributions,
      collectiblesGain: form.collectiblesGain, unrecapturedSection1250Gain: form.section1250Gain, section1202Gain: form.section1202Gain })),
  };
}
function needsWorksheet(investments: InvestmentSources) {
  return investments.brokerageEntries.some(form => form.transactions.some(row => row.holdingPeriod === 'long' && ['collectible', 'qsbs'].includes(row.specialGainCharacter ?? '')))
    || investments.dividendEntries.some(form => [form.collectiblesGain, form.section1250Gain, form.section1202Gain].some(value => value?.trim() && !parseGuidedCurrency(value).isZero()))
    || investments.childElections?.some(child => child.specialCapitalDistributionPresent === true);
}
function sameAmount(left: string | undefined, right: string | undefined, label: string) {
  if (!parseGuidedCurrency(amount(left, label)).eq(amount(right, label))) throw new Error(`The actual capital ${label} changed; reconcile the original source worksheet.`);
}

export function buildGuidedScheduleDInputs(investments: InvestmentSources | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): {
  scheduleDSpecialGainSources?: TaxYearInput['scheduleDSpecialGainSources']; priorYear?: Pick<NonNullable<TaxYearInput['priorYear']>, 'shortTermCapitalLoss' | 'longTermCapitalLoss'>;
} {
  if (!investments) return {};
  const data = investments.scheduleDSources;
  if (!data) { if (needsWorksheet(investments)) throw new Error('Complete the actual Schedule D special-gain source worksheet before calculating these gains.'); return {}; }
  if ((taxYear !== 2025 && taxYear !== 2026) || sourceYear(data.sourceTaxYear) !== taxYear) throw new Error('Match the actual capital worksheet year to the return.');
  const common = (row: Source) => ({ sourceId: actual(row.sourceId, 'original capital source link'), sourceTaxYear: sourceYear(row.sourceTaxYear),
    sourceReference: actual(row.sourceReference, 'original capital source reference'), accountHolder: row.accountHolder, payerName: actual(row.payerName, 'original payer name') });
  const parsed = ScheduleDSpecialGainSourcesSchema.safeParse({ taxYear, sourceReference: actual(data.sourceReference, 'capital worksheet reference'),
    sourceFactsConfirmed: data.sourceFactsConfirmed, allSourcesIncluded: data.allSourcesIncluded, primary: data.primary, spouse: data.spouse,
    priorShortTermCapitalLoss: amount(data.priorShortTermCapitalLoss, 'prior short-term capital loss'), priorLongTermCapitalLoss: amount(data.priorLongTermCapitalLoss, 'prior long-term capital loss'),
    section1231Lookback: amount(data.section1231Lookback, 'section1231 lookback'), amtBasisAndCarryoversSameAsRegularConfirmed: data.amtBasisAndCarryoversSameAsRegularConfirmed,
    form2439Present: data.form2439Present, partnershipInterestDispositionPresent: data.partnershipInterestDispositionPresent, other1250DispositionPresent: data.other1250DispositionPresent,
    longTermAssets: (data.longTermAssets ?? []).map(row => ({ ...common(row), description: row.description, dateAcquired: row.dateAcquired, dateSold: row.dateSold,
      proceeds: amount(row.proceeds, 'original proceeds'), costBasis: amount(row.costBasis, 'original cost basis'), adjustments: amount(row.adjustments, 'original adjustments'),
      washSale: row.washSale, washSaleDisallowed: amount(row.washSaleDisallowed, 'original disallowed wash loss'), character: row.character })),
    reportedGains: (data.reportedGains ?? []).map(row => ({ ...common(row), netLongTermCapitalGain: amount(row.netLongTermCapitalGain, 'reported capital total'),
      collectiblesGain: amount(row.collectiblesGain, 'reported collectibles'), unrecapturedSection1250Gain: amount(row.unrecapturedSection1250Gain, 'reported section1250 gain'), section1202Gain: amount(row.section1202Gain, 'reported section1202 gain') })),
  });
  if (!parsed.success) throw new Error('Complete the actual capital source identities, classifications and separate review answers; missing facts remain unknown.');
  const facts = parsed.data;
  const middleInitial = personal?.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  identity(facts.primary, personal ? { ...personal, firstName: [personal.firstName?.trim(), middleInitial].filter(Boolean).join(' ') } : undefined);
  if (filingStatus === 'mfj') identity(facts.spouse, personal?.spouse);
  else if (facts.spouse) throw new Error('A spouse capital worksheet identity requires the actual joint return.');
  if (parseGuidedCurrency(facts.priorShortTermCapitalLoss).gt(0) || parseGuidedCurrency(facts.priorLongTermCapitalLoss).gt(0)) throw new Error('Enter capital loss carryovers as zero or negative actual amounts.');
  if (!parseGuidedCurrency(facts.section1231Lookback).isZero() || facts.form2439Present || facts.partnershipInterestDispositionPresent || facts.other1250DispositionPresent) throw new Error('These additional capital/property source methods need their separate source worksheets; keep the actual answers saved.');
  if (!facts.amtBasisAndCarryoversSameAsRegularConfirmed) throw new Error('Different AMT basis or carryovers require their actual separate AMT source worksheet.');
  const expected = captureScheduleDRecords(investments);
  for (const key of ['longTermAssets', 'reportedGains'] as const) {
    const rows = facts[key], originals = expected[key];
    if (rows.length !== originals.length || new Set(rows.map(row => row.sourceId)).size !== rows.length) throw new Error('Include each original capital source exactly once, without duplicates or missing records.');
    for (const row of rows) {
      const original = originals.find(source => source.sourceId === row.sourceId);
      if (!original || row.sourceTaxYear !== taxYear || row.accountHolder !== original.accountHolder || normalized(row.payerName) !== normalized(original.payerName)) throw new Error('The capital source identity, original year or owner is stale or conflicting.');
      if (row.accountHolder === 'spouse' && (filingStatus !== 'mfj' || !personal?.spouse)) throw new Error('The capital source owner requires the actual joint spouse.');
      if (key === 'longTermAssets') {
        const asset = row as NonNullable<TaxYearInput['scheduleDSpecialGainSources']>['longTermAssets'][number], source = original as ScheduleDAssetSource;
        if (source.sourceTaxYear && sourceYear(source.sourceTaxYear) !== asset.sourceTaxYear) throw new Error('The original brokerage tax year conflicts with this capital source.');
        if (source.sourceReference?.trim() && source.sourceReference.trim() !== asset.sourceReference) throw new Error('The original brokerage statement identity changed; reconcile its actual source reference.');
        for (const field of ['description', 'dateAcquired', 'dateSold', 'washSale', 'character'] as const) if (asset[field] !== source[field]) throw new Error('The original asset dates or classification changed; reconcile the source worksheet.');
        for (const field of ['proceeds', 'costBasis', 'adjustments', 'washSaleDisallowed'] as const) sameAmount(asset[field], source[field], field);
      } else {
        const distribution = row as NonNullable<TaxYearInput['scheduleDSpecialGainSources']>['reportedGains'][number], source = original as ScheduleDReportedSource;
        for (const field of ['netLongTermCapitalGain', 'collectiblesGain', 'unrecapturedSection1250Gain', 'section1202Gain'] as const) sameAmount(distribution[field], source[field], field);
      }
    }
  }
  return { scheduleDSpecialGainSources: facts, priorYear: { shortTermCapitalLoss: facts.priorShortTermCapitalLoss, longTermCapitalLoss: facts.priorLongTermCapitalLoss } };
}
export function scheduleDSourceFactErrors(investments: InvestmentSources | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  try { buildGuidedScheduleDInputs(investments, taxYear, filingStatus, personal); return {}; }
  catch (error) { return { scheduleDSources: error instanceof Error ? error.message : 'Complete the actual capital source worksheets.' }; }
}
export function updateScheduleDSources(data: ScheduleDSourceData, patch: Partial<ScheduleDSourceData>): ScheduleDSourceData {
  const next = { ...data, ...patch };
  return guidedSourceValuesChanged(data, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
