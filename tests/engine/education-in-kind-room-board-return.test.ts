// Spec: spec/federal/form-1099-q-in-kind-room-board.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { inKindRoomBoardFixture } from '../fixtures/education-in-kind-room-board.js';

it('carries school-limited benefit earnings and tax to the actual recipient', () => {
  for (const year of [2025, 2026]) {
    const input = inKindRoomBoardFixture(year), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('50200');
    expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('200');
    expect(result.form1099Q?.netPenalty.toFixed()).toBe('20');
    expect(result.allLines.filter(row => row.form === 'Sched 1' && row.line === '8z').map(row => row.value.toFixed())).toEqual(['200']);
    expect(JSON.stringify(input)).toBe(before);
    const form = input.form1099Q?.[0], beneficiary = input.qualifiedEducationExpenses?.sourceFacts?.beneficiaries?.[0];
    if (!form || !beneficiary) throw new Error('Missing actual source');
    form.recipientOwner = 'other'; form.recipientId = 'outside';
    expect(() => calculateFederalTax(input)).toThrow(/in-kind.*recipient/);
    beneficiary.studentTaxId = '999-88-7777';
    const outside = calculateFederalTax(input);
    expect(outside.agi.toFixed()).toBe('50000'); expect(outside.form1099Q?.netPenalty.toFixed()).toBe('0');
    expect(outside.form1099Q?.perRecipient[0]?.taxableEarnings.toFixed()).toBe('200');
    expect(JSON.stringify(outside.form1099Q)).not.toContain('999-88-7777');
  }
});

it('rejects duplicate actual student aliases before applying separate school limits', () => {
  const input = inKindRoomBoardFixture(2025), facts = input.qualifiedEducationExpenses?.sourceFacts;
  const form = input.form1099Q?.[0], beneficiary = facts?.beneficiaries?.[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0];
  if (!facts || !form || !beneficiary || !expense || !benefit) throw new Error('Missing source');
  facts.beneficiaries?.push({ ...beneficiary, id: 'alias', studentTaxId: beneficiary.studentTaxId?.replaceAll('-', '') });
  input.form1099Q?.push({ ...form, sourceId: 'alias', accountId: 'alias', beneficiaryId: 'alias' });
  facts.expenses?.push({ ...expense, id: 'alias', beneficiaryId: 'alias' });
  facts.inKindBenefits?.push({ ...benefit, id: 'alias', sourceId: 'alias', expenseId: 'alias' });
  facts.allocations?.push({ sourceId: 'alias', expenseId: 'alias', amount: '4000', creditAmount: '0' });
  expect(() => calculateFederalTax(input)).toThrow(/beneficiar.*identit|student.*identit/);
});
