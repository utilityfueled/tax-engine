// Spec: spec/federal/form-172-farming-waiver.yaml.
import { expect,it,vi } from 'vitest';
import { calculateVerifiedAiAudit,resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
vi.mock('server-only',()=>({}));
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { farmingWaiverInput } from '../../fixtures/form-172-farming-waiver.js';
const calculate=(value:ReturnType<typeof farmingWaiverInput>)=>calculateFederalTax(TaxYearInputSchema.parse(value));
it('computes independent actual farm and full return origins without electing for the taxpayer',()=>{
 const source=farmingWaiverInput(),before=JSON.stringify(source),result=calculate(source);
 expect(result.agi.toFixed()).toBe('-75000');expect(result.scheduleF?.netFarmProfit.toFixed()).toBe('-100000');
 expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('75000');
 expect(result.form172?.farmingSources?.regularFarmOnly.netOperatingLoss.toFixed()).toBe('100000');
 expect(result.form172?.farmingSources?.alternativeFarmOnly.netOperatingLoss.toFixed()).toBe('100000');
 expect(result.form172?.farmingSources?.regularFarmingLoss.toFixed()).toBe('80000');expect(result.form172?.farmingSources?.alternativeFarmingLoss.toFixed()).toBe('75000');
 expect(result.form172?.farmingSources?.carrybackUsed.toFixed()).toBe('0');expect(result.form172?.farmingSources?.waiverVerified).toBe(true);
 expect(result.carryforwards.nolCarryforward.toFixed()).toBe('80000');expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('75000');
 expect(result.form172?.section1411OriginalLoss.toFixed()).toBe('0');expect(JSON.stringify(source)).toBe(before);
});
it('applies actual excess business loss before attribution and preserves its separate carry once',()=>{
 const result=calculate(farmingWaiverInput('510000'));
 expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('187000');expect(result.agi.toFixed()).toBe('-288000');
 expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('293000');expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('288000');
 expect(result.form172?.farmingSources?.regularFarmOnly.netOperatingLoss.toFixed()).toBe('313000');
 expect(result.form172?.farmingSources?.regularFarmingLoss.toFixed()).toBe('293000');expect(result.form172?.farmingSources?.alternativeFarmingLoss.toFixed()).toBe('288000');
 expect(result.form172?.newRegularCarryforward.toFixed()).toBe('480000');expect(result.form172?.newAlternativeCarryforward.toFixed()).toBe('475000');
 expect(result.form172?.currentExcessBusinessLoss.toFixed()).toBe('187000');
});
it('rejects missing contradictory and unsupported original farm facts',()=>{
 const mutations:Array<(v:ReturnType<typeof farmingWaiverInput>)=>void>=[
  v=>{delete (v.form172 as Partial<typeof v.form172>).farmingSources;},v=>{v.form172.farmingLossIncluded=false;},
  v=>{v.form172.farmingSources.sourceTaxYear=2024;},v=>{v.form172.farmingSources.accountHolder='spouse' as 'primary';},
  v=>{v.form172.farmingSources.farmerSsnLast4='0000';},v=>{v.form172.farmingSources.principalCropOrActivity='stale farm';},
  v=>{v.form172.farmingSources.ein='98-7654321';},v=>{v.form172.farmingSources.sourceFactsConfirmed=false;},
  v=>{delete v.form172.farmingSources.originals.receipts.cropInsuranceProceeds;},v=>{delete v.form172.farmingSources.originals.expenses.depreciation;},
  v=>{v.form172.farmingSources.originals.receipts.salesOfProductsRaised='10001';},
  v=>{v.form172.farmingSources.alternativeTax.originals.expenses.seedsAndPlants='110001';},
  v=>{v.form172.farmingSources.alternativeTax.sourceFactsConfirmed=false;},v=>{v.form172.farmingSources.priorAtRiskSuspensionsKnownEmptyConfirmed=false;},
  v=>{v.form172.farmingSources.priorPassiveSuspensionsKnownEmptyConfirmed=false;},v=>{v.scheduleF.materiallyParticipated=false;},
  v=>{v.scheduleF.accountingMethod='accrual';},v=>{v.form172.farmingSources.allInvestmentAtRiskConfirmed=false;},
  v=>{delete (v as Partial<typeof v>).form461;},v=>{v.form461.noncapitalBusinessNet='-99999';},
  v=>{v.form461.otherBusinessIncome='1';},v=>{v.scheduleF.expenses.depreciation='1';v.form172.farmingSources.originals.expenses.depreciation='1';},
 ];
 for(const mutate of mutations){const value=farmingWaiverInput();mutate(value);expect(()=>calculate(value)).toThrow(/farm|172|461|source/i);}
 for(const field of Object.keys(farmingWaiverInput().form172.farmingSources)){
  const value=farmingWaiverInput();Reflect.deleteProperty(value.form172.farmingSources,field);expect(()=>calculate(value)).toThrow(/farm|172|source/i);
 }
 for(const kind of ['receipts','expenses'] as const)for(const field of Object.keys(farmingWaiverInput().form172.farmingSources.originals[kind])){
  for(const alternative of [false,true]){const value=farmingWaiverInput();
   Reflect.deleteProperty(alternative?value.form172.farmingSources.alternativeTax.originals[kind]:value.form172.farmingSources.originals[kind],field);
   expect(()=>calculate(value)).toThrow(/farm|172|source/i);}
 }
 for(const field of ['seedsPaidAndUsedDuringYearConfirmed','noPrepaidFarmSuppliesConfirmed','section464LimitationNotApplicableConfirmed','notTaxShelterConfirmed',
  'noSection263ACapitalizationRequiredConfirmed','noFarmAccountingOrBasisElectionsConfirmed','noCapitalOrPreproductiveCostsConfirmed','deductibleSeedsAfterAllFarmLimitationsConfirmed']){
  const value=farmingWaiverInput();Reflect.set(value.form172.farmingSources,field,false);expect(()=>calculate(value)).toThrow(/farm|172|source/i);
 }
 for(const field of Object.keys(farmingWaiverInput().form172.farmingSources.alternativeTax)){
  const value=farmingWaiverInput();Reflect.deleteProperty(value.form172.farmingSources.alternativeTax,field);expect(()=>calculate(value)).toThrow(/farm|172|source/i);
 }
 for(const field of Object.keys(farmingWaiverInput().form461)){
  const value=farmingWaiverInput();Reflect.deleteProperty(value.form461,field);expect(()=>calculate(value)).toThrow(/farm|172|461|source/i);
 }
 const knownZero=farmingWaiverInput();knownZero.scheduleF.salesOfProductsRaised='0';knownZero.form172.farmingSources.originals.receipts.salesOfProductsRaised='0';knownZero.form172.farmingSources.alternativeTax.originals.receipts.salesOfProductsRaised='0';knownZero.form461.noncapitalBusinessNet='-110000';
 expect(calculate(knownZero).scheduleF?.netFarmProfit.toFixed()).toBe('-110000');
});
it('requires the actual timely original entire-period waiver and preserves the annual gate',()=>{
 for(const mutate of [
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.statementAttachedToOriginalReturnConfirmed=false;},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.entireCarrybackPeriodWaivedConfirmed=false;},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.returnFiledDate='2026-04-16';},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.statementExecutedDate='2026-04-11';},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.extensionUsed=true;},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.amendedReturn=true;},
  (v:ReturnType<typeof farmingWaiverInput>)=>{v.form172.farmingSources.waiver.irrevocableElectionConfirmed=false;},
 ]){const value=farmingWaiverInput();mutate(value);expect(()=>calculate(value)).toThrow(/farm|172|waiver|election/i);}
 for(const field of Object.keys(farmingWaiverInput().form172.farmingSources.waiver)){
  const value=farmingWaiverInput();Reflect.deleteProperty(value.form172.farmingSources.waiver,field);expect(()=>calculate(value)).toThrow(/farm|172|source/i);
 }
 const future=farmingWaiverInput();future.taxpayer.taxYear=2026;future.form172.sourceTaxYear=2026;future.form172.farmingSources.sourceTaxYear=2026;
 expect(()=>calculate(future)).toThrow(/ready|readiness|2025|farm|unavailable|not enabled/i);
});
it('retains source cents and keeps original election and ledger records out of public results',()=>{
 const source=farmingWaiverInput();source.scheduleF.expenses.seedsAndPlants='110000.49';source.form461.noncapitalBusinessNet='-100000';
 source.form172.farmingSources.originals.expenses.seedsAndPlants='110000.49';source.form172.farmingSources.alternativeTax.originals.expenses.seedsAndPlants='110000.49';
 const result=calculate(source);expect(result.form172?.regular.sourcePartI[24].toFixed()).toBe('-80000.49');
 expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');
 const parsed=TaxYearInputSchema.parse(source),scope={ownerScope:'fictional-farm-owner',workspaceId:'fictional-farm-return',workspaceRevision:'fictional-farm-revision'};
 const audit=calculateVerifiedAiAudit(scope,parsed),context=resolveServerAiTaxContext({...scope,taxYear:2025,audit});expect(context.status).toBe('available');
 const workspace=Object.assign(createWorkspaceRecord(scope.workspaceId,{now:'2026-11-14T00:00:00.000Z'}),{form172:parsed.form172});
 for(const payload of [audit,context,sanitizeWorkspaceForHostedStorage(workspace),buildProviderWorkspaceRequest(workspace,{now:'2026-11-14T00:00:00.000Z'})]){
  const json=JSON.stringify(payload);for(const marker of ['farmingSources','PRIVATE','2026-04-10','2026-04-09','12-3456789','farmerSsnLast4','originalReturnReference'])expect(json).not.toContain(marker);
 }
 const publicResult=JSON.stringify(result);for(const marker of ['PRIVATE','2026-04-10','2026-04-09','12-3456789','farmerSsnLast4','originalReturnReference'])expect(publicResult).not.toContain(marker);
});
