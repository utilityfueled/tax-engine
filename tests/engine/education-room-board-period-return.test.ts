// Spec: spec/federal/form-1099-q-room-board-periods.yaml. Independent derived totals.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { roomBoardPeriodFixture } from '../fixtures/education-room-board-periods.js';
it('carries the academic period result to the actual recipient once', () => {
  for (const year of [2025,2026]) {
    const {input,facts,form}=roomBoardPeriodFixture(year),before=JSON.stringify(input),result=calculateFederalTax(input);
    expect([result.agi,result.form1099Q?.taxableEarnings,result.form1099Q?.netPenalty].map(v=>v?.toFixed())).toEqual(['50800','800','80']);
    expect(result.allLines.filter(l=>l.form==='Sched 1'&&l.line==='8z').map(l=>l.value.toFixed())).toEqual(['800']);
    expect(JSON.stringify(input)).toBe(before);
    const beneficiary=facts.beneficiaries?.[0];if(!beneficiary)throw new Error('Missing original beneficiary');
    form.recipientOwner='other';form.recipientId='outside';expect(()=>calculateFederalTax(input)).toThrow(/recipient/i);
    beneficiary.studentTaxId='999-88-7777';const outside=calculateFederalTax(input);
    expect([outside.agi,outside.form1099Q?.netPenalty].map(v=>v?.toFixed())).toEqual(['50000','0']);
    expect(outside.form1099Q?.perRecipient[0]?.taxableEarnings.toFixed()).toBe('800');
  }
});
