import { QbiLossSourcesSchema, type QbiLossSources } from '@/models/qbi-loss-sources';
import type { QbiLossHistorySource } from '@/engine/forms/qbi-loss-character';

/** Form controls preserve missing booleans and years without numeric defaults. */
export type QbiSourceEntry<T> = T extends boolean ? boolean | null : T extends number ? string
  : T extends string ? T | '' : T extends (infer U)[] ? QbiSourceEntry<U>[]
  : T extends object ? { [K in keyof T]?: QbiSourceEntry<T[K]> } : T;
type Activity = NonNullable<QbiLossSources['activities']>[number];
export type K1ActivityData = QbiSourceEntry<Omit<Activity, 'k1SourceId'>> & {
  allOtherAmountsZeroConfirmed?: boolean | null;
  /** Only for a separately linked and verified charitable attachment; never reinterprets the all-zero answer. */
  allOtherNonCharitableAmountsZeroConfirmed?: boolean | null;
  domesticNonPtpConfirmed?: boolean | null;
  noScorpDebtBasisOrElectionConfirmed?: boolean | null;
  passiveHistory?: QbiSourceEntry<QbiLossHistorySource>;
};
export type K1EblHistoryData = QbiSourceEntry<NonNullable<QbiLossSources['excessBusinessLossHistories']>[number]>;
export type K1LossSourcesData = QbiSourceEntry<Omit<QbiLossSources, 'activities'>> & { activities?: K1ActivityData[] };
const years = new Set(['sourceTaxYear', 'taxYear', 'lossTaxYear', 'adjustedThroughTaxYear']);
const amounts = new Set(['ordinaryIncome', 'section199AQBI', 'section199AW2Wages', 'section199AUBIA', 'selfEmploymentEarnings',
  'selfEmploymentNetEarningsAfterAdjustments', 'beginningBasis', 'priorSuspendedLoss', 'adjustedBasisAtEffectiveDate',
  'priorYearAmountAtRisk', 'currentYearIncreases', 'currentYearDecreases', 'priorPassiveLoss', 'amount', 'originalLoss',
  'qualifiedOriginalLoss', 'remainingLoss', 'qualifiedRemainingLoss', 'originalQualifiedLoss', 'qualifiedOpeningCarryforward',
  'openingCarryforward', 'nolUsed', 'attributeReduction', 'qualifiedNolAbsorption', 'qualifiedAttributeReduction',
  'otherBusinessIncome', 'otherBusinessDeductions']);
export function qbiSourceValues(value: unknown, key = ''): unknown {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(row => qbiSourceValues(row));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, qbiSourceValues(item, name)]));
  if (typeof value === 'string') {
    const text = value.trim();
    if (years.has(key)) {
      if (!/^\d{4}$/.test(text)) throw new Error('Enter each actual source or history tax year.');
      return Number(text);
    }
    if (amounts.has(key)) {
      if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error(`Enter an actual finite ${key} source amount, including zero when known.`);
      const amount = text.replaceAll(',', '');
      if (!/^-?\d+(\.\d+)?$/.test(amount)) throw new Error(`Enter an actual finite ${key} source amount, including zero when known.`);
      return amount;
    }
    return text || undefined;
  }
  return value;
}
export function parseGuidedQbiLossPacket(data: K1LossSourcesData | undefined): QbiLossSources | undefined {
  if (!data) return undefined;
  const values = qbiSourceValues(data) as Record<string, unknown>;
  if (Array.isArray(values.activities)) values.activities = values.activities.map((row, index) => ({ ...row, k1SourceId: `scheduleK1:${index}` }));
  return QbiLossSourcesSchema.parse(values);
}
