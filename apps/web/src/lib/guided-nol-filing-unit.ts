import { FilingUnitHistorySchema, type FilingUnitHistory } from '@/models/filing-unit-sources';
import { NolFilingUnitOriginSchema, NolFilingUnitUseSchema, type NolFilingUnitOrigin, type NolFilingUnitUse } from '@/models/net-operating-loss-filing-unit';
import { parseGuidedCurrency } from './guided-currency';

type Editable<T> = { [K in keyof T]: NonNullable<T[K]> extends boolean ? boolean | null | undefined
  : NonNullable<T[K]> extends number ? string | undefined
  : NonNullable<T[K]> extends Array<infer Item> ? Editable<Item>[] | undefined
  : NonNullable<T[K]> extends object ? Editable<NonNullable<T[K]>> | undefined : T[K] };
export type NolFilingUnitHistoryData = Editable<FilingUnitHistory>;
export type NolFilingUnitOriginData = Editable<NolFilingUnitOrigin>;
export type NolFilingUnitUseData = Editable<NolFilingUnitUse>;
function year(value: string | undefined, label: string): number {
  if (!value || !/^\d{4}$/.test(value)) throw new Error(`Enter the actual ${label}.`);
  return Number(value);
}
function filed(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual filed ${label}, including established zero.`);
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger()) throw new Error(`The actual ${label} must be a nonnegative filed whole-dollar amount.`);
  return amount.toFixed(0);
}
export function buildNolFilingUnitTimeline(data?: NolFilingUnitHistoryData): FilingUnitHistory | undefined {
  if (!data) return undefined;
  return FilingUnitHistorySchema.parse({ ...data, sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allRelevantReturnsIncluded: data.allRelevantReturnsIncluded ?? undefined, allRelevantCarryoversIncluded: data.allRelevantCarryoversIncluded ?? undefined,
    persons: data.persons?.map(person => ({ ...person, deathYear: person.deathYear?.trim() ? year(person.deathYear, 'death year') : undefined })),
    returns: data.returns?.map(unit => ({ ...unit, taxYear: year(unit.taxYear, 'filed return year'),
      spousePersonId: unit.spousePersonId?.trim() || undefined, finalReturnForDeceased: unit.finalReturnForDeceased ?? undefined })),
  });
}
export function buildNolFilingUnitOrigin(data?: NolFilingUnitOriginData): NolFilingUnitOrigin | undefined {
  if (!data) return undefined;
  return NolFilingUnitOriginSchema.parse({ ...data, originalReturnLoss: filed(data.originalReturnLoss, 'original return NOL'),
    separateComputations: data.separateComputations?.map(row => ({ ...row, netOperatingLoss: filed(row.netOperatingLoss, 'separate original NOL') })),
  });
}
export function buildNolFilingUnitUses(data?: NolFilingUnitUseData[]): NolFilingUnitUse[] | undefined {
  return data?.map(use => NolFilingUnitUseSchema.parse({ ...use, sourceFactsConfirmed: use.sourceFactsConfirmed ?? undefined,
    allOriginOwnersIncluded: use.allOriginOwnersIncluded ?? undefined, allOtherNolSourcesIncluded: use.allOtherNolSourcesIncluded ?? undefined,
    claimedDeduction: filed(use.claimedDeduction, 'historical return deduction'), modifiedAbsorption: filed(use.modifiedAbsorption, 'historical return modified absorption'),
    attributeReduction: filed(use.attributeReduction, 'historical return attribute reduction'),
    owners: use.owners?.map(owner => ({ ...owner, claimedDeduction: filed(owner.claimedDeduction, 'historical owner deduction'),
      modifiedAbsorption: filed(owner.modifiedAbsorption, 'historical owner modified absorption'), attributeReduction: filed(owner.attributeReduction, 'historical owner attribute reduction') })),
  }));
}
