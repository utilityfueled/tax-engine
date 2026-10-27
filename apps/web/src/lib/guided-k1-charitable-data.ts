import { ScheduleK1Schema, type ScheduleK1 } from '@/models/inputs';
import { K1CharitableReturnSourcesSchema, type K1CharitableReturnSources } from '@/models/k1-charitable-return-sources';
import { d } from '@/utils/decimal';
import type { QbiSourceEntry } from './guided-qbi-loss-data';
import { normalizeGuidedK1CashDistribution } from './guided-k1-cash-distribution';

type Statement = NonNullable<K1CharitableReturnSources['statements']>[number];
export type K1CharitableStatementData = QbiSourceEntry<Omit<Statement, 'k1SourceId'>> & {
  link?: 'independent' | 'qbi' | '';
  qbiSourceId?: string;
  originalSourceReference?: string;
  allUnlistedAmountsZeroConfirmed?: boolean | null;
  domesticContinuingNonPtpConfirmed?: boolean | null;
  original?: QbiSourceEntry<ScheduleK1>;
};
export type K1CharitableSourcesData = QbiSourceEntry<Omit<K1CharitableReturnSources, 'statements'>> & { statements?: K1CharitableStatementData[] };
export type K1CharitableBasisData = NonNullable<K1CharitableStatementData['basis']>;
export type K1CharitableReceiptData = NonNullable<K1CharitableStatementData['receipts']>[number];
export type K1CharitableRiskData = NonNullable<K1CharitableStatementData['atRisk']>;

export const k1CharitableOriginalAmounts = [
  'ordinaryIncome', 'interestIncome', 'ordinaryDividends', 'qualifiedDividends', 'netShortTermCapitalGain', 'netLongTermCapitalGain',
  'charitableCash', 'charitableCapitalGain30', 'charitableCapitalGain20', 'beginningBasis', 'taxExemptInterest', 'otherTaxExemptIncome',
  'nondeductibleExpenses', 'distributions', 'federalIncomeTaxWithheld', 'section199AQBI', 'section199AW2Wages', 'section199AUBIA',
  'selfEmploymentEarnings', 'selfEmploymentNetEarningsAfterAdjustments',
] as const;
export const k1CharitableFormAmounts = ['ordinaryIncome', 'gainLossFromDispositions', 'otherIncomeGains', 'otherDeductionsLosses',
  'adjustedBasisAtEffectiveDate', 'priorYearAmountAtRisk', 'currentYearIncreases', 'currentYearDecreases'] as const;
const unlistedAmounts = [
  'netRentalIncome', 'otherNetRentalIncome', 'guaranteedPayments', 'royalties', 'unrecapturedSection1250Gain', 'collectiblesGain',
  'section1231Gain', 'otherIncome', 'section179Deduction', 'otherDeductions', 'investmentInterestExpense', 'excessBusinessInterest',
  'foreignTaxPaid', 'foreignSourceIncome', 'amtDepreciationAdjustment', 'amtAdjustedGainOrLoss', 'amtDepletion', 'amtOtherItems',
  'investmentIncome', 'investmentExpenses', 'excessTaxableIncome', 'excessBusinessInterestIncome', 'section199AQualifiedReitDividends',
  'section199AQualifiedPTPIncome', 'section199APTPW2Wages', 'section199APTPUBIA', 'lowIncomeHousingCredit42j5', 'lowIncomeHousingCreditOther',
  'qualifiedRehabilitationExpenditures', 'otherRentalRealEstateCredits', 'otherRentalCredits', 'otherCredits', 'ptpDispositionGainOrLoss',
  'njPassThroughBusinessAlternativeIncomeTaxCredit',
] as const;
const yearKeys = new Set(['taxYear', 'sourceTaxYear', 'originTaxYear', 'basisOriginTaxYear']);
const amountKeys = new Set<string>([...k1CharitableOriginalAmounts, ...k1CharitableFormAmounts, ...unlistedAmounts,
  'beginningDebtBasis', 'additionalLoansToScorp', 'priorDebtBasisReduction', 'contributionShare', 'adjustedBasisShare',
  'appreciationPreviouslyTakenIntoAccount', 'basisAllowed', 'fairMarketValueShare', 'amount',
  'originalPostBasisDeduction', 'originalDisallowedAmount', 'amountAllowed',
  'originalAmount', 'shortTermLoss', 'longTermLoss',
  'ordinary', 'rental', 'otherRental', 'royalty', 'section179', 'charitable', 'shortTermCapital', 'longTermCapital', 'section1231', 'other',
]);
function actualAmount(value: unknown, key: string): string {
  if (typeof value !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) {
    throw new Error(`Enter the actual finite ${key} amount, including zero when known.`);
  }
  const text = value.trim().replaceAll(',', '');
  if (!d(text).isFinite()) throw new Error(`Enter the actual finite ${key} amount.`);
  return text;
}
/** Preserve original decimal spelling and distinguish an unknown from a recorded zero. */
export function k1CharitableValues(value: unknown, key = ''): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(row => k1CharitableValues(row));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, k1CharitableValues(item, name)]));
  if (typeof value !== 'string') return value;
  if (amountKeys.has(key)) return actualAmount(value, key);
  const text = value.trim();
  if (yearKeys.has(key)) {
    if (!/^\d{4}$/.test(text)) throw new Error('Enter each actual K-1 source and history year.');
    return Number(text);
  }
  return text || undefined;
}
export function parseCharitableK1Original(data: K1CharitableStatementData): ScheduleK1 {
  const original = data.original;
  if (!original || !data.originalSourceReference?.trim() || data.allUnlistedAmountsZeroConfirmed !== true
    || data.domesticContinuingNonPtpConfirmed !== true) {
    throw new Error('Enter the original K-1 reference and confirm all unlisted amounts are zero for this continuing domestic non-PTP statement.');
  }
  for (const key of ['taxYear', 'partnershipName', 'partnershipEIN', 'entityType', 'accountHolder'] as const) {
    if (!original[key]?.trim()) throw new Error(`Enter the original K-1 ${key}.`);
  }
  for (const key of Object.keys(original)) {
    if (!(key in ScheduleK1Schema.shape)) throw new Error(`Saved original K-1 ${key} requires its source method.`);
  }
  for (const key of k1CharitableOriginalAmounts) actualAmount(original[key], key);
  for (const key of ['section199AIsSST', 'isPassiveActivity', 'qbiMateriallyParticipated'] as const) {
    if (typeof original[key] !== 'boolean') throw new Error(`Enter the actual K-1 ${key} answer.`);
  }
  if (original.entityType === 'partnership' && (original.selfEmploymentFactsConfirmed !== true || !original.selfEmploymentIncomeType)) {
    throw new Error('Confirm the original partnership Box 14 and self-employment classification.');
  }
  if (!original.priorSuspendedLosses) throw new Error('Record the actual prior charitable basis suspension, including zero when known.');
  actualAmount(original.priorSuspendedLosses.charitable, 'prior charitable basis suspension');
  for (const [key, value] of Object.entries(original.priorSuspendedLosses)) actualAmount(value, `prior ${key} basis suspension`);
  if (!original.form6198?.activityName?.trim()) throw new Error('Enter the original Form 6198 activity and all eight actual amounts.');
  for (const key of k1CharitableFormAmounts) actualAmount(original.form6198[key], `Form 6198 ${key}`);
  for (const key of unlistedAmounts) {
    if (key in original && (original[key] === undefined || !d(actualAmount(original[key], key)).isZero())) {
      throw new Error(`Original K-1 ${key} conflicts with the zero-other-box answer; retain its separate source method.`);
    }
  }
  for (const key of ['isPubliclyTradedPartnership', 'ptpFullyDisposedInTaxableTransaction', 'isForeignPartnership', 'section199APTPIsSST'] as const) {
    if (key in original && original[key] !== false) throw new Error(`Original K-1 ${key} conflicts with the continuing domestic non-PTP answer.`);
  }
  if (original.atRiskAmount !== undefined) throw new Error('A current at-risk allowance cannot replace the original Form 6198 sources.');
  if (original.entityType === 's_corporation') {
    for (const key of ['beginningDebtBasis', 'additionalLoansToScorp', 'priorDebtBasisReduction'] as const) actualAmount(original[key], key);
    if (typeof original.election1367 !== 'boolean') throw new Error('Enter the actual S-corporation basis-order election answer.');
  }
  return ScheduleK1Schema.parse({
    ...Object.fromEntries(unlistedAmounts.map(key => [key, '0'])),
    ...k1CharitableValues(original) as object,
  });
}
/** Indexed links refer to actual saved QBI activities; independent originals append once. */
export function parseGuidedK1CharitableSources(data: K1CharitableSourcesData | undefined, qbiCount: number) {
  if (!data) return undefined;
  if (!Array.isArray(data.statements)) throw new Error('Record every original charitable K-1, including an explicit empty list when none.');
  let independentCount = 0;
  const originals = new Map<number, ScheduleK1>();
  const statements = data.statements.map(row => {
    let index: number;
    if (row.link === 'qbi') {
      const match = /^scheduleK1:(0|[1-9]\d*)$/.exec(row.qbiSourceId ?? '');
      index = match ? Number(match[1]) : -1;
      if (index < 0 || index >= qbiCount) throw new Error('Choose the actual existing K-1 activity for the charitable attachment.');
    } else if (row.link === 'independent') index = qbiCount + independentCount++;
    else throw new Error('Identify whether this is an independent original K-1 or an attachment to an existing activity.');
    if (originals.has(index)) throw new Error('A charitable attachment must bind its original K-1 once.');
    const original = parseCharitableK1Original(row);
    if (row.link === 'independent' && original.isPassiveActivity) throw new Error('Link the passive K-1 to its actual activity and independent prior passive-loss history in adjustments.');
    originals.set(index, original);
    return { ...k1CharitableValues(row) as object, cashDistribution: normalizeGuidedK1CashDistribution(row.cashDistribution), k1SourceId: `scheduleK1:${index}` };
  });
  const packet = K1CharitableReturnSourcesSchema.parse({ ...k1CharitableValues(data) as object, statements });
  return { packet, originals, independentCount };
}
