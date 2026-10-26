// Spec: spec/federal/guided-royalty-sources.yaml.
import { expect, it } from 'vitest';
import { actualGuidedRoyaltySources } from '../fixtures/guided-royalty-sources';
import { startCompleteInterview, completeW2Entry, completeMortgageWorksheet } from './complete-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildGuidedRoyaltySources, royaltySourceFactErrors } from '@/lib/guided-royalty-sources';
import { updateSectionData, emptyDeductionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator';

function royaltyState() {
  const state = startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null});
  state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'200000'}]};
  state.segmentation.incomeTypes=['w2-wages','royalties'];
  state.sectionData['income-royalties']=actualGuidedRoyaltySources();
  return state;
}
function packet(state:GuidedFlowState){const data=state.sectionData['income-royalties'],original=data?.statements?.[0],property=data?.properties?.[0],link=property?.incomeSources?.[0];if(!data||!original||!property||!link)throw new Error('Missing fictional royalty sources');return{data,original,property,link};}
function addRecovery(state:GuidedFlowState,stateCode='MI',withheld='0.10'){
  state.sectionData.deductions={...emptyDeductionData,method:'standard',mortgageEntries:[],mortgageWorksheet:{...completeMortgageWorksheet,priorYearInterestRecoveriesPresent:true,allRecoveriesIncluded:true,
    recoveries:[{sourceId:'recovery-1',sourceTaxYear:'2025',sourceReference:'Fictional original refund record',payer:'Fictional lender',accountReference:'old-loan',accountHolder:'primary',refundSource:'lender_statement',originTaxYear:'2024',refundReceived:'600',taxableRecovery:'600',alreadyIncludedInOtherIncome:'600',miscSourceId:'recovery-misc-1',entireRefundBelongsToReturn:true,taxBenefitWorksheetReference:'Fictional completed prior tax benefit worksheet',priorReturnAndOtherRecoveriesReviewed:true,taxBenefitWorksheetConfirmed:true}],
    recoveryMiscStatements:[{sourceId:'recovery-misc-1',sourceTaxYear:'2025',sourceFormRevision:'2025-04',payer:'Fictional lender',payerTin:'98-7654321',accountReference:'old-loan',accountHolder:'primary',otherIncome:'600',royalties:'0',rents:'0',federalWithheld:'60.01',fishingBoatProceeds:'0',medicalPayments:'0',substitutePayments:'0',cropInsurance:'0',grossAttorneyProceeds:'0',fishPurchasedForResale:'0',section409ADeferrals:'0',nonqualifiedDeferredComp:'0',directSales:false,fatcaFilingRequirement:false,stateTaxReporting:'single',state:stateCode,payerStateId:'fictional-lender-state',stateIncome:'600',stateWithheld:withheld,recoveryOnlyIncomeConfirmed:true,sourceFactsConfirmed:true}]}};
}
it('preserves actual direct royalty originals and property expense handoff',()=>{
  const state=royaltyState(),before=JSON.stringify(state),input=buildTaxInputFromGuidedData(state);
  expect(input?.form1099Misc?.[0]?.royalties).toBe('12000.25');
  expect(input?.form1099Misc?.[0]?.federalWithheld).toBe('100.10');
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('211000.5');
  expect(result.niitTax.toFixed()).toBe('418');
  expect(result.totalWithholding.toFixed()).toBe('100.1');
  expect(JSON.stringify(state)).toBe(before);
});
it('keeps missing royalty facts distinct from actual zero and false',()=>{
  const state=royaltyState();
  Object.assign(state.sectionData,{'income-royalties':undefined});
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const unknown=royaltyState(),sources=actualGuidedRoyaltySources();
  sources.statements[0].royalties='';
  Object.assign(unknown.sectionData,{'income-royalties':sources});
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  for(const patch of [{tradeOrBusiness:undefined},{tradeOrBusiness:true},{cashMethod:false},{expenses:undefined},{interestExpense:''},{depletionExpense:'1'},{priorUnallowedExpenses:'1'}]){
    const next=royaltyState();Object.assign(packet(next).property,patch);expect(buildTaxInputFromGuidedData(next)).toBeNull();
  }
  const zero=royaltyState(),source=packet(zero);source.original.royalties='0';source.link.allocatedGross='0';if(source.link.original)source.link.original.royalties='0';source.property.expenses=[];
  expect(buildGuidedRoyaltySources(zero).royaltyPropertySources?.properties?.[0]).toMatchObject({tradeOrBusiness:false,expenses:[]});
  const before=JSON.stringify(zero);expect(buildTaxInputFromGuidedData(zero)).not.toBeNull();expect(JSON.stringify(zero)).toBe(before);
  const exact=royaltyState(),large=packet(exact);large.original.royalties='9007199254740993.01';large.link.allocatedGross='9007199254740993.01';if(large.link.original)large.link.original.royalties='9007199254740993.01';large.property.expenses=[];
  expect(buildGuidedRoyaltySources(exact).form1099Misc[0]?.royalties).toBe('9007199254740993.01');
  for(const value of ['NaN','Infinity','-1','1,2','0.001']){const invalid=royaltyState();packet(invalid).original.royalties=value;expect(buildTaxInputFromGuidedData(invalid)).toBeNull();}
  const current=royaltyState(),newYear=packet(current);current.taxYear=2026;newYear.data.sourceTaxYear='2026';newYear.original.sourceTaxYear='2026';newYear.original.sourceFormRevision='2026-12';newYear.property.expenses=[];
  if(newYear.link.original){newYear.link.original.taxYear='2026';newYear.link.original.sourceFormRevision='2026-12';}
  expect(()=>buildGuidedRoyaltySources(current)).toThrow(/cash tips/);
  Object.assign(newYear.original,{cashTips:'0',qualifiedOvertimeCompensation:'0',tippedOccupationCodePresent:false});
  expect(buildGuidedRoyaltySources(current).form1099Misc[0]).toMatchObject({taxYear:2026,cashTips:'0',qualifiedOvertimeCompensation:'0'});
});
it('merges original royalty and recovery statements once with exact property links',()=>{
  const state=royaltyState();addRecovery(state);const before=JSON.stringify(state),input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();
  expect(input?.form1099Misc?.map(row=>row.sourceId)).toEqual(['recovery-misc-1','royalty-original-1']);
  expect(input?.mortgageInterestWorksheet?.priorYearInterestRecoveries?.[0]?.otherIncomeSource?.form1099MiscIndex).toBe(0);
  expect(input?.royaltyPropertySources?.properties?.[0]?.incomeSources?.[0]?.sourceIndex).toBe(1);
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));expect(result.agi.toFixed()).toBe('211600.5');expect(result.totalWithholding.toFixed()).toBe('160.11');
  expect(JSON.stringify(state)).toBe(before);
  const collision=structuredClone(state);packet(collision).original.sourceId='recovery-misc-1';packet(collision).link.sourceId='recovery-misc-1';const copied=packet(collision).link.original;if(copied)copied.sourceId='recovery-misc-1';expect(buildTaxInputFromGuidedData(collision)).toBeNull();
  const mixed=royaltyState();packet(mixed).original.otherIncome='600';expect(buildTaxInputFromGuidedData(mixed)).toBeNull();
  const duplicate=royaltyState(),sources=packet(duplicate);sources.data.statements?.push({...sources.original,sourceId:'duplicate'});expect(royaltySourceFactErrors(duplicate)).toHaveProperty('royaltySources');
});
it('invalidates royalty confirmations without replacing actual saved source facts',()=>{
  const state=royaltyState(),changed=structuredClone(packet(state).data);if(!changed.statements?.[0])throw new Error('Missing original');changed.statements[0].royalties='12000.26';
  const next=updateSectionData(state,'income-royalties',changed);expect(packet(next).data.sourceFactsConfirmed).toBeNull();expect(packet(next).original.sourceFactsConfirmed).toBeNull();expect(packet(next).link.original?.royalties).toBe('12000.25');
  packet(next).data.sourceFactsConfirmed=true;packet(next).original.sourceFactsConfirmed=true;expect(buildTaxInputFromGuidedData(next)).toBeNull();
  const personal=state.sectionData['personal-info'];if(!personal)throw new Error('Missing household');
  const owner=updateSectionData(state,'personal-info',{...personal,lastName:'Changed'});expect(packet(owner).data.sourceFactsConfirmed).toBeNull();expect(packet(owner).property.tradeOrBusiness).toBe(false);
  const wrongYear=royaltyState();wrongYear.taxYear=2026;expect(buildTaxInputFromGuidedData(wrongYear)).toBeNull();
  const legacy=startCompleteInterview({filingStatus:'single',incomeTypes:[],lifeEvents:[],stateCode:null});expect(buildGuidedRoyaltySources(legacy)).toEqual({form1099Misc:[],royaltyPropertySources:undefined});
});
it('includes combined actual MISC state withholding once',()=>{
  const state=royaltyState();state.segmentation.stateCode='MI';addRecovery(state);const source=packet(state);source.original.stateWithheld='0.40';
  source.data.statements?.push({...source.original,sourceId:'other-state',accountReference:'another-account',royalties:'0',federalWithheld:'0',state:'OH',stateWithheld:'0.30',stateIncome:'0'});
  expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('0.5');
  const pa=structuredClone(state);pa.segmentation.stateCode='PA';const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(pa));
  expect(()=>calculatePAReturn(input)).toThrow(/royalt|Pennsylvania/i);expect(computeGuidedPreview(pa)?.state).toBeNull();
  expect(computeGuidedPreview(pa)?.agi).toBe('211600.5');
});
