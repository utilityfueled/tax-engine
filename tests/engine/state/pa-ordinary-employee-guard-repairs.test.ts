/** Spec: spec/state/pa-ordinary-employee-sources.yaml independentReviewRepairs. */
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';
function setup() { const f = paOrdinaryEmployeeFixture(); const row = f.packet.employers[0]; if (!row) throw new Error('Actual repair fixture requires employer original'); return { f, row }; }
function paired(method: 'fixed_allowance_not_w2' | 'exact_accounted_not_w2', amount: string, copies = 1) {
  const { f, row } = setup();
  row.ue.reimbursements = Array.from({ length: copies }, (_, i) => ({ sourceReference: `Actual repair original reimbursement ${i}`, paidOn: '2025-05-01', amount, method, expenseReferences: row.ue.expenses.map(e => e.sourceReference), includedInW2Confirmed: false }));
  for (const e of row.ue.expenses) { e.reimbursementMethod = method; e.reimbursementReferences = row.ue.reimbursements.map(r => r.sourceReference); }
  return { f, row };
}
it('actual employee repair rejects taxable fixed allowance excess', () => {
  const { f, row } = paired('fixed_allowance_not_w2', '1500');
  expect(row.ue.expenses.map(e => e.amount)).toEqual(Array(10).fill('100'));
  expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/reimburse|excess|actual|method/i);
});
it('actual employee repair rejects aggregate exact reimbursement excess', () => {
  const { f, row } = paired('exact_accounted_not_w2', '1000', 2);
  expect(row.ue.reimbursements.map(r => r.amount)).toEqual(['1000', '1000']);
  expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/reimburse|excess|actual|method/i);
});
it('actual employee repair isolates connected receipt groups before aggregate excess', () => {
  const { f, row } = setup(), first = row.ue.expenses[0];
  if (!first) throw new Error('Actual repair fixture requires first receipt');
  row.ue.reimbursements = [0, 1].map(i => ({ sourceReference: `Actual duplicated100 group ${i}`, paidOn: '2025-05-01', amount: '100', method: 'exact_accounted_not_w2', expenseReferences: [first.sourceReference], includedInW2Confirmed: false }));
  row.ue.reimbursements.push({ sourceReference: 'Actual disjoint900 group allowance1', paidOn: '2025-05-01', amount: '1', method: 'fixed_allowance_not_w2', expenseReferences: row.ue.expenses.slice(1).map(e => e.sourceReference), includedInW2Confirmed: false });
  first.reimbursementMethod = 'exact_accounted_not_w2'; first.reimbursementReferences = row.ue.reimbursements.slice(0, 2).map(r => r.sourceReference);
  for (const expense of row.ue.expenses.slice(1)) { expense.reimbursementMethod = 'fixed_allowance_not_w2'; expense.reimbursementReferences = ['Actual disjoint900 group allowance1']; }
  expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/reimburse|excess|actual|method/i);
});
it('actual employee repair requires original Box8 monetary fact', () => {
  const { f, row } = setup(); Reflect.deleteProperty(f.input.w2s[0], 'allocatedTips'); row.originalW2 = structuredClone(f.input.w2s[0]);
  expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/original|Box8|known|actual|source/i);
});
it('actual employee repair preserves mixed integer and fractional raw sources', () => {
  const { f, row } = setup(), precision = Decimal.precision;
  row.ue.expenses = row.ue.expenses.slice(0, 2); const [large, tiny] = row.ue.expenses;
  if (!large || !tiny) throw new Error('Actual repair fixture requires distinct two receipts');
  large.amount = '1' + '0'.repeat(140); tiny.amount = '0.' + '0'.repeat(140) + '1';
  const result = calculatePAOrdinaryEmployeeSources(f.input, f.packet).perEmployer[0];
  if (!result) throw new Error('Actual repair projection missing');
  expect(result.rawAllowableExpenses.toFixed()).toBe('1' + '0'.repeat(140) + '.' + '0'.repeat(140) + '1');
  expect(Decimal.precision).toBe(precision);
});
it('actual employee repair retains incomplete included-in-W2 method guard', () => {
  const { f, row } = paired('fixed_allowance_not_w2', '1500');
  row.ue.reimbursements[0].includedInW2Confirmed = true;
  for (const expense of row.ue.expenses) expense.reimbursementMethod = 'included_in_w2';
  expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/reimburse|actual|method|source/i);
});
