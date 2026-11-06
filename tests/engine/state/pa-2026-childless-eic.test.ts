import {it,expect} from 'vitest';
import Decimal from 'decimal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {guidedPAOrdinaryPanelFixture} from '../../fixtures/guided-pa-ordinary-panels.js';
import {buildTaxInputFromGuidedData} from '../../../apps/web/src/lib/guided-interview-bridge.js';
import {buildGuidedStateOriginals} from '../../../apps/web/src/lib/guided-state-engine-inputs.js';
import {confirmGuidedPAResidencySources} from '../../../apps/web/src/lib/guided-pa-residency-facts.js';
import {confirmGuidedPAOrdinaryReturnFacts} from '../../../apps/web/src/lib/guided-pa-ordinary-return-facts.js';
import * as flow from '../../../apps/web/src/lib/guided-interview-flow.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {pa2026OrdinaryDraftFixture} from '../../fixtures/pa-2026-ordinary-draft.js';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return.js';
import {getConstants} from '@/models/constants.js';import {calculateFederalTax} from '@/engine/federal.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import * as native from '../../../apps/web/src/lib/guided-pa-ordinary-return-completion.js';
import {calculatePA2026OrdinaryDraft} from '@/engine/state/pa-ordinary-return.js';
import {pa2026ChildlessEicFixture,rebindPA2026Childless} from '../../fixtures/pa-2026-childless-eic.js';
// Spec: spec/state/pa-2026-childless-eic-dependency.yaml
it('PA2026 childless draft composes literal FY PY NR taxes',()=>{
 for(const[status,taxable,tax]of[['resident','50000','1535'],['part_year','26000','798'],['nonresident','6000','184']]as const){const f=pa2026ChildlessEicFixture(status),r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe(taxable);expect(r.pa.pa40.taxLiability.toFixed()).toBe(tax);expect(r.pa.workingCredit.credit.toFixed()).toBe('0');expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');}
});

it.each(['19539.49','19539.50','19539.99','19540','19540.01'])('PA2026 childless raw and reported threshold %s',amount=>{
 const f=pa2026ChildlessEicFixture('resident',amount,'600');
 if(new Decimal(amount).lt('19540'))expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/phaseout/);
 else{const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.pa.pa40.taxLiability.toFixed()).toBe('600');expect(r.dependencyProof.confirmedChildlessCompletedEitcPhaseout?.toFixed()).toBe('19540');expect(r.dependencyProof.reportedWageAgi?.toFixed()).toBe('19540');expect(r.dependencyProof.ordinaryWages.toFixed()).toBe(amount);}
});
it('PA2026 childless draft requires complete original child sources',()=>{
 const f=pa2026ChildlessEicFixture();const absent={...f.sources};delete (absent as Partial<typeof absent>).eitcChildInventory;expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,absent)).toThrow(/phaseout/);
 const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
});
it.each(['year','unknownYear','owner','reference','unconfirmed','unknownReview','falseReview','unknownNone','falseNone','candidates','extra','capturedReview','noCapture','snapshot','dependent'])('PA2026 childless actual source refusal %s',kind=>{
 const f=pa2026ChildlessEicFixture(),s=f.sources.eitcChildInventory;
 if(kind==='year')s.sourceTaxYear=2025;if(kind==='unknownYear')Reflect.set(s,'sourceTaxYear',null);if(kind==='owner')s.owner.ssn='900-00-9999';if(kind==='reference')s.sourceReference='';if(kind==='unconfirmed')s.sourceFactsConfirmed=false;if(kind==='unknownReview')Reflect.set(s,'allPotentialQualifyingChildrenReviewedConfirmed',null);if(kind==='falseReview')s.allPotentialQualifyingChildrenReviewedConfirmed=false;if(kind==='unknownNone')Reflect.set(s,'noQualifyingEitcChildrenConfirmed',null);if(kind==='falseNone')s.noQualifyingEitcChildrenConfirmed=false;if(kind==='candidates')s.candidateChildren.push({actualSource:'Retained unreviewed child'});if(kind==='extra')Reflect.set(s,'trustedChildless',true);if(kind==='capturedReview')s.sourceReference+=' edited';if(kind==='noCapture')s.capturedReview={};if(kind==='snapshot')s.originalFederalSources={};if(kind==='dependent'){Reflect.set(f.input.taxpayer,'dependents',[{...f.input.taxpayer.primary,relationship:'child',monthsLived:12,qualifiesForEIC:false}]);rebindPA2026Childless(f);s.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);}
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
});
it.each(['wageLexical','employer','ownerName','payrollReference','payrollDate','sourceReference','deductionElection'])('PA2026 childless actual original edit %s cannot silently refresh child proof',kind=>{
 const f=pa2026ChildlessEicFixture(),s=f.sources.eitcChildInventory,before=JSON.stringify(s.originalFederalSources);
 if(kind==='wageLexical')f.input.w2s[0].wages='50000.00';if(kind==='employer')f.input.w2s[0].employer.ein='98-7654321';if(kind==='ownerName')f.input.taxpayer.primary.firstName+='Changed';if(kind==='payrollReference')f.input.paResidencySources.wages[0].payroll[0].sourceReference+=' edited';if(kind==='payrollDate')f.input.paResidencySources.wages[0].payroll[0].paidOn='2026-12-30';if(kind==='sourceReference')s.sourceReference+=' edited';if(kind==='deductionElection')f.input.deductionElection='standard';
 rebindPA2026Childless(f);
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
 expect(JSON.stringify(s.originalFederalSources)).toBe(before);
});
it('PA2026 native source actions capture confirm edit reconfirm without confirming the parent',()=>{
 const f=pa2026ChildlessEicFixture();let d=native.emptyGuidedPA2026EicChildInventory();expect(d.sourceTaxYear).toBeNull();expect(d.noQualifyingEitcChildrenConfirmed).toBeNull();
 d=native.captureGuidedPA2026EicChildInventory(f.input,d);expect(d.sourceFactsConfirmed).toBeNull();expect(()=>native.confirmGuidedPA2026EicChildInventory(f.input,d)).toThrow();
 d=native.updateGuidedPA2026EicChildInventory(d,{sourceTaxYear:2026,sourceReference:'Actual entered complete EIC child review',allPotentialQualifyingChildrenReviewedConfirmed:true,noQualifyingEitcChildrenConfirmed:true});
 expect(()=>native.confirmGuidedPA2026EicChildInventory(f.input,d)).toThrow(/capture/);d=native.captureGuidedPA2026EicChildInventory(f.input,d);d=native.confirmGuidedPA2026EicChildInventory(f.input,d);expect(native.buildGuidedPA2026EicChildInventory(f.input,JSON.parse(JSON.stringify(d)))).toEqual(d);
 let parent:native.GuidedPAOrdinaryReturnCompletionSources={...f.sources,eitcChildInventory:d,sourceFactsConfirmed:null};expect(()=>native.buildGuidedPAOrdinaryReturnCompletionSources(f.input,parent,f.facts)).toThrow();parent=native.confirmGuidedPAOrdinaryReturnCompletionSources(f.input,parent,f.facts);expect(calculatePA2026OrdinaryDraft(f.input,f.facts,parent).pa.pa40.taxLiability.toFixed()).toBe('1535');
 const original=structuredClone(d.originalFederalSources);d=native.updateGuidedPA2026EicChildInventory(d,{sourceReference:'Actually edited source reference'});parent=native.updateGuidedPAOrdinaryReturnCompletionSources(parent,{eitcChildInventory:d});expect(parent.sourceFactsConfirmed).toBeNull();expect(d.sourceFactsConfirmed).toBeNull();expect(d.originalFederalSources).toEqual(original);expect(()=>native.confirmGuidedPAOrdinaryReturnCompletionSources(f.input,parent,f.facts)).toThrow();
 d=native.confirmGuidedPA2026EicChildInventory(f.input,native.captureGuidedPA2026EicChildInventory(f.input,d));parent=native.confirmGuidedPAOrdinaryReturnCompletionSources(f.input,{...parent,eitcChildInventory:d},f.facts);expect(native.buildGuidedPAOrdinaryReturnCompletionSources(f.input,JSON.parse(JSON.stringify(parent)),f.facts)).toEqual(parent);
 f.input.w2s[0].employer.ein='98-7654321';expect(()=>native.buildGuidedPA2026EicChildInventory(f.input,d)).toThrow(/stale/);expect(()=>native.confirmGuidedPA2026EicChildInventory(f.input,d)).toThrow(/stale/);expect(d.originalFederalSources).toEqual(original);
});
it('PA2026 childless known zero PA source is retained and withholding coverage stays exact',()=>{
 const f=pa2026ChildlessEicFixture('nonresident'),w=f.input.w2s[0];w.stateWages='0';w.stateTaxWithheld='0';Object.assign(f.input.paResidencySources.wages[0].payroll[0],{paServicesCompensation:'0',outsidePAServicesCompensation:'50000'});rebindPA2026Childless(f);f.sources.eitcChildInventory=native.confirmGuidedPA2026EicChildInventory(f.input,native.captureGuidedPA2026EicChildInventory(f.input,f.sources.eitcChildInventory));const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.pa.pa40.taxLiability.toFixed()).toBe('0');expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('0');
 const insufficient=pa2026ChildlessEicFixture('resident','50000','1534');expect(()=>calculatePA2026OrdinaryDraft(insufficient.input,insufficient.facts,insufficient.sources)).toThrow(/withholding/);
});
it('PA2026 childless draft preserves old cohorts and public gates',()=>{
 const old=pa2026OrdinaryDraftFixture(),oldResult=calculatePA2026OrdinaryDraft(old.input,old.facts,old.sources);expect(oldResult.pa.pa40.taxLiability.toFixed()).toBe('2303');expect(oldResult.dependencyProof).not.toHaveProperty('confirmedChildlessCompletedEitcPhaseout');
 const high=pa2026ChildlessEicFixture('resident','75000','2303');high.sources.eitcChildInventory.noQualifyingEitcChildrenConfirmed=false;expect(()=>calculatePA2026OrdinaryDraft(high.input,high.facts,high.sources)).toThrow();
 const historic=paOrdinaryReturnFixture();expect(calculatePAOrdinaryReturn(historic.input,historic.facts,historic.sources).pa40.taxLiability.toFixed()).toBe('1539');expect(()=>calculatePAOrdinaryReturn(historic.input,historic.facts,{...historic.sources,eitcChildInventory:pa2026ChildlessEicFixture().sources.eitcChildInventory})).toThrow();
 const f=pa2026ChildlessEicFixture(),r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.readiness.fullFederalCalculated).toBe(false);expect(r.readiness.filingEligible).toBe(false);expect(r.pa.readiness.filingEligible).toBe(false);expect(()=>getConstants(2026)).toThrow(/incomplete/);expect(()=>calculateFederalTax(f.input)).toThrow(/incomplete/);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/incomplete/);expect(()=>preparePAOrdinaryReturnReview(f.input)).toThrow(/2025|2026/);
 const serialized=JSON.stringify(r);for(const marker of[f.input.taxpayer.primary.ssn,f.input.w2s[0].employer.ein,f.sources.eitcChildInventory.sourceReference])expect(serialized).not.toContain(marker);
});

it('PA2026 childless multiple W2 originals sum once before reporting and reject duplicate coverage',()=>{
 const f=pa2026ChildlessEicFixture('resident','10000.60','300'),w2=structuredClone(f.input.w2s[0]),row=structuredClone(f.input.paResidencySources.wages[0]);Object.assign(w2,{wages:'9539.60',stateWages:'9539.60',stateTaxWithheld:'300',socialSecurityWages:'9539.60',socialSecurityWithheld:'591.46',medicareWages:'9539.60',medicareWithheld:'138.32'});w2.employer.name='Fictional second independent employer';w2.employer.ein='98-7654321';f.input.w2s.push(w2);row.originalIndex=1;row.sourceReference='Fictional second current W2 original';row.original=structuredClone(w2);Object.assign(row.payroll[0],{sourceReference:'Fictional second payroll',grossCompensation:'9539.60',outsidePAServicesCompensation:'9539.60'});f.input.paResidencySources.wages.push(row);rebindPA2026Childless(f);f.sources.eitcChildInventory=native.confirmGuidedPA2026EicChildInventory(f.input,native.captureGuidedPA2026EicChildInventory(f.input,f.sources.eitcChildInventory));const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.dependencyProof.ordinaryWages.toFixed()).toBe('19540.2');expect(r.dependencyProof.reportedWageAgi?.toFixed()).toBe('19540');expect(r.pa.pa40.taxLiability.toFixed()).toBe('600');expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('19540');
 f.input.paResidencySources.wages.push(structuredClone(row));expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
});
it.each(['missingWage','negativeWage','malformedWage','unknownCare','positiveCare','adjustment'])('PA2026 childless proof preserves actual amount and other dependency refusal %s',kind=>{
 const f=pa2026ChildlessEicFixture();if(kind==='missingWage')f.input.w2s[0].wages='';if(kind==='negativeWage')f.input.w2s[0].wages='-1';if(kind==='malformedWage')f.input.w2s[0].wages='50,000';if(kind==='unknownCare')Reflect.set(f.sources.care,'allCarePaymentSourcesReviewedConfirmed',null);if(kind==='positiveCare')f.input.w2s[0].box10DependentCareBenefits='1';if(kind==='adjustment')Reflect.set(f.input,'adjustments',{iraDeduction:'0'});rebindPA2026Childless(f);f.sources.eitcChildInventory=native.confirmGuidedPA2026EicChildInventory(f.input,native.captureGuidedPA2026EicChildInventory(f.input,f.sources.eitcChildInventory));expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
});

it('PA2026 native inventory survives actual guided state handoff save and parent invalidation',()=>{
 const g=guidedPAOrdinaryPanelFixture(),f=pa2026ChildlessEicFixture();g.state.taxYear=2026;g.state.segmentation.incomeTypes=['w2-wages'];delete g.state.sectionData['income-investments'];g.state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:''};const entry=g.state.sectionData['income-w2']!.entries[0];Object.assign(entry,{sourceTaxYear:'2026',stateWages:'50000',stateWithheld:'1535'});
 const raw=buildTaxInputFromGuidedData(g.state);expect(raw).not.toBeNull();const input=TaxYearInputSchema.parse(raw);f.input.paResidencySources.wages[0].original=structuredClone(input.w2s[0]);const residency=confirmGuidedPAResidencySources(input,f.input.paResidencySources),current={...input,paResidencySources:residency};
 const facts=confirmGuidedPAOrdinaryReturnFacts(current,f.facts),child=native.confirmGuidedPA2026EicChildInventory(current,native.captureGuidedPA2026EicChildInventory(current,f.sources.eitcChildInventory)),completion=native.confirmGuidedPAOrdinaryReturnCompletionSources(current,{...f.sources,eitcChildInventory:child},facts);
 g.state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 const saved=JSON.parse(JSON.stringify(g.state)) as flow.GuidedFlowState,bound=buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved)),saved);expect(bound.paOrdinaryReturnCompletionSources?.eitcChildInventory).toEqual(child);expect(()=>calculatePA2026OrdinaryDraft(bound,bound.paOrdinaryReturnFacts,bound.paOrdinaryReturnCompletionSources)).toThrow(/childTaxCredit/);expect(flow.validateSection(saved,'state-return').status).toBe('complete');
 const unchanged=flow.updateSectionData(saved,'state-return',structuredClone(saved.sectionData['state-return']!));expect(unchanged.sectionData['state-return']?.paOrdinaryReturnCompletionSources).toEqual(completion);
 const edited=flow.updateSectionData(saved,'personal-info',{...saved.sectionData['personal-info']!,lastName:'Actual changed owner'});expect(edited.sectionData['state-return']?.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();expect(edited.sectionData['state-return']?.paOrdinaryReturnCompletionSources?.eitcChildInventory?.originalFederalSources).toEqual(child.originalFederalSources);expect(flow.validateSection(edited,'state-return').status).toBe('partial');expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(edited)),edited)).toThrow();
});
