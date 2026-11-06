import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

// Spec: spec/federal/eic-schedule-e-investment.yaml. Independently stated source controls.
function input(k1: Record<string, unknown>[] = [], wages = '2000', extra: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: '0', socialSecurityWages: wages,
      socialSecurityWithheld: new Decimal(wages).times('0.062').toFixed(), medicareWages: wages,
      medicareWithheld: new Decimal(wages).times('0.0145').toFixed() }],
    scheduleK1: k1.map((source, index) => ({ partnershipName: `Fictional source ${index}`, partnershipEIN: `${44 + index}-4444444`,
      entityType: 's_corporation', ordinaryIncome: '0', isPassiveActivity: true, ...source })), eic: {}, ...extra,
  });
}
function line(result: ReturnType<typeof calculateFederalTax>, id: string) {
  return result.allLines.find(row => row.form === 'EIC Investment Income Worksheet' && row.line === id)?.value.toFixed();
}
function credit(result: ReturnType<typeof calculateFederalTax>) {
  return result.allLines.find(row => row.form === '1040' && row.line === '27a')?.value.toFixed();
}
it('excludes active business and continuing PTP income', () => {
  for (const source of [{ ordinaryIncome:'12000', isPassiveActivity:false },
    { entityType:'partnership', ordinaryIncome:'12000', isPubliclyTradedPartnership:true }]) {
    const actual=input([source]), before=JSON.stringify(actual), result=calculateFederalTax(actual);
    expect(result.agi.toFixed()).toBe('14000'); expect(line(result,'13')).toBe('0'); expect(credit(result)).toBe('155');
    expect(JSON.stringify(actual)).toBe(before);
    expect(credit(calculateFederalTax(TaxYearInputSchema.parse(JSON.parse(before))))).toBe('155');
  }
});
it('keeps royalties separate from active and allowed rental losses', () => {
  const active=calculateFederalTax(input([{ ordinaryIncome:'-10000',royalties:'12000',isPassiveActivity:false }]));
  expect(active.agi.toFixed()).toBe('4000'); expect(line(active,'8')).toBe('12000');expect(line(active,'10')).toBe('12000');
  expect(line(active,'13')).toBe('0');expect(credit(active)).toBe('0');
  const rental=calculateFederalTax(input([{ royalties:'12000' }],'2000',{ rentalProperties:[{
    description:'Fictional actual rental',propertyType:'single_family',rents:'1000',repairs:'3000',isActiveParticipant:true,
  }] }));
  expect(rental.form8582?.allowedLoss.toFixed()).toBe('2000');expect(line(rental,'12')).toBe('-2000');
  expect(line(rental,'13')).toBe('0');expect(line(rental,'10')).toBe('12000');expect(credit(rental)).toBe('0');
});
it('uses allowed current and prior passive losses once', () => {
  const prior=calculateFederalTax(input([{ordinaryIncome:'12000'}],'2000',{priorYear:{suspendedPassiveLosses:[{partnershipName:'Fictional source 0',amount:'2000'}]}}));
  expect(prior.agi.toFixed()).toBe('12000');expect(line(prior,'11')).toBe('12000');expect(line(prior,'12')).toBe('-2000');
  expect(line(prior,'13')).toBe('10000');expect(credit(prior)).toBe('155');
  const current=calculateFederalTax(input([{ordinaryIncome:'12000'},{ordinaryIncome:'-15000'}]));
  expect(current.form8582?.allowedLoss.toFixed()).toBe('12000');expect(current.form8582?.suspendedLoss.toFixed()).toBe('3000');
  expect(line(current,'12')).toBe('-12000');expect(line(current,'13')).toBe('0');expect(credit(current)).toBe('155');
});
it('preserves royalty cents and completed passive rounding', () => {
  for(const [royalties, expected] of [['11950','155'],['11950.01','0']]) {
    const result=calculateFederalTax(input([{royalties}]));expect(line(result,'10')).toBe(royalties);expect(credit(result)).toBe(expected);
  }
  const result=calculateFederalTax(input([{ordinaryIncome:'12000.49'}],'2000',{priorYear:{suspendedPassiveLosses:[{partnershipName:'Fictional source 0',amount:'2000.50'}]}}));
  expect(line(result,'11')).toBe('12000');expect(line(result,'12')).toBe('-2001');expect(line(result,'13')).toBe('9999');
});
const actualSe={entityType:'partnership',selfEmploymentFactsConfirmed:true,selfEmploymentIncomeType:'nonfarm',selfEmploymentEarnings:'12000',selfEmploymentNetEarningsAfterAdjustments:'12000'};
it('excludes complete ordinary self employment income and losses without duplication', () => {
  const positive=calculateFederalTax(input([{...actualSe,ordinaryIncome:'12000'}]));
  expect(line(positive,'11')).toBe('0');expect(line(positive,'13')).toBe('0');expect(credit(positive)).toBe('454');
  const negative=calculateFederalTax(input([{ordinaryIncome:'12000'},{...actualSe,ordinaryIncome:'-2000',selfEmploymentEarnings:'-2000',selfEmploymentNetEarningsAfterAdjustments:'-2000'}],'4000'));
  expect(line(negative,'11')).toBe('12000');expect(line(negative,'12')).toBe('0');expect(line(negative,'13')).toBe('12000');expect(credit(negative)).toBe('0');
});
it('requires a separate method for unresolved earned passive overlap', () => {
  for(const changes of [{selfEmploymentNetEarningsAfterAdjustments:'1000'},{selfEmploymentFactsConfirmed:undefined}]) {
    expect(()=>calculateFederalTax(input([{...actualSe,ordinaryIncome:'12000',...changes}]))).toThrow(/EIC.*(source|method|overlap)/i);
  }
  const high=calculateFederalTax(input([{...actualSe,ordinaryIncome:'12000',selfEmploymentNetEarningsAfterAdjustments:'1000'}],'100000'));
  expect(credit(high)).toBe('0');expect(line(high,'13')).toBeUndefined();
  expect(high.allLines.find(row=>row.form==='EIC'&&row.line==='investmentSourceUnresolved')?.formula).toMatch(/unresolved|unverified|separate/i);
});
it('does not require an overlap allocation for a zero passive source', () => {
  const result=calculateFederalTax(input([{...actualSe,ordinaryIncome:'0',guaranteedPayments:'12000'}]));
  expect(line(result,'11')).toBe('0');expect(line(result,'13')).toBe('0');expect(credit(result)).toBe('454');
});
it('keeps original indexes when nonpassive and PTP rows precede earned sources', () => {
  const source=input([{ordinaryIncome:'100',isPassiveActivity:false},
    {entityType:'partnership',ordinaryIncome:'100',isPubliclyTradedPartnership:true},
    {...actualSe,ordinaryIncome:'12000'}, {ordinaryIncome:'1000'}]);
  const result=calculateFederalTax(source);
  expect(line(result,'11')).toBe('1000');expect(line(result,'13')).toBe('1000');
  expect(line(result,'earned-overlap:2')).toBe('12000');
  const reordered=structuredClone(source);reordered.scheduleK1.reverse();
  const second=calculateFederalTax(reordered);expect(line(second,'13')).toBe('1000');
  expect(credit(second)).toBe(credit(result));expect(line(second,'earned-overlap:1')).toBe('12000');
});
