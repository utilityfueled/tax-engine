// Spec: spec/federal/form-1099-q-annual-cash.yaml. Derived original-source controls.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { annualCashQtpFixture, annualCashSeparatePeriodsFixture, annualCashReportingFixture } from '../../fixtures/education-annual-cash.js';
import { roomBoardPriorUseFixture } from '../../fixtures/education-room-board-prior-use.js';
import { roomBoardEsaPeriodFixture } from '../../fixtures/education-room-board-periods.js';

const calculate = (input: ReturnType<typeof annualCashQtpFixture>['input']) => calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer });
const byId = (input: ReturnType<typeof annualCashQtpFixture>['input']) => Object.fromEntries(calculate(input).perDistribution.map(row => [row.sourceId, row.taxableEarnings.toFixed()]));

it('applies the annual fraction to unequal original cash earnings', () => {
  for (const year of [2025, 2026]) {
    const { input, facts } = annualCashQtpFixture(year), before = JSON.stringify(input);
    expect(byId(input)).toEqual({ 'cash-first': '2800', 'cash-second': '700' });
    const result = calculate(input);
    expect([result.adjustedQEE, result.taxableEarnings, result.netPenalty].map(v => v.toFixed())).toEqual(['6000', '3500', '350']);
    expect(JSON.stringify(input)).toBe(before);
    input.form1099Q.reverse(); facts.allocations?.reverse(); facts.expenses?.reverse();
    expect(byId(input)).toEqual({ 'cash-first': '2800', 'cash-second': '700' });
  }
});

it('combines disjoint period capacities before the cash fraction', () => {
  const { input, facts } = annualCashSeparatePeriodsFixture(), before = JSON.stringify(input);
  expect(byId(input)).toEqual({ 'cash-first': '1000', 'cash-second': '250' });
  expect(calculate(input).netPenalty.toFixed()).toBe('125');
  expect(JSON.stringify(input)).toBe(before);
  facts.roomBoardPeriods.reverse(); input.form1099Q.reverse();
  expect(byId(input)).toEqual({ 'cash-first': '1000', 'cash-second': '250' });
});

it('includes an annual cash original with no receipt allocation', () => {
  const { input, facts, second } = annualCashQtpFixture();
  Object.assign(second, { grossDistribution: '5000', earnings: '500', basis: '4500' });
  for (const row of facts.allocations ?? []) row.sourceId = 'cash-first';
  const original = JSON.stringify(facts.allocations);
  expect(byId(input)).toEqual({ 'cash-first': '2400', 'cash-second': '300' });
  expect(calculate(input).adjustedQEE.toFixed()).toBe('6000');
  expect(JSON.stringify(facts.allocations)).toBe(original);
});

it('keeps determined prepaid priority outside the cash denominator', () => {
  const { input, facts, form, period } = annualCashQtpFixture();
  const expense = facts.expenses?.[0];
  if (!expense) throw new Error('Missing fictional original room receipt');
  facts.expenses = [{ ...expense, id: 'provided-room', amount: '4000' }, { ...expense, id: 'cash-room', amount: '6000' }];
  const link = facts.roomBoardPeriodExpenses[0];
  if (!link) throw new Error('Missing fictional period receipt');
  facts.roomBoardPeriodExpenses = facts.expenses.map(row => ({ ...link, expenseId: row.id }));
  period.roomBoardAllowance = '8000';
  input.form1099Q.push({ ...form, sourceId: 'provided', accountId: 'fictional-provided', distributionMedium: 'in_kind_prepaid_tuition', grossDistribution: '4000', earnings: '800', basis: '3200' });
  facts.inKindBenefits = [{ id: 'benefit', sourceId: 'provided', expenseId: 'provided-room', amount: '4000', providedDate: '2025-09-01', qualificationConfirmed: true, sourceReference: 'Fictional actual provided benefit' }];
  facts.allocations = [{ sourceId: 'provided', expenseId: 'provided-room', amount: '4000', creditAmount: '0' }, ...['cash-first', 'cash-second'].map(sourceId => ({ sourceId, expenseId: 'cash-room', amount: '3000', creditAmount: '0' }))];
  expect(byId(input)).toEqual({ provided: '0', 'cash-first': '3200', 'cash-second': '800' });
  expect(calculate(input).adjustedQEE.toFixed()).toBe('8000');
});

it('rejects unknown or contradictory annual pool sources', () => {
  for (const mutation of ['confirmation', 'earnings', 'recipient', 'year', 'duplicate', 'capacity']) {
    const { input, facts, form, second } = annualCashQtpFixture();
    if (mutation === 'confirmation') facts.allDistributionsReconciled = undefined;
    if (mutation === 'earnings') second.earnings = undefined;
    if (mutation === 'recipient') { second.recipientOwner = 'other'; second.recipientId = 'another-person'; }
    if (mutation === 'year') second.taxYear = 2024;
    if (mutation === 'duplicate') second.sourceId = form.sourceId;
    if (mutation === 'capacity') { second.grossDistribution = '4000'; second.earnings = '1000'; second.basis = '3000'; }
    const before = JSON.stringify(input);
    expect(() => calculate(input)).toThrow();
    expect(JSON.stringify(input)).toBe(before);
  }
  const esa = roomBoardEsaPeriodFixture();
  expect(calculate(esa.input).taxableEarnings.toFixed()).toBe('1800');
  esa.period.esaAllocationConfirmed = undefined;
  expect(() => calculate(esa.input)).toThrow(/ESA|coordination|allocation/);
});

it('keeps source cents before the reporting boundary', () => {
  const { input, facts, form, second, period } = annualCashQtpFixture();
  Object.assign(form, { grossDistribution: '1000', earnings: '100.50', basis: '899.50' });
  Object.assign(second, { grossDistribution: '1000', earnings: '101.50', basis: '898.50' });
  for (const expense of facts.expenses ?? []) expense.amount = '1000';
  for (const row of facts.allocations ?? []) row.amount = '1000';
  period.roomBoardAllowance = '666.66';
  const precision = Decimal.precision, before = JSON.stringify(input);
  expect(byId(input)).toEqual({ 'cash-first': '67.000335', 'cash-second': '67.667005' });
  expect(calculate(input).taxableEarnings.toFixed()).toBe('135');
  expect(calculate(input).perDistribution.map(row => row.earnings.toFixed())).toEqual(['100.5', '101.5']);
  expect(JSON.stringify(input)).toBe(before); expect(Decimal.precision).toBe(precision);
  second.grossDistribution = '1000.00000000000000000000000000000000000000001';
  second.basis = '898.50000000000000000000000000000000000000001';
  expect(calculate(input).taxableEarnings.toFixed()).toBe('135');
  expect(calculate(input).perDistribution[1]?.grossDistribution.toFixed()).toBe(second.grossDistribution);
  second.grossDistribution = '1000';
  expect(() => calculate(input)).toThrow(/Box|original|source|reconcile/);
});

it('preserves the actual tuition ledger while deriving annual capacity', () => {
  const { input, facts } = annualCashQtpFixture();
  const expense = facts.expenses?.[0];
  if (!expense) throw new Error('Missing fictional tuition receipt');
  facts.expenses = [{ ...expense, id: 'tuition', category: 'postsecondary_tuition', amount: '6000' }];
  facts.roomBoardPeriods = []; facts.roomBoardPeriodExpenses = [];
  facts.allocations = [{ sourceId: 'cash-first', expenseId: 'tuition', amount: '6000', creditAmount: '0' }];
  const before = JSON.stringify(input);
  expect(byId(input)).toEqual({ 'cash-first': '2800', 'cash-second': '700' });
  expect(JSON.stringify(input)).toBe(before);
  facts.expenses[0].qualificationConfirmed = false;
  expect(byId(input)).toEqual({ 'cash-first': '4000', 'cash-second': '1000' });
  facts.expenses[0].qualificationConfirmed = undefined;
  expect(() => calculate(input)).toThrow(/qualification/);
});

it('separates annual credit exceptions and actual prior period use', () => {
  const { input, facts } = annualCashQtpFixture(), expense = facts.expenses?.[0];
  if (!expense) throw new Error('Missing fictional tuition receipt');
  facts.expenses = [{ ...expense, id: 'tuition', category: 'postsecondary_tuition', amount: '10000', educationCreditAmount: '4000' }];
  facts.roomBoardPeriods = []; facts.roomBoardPeriodExpenses = [];
  facts.allocations = [{ sourceId: 'cash-first', expenseId: 'tuition', amount: '6000', creditAmount: '4000' }];
  const result = calculate(input);
  expect(result.perDistribution.map(row => [row.taxableEarnings, row.creditException].map(v => v.toFixed()))).toEqual([['2800','800'],['700','200']]);
  expect([result.penaltyExceptionAmount, result.netPenalty].map(v => v.toFixed())).toEqual(['1000','250']);
  const old = roomBoardPriorUseFixture();
  old.form.distributionMedium = 'cash'; old.form.earnings = '4000'; old.form.basis = '6000'; old.facts.inKindBenefits = [];
  old.input.form1099Q.push({ ...old.form, sourceId: 'second-cash', accountId: 'second-actual', earnings: '1000', basis: '9000' });
  const current = calculate(old.input);
  expect([current.adjustedQEE, current.taxableEarnings, current.netPenalty].map(v => v.toFixed())).toEqual(['1000','4750','475']);
});
it('keeps known special original facts outside the ordinary annual pool', () => {
  for (const kind of ['correction', 'prohibited', 'transfer', 'outside-plan']) {
    const { input, second } = annualCashQtpFixture();
    if (kind === 'correction') second.returnedContributionNetIncome = '10';
    if (kind === 'prohibited') second.prohibitedTransactionBasis = '20';
    if (kind === 'transfer') second.transfer = { kind: 'none', amount: '10' };
    if (kind === 'outside-plan') { const person = input.qualifiedEducationExpenses?.sourceFacts?.beneficiaries?.[0]; if (!person) throw new Error('Missing fictional beneficiary'); person.outsideK12QualifiedDistributions = '1'; }
    const before = JSON.stringify(input);
    expect(() => calculate(input)).toThrow(/ordinary|transfer|correction|source|prohibited/i);
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('rounds annual return and recipient totals after adding exact source cents', () => {
  for (const [earnings,basis,taxable,excluded,tax] of [['1','99','1','1','0'],['4.50','95.50','5','5','1']]) {
    const { input } = annualCashReportingFixture(earnings,basis), before = JSON.stringify(input);
    const result=calculate(input), recipient=result.perRecipient[0];
    expect([result.taxableEarnings,result.taxFreeEarnings,result.netPenalty].map(v=>v.toFixed())).toEqual([taxable,excluded,tax]);
    expect([recipient?.taxableEarnings,recipient?.additionalTax].map(v=>v?.toFixed())).toEqual([taxable,tax]);
    expect(result.perDistribution.map(row=>row.taxableEarnings.toFixed())).toEqual(earnings==='1'?['0.5','0.5']:['2.25','2.25']);
    expect(JSON.stringify(input)).toBe(before);
    input.form1099Q.reverse();
    expect(calculate(input).taxableEarnings.toFixed()).toBe(taxable);
  }
  const credit=annualCashReportingFixture('1.50','98.50'), receipt=credit.facts.expenses?.[0];
  if(!receipt)throw new Error('Missing fictional credit receipt');
  receipt.educationCreditAmount='40';
  const result=calculate(credit.input);
  expect([result.taxableEarnings,result.taxFreeEarnings,result.penaltyExceptionAmount,result.creditAllocations[0]?.taxableEarningsCausedByCredit].map(v=>v?.toFixed())).toEqual(['2','1','1','1']);
  expect(result.perDistribution.map(row=>[row.taxableEarnings,row.creditException,row.penaltyException].map(v=>v.toFixed()))).toEqual([['1.05','0.3','0.3'],['1.05','0.3','0.3']]);
  const noncredit=annualCashReportingFixture('5','95');
  noncredit.facts.penaltyExceptions=noncredit.input.form1099Q.map(form=>({id:`exception-${form.sourceId}`,sourceId:form.sourceId??'',kind:'scholarship',distributionAmount:'10',qualifyingAmount:'10',eligibilityConfirmed:true}));
  const other=calculate(noncredit.input);
  expect([other.taxableEarnings,other.penaltyExceptionAmount,other.netPenalty].map(v=>v.toFixed())).toEqual(['5','1','0']);
  expect(other.perDistribution.map(row=>row.penaltyException.toFixed())).toEqual(['0.5','0.5']);
  const outside=annualCashReportingFixture();
  for(const form of outside.input.form1099Q){form.recipientOwner='other';form.recipientId='actual-other-recipient';}
  const otherRecipient=calculate(outside.input);
  expect(otherRecipient.taxableEarnings.toFixed()).toBe('0');
  expect(otherRecipient.perRecipient[0]?.taxableEarnings.toFixed()).toBe('1');
  const repeating=annualCashReportingFixture('0.10','99.90');
  Object.assign(repeating.second,{grossDistribution:'200',earnings:'0.65',basis:'199.35'});
  expect(calculate(repeating.input).taxableEarnings.toFixed()).toBe('1');
  const joint=annualCashReportingFixture('0.50','99.50'), person=joint.facts.beneficiaries?.[0], tuition=joint.facts.expenses?.[0];
  if(!person||!tuition)throw new Error('Missing fictional actual joint originals');
  joint.input.taxpayer.filingStatus='married_filing_jointly';
  joint.input.taxpayer.spouse={...joint.input.taxpayer.primary,firstName:'Alex',ssn:'987-65-4321'};
  joint.facts.beneficiaries?.push({...person,id:'spouse-student',name:'Alex Doe',studentTaxId:'987-65-4321'});
  joint.facts.expenses?.push({...tuition,id:'spouse-tuition',beneficiaryId:'spouse-student'});
  joint.input.form1099Q.push(...joint.input.form1099Q.map(form=>({...form,sourceId:`spouse-${form.sourceId}`,accountId:`spouse-${form.accountId}`,beneficiaryId:'spouse-student',recipientOwner:'spouse' as const})));
  const jointResult=calculate(joint.input);
  expect(jointResult.perRecipient.map(row=>row.taxableEarnings.toFixed())).toEqual(['1','1']);
  expect(jointResult.taxableEarnings.toFixed()).toBe('1');
});
