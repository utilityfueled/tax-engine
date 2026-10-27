// Spec: spec/federal/marketplace-outside-person-health.yaml, indexed2026.
// Isolated indexed-method verification; the production readiness gate stays closed.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { marketplaceOutsidePersonInput } from '../fixtures/marketplace-outside-person.js';
it('binds the isolated2026 outside credit record without opening production readiness', async () => {
  const input = marketplaceOutsidePersonInput(true), plan = input.form7206!.plans![0];
  for (const person of input.form7206!.persons!.filter(person => person.householdRole !== 'other')) person.attainedAgeAtYearEnd = 36;
  input.taxpayer.taxYear = 2026; input.form7206!.sourceTaxYear = 2026; input.form1095A[0].taxYear = 2026;
  const shared = input.form8962!.sharedPolicyAllocations!;
  shared.sourceTaxYear = 2026; shared.policies![0].original = structuredClone(input.form1095A[0]);
  shared.policies![0].noAdvanceAllocation!.sourceTaxYear = 2026;
  plan.sharedMarketplaceSources!.sourceTaxYear = 2026; plan.coverageFamilySources!.sourceTaxYear = 2026;
  plan.coverageFamilySources!.policies![0].original = structuredClone(input.form1095A[0]);
  plan.coverageFamilySources!.outsidePersonReturns![0].sourceTaxYear = 2026;
  for (const payment of plan.payments!) { payment.coverageTaxYear = 2026; payment.datePaid = payment.datePaid!.replace('2025-', '2026-'); }
  const before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('6600');
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('0');
  expect(input).toEqual(before);
  plan.coverageFamilySources!.outsidePersonReturns![0].sourceTaxYear = 2025;
  expect(() => calculateFederalTax(input)).toThrow(/outside.*return.*year/i);
  const original = await vi.importActual<typeof import('@/models/constants.js')>('@/models/constants.js');
  expect(() => original.getConstants(2026)).toThrow(/2026|qualified|supported/i);
});
