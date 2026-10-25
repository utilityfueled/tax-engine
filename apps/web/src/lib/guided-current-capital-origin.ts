import { Form172OriginSourcesSchema, Form1099BSchema, Form1099DivSchema, type TaxYearInput } from '@/models/inputs';
import { calculateForm172CapitalSources } from '@/engine/forms/form-172-capital-sources';
import type { GuidedFlowState } from './guided-interview-flow';
import type { InvestmentData } from './guided-investment-facts';
import { parseGuidedCurrency } from './guided-currency';
import { buildGuidedScheduleDInputs } from './guided-schedule-d-sources';
import { buildGuidedQsbsSources } from './guided-qsbs-sources';
import { isStartedDigitalAsset } from './guided-digital-asset-facts';

type CapitalSource = NonNullable<NonNullable<TaxYearInput['form172']>['capitalSources']>;
type Guided<T> = T extends number ? string : T extends boolean ? boolean | null : T extends Array<infer V> ? Guided<V>[] : T extends object ? { [K in keyof T]: Guided<T[K]> } : T;
export type CurrentCapitalSourceData = Guided<CapitalSource>;
export type CurrentCapitalTransactionData = NonNullable<CurrentCapitalSourceData['transactions']>[number];
export type CurrentCapitalDistributionData = NonNullable<CurrentCapitalSourceData['distributions']>[number];
const started = (row: object) => Object.values(row).some(value => typeof value === 'string' && value.trim() !== '');
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
function year(value: string | undefined): number { if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual capital source tax year.'); return Number(value); }
function amount(value: string | undefined): string {
  if (!value?.trim() || !parseGuidedCurrency(value).isFinite()) throw new Error('Enter the actual finite capital source amount, including known zero.');
  return value.trim().replace(/,/g, '');
}
function known(value: boolean | null | undefined): boolean { if (typeof value !== 'boolean') throw new Error('Confirm each actual original capital classification; an unanswered box stays unknown.'); return value; }

/** A user-requested snapshot copies evidence, never its missing qualifications. */
export function captureCurrentCapitalRecords(investments: InvestmentData | undefined): { transactions: CurrentCapitalTransactionData[]; distributions: CurrentCapitalDistributionData[] } {
  return {
    transactions: (investments?.brokerageEntries ?? []).filter(form => started(form) || form.transactions.some(started)).flatMap((form, formIndex) => form.transactions.filter(started).map((row, index) => ({
      sourceId: `form1099B:${formIndex}:transaction:${index}`, sourceTaxYear: form.sourceTaxYear, sourceReference: form.sourceId,
      statementSourceId: form.sourceId, payerName: form.broker, accountHolder: form.accountHolder === 'primary' || form.accountHolder === 'spouse' ? form.accountHolder : undefined,
      accountReference: form.accountReference,
      capitalCharacter: row.specialGainCharacter === 'ordinary' ? 'ordinary_investment' : row.specialGainCharacter === 'qsbs' ? 'section1202' : row.specialGainCharacter === 'collectible' ? 'collectible' : undefined,
      transaction: { description: row.description.trim(), dateAcquired: row.dateAcquired, dateSold: row.dateSold, proceeds: row.proceeds, costBasis: row.costBasis, adjustments: row.adjustments,
        holdingPeriod: row.holdingPeriod || undefined, basisReportedToIRS: row.basisReportedToIRS, washSale: row.washSale, washSaleDisallowed: row.washSaleDisallowed, digitalAsset: row.digitalAsset },
    }))),
    distributions: (investments?.dividendEntries ?? []).filter(started).map((form, index) => ({ sourceId: `form1099Div:${index}`, payerName: form.payer, accountReference: form.accountReference,
      accountHolder: form.accountHolder === 'primary' || form.accountHolder === 'spouse' ? form.accountHolder : undefined,
      totalCapitalGainDistributions: form.capitalGainDistributions, section1250Gain: form.section1250Gain, section1202Gain: form.section1202Gain, collectiblesGain: form.collectiblesGain })),
  };
}

export function buildCurrentCapitalSources(data: CurrentCapitalSourceData | undefined, state: GuidedFlowState): { capitalSources?: CapitalSource; priorYear?: Pick<NonNullable<TaxYearInput['priorYear']>, 'shortTermCapitalLoss' | 'longTermCapitalLoss'> } {
  const investments = state.sectionData['income-investments'], originals = captureCurrentCapitalRecords(investments);
  const schedule = investments?.scheduleDSources;
  const hasCapital = originals.transactions.length > 0 || originals.distributions.some(row => [row.totalCapitalGainDistributions, row.section1250Gain, row.section1202Gain, row.collectiblesGain].some(value => value?.trim() && !parseGuidedCurrency(value).isZero()))
    || [schedule?.priorShortTermCapitalLoss, schedule?.priorLongTermCapitalLoss].some(value => value?.trim() && !parseGuidedCurrency(value).isZero());
  if (investments?.digitalAssetEntries?.some(isStartedDigitalAsset)) throw new Error('Digital-asset sources need their separate current loss origin method; the actual entered records stay saved.');
  if (!data) { if (hasCapital) throw new Error('Complete the actual current capital-source packet before calculating the current loss origin.'); return {}; }
  const { taxYear, segmentation } = state, personal = state.sectionData['personal-info'];
  if ((taxYear !== 2025 && taxYear !== 2026) || !segmentation.filingStatus || !personal) throw new Error('Complete the actual current capital return year and household.');
  if (!Array.isArray(data.transactions) || !Array.isArray(data.distributions)) throw new Error('Record every actual capital source, including explicit empty lists when there are none.');
  const prior = data.priorCapitalLosses;
  if (!prior || !data.alternativeTax) throw new Error('Complete the actual filed capital carry and independent AMT comparison.');
  const parsed = Form172OriginSourcesSchema.shape.capitalSources.unwrap().parse({ ...data, sourceTaxYear: year(data.sourceTaxYear),
    transactions: data.transactions.map(row => ({ ...row, sourceTaxYear: year(row.sourceTaxYear), transaction: row.transaction ? { ...row.transaction,
      proceeds: amount(row.transaction.proceeds), costBasis: amount(row.transaction.costBasis), adjustments: amount(row.transaction.adjustments), washSaleDisallowed: amount(row.transaction.washSaleDisallowed),
      basisReportedToIRS: known(row.transaction.basisReportedToIRS), washSale: known(row.transaction.washSale), digitalAsset: known(row.transaction.digitalAsset) } : undefined })),
    distributions: data.distributions.map(row => ({ ...row, sourceTaxYear: year(row.sourceTaxYear), totalCapitalGainDistributions: amount(row.totalCapitalGainDistributions), section1250Gain: amount(row.section1250Gain), section1202Gain: amount(row.section1202Gain), collectiblesGain: amount(row.collectiblesGain) })),
    priorCapitalLosses: { ...prior, sourceTaxYear: year(prior.sourceTaxYear), shortTermCapitalLoss: amount(prior.shortTermCapitalLoss), longTermCapitalLoss: amount(prior.longTermCapitalLoss) },
  });
  for (const row of parsed.transactions ?? []) if (row.capitalCharacter !== originals.transactions.find(original => original.sourceId === row.sourceId)?.capitalCharacter) throw new Error('The actual original capital character changed; reconcile its source snapshot.');
  const priorYear = { shortTermCapitalLoss: amount(prior.shortTermCapitalLoss), longTermCapitalLoss: amount(prior.longTermCapitalLoss) };
  const scheduleInputs = buildGuidedScheduleDInputs(investments, taxYear, segmentation.filingStatus, personal);
  for (const key of ['shortTermCapitalLoss', 'longTermCapitalLoss'] as const) if (scheduleInputs.priorYear && !parseGuidedCurrency(priorYear[key]).eq(amount(scheduleInputs.priorYear[key]))) throw new Error('Reconcile the actual prior capital carry with the separate Schedule D source worksheet.');
  const form1099B = (investments?.brokerageEntries ?? []).filter(form => started(form) || form.transactions.some(started)).map(form => Form1099BSchema.parse({ broker: form.broker.trim(), accountHolder: form.accountHolder,
    taxYear: year(form.sourceTaxYear), sourceId: form.sourceId, accountReference: form.accountReference,
    transactions: form.transactions.filter(started).map(row => ({ ...row, description: row.description.trim(), sourceDocumentType: '1099-b',
      proceeds: amount(row.proceeds), costBasis: amount(row.costBasis), adjustments: amount(row.adjustments), washSaleDisallowed: amount(row.washSaleDisallowed),
      basisReportedToIRS: known(row.basisReportedToIRS), washSale: known(row.washSale), digitalAsset: known(row.digitalAsset) })),
  }));
  const form1099Div = (investments?.dividendEntries ?? []).filter(started).map(form => Form1099DivSchema.parse({ payer: form.payer.trim(), accountHolder: form.accountHolder, accountReference: form.accountReference,
    ordinaryDividends: amount(form.ordinaryDividends), qualifiedDividends: amount(form.qualifiedDividends), totalCapitalGainDistributions: amount(form.capitalGainDistributions), section1250Gain: amount(form.section1250Gain), section1202Gain: amount(form.section1202Gain), collectiblesGain: amount(form.collectiblesGain) }));
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  calculateForm172CapitalSources({ form172: { capitalSources: parsed }, form1099B, form1099Div, form1099DA: [], priorYear,
    section1202Sources: buildGuidedQsbsSources(investments, taxYear, segmentation.filingStatus, personal), scheduleDSpecialGainSources: scheduleInputs.scheduleDSpecialGainSources,
    taxpayer: { taxYear, filingStatus: statuses[segmentation.filingStatus], primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
      spouse: segmentation.filingStatus === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn } : undefined } });
  return { capitalSources: parsed, priorYear };
}

export function invalidateCurrentCapitalSources(data: CurrentCapitalSourceData): CurrentCapitalSourceData {
  return { ...data, sourceFactsConfirmed: null, ...(data.priorCapitalLosses ? { priorCapitalLosses: { ...data.priorCapitalLosses, sourceFactsConfirmed: null } } : {}),
    ...(data.alternativeTax ? { alternativeTax: { ...data.alternativeTax, sourceFactsConfirmed: null } } : {}) };
}
