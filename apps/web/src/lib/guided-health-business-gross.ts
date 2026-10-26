import type { Form7206Input } from '@/models/inputs';
import { parseGuidedCurrency } from './guided-currency';

type Owner = '' | 'primary' | 'spouse';
export interface PartnershipGrossOriginalData {
  taxYear: string; partnershipName: string; partnershipEIN: string; accountHolder: Owner;
  ordinaryIncome: string; selfEmploymentEarnings: string; selfEmploymentIncomeType: '' | 'farm' | 'nonfarm';
}
export interface PartnershipHealthGrossStatementData {
  businessSourceId: string; accountHolder: Owner; sourceReference: string; sourceFactsConfirmed: boolean | null;
  originalK1?: PartnershipGrossOriginalData; grossIncome: string;
  ordinaryActivityOnlyConfirmed: boolean | null; allGrossIncomeIncludedConfirmed: boolean | null;
}
export interface PartnershipHealthGrossData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null;
  statements: PartnershipHealthGrossStatementData[];
}
type Facts = NonNullable<Form7206Input['partnershipGrossIncomeSources']>;
function amount(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter actual ${label}, including an explicit zero if applicable.`);
  const parsed = parseGuidedCurrency(value);
  if (!parsed.isFinite()) throw new Error(`Enter finite actual ${label}.`);
  return parsed.toFixed();
}
function original(data: PartnershipGrossOriginalData | undefined) {
  if (!data || !/^\d{4}$/.test(data.taxYear) || !data.partnershipName.trim() || !/^\d{9}$/.test(data.partnershipEIN.replaceAll('-', ''))
    || !['primary', 'spouse'].includes(data.accountHolder) || !['farm', 'nonfarm'].includes(data.selfEmploymentIncomeType)) {
    throw new Error('Link the gross statement to its complete actual original partnership record.');
  }
  return { taxYear: Number(data.taxYear), partnershipName: data.partnershipName.trim(), partnershipEIN: data.partnershipEIN,
    accountHolder: data.accountHolder as 'primary' | 'spouse', ordinaryIncome: amount(data.ordinaryIncome, 'original ordinary income'),
    selfEmploymentEarnings: amount(data.selfEmploymentEarnings, 'original Box14 earnings'), selfEmploymentIncomeType: data.selfEmploymentIncomeType as 'farm' | 'nonfarm' };
}
export function buildPartnershipHealthGross(data: PartnershipHealthGrossData | undefined, taxYear?: number | null): Facts | undefined {
  if (!data) return undefined;
  if (!/^\d{4}$/.test(data.sourceTaxYear) || Number(data.sourceTaxYear) !== taxYear || !data.sourceReference.trim()
    || data.sourceFactsConfirmed !== true || !Array.isArray(data.statements)) throw new Error('Confirm the actual partnership gross source year, reference and statements after editing.');
  const seen = new Set<string>();
  return { sourceTaxYear: Number(data.sourceTaxYear), sourceReference: data.sourceReference.trim(), sourceFactsConfirmed: true,
    statements: data.statements.map(row => {
      if (!/^scheduleK1:(0|[1-9]\d*)$/.test(row.businessSourceId) || seen.has(row.businessSourceId)
        || !['primary', 'spouse'].includes(row.accountHolder) || !row.sourceReference.trim() || row.sourceFactsConfirmed !== true
        || row.ordinaryActivityOnlyConfirmed !== true || row.allGrossIncomeIncludedConfirmed !== true) {
        throw new Error('Confirm each unique actual ordinary partnership gross statement and its complete income source.');
      }
      seen.add(row.businessSourceId);
      const snapshot = original(row.originalK1), gross = amount(row.grossIncome, 'partnership gross income');
      if (snapshot.taxYear !== taxYear || snapshot.accountHolder !== row.accountHolder || parseGuidedCurrency(gross).lt(0)) throw new Error('Reconcile the gross statement year, owner and nonnegative actual gross amount.');
      return { businessSourceId: row.businessSourceId, accountHolder: row.accountHolder as 'primary' | 'spouse', sourceReference: row.sourceReference.trim(), sourceFactsConfirmed: true,
        originalK1: snapshot, grossIncome: gross, ordinaryActivityOnlyConfirmed: true, allGrossIncomeIncludedConfirmed: true };
    }),
  };
}
/** Saved snapshots never silently change when the original source is edited. */
export function assertPartnershipHealthGrossOriginals(data: PartnershipHealthGrossData | undefined,
  sources: readonly { sourceId: string; accountHolder: 'primary' | 'spouse'; partnershipGrossOriginal?: PartnershipGrossOriginalData }[]): void {
  const name = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  for (const row of data?.statements ?? []) {
    const source = sources.find(item => item.sourceId === row.businessSourceId);
    const actual = original(source?.partnershipGrossOriginal), retained = original(row.originalK1);
    if (source?.accountHolder !== row.accountHolder || actual.accountHolder !== retained.accountHolder || actual.taxYear !== retained.taxYear
      || name(actual.partnershipName) !== name(retained.partnershipName) || actual.partnershipEIN.replaceAll('-', '') !== retained.partnershipEIN.replaceAll('-', '')
      || actual.ordinaryIncome !== retained.ordinaryIncome || actual.selfEmploymentEarnings !== retained.selfEmploymentEarnings
      || actual.selfEmploymentIncomeType !== retained.selfEmploymentIncomeType) throw new Error('Reconcile the retained gross statement with the changed original partnership source.');
  }
}
