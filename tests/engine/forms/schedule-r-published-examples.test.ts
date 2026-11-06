/** Spec: spec/federal/schedule-r.yaml; literal official examples pinned before outputs. */
import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { calculateScheduleR, type ScheduleRParams } from '@/engine/forms/schedule-r.js';
import { getConstants } from '@/models/constants.js';

// Statutory R amounts do not change in final2026; no full2026 constants/return gate bypass.
function mixed(year: 2025 | 2026, reversed = false): ScheduleRParams {
  return { taxYear: year, filingStatus: 'married_filing_jointly', agi: new Decimal(20000),
    nontaxableSocialSecurity: new Decimal(0), constants: getConstants(2025).elderlyOrDisabledCredit,
    scheduleRInput: {primaryQualifies: true, primaryAge65OrOlder: reversed,
      primaryDisabilityIncome: reversed ? '0' : '4000', spouseQualifies: true,
      spouseAge65OrOlder: !reversed, spouseDisabilityIncome: reversed ? '4000' : '0', nontaxablePensionsAnnuities: '0'} };
}
const value = (r: ReturnType<typeof calculateScheduleR>, line: string) => r.lines.find(x => x.line === line)?.value.toFixed();
describe('Schedule R official examples', () => {
  it.each([[2025,false],[2025,true],[2026,false],[2026,true]] as const)('published mixed-age example uses box6 and the full uncapped line11 (%j)', (year, reversed) => {
    const r=calculateScheduleR(mixed(year,reversed));
    expect(r.box).toBe(6); expect(r.initialAmount.toFixed()).toBe('7500');
    expect(value(r,'11')).toBe('9000'); expect(r.adjustedInitialAmount.toFixed()).toBe('7500');
  });
  it('preserves printed audit identities and actual worksheet credit limit', () => {
    const r=calculateScheduleR({...mixed(2025), creditLimitWorksheet: {
      taxBeforeCredits:new Decimal(1000),foreignTaxCredit:new Decimal(100),dependentCareCredit:new Decimal(50),schedule3Line6l:new Decimal(75)}});
    for(const [line,expected] of Object.entries({'14':'20000','15':'10000','16':'10000','17':'5000','18':'5000','19':'2500','20':'375','21':'775','22':'375'})) expect(value(r,line)).toBe(expected);
    expect(r.creditLimit?.toFixed()).toBe('775'); expect(r.allowedCredit?.toFixed()).toBe('375');
  });
  it.each([[2025,'15900','16000','700','26','8','8'],[2026,'16170','16270','500','16','17','16']] as const)('published Jesse examples preserve year-specific tentative and allowed credit (%j)', (year,income,agi,ss,limit,tentative,allowed) => {
    const p=mixed(year); const r=calculateScheduleR({...p,filingStatus:'single',agi:new Decimal(agi),nontaxableSocialSecurity:new Decimal(ss),
      scheduleRInput:{primaryQualifies:true,primaryAge65OrOlder:false,primaryDisabilityIncome:income,nontaxablePensionsAnnuities:'0'},
      creditLimitWorksheet:{taxBeforeCredits:new Decimal(limit),foreignTaxCredit:new Decimal(0),dependentCareCredit:new Decimal(0),schedule3Line6l:new Decimal(0)}});
    expect(r.box).toBe(2);expect(value(r,'11')).toBe(income);expect(r.credit.toFixed()).toBe(tentative);expect(r.allowedCredit?.toFixed()).toBe(allowed);
  });
  it('preserves unknown worksheet separately from an actual zero limit', () => {
    const r=calculateScheduleR(mixed(2025));expect(r.creditLimit).toBeUndefined();expect(r.allowedCredit).toBeUndefined();expect(value(r,'21')).toBeUndefined();
    const zero=calculateScheduleR({...mixed(2025),creditLimitWorksheet:{taxBeforeCredits:new Decimal(0),foreignTaxCredit:new Decimal(0),dependentCareCredit:new Decimal(0),schedule3Line6l:new Decimal(0)}});
    expect(zero.credit.toFixed()).toBe('375');expect(zero.allowedCredit?.toFixed()).toBe('0');
  });
  it.each(['-1','NaN','Infinity'])('rejects invalid actual worksheet components (%j)', amount => {
    expect(()=>calculateScheduleR({...mixed(2025),creditLimitWorksheet:{taxBeforeCredits:new Decimal(amount),foreignTaxCredit:new Decimal(0),dependentCareCredit:new Decimal(0),schedule3Line6l:new Decimal(0)}})).toThrow(/worksheet/i);
  });
});

describe('Schedule R actual-source validation', () => {
  // Spec: schedule-r.yaml actual-source-validation; amounts are direct originals.
  it('rejects invalid actual benefit and disability sources', () => {
    for (const field of ['primaryDisabilityIncome', 'spouseDisabilityIncome', 'nontaxablePensionsAnnuities'] as const) {
      for (const amount of ['-1', 'NaN', 'Infinity', '-Infinity']) {
        const params = mixed(2025);
        params.scheduleRInput = {...params.scheduleRInput, [field]: amount};
        expect(() => calculateScheduleR(params), `${field}=${amount}`).toThrow(/finite|nonnegative|source/i);
      }
    }
    for (const amount of ['-1', 'NaN', 'Infinity', '-Infinity']) {
      expect(() => calculateScheduleR({...mixed(2025), nontaxableSocialSecurity: new Decimal(amount)})).toThrow(/finite|nonnegative|source/i);
    }
    for (const amount of ['NaN', 'Infinity', '-Infinity']) {
      expect(() => calculateScheduleR({...mixed(2025), agi: new Decimal(amount)})).toThrow(/finite|AGI|source/i);
    }
  });
  it('preserves finite negative AGI and actual zero benefits', () => {
    const result = calculateScheduleR({...mixed(2025), agi: new Decimal('-1000')});
    expect(result.credit.toFixed()).toBe('1125');
    expect(value(result, '14')).toBe('-1000');
  });
});
