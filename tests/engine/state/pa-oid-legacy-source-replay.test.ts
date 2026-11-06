// Spec: spec/state/pa-oid-legacy-source-replay.yaml. Actual builder parse, never fixture-key deletion.
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
it('actual guided builder schema defaults preserve original-bound Treasury1000',()=>{
 const f=actualBuilderAndSources(),before=structuredClone(f),legacy=f.input.paResidentReturn;if(!legacy)throw Error('Actual legacy OID root required');
 expect(Object.keys(f.raw.paResidentReturn??{})).toEqual(['scheduleA']);
 expect(Object.keys(legacy).sort()).toEqual([...inertKeys,'scheduleA'].sort());for(const key of inertKeys)expect(legacy[key]).toBe('0');
 expect(f.input.form1099OID[0].treasuryOID).toBe('1000');
 const result=calculatePAResidencySources(f.input,f.sources);
 expect(result.compensation.toFixed()).toBe('60000');expect(result.interest.toFixed()).toBe('0');expect(result.taxBeforeCredits.toFixed()).toBe('1842');expect(f).toEqual(before);
});
it('every positive retained legacy override remains unsupported',()=>{
 for(const key of inertKeys){const f=actualBuilderAndSources();if(!f.input.paResidentReturn)throw Error('Legacy required');f.input.paResidentReturn[key]='1';expect(()=>calculatePAResidencySources(f.input,f.sources),key).toThrow();}
});
it('nondefault lexical zeros cannot broaden the retained legacy contract',()=>{
 for(const value of ['0.00','-0']){const f=actualBuilderAndSources();if(!f.input.paResidentReturn)throw Error('Legacy required');f.input.paResidentReturn.estimatedPayments=value;expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();}
});
it('explicit unknown legacy values are never inferred as zero',()=>{
 for(const value of [null,'']){const f=actualBuilderAndSources();expect(TaxYearInputSchema.safeParse({...f.raw,paResidentReturn:{...f.raw.paResidentReturn,estimatedPayments:value}}).success).toBe(false);}
});
it('other retained legacy methods remain unsupported',()=>{
 for(const method of ['scheduleA','scheduleB','eligibility']as const){const f=actualBuilderAndSources();const legacy=f.input.paResidentReturn;if(!legacy)throw Error('Legacy required');if(method==='scheduleA')legacy.scheduleA={...legacy.scheduleA,paObligationInterest:'0'};else if(method==='scheduleB')legacy.scheduleB={paExemptInterestDividends:'0'};else legacy.isClaimedAsDependentOnAnotherFederalReturn=false;expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();}
});
it('missing or contradictory actual OID source proof remains rejected',()=>{
 for(const mode of ['missing','classification','unconfirmed']as const){const f=actualBuilderAndSources();if(mode==='missing')delete f.sources.oidAndMiscSources;else{const proof=f.sources.oidAndMiscSources?.oid[0];if(!proof)throw Error('Actual proof required');if(mode==='classification')proof.classification='ordinary_taxable';else proof.sourceFactsConfirmed=false;}expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();}
});
it('equal-dollar changed OID original remains stale',()=>{
 const f=actualBuilderAndSources();f.input.form1099OID[0].payer='Changed fictional original same1000';expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();expect(f.input.form1099OID[0].treasuryOID).toBe('1000');
});
