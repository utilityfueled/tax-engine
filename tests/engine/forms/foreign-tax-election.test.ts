// Spec: spec/federal/foreign-tax-election.yaml.
import { describe, expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { resolveForeignTaxElection } from '@/engine/forms/foreign-tax-election.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const source = (sourceId = 'form1099Int:0') => ({
  sourceId, payerName: 'Synthetic foreign bank', payerTin: '112233445', accountReference: 'Synthetic investment account A',
  owner: 'primary', foreignCountry: 'Canada', jurisdictionType: 'foreign_country', reportedTaxAmount: '600.75',
  qualifiedIncomeTaxConfirmed: true, taxOnExcludedIncome: '0.25', taxDeductedElsewhere: '0',
  payments: [{ date: '2025-03-15', amountUsd: '300.25' }, { date: '2025-09-15', amountUsd: '300.50' }],
  investmentAllocableAmount: '400.25', allocationMethodDescription: 'Actual completed allocation of included investment income tax',
  sourceReference: 'Actual synthetic recipient statement and withholding detail',
});
const election = () => ({ taxYear: 2025, election: 'deduction', accountingMethod: 'paid', priorAccruedCreditElection: false,
  sourceReference: 'Actual synthetic annual foreign income tax election', sourceFactsConfirmed: true,
  allQualifiedForeignTaxesIncludedConfirmed: true, noUnusedCreditCarryoversConfirmed: true, noRedeterminationsConfirmed: true,
  sources: [source()] });
const fixture = (changes: Record<string, unknown> = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  form1099Int: [{ payer: 'Synthetic foreign bank', payerTin: '112233445', accountReference: 'Synthetic investment account A', accountHolder: 'primary',
    interestIncome: '20000', foreignTaxPaid: '600.75', foreignCountry: 'Canada' }], foreignTaxElection: election(), ...changes });

describe('Actual annual foreign income tax election', () => {
  it('preserves unknown annual election and source facts', () => {
    const actual = fixture({ foreignTaxElection: { sources: [{}] } });
    expect(actual.foreignTaxElection?.election).toBeUndefined();
    expect(actual.foreignTaxElection?.sources?.[0]?.taxOnExcludedIncome).toBeUndefined();
    expect(actual.foreignTaxElection?.priorAccruedCreditElection).toBeUndefined();
    expect(() => resolveForeignTaxElection(actual)).toThrow(/actual|confirm|election/i);
  });
  it('reconciles the actual annual paid-tax deduction and investment allocation', () => {
    const actual = fixture();
    const result = resolveForeignTaxElection(actual);
    // Actual payments600.75 minus excluded-income tax0.25=600.50; preserve cents until each physical-line aggregate.
    expect(result.scheduleAForeignIncomeTaxes.toFixed()).toBe('600.5');
    expect(result.niitForeignIncomeTaxes.toFixed()).toBe('400.25');
    expect(result.election).toBe('deduction');
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.lines.some(line => line.value.toFixed() === '600.5')).toBe(true);
    expect(actual.foreignTaxElection?.sources?.[0]?.reportedTaxAmount).toBe('600.75');
  });
  it('keeps annual credit and deduction mutually exclusive', () => {
    const actual = fixture({ foreignTaxElection: { ...election(), election: 'credit', sources: undefined } });
    const credit = resolveForeignTaxElection(actual);
    expect(credit.election).toBe('credit');
    expect(credit.scheduleAForeignIncomeTaxes.isZero()).toBe(true);
    expect(credit.niitForeignIncomeTaxes.isZero()).toBe(true);
    const legacy = resolveForeignTaxElection(fixture({ foreignTaxElection: undefined }));
    expect(legacy.election).toBe('unverified_credit');
    expect(legacy.sourceFactsVerified).toBe(false);
    expect(legacy.scheduleAForeignIncomeTaxes.isZero()).toBe(true);
    expect(() => resolveForeignTaxElection(fixture({ foreignTaxElection: { ...election(), election: 'credit' } }))).toThrow(/deduction|allocation/i);
  });
  it('rejects known deductions and unprocessed source facts in a credit election', () => {
    for (const changes of [{ taxDeductedElsewhere: '100' }, { taxOnExcludedIncome: '100' }, { qualifiedIncomeTaxConfirmed: false }, {}]) {
      const actual = fixture({ foreignTaxElection: { ...election(), election: 'credit', sources: [{ ...source(), investmentAllocableAmount: '0', ...changes }] } });
      expect(() => resolveForeignTaxElection(actual)).toThrow(/deduction|credit.*source/i);
    }
  });
  it('rejects missing conflicting duplicate and stale tax sources', () => {
    for (const change of [{ sourceId: 'form1099Int:1' }, { payerName: 'Another bank' }, { payerTin: '998887777' },
      { accountReference: 'Replacement account B' }, { owner: 'spouse' }, { foreignCountry: 'France' },
      { reportedTaxAmount: '601' }, { taxOnExcludedIncome: undefined }, { taxOnExcludedIncome: '601' },
      { investmentAllocableAmount: '-1' }, { investmentAllocableAmount: '600.51' }, { qualifiedIncomeTaxConfirmed: false },
      { allocationMethodDescription: '' }, { payments: [{ date: '2024-03-15', amountUsd: '600.75' }] },
      { payments: [{ date: '2025-02-29', amountUsd: '600.75' }] }, { payments: [{ date: '2025-03-15', amountUsd: '600.74' }] }]) {
      expect(() => resolveForeignTaxElection(fixture({ foreignTaxElection: { ...election(), sources: [{ ...source(), ...change }] } }))).toThrow();
    }
    for (const change of [{ taxYear: 2026 }, { sourceFactsConfirmed: false }, { allQualifiedForeignTaxesIncludedConfirmed: false },
      { sources: [] }, { sources: [source(), source()] }, { noRedeterminationsConfirmed: undefined }]) {
      expect(() => resolveForeignTaxElection(fixture({ foreignTaxElection: { ...election(), ...change } }))).toThrow();
    }
    expect(() => resolveForeignTaxElection(fixture({ form1099Int: [{ ...fixture().form1099Int[0], accountReference: undefined }] }))).toThrow(/account/i);
  });
  it('requires the separate carryover accrual and passthrough methods', () => {
    for (const change of [{ accountingMethod: 'accrued' }, { priorAccruedCreditElection: true }, { noUnusedCreditCarryoversConfirmed: false },
      { noRedeterminationsConfirmed: false }, { sources: [{ ...source(), taxDeductedElsewhere: '1' }] }]) {
      expect(() => resolveForeignTaxElection(fixture({ foreignTaxElection: { ...election(), ...change } }))).toThrow();
    }
    for (const priorYear of [{ foreignTaxCreditCarryforward: '1' }, { foreignTaxCreditCarryforwardByYear: [{ taxYear: 2024, amount: '1' }] },
      { foreignTaxCreditCarryforwardByCategory: { passive: [{ taxYear: 2024, amount: '1' }] } }]) {
      expect(() => resolveForeignTaxElection(fixture({ priorYear }))).toThrow(/carry/i);
    }
    expect(() => resolveForeignTaxElection(fixture({ scheduleK1: [{ partnershipName: 'Synthetic partnership', partnershipEIN: '123456789', ordinaryIncome: '0', foreignTaxPaid: '1' }] }))).toThrow(/pass|source/i);
  });
});
