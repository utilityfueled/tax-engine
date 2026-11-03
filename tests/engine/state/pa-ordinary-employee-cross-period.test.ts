/** Spec: spec/state/pa-ordinary-employee-sources.yaml crossPeriodEmployeeBoundary. */
import { expect, it } from 'vitest';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';

it('actual NR employment and UE do not become resident-period expenses merely because wages arrive after the move', () => {
  const f = paOrdinaryEmployeeFixture('part_year');
  const employer = f.packet.employers[0], wage = f.residency.wages[0];
  if (!employer || !wage || !employer.payroll[0] || !wage.payroll[0]) throw new Error('Actual cross-period fixture requires complete employment and payroll originals');
  // The fictional actual receipt happens after the Oct1 move. Calendar services
  // and all ten paid expense receipts remain in the earlier NR period.
  employer.payroll[0].paidOn = '2025-10-01';
  wage.payroll[0].paidOn = '2025-10-01';
  expect(employer.employmentPeriods).toEqual([{ from: '2025-01-01', through: '2025-09-17', sourceReference: 'Fictional actual hire and termination record' }]);
  expect(f.input.w2s[0].wages).toBe('75000');
  expect(employer.ue.expenses.map(row => row.amount)).toEqual(Array(10).fill('100'));
  expect(employer.ue.expenses.every(row => row.paidOn < '2025-10-01')).toBe(true);
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/cross.period|period.*method|employee.*period|cash.*period/i);
});
