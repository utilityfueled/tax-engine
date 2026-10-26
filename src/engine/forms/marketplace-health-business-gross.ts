/** Original partnership gross sources for health attribution.
 * Spec: spec/federal/marketplace-health-business-gross-sources.yaml. */
import Decimal from 'decimal.js';
import type { ScheduleK1, TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';

type SourceInput = Pick<TaxYearInput, 'taxpayer' | 'form7206' | 'scheduleK1'>;
const name = (value: string | undefined) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
function amount(value: string | undefined, label: string) {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`Pub974 actual partnership gross source requires ${label}.`);
  return d(value);
}
const otherActivityFields = ['netRentalIncome', 'otherNetRentalIncome', 'guaranteedPayments', 'interestIncome', 'ordinaryDividends',
  'qualifiedDividends', 'royalties', 'netShortTermCapitalGain', 'netLongTermCapitalGain', 'unrecapturedSection1250Gain',
  'collectiblesGain', 'section1231Gain', 'otherIncome', 'section199AQualifiedReitDividends', 'section199AQualifiedPTPIncome'] as const satisfies readonly (keyof ScheduleK1)[];

export function readMarketplacePartnershipGrossIncome(input: SourceInput): { sourceId: string; amount: Decimal }[] {
  const facts = input.form7206?.partnershipGrossIncomeSources;
  if (!facts) return [];
  const year = input.taxpayer.taxYear;
  if (facts.sourceTaxYear !== year || !facts.sourceReference?.trim() || facts.sourceFactsConfirmed !== true || !Array.isArray(facts.statements)) {
    throw new Error('Confirm actual partnership gross-income source year, reference and complete statements.');
  }
  const used = new Set<string>();
  return facts.statements.map(row => {
    const index = /^scheduleK1:(0|[1-9]\d*)$/.exec(row.businessSourceId ?? '')?.[1];
    const original = index === undefined ? undefined : input.scheduleK1[Number(index)];
    if (!original || original.entityType !== 'partnership' || !row.businessSourceId || used.has(row.businessSourceId)
      || !row.accountHolder || original.accountHolder !== row.accountHolder
      || (row.accountHolder === 'spouse' && (input.taxpayer.filingStatus !== 'married_filing_jointly' || !input.taxpayer.spouse))) {
      throw new Error('Pub974 partnership gross statement requires a unique original K-1 source and actual owner.');
    }
    used.add(row.businessSourceId);
    const snapshot = row.originalK1;
    if (original.taxYear !== year || !snapshot || snapshot.taxYear !== year || snapshot.accountHolder !== original.accountHolder
      || !name(snapshot.partnershipName) || name(snapshot.partnershipName) !== name(original.partnershipName)
      || !/^\d{9}$/.test((snapshot.partnershipEIN ?? '').replaceAll('-', ''))
      || snapshot.partnershipEIN?.replaceAll('-', '') !== original.partnershipEIN.replaceAll('-', '')
      || snapshot.selfEmploymentIncomeType !== original.selfEmploymentIncomeType || original.selfEmploymentIncomeType === undefined
      || original.selfEmploymentFactsConfirmed !== true) throw new Error('Pub974 partnership gross statement must match original year, identity and Box14 classification.');
    for (const key of ['ordinaryIncome', 'selfEmploymentEarnings'] as const) {
      if (!amount(snapshot[key], `original ${key}`).eq(amount(original[key], key))) throw new Error('Pub974 partnership gross snapshot does not reconcile its original amounts.');
    }
    if (!row.sourceReference?.trim() || row.sourceFactsConfirmed !== true || row.ordinaryActivityOnlyConfirmed !== true
      || row.allGrossIncomeIncludedConfirmed !== true || original.isPubliclyTradedPartnership || original.isForeignPartnership
      || otherActivityFields.some(key => !d(original[key]).isFinite() || !d(original[key]).isZero())) {
      throw new Error('Pub974 partnership gross source requires the complete ordinary domestic activity; other income classes need their separate source attribution.');
    }
    const gross = amount(row.grossIncome, 'actual gross income');
    if (gross.lt(0) || gross.lt(Decimal.max(0, d(original.ordinaryIncome), d(original.selfEmploymentEarnings)))) {
      throw new Error('Pub974 actual partnership gross income cannot be less than its original ordinary or Box14 net income.');
    }
    return { sourceId: row.businessSourceId, amount: gross };
  });
}
