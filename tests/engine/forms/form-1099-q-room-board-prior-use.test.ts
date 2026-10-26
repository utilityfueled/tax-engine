// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml; derived source controls.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { roomBoardPriorUseFixture } from '../../fixtures/education-room-board-prior-use.js';
const calculate = (fixture: ReturnType<typeof roomBoardPriorUseFixture>) => calculateForm1099Q(fixture.input.form1099Q ?? [], fixture.input.qualifiedEducationExpenses, { taxYear: fixture.input.taxpayer.taxYear });
const values = (fixture: ReturnType<typeof roomBoardPriorUseFixture>) => {
  const r = calculate(fixture);
  return [r.adjustedQEE, r.taxFreeEarnings, r.taxableEarnings, r.netPenalty].map(x => x.toFixed());
};
it('uses actual prior cost before assistance without resetting the period cap', () => {
  for (const year of [2025, 2026]) for (const medium of ['cash', 'in_kind_prepaid_tuition'] as const) {
    const f = roomBoardPriorUseFixture(year);
    f.form.distributionMedium = medium;
    if (medium === 'cash') f.facts.inKindBenefits = [];
    const before = JSON.stringify(f.input);
    expect(values(f)).toEqual(['1000', '200', '1800', '180']);
    expect(JSON.stringify(f.input)).toBe(before);
  }
});
it('distinguishes empty unknown and first-year period histories', () => {
  const f = roomBoardPriorUseFixture();
  f.facts.roomBoardPriorUses = []; f.facts.roomBoardPriorUseExpenses = [];
  expect(values(f)).toEqual(['6000', '1200', '800', '80']);
  Object.assign(f.facts, { roomBoardPriorUses: undefined });
  expect(() => calculate(f)).toThrow(/history|prior/i);
  f.facts.roomBoardPriorUses = [];
  Object.assign(f.period, { priorUseHistoryConfirmed: undefined });
  expect(() => calculate(f)).toThrow(/history|prior/i);
  Object.assign(f.period, { priorUseHistoryConfirmed: true, academicPeriodStart: '2025-01-01', academicPeriodEnd: '2026-01-15' });
  expect(values(f)).toEqual(['6000', '1200', '800', '80']);
});
it('rejects contradictory historical worksheets and original receipts', () => {
  for (const change of ['institution', 'beneficiary', 'date', 'allowance', 'year', 'duplicate-receipt', 'duplicate-use', 'excess', 'adjusted', 'unknown-zero', 'unconfirmed', 'changed-after-filing']) {
    const f = roomBoardPriorUseFixture();
    if (change === 'institution') f.history.institutionId = 'replaced';
    if (change === 'beneficiary') f.history.beneficiaryId = 'replaced';
    if (change === 'date') f.history.academicPeriodEnd = '2025-06-19';
    if (change === 'allowance') f.history.roomBoardAllowance = '6001';
    if (change === 'year') f.history.sourceTaxYear = 2025;
    if (change === 'duplicate-receipt') f.facts.roomBoardPriorUseExpenses.push({ ...f.receipt });
    if (change === 'duplicate-use') f.facts.roomBoardPriorUses.push({ ...f.history });
    if (change === 'excess') f.history.qualifiedCostBeforeAssistance = '6001';
    if (change === 'adjusted') f.history.adjustedQualifiedExpenses = '4001';
    if (change === 'unknown-zero') Object.assign(f.receipt, { refundedAmount: undefined });
    if (change === 'unconfirmed') f.history.sourceFactsConfirmed = false;
    if (change === 'changed-after-filing') f.history.noPostFilingChangesConfirmed = false;
    expect(() => calculate(f), change).toThrow(/history|prior|period/i);
  }
});
it('coordinates actual current ESA choices after historical use', () => {
  const f = roomBoardPriorUseFixture(2025, true);
  expect(values(f)).toEqual(['1000', '200', '2800', '280']);
  const first = f.facts.roomBoardEsaAllocations[0];
  if (!first) throw new Error('Missing fictional actual allocation');
  first.amount = '301';
  expect(() => calculate(f)).toThrow(/allocation|capacity/i);
});
it('retains exact historical amounts and a fully consumed cap', () => {
  const f = roomBoardPriorUseFixture(); const precision = Decimal.precision;
  f.receipt.amount = '6000'; f.history.qualifiedCostBeforeAssistance = '6000'; f.history.adjustedQualifiedExpenses = '5000';
  expect(values(f)).toEqual(['0', '0', '2000', '200']);
  f.receipt.amount = '6000.00000000000000000000000000000000000000001';
  f.history.qualifiedCostBeforeAssistance = f.receipt.amount;
  f.history.adjustedQualifiedExpenses = '5000.00000000000000000000000000000000000000001';
  expect(() => calculate(f)).toThrow(/history|prior|cap|period/i);
  expect(Decimal.precision).toBe(precision);
});
it('reconciles chronological historical cost without an allowance override', () => {
  const f = roomBoardPriorUseFixture();
  f.history.qualifiedCostBeforeAssistance = '4999'; f.history.adjustedQualifiedExpenses = '3999';
  expect(() => calculate(f)).toThrow(/prior|history/i);
  f.history.qualifiedCostBeforeAssistance = '5000'; f.history.adjustedQualifiedExpenses = '4000';
  f.history.beneficiaryName = 'Replaced actual student';
  expect(() => calculate(f)).toThrow(/prior|history/i);
  f.history.beneficiaryName = f.facts.beneficiaries?.[0]?.name;
  f.receipt.educationCreditAmount = '1';
  expect(() => calculate(f)).toThrow(/prior|history/i);
  f.receipt.educationCreditAmount = '0';
  // Two complete prior years for one actual long period, supplied out of order.
  f.period.academicPeriodStart = '2023-08-15'; f.history.academicPeriodStart = '2023-08-15';
  f.receipt.amount = '4000'; f.history.qualifiedCostBeforeAssistance = '3000'; f.history.adjustedQualifiedExpenses = '2000';
  const older = { ...f.history, id: 'older-worksheet', sourceTaxYear: 2023, qualifiedCostBeforeAssistance: '3000', adjustedQualifiedExpenses: '2500' };
  const earlierReceipt = { ...f.receipt, id: 'older-receipt', priorUseId: older.id, paidDate: '2023-09-01', coveredStart: '2023-09-01', coveredEnd: '2023-12-01', amount: '3000', taxFreeAssistance: '500' };
  f.facts.roomBoardPriorUses.push(older); f.facts.roomBoardPriorUseExpenses.push(earlierReceipt);
  expect(values(f)).toEqual(['0', '0', '2000', '200']);
  f.facts.roomBoardPriorUses.reverse(); f.facts.roomBoardPriorUseExpenses.reverse();
  expect(values(f)).toEqual(['0', '0', '2000', '200']);
});
it('keeps earlier statutory cap history outside the current source method', () => {
  const f = roomBoardPriorUseFixture();
  f.period.academicPeriodStart = '2001-08-15'; f.history.academicPeriodStart = '2001-08-15';
  f.history.sourceTaxYear = 2001; f.receipt.paidDate = '2001-09-01';
  f.receipt.coveredStart = '2001-09-01'; f.receipt.coveredEnd = '2001-12-01';
  expect(() => calculate(f)).toThrow(/prior|historical|2002/i);
});
