// Spec: spec/federal/schedule-se.yaml, final IRS form and instructions.
import { describe, it, expect, vi } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleSE } from '@/engine/schedules/schedule-se.js';
import { getConstants } from '@/models/constants.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { simpleW2Fixture, complexMFJFixture } from '../../fixtures/simple-w2.js';

vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const c = getConstants(2025);
const joint = () => TaxYearInputSchema.parse({ ...complexMFJFixture, scheduleK1: [], form1099Nec: [],
  w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: 'primary', socialSecurityWages: '176100', socialSecurityTips: '0' }],
  scheduleC: { accountHolder: 'spouse', grossReceipts: '100000' },
});
describe('Schedule SE actual source attribution', () => {
  it('keeps each spouse Social Security wage base separate', () => {
    const result = calculateScheduleSE(joint(), c);
    // Spouse's 100000 x .9235 = 92350; SS11451 + Medicare2678 =14129.
    expect(result.socialSecurityPortion.toString()).toBe('11451');
    expect(result.totalSETax.toString()).toBe('14129');
    expect(result.perTaxpayer).toHaveLength(1);
    expect(result.perTaxpayer[0].accountHolder).toBe('spouse');
  });
  it('does not offset one spouse profit with the other spouse loss', () => {
    const input = joint(); input.w2s = [];
    input.scheduleF = TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleF: { accountHolder: 'primary', salesOfProductsRaised: '10000', expenses: { feed: '50000' } } }).scheduleF;
    const result = calculateScheduleSE(input,c);
    expect(result.netSEEarnings.toString()).toBe('60000');
    expect(result.taxableEarnings.toString()).toBe('92350');
    expect(result.totalSETax.toString()).toBe('14129');
    expect(result.deductibleHalf.toString()).toBe('7065');
    expect(result.perTaxpayer.map(row => [row.accountHolder,row.totalSETax.toString()])).toEqual([['primary','0'],['spouse','14129']]);
  });
  it('audits the official regular-method lines and includes W2 tips', () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{...simpleW2Fixture.w2s[0], socialSecurityWages:'170000', socialSecurityTips:'6000'}], scheduleC: {grossReceipts:'10000'} });
    const result=calculateScheduleSE(input,c);
    expect(result.socialSecurityPortion.toString()).toBe('12');
    const line=(id:string)=>result.lines.find(row=>row.form==='Sched SE'&&row.line===id)?.value.toString();
    expect(['1a','1b','2','3','4a','4b','4c','5a','5b','6','7','8a','8b','8c','8d','9','10','11','12','13'].map(line)).toEqual(['0','0','10000','10000','9235','0','9235','0','0','9235','176100','176000','0','0','176000','100','12','268','280','140']);
  });
  it('aggregates exact W2 and Tier 1 amounts before rounding line 8a', () => {
    const makeInput = (socialSecurityWages: string) => TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
      w2s: [{ ...simpleW2Fixture.w2s[0], socialSecurityWages, socialSecurityTips: '0.24' }],
      scheduleC: { grossReceipts: '10000' },
      form8919: { accountHolder: 'primary', wagesNotReportedOnW2: '0', rrtaCompensationSubjectToSocialSecurityTax: '0.49' },
    });
    const result = calculateScheduleSE(makeInput('183999.25'), FEDERAL_2026_CONSTANTS);
    const line = (id: string) => result.lines.find(row => row.line === id);
    expect(line('8a')?.value.toString()).toBe('184000');
    expect(line('8a')?.inputs['Exact combined Social Security wages, tips and Tier 1 compensation']?.toString()).toBe('183999.98');
    expect(line('8d')?.value.toString()).toBe('184000');
    expect(line('9')?.value.toString()).toBe('500');

    // At $504 of remaining wage base, the rounded Social Security portion is $62.
    // Premature component rounding instead leaves $505 and produces $63.
    const taxBoundary = calculateScheduleSE(makeInput('183995.25'), FEDERAL_2026_CONSTANTS);
    expect(taxBoundary.socialSecurityPortion.toString()).toBe('62');
    expect(taxBoundary.totalSETax.toString()).toBe('330');
    expect(taxBoundary.deductibleHalf.toString()).toBe('165');
  });
  it.each([
    ['433.13', '399.995555', '0', '0'],
    ['433.14', '400.00479', '62', '31'],
  ])('routes $%s of 2026 net profit through Schedule 2 and Schedule 1', (profit, adjusted, tax, half) => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        taxYear: 2026,
        primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: false },
      },
      w2s: [],
      scheduleC: { accountHolder: 'primary', grossReceipts: profit },
    }));
    expect(result.taxYear).toBe(2026);
    expect(result.scheduleC?.netProfit.toString()).toBe(profit);
    expect(result.selfEmploymentTax.toString()).toBe(tax);
    expect(result.schedule2?.lines.find(line => line.line === '4')?.value.toString()).toBe(tax);
    expect(result.schedule1?.lines.find(line => line.line === '15')?.value.toString()).toBe(half);
    expect(result.adjustmentsToIncome.toString()).toBe(half);
    const threshold = result.scheduleSE?.lines.find(line => line.line === '4c');
    expect(threshold?.value.toString()).toBe('400');
    expect(threshold?.inputs['Exact adjusted earnings']?.toString()).toBe(adjusted);
  });
  it('uses K1 Box14A once and requires adjusted source facts for 2026', () => {
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],scheduleK1:[{partnershipName:'Actual partnership',partnershipEIN:'12-3456789',ordinaryIncome:'10000',guaranteedPayments:'5000',selfEmploymentEarnings:'15000'}]});
    expect(calculateScheduleSE(input,c).netNonfarmProfit.toString()).toBe('15000');
    input.taxpayer.taxYear=2026;
    expect(()=>calculateScheduleSE(input,FEDERAL_2026_CONSTANTS)).toThrow(/K-1|adjusted|source/i);
    const verified=TaxYearInputSchema.parse({...input,scheduleK1:[{...input.scheduleK1[0],selfEmploymentFactsConfirmed:true,selfEmploymentNetEarningsAfterAdjustments:'13000',selfEmploymentIncomeType:'farm'}]});
    const result=calculateScheduleSE(verified,FEDERAL_2026_CONSTANTS);
    expect(result.netFarmProfit.toString()).toBe('13000');
    expect(result.netNonfarmProfit.toString()).toBe('0');
  });
  it('keeps unreported payroll sources with their actual owner', () => {
    const input=joint(); input.w2s=[];
    input.form8919={accountHolder:'primary',wagesNotReportedOnW2:'176100'};
    const result=calculateScheduleSE(input,c);
    expect(result.socialSecurityPortion.toString()).toBe('11451');
    const sameOwner={...input,form8919:{...input.form8919,accountHolder:'spouse' as const}};
    expect(calculateScheduleSE(sameOwner,c).socialSecurityPortion.toString()).toBe('0');
  });
  it('preserves unknown source facts and rejects incomplete 2026 attribution', () => {
    const input=joint(); delete input.scheduleC?.accountHolder;
    expect(calculateScheduleSE(input,c).sourceFactsVerified).toBe(false);
    input.taxpayer.taxYear=2026;
    expect(()=>calculateScheduleSE(input,FEDERAL_2026_CONSTANTS)).toThrow(/owner|attribution/i);
    const incomplete=joint(); incomplete.taxpayer.taxYear=2026;
    delete incomplete.w2s[0].socialSecurityTips;
    const parsed=TaxYearInputSchema.parse(incomplete);
    expect(parsed.w2s[0].socialSecurityTips).toBeUndefined();
    expect(()=>calculateScheduleSE(parsed,FEDERAL_2026_CONSTANTS)).toThrow(/Box.?7|payroll|tips/i);
  });
  it('rejects unknown wage ownership when calculating actually owned unreported payroll', () => {
    const input=joint(); delete input.w2s[0].accountHolder;
    input.scheduleC=undefined;
    input.form8919={accountHolder:'spouse',wagesNotReportedOnW2:'10000'};
    expect(()=>calculateFederalTax(input)).toThrow(/W-2.*owner|owner.*W-2/i);
  });
  it('does not turn an unknown NEC proprietor into a verified business source', () => {
    const input=joint(); input.taxpayer.taxYear=2026;
    input.form1099Nec=TaxYearInputSchema.parse({...simpleW2Fixture,form1099Nec:[{payer:'Actual client',nonemployeeCompensation:'100000',federalWithheld:'0'}]}).form1099Nec;
    expect(()=>calculateScheduleSE(input,FEDERAL_2026_CONSTANTS)).toThrow(/NEC.*owner|owner.*NEC/i);
  });

});
