/** Bind original Schedule D sources before computing line 18/19. Spec: schedule-d-source-binding.yaml. */
import Decimal from 'decimal.js';
import type { CapitalTransaction, Form1099B, TaxYearInput } from '@/models/inputs.js';
import type { Form4797Result } from '../forms/form-4797.js';
import type { Section1202SourceResult } from '../forms/section-1202-sources.js';
import { calculateScheduleDSpecialGains } from './schedule-d-special-gains.js';
import { d, sum } from '@/utils/decimal.js';
import { calculateForm1099DASources } from '../forms/form-1099-da-sources.js';

type Facts = NonNullable<TaxYearInput['scheduleDSpecialGainSources']>;
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
function actualDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function reconcile(actual: string | undefined, source: string | undefined, label: string) {
  if (source === undefined || !source.trim() || !d(source).isFinite() || !d(actual).eq(source)) {
    throw new Error(`ScheduleD actual ${label} source must reconcile; missing facts remain unknown`);
  }
}
function owner(input: TaxYearInput, row: Facts['reportedGains'][number] | Facts['longTermAssets'][number], originalOwner?: string) {
  if (row.sourceTaxYear !== input.taxpayer.taxYear || !row.sourceReference.trim()) throw new Error('ScheduleD source year or original reference is missing or conflicting');
  if (row.accountHolder === 'spouse' && (input.taxpayer.filingStatus !== 'married_filing_jointly' || !input.taxpayer.spouse)) throw new Error('ScheduleD source spouse is absent from the actual joint household');
  // The new source contract can establish a previously unknown local owner; it
  // cannot replace an existing contradictory owner tag.
  if (originalOwner !== undefined && originalOwner !== row.accountHolder) throw new Error('ScheduleD original source owner is conflicting');
}
function identity(actual: TaxYearInput['taxpayer']['primary'], source: Facts['primary'] | undefined) {
  if (!source || normalized(source.firstName) !== normalized(actual.firstName) || normalized(source.lastName) !== normalized(actual.lastName)
    || source.ssnLast4 !== actual.ssn.replace(/-/g, '').slice(-4)) throw new Error('ScheduleD source household identity does not match the actual return');
}

/** The canonical calculation copy may contain DA rows, but cannot replace their originals. */
function digitalSources(input: TaxYearInput, originals?: TaxYearInput['form1099DA']) {
  const converted = (form: Form1099B) => form.transactions.some(row => row.sourceDocumentType === '1099-da') || form.sourceId?.startsWith('1099-da:') === true;
  const copies = input.form1099B.filter(converted);
  if (originals !== undefined && (input.form1099DA?.length ?? 0) > 0) throw new Error('ScheduleD original digital source collection must be supplied once');
  const sources = originals ?? input.form1099DA ?? [];
  if (copies.length && originals === undefined) throw new Error('ScheduleD converted digital rows require their actual original DA sources');
  const derived = calculateForm1099DASources({ ...input, form1099DA: sources, form1099B: input.form1099B.filter(form => !converted(form)) });
  if (!derived.sourceFactsComplete) throw new Error('ScheduleD actual digital worksheet requires complete original source facts');
  if (originals !== undefined) {
    if (copies.length !== derived.capitalForms.length) throw new Error('ScheduleD normalized digital statements are missing or duplicated');
    const byId = new Map<string | undefined, Form1099B>();
    for (const form of copies) {
      if (byId.has(form.sourceId)) throw new Error('ScheduleD duplicate normalized digital statement source');
      byId.set(form.sourceId, form);
    }
    const sameAmount = (a: string | undefined, b: string | undefined) => a === undefined || b === undefined ? a === b : d(a).isFinite() && d(b).isFinite() && d(a).eq(b);
    for (const form of derived.capitalForms) {
      const copy = byId.get(form.sourceId);
      if (!copy || ['broker', 'sourceId', 'taxYear', 'payerTin', 'accountReference', 'accountHolder', 'state'].some(key => copy[key as keyof Form1099B] !== form[key as keyof Form1099B])
        || !sameAmount(copy.federalWithheld, form.federalWithheld) || !sameAmount(copy.stateWithheld, form.stateWithheld)
        || copy.transactions.length !== form.transactions.length) throw new Error('ScheduleD normalized digital statement conflicts with its actual original source');
      form.transactions.forEach((row, index) => {
        const actual = copy.transactions[index];
        const textKeys = ['description', 'dateAcquired', 'dateSold', 'basisReportedToIRS', 'holdingPeriod', 'washSale', 'digitalAsset', 'sourceDocumentType'] as const;
        const moneyKeys = ['proceeds', 'costBasis', 'adjustments', 'washSaleDisallowed'] as const;
        if (textKeys.some(key => row[key] !== actual[key]) || moneyKeys.some(key => !sameAmount(row[key], actual[key]))) throw new Error('ScheduleD normalized digital disposition must reconcile with its actual original source');
      });
    }
  }
  return { sources, forms: derived.capitalForms, converted };
}

export function calculateScheduleDSourceBinding(input: TaxYearInput, context: {
  form4797: Form4797Result; netShortTerm: Decimal; longTermLossCarryover: Decimal;
  childCollectiblesGain: Decimal; childUnrecapturedSection1250Gain: Decimal;
  section1202?: Section1202SourceResult;
  originalDigitalAssetSources?: TaxYearInput['form1099DA'];
}) {
  const facts = input.scheduleDSpecialGainSources;
  if (!facts) return undefined;
  if (facts.taxYear !== input.taxpayer.taxYear || facts.sourceFactsConfirmed !== true || facts.allSourcesIncluded !== true || !facts.sourceReference.trim()) {
    throw new Error('ScheduleD requires complete confirmed actual source facts for the return year');
  }
  identity(input.taxpayer.primary, facts.primary);
  if (input.taxpayer.filingStatus === 'married_filing_jointly') {
    if (!input.taxpayer.spouse) throw new Error('ScheduleD actual joint household spouse is required');
    identity(input.taxpayer.spouse, facts.spouse);
  } else if (facts.spouse) throw new Error('ScheduleD source spouse requires a joint household');
  reconcile(input.priorYear?.shortTermCapitalLoss, facts.priorShortTermCapitalLoss, 'short-term carry');
  reconcile(input.priorYear?.longTermCapitalLoss, facts.priorLongTermCapitalLoss, 'long-term carry');
  if (d(facts.priorShortTermCapitalLoss).gt(0) || d(facts.priorLongTermCapitalLoss).gt(0)) throw new Error('ScheduleD actual loss carry must be zero or negative');
  reconcile(input.form4797?.nonrecapturedNetSection1231Losses, facts.section1231Lookback, 'section1231 lookback');
  if (d(facts.section1231Lookback).lt(0)) throw new Error('ScheduleD section1231 lookback must be nonnegative');
  if (facts.form2439Present || facts.partnershipInterestDispositionPresent || facts.other1250DispositionPresent
    || (input.homeSales?.length ?? 0) > 0 || (input.form4797?.propertySales.length ?? 0) > 0
    || (input.form6252?.length ?? 0) > 0 || input.form6781 || input.form4684 || (input.form8824?.length ?? 0) > 0
    || input.form2555 || input.cryptoIncome) {
    throw new Error('ScheduleD additional property, foreign, digital or other-form sources require their separate complete source method');
  }
  if (!facts.amtBasisAndCarryoversSameAsRegularConfirmed && !input.amtCapitalGains) throw new Error('ScheduleD requires actual separate AMT capital-gain sources when basis or carry differs');
  if (facts.amtBasisAndCarryoversSameAsRegularConfirmed && input.scheduleK1.some(source => !d(source.amtAdjustedGainOrLoss).isZero())) {
    throw new Error('ScheduleD same-basis confirmation conflicts with an actual AMT disposition adjustment');
  }
  const assets = new Map<string, Facts['longTermAssets'][number]>();
  for (const row of facts.longTermAssets) {
    if (assets.has(row.sourceId)) throw new Error('ScheduleD duplicate original asset source');
    assets.set(row.sourceId, row);
  }
  const digital = digitalSources(input, context.originalDigitalAssetSources);
  const bindAsset = (form: Form1099B, transaction: CapitalTransaction, id: string, originalDigitalId?: string) => {
    if (transaction.holdingPeriod !== 'long') return false;
    const row = assets.get(id);
    if (!row) throw new Error('ScheduleD every actual long-term asset requires its complete original source classification');
    assets.delete(id); owner(input, row, form.accountHolder);
    if (normalized(row.payerName) !== normalized(form.broker) || row.description !== transaction.description || row.dateAcquired !== transaction.dateAcquired || row.dateSold !== transaction.dateSold
      || row.washSale !== transaction.washSale) throw new Error('ScheduleD asset identity or original dates are stale or conflicting');
    if (!actualDate(row.dateSold) || (row.dateAcquired !== 'VARIOUS' && !actualDate(row.dateAcquired))) throw new Error('ScheduleD original acquisition and sale dates must be actual calendar dates');
    if (!row.dateSold.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error('ScheduleD asset sale year conflicts with the actual source year');
    for (const key of ['proceeds', 'costBasis', 'adjustments', 'washSaleDisallowed'] as const) reconcile(transaction[key], row[key], `asset ${key}`);
    if (originalDigitalId !== undefined && (row.sourceReference !== originalDigitalId || row.character !== 'ordinary')) throw new Error('ScheduleD original digital identity or ordinary source classification conflicts');
    const originalQsbs = context.section1202?.bindings.some(binding => binding.sourceKind === 'broker' && binding.originalSourceId === id) ?? false;
    if ((row.character === 'qsbs') !== originalQsbs) throw new Error('ScheduleD QSBS character requires matching actual issuer and acquisition sources');
    return row.character === 'collectible';
  };
  const collectibleForms = input.form1099B.map((form, formIndex) => ({ ...form, transactions: digital.converted(form) ? [] : form.transactions.filter((transaction, transactionIndex) =>
    bindAsset(form, transaction, `form1099B:${formIndex}:transaction:${transactionIndex}`)) }));
  digital.forms.forEach((form, formIndex) => form.transactions.forEach((transaction, transactionIndex) =>
    bindAsset(form, transaction, `form1099DA:${formIndex}:transaction:${transactionIndex}`,
      JSON.stringify([digital.sources[formIndex].sourceId, digital.sources[formIndex].transactions[transactionIndex].sourceId]))));
  if (assets.size > 0) throw new Error('ScheduleD original asset source is missing, duplicated or not a long-term asset');
  const reported = new Map<string, Facts['reportedGains'][number]>();
  for (const row of facts.reportedGains) {
    if (reported.has(row.sourceId)) throw new Error('ScheduleD duplicate reported gain source');
    reported.set(row.sourceId, row);
  }
  let collectibles = context.childCollectiblesGain;
  let reported1250 = context.childUnrecapturedSection1250Gain;
  let partnership1250 = d('0');
  const bind = (id: string, payer: string, original: { accountHolder?: string; netLongTermCapitalGain?: string; collectiblesGain?: string; unrecapturedSection1250Gain?: string; section1202Gain?: string }) => {
    const row = reported.get(id);
    if (!row) throw new Error('ScheduleD every reported capital source requires complete actual gain components');
    reported.delete(id); owner(input, row, original.accountHolder);
    if (normalized(row.payerName) !== normalized(payer)) throw new Error('ScheduleD reported original payer identity is conflicting');
    for (const key of ['netLongTermCapitalGain', 'collectiblesGain', 'unrecapturedSection1250Gain', 'section1202Gain'] as const) reconcile(original[key], row[key], `reported ${key}`);
    if (d(row.section1202Gain).gt(0) && !context.section1202?.bindings.some(binding => binding.sourceKind === 'fund' && binding.originalSourceId === id)) {
      throw new Error('ScheduleD section1202 QSBS requires actual issuer and acquisition exclusion history');
    }
    if (d(row.section1202Gain).lt(0) || d(row.unrecapturedSection1250Gain).lt(0)) throw new Error('ScheduleD special reported gain source must be nonnegative');
    collectibles = collectibles.plus(row.collectiblesGain);
    return row;
  };
  input.form1099Div.forEach((source, index) => {
    const row = bind(`form1099Div:${index}`, source.payer, { ...source, netLongTermCapitalGain: source.totalCapitalGainDistributions, unrecapturedSection1250Gain: source.section1250Gain });
    if (d(row.collectiblesGain).lt(0) || sum(d(row.collectiblesGain), d(row.unrecapturedSection1250Gain), d(row.section1202Gain)).gt(d(row.netLongTermCapitalGain))) throw new Error('ScheduleD DIV special gain components exceed actual total capital distributions');
    reported1250 = reported1250.plus(row.unrecapturedSection1250Gain);
  });
  input.scheduleK1.forEach((source, index) => {
    const row = bind(`scheduleK1:${index}`, source.partnershipName, source);
    reconcile(source.section1231Gain, row.section1231Gain, 'partnership section1231 gain');
    partnership1250 = partnership1250.plus(row.unrecapturedSection1250Gain);
  });
  (input.scheduleK1Form1041 ?? []).forEach((source, index) => {
    const row = bind(`scheduleK1Form1041:${index}`, source.estateTrustName, source);
    if (row.isFinalK1 !== source.isFinalK1) throw new Error('ScheduleD actual final estate statement status must reconcile');
    reconcile(source.finalYearLongTermCapitalLoss, row.finalYearLongTermCapitalLoss, 'final estate long-term loss');
    if (d(row.finalYearLongTermCapitalLoss).gt(0) || (!row.isFinalK1 && !d(row.finalYearLongTermCapitalLoss).isZero())) throw new Error('ScheduleD final estate long-term loss source is conflicting');
    reported1250 = reported1250.plus(row.unrecapturedSection1250Gain);
  });
  if (reported.size > 0) throw new Error('ScheduleD reported original gain source is missing or aliased');
  return calculateScheduleDSpecialGains({
    form8949CollectiblesGainLoss: sum(...collectibleForms.flatMap(form => form.transactions.map(transaction =>
      d(transaction.proceeds).minus(d(transaction.costBasis)).plus(d(transaction.adjustments))
        .plus(transaction.washSale ? d(transaction.washSaleDisallowed) : d('0'))))),
    section1202WorksheetComponent: context.section1202?.section1202WorksheetComponent ?? d('0'),
    otherCollectiblesGainLoss: d('0'), reportedCollectiblesGainLoss: collectibles,
    shortTermNetGainLoss: context.netShortTerm, longTermLossCarryover: context.longTermLossCarryover,
    form4797Gain: context.form4797.line7, form4797Lookback: context.form4797.line8, businessProperties: [],
    businessInstallment1250Gain: d('0'), passThrough1250Gain: partnership1250,
    partnershipSale1250Gain: d('0'), reported1250Gain: reported1250, other1250Gain: d('0'),
  });
}
