// Spec: spec/federal/k1-form461-classification.yaml.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { k1QbiLossSourceInput } from '../fixtures/k1-qbi-loss-sources.js';
import { healthFacts } from '../fixtures/form7206.js';
import { assertForm7206ReviewSource } from '@/pdf/mappings/2025/fill-form-7206.js';

function source() {
  const input=k1QbiLossSourceInput(),k1=input.scheduleK1[0],facts=input.qbiLossSources!.activities![0];
  Object.assign(k1,{ordinaryIncome:'-330000',section199AQBI:'-264000',beginningBasis:'500000'});
  Object.assign(k1.form6198!,{ordinaryIncome:'-330000',priorYearAmountAtRisk:'500000'});
  Object.assign(facts.statement!,{ordinaryIncome:'-330000',section199AQBI:'-264000'});
  facts.basis!.beginningBasis='500000';facts.atRisk!.priorYearAmountAtRisk='500000';
  input.qbiLossSources!.form461Classification={sourceTaxYear:2025,sourceReference:'Actual complete business source classification',
    sourceFactsConfirmed:true,method:'ordinary_k1_only',allNonEmployeeBusinessSourcesIncluded:true,
    capitalIncomeIsNonbusiness:true,otherBusinessIncome:'0',otherBusinessDeductions:'0'};
  return input;
}
it('derives the unique current loss from source classification without entered Form461 totals',()=>{
  const input=source(),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.form461?.sourceFactsVerified).toBe(true);expect(result.form461?.line5ScheduleE.toFixed()).toBe('-330000');
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('17000');
  expect(result.agi.toFixed()).toBe('-313000');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('250400');
  expect(result.carryforwards.qbiSuspendedLosses?.find(row=>row.limitation==='461(l)')?.vintages[0].qualifiedRemainingLoss.toFixed()).toBe('13600');
  expect(input.form461).toBeUndefined();expect(JSON.stringify(input)).toBe(before);
});
it('uses calculated passive allowances before Form461 without a MAGI override',()=>{
  const input=source(),k1=input.scheduleK1[0],facts=input.qbiLossSources!.activities![0];
  Object.assign(k1,{isPassiveActivity:true,qbiMateriallyParticipated:false});
  Object.assign(facts.statement!,{isPassiveActivity:true,qbiMateriallyParticipated:false});
  const second=structuredClone(k1),secondFacts=structuredClone(facts),prior=structuredClone(input.priorYear!.suspendedPassiveLosses[0]);
  Object.assign(second,{partnershipName:'Actual positive source',partnershipEIN:'98-7654321',ordinaryIncome:'10000',section199AQBI:'0'});
  Object.assign(second.form6198!,{activityName:second.partnershipName,ordinaryIncome:'10000',currentYearIncreases:'10000'});
  Object.assign(secondFacts,{k1SourceId:'scheduleK1:1',entityName:second.partnershipName,entityEIN:second.partnershipEIN});
  Object.assign(secondFacts.statement!,{ordinaryIncome:'10000',section199AQBI:'0'});secondFacts.atRisk!.currentYearIncreases='10000';
  prior.partnershipName=second.partnershipName;input.scheduleK1.push(second);input.qbiLossSources!.activities!.push(secondFacts);input.priorYear!.suspendedPassiveLosses.push(prior);
  const result=calculateFederalTax(input);
  expect(result.form461?.sourceFactsVerified).toBe(true);
  expect(result.form461?.line5ScheduleE.toFixed()).toBe('0');expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('0');
  expect(result.agi.toFixed()).toBe('0');expect(result.form8582?.allowedLoss.toFixed()).toBe('10000');
  expect(result.form8582?.suspendedLoss.toFixed()).toBe('320000');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('8000');
});
it('rejects unknown and conflicting ordinary-only classification sources',()=>{
  for(const change of [{sourceFactsConfirmed:undefined},{sourceFactsConfirmed:false},{sourceTaxYear:2024},
    {capitalIncomeIsNonbusiness:undefined},{capitalIncomeIsNonbusiness:false},{otherBusinessIncome:'0.01'},
    {otherBusinessDeductions:undefined},{allNonEmployeeBusinessSourcesIncluded:false}]) {
    const input=source();Object.assign(input.qbiLossSources!.form461Classification!,change);
    expect(()=>calculateFederalTax(input)).toThrow(/classification|ordinary|source/i);
  }
  const business=source();business.scheduleC=TaxYearInputSchema.parse({taxpayer:business.taxpayer,scheduleC:{businessName:'Another actual business',grossReceipts:'1'}}).scheduleC;
  expect(()=>calculateFederalTax(business)).toThrow(/classification|ordinary|source/i);
  const automatic=source();automatic.form1099Nec=TaxYearInputSchema.parse({taxpayer:automatic.taxpayer,
    form1099Nec:[{payer:'Actual other business',payerTIN:'12-9999999',nonemployeeCompensation:'1',accountHolder:'primary'}]}).form1099Nec;
  expect(()=>calculateFederalTax(automatic)).toThrow(/classification|ordinary|source/i);
  const manual=source();manual.form461={sourceTaxYear:2025,sourceReference:'Different method',sourceFactsConfirmed:true,
    atRiskAndPassiveLimitationsApplied:true,scheduleESupplementalIncome:'-330000',tradeOrBusinessCapitalGainNetIncome:'0',
    noncapitalNonbusinessIncome:'0',noncapitalNonbusinessLoss:'0',noncapitalBusinessNet:'-330000',otherBusinessIncome:'0',otherBusinessDeductions:'0'};
  expect(()=>calculateFederalTax(manual)).toThrow(/classification|separate|simultaneous/i);
});

it('rejects actual NFT creator business sources from ordinary K1 classification',()=>{
  const input=k1QbiLossSourceInput();
  input.qbiLossSources!.form461Classification=source().qbiLossSources!.form461Classification;
  input.cryptoIncome=TaxYearInputSchema.parse({taxpayer:input.taxpayer,cryptoIncome:{businessAccountHolder:'primary',
    nftTransactions:[{nftName:'Actual creator sale',transactionType:'mint',proceeds:'10000',costBasis:'0',gasFee:'0',
      dateAcquired:'2025-06-01',isBusiness:true}]}}).cryptoIncome;
  const before=JSON.stringify(input);
  expect(()=>calculateFederalTax(input)).toThrow(/ordinary|business|classification/i);
  expect(JSON.stringify(input)).toBe(before);
});

function calculatedSeSource() {
  const input=k1QbiLossSourceInput(),k1=input.scheduleK1[0],facts=input.qbiLossSources!.activities![0];
  k1.selfEmploymentEarnings='-100000.00';delete k1.selfEmploymentNetEarningsAfterAdjustments;
  facts.statement!.selfEmploymentEarnings='-100000.00';delete facts.statement!.selfEmploymentNetEarningsAfterAdjustments;
  facts.selfEmploymentTreatment={method:'ordinary_current',sourceTaxYear:2025,sourceReference:'Actual original partner adjustment facts',
    sourceFactsConfirmed:true,noOtherPartnerAdjustmentsConfirmed:true,priorLossHistory:{sourceTaxYear:2024,
      sourceReference:'Actual prior SE loss ledger',sourceFactsConfirmed:true,amount:'0'}};
  return input;
}
it('derives matching current Box14 loss from actual limits and preserves the original',()=>{
  const input=calculatedSeSource(),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.scheduleSE?.netSEEarnings.toFixed()).toBe('-60000');expect(JSON.stringify(input)).toBe(before);
  const second=structuredClone(input.scheduleK1[0]),facts=structuredClone(input.qbiLossSources!.activities![0]);
  Object.assign(second,{partnershipName:'Actual SE income',partnershipEIN:'98-7654321',ordinaryIncome:'100000',section199AQBI:'80000',selfEmploymentEarnings:'100000'});
  Object.assign(second.form6198!,{activityName:second.partnershipName,ordinaryIncome:'100000',currentYearIncreases:'100000'});
  Object.assign(facts,{k1SourceId:'scheduleK1:1',entityName:second.partnershipName,entityEIN:second.partnershipEIN});
  Object.assign(facts.statement!,{ordinaryIncome:'100000',section199AQBI:'80000',selfEmploymentEarnings:'100000'});
  facts.atRisk!.currentYearIncreases='100000';input.scheduleK1.push(second);input.qbiLossSources!.activities!.push(facts);
  input.priorYear!.suspendedPassiveLosses.push({...structuredClone(input.priorYear!.suspendedPassiveLosses[0]),partnershipName:second.partnershipName});
  const combined=calculateFederalTax(input);
  expect(combined.scheduleSE?.netSEEarnings.toFixed()).toBe('40000');expect(combined.scheduleSE?.totalSETax.toFixed()).toBe('5652');
  expect(combined.agi.toFixed()).toBe('37174');expect(input.scheduleK1[0].selfEmploymentEarnings).toBe('-100000.00');
});
it('rejects missing SE history and unsupported negative Box14 characterization',()=>{
  for(const change of [{sourceFactsConfirmed:undefined},{noOtherPartnerAdjustmentsConfirmed:false},
    {priorLossHistory:undefined},{priorLossHistory:{sourceTaxYear:2025,sourceReference:'Wrong year',sourceFactsConfirmed:true,amount:'0'}},
    {priorLossHistory:{sourceTaxYear:2024,sourceReference:'Actual loss',sourceFactsConfirmed:true,amount:'1'}}]) {
    const input=calculatedSeSource();Object.assign(input.qbiLossSources!.activities![0].selfEmploymentTreatment!,change);
    expect(()=>calculateFederalTax(input)).toThrow(/self.employment|SE|Box14|partner/i);
  }
  const different=calculatedSeSource();different.scheduleK1[0].selfEmploymentEarnings='-80000';different.qbiLossSources!.activities![0].statement!.selfEmploymentEarnings='-80000';
  expect(()=>calculateFederalTax(different)).toThrow(/character|Box14|ordinary/i);
  const override=calculatedSeSource();override.scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments='-99999';
  expect(()=>calculateFederalTax(override)).toThrow(/calculated|adjusted|source/i);
});
it('uses calculated partner earnings consistently in health and review sources',()=>{
  const input=calculatedSeSource(),k1=input.scheduleK1[0],facts=input.qbiLossSources!.activities![0];
  Object.assign(k1,{ordinaryIncome:'100000.00',section199AQBI:'80000.00',selfEmploymentEarnings:'100000.00'});
  Object.assign(k1.form6198!,{ordinaryIncome:'100000.00',currentYearIncreases:'100000.00'});
  Object.assign(facts.statement!,{ordinaryIncome:'100000.00',section199AQBI:'80000.00',selfEmploymentEarnings:'100000.00'});
  facts.atRisk!.currentYearIncreases='100000.00';
  const health=healthFacts('scheduleK1:0');
  health.persons[0].name='Jordan Source';health.persons[0].attainedAgeAtYearEnd=45;
  health.plans[0].businessKind='partnership';health.plans[0].policyHolder='business';
  input.form7206=TaxYearInputSchema.parse({taxpayer:input.taxpayer,form7206:health}).form7206;
  const before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.scheduleSE.totalSETax.toFixed()).toBe('14129');
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe('600');expect(result.agi.toFixed()).toBe('92335');
  expect(()=>assertForm7206ReviewSource(input,result)).not.toThrow();expect(JSON.stringify(input)).toBe(before);
  const changed=structuredClone(input);changed.scheduleK1[0].selfEmploymentEarnings='99999.99';
  expect(()=>assertForm7206ReviewSource(changed,result)).toThrow(/source|match|earnings/i);
});
