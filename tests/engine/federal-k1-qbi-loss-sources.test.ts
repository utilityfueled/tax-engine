// Spec: spec/federal/k1-qbi-loss-return.yaml.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { k1QbiLossSourceInput } from '../fixtures/k1-qbi-loss-sources.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

it('uses canonical at-risk allowance instead of the unadjusted K1 QBI statement',()=>{
  const input=k1QbiLossSourceInput(),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('-60000');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('48000');
  expect(result.carryforwards.qbiSuspendedLosses?.find(row=>row.limitation==='465')?.vintages.map(v=>[v.remainingLoss.toFixed(),v.qualifiedRemainingLoss.toFixed()])).toEqual([['40000','32000']]);
  expect(JSON.stringify(input)).toBe(before);
});

it('keeps basis and at-risk character separate without changing their regular losses',()=>{
  const input=k1QbiLossSourceInput();
  input.scheduleK1[0].beginningBasis='75000';input.qbiLossSources!.activities![0].basis!.beginningBasis='75000';
  input.scheduleK1[0].form6198!.ordinaryIncome='-75000';
  const result=calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('-60000');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('48000');
  expect(result.carryforwards.qbiSuspendedLosses?.map(row=>[row.limitation,...row.vintages.map(v=>[v.remainingLoss.toFixed(),v.qualifiedRemainingLoss.toFixed()])])).toEqual([['704(d)',['25000','20000']],['465',['15000','12000']]]);
});

it('separates released prior passive character from current K1 loss',()=>{
  const input=k1QbiLossSourceInput(),k1=input.scheduleK1[0],source=input.qbiLossSources!.activities![0];
  k1.ordinaryIncome='-10000';k1.section199AQBI='-8000';k1.form6198!.ordinaryIncome='-10000';
  k1.isPassiveActivity=true;k1.qbiMateriallyParticipated=false;
  Object.assign(source.statement!,{ordinaryIncome:'-10000',section199AQBI:'-8000',isPassiveActivity:true,qbiMateriallyParticipated:false});
  source.priorPassiveLoss='20000';input.priorYear!.suspendedPassiveLosses[0].amount='20000';
  input.priorYear!.suspendedPassiveLosses[0].qbiLossTracking!.vintages=[{taxYear:2024,originalLoss:'20000',qualifiedOriginalLoss:'16000',remainingLoss:'20000',qualifiedRemainingLoss:'16000',materiallyParticipatedInCurrentYear:false}];
  const second=structuredClone(k1),secondSource=structuredClone(source),secondPrior=structuredClone(input.priorYear!.suspendedPassiveLosses[0]);
  Object.assign(second,{partnershipName:'Actual passive income',partnershipEIN:'98-7654321',ordinaryIncome:'25000',section199AQBI:'0'});
  Object.assign(second.form6198!,{activityName:'Actual passive income',ordinaryIncome:'25000',currentYearIncreases:'25000'});
  Object.assign(secondSource,{k1SourceId:'scheduleK1:1',entityName:second.partnershipName,entityEIN:second.partnershipEIN,priorPassiveLoss:'0'});
  Object.assign(secondSource.statement!,{ordinaryIncome:'25000',section199AQBI:'0'});secondSource.atRisk!.currentYearIncreases='25000';
  Object.assign(secondPrior,{partnershipName:second.partnershipName,amount:'0'});secondPrior.qbiLossTracking!.vintages=[];
  input.scheduleK1.push(second);input.qbiLossSources!.activities!.push(secondSource);input.priorYear!.suspendedPassiveLosses.push(secondPrior);
  const result=calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('0');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('20000');
  const row=result.carryforwards.qbiSuspendedLosses?.find(row=>row.sourceId==='scheduleK1:0'&&row.limitation==='469');
  expect(row?.vintages.map(v=>[v.taxYear,v.remainingLoss.toFixed(),v.qualifiedRemainingLoss.toFixed()])).toEqual([[2025,'5000','4000']]);
});

it('rejects stale source worksheets before they enter current QBI',()=>{
  const input=k1QbiLossSourceInput();input.scheduleK1[0].form6198!.ordinaryIncome='-99999';
  expect(()=>calculateFederalTax(input)).toThrow(/6198|basis|ordinary.*source/i);
  const stale=k1QbiLossSourceInput();stale.qbiLossSources!.activities![0].statement!.section199AQBI='-79999';
  expect(()=>calculateFederalTax(stale)).toThrow(/statement|source/i);
});

function largeCurrentLoss() {
  const input=k1QbiLossSourceInput(),k1=input.scheduleK1[0],source=input.qbiLossSources!.activities![0];
  k1.ordinaryIncome='-330000';k1.section199AQBI='-264000';k1.beginningBasis='500000';
  Object.assign(k1.form6198!,{ordinaryIncome:'-330000',priorYearAmountAtRisk:'500000'});
  Object.assign(source.statement!,{ordinaryIncome:'-330000',section199AQBI:'-264000'});
  source.basis!.beginningBasis='500000';source.atRisk!.priorYearAmountAtRisk='500000';
  input.form461={sourceTaxYear:2025,sourceReference:'Actual ordinary sources after limits',sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
    scheduleESupplementalIncome:'-330000',tradeOrBusinessCapitalGainNetIncome:'0',noncapitalNonbusinessIncome:'0',noncapitalNonbusinessLoss:'0',noncapitalBusinessNet:'-330000',otherBusinessIncome:'0',otherBusinessDeductions:'0'};
  return input;
}
it('derives unique current K1 loss character after canonical Form461',()=>{
  const input=largeCurrentLoss(),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('17000');
  expect(result.agi.toFixed()).toBe('-313000');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('250400');
  expect(result.carryforwards.excessBusinessLossNOL.toFixed()).toBe('17000');
  expect(result.carryforwards.qbiSuspendedLosses?.map(row=>[row.limitation,...row.vintages.map(v=>[v.remainingLoss.toFixed(),v.qualifiedRemainingLoss.toFixed()])])).toEqual([['461(l)',['17000','13600']]]);
  expect(JSON.stringify(input)).toBe(before);
});
it('conserves positive offsets and rejects an additional loss pool',()=>{
  const input=largeCurrentLoss(),second=structuredClone(input.scheduleK1[0]),source=structuredClone(input.qbiLossSources!.activities![0]);
  Object.assign(second,{partnershipName:'Positive original business',partnershipEIN:'98-7654321',ordinaryIncome:'10000',section199AQBI:'5000'});
  Object.assign(second.form6198!,{activityName:second.partnershipName,ordinaryIncome:'10000',currentYearIncreases:'10000'});
  Object.assign(source,{k1SourceId:'scheduleK1:1',entityName:second.partnershipName,entityEIN:second.partnershipEIN});
  Object.assign(source.statement!,{ordinaryIncome:'10000',section199AQBI:'5000'});source.atRisk!.currentYearIncreases='10000';
  input.scheduleK1.push(second);input.qbiLossSources!.activities!.push(source);
  input.priorYear!.suspendedPassiveLosses.push({...structuredClone(input.priorYear!.suspendedPassiveLosses[0]),partnershipName:second.partnershipName});
  input.form461!.scheduleESupplementalIncome='-320000';input.form461!.noncapitalBusinessNet='-320000';
  const result=calculateFederalTax(input);
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('7000');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('253400');
  expect(result.carryforwards.qbiSuspendedLosses?.find(row=>row.limitation==='461(l)')?.vintages[0].qualifiedRemainingLoss.toFixed()).toBe('5600');
  const multiple=largeCurrentLoss();
  multiple.scheduleC=TaxYearInputSchema.parse({taxpayer:multiple.taxpayer,scheduleC:{businessName:'Other loss',accountHolder:'primary',qbiMateriallyParticipated:true,expenses:{supplies:'10000'}}}).scheduleC;
  multiple.form461!.noncapitalBusinessNet='-340000';
  expect(()=>calculateFederalTax(multiple)).toThrow(/loss pool|allocation method/i);
});
it('fixes current suspended SSTB character without requalifying prior losses',()=>{
  const input=k1QbiLossSourceInput();input.scheduleK1[0].section199AIsSST=true;input.qbiLossSources!.activities![0].statement!.section199AIsSST=true;
  input.w2s=TaxYearInputSchema.parse({taxpayer:input.taxpayer,w2s:[{...simpleW2Fixture.w2s[0],wages:'300000',federalWithheld:'0'}]}).w2s;
  const result=calculateFederalTax(input);
  expect(result.form8995A?.taxableIncomeBeforeQBI.toFixed()).toBe('224250');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('22128');
  expect(result.carryforwards.qbiSuspendedLosses?.find(row=>row.limitation==='465')?.vintages[0].qualifiedOriginalLoss.toFixed()).toBe('14752');
  const prior=k1QbiLossSourceInput(),k1=prior.scheduleK1[0],source=prior.qbiLossSources!.activities![0];
  Object.assign(k1,{ordinaryIncome:'20000',section199AQBI:'0',isPassiveActivity:true,qbiMateriallyParticipated:false,section199AIsSST:true});
  Object.assign(k1.form6198!,{ordinaryIncome:'20000',currentYearIncreases:'20000'});
  Object.assign(source.statement!,{ordinaryIncome:'20000',section199AQBI:'0',isPassiveActivity:true,qbiMateriallyParticipated:false,section199AIsSST:true});
  source.atRisk!.currentYearIncreases='20000';source.priorPassiveLoss='20000';
  prior.priorYear!.suspendedPassiveLosses[0].amount='20000';
  prior.priorYear!.suspendedPassiveLosses[0].qbiLossTracking!.vintages=[{taxYear:2024,originalLoss:'20000',qualifiedOriginalLoss:'16000',remainingLoss:'20000',qualifiedRemainingLoss:'16000',materiallyParticipatedInCurrentYear:false}];
  prior.w2s=TaxYearInputSchema.parse({taxpayer:prior.taxpayer,w2s:[{...simpleW2Fixture.w2s[0],wages:'500000',federalWithheld:'0'}]}).w2s;
  const priorResult=calculateFederalTax(prior);
  expect(priorResult.agi.toFixed()).toBe('500000');
  expect(priorResult.carryforwards.qbiLossCarryforward.toFixed()).toBe('16000');
  expect(priorResult.carryforwards.qbiSuspendedLosses).toEqual([]);
});
