import { CharitableCarryoverSourcesSchema, type CharitableCarryoverSources } from '@/models/charitable-carryover-sources';
import { validateCharitableCarryoverSources, type CharitableSourceValidationInput } from '@/engine/forms/charitable-carryover-source-validation';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type Editable<T> = { [K in keyof T]: T[K] extends boolean | undefined ? boolean | null | undefined
  : T[K] extends number | undefined ? string | undefined : T[K] };
type OriginalVintage = NonNullable<CharitableCarryoverSources['vintages']>[number];
export type CharitableCarryoverHistoryData = Editable<NonNullable<OriginalVintage['history']>[number]>;
export type CharitableCarryoverVintageData = Editable<Omit<OriginalVintage, 'history'>> & { history?: CharitableCarryoverHistoryData[] };
export type CharitableCarryoverData = Editable<Omit<CharitableCarryoverSources, 'vintages'>> & { vintages?: CharitableCarryoverVintageData[] };
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
function year(value: string | undefined, label: string): number {
  if (!value || !/^\d{4}$/.test(value)) throw new Error(`Enter the actual ${label}.`);
  return Number(value);
}
function amount(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}, including zero when established by the source.`);
  if (parseGuidedCurrency(value).isNegative()) throw new Error(`Enter the actual nonnegative ${label}.`);
  return value.trim().replaceAll(',', '');
}

/** Validate original facts without inventing an income or deduction context. */
export function buildGuidedCharitableCarryover(data: CharitableCarryoverData | undefined, taxYear?: number | null,
  filingStatus?: FilingStatus | null, personal?: PersonalInfoData): CharitableCarryoverSources | undefined {
  if (!data) return undefined;
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal) throw new Error('Confirm the actual year, filing status and household before binding charitable history.');
  if (!Array.isArray(data.vintages)) throw new Error('Enter all actual prior contribution histories, or explicitly record none.');
  const facts = CharitableCarryoverSourcesSchema.parse({ ...data,
    sourceTaxYear: year(data.sourceTaxYear, 'charitable source tax year'), sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allCarryoversIncluded: data.allCarryoversIncluded ?? undefined, calendarYearTaxpayer: data.calendarYearTaxpayer ?? undefined,
    membershipUnchangedConfirmed: data.membershipUnchangedConfirmed ?? undefined,
    spouseName: data.spouseName?.trim() || undefined, spouseTaxpayerIdLast4: data.spouseTaxpayerIdLast4?.trim() || undefined,
    vintages: data.vintages.map(row => {
      if (!Array.isArray(row.history)) throw new Error('Enter every actual intervening year, or explicitly record no intervening years.');
      return { ...row, contributionYear: year(row.contributionYear, 'original contribution year'),
        originalExcess: amount(row.originalExcess, 'original excess'), originNolReduction: amount(row.originNolReduction, 'origin NOL reduction'),
        openingCarryforward: amount(row.openingCarryforward, 'opening carryforward'),
        adjustedThroughTaxYear: year(row.adjustedThroughTaxYear, 'history adjusted-through year'),
        allHistoryIncluded: row.allHistoryIncluded ?? undefined, ordinaryPercentageMethodConfirmed: row.ordinaryPercentageMethodConfirmed ?? undefined,
        history: row.history.map(entry => ({ ...entry, taxYear: year(entry.taxYear, 'intervening tax year'),
          treatedAsPaid: amount(entry.treatedAsPaid, 'amount treated as paid'), nolReduction: amount(entry.nolReduction, 'intervening NOL reduction') })),
      };
    }),
  });
  const middleInitial = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const input: CharitableSourceValidationInput = { charitableCarryoverSources: facts, taxpayer: {
    taxYear, filingStatus: statuses[filingStatus],
    primary: { firstName: [personal.firstName.trim(), middleInitial].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
    ...(filingStatus === 'mfj' && personal.spouse ? { spouse: {
      firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn,
    } } : {}),
  } };
  validateCharitableCarryoverSources(input);
  return facts;
}
export function charitableCarryoverFactErrors(data: CharitableCarryoverData | undefined, taxYear?: number | null,
  filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  try { buildGuidedCharitableCarryover(data, taxYear, filingStatus, personal); return {}; }
  catch (error) { return { charitableCarryoverSources: error instanceof Error ? error.message : 'Reconcile the actual charitable source history.' }; }
}
export function updateCharitableCarryoverSources(previous: CharitableCarryoverData, patch: Partial<CharitableCarryoverData>): CharitableCarryoverData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
