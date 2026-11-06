// Spec: spec/federal/guided-k1-qbi-sources.yaml.
import { expect, it } from 'vitest';
import { buildGuidedK1Sources, updateK1LossSources } from '@/lib/guided-k1-qbi-sources';
import { actualGuidedK1Sources, actualPartnerHealthInsurance } from '../fixtures/guided-k1-qbi-sources';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
import { buildSectionRoute, lifeEventOptions, emptyAdjustmentData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { healthInsuranceSourceOptions } from '@/lib/guided-health-insurance-facts';
function fixture() {
  const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'100000'}]};
  state.sectionData.adjustments={...emptyAdjustmentData,k1LossSources:actualGuidedK1Sources()};return state;
}
it('builds original K1 sources and computes loss limits without an entered allowance',()=>{
  const state=fixture(),before=JSON.stringify(state),data=state.sectionData.adjustments!.k1LossSources;
  const sources=buildGuidedK1Sources(data,state);
  expect(sources?.scheduleK1[0].ordinaryIncome).toBe('-100000.00');
  expect(sources?.scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments).toBeUndefined();
  expect(sources?.scheduleK1[0].form6198?.ordinaryIncome).toBe('-100000');
  expect(validateSection(state,'adjustments').status).toBe('complete');
  const input=buildTaxInputFromGuidedData(state);expect(input?.form461).toBeUndefined();
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('40000');expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('48000');
  expect(result.scheduleSE.netSEEarnings.toFixed()).toBe('-60000');expect(JSON.stringify(state)).toBe(before);
});
it('preserves unknown and conflicting original K1 facts',()=>{
  const state=fixture();expect(buildGuidedK1Sources(undefined,state)).toBeUndefined();
  for(const patch of [{sourceTaxYear:''},{recipientName:'Different owner'},{allOtherAmountsZeroConfirmed:null},
    {domesticNonPtpConfirmed:false},{sameRegularAmtTreatmentConfirmed:null},{accountHolder:'spouse' as const}]) {
    const data=actualGuidedK1Sources();Object.assign(data.activities![0],patch);
    expect(()=>buildGuidedK1Sources(data,state)).toThrow();
  }
  for(const value of ['', 'NaN', 'Infinity', '1,2']) {
    const data=actualGuidedK1Sources();data.activities![0].statement!.ordinaryIncome=value;
    expect(()=>buildGuidedK1Sources(data,state)).toThrow();
  }
  const unknown=fixture();unknown.sectionData.adjustments!.k1LossSources!.activities![0].statement!.selfEmploymentEarnings='';
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
});
it('links actual partner health premiums to original K1 sources',()=>{
  const state=fixture(),data=state.sectionData.adjustments!.k1LossSources!,source=data.activities![0];
  Object.assign(source.statement!,{ordinaryIncome:'100000.00',section199AQBI:'80000.00',selfEmploymentEarnings:'100000.00'});
  source.atRisk!.currentYearIncreases='100000.00';
  const health=actualPartnerHealthInsurance();health.plans[0].businessSourceId='scheduleK1:0';health.plans[0].businessKind='partnership';health.plans[0].policyHolder='business';
  state.sectionData.adjustments!.healthInsuranceFacts=health;
  expect(healthInsuranceSourceOptions(undefined,[],data)).toContainEqual({sourceId:'scheduleK1:0',accountHolder:'primary',kind:'partnership',label:source.entityName,
    partnershipGrossOriginal:{taxYear:'2025',partnershipName:'Actual ordinary activity',partnershipEIN:'12-3456789',accountHolder:'primary',ordinaryIncome:'100000.00',selfEmploymentEarnings:'100000.00',selfEmploymentIncomeType:'nonfarm'}});
  const input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe('600');expect(result.agi.toFixed()).toBe('192335');
  expect(input?.scheduleK1[0].selfEmploymentEarnings).toBe('100000.00');
  source.accountHolder='spouse';expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it('invalidates all changed source histories while preserving actual values',()=>{
  const data=actualGuidedK1Sources(),changed=updateK1LossSources(data,{sourceReference:'Changed actual record'});
  expect(changed.sourceFactsConfirmed).toBeNull();expect(changed.activities![0].basis?.sourceFactsConfirmed).toBeNull();
  expect(changed.activities![0].atRisk?.priorLossHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.activities![0].passiveHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.activities![0].selfEmploymentTreatment?.priorLossHistory?.sourceFactsConfirmed).toBeNull();
  expect(changed.activities![0].statement?.ordinaryIncome).toBe('-100000.00');
  const state=fixture(),edited=updateSectionData(state,'personal-info',{...state.sectionData['personal-info']!,lastName:'Changed'});
  expect(edited.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
  expect(updateK1LossSources(changed,{sourceFactsConfirmed:true}).sourceFactsConfirmed).toBe(true);
});
it('binds EBL character to its actual regular history without using AMT amounts',()=>{
  const state=fixture(),data=actualGuidedK1Sources(),nol=structuredClone(actualGuidedNolSources);
  data.activities=[];delete data.form461Classification;
  nol.vintages=[{...nol.vintages![0],originKind:'excess_business_loss',originalLoss:'100000',openingCarryforward:'100000',
    section1411OriginalLoss:'0',history:[]}];nol.alternativeTax!.vintages=[];
  data.allExcessBusinessLossHistoriesIncluded=true;
  data.excessBusinessLossHistories=[{sourceTaxYear:'2024',sourceReference:'Actual prior qualified EBL history',sourceFactsConfirmed:true,
    nolSourceId:'regular2021',accountHolder:'primary',recipientName:'Jordan Example',recipientTaxpayerIdLast4:'3333',
    activityName:'Original actual activity',activityEIN:'12-3456789',limitationSourceReference:'Original filed461 and QBI character',
    originalNol:structuredClone(nol.vintages[0]),originalQualifiedLoss:'80000',qualifiedOpeningCarryforward:'80000',
    allHistoryIncluded:true,materiallyParticipatedInCurrentYear:true,history:[]}];
  state.sectionData.adjustments={...emptyAdjustmentData,k1LossSources:data,netOperatingLossSources:nol};
  const input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.netOperatingLoss?.deduction?.toFixed()).toBe('67400');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('53920');
  expect(result.qbiEblNol?.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('26080');
  const stale=structuredClone(state);stale.sectionData.adjustments!.netOperatingLossSources!.vintages![0].sourceReference='Replacement record';
  expect(buildTaxInputFromGuidedData(stale)).toBeNull();
  delete state.sectionData.adjustments!.k1LossSources;expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it('routes actual K1 sources from their own setup choice',()=>{
  const base={filingStatus:'single' as const,incomeTypes:['w2-wages' as const],lifeEvents:[],stateCode:null};
  const option=lifeEventOptions.find(row=>row.value==='k1-loss-sources');expect(option?.label).toBe('Have K-1 income or suspended business losses');
  const route=buildSectionRoute({...base,lifeEvents:['k1-loss-sources']}).map(row=>row.id);
  expect(route[2]).toBe('adjustments');expect(route.filter(id=>id==='adjustments')).toHaveLength(1);expect(route).toContain('other-taxes');
  expect(buildSectionRoute(base).map(row=>row.id)).not.toContain('adjustments');
});

it('requires the selected K1 packet before completing a preview',()=>{
  const state=fixture();state.segmentation.lifeEvents=['k1-loss-sources'];delete state.sectionData.adjustments!.k1LossSources;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(validateSection(state,'adjustments').status).not.toBe('complete');
  state.sectionData.adjustments!.k1LossSources={};expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.k1LossSources=actualGuidedK1Sources();expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  state.segmentation.lifeEvents=[];delete state.sectionData.adjustments!.k1LossSources;expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
});
