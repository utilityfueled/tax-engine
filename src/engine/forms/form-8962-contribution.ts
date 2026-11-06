/** Shared Form 8962 and Publication 974 contribution arithmetic; spec/federal/form-8962.yaml. */
import Decimal from 'decimal.js';
import { roundDollar } from '@/utils/decimal.js';

export type Form8962FplRegion = 'contiguous' | 'alaska' | 'hawaii';
export interface Form8962ContributionResult {
  federalPovertyLine: Decimal;
  fplPercentage: Decimal;
  fplPercentageForTable: Decimal;
  contributionRate: Decimal;
  expectedContribution: Decimal;
  monthlyContribution: Decimal;
}
const FPL = {
  2025: { contiguous: ['15060', '5380'], alaska: ['18810', '6730'], hawaii: ['17310', '6190'] },
  2026: { contiguous: ['15650', '5500'], alaska: ['19550', '6880'], hawaii: ['17990', '6330'] },
} as const;
type Bracket = readonly [number, number, string, string];
const TABLE: Record<2025 | 2026, readonly Bracket[]> = {
  2025: [[0, 150, '0', '0'], [150, 200, '0', '.02'], [200, 250, '.02', '.04'], [250, 300, '.04', '.06'], [300, 400, '.06', '.085'], [400, 402, '.085', '.085']],
  2026: [[0, 133, '.021', '.021'], [133, 150, '.0314', '.0419'], [150, 200, '.0419', '.066'], [200, 250, '.066', '.0844'], [250, 300, '.0844', '.0996'], [300, 402, '.0996', '.0996']],
};

/** Does not establish credit eligibility. The caller applies the actual eligibility method. */
export function calculateForm8962Contribution(input: {
  taxYear: number; fplRegion: Form8962FplRegion; familySize: number; householdIncome: Decimal;
  /** Canonical Publication 974 auxiliary worksheet only; never an actual-year eligibility override. */
  orderedDeductionInterim?: boolean;
}): Form8962ContributionResult {
  const year = input.taxYear;
  if (year !== 2025 && year !== 2026) throw new Error('Form 8962 contribution requires the actual 2025 or 2026 year');
  if (!Number.isSafeInteger(input.familySize) || input.familySize < 1) throw new Error('Form 8962 contribution requires an actual positive family size');
  if (!Object.hasOwn(FPL[year], input.fplRegion)) throw new Error('Form 8962 contribution requires the actual poverty region');
  if (!Decimal.isDecimal(input.householdIncome) || !input.householdIncome.isFinite() || input.householdIncome.lt(0)) throw new Error('Form 8962 contribution requires finite nonnegative household income');
  const [base, increment] = FPL[year][input.fplRegion];
  const federalPovertyLine = new Decimal(base).plus(new Decimal(increment).times(input.familySize - 1));
  const fplPercentage = input.householdIncome.div(federalPovertyLine).times(100);
  const fplPercentageForTable = input.householdIncome.gt(federalPovertyLine.times(4))
    ? new Decimal(input.orderedDeductionInterim ? 400 : 401) : fplPercentage.floor();
  const bracket = TABLE[year].find(([start, end]) => fplPercentageForTable.gte(start) && fplPercentageForTable.lt(end));
  if (!bracket) throw new Error('Form 8962 applicable percentage is outside its table');
  const [start, end, initial, final] = bracket;
  const contributionRate = new Decimal(initial).plus(new Decimal(final).minus(initial)
    .times(fplPercentageForTable.minus(start)).div(new Decimal(end).minus(start))).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const expectedContribution = roundDollar(input.householdIncome.times(contributionRate));
  const monthlyContribution = roundDollar(expectedContribution.div(12));
  return { federalPovertyLine, fplPercentage, fplPercentageForTable, contributionRate, expectedContribution, monthlyContribution };
}
