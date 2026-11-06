// Spec: spec/federal/form-1099-q-room-board-periods.yaml. Derived original-source controls.
import { expect, it } from 'vitest';
import { calculateRoomBoardPeriods } from '@/utils/education-room-board-periods.js';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { roomBoardPeriodFixture, roomBoardEsaPeriodFixture } from '../../fixtures/education-room-board-periods.js';
function required<T>(value: T | undefined): T { if (value === undefined)
  throw new Error('Missing fictional source row'); return value; }
const calculate = (input: ReturnType<typeof roomBoardPeriodFixture>['input']) => calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: input.taxpayer.taxYear });
const values = (input: ReturnType<typeof roomBoardPeriodFixture>['input']) => { const r = calculate(input); return [r.adjustedQEE, r.taxFreeEarnings, r.taxableEarnings, r.netPenalty].map(x => x.toFixed()); };
it('applies one actual period allowance across distinct receipts', () => {
  for (const year of [2025, 2026])
    for (const cash of [false, true]) {
      const { input, facts, form } = roomBoardPeriodFixture(year);
      if (cash) {
        form.distributionMedium = 'cash';
        facts.inKindBenefits = [];
      }
      const before = JSON.stringify(input);
      expect(values(input)).toEqual(['6000', '1200', '800', '80']);
      facts.expenses?.reverse();
      facts.allocations?.reverse();
      facts.roomBoardPeriodExpenses.reverse();
      expect(values(input)).toEqual(['6000', '1200', '800', '80']);
      facts.expenses?.reverse();
      facts.allocations?.reverse();
      facts.roomBoardPeriodExpenses.reverse();
      expect(JSON.stringify(input)).toBe(before);
    }
});
it('keeps separate academic periods housing and explicit zero facts', () => {
  const { input, period } = roomBoardPeriodFixture();
  period.schoolOwnedHousing = true;
  period.schoolOwnedHousingCharge = '7000';
  period.livingArrangement = 'institution_housing' as typeof period.livingArrangement;
  Object.assign(period, { schoolHousingInvoiceReference: 'Fictional institutional invoice' });
  expect(values(input)).toEqual(['7000', '1400', '600', '60']);
  period.halfTimeStudent = false;
  expect(values(input)).toEqual(['0', '0', '2000', '200']);
  period.halfTimeStudent = true;
  period.schoolOwnedHousingCharge = '0';
  period.roomBoardAllowance = '0';
  expect(values(input)).toEqual(['0', '0', '2000', '200']);
  const two = roomBoardPeriodFixture(), first = two.facts.expenses?.[0], benefit = two.facts.inKindBenefits?.[0], link = two.facts.roomBoardPeriodExpenses[0];
  if (!first || !benefit || !link)
    throw new Error('Missing explicit fixture receipt');
  first.paidDate = '2025-02-01';
  benefit.providedDate = '2025-02-01';
  link.periodId = 'spring';
  link.coveredStart = '2025-02-01';
  link.coveredEnd = '2025-05-01';
  two.facts.roomBoardPeriods.push({ ...two.period, id: 'spring', academicPeriodStart: '2025-01-15', academicPeriodEnd: '2025-05-20', roomBoardAllowance: '3000' });
  two.period.roomBoardAllowance = '4000';
  expect(values(two.input)).toEqual(['7000', '1400', '600', '60']);
});
it('rejects missing conflicting and duplicated period sources', () => {
  for (const change of ['unknown', 'year', 'date', 'allowance', 'housing', 'duplicate', 'overlap', 'beneficiary', 'school-charge']) {
    const { input, facts, period } = roomBoardPeriodFixture();
    if (change === 'unknown')
      Object.assign(period, { sourceFactsConfirmed: undefined });
    if (change === 'year')
      period.sourceTaxYear = 2026;
    if (change === 'date')
      period.academicPeriodEnd = '2025-02-30';
    if (change === 'allowance')
      Object.assign(period, { roomBoardAllowance: undefined });
    if (change === 'housing')
      Object.assign(period, { schoolOwnedHousingCharge: undefined });
    if (change === 'duplicate')
      facts.roomBoardPeriodExpenses.push({ ...required(facts.roomBoardPeriodExpenses[0]) });
    if (change === 'overlap')
      facts.roomBoardPeriods.push({ ...period, id: 'overlap' });
    if (change === 'beneficiary')
      period.beneficiaryId = 'replaced';
    if (change === 'school-charge')
      period.schoolOwnedHousingCharge = '8000';
    const before = JSON.stringify(input);
    expect(() => calculate(input)).toThrow(/period|room.and.board|receipt|institution|source/);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('uses actual ESA coordination without inferring an allocation', () => {
  const { input, facts, period, form } = roomBoardPeriodFixture();
  input.form1099Q?.push({ ...form, sourceId: 'esa', accountId: 'fictional-esa', accountType: 'coverdell_esa', distributionMedium: 'cash', grossDistribution: '5000', earnings: '1000', basis: '4000' });
  facts.coverdellAccounts = [{ accountId: 'fictional-esa', priorYearBasis: '4000', currentYearContributions: '0', yearEndValue: '0', outstandingRollovers: '0', rolloverBasisReceived: '0' }];
  for (const allocation of facts.allocations ?? [])
    allocation.amount = '2500';
  facts.allocations?.push(...(facts.expenses ?? []).map(row => ({ sourceId: 'esa', expenseId: row.id, amount: '2500', creditAmount: '0' })));
  Object.assign(period, { esaAllocationConfirmed: true, esaAllocationSourceReference: 'Fictional actual taxpayer allocation' });
  facts.roomBoardEsaAllocations = [{ periodId: 'fall', sourceId: form.sourceId ?? '', amount: '2000' }, { periodId: 'fall', sourceId: 'esa', amount: '4000' }];
  expect(values(input)).toEqual(['6000', '1200', '1800', '180']);
  const original = JSON.stringify(input);
  Object.assign(period, { esaAllocationConfirmed: undefined });
  expect(() => calculate(input)).toThrow(/actual.*allocation|coordination/);
  period.esaAllocationConfirmed = true;
  required(facts.roomBoardEsaAllocations[0]).amount = '2001';
  expect(() => calculate(input)).toThrow(/conserv|cap|allocation/);
  required(facts.roomBoardEsaAllocations[0]).amount = '2000';
  expect(JSON.stringify(input)).toBe(original);
});
it('preserves determined prepaid priority and unresolved shared methods', () => {
  const { input, facts, form, period } = roomBoardPeriodFixture();
  const first = facts.expenses?.[0], second = facts.expenses?.[1], benefit = facts.inKindBenefits?.[0];
  if (!first || !second || !benefit)
    throw new Error('Missing explicit fixture receipts');
  form.grossDistribution = '4000';
  form.earnings = '800';
  form.basis = '3200';
  first.amount = '4000';
  second.amount = '6000';
  facts.inKindBenefits = [{ ...benefit, amount: '4000' }];
  facts.allocations = [{ expenseId: first.id, sourceId: form.sourceId ?? '', amount: '4000', creditAmount: '0' }, { expenseId: second.id, sourceId: 'cash', amount: '6000', creditAmount: '0' }];
  input.form1099Q?.push({ ...form, sourceId: 'cash', accountId: 'fictional-cash', distributionMedium: 'cash', grossDistribution: '6000', earnings: '1200', basis: '4800' });
  expect(values(input)).toEqual(['6000', '1200', '800', '80']);
  const cash = input.form1099Q?.[1];
  if (!cash)
    throw new Error('Missing explicit original statement');
  cash.distributionMedium = 'in_kind_prepaid_tuition';
  facts.inKindBenefits.push({ ...benefit, id: 'second-benefit', sourceId: 'cash', expenseId: second.id, amount: '6000' });
  expect(() => calculate(input)).toThrow(/multiple prepaid.*allocation|shared.*prepaid/);
  period.roomBoardAllowance = '10000';
  expect(values(input)).toEqual(['10000', '2000', '0', '0']);
});
it('retains each original receipt qualification and exact source allocation', () => {
  const { input, facts } = roomBoardPeriodFixture();
  const second = facts.expenses?.[1], benefit = facts.inKindBenefits?.[1], allocation = facts.allocations?.[0];
  if (!second || !benefit || !allocation)
    throw new Error('Missing fictional source rows');
  second.qualificationConfirmed = false;
  benefit.qualificationConfirmed = false;
  expect(values(input)).toEqual(['5000', '1000', '1000', '100']);
  second.qualificationConfirmed = true;
  benefit.qualificationConfirmed = true;
  allocation.amount = '4999';
  expect(() => calculate(input)).toThrow(/original|provided|benefit|allocation/i);
  allocation.amount = '5000.00000000000000000000000000000000000000001';
  expect(() => calculate(input)).toThrow(/original|provided|benefit|allocation/i);
});
it('combines actual tuition with the separately capped room and board period', () => {
  const { input, facts } = roomBoardEsaPeriodFixture(2025, true), before = JSON.stringify(input);
  expect(values(input)).toEqual(['8000', '1600', '2200', '220']);
  expect(JSON.stringify(input)).toBe(before);
  required(facts.roomBoardPeriods[0]).sourceFactsConfirmed = undefined;
  expect(() => calculate(input)).toThrow(/period|confirmation|source/i);
});
it('combines period costs with distinct tuition assistance without reusing sources', async () => {
  const { cashAssistanceFixture } = await import('../../fixtures/education-cash-assistance.js');
  const { input, facts, form } = roomBoardPeriodFixture();
  const tuition = cashAssistanceFixture(), source = tuition.qualifiedEducationExpenses?.sourceFacts;
  const cash = tuition.form1099Q[1], expense = source?.expenses?.[0], benefit = source?.inKindBenefits?.[0];
  if (!source || !cash || !expense || !benefit || !form.sourceId)
    throw new Error('Missing fictional tuition originals');
  form.grossDistribution = '14000';
  form.earnings = '2800';
  form.basis = '11200';
  input.form1099Q?.push({ ...cash, beneficiaryId: form.beneficiaryId });
  facts.expenses?.push({ ...expense, beneficiaryId: form.beneficiaryId ?? '' });
  facts.inKindBenefits?.push({ ...benefit, sourceId: form.sourceId });
  facts.allocations?.push(...(source.allocations ?? []).map(row => ({ ...row, sourceId: row.sourceId === 'prepaid' ? form.sourceId ?? '' : row.sourceId })));
  input.educationExpenses = tuition.educationExpenses;
  const result = calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: 2025, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
  expect([result.adjustedQEE, result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed())).toEqual(['14000', '3025', '1775', '225', '155']);
  facts.roomBoardPeriodExpenses.push({ ...facts.roomBoardPeriodExpenses[0] });
  expect(() => calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: 2025, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses })).toThrow(/duplicat|receipt|period/);
});
it('checks original receipt capacity before the academic period total', () => {
  for (const change of ['capacity', 'credit', 'unknown-credit']) {
    const { input, facts, form } = roomBoardPeriodFixture();
    form.distributionMedium = 'cash';
    facts.inKindBenefits = [];
    const first = facts.allocations?.[0], second = facts.allocations?.[1];
    if (!first || !second)
      throw new Error('Missing fictional original allocations');
    if (change === 'capacity') {
      first.amount = '6000';
      second.amount = '4000';
    }
    if (change === 'credit') {
      first.amount = '4999';
      first.creditAmount = '1';
    }
    if (change === 'unknown-credit')
      Object.assign(first, { creditAmount: undefined });
    const before = JSON.stringify(input);
    expect(() => calculateRoomBoardPeriods(input.form1099Q ?? [], facts, 2025)).toThrow(/receipt|credit|allocation/i);
    expect(JSON.stringify(input)).toBe(before);
  }
  const { input, facts, form } = roomBoardPeriodFixture();
  form.distributionMedium = 'cash';
  facts.inKindBenefits = [];
  expect(calculateRoomBoardPeriods(input.form1099Q ?? [], facts, 2025).qualifiedBySource.get(form.sourceId ?? '')?.toFixed()).toBe('6000');
});

function unusedOriginalControl(medium: 'cash' | 'in_kind_prepaid_tuition') {
  const { input, facts, form } = roomBoardPeriodFixture();
  form.distributionMedium = medium;
  if (medium === 'cash') facts.inKindBenefits = [];
  input.form1099Q?.push({ ...form, sourceId: 'unused', accountId: 'fictional-unused-original', grossDistribution: '5000', earnings: '1000', basis: '4000' });
  if (medium === 'in_kind_prepaid_tuition') {
    // Its actual benefit still reconciles Box 1; it has no eligible allocation
    // to the room-and-board period and cannot acquire that period's allowance.
    facts.expenses?.push({ ...required(facts.expenses?.[0]), id: 'unused-benefit-expense', category: 'postsecondary_tuition', qualificationConfirmed: false });
    facts.inKindBenefits?.push({ ...required(facts.inKindBenefits?.[0]), id: 'unused-benefit', sourceId: 'unused', expenseId: 'unused-benefit-expense', qualificationConfirmed: false });
    facts.allocations?.push({ sourceId: 'unused', expenseId: 'unused-benefit-expense', amount: '5000', creditAmount: '0' });
  }
  const before = JSON.stringify(input);
  for (const reordered of [false, true]) {
    if (reordered) input.form1099Q?.reverse();
    const periodSources = calculateRoomBoardPeriods(input.form1099Q, facts, 2025);
    expect(periodSources.qualifiedBySource.get('prepaid')?.toFixed()).toBe('6000');
    expect(periodSources.qualifiedBySource.get('unused')?.toFixed()).toBe('0');
    const result = calculate(input);
    expect(result.perDistribution.map(row => [row.sourceId, row.adjustedQEE.toFixed(), row.taxableEarnings.toFixed()]).sort()).toEqual(medium === 'cash'
      ? [['prepaid', '4000', '1200'], ['unused', '2000', '600']]
      : [['prepaid', '6000', '800'], ['unused', '0', '1000']]);
    expect([result.adjustedQEE, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['6000', '1800', '180']);
    if (reordered) input.form1099Q?.reverse();
  }
  expect(JSON.stringify(input)).toBe(before);
}
function separateOriginalPeriodsControl(medium: 'cash' | 'in_kind_prepaid_tuition') {
  const { input, facts, form, period } = roomBoardPeriodFixture();
  form.distributionMedium = medium; form.grossDistribution = '5000'; form.earnings = '1000'; form.basis = '4000';
  if (medium === 'cash') facts.inKindBenefits = [];
  input.form1099Q?.push({ ...form, sourceId: 'spring-original', accountId: 'fictional-spring-original' });
  period.roomBoardAllowance = '3000';
  facts.roomBoardPeriods.push({ ...period, id: 'spring', academicPeriodStart: '2025-01-15', academicPeriodEnd: '2025-05-20', roomBoardAllowance: '2000' });
  required(facts.expenses?.[1]).paidDate = '2025-02-01';
  required(facts.allocations?.[1]).sourceId = 'spring-original';
  Object.assign(required(facts.roomBoardPeriodExpenses[1]), { periodId: 'spring', coveredStart: '2025-02-01', coveredEnd: '2025-05-01' });
  if (medium === 'in_kind_prepaid_tuition') Object.assign(required(facts.inKindBenefits?.[1]), { sourceId: 'spring-original', providedDate: '2025-02-01' });
  const before = JSON.stringify(input), result = calculate(input);
  const periodSources = calculateRoomBoardPeriods(input.form1099Q, facts, 2025);
  expect(periodSources.qualifiedBySource.get('prepaid')?.toFixed()).toBe('3000');
  expect(periodSources.qualifiedBySource.get('spring-original')?.toFixed()).toBe('2000');
  expect(result.perDistribution.map(row => [row.sourceId, row.adjustedQEE.toFixed(), row.taxableEarnings.toFixed()])).toEqual(medium === 'cash'
    ? [['prepaid', '2500', '500'], ['spring-original', '2500', '500']]
    : [['prepaid', '3000', '400'], ['spring-original', '2000', '600']]);
  expect([result.adjustedQEE, result.taxableEarnings, result.netPenalty].map(value => value.toFixed())).toEqual(['5000', '1000', '100']);
  expect(JSON.stringify(input)).toBe(before);
}
it('keeps an unused cash original outside another period allowance', () => unusedOriginalControl('cash'));
it('keeps an unused prepaid original outside another period allowance', () => unusedOriginalControl('in_kind_prepaid_tuition'));
it('keeps separate cash originals within their own academic periods', () => separateOriginalPeriodsControl('cash'));
it('keeps separate prepaid originals within their own academic periods', () => separateOriginalPeriodsControl('in_kind_prepaid_tuition'));
