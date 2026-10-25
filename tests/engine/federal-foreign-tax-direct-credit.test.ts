// Spec: spec/federal/foreign-tax-direct-credit.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { foreignTaxDirectCreditFixture } from '../fixtures/foreign-tax-direct-credit.js';

describe('Canonical direct foreign tax credit election', () => {
  it('routes the elected source credit and AMT comparison once in both supported years', () => {
    for (const year of [2025, 2026]) {
      const input = foreignTaxDirectCreditFixture(year); const before = JSON.stringify(input);
      const result = calculateFederalTax(input);
      expect(result.foreignTaxCredit.toFixed()).toBe('200');
      expect(result.foreignTaxDirectCredit?.currentTaxExact.toFixed()).toBe('200.25');
      expect(result.schedule3?.lines.find(row => row.line === '1')?.value.toFixed()).toBe('200');
      expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('0');
      expect(result.allLines.some(row => row.form.startsWith('Form 1116'))).toBe(false);
      expect(result.allLines.filter(row => row.form === 'Foreign Direct Credit WS' && row.line === 'allowed-credit')).toHaveLength(1);
      expect(result.allLines.filter(row => row.form === 'Form 6251' && row.line === '10')).toHaveLength(1);
      expect(result.form6251?.lines.find(row => row.line === '10')?.value.eq(result.ordinaryTax.plus(result.capitalGainsTax).minus('200'))).toBe(true);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
  it('includes actual Part I additions in the elected regular tax limit', () => {
    const base = foreignTaxDirectCreditFixture(2026);
    const input = TaxYearInputSchema.parse({ ...base, w2s: [], form2210: {
      calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
      calculationMethod: 'regular', withholdingMethod: 'equal-installments', priorYearTaxStatus: 'no-tax-liability', priorYearFullYear: true,
      priorYearResidentAllYear: true, priorYearTaxForForm2210: '0', priorYearTaxComputationConfirmed: true,
    }, form8936: { agiAdjustmentsConfirmed: true, newCleanVehicles: [{
      owner: 'primary', vin: '1ABCDEFGH23456789', dateAcquired: '2025-09-30', datePlacedInService: '2026-01-02',
      bindingContractDate: '2025-09-30', paymentDate: '2025-09-30', bindingContractConfirmed: true,
      sellerReportReceived: true, eligibilityConfirmed: true, resoldWithin30Days: true, returnedToSellerWithin30Days: false,
      personalUsePercentage: '100', creditTransferredToDealer: true, powertrain: 'battery', criticalMineralsRequirementMet: true,
      batteryComponentsRequirementMet: true, msrp: '45000', vehicleType: 'other', sellerReportCreditAmount: '7500', creditTransferredAmount: '7500',
    }], previouslyOwnedCleanVehicles: [] } });
    const result = calculateFederalTax(input);
    // Actual ordinary taxable income is0. A7500 transferred-credit repayment is
    // regular PartI tax available to the200 direct credit, despite zero line16.
    expect(result.ordinaryTax.toFixed()).toBe('0');
    expect(result.foreignTaxDirectCredit?.regularTaxLimit.toFixed()).toBe('7500');
    expect(result.foreignTaxCredit.toFixed()).toBe('200');
    expect(result.form6251?.lines.find(row => row.line === '10')?.value.toFixed()).toBe('7300');
    expect(result.totalTax.toFixed()).toBe('7300');
  });
  it('preserves minimum tax credit capacity after the elected foreign credit', () => {
    const base = foreignTaxDirectCreditFixture();
    const input = TaxYearInputSchema.parse({ ...base, w2s: [{ ...base.w2s[0], wages: '100000' }], form8801: {
      priorYearFilingStatus: 'single', priorYearTaxableIncome: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
      priorYearRegularTax: '0', unusedMinimumTaxCreditCarryforward: '20000',
    } });
    const result = calculateFederalTax(input);
    // Actual102000 income less15750 standard deduction gives86250 taxable.
    // Published2025 single86250-86300 TaxTable gives13895; AMTI102000 gives
    // (102000-88100)*26%=3614 before the200 elected FTC and3414 after.
    expect(result.foreignTaxCredit.toFixed()).toBe('200');
    expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe('3414');
    expect(result.form8801?.lines.find(row => row.line === '22')?.value.toFixed()).toBe('13695');
    expect(result.form8801?.lines.find(row => row.line === '23')?.value.toFixed()).toBe('3414');
    expect(result.form8801?.creditAllowed.toFixed()).toBe('10281');
  });
});
