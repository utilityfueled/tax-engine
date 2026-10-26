/** Publication 974 Worksheets I-V and monthly transfer. Spec: form-8962-marriage-worksheets.yaml. */
import Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, min, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';
import { calculateForm8962Contribution, type Form8962FplRegion } from './form-8962-contribution.js';

type Owner = 'primary' | 'spouse';
interface CoverageMonth { month: number; premium: Decimal; slcsp: Decimal; coverageEligible: boolean }
export interface Form8962MarriageWorksheetInput {
  taxYear: number; fplRegion: Form8962FplRegion; householdIncome: Decimal; familySize: number; marriageMonth: number;
  /** Derived from the actual date: preceding month for day1; wedding month otherwise. */
  lastPreMarriageMonth: number;
  /** Validated ordinary coverage amounts. Policy/household source binding is a separate prerequisite. */
  months: Array<CoverageMonth & { advance: Decimal }>;
  families: Array<{ owner: Owner; familySize: number; months: CoverageMonth[] }>;
}
export interface Form8962MarriageMonth {
  month: number; premium: Decimal; slcsp: Decimal; contribution: Decimal; maximumCredit: Decimal; credit: Decimal; advance: Decimal;
  coverageEligible: boolean;
}
export interface Form8962MarriageFamily {
  owner: Owner; familySize: number; halfIncome: Decimal; federalPovertyLine: Decimal; fplPercentageForTable: Decimal;
  contributionRate?: Decimal; annualContribution?: Decimal; monthlyContribution?: Decimal;
  startMonth?: number; stopMonth?: number; incomeWithinLimit: boolean; months: Form8962MarriageMonth[];
}
export interface Form8962MarriageWorksheetResult {
  electionApplies: boolean; reason?: 'no-premarriage-coverage' | 'no-excess-advance' | 'no-benefit';
  families: Form8962MarriageFamily[];
  partV: Array<{ owner: Owner; familySize: number; monthlyContribution: Decimal; startMonth: number; stopMonth: number }>;
  ordinaryCredit: Decimal; ordinaryRepayment: Decimal; ordinaryPreMarriageCredit: Decimal; alternativePreMarriageCredit: Decimal;
  months: Form8962MarriageMonth[]; ptcAllowed: Decimal; advancePTCTotal: Decimal; netPTC: Decimal;
  excessAPTC: Decimal; repaymentCap: Decimal | null; excessAPTCRepayment: Decimal; lines: CalculatedLine[];
}
function month(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error('Marriage worksheet requires an actual month from 1 through 12');
}
function amount(value: Decimal, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0)) throw new Error(`Marriage worksheet requires a finite nonnegative actual ${label}`);
  return value;
}
function coverage(row: CoverageMonth): void {
  month(row.month); amount(row.premium, 'premium'); amount(row.slcsp, 'benchmark');
  if (typeof row.coverageEligible !== 'boolean') throw new Error('Marriage worksheet requires known actual coverage eligibility');
}

/** Pure completed-worksheet arithmetic. Never accepts an entered current PTC or repayment override. */
export function calculateForm8962MarriageWorksheets(input: Form8962MarriageWorksheetInput): Form8962MarriageWorksheetResult {
  month(input.marriageMonth);
  month(input.lastPreMarriageMonth);
  if (input.lastPreMarriageMonth > input.marriageMonth || input.lastPreMarriageMonth < input.marriageMonth - 1) {
    throw new Error('Marriage worksheet requires the actual first-full-married-month boundary');
  }
  const joint = calculateForm8962Contribution(input);
  if (input.familySize < 2 || joint.fplPercentageForTable.lt(100)) throw new Error('Marriage worksheet requires an actual joint family and its separate below-poverty method when applicable');
  const owners = new Set<Owner>();
  if (!Array.isArray(input.families) || input.families.length !== 2) throw new Error('Marriage worksheet requires both actual alternative family owners exactly once');
  for (const family of input.families) {
    if (!['primary', 'spouse'].includes(family.owner) || owners.has(family.owner)) throw new Error('Marriage worksheet alternative owner must appear once');
    owners.add(family.owner);
    if (!Number.isSafeInteger(family.familySize) || family.familySize < 1) throw new Error('Marriage worksheet requires actual positive alternative family sizes');
  }
  if (input.families.reduce((total, family) => total + family.familySize, 0) !== input.familySize) throw new Error('Marriage worksheet alternative family sizes must reconcile to the actual joint tax family');
  if (!Array.isArray(input.months)) throw new Error('Marriage worksheet requires actual ordinary monthly sources');
  const sourceMonths = new Map<number, CoverageMonth & { advance: Decimal }>();
  for (const row of input.months) {
    coverage(row); amount(row.advance, 'advance payment');
    if (sourceMonths.has(row.month)) throw new Error('Marriage worksheet has duplicate ordinary months');
    sourceMonths.set(row.month, row);
  }
  const jointIncomeEligible = input.taxYear === 2025 || joint.fplPercentageForTable.lte(400);
  const ordinaryMonths: Form8962MarriageMonth[] = [...sourceMonths.values()].sort((a, b) => a.month - b.month).map(row => {
    const premium = roundDollar(row.premium), slcsp = roundDollar(row.slcsp), advance = roundDollar(row.advance);
    const maximumCredit = zeroFloor(slcsp.minus(joint.monthlyContribution));
    return { month: row.month, premium, slcsp, advance, contribution: joint.monthlyContribution, maximumCredit,
      coverageEligible: row.coverageEligible, credit: jointIncomeEligible && row.coverageEligible ? min(premium, maximumCredit) : d('0') };
  });
  const ordinaryCredit = sum(...ordinaryMonths.map(row => row.credit));
  const advancePTCTotal = sum(...ordinaryMonths.map(row => row.advance));
  const repaymentCap = input.taxYear === 2026 || joint.fplPercentageForTable.gte(400) ? null
    : d(joint.fplPercentageForTable.lt(200) ? '750' : joint.fplPercentageForTable.lt(300) ? '1950' : '3250');
  const ordinaryExcess = zeroFloor(advancePTCTotal.minus(ordinaryCredit));
  const ordinaryRepayment = repaymentCap === null ? ordinaryExcess : min(ordinaryExcess, repaymentCap);
  const audit = new AuditTrail();
  const families: Form8962MarriageFamily[] = [...input.families].sort((a, b) => a.owner === b.owner ? 0 : a.owner === 'primary' ? -1 : 1).map(family => {
    if (!Array.isArray(family.months)) throw new Error('Marriage worksheet requires known owner coverage months, including none');
    const halfIncome = roundDollar(input.householdIncome.div(2));
    const alternative = calculateForm8962Contribution({ taxYear: input.taxYear, fplRegion: input.fplRegion, familySize: family.familySize, householdIncome: halfIncome });
    const incomeWithinLimit = input.taxYear === 2025 || alternative.fplPercentageForTable.lte(400);
    const seen = new Set<number>();
    for (const row of family.months) {
      coverage(row);
      if (seen.has(row.month)) throw new Error('Marriage worksheet has duplicate owner coverage months');
      seen.add(row.month);
      if (row.month > input.lastPreMarriageMonth || !sourceMonths.has(row.month)) throw new Error('Marriage worksheet owner month must have actual joint sources in a pre-marriage month');
      if (row.coverageEligible && sourceMonths.get(row.month)?.coverageEligible !== true) throw new Error('Marriage worksheet owner eligibility conflicts with actual ordinary coverage');
    }
    const rows = [...family.months].sort((a, b) => a.month - b.month);
    const startMonth = rows[0]?.month, stopMonth = rows.at(-1)?.month;
    if (startMonth !== undefined && stopMonth !== undefined && rows.length !== stopMonth - startMonth + 1) throw new Error('Marriage worksheet coverage interval requires every actual month, including explicit zero during a gap');
    const form = family.owner === 'primary' ? 'Pub974 Marriage Worksheet I' : 'Pub974 Marriage Worksheet III';
    const monthlyForm = family.owner === 'primary' ? 'Pub974 Marriage Worksheet II' : 'Pub974 Marriage Worksheet IV';
    if (startMonth !== undefined) {
      audit.record(form, '1', 'Actual alternative family size', d(String(family.familySize)), 'Confirmed separate dependent allocation, including this owner');
      audit.record(form, '2', 'Half of actual joint household income', halfIncome, 'round(actual Form8962 household income /2)');
      audit.record(form, '3', 'Alternative federal poverty line', alternative.federalPovertyLine, 'Actual alternative family size and same actual poverty region');
      audit.record(form, '4', 'Alternative whole-number poverty percentage', alternative.fplPercentageForTable, '401 above4 times the poverty amount; otherwise drop the fraction');
      if (incomeWithinLimit) {
        audit.record(form, '5', 'Alternative applicable figure', alternative.contributionRate, 'Actual-year contribution table at whole-number poverty percentage');
        audit.record(form, '6', 'Alternative annual contribution', alternative.expectedContribution, 'round(line2 times line5)');
        audit.record(form, '7', 'Alternative monthly contribution', alternative.monthlyContribution, 'round(line6 /12)');
        audit.record(form, '8', 'First actual alternative coverage month', d(String(startMonth)), 'First full actual QHP coverage month');
        audit.record(form, '9', 'Last actual alternative coverage month', d(String(stopMonth)), 'Last actual coverage month before the first full married month');
      }
    }
    const months = rows.map(row => {
      const premium = roundDollar(row.premium), slcsp = roundDollar(row.slcsp);
      const maximumCredit = zeroFloor(slcsp.minus(alternative.monthlyContribution));
      const credit = incomeWithinLimit && row.coverageEligible ? min(premium, maximumCredit) : d('0');
      if (incomeWithinLimit) {
        for (const [column, description, value, formula] of [
          ['A', 'Alternative enrollment premium', premium, 'Round actual source group after aggregation'],
          ['B', 'Alternative corrected benchmark', slcsp, 'Round actual source benchmark group'],
          ['C', 'Alternative contribution', alternative.monthlyContribution, 'Owner contribution worksheet line7'],
          ['D', 'Alternative maximum assistance', maximumCredit, 'max(0,B-C)'],
          ['E', 'Alternative premium assistance', credit, 'Eligible coverage: min(A,D); otherwise0'],
        ] as const) audit.record(monthlyForm, `${row.month}${column}`, description, value, formula);
      }
      return { month: row.month, premium, slcsp, advance: d('0'), contribution: alternative.monthlyContribution, maximumCredit, credit, coverageEligible: row.coverageEligible };
    });
    return { owner: family.owner, familySize: family.familySize, halfIncome, federalPovertyLine: alternative.federalPovertyLine,
      fplPercentageForTable: alternative.fplPercentageForTable, incomeWithinLimit,
      ...(incomeWithinLimit && startMonth !== undefined ? { contributionRate: alternative.contributionRate, annualContribution: alternative.expectedContribution,
        monthlyContribution: alternative.monthlyContribution, startMonth, stopMonth } : {}), months };
  });
  const preMonths = ordinaryMonths.filter(row => row.month <= input.lastPreMarriageMonth);
  for (const row of preMonths) {
    const original = sourceMonths.get(row.month);
    const sources = input.families.flatMap(family => family.months.filter(value => value.month === row.month));
    if (!original || sources.length === 0 || !sum(...sources.map(value => value.premium)).eq(original.premium)) throw new Error('Marriage worksheet owner premiums must exactly reconcile to each actual pre-marriage source month');
  }
  const applicableMonths = new Set(families.filter(family => family.incomeWithinLimit).flatMap(family => family.months.map(row => row.month)));
  let alternativePreMarriageCredit = d('0'), ordinaryPreMarriageCredit = d('0');
  for (const row of preMonths.filter(row => applicableMonths.has(row.month))) {
    const alternative = sum(...families.flatMap(family => family.months.filter(value => value.month === row.month).map(value => value.credit)));
    alternativePreMarriageCredit = alternativePreMarriageCredit.plus(alternative); ordinaryPreMarriageCredit = ordinaryPreMarriageCredit.plus(row.credit);
    audit.record('Pub974 Marriage Worksheet V', `${row.month}A`, 'Alternative pre-marriage assistance', alternative, 'Sum of corresponding owner worksheets columnE');
    audit.record('Pub974 Marriage Worksheet V', `${row.month}B`, 'Ordinary assistance for the same month', row.credit, 'Corresponding actual ordinary monthly calculation');
  }
  audit.record('Pub974 Marriage Worksheet V', '13A', 'Total alternative comparison assistance', alternativePreMarriageCredit, 'Sum monthly columnA');
  audit.record('Pub974 Marriage Worksheet V', '13B', 'Total ordinary comparison assistance', ordinaryPreMarriageCredit, 'Sum matching columnB only');
  const alternativeMonths = ordinaryMonths.map(row => {
    if (row.month > input.lastPreMarriageMonth) return row;
    const sourceRows = families.filter(family => family.incomeWithinLimit).flatMap(family => family.months.filter(value => value.month === row.month));
    const contribution = sum(...sourceRows.map(value => value.contribution));
    return { ...row, contribution, maximumCredit: zeroFloor(row.slcsp.minus(contribution)), credit: sum(...sourceRows.map(value => value.credit)) };
  });
  const alternativeYearCredit = sum(...alternativeMonths.map(row => row.credit));
  // Worksheet V omits an owner who stops at the income limit. Compare the
  // complete optional result too, so those omitted months cannot conceal a
  // larger loss of ordinary credit. This does not change either worksheet.
  const reason = preMonths.length === 0 ? 'no-premarriage-coverage' : ordinaryExcess.isZero() ? 'no-excess-advance'
    : !alternativePreMarriageCredit.gt(ordinaryPreMarriageCredit) || !alternativeYearCredit.gt(ordinaryCredit) ? 'no-benefit' : undefined;
  const electionApplies = reason === undefined;
  const partV: Form8962MarriageWorksheetResult['partV'] = electionApplies ? families.flatMap(family => family.startMonth !== undefined && family.stopMonth !== undefined && family.monthlyContribution !== undefined
    ? [{ owner: family.owner, familySize: family.familySize, monthlyContribution: family.monthlyContribution, startMonth: family.startMonth, stopMonth: family.stopMonth }] : []) : [];
  const months = electionApplies ? alternativeMonths : ordinaryMonths;
  const ptcAllowed = sum(...months.map(row => row.credit));
  const excessAPTC = zeroFloor(advancePTCTotal.minus(ptcAllowed));
  const netPTC = electionApplies ? d('0') : zeroFloor(ptcAllowed.minus(advancePTCTotal));
  const excessAPTCRepayment = repaymentCap === null ? excessAPTC : min(excessAPTC, repaymentCap);
  if (electionApplies) {
    for (const row of partV) {
      const line = row.owner === 'primary' ? '35' : '36';
      for (const [column, value, description] of [['a', d(String(row.familySize)), 'Alternative family size'], ['b', row.monthlyContribution, 'Alternative monthly contribution'],
        ['c', d(String(row.startMonth)), 'Alternative start month'], ['d', d(String(row.stopMonth)), 'Alternative stop month']] as const) {
        audit.record('Form 8962', `${line}${column}`, description, value, 'Completed corresponding owner contribution worksheet');
      }
    }
  }
  for (const row of months) {
    const line = String(row.month + 11);
    if ((electionApplies && row.month <= input.lastPreMarriageMonth) || (jointIncomeEligible && row.coverageEligible)) {
      for (const [column, description, value] of [['a', 'Enrollment premium', row.premium], ['b', 'Corrected benchmark', row.slcsp], ['c', 'Contribution', row.contribution],
        ['d', 'Maximum assistance', row.maximumCredit], ['e', 'Monthly allowed assistance', row.credit]] as const) {
        audit.record('Form 8962', `${line}${column}`, description, value, electionApplies && row.month <= input.lastPreMarriageMonth ? 'Pub974 Step7; columnE comes from separate owner calculations' : 'Ordinary monthly calculation');
      }
    }
    audit.record('Form 8962', `${line}f`, 'Monthly actual advance payments', row.advance, 'Original monthly source amount, rounded once');
  }
  audit.record('Form 8962', '24', 'Allowed assistance for reconciliation', ptcAllowed, 'Sum monthly columnE');
  audit.record('Form 8962', '25', 'Actual advance payments', advancePTCTotal, 'Sum monthly columnF');
  audit.record('Form 8962', '26', 'Net premium tax credit', netPTC, electionApplies ? 'Pub974 Step8 requires zero for this election' : 'max(0,24-25)');
  if (!electionApplies || excessAPTC.gt(0)) {
    audit.record('Form 8962', '27', 'Excess advance payments', excessAPTC, 'max(0,25-24)');
    if (repaymentCap !== null && excessAPTC.gt(0)) audit.record('Form 8962', '28', 'Applicable historical repayment cap', repaymentCap, '2025 joint Table5 using actual joint household income');
    audit.record('Form 8962', '29', 'Excess advance repayment', excessAPTCRepayment, repaymentCap === null ? 'Full excess; no2026 limitation' : 'min(27,28)');
  }
  return { electionApplies, ...(reason ? { reason } : {}), families, partV, ordinaryCredit, ordinaryRepayment,
    ordinaryPreMarriageCredit, alternativePreMarriageCredit, months, ptcAllowed, advancePTCTotal, netPTC, excessAPTC, repaymentCap, excessAPTCRepayment, lines: audit.getLines() };
}
