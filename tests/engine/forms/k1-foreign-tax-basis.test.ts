// Spec: spec/federal/k1-foreign-tax-basis.yaml
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule.js';
import { ScheduleK1Schema, TaxYearInputSchema } from '@/models/inputs.js';
import { buildPartnerBasisScheduleReferenceSummary } from '@/pdf/mappings/2025/fill-partner-basis-schedule.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
const k1 = (overrides: Record<string, unknown>) => ScheduleK1Schema.parse({ taxYear: 2025, partnershipName: 'Fictional Fund', partnershipEIN: '12-3456789',
  accountHolder: 'primary', ordinaryIncome: '0', foreignTaxPaid: '100', ...overrides });
const category = (result: ReturnType<typeof calculatePartnerBasisSchedule>, key: string) => result.lossCategories.find(row => row.key === key);
const federal = (beginningBasis: string | undefined, overrides: Record<string, unknown> = {}) => calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture,
  scheduleK1: [{ taxYear: 2025, partnershipName: 'Fictional Fund', partnershipEIN: '12-3456789', accountHolder: 'primary', ordinaryIncome: '0', foreignTaxPaid: '100', ...(beginningBasis === undefined ? {} : { beginningBasis }), ...overrides }] }));

describe('K-1 foreign tax in the basis schedule', () => {
  it('lowers ending basis by the foreign tax', () => {
    const result = calculatePartnerBasisSchedule(k1({ beginningBasis: '1000' }));
    expect(result.totalAllowedLosses.toFixed()).toBe('100');
    expect(result.endingBasis.toFixed()).toBe('900');
    expect(category(result, 'foreignTax')?.suspended.toFixed()).toBe('0');
  });
  it('shares a short basis with losses pro rata', () => {
    const result = calculatePartnerBasisSchedule(k1({ beginningBasis: '300', ordinaryIncome: '-300' }));
    expect(category(result, 'ordinary')?.allowed.toFixed()).toBe('225');
    expect(result.suspendedLossCarryforward.ordinary.toFixed()).toBe('75');
    expect(category(result, 'foreignTax')?.allowed.toFixed()).toBe('75');
    expect(result.suspendedLossCarryforward.foreignTax.toFixed()).toBe('25');
    expect(result.endingBasis.toFixed()).toBe('0');
  });
  it('follows nondeductible costs and can use debt basis', () => {
    const result = calculatePartnerBasisSchedule(k1({ entityType: 's_corporation', beginningBasis: '100', nondeductibleExpenses: '100', beginningDebtBasis: '40', additionalLoansToScorp: '0', priorDebtBasisReduction: '0', foreignTaxPaid: '40' }));
    expect(result.basisAvailableForLosses.toFixed()).toBe('0');
    expect(result.debtBasis?.lossesAppliedToDebtBasis.toFixed()).toBe('40');
    expect(result.suspendedLossCarryforward.foreignTax.toFixed()).toBe('0');
    expect(result.endingBasis.toFixed()).toBe('0');
  });
  it('leaves a K-1 without a beginning basis unchanged', () => {
    const result = federal(undefined);
    expect(result.scheduleE?.partnerships[0]?.basisResult).toBeUndefined();
    expect(result.agi.toFixed()).toBe(federal('100').agi.toFixed());
    expect(result.totalTax.toFixed()).toBe(federal('100').totalTax.toFixed());
  });
  it('ignores a negative foreign tax amount', () => {
    const result = calculatePartnerBasisSchedule(k1({ beginningBasis: '1000', foreignTaxPaid: '-100' }));
    expect(category(result, 'foreignTax')?.total.toFixed()).toBe('0');
    expect(result.endingBasis.toFixed()).toBe('1000');
  });
  it('leaves a K-1 with no foreign tax unchanged', () => {
    const result = calculatePartnerBasisSchedule(k1({ beginningBasis: '500', ordinaryIncome: '-200', foreignTaxPaid: '0' }));
    expect(result.totalLosses.toFixed()).toBe('200');
    expect(result.endingBasis.toFixed()).toBe('300');
    expect(result.lines.some(row => row.line === 'foreign-tax')).toBe(false);
  });
  it('shows the foreign tax on its own review line', () => {
    const line = calculatePartnerBasisSchedule(k1({ beginningBasis: '1000' })).lines.find(row => row.line === 'foreign-tax');
    expect(line?.value.toFixed()).toBe('100');
    expect(buildPartnerBasisScheduleReferenceSummary(federal('100')).sections[0]?.lines.some(row => row.line === 'foreign-tax')).toBe(true);
  });
  it('keeps the distribution gain and follows distributions', () => {
    const result = calculatePartnerBasisSchedule(k1({ beginningBasis: '0', ordinaryIncome: '50', distributions: '100', foreignTaxPaid: '40' }));
    expect(result.excessDistributionGain.toFixed()).toBe('50');
    expect(result.basisAvailableForLosses.toFixed()).toBe('0');
    expect(result.suspendedLossCarryforward.foreignTax.toFixed()).toBe('40');
  });
  it('counts foreign tax in the net increase that restores debt basis', () => {
    const result = calculatePartnerBasisSchedule(k1({ entityType: 's_corporation', beginningBasis: '100', ordinaryIncome: '100', foreignTaxPaid: '150', beginningDebtBasis: '50', additionalLoansToScorp: '0', priorDebtBasisReduction: '200' }));
    expect(result.debtBasis?.restoration.toFixed()).toBe('0');
    expect(result.endingBasis.toFixed()).toBe('50');
    expect(result.debtBasis?.endingDebtBasis.toFixed()).toBe('50');
  });
  it('rejects a return with suspended foreign tax', () => {
    expect(() => federal('10')).toThrow(/Fictional Fund.*foreign tax.*suspended/iu);
    expect(() => federal('99.60')).toThrow(/Fictional Fund.*foreign tax.*suspended/iu);
    // Dollar rounding puts this shortfall on the ordinary loss, and foreign tax still shares it.
    expect(() => federal('1999.60', { ordinaryIncome: '-1000', foreignTaxPaid: '1000' })).toThrow(/foreign tax.*suspended/iu);
    expect(() => federal('1999.60', { ordinaryIncome: '-999', foreignTaxPaid: '1001' })).toThrow(/foreign tax.*suspended/iu);
    expect(federal('100').scheduleE?.partnerships[0]?.basisResult?.endingBasis.toFixed()).toBe('0');
  });
});
