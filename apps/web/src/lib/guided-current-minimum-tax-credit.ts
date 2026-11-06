import { CurrentMinimumTaxCreditSourcesSchema, type CurrentMinimumTaxCreditSources } from '@/models/current-minimum-tax-credit-sources';
import { ScheduleK1Schema, type ScheduleK1 } from '@/models/inputs';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type Editable<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends Array<infer U> ? Editable<U>[] : T extends object ? { [K in keyof T]: Editable<T[K]> } : T;
export type CurrentMtcData = Editable<CurrentMinimumTaxCreditSources>;
const money = new Set(['depreciationAdjustment', 'dispositionAdjustment', 'depletionAdjustment', 'otherAdjustment',
  'adjustment', 'exclusionCodeJ', 'unallowedQualifiedElectricVehicleCredit']);

/** Formatting only. Unknown inventories and nonempty additional methods survive. */
export function buildGuidedCurrentMtcSources(data: CurrentMtcData): CurrentMinimumTaxCreditSources {
  const visit = (value: unknown, key = ''): unknown => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value.map(row => visit(row));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, name)]));
    if (money.has(key)) {
      if (typeof value !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) throw new Error(`Enter the actual signed current MTC ${key}, including zero when known.`);
      const amount = parseGuidedCurrency(value); if (!amount.isFinite()) throw new Error('Enter a finite original current MTC amount.');
      return amount.toFixed();
    }
    if (key === 'sourceTaxYear') {
      if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new Error('Enter each actual current MTC source year.');
      return Number(value);
    }
    return value;
  };
  return CurrentMinimumTaxCreditSourcesSchema.parse(visit(data));
}

/** A narrow original collector. Its explicit zero facts supply the otherwise
 * absent K1 boxes; an existing packet is never overwritten or merged by guess. */
export function buildGuidedCurrentMtcOriginals(facts: CurrentMinimumTaxCreditSources | undefined, existing: ScheduleK1[] | undefined): ScheduleK1[] | undefined {
  if (!facts) return existing;
  if (existing !== undefined) throw new Error('Reconcile the existing K1 packet with the separate current MTC originals; duplicate or mixed source packets cannot be inferred.');
  if (!Array.isArray(facts.k1Statements) || !Array.isArray(facts.trustStatements) || facts.trustStatements.length) {
    throw new Error('Enter every actual current MTC K1 and the known-empty trust inventory for this standalone original route.');
  }
  return facts.k1Statements.map(row => {
    const original = row.standaloneOriginal;
    if (!original?.sourceReference?.trim() || !original.entityType || original.allOtherAmountsZeroConfirmed !== true
      || original.domesticContinuingNonPtpConfirmed !== true || original.isPassiveActivity !== false) {
      throw new Error('Confirm each actual standalone K1 original type, nonpassive activity and zero other amounts.');
    }
    return ScheduleK1Schema.parse({ taxYear: row.sourceTaxYear, partnershipName: row.entityName, partnershipEIN: row.entityEin,
      entityType: original.entityType, accountHolder: row.accountHolder, ordinaryIncome: '0', isPassiveActivity: false,
      isPubliclyTradedPartnership: false, isForeignPartnership: false,
      amtDepreciationAdjustment: row.depreciationAdjustment, amtAdjustedGainOrLoss: row.dispositionAdjustment,
      amtDepletion: row.depletionAdjustment, amtOtherItems: row.otherAdjustment });
  });
}

export function updateGuidedCurrentMtcSources(previous: CurrentMtcData, patch: Partial<CurrentMtcData>): CurrentMtcData {
  const next = { ...previous, ...patch };
  if (!guidedSourceValuesChanged(previous, next)) return next;
  const clear = (value: unknown): unknown => Array.isArray(value) ? value.map(clear)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'sourceFactsConfirmed' ? null : clear(child)])) : value;
  return { ...clear(next) as CurrentMtcData, sourceFactsConfirmed: null };
}
