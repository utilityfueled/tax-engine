/** Spec: spec/federal/form-4562-passenger-first-year.yaml. */
import {expect,it} from 'vitest';
import {Form4562Schema} from '@/models/inputs.js';
import {calculateForm4562} from '@/engine/forms/form-4562.js';
import {passengerFixture} from '../fixtures/passenger-auto-first-year.js';
it('retains an explicit standalone packet rather than stripping its evidence',()=>{expect((Form4562Schema.parse(passengerFixture()) as unknown as Record<string,unknown>).passengerFirstYearSources).toBeDefined();});
it('rejects incomplete original documentary facts and unsupported first-year cohorts',()=>{
 const mutations:((v:ReturnType<typeof passengerFixture>)=>void)[]=[v=>{Reflect.deleteProperty(v.passengerFirstYearSources,'grossCostBasis');},v=>{v.passengerFirstYearSources.mileage.totalMiles='0';},v=>{v.passengerFirstYearSources.eligibility.noOtherAssetsOrActivities=false;},v=>{v.passengerFirstYearSources.bonus.sourceReference='';},v=>{v.passengerFirstYearSources.partI.businessIncomeLimit='0';},v=>{v.passengerFirstYearSources.partI.allowedSection179='';},v=>{Reflect.set(v.passengerFirstYearSources,'originalForm',{});},v=>{v.assets[0].placedInServiceDate='2026-10-01';},v=>{v.passengerFirstYearSources.acquisitionDate='2025-01-19';},v=>{v.passengerFirstYearSources.businessUsePercentage='50';},v=>{v.assets.push(structuredClone(v.assets[0]));}];
 for(const mutate of mutations){const input=passengerFixture();mutate(input);expect(()=>calculateForm4562(Form4562Schema.parse(input),2026)).toThrow(/passenger/i);}
});
it('rejects internally unsupported sources even when a caller refreshes the retained original',()=>{
 const cases:((v:ReturnType<typeof passengerFixture>)=>void)[]=[
 v=>{v.passengerFirstYearSources.mileage.businessMiles='7499';},v=>{v.passengerFirstYearSources.mileage.commutingMiles='1';},v=>{v.passengerFirstYearSources.businessUsePercentage='75.01';},v=>{v.passengerFirstYearSources.partI.totalCost='75001';},v=>{v.passengerFirstYearSources.partI.priorCarryover='1';},v=>{v.passengerFirstYearSources.partI.nextCarryover='1';},v=>{v.passengerFirstYearSources.partI.electedCost='5001';},v=>{v.passengerFirstYearSources.partI.businessIncomeLimit='4999';},v=>{v.passengerFirstYearSources.partI.maximum='9999999';},v=>{v.passengerFirstYearSources.unloadedVehicleWeightPounds='6001';},v=>{v.passengerFirstYearSources.purchaseContractDate='2025-01-19';},v=>{v.passengerFirstYearSources.acquisitionDate='2026-03-01';},v=>{v.passengerFirstYearSources.acquisitionDate='2026-02-30';},v=>{v.assets[0].firstYearBonusEligible=true;},v=>{v.assets[0].disposedDuringYear=true;},v=>{v.assets[0].cumulativePriorAdsDeductions='1';},v=>{v.assets[0].section280FRecaptureTriggered=true;},v=>{v.assets[0].method='SL';},v=>{v.assets[0].convention='midQuarter';},v=>{v.assets[0].placedInServiceDate='2026-02-30';},v=>{v.assets[0].placedInServiceDate='2026-10-01';},v=>{v.assets[0].costBasis='100000';},v=>{v.specialDepreciationAllowance='1';},v=>{v.listedPropertyDepreciation='1';},
 ];
 for(const change of cases){const input=passengerFixture();change(input);const {passengerFirstYearSources:s,...original}=input;s.originalForm=structuredClone(original);expect(()=>calculateForm4562(Form4562Schema.parse(input),2026)).toThrow(/passenger/i);}
});
it('distinguishes absent election facts from actualzero and rejects invalid raw money without leaking it',()=>{
 for(const field of ['allowedSection179','priorCarryover','nextCarryover','electedCost','businessIncomeLimit'] as const){const input=passengerFixture('100000',75,'0');Reflect.deleteProperty(input.passengerFirstYearSources.partI,field);expect(Form4562Schema.safeParse(input).success).toBe(false);}
 for(const value of ['','NaN','Infinity','-1','1e3','private-111-22-3333']){const input=passengerFixture();input.passengerFirstYearSources.grossCostBasis=value;const parsed=Form4562Schema.safeParse(input);expect(parsed.success).toBe(false);if(!parsed.success)expect(parsed.error.message).not.toContain('private-111-22-3333');}
 expect(()=>calculateForm4562(Form4562Schema.parse(passengerFixture('100000',75,'0')),2026)).not.toThrow();
});

it('requires actual finite-cohort eligibility records rather than defaulting missing answers',()=>{
 for(const key of ['cashSoleProprietor','activeTradeOrBusiness','noTaxExemptUseOrADSRequirement','noAlternativeMileageMethod','notDeductedElsewhere'] as const){const input=passengerFixture();Reflect.deleteProperty(input.passengerFirstYearSources.eligibility,key);expect(Form4562Schema.safeParse(input).success).toBe(false);}
 for(const [gross,use,elected,bonus] of [['100000',75,'10000',true],['8000',75,'6000',true],['20000',75,'1000.5',false]] as const){const input=passengerFixture(gross,use,elected,bonus);expect(()=>calculateForm4562(Form4562Schema.parse(input),2026)).toThrow(/passenger/i);}
});
