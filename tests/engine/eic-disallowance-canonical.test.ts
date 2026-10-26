import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateEic } from '@/engine/forms/schedule-eic.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { TAX_CONSTANTS } from '@/models/constants.js';
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import type { EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

// Spec: spec/federal/eic-disallowance-canonical.yaml. Fictional original sources.
function actual<T>(value: T | undefined): T { if (value === undefined) throw new Error('Incomplete fictional source'); return value; }
function history(input: TaxYearInput): EicDisallowanceSources {
  const filer = (owner: 'primary' | 'spouse') => ({ owner,
    originalTaxpayer: { ...(owner === 'primary' ? input.taxpayer.primary : actual(input.taxpayer.spouse)) },
    sourceReference: `Actual ${owner} history`, sourceFactsConfirmed: true, allHistoryIncluded: true,
    denials: [], laterAllowances: [] });
  return { sourceTaxYear: input.taxpayer.taxYear, sourceReference: 'Actual complete IRS and filed-return records', sourceFactsConfirmed: true,
    claimStatus: 'preparing', preparationAsOfDate: `${input.taxpayer.taxYear + 1}-03-01`, reviewedThroughDate: `${input.taxpayer.taxYear + 1}-03-01`,
    filers: [filer('primary'), ...(input.taxpayer.filingStatus === 'married_filing_jointly' ? [filer('spouse')] : [])] };
}
function source(joint = false): TaxYearInput {
  const input = structuredClone(simpleW2Fixture);
  input.taxpayer.primary.employmentValidSsnIssuedByDueDate = true;
  input.taxpayer.primary.tinIssuedByDueDate = true;
  input.w2s[0] = { ...actual(input.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' };
  if (joint) { input.taxpayer.filingStatus = 'married_filing_jointly'; input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'Jordan', ssn: '900-23-4567' }; }
  const childless = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false };
  input.eic = { primaryIsFullTimeStudent: false, claimantEligibility: { sourceTaxYear: 2025,
    sourceReference: 'Actual claimant sources', sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: false,
    primaryQualifyingChildOfAnotherTaxpayer: false, primaryChildless: childless,
    ...(joint ? { spouseNonresidentAlienDuringYear: false, spouseQualifyingChildOfAnotherTaxpayer: false, spouseChildless: { ...childless } } : {}) },
    disallowanceSources: history(input) };
  return input;
}
function packet(input: TaxYearInput) { return actual(actual(input.eic).disallowanceSources); }
function filer(input: TaxYearInput, i = 0) { return actual(actual(packet(input).filers)[i]); }
function denial() {
  return { sourceId: 'actual-denial', sourceReference: 'Actual deficiency assessment', taxYear: 2024,
    originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: '2025-12-01',
    procedure: 'deficiency' as const, reason: 'income_only' as const, conduct: 'reckless' as const, appealPending: false,
    interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [] };
}
function credit(input: TaxYearInput) {
  return actual(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line => line.form === '1040' && line.line === '27a')).value.toFixed();
}
describe('canonical EIC denial history', () => {
  it('applies actual individual and joint bans before claiming a canonical credit', () => {
    const input = source(); expect(credit(input)).toBe('649');
    filer(input).denials = [denial()]; const before = structuredClone(input);
    expect(credit(input)).toBe('0'); expect(input).toEqual(before);
    const joint = source(true); filer(joint, 1).denials = [denial()];
    expect(credit(joint)).toBe('0');
    filer(joint, 1).denials = []; expect(credit(joint)).toBe('649');
  });
  it('requires actual current recertification while honoring a source-bound later allowance', () => {
    const input = source(); filer(input).denials = [{ ...denial(), conduct: 'none', finalDeterminationDate: null }];
    expect(() => credit(input)).toThrow(/actual.*8862|8862.*source/i);
    filer(input).denials = [{ ...denial(), taxYear: 2023, originalReturnFiledDate: '2024-03-15', noticeDate: '2024-09-01', assessmentDate: '2024-12-01', conduct: 'none', finalDeterminationDate: null }];
    filer(input).laterAllowances = [{ sourceId: 'actual-allowance', sourceReference: 'Actual subsequent IRS allowance', taxYear: 2024,
      returnFiledDate: '2025-03-15', allowanceDate: '2025-06-01', demonstration: 'form8862', resolvedDenialSourceIds: ['actual-denial'] }];
    expect(credit(input)).toBe('649');
  });
  it('preserves historical unknown history without inventing it for new positive claims or zero income', () => {
    const input = source(); delete actual(input.eic).disallowanceSources;
    expect(() => credit(input)).toThrow(/history.*unknown|actual.*history/i);
    delete actual(input.eic).claimantEligibility;
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(actual(result.allLines.find(line => line.form === '1040' && line.line === '27a')).value.toFixed()).toBe('649');
    expect(actual(result.allLines.find(line => line.form === 'EIC' && line.line === 'disallowanceHistoryUnverified')).value.toFixed()).toBe('0');
    const next = source(); next.taxpayer.taxYear = 2026; delete actual(next.eic).disallowanceSources;
    actual(actual(next.eic).claimantEligibility).sourceTaxYear = 2026;
    const low = { filingStatus: 'single' as const, qualifyingChildren: 0, claimantInput: next,
      disallowanceInput: { taxpayer: next.taxpayer, sources: undefined },
      earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false };
    expect(() => calculateEic(low, FEDERAL_2026_CONSTANTS)).toThrow(/history.*unknown|actual.*history/i);
    expect(calculateEic({ ...low, earnedIncome: new Decimal(100000), agi: new Decimal(100000) }, FEDERAL_2026_CONSTANTS).credit.toFixed()).toBe('0');
  });
  it('rejects stale original history even when other conditions make the credit zero', () => {
    const input = source(); input.w2s[0] = { ...actual(input.w2s[0]), wages: '100000' };
    packet(input).sourceTaxYear = 2024; expect(() => credit(input)).toThrow(/history.*year/i);
    packet(input).sourceTaxYear = 2025; actual(filer(input).originalTaxpayer).ssn = '900-99-9999';
    expect(() => credit(input)).toThrow(/history.*identity/i);
    const known = source(); known.taxpayer.primary.employmentValidSsnIssuedByDueDate = false;
    delete actual(known.eic).disallowanceSources; expect(credit(known)).toBe('0');
  });
  it('keeps the actual no-child exception independent of active bans and historical child counts', () => {
    const input = source(); filer(input).denials = [{ ...denial(), reason: 'qualifying_child_only' }];
    expect(credit(input)).toBe('0');
    actual(actual(filer(input).denials)[0]).conduct = 'none';
    expect(() => credit(input)).toThrow(/actual qualifying.child presence/i);
    const joint = source(true); filer(joint).denials = [{ ...denial(), reason: 'qualifying_child_only', conduct: 'none' }];
    filer(joint, 1).denials = [denial()];
    expect(credit(joint)).toBe('0');
  });
  it('validates supplied history even when foreign exclusion independently disqualifies the credit', () => {
    const input = source();
    input.form2555 = { foreignEarnedIncome: '1000', qualifyingDays: 365 };
    expect(credit(input)).toBe('0');
    packet(input).sourceTaxYear = 2024;
    expect(() => credit(input)).toThrow(/history.*year/i);
    delete actual(input.eic).disallowanceSources;
    expect(credit(input)).toBe('0');
  });
  it('binds actual child presence across the direct calculation and recertification exception', () => {
    const input = source(); filer(input).denials = [{ ...denial(), reason: 'qualifying_child_only', conduct: 'none' }];
    const direct = { filingStatus: 'single' as const, qualifyingChildren: 1, qualifyingChildPresent: true,
      claimantInput: input, disallowanceInput: { taxpayer: input.taxpayer, sources: packet(input), qualifyingChildPresent: false },
      earnedIncome: new Decimal(10000), agi: new Decimal(10000), investmentIncome: new Decimal(0), mfsEicEligible: false };
    expect(() => calculateEic(direct, TAX_CONSTANTS[2025])).toThrow(/actual.child|actual child|8862/i);
    expect(() => calculateEic({ ...direct, disallowanceInput: { ...direct.disallowanceInput, qualifyingChildPresent: true } }, TAX_CONSTANTS[2025])).toThrow(/actual.*8862|8862.*source/i);
    expect(() => calculateEic({ ...direct, qualifyingChildren: 0, qualifyingChildPresent: undefined }, TAX_CONSTANTS[2025])).toThrow(/actual.child|actual child/i);
    expect(() => calculateEic({ ...direct, qualifyingChildren: 0, qualifyingChildPresent: undefined,
      disallowanceInput: { ...direct.disallowanceInput, qualifyingChildPresent: undefined } }, TAX_CONSTANTS[2025])).toThrow(/actual qualifying.child presence/i);
    expect(calculateEic({ ...direct, qualifyingChildren: 0, qualifyingChildPresent: false }, TAX_CONSTANTS[2025]).credit.toFixed()).toBe('649');
  });
});
