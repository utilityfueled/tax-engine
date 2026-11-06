// Spec: spec/state/pa-oid-legacy-independent.yaml. Setup copied byte-for-byte from frozen author constructor; controls are independent.
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {PAResidencySourcesSchema} from '@/models/pa-residency';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {actualOid} from '../../fixtures/guided-oid';
import {completeW2Entry,startCompleteInterview} from '../../guided-interview/complete-facts';
import {paOrdinaryOIDFixture} from '../../fixtures/pa-ordinary-oid-sources';
function originalIncompleteTreasury(code:'PA'|'OH'){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:code});
 if(!state.sectionData['personal-info'])throw Error('Explicit fictional personal source required');state.sectionData['personal-info'].state=code;
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'60000',stateTaxReporting:'single',state:code,stateWages:'60000',stateWithheld:'2000'}]};
 const oid={...actualOid,obligationType:'treasury' as const,originalIssueDiscount:'0',otherPeriodicInterest:'0',treasuryOID:'1000'};
 if(code==='PA')oid.paFacts={sourceReference:'Actual synthetic PA worksheet',factsConfirmed:true,paTaxTreatment:'us_government',strippedBond:false,bondPremiumNettedOnStatement:'0',paBondPremiumAmortization:'0'};
 state.sectionData['income-investments']={interestEntries:[],dividendEntries:[],brokerageEntries:[],oidEntries:[oid]};return state;
}
const inertKeys=["unreimbursedExpenses", "otherDeductions", "creditFromPriorYear", "extensionPayment", "estimatedPayments", "nonresidentTaxWithheld", "nontaxableIncome", "additionalEligibilityIncome", "spouseEligibilityIncome", "estateTrustIncome", "otherCredits", "priorYearPATaxableIncome", "priorYearTaxForgivenessCredit", "useTax", "lateFilingOrPaymentPenalty", "latePaymentInterest"] as const;
function actualBuilderAndSources(){
 const state=originalIncompleteTreasury('PA'),w2=state.sectionData['income-w2']?.entries[0];if(!w2)throw Error('Explicit fictional W2 original required');
 Object.assign(w2,{sourceTaxYear:'2025',socialSecurityWages:'60000',medicareWages:'60000',allocatedTips:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0'});
 const rawBeforeW2=buildTaxInputFromGuidedData(state);if(!rawBeforeW2)throw Error('Actual original builder required');
 const beforeW2=TaxYearInputSchema.parse(rawBeforeW2);
 w2.stateLocalSources=confirmGuidedW2StateLocalSources(beforeW2,0,{sourceTaxYear:2025,sourceReference:'Fictional complete original all W2 pages',sourceFactsConfirmed:true,owner:{accountHolder:'primary'},currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,stateReporting:'single',localReporting:'none',legacyScalarProjection:'first_entered_rows',stateRows:[{printedRow:1,sourceReference:'Actual fictional W2 Boxes15-17',state:'PA',employerStateIDStatus:'reported',employerStateID:'Fictional employer state ID',wages:'60000',withheld:'2000'}],localRows:[]});
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Actual confirmed W2 builder required');
 const input=TaxYearInputSchema.parse(raw),f=paOrdinaryOIDFixture();
 const owner={accountHolder:'primary',originalTaxpayer:{firstName:input.taxpayer.primary.firstName,lastName:input.taxpayer.primary.lastName,ssn:input.taxpayer.primary.ssn}};
 const sources=PAResidencySourcesSchema.parse({...f.sources,owner,interest:[],wages:[{...f.sources.wages[0],original:structuredClone(input.w2s[0]),payroll:[{sourceReference:'Fictional independent complete annual physical PA payroll',paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:'60000',paServicesCompensation:'60000',outsidePAServicesCompensation:'0'}]}],oidAndMiscSources:{...f.oidAndMiscSources,owner,oid:[{...f.oidAndMiscSources.oid[0],original:structuredClone(input.form1099OID[0]),withholdingConfirmation:{sourceReference:'Fictional current original noPAwithholding',actualPaymentToPAConfirmed:false,notRefundedByPayerConfirmed:true}}],miscWithholding:[]}});
 return{raw,input,sources};
}

it.each(inertKeys)('independent exact default and unknown boundary %s',(key)=>{
 const f=actualBuilderAndSources(),before=structuredClone(f);
 const legacy=f.input.paResidentReturn;if(!legacy)throw Error('Actual legacy original required');
 expect(Object.keys(f.raw.paResidentReturn??{})).toEqual(['scheduleA']);
 expect(legacy[key]).toBe('0');
 const result=calculatePAResidencySources(f.input,f.sources);
 expect(result.compensation.toFixed()).toBe('60000');expect(result.interest.toFixed()).toBe('0');expect(result.taxBeforeCredits.toFixed()).toBe('1842');
 expect(f).toEqual(before);
 for(const value of ['1','0.00','-0',null,undefined,'']){
  const altered=structuredClone(f);Object.assign(altered.input.paResidentReturn??{},{[key]:value});
  expect(()=>calculatePAResidencySources(altered.input,altered.sources),`${key}:${String(value)}`).toThrow(/only the actual original-bound OID classification/);
 }
 for(const value of [null,''])expect(TaxYearInputSchema.safeParse({...f.raw,paResidentReturn:{...f.raw.paResidentReturn,[key]:value}}).success).toBe(false);
 expect(f).toEqual(before);
});
const unlisted=[['isClaimedAsDependentOnAnotherFederalReturn',false],['localEITRate','0'],['otherStateCredits',[]],['quarterlyEstimatedPayments',['0','0','0','0']],['scheduleB',{}],['inventedUnknownScalar','0']] as const;
it.each(unlisted)('independent unlisted inert-looking method %s',(key,value)=>{
 const f=actualBuilderAndSources();Object.assign(f.input.paResidentReturn??{},{[key]:structuredClone(value)});
 expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow(/only the actual original-bound OID classification/);
});
it.each(['paObligationInterest','unprovenZeroAdjustment'])('independent zero ScheduleA extension %s',(key)=>{
 const f=actualBuilderAndSources();Object.assign(f.input.paResidentReturn?.scheduleA??{},{[key]:'0'});
 expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow(/only the actual original-bound OID classification/);
});
const replayModes=['owner','year','issuer','source-id','unconfirmed','missing-proof','missing-coverage','classification'] as const;
it.each(replayModes)('independent current original proof guard %s',(mode)=>{
 const f=actualBuilderAndSources(),proof=f.sources.oidAndMiscSources?.oid[0],legacy=f.input.paResidentReturn?.scheduleA?.oidSources?.[0];
 if(!proof||!legacy)throw Error('Actual current proof required');
 if(mode==='owner')f.input.taxpayer.primary.ssn='987-65-4321';
 else if(mode==='year')f.input.form1099OID[0].taxYear=2026;
 else if(mode==='issuer')f.input.form1099OID[0].payer='Changed actual issuer at equal1000';
 else if(mode==='source-id')f.input.form1099OID[0].sourceId='Different current original';
 else if(mode==='unconfirmed')proof.sourceFactsConfirmed=false;
 else if(mode==='missing-proof')delete f.sources.oidAndMiscSources;
 else if(mode==='missing-coverage')f.input.paResidentReturn?.scheduleA?.oidSources?.splice(0,1);
 else legacy.paTaxTreatment='taxable';
 expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
 expect(f.input.form1099OID[0].treasuryOID).toBe('1000');
});
it('independent nonresident override remains closed',()=>{
 const f=actualBuilderAndSources();f.input.paNonresidentReturn=TaxYearInputSchema.parse({...f.input,paNonresidentReturn:{residencyStatus:'nonresident'}}).paNonresidentReturn;
 expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow(/retained PA nonresident override/);
});
it('independent actual taxable OID classification retains1000',()=>{
 const f=actualBuilderAndSources(),proof=f.sources.oidAndMiscSources?.oid[0],legacy=f.input.paResidentReturn?.scheduleA?.oidSources?.[0];
 if(!proof||!legacy)throw Error('Actual current proof required');
 Object.assign(f.input.form1099OID[0],{obligationType:'taxable',treasuryOID:'0',originalIssueDiscount:'1000'});
 proof.original=structuredClone(f.input.form1099OID[0]);proof.classification='ordinary_taxable';
 Object.assign(proof.instrument,{issuerName:'Actual fictional taxable issuer',usTreasuryDirectObligationConfirmed:false});legacy.paTaxTreatment='taxable';
 const before=structuredClone(f),result=calculatePAResidencySources(f.input,f.sources);
 expect(result.compensation.toFixed()).toBe('60000');expect(result.interest.toFixed()).toBe('1000');expect(result.taxBeforeCredits.toFixed()).toBe('1873');expect(f).toEqual(before);
});
