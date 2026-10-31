import { Form982AttributeSourcesSchema, type Form982AttributeSources } from '@/models/cod-attribute-sources';
import { parseGuidedCurrency } from './guided-currency';
import { buildGuidedCurrentMtcSources, type CurrentMtcData } from './guided-current-minimum-tax-credit';

type EditableSource<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends Array<infer U> ? EditableSource<U>[] : T extends object ? { [K in keyof T]: EditableSource<T[K]> } : T;
export type CodAttributeData = EditableSource<Form982AttributeSources>;
export type CodAttributeLedgerData = NonNullable<CodAttributeData['regular']>;
export type CodAttributeRecordData = NonNullable<CodAttributeLedgerData['records']>[number];
export type CodAttributePropertyData = NonNullable<NonNullable<NonNullable<CodAttributeLedgerData['property']>['followingYear']>['properties']>[number];
const amounts = new Set(['originalAmount', 'used', 'reduced', 'expired', 'currentYearUse', 'currentYearCarryback', 'currentYearExpired', 'adjustedBasis', 'money', 'amount']);
const years = new Set(['sourceTaxYear', 'originTaxYear', 'taxYear']);

/** Only formatting changes here; source and canonical validation own every calculation. */
export function buildGuidedCodAttributes(data: CodAttributeData | undefined): Form982AttributeSources | undefined {
  if (data === undefined) return undefined;
  const convert = (value: unknown, key = ''): unknown => {
    if (value === null || value === undefined) return undefined;
    if (key === 'sourceYearCalculation') return buildGuidedCurrentMtcSources(value as CurrentMtcData);
    if (Array.isArray(value)) return value.map(row => convert(row));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, convert(child, name)]));
    if (amounts.has(key)) {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter the actual later-attribute ${key}, including zero when shown.`);
      const result = parseGuidedCurrency(value);
      if (!result.isFinite() || result.isNegative()) throw new Error(`Enter the actual nonnegative later-attribute ${key}.`);
      return result.toFixed();
    }
    if (years.has(key)) {
      if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new Error('Enter the actual later-attribute source year.');
      return Number(value);
    }
    return value;
  };
  return Form982AttributeSourcesSchema.parse(convert(data));
}
export function invalidateGuidedCodAttributes(data: CodAttributeData): CodAttributeData {
  const clear = (value: unknown): unknown => Array.isArray(value) ? value.map(clear)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'sourceFactsConfirmed' ? null : clear(child)])) : value;
  return { ...clear(data) as CodAttributeData, sourceFactsConfirmed: null };
}
