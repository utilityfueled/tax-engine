import { Form1099BSchema, Form1099DivSchema, Section1202SourcesSchema, type TaxYearInput } from '@/models/inputs';
import { calculateSection1202Sources } from '@/engine/forms/section-1202-sources';
import type { BrokerageEntryData, DividendEntryData, FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { buildGuidedScheduleDInputs, type ScheduleDSourceData } from './guided-schedule-d-sources';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

export type QsbsIdentityData = { firstName?: string; lastName?: string; ssnLast4?: string };
export interface QsbsPriorReturnData { sourceTaxYear?: string; sourceReference?: string; filingStatus?: string; primary?: QsbsIdentityData; spouse?: QsbsIdentityData; eligibleGainUsed?: string }
export interface QsbsIssuerData {
  issuerId?: string; issuerName?: string; sourceReference?: string; allPriorUseAndCurrentDispositionsConfirmed?: boolean | null;
  membershipUnchangedConfirmed?: boolean | null; priorEligibleGainUsed?: string; historySourceReference?: string;
  priorReturns?: QsbsPriorReturnData[];
  eligibleGainAllocations?: Array<{ sourceId?: string; ordinaryEligibleGain?: string; empowermentEligibleGain?: string }>;
}
export interface QsbsQualificationData {
  domesticCCorporationAtIssue?: boolean | null; consideration?: string; allPredecessorAndControlledGroupAssetsIncluded?: boolean | null;
  maxGrossAssetsBeforeIssue?: string; grossAssetsImmediatelyAfterIssue?: string; cCorporationThroughoutHolding?: boolean | null;
  activeBusinessRequirementSatisfied?: boolean | null; redemptionRestrictionsSatisfied?: boolean | null; offsettingPositionPresent?: boolean | null;
}
export interface QsbsPassThroughData {
  ownerInterestAcquiredDate?: string; heldContinuouslyThroughSale?: boolean | null; unchangedOwnershipProportionConfirmed?: boolean | null;
  ownershipPercentage?: string; entityRecognizedGain?: string; entityBasisIgnoringPostIssueAdditions?: string;
  fundCapitalGainDistributions?: string; fundSection1202Gain?: string;
}
export interface QsbsLotData {
  lotId?: string; sourceId?: string; issuerId?: string; sourceReference?: string; accountHolder?: string;
  payerName?: string; securityDescription?: string; acquisitionMethod?: string; originalIssueDate?: string; effectiveAcquiredDate?: string; dateSold?: string;
  recognizedGain?: string; basisIgnoringPostIssueAdditions?: string; empowermentZoneGainThrough2018?: string; empowermentQualificationAndAttributionConfirmed?: boolean | null;
  proceeds?: string; costBasis?: string; adjustments?: string; washSale?: boolean | null; washSaleDisallowed?: string;
  qualification?: QsbsQualificationData; passThrough?: QsbsPassThroughData;
}
export interface QsbsSourceData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null; allSourcesIncluded?: boolean | null; preExclusionAmountsConfirmed?: boolean | null;
  primary?: QsbsIdentityData; spouse?: QsbsIdentityData; issuers?: QsbsIssuerData[]; lots?: QsbsLotData[];
}
type Sources = { brokerageEntries: BrokerageEntryData[]; dividendEntries: DividendEntryData[]; section1202Sources?: QsbsSourceData; scheduleDSources?: ScheduleDSourceData };
const started = (entry: object) => Object.values(entry).some(value => typeof value === 'string' && value.trim() !== '');
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const positive = (value: string | undefined) => Boolean(value?.trim() && parseGuidedCurrency(value).gt(0));
function year(value: string | undefined) { if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual original QSBS source year.'); return Number(value); }
function amount(value: string | undefined, label: string, signed = false) {
  if (!value?.trim()) throw new Error(`Enter actual ${label}, including a known zero.`);
  const result = parseGuidedCurrency(value);
  if (!result.isFinite() || (!signed && result.lt(0))) throw new Error(`Enter a finite ${signed ? '' : 'nonnegative '}actual ${label}.`);
  return result.toFixed();
}
const optionalAmount = (value: string | undefined, label: string, signed = false) => value?.trim() ? amount(value, label, signed) : undefined;

/** Explicit snapshot action copies entered originals only; qualification and issuer history stay unknown. */
export function captureQsbsLots(sources: Sources): QsbsLotData[] {
  return [
    ...sources.brokerageEntries.filter(form => started(form) || form.transactions.some(started)).flatMap((form, formIndex) => form.transactions.filter(started).flatMap((row, index) => row.specialGainCharacter !== 'qsbs' ? [] : [{
      sourceId: `form1099B:${formIndex}:transaction:${index}`, accountHolder: form.accountHolder, payerName: form.broker,
      securityDescription: row.description, effectiveAcquiredDate: row.dateAcquired, dateSold: row.dateSold,
      proceeds: row.proceeds, costBasis: row.costBasis, adjustments: row.adjustments, washSale: row.washSale, washSaleDisallowed: row.washSaleDisallowed,
    }])),
    ...sources.dividendEntries.filter(started).flatMap((form, index) => !positive(form.section1202Gain) ? [] : [{ sourceId: `form1099Div:${index}`, payerName: form.payer, accountHolder: form.accountHolder,
      passThrough: { fundCapitalGainDistributions: form.capitalGainDistributions, fundSection1202Gain: form.section1202Gain } }]),
  ];
}

export function buildGuidedQsbsSources(sources: Sources | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): TaxYearInput['section1202Sources'] {
  if (!sources) return undefined;
  const data = sources.section1202Sources;
  const originalLots = captureQsbsLots(sources);
  if (!data) { if (originalLots.length) throw new Error('Complete the actual QSBS issuer, acquisition and prior-use sources before calculating these gains.'); return undefined; }
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal || year(data.sourceTaxYear) !== taxYear) throw new Error('Match the actual QSBS source year and household to this return.');
  const capital = buildGuidedScheduleDInputs(sources, taxYear, filingStatus, personal).scheduleDSpecialGainSources;
  if (!capital) throw new Error('Complete the actual Schedule D source worksheet before binding QSBS issuer records.');
  const parsed = Section1202SourcesSchema.safeParse({ ...data, taxYear: year(data.sourceTaxYear),
    issuers: data.issuers?.map(row => {
      if (!Array.isArray(row.priorReturns)) throw new Error('Record the complete actual prior issuer history, including an explicit empty list when none.');
      return { ...row, priorEligibleGainUsed: amount(row.priorEligibleGainUsed, 'prior issuer eligible gain before exclusion'),
        priorReturns: row.priorReturns.map(prior => ({ ...prior, taxYear: year(prior.sourceTaxYear), eligibleGainUsed: amount(prior.eligibleGainUsed, 'prior eligible gain') })),
        eligibleGainAllocations: row.eligibleGainAllocations?.map(allocation => ({ ...allocation, ordinaryEligibleGain: amount(allocation.ordinaryEligibleGain, 'ordinary eligible gain allocation'), empowermentEligibleGain: amount(allocation.empowermentEligibleGain, 'empowerment eligible gain allocation') })),
      };
    }),
    lots: data.lots?.map(row => ({ ...row, recognizedGain: amount(row.recognizedGain, 'original recognized gain', true),
      basisIgnoringPostIssueAdditions: amount(row.basisIgnoringPostIssueAdditions, 'basis ignoring post-issue additions'),
      empowermentZoneGainThrough2018: amount(row.empowermentZoneGainThrough2018, 'qualifying empowerment gain through2018'),
      proceeds: optionalAmount(row.proceeds, 'original proceeds'), costBasis: optionalAmount(row.costBasis, 'original cost basis'),
      adjustments: optionalAmount(row.adjustments, 'original adjustment', true), washSaleDisallowed: optionalAmount(row.washSaleDisallowed, 'original disallowed wash loss'),
      qualification: row.qualification ? { ...row.qualification, maxGrossAssetsBeforeIssue: amount(row.qualification.maxGrossAssetsBeforeIssue, 'maximum corporate gross assets before issue'), grossAssetsImmediatelyAfterIssue: amount(row.qualification.grossAssetsImmediatelyAfterIssue, 'corporate gross assets after issue') } : undefined,
      passThrough: row.passThrough ? { ...row.passThrough, ownershipPercentage: amount(row.passThrough.ownershipPercentage, 'original ownership percentage'), entityRecognizedGain: amount(row.passThrough.entityRecognizedGain, 'entity recognized gain', true),
        entityBasisIgnoringPostIssueAdditions: amount(row.passThrough.entityBasisIgnoringPostIssueAdditions, 'entity original basis'), fundCapitalGainDistributions: amount(row.passThrough.fundCapitalGainDistributions, 'original fund Box2a'), fundSection1202Gain: amount(row.passThrough.fundSection1202Gain, 'original fund Box2c') } : undefined,
    })),
  });
  if (!parsed.success) throw new Error('Complete the original QSBS issuer, lot, household and qualification records; missing answers remain unknown.');
  const facts = parsed.data;
  const brokerIds = originalLots.filter(row => row.sourceId?.startsWith('form1099B:')).map(row => row.sourceId);
  const mappedBrokerIds = facts.lots.filter(row => row.sourceId.startsWith('form1099B:')).map(row => row.sourceId);
  if (brokerIds.length !== mappedBrokerIds.length || brokerIds.some(id => !mappedBrokerIds.includes(id ?? ''))) throw new Error('Include every actually classified QSBS brokerage lot once and reconcile its capital-source classification.');
  for (const row of facts.lots) if (row.sourceId.startsWith('form1099Div:') && [row.proceeds, row.costBasis, row.adjustments, row.washSale, row.washSaleDisallowed].some(value => value !== undefined)) throw new Error('A fund issuer lot must use its actual fund ownership records; reconcile and remove unrelated brokerage amounts.');
  const form1099B = sources.brokerageEntries.filter(form => started(form) || form.transactions.some(started)).map(form => Form1099BSchema.parse({
    broker: form.broker.trim(), accountHolder: form.accountHolder, taxYear: year(form.sourceTaxYear), sourceId: form.sourceId,
    transactions: form.transactions.filter(started).map(row => ({ ...row, description: row.description.trim(),
      proceeds: amount(row.proceeds, 'source proceeds'), costBasis: amount(row.costBasis, 'source basis'), adjustments: amount(row.adjustments, 'source adjustments', true), washSaleDisallowed: amount(row.washSaleDisallowed, 'source wash loss'),
    })),
  }));
  const form1099Div = sources.dividendEntries.filter(started).map(form => Form1099DivSchema.parse({ payer: form.payer.trim(), accountHolder: form.accountHolder,
    ordinaryDividends: amount(form.ordinaryDividends, 'original ordinary dividends'), totalCapitalGainDistributions: amount(form.capitalGainDistributions, 'original total capital distributions'), section1202Gain: amount(form.section1202Gain, 'original Section1202 gain') }));
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  calculateSection1202Sources({ section1202Sources: facts, form1099B, form1099Div,
    taxpayer: { taxYear, filingStatus: statuses[filingStatus], primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
      spouse: filingStatus === 'mfj' && personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn } : undefined } });
  return facts;
}
export function qsbsSourceFactErrors(sources: Sources | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  try { buildGuidedQsbsSources(sources, taxYear, filingStatus, personal); return {}; }
  catch (error) { return { section1202Sources: error instanceof Error ? error.message : 'Complete the actual QSBS source records.' }; }
}
export function updateQsbsSources(data: QsbsSourceData, patch: Partial<QsbsSourceData>): QsbsSourceData {
  const next = { ...data, ...patch }; return guidedSourceValuesChanged(data, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
