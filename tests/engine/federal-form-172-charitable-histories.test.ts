// Spec: form-172-charitable-histories.yaml. Source-derived literal controls.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { currentOriginCharitableHistoriesInput } from '../fixtures/form-172-charitable-histories';
import { priorCharitableNolInput } from '../fixtures/charitable-prior-nol';
import { actualCodNolInput } from '../fixtures/cod-nol';
import { TaxYearInputSchema } from '@/models/inputs';

it('uses actual nonbusiness income for current and prior charitable origin deductions',()=>{
  const input=currentOriginCharitableHistoriesInput(),before=JSON.stringify(input),result=calculateFederalTax(input);
  const regular=result.form172?.regular;
  expect([result.agi,result.scheduleA?.charitableTotal,result.deductionAmount,regular?.partI[1],regular?.partI[6],regular?.partI[7],
    regular?.partI[8],regular?.partI[9],regular?.partI[10],regular?.netOperatingLoss,result.form172?.alternativeTax.netOperatingLoss,
    result.form6251?.amti,result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions]
    .map(x=>x?.toFixed())).toEqual(['10000','4000','24000','-14000','24000','30000','30000','0','0','14000','0','8500','2000','0']);
  expect(result.carryforwards.charitableContributionsByYear.map(x=>[x.taxYear,x.category,x.amount.toFixed()])).toEqual([[2024,'capital_gain_30','2000']]);
  expect(result.netOperatingLoss?.determinedCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(result.netOperatingLoss?.determinedAlternativeCharitableCarryover?.reduction.toFixed()).toBe('0');
  expect(result.form172?.charitableSources?.alternativeCurrentDeduction.toFixed()).toBe('1500');
  expect(JSON.stringify(input)).toBe(before);
});

it('does not turn wages into nonbusiness capacity at identical AGI',()=>{
  const input=currentOriginCharitableHistoriesInput(); input.form1099Int[0].interestIncome='0'; input.w2s[0].wages='50000';
  const result=calculateFederalTax(input),regular=result.form172?.regular;
  expect([result.agi,result.deductionAmount,regular?.partI[6],regular?.partI[7],regular?.partI[9],regular?.netOperatingLoss,
    result.form172?.alternativeTax.netOperatingLoss].map(x=>x?.toFixed())).toEqual(['10000','24000','24000','0','24000','0','0']);
});

it('preserves the selected standard deduction and original percentage history',()=>{
  const input=currentOriginCharitableHistoriesInput(); input.deductionElection='standard';
  const result=calculateFederalTax(input);
  expect([result.deductionAmount,result.form172?.regular.netOperatingLoss,result.form172?.alternativeTax.netOperatingLoss,
    result.form6251?.amti,result.form172?.charitableSources?.regularCurrentDeduction,result.form172?.charitableSources?.alternativeCurrentDeduction,
    result.carryforwards.charitableContributions,result.carryforwards.amtCharitableContributions].map(x=>x?.toFixed()))
    .toEqual(['15750','5750','0','10000','0','0','2000','0']);
});

it('retains independent source and prior-loss boundaries',()=>{
  const input=currentOriginCharitableHistoriesInput();
  if(!input.netOperatingLoss?.alternativeTax)throw new Error('Missing fictional source');
  input.netOperatingLoss.alternativeTax.charitableCarryoverHistory=undefined;
  expect(()=>calculateFederalTax(input)).toThrow(/charit|histor/i);
  const unknown=currentOriginCharitableHistoriesInput();
  if(!unknown.netOperatingLoss)throw new Error('Missing fictional loss history');
  unknown.netOperatingLoss.vintages=undefined;
  expect(()=>calculateFederalTax(unknown)).toThrow(/current|prior|origin|charit|history|source/i);
  const changed=currentOriginCharitableHistoriesInput();
  if(!changed.charitableCarryoverSources)throw new Error('Missing fictional charity history');
  changed.charitableCarryoverSources.primaryTaxpayerIdLast4='9999';
  expect(()=>calculateFederalTax(changed)).toThrow(/identity|taxpayer|source|charit/i);
  expect(()=>calculateFederalTax(currentOriginCharitableHistoriesInput(2026))).toThrow(/2026|qualified|enabled|support/i);
  const unsupported = currentOriginCharitableHistoriesInput(); unsupported.donations = [];
  const offsetting = TaxYearInputSchema.parse({ ...unsupported, scheduleK1: [{ partnershipName: 'Synthetic unclassified activity', partnershipEIN: '12-3456789', entityType: 'partnership', ordinaryIncome: '1', netRentalIncome: '-1' }] });
  expect(() => calculateFederalTax(offsetting)).toThrow(/scheduleK1|separate|classif|source/i);
});

it('keeps existing after-tax current debt reduction separate from charity history', () => {
  const input = currentOriginCharitableHistoriesInput(), cod = actualCodNolInput('5000');
  input.form1099C = cod.form1099C; input.codExclusion = cod.codExclusion; input.form982NolSources = cod.form982NolSources;
  if (!input.form172 || !input.form982NolSources?.debts[0]) throw new Error('Missing fictional original debt packet');
  input.form172.cancelledDebtIncluded = true;
  const debt = input.form982NolSources.debts[0];
  debt.debtorName = `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  debt.debtorSsnLast4 = input.taxpayer.primary.ssn.replace(/\D/g, '').slice(-4);
  expect(() => calculateFederalTax(input)).toThrow(/later-attribute|independent tax/i);
  input.scheduleA = { medicalExpenses: '30000' };
  const result = calculateFederalTax(input);
  expect([result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(x => x?.toFixed()))
    .toEqual(['20000', '20000', '15000', '15000', '2000', '0']);
});

it('preserves a larger independent AMT original balance', () => {
  const input = currentOriginCharitableHistoriesInput(), prior = priorCharitableNolInput({ regular: '500', alternative: '5000' });
  if (!input.netOperatingLoss?.alternativeTax) throw new Error('Missing fictional independent history');
  input.charitableCarryoverSources = prior.charitableCarryoverSources;
  input.netOperatingLoss.alternativeTax.charitableCarryoverHistory = prior.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  const result = calculateFederalTax(input);
  expect([result.scheduleA?.charitableTotal, result.form172?.regular.netOperatingLoss, result.form172?.alternativeTax.netOperatingLoss,
    result.form6251?.amti, result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(x => x?.toFixed()))
    .toEqual(['1500', '11500', '0', '6000', '0', '2000']);
});
