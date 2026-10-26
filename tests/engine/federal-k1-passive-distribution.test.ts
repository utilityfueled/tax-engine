// Spec: spec/federal/k1-passive-distribution-gain.yaml
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { k1PassiveDistributionFixture } from '../fixtures/k1-passive-distribution.js';
import { cashDistributionSource } from '../fixtures/k1-cash-distribution.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
const line=(r:ReturnType<typeof calculateFederalTax>,form:string,id:string)=>r.allLines.find(row=>row.form===form&&row.line===id)?.value.toFixed();
it('routes positive zero and loss outcomes without duplicating capital gain',()=>{
  for(const scorp of [false,true]) for(const [prior,allowed,remaining,agi] of [['1500','1000','500','100000'],['400','400','0','100600'],['0','0','0','101000']]) {
    const input=k1PassiveDistributionFixture(prior,scorp),original=JSON.stringify(input),r=calculateFederalTax(input);
    expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1000');
    expect(r.form8582?.passiveIncome.toFixed()).toBe('1000');expect(r.form8582?.allowedLoss.toFixed()).toBe(allowed);
    expect(r.form8582?.suspendedLoss.toFixed()).toBe(remaining);expect(r.agi.toFixed()).toBe(agi);
    expect(r.scheduleE?.partnerships[0].basisResult?.totalIncomeItems.toFixed()).toBe('0');
    expect(r.scheduleE?.partnerships[0].basisResult?.endingBasis.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(original);
  }
});
it('preserves basis-first current losses and actual prior QBI character',()=>{
  const input=k1PassiveDistributionFixture('400'),k=input.scheduleK1[0],q=input.qbiLossSources!.activities![0];
  k.ordinaryIncome='-50';k.section199AQBI='-25';q.statement!.ordinaryIncome='-50';q.statement!.section199AQBI='-25';
  const r=calculateFederalTax(input);
  expect(r.scheduleE?.partnerships[0].basisResult?.lossCategories.find(row=>row.key==='ordinary')?.suspended.toFixed()).toBe('50');
  expect(r.form8582?.activityRows[0].sourceCurrentLoss.toFixed()).toBe('0');
  expect(r.agi.toFixed()).toBe('100600');
  expect(line(r,'K1 Passive Distribution','capital-1')).toBe('1000');
  expect(r.carryforwards.qbiLossCarryforward.toFixed()).toBe('400');
});
it('keeps capital cents and passive loss separate in NIIT and EIC',()=>{
  const input=k1PassiveDistributionFixture('400');input.w2s[0].wages='250000';input.w2s[0].federalWithheld='80000';
  const r=calculateFederalTax(input);
  expect(line(r,'Form 8960','4c')).toBe('-400');expect(line(r,'Form 8960','5a')).toBe('1000');expect(line(r,'Form 8960','12')).toBe('600');
  expect(line(r,'EIC Investment Income Worksheet','11')).toBe('0');expect(line(r,'EIC Investment Income Worksheet','12')).toBe('-400');expect(line(r,'EIC Investment Income Worksheet','13')).toBe('0');
  input.scheduleK1[0].distributions='1030.25';cashDistributionSource(input).cashAmount='1030.25';
  Object.assign(input.scheduleK1[0].form6198!,{gainLossFromDispositions:'1000.25',currentYearDecreases:'1030.25'});
  charitableStatement(input).atRisk!.currentYearDecreases='1030.25';input.qbiLossSources!.activities![0].atRisk!.currentYearDecreases='1030.25';
  const cents=calculateFederalTax(input);expect(cents.agi.toFixed()).toBe('250600.25');
  expect(line(cents,'Form 8960','12')).toBe('600.25');expect(line(cents,'EIC Investment Income Worksheet','11')).toBe('0');
});
it('requires linked actual histories and preserves the future-year gate',()=>{
  const missing=k1PassiveDistributionFixture();missing.qbiLossSources=undefined;
  expect(()=>calculateFederalTax(missing)).toThrow(/history|histories|QBI/);
  const changed=k1PassiveDistributionFixture();changed.priorYear!.suspendedPassiveLosses![0].amount='1499';
  expect(()=>calculateFederalTax(changed)).toThrow(/prior passive|history/);
  const future=k1PassiveDistributionFixture();future.taxpayer.taxYear=2026;
  expect(()=>calculateFederalTax(future)).toThrow(/Tax year 2026 rule pack .*incomplete/);
});

it('retains the original reported ordinary component when combined income crosses a dollar',()=>{
  for(const [ordinary,cash,reported] of [['50.40','1080.65','50'],['50.60','1080.85','51']]) {
    const input=k1PassiveDistributionFixture('400'),k=input.scheduleK1[0],q=input.qbiLossSources!.activities![0];
    input.w2s[0].wages='250000';input.w2s[0].federalWithheld='80000';
    Object.assign(k,{ordinaryIncome:ordinary,section199AQBI:ordinary,distributions:cash});
    Object.assign(q.statement!,{ordinaryIncome:ordinary,section199AQBI:ordinary});
    Object.assign(k.form6198!,{ordinaryIncome:ordinary,gainLossFromDispositions:'1000.25',currentYearDecreases:cash});
    cashDistributionSource(input).cashAmount=cash;charitableStatement(input).atRisk!.currentYearDecreases=cash;q.atRisk!.currentYearDecreases=cash;
    const r=calculateFederalTax(input),expectedOrdinary=reported==='50'?'-350':'-349';
    expect(r.form8582?.passiveIncome.toFixed()).toBe('1051');
    expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1000.25');
    expect(r.agi.toFixed()).toBe(reported==='50'?'250650.25':'250651.25');
    expect(line(r,'Form 8960','4c')).toBe(expectedOrdinary);expect(line(r,'Form 8960','5a')).toBe('1000.25');
    expect(line(r,'EIC Investment Income Worksheet','11')).toBe(reported);
  }
});
it('retains original index binding around a separate nonpassive statement',()=>{
  const input=k1PassiveDistributionFixture('400'),control=calculateFederalTax(input),other=structuredClone(input.scheduleK1[0]);
  Object.assign(other,{partnershipName:'Fictional distinct nonpassive business',partnershipEIN:'99-7654321',
    ordinaryIncome:'25',section199AQBI:'0',isPassiveActivity:false,qbiMateriallyParticipated:true,
    charitableCash:'0',distributions:'0',beginningBasis:'1000'});
  Object.assign(other.form6198!,{activityName:other.partnershipName,ordinaryIncome:'25',gainLossFromDispositions:'0',currentYearDecreases:'0'});
  const otherSource=structuredClone(input.qbiLossSources!.activities![0]);
  Object.assign(otherSource,{k1SourceId:'scheduleK1:0',entityName:other.partnershipName,entityEIN:other.partnershipEIN,priorPassiveLoss:'0'});
  Object.assign(otherSource.statement!,{ordinaryIncome:'25',section199AQBI:'0',isPassiveActivity:false,qbiMateriallyParticipated:true});
  otherSource.basis!.beginningBasis='1000';otherSource.atRisk!.currentYearDecreases='0';
  const otherHistory=structuredClone(input.priorYear!.suspendedPassiveLosses![0]);
  otherHistory.partnershipName=other.partnershipName;otherHistory.amount='0';otherHistory.qbiLossTracking!.vintages=[];
  input.priorYear!.suspendedPassiveLosses!.push(otherHistory);
  input.scheduleK1.unshift(other);
  charitableStatement(input).k1SourceId='scheduleK1:1';
  input.qbiLossSources!.activities![0].k1SourceId='scheduleK1:1';
  input.qbiLossSources!.activities!.unshift(otherSource);
  const r=calculateFederalTax(input);
  expect(r.scheduleD?.netCapitalGainLoss.eq(control.scheduleD!.netCapitalGainLoss)).toBe(true);
  expect(r.form8582?.activityRows[0].name).toBe(input.scheduleK1[1].partnershipName);
  expect(r.form8582?.allowedLoss.toFixed()).toBe('400');
  expect(r.agi.minus(control.agi).toFixed()).toBe('25');
  expect(line(r,'K1 Passive Distribution','capital-2')).toBe('1000');
});

it('retains actual rental modified income when the passive gain offsets other losses',()=>{
  const input=TaxYearInputSchema.parse({...k1PassiveDistributionFixture('400'),rentalProperties:[{
    description:'Fictional independent active rental',rents:'0',otherExpenses:'30000',propertyType:'single_family',
    rentalDays:365,personalUseDays:0,isActiveParticipant:true,qualifiesForQBI:false,
  }]});
  const r=calculateFederalTax(input);
  expect(r.form8582?.modifiedAgi.toFixed()).toBe('100000');
  expect(r.form8582?.rentalAllowance.toFixed()).toBe('25000');
  expect(r.form8582?.allowedLoss.toFixed()).toBe('26000');
  expect(r.agi.toFixed()).toBe('75000');
});
