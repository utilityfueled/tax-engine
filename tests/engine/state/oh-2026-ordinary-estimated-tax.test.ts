import { describe, expect, it } from 'vitest';
import { estimateOhio2026OrdinaryTax } from '@/engine/state/oh-2026-ordinary-estimated-tax.js';

const source = {
  taxYear: 2026,
  determinedOn: '2026-02-01',
  originalSingleCalendarYearFullYearResidentConfirmed: true,
  subjectToOhioTaxAtYearStartConfirmed: true,
  noFarmerOrFisherSpecialRuleConfirmed: true,
  completeOhioIndividualTaxEstimateUnder2026LawConfirmed: true,
  noOhioTaxCreditsConfirmed: true,
  noOhioSchoolDistrictTaxLiabilityConfirmed: true,
  noOhioCompensationWithholdingConfirmed: true,
  noPrecedingOhioReturnConfirmed: true,
  noPriorRefundAppliedConfirmed: true,
  noEstimatedPaymentsAlreadyMadeConfirmed: true,
  estimatedOhioIndividualTax: '1234.56',
} satisfies Parameters<typeof estimateOhio2026OrdinaryTax>[0];

const quarters = ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'];

describe('Ohio 2026 original ordinary estimated tax planning', () => {
  it('uses the strict exact $500 declaration boundary', () => {
    for (const estimatedOhioIndividualTax of ['0.00', '499.99', '500.00']) {
      const noDeclaration = estimateOhio2026OrdinaryTax({ ...source, estimatedOhioIndividualTax });
      expect(noDeclaration.declarationRequired).toBe(false);
      expect(noDeclaration).not.toHaveProperty('firstDeclarationDueBy');
      expect(noDeclaration).not.toHaveProperty('installments');
      expect(noDeclaration.lines.find(line => line.line === 'B')?.value.toFixed(2))
        .toBe(estimatedOhioIndividualTax);
    }

    const above = estimateOhio2026OrdinaryTax({ ...source, estimatedOhioIndividualTax: '500.01' });
    expect(above.declarationRequired).toBe(true);
    if (!above.declarationRequired) throw new Error('Expected a declaration');
    expect(above.firstDeclarationDueBy).toBe('2026-04-15');
    expect(above.installments.map(quarter => quarter.amount.toString())).toEqual(Array(4).fill('112.50225'));
    expect(above.installments.map(quarter => quarter.cumulativeAmount.toString()))
      .toEqual(['112.50225', '225.0045', '337.50675', '450.009']);
  });

  it('derives independently calculated exact shares and cumulative targets', () => {
    const estimate = estimateOhio2026OrdinaryTax(source);
    expect(estimate.kind).toBe('oh-2026-ordinary-estimated-tax-planning-only');
    expect(estimate.estimatedOhioCombinedTax.toString()).toBe('1234.56');
    expect(estimate.declarationRequired).toBe(true);
    if (!estimate.declarationRequired) throw new Error('Expected a declaration');
    expect(estimate.installments.map(quarter => quarter.dueBy)).toEqual(quarters);
    expect(estimate.installments.map(quarter => quarter.amount.toString())).toEqual(Array(4).fill('277.776'));
    expect(estimate.installments.map(quarter => quarter.cumulativeAmount.toString()))
      .toEqual(['277.776', '555.552', '833.328', '1111.104']);
    expect(estimate.lines.filter(line => line.form === 'Ohio IT 1040 ES').map(line => [line.line, line.value.toString()]))
      .toEqual([['8', '1234.56'], ['10', '1111.104'], ['11', '1111.104'], ['12', '0'], ['13', '1111.104'], ['14', '277.776']]);
    expect(estimate.lines.filter(line => line.line.startsWith('C(')).map(line => line.value.toString()))
      .toEqual(['277.776', '555.552', '833.328', '1111.104']);
  });

  it('rejects unknown, unsupported, foreign and malformed source facts', () => {
    for (const key of Object.keys(source)) {
      const missing = { ...source } as Record<string, unknown>;
      delete missing[key];
      expect(() => estimateOhio2026OrdinaryTax(missing as typeof source), key).toThrow();
    }
    for (const patch of [
      { taxYear: 2025 }, { taxYear: 2027 },
      { noOhioTaxCreditsConfirmed: false }, { noOhioTaxCreditsConfirmed: null },
      { noOhioSchoolDistrictTaxLiabilityConfirmed: false }, { noOhioSchoolDistrictTaxLiabilityConfirmed: null },
      { noOhioCompensationWithholdingConfirmed: false }, { noPrecedingOhioReturnConfirmed: false },
      { noPriorRefundAppliedConfirmed: false }, { noEstimatedPaymentsAlreadyMadeConfirmed: false },
      { noFarmerOrFisherSpecialRuleConfirmed: false }, { subjectToOhioTaxAtYearStartConfirmed: false },
      { originalSingleCalendarYearFullYearResidentConfirmed: false },
      { completeOhioIndividualTaxEstimateUnder2026LawConfirmed: false }, { estimatedOhioIndividualTax: '-0.01' },
      { estimatedOhioIndividualTax: '500.001' }, { estimatedOhioIndividualTax: '5e2' },
      { estimatedOhioIndividualTax: ' 500.01' }, { estimatedOhioIndividualTax: 500.01 },
      { estimatedOhioIndividualTax: '1,234.56' }, { priorYearLiability: '1' },
    ]) {
      expect(() => estimateOhio2026OrdinaryTax({ ...source, ...patch } as typeof source), JSON.stringify(patch)).toThrow();
    }
  });

  it('admits only valid original determination dates inside the bounded window', () => {
    for (const determinedOn of ['2026-01-01', '2026-04-15']) {
      expect(estimateOhio2026OrdinaryTax({ ...source, determinedOn }).declarationRequired).toBe(true);
    }
    for (const determinedOn of ['2025-12-31', '2026-02-29', '2026-04-16', '2027-01-01', '2026-1-1', '2026-04-15T00:00:00Z']) {
      expect(() => estimateOhio2026OrdinaryTax({ ...source, determinedOn }), determinedOn).toThrow();
    }
  });
});
