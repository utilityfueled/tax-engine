import { roomBoardPeriodFixture } from './education-room-board-periods.js';

/** Explicit fictional originals. Expected values live in the independent tests. */
export function annualCashQtpFixture(year = 2025) {
  const fixture = roomBoardPeriodFixture(year);
  const { input, facts, form } = fixture;
  form.sourceId = 'cash-first'; form.accountId = 'fictional-cash-first';
  form.distributionMedium = 'cash'; form.grossDistribution = '10000';
  form.earnings = '4000'; form.basis = '6000';
  const second = { ...form, sourceId: 'cash-second', accountId: 'fictional-cash-second', earnings: '1000', basis: '9000' };
  input.form1099Q = [form, second];
  facts.inKindBenefits = [];
  facts.allocations = (facts.expenses ?? []).map((expense, index) => ({ sourceId: index === 0 ? form.sourceId : second.sourceId, expenseId: expense.id, amount: '5000', creditAmount: '0' }));
  return { ...fixture, second };
}

export function annualCashSeparatePeriodsFixture(year = 2025) {
  const fixture = annualCashQtpFixture(year);
  const { facts, form, second, period } = fixture;
  Object.assign(form, { grossDistribution: '5000', earnings: '2000', basis: '3000' });
  Object.assign(second, { grossDistribution: '5000', earnings: '500', basis: '4500' });
  const expense = facts.expenses?.[0], link = facts.roomBoardPeriodExpenses[0];
  if (!expense || !link) throw new Error('Missing fictional original spring receipt');
  expense.paidDate = `${year}-02-01`;
  Object.assign(link, { periodId: 'spring', coveredStart: `${year}-02-01`, coveredEnd: `${year}-05-01` });
  period.roomBoardAllowance = '3000';
  facts.roomBoardPeriods.push({ ...period, id: 'spring', academicPeriodStart: `${year}-01-15`, academicPeriodEnd: `${year}-05-20`, roomBoardAllowance: '2000' });
  return fixture;
}

/** Two actual cash originals and one unallocated tuition receipt, not computed results. */
export function annualCashReportingFixture(earnings = '1', basis = '99') {
  const fixture = annualCashQtpFixture();
  const { facts, form, second } = fixture;
  for (const original of [form, second]) Object.assign(original, { grossDistribution: '100', earnings, basis });
  const receipt = facts.expenses?.[0];
  if (!receipt) throw new Error('Missing fictional actual tuition receipt');
  facts.expenses = [{ ...receipt, id: 'tuition', category: 'postsecondary_tuition', amount: '100' }];
  facts.roomBoardPeriods = []; facts.roomBoardPeriodExpenses = []; facts.allocations = [];
  return fixture;
}
