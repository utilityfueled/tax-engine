// Specs: state/oh-workspace-actual-source-export.yaml and federal/schedule-a.yaml.
import {afterEach,it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import * as source from '@/engine/state/oh-residency-source';
import * as pdf from '@/pdf/fill-oh-reference-forms';
import * as scheduleAPdf from '@/pdf/fill-schedule-a';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import * as federalEngine from '@/engine/federal';
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return';
import {buildGuidedW2SourceContext,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {computeGuidedPreviewEvaluation} from '@/lib/guided-preview-compute';
import {emptyDeductionData,emptyDonationEntry,loadGuidedFlowState,saveGuidedFlowState} from '@/lib/guided-interview-flow';
import {confirmGuidedOhioSchoolDistrictFacts} from '@/lib/guided-ohio-school-district-facts';
import {confirmGuidedW2StateLocalSources} from '@/lib/guided-w2-state-local-facts';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts,emptyOhioPaymentDraft,emptyOhioPaymentRow} from '@/lib/guided-ohio-payment-facts';
import {actualOhioWorkspaceFlow,confirmCurrentOhioWorkspaceOriginals} from '../../fixtures/oh-workspace-actual-originals';
import {stateOriginalsReviewWorkspace} from '../../fixtures/guided-state-originals';
import {completeTreasuryRouting} from '../../fixtures/guided-state-routing-complete';
import {attachSchoolDraft,guidedSchoolDistrictFixture,required} from '../../fixtures/guided-oh-school-district-complete';
vi.mock('server-only',()=>({}));
afterEach(()=>vi.restoreAllMocks());
it.each([['full_year_resident','2323','105'],['part_year_resident','929','41'],['nonresident','465','0']]as const)('actual Ohio workspace prepared originals survive redaction for %s',async(status,tax,penalty)=>{
  const state=actualOhioWorkspaceFlow(status),before=structuredClone(state),actualFill=pdf.fillOhioReferenceForms;
  const prepared=vi.spyOn(source,'prepareOhioResidencyReviewWithFederalResult');
  const federalCalculation=vi.spyOn(federalEngine,'calculateFederalTax');
  const renderer=vi.spyOn(pdf,'fillOhioReferenceForms').mockImplementation(async(input,federal,dir,overlay,token)=>{
   expect(federalCalculation).toHaveBeenCalledOnce();
   expect(federalCalculation.mock.calls[0]?.[0].taxpayer.primary.ssn).toBe('111-22-3333');
   expect(federalCalculation.mock.calls[0]?.[0]).not.toBe(prepared.mock.calls[0]?.[0]);
   expect(token).toBeDefined();const original=source.resolveOhioResidencyReview(input,federal,token);
   expect(original.taxpayer.primary.ssn).toBe('111-22-3333');expect(input.taxpayer.primary.ssn).not.toBe(original.taxpayer.primary.ssn);
   expect(original.ohioResidency?.originalFederalSources).toEqual(original.ohioPayments?.originalFederalSources);
   const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(original,federal,overlay));
   expect(result.it1040.line10_taxAfterCredits.toString()).toBe(tax);expect(result.it1040.line11_underpaymentPenalty.toString()).toBe(penalty);
   expect(overlay).toEqual({});return actualFill(input,federal,dir,overlay,token);
  });
  const output=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state);
  expect(prepared).toHaveBeenCalledOnce();expect(prepared.mock.calls[0]?.[0].taxpayer.primary.ssn).toBe('111-22-3333');expect(renderer).toHaveBeenCalledOnce();expect(output.includedForms).toContain('oh-it-1040-reference.pdf');expect(output.includedForms).toContain('oh-it-sd-2210-reference.pdf');expect(state).toEqual(before);
  const destination=process.env.TAX_ENGINE_OH_WORKSPACE_ARTIFACT_DIR;if(destination){await mkdir(destination,{recursive:true});await writeFile(join(destination,status+'.pdf'),output.contents);}
 });
it('Ohio workspace preparation binds the exact original input and federal result',()=>{
 const state=actualOhioWorkspaceFlow('part_year_resident');
 const input=buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),state);
 const {token,federalResult}=source.prepareOhioResidencyReviewWithFederalResult(input);
 const redactedInput=redactReviewIdentifiers(input),redactedResult=redactReviewIdentifiers(federalResult);
 expect(source.resolveOhioResidencyReview(input,federalResult,token)).toEqual(input);
 expect(source.resolveOhioResidencyReview(redactedInput,redactedResult,token)).toEqual(input);
 const changedSource=structuredClone(input);
 changedSource.taxpayer.primary.firstName='Changed';
 expect(()=>source.resolveOhioResidencyReview(changedSource,federalResult,token)).toThrow(/originals differ from prepared review/);
 const changedResult={...redactedResult,agi:redactedResult.agi.plus('1')};
 expect(()=>source.resolveOhioResidencyReview(redactedInput,changedResult,token)).toThrow(/saved federal calculation differs/);
 expect(()=>source.resolveOhioResidencyReview(redactedInput,redactedResult,{...token})).toThrow(/valid original review context/);
});
it.each(['missingResidency','missingPayments','stalePayer','unknownSpecial','staleNestedRemaining'])('Ohio workspace rejects saved source gap before renderer: %s',async kind=>{
 const state=actualOhioWorkspaceFlow('part_year_resident'),data=state.sectionData['state-return'];if(!data?.ohioPayments)throw Error('Independent actual payment fixture missing');
 if(kind==='missingResidency')delete data.ohioResidency;
 if(kind==='missingPayments')delete data.ohioPayments;
 if(kind==='stalePayer'){const w=state.sectionData['income-w2']?.entries[0];if(!w)throw Error('Independent actual W2 fixture missing');w.employerEin='98-7654321';}
 if(kind==='unknownSpecial'&&data.ohioPayments)data.ohioPayments.specialFacts.militaryDisasterRelief='';
 if(kind==='staleNestedRemaining'&&data.ohioPayments)data.ohioPayments.remainingTaxPayment.sourceFactsConfirmed=null;
 const before=structuredClone(state),render=vi.spyOn(pdf,'fillOhioReferenceForms');
 await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/source|actual|confirm|unknown|relief|payment|residency/i);expect(render).not.toHaveBeenCalled();expect(state).toEqual(before);
});
function explicitlyReconfirmSavedLedgerOriginals(state:ReturnType<typeof actualOhioWorkspaceFlow>){
 const data=state.sectionData['state-return'];if(!data?.ohioResidency||!data.ohioPayments)throw Error('Independent current actual source packets missing');
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
 data.ohioResidency=confirmGuidedOhioResidencyFacts(input,data.ohioResidency);
 data.ohioPayments=confirmGuidedOhioPaymentFacts(input,data.ohioPayments);return input;
}
function withReceipt(){
 const state=actualOhioWorkspaceFlow('full_year_resident'),data=state.sectionData['state-return'];if(!data?.ohioPayments)throw Error('Independent actual payment fixture missing');
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),p=input.taxpayer.primary;
 const receipt={sourceId:'Independent-ledger-original',sourceReference:'Independent actual bank receipt',accountHolder:'primary',taxYear:'2025',returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'100.01',appliedToThisReturnConfirmed:true,original:{accountName:p.firstName+' '+p.lastName,accountSsn:p.ssn,taxYear:'2025',returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'100.01',confirmationNumber:'Independent-ledger-confirmation'}};
 data.ohioPayments=confirmGuidedOhioPaymentFacts(input,{...data.ohioPayments,paymentRows:[receipt]});
 data.stateEstimatedPayments=[{state:'OH',date:'2025-04-15',amount:'100.01'}];const current=explicitlyReconfirmSavedLedgerOriginals(state);return {state,data,input:current};
}
function reopenOhioFlow(state:ReturnType<typeof actualOhioWorkspaceFlow>){
 const values=new Map<string,string>();
 const storage:Storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
 expect(saveGuidedFlowState(storage,'ohio-estimates-review',state)).toBe(true);
 return required(loadGuidedFlowState(storage,'ohio-estimates-review'));
}
it('Ohio workspace refuses duplicate saved receipt claims before rendering',async()=>{
 const {state,data}=withReceipt();data.stateEstimatedPayments.push({state:'OH',date:'2025-04-15',amount:'100.01'});explicitlyReconfirmSavedLedgerOriginals(state);const render=vi.spyOn(pdf,'fillOhioReferenceForms');await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/distinct|reconcile|receipt/i);expect(render).not.toHaveBeenCalled();expect(data.stateEstimatedPayments).toHaveLength(2);
});
it('Ohio workspace refuses unmatched saved receipt cents before rendering',async()=>{
 const {state,data}=withReceipt(),saved=data.stateEstimatedPayments[0];if(!saved)throw Error('Independent saved row missing');saved.amount='100.02';explicitlyReconfirmSavedLedgerOriginals(state);const render=vi.spyOn(pdf,'fillOhioReferenceForms');await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/reconcile|receipt/i);expect(render).not.toHaveBeenCalled();expect(saved.amount).toBe('100.02');
});
it('Ohio source receipt field still rejects one oversized actual amount without widening its bound',()=>{
 const {state,data,input}=withReceipt(),draft=data.ohioPayments;if(!draft)throw Error('Independent actual payment fixture missing');const row=draft.paymentRows[0];if(!row)throw Error('Independent actual receipt missing');Object.assign(row,{amount:'9007199254740993.01'});const original=row.original;if(!original||typeof original!=='object')throw Error('Independent actual original missing');Object.assign(original,{amount:'9007199254740993.01'});expect(()=>confirmGuidedOhioPaymentFacts(input,draft)).toThrow();expect(()=>buildGuidedStateOriginals(input,state)).toThrow();expect(row.amount).toBe('9007199254740993.01');
});

it('uses in-year Ohio receipt originals for guided and saved Schedule A review',async()=>{
 const {state}=completeTreasuryRouting('OH',false);
 state.sectionData.deductions={...state.sectionData.deductions,method:'itemized',realEstateTaxes:'18000'};
 confirmCurrentOhioWorkspaceOriginals(state,[
  {date:'2025-04-15',amount:'400.25'},
  {date:'2025-04-15',amount:'400.25'},
  {date:'2026-01-15',amount:'100.50'},
 ]);
 const before=structuredClone(state);
 const preview=computeGuidedPreviewEvaluation(state);
 expect(preview.preview.blockedBy).toBeNull();
 expect(preview.sourceReplaySucceeded).toBe(true);
 expect(preview.preview.metrics?.state).toMatchObject({stateCode:'OH',stateWithholding:'2901'});
 expect(preview.input).not.toBeNull();
 const federal=calculateFederalTax(buildGuidedStateOriginals(preview.input!,state));
 expect(federal.allLines.find(line=>line.form==='Sched A'&&line.line==='5a')?.value.toString()).toBe('2800.5');
 expect(preview.preview.metrics?.taxableIncome).toBe(federal.taxableIncome.toString());
 expect(preview.preview.metrics?.taxableIncome).not.toBe(calculateFederalTax(preview.input!).taxableIncome.toString());

 const actualFill=scheduleAPdf.fillScheduleA;
 const renderer=vi.spyOn(scheduleAPdf,'fillScheduleA').mockImplementation(async(...args)=>{
  const doc=await actualFill(...args);
  expect(doc.getForm().getTextField(scheduleAPdf.SCHEDULE_A_FIELDS.line5a).getText()).toBe('2801');
  return doc;
 });
 const reopened=reopenOhioFlow(state);
 expect(computeGuidedPreviewEvaluation(reopened).preview).toEqual(preview.preview);
 const output=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),reopened);
 expect(renderer).toHaveBeenCalledOnce();
 expect(output.includedForms).toEqual(expect.arrayContaining(['f1040sa-filled.pdf','oh-it-1040-reference.pdf']));
 expect(state).toEqual(before);

 const data=required(reopened.sectionData['state-return']);
 data.stateEstimatedPayments.push({date:'2025-04-15',amount:'400.25',state:'OH'});
 explicitlyReconfirmSavedLedgerOriginals(reopened);
 expect(computeGuidedPreviewEvaluation(reopened).preview).toEqual(preview.preview);
 required(data.ohioPayments).allPaymentsIncludedConfirmed=null;
 const blocked=computeGuidedPreviewEvaluation(reopened);
 expect(blocked.preview.metrics).toBeNull();
 expect(blocked.preview.blockedBy).toMatch(/actual|confirm/i);
 expect(blocked.input).not.toBeNull();
});

it('includes Ohio estimate originals with automatic itemization from confirmed donations',async()=>{
 const {state}=completeTreasuryRouting('OH',false);
 const deductions={...emptyDeductionData,donationEntries:[{...emptyDonationEntry,organization:'Fictional public charity',type:'cash' as const,
  amount:'14000',date:'2025-05-15',qualifiedOrganization:true,isPrivateFoundation:false,donorAdvisedFund:false,supportingOrganization:false}]};
 // A legacy saved draft may omit the deduction election while retaining the actual donation.
 Reflect.deleteProperty(deductions,'method');
 state.sectionData.deductions=deductions;
 confirmCurrentOhioWorkspaceOriginals(state,[{date:'2025-04-15',amount:'400.25'}]);
 const reopened=reopenOhioFlow(state);
 const preview=computeGuidedPreviewEvaluation(reopened);
 const original=required(preview.input);
 expect(original.deductionElection).toBe('automatic');
 expect(original.scheduleA).toBeUndefined();
 expect(original.donations[0]?.amount.toString()).toBe('14000');
 expect(calculateFederalTax(original).deductionUsed).toBe('itemized');
 expect.soft(preview.preview.metrics?.taxableIncome).toBe('43600');
 expect(preview.sourceReplaySucceeded).toBe(true);
 const actualFill=scheduleAPdf.fillScheduleA;
 const renderer=vi.spyOn(scheduleAPdf,'fillScheduleA').mockImplementation(async(...args)=>{
  const doc=await actualFill(...args);
  expect(doc.getForm().getTextField(scheduleAPdf.SCHEDULE_A_FIELDS.line5a).getText()).toBe('2400');
  return doc;
 });
 const output=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),reopened);
 expect(renderer).toHaveBeenCalledOnce();
 expect(output.includedForms).toEqual(expect.arrayContaining(['f1040sa-filled.pdf','oh-it-1040-reference.pdf']));

 const blank=structuredClone(reopened);
 required(blank.sectionData['state-return']).ohioPayments={...emptyOhioPaymentDraft,paymentRows:[emptyOhioPaymentRow()]};
 const beforePaymentEntry=computeGuidedPreviewEvaluation(blank);
 expect(beforePaymentEntry.preview.blockedBy).toBeNull();
 expect(beforePaymentEntry.preview.metrics?.taxableIncome).toBe('44000');
 expect(beforePaymentEntry.preview.metrics?.state).toBeNull();
});

it('preserves school district replay when itemizing a confirmed Ohio estimate',async()=>{
 const {state,data,draft}=guidedSchoolDistrictFixture();
 state.sectionData.deductions={...state.sectionData.deductions,method:'itemized',realEstateTaxes:'18000'};
 const w2=required(state.sectionData['income-w2']?.entries[0]);
 const w2Source=required(w2.stateLocalSources);
 required(w2Source.stateRows[0]).employerStateID='12345678';
 w2.stateLocalSources=confirmGuidedW2StateLocalSources(required(buildGuidedW2SourceContext(state)),0,w2Source);
 const residency=required(data.ohioResidency);
 confirmCurrentOhioWorkspaceOriginals(state,[{date:'2025-04-15',amount:'50.25'}]);
 data.ohioResidency=residency;
 const input=explicitlyReconfirmSavedLedgerOriginals(state);
 const school=confirmGuidedOhioSchoolDistrictFacts(input,draft,data.ohioResidency,data.ohioPayments);
 attachSchoolDraft(data,school);
 const computed=computeGuidedPreviewEvaluation(state);
 expect(computed.sourceReplaySucceeded).toBe(true);
 expect(computed.preview.metrics?.state).toMatchObject({stateCode:'OH',stateWithholding:'3050',schoolDistrict:{districtCode:'0302',totalPayments:'1100'}});
 const complete=buildGuidedStateOriginals(input,state);
 const federal=calculateFederalTax(complete);
 expect(federal.allLines.find(line=>line.form==='Sched A'&&line.line==='5a')?.value.toString()).toBe('4150.25');
 const output=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state);
 expect(output.includedForms).toEqual(expect.arrayContaining(['f1040sa-filled.pdf','oh-it-1040-reference.pdf','oh-sd-100-reference.pdf']));
});

it('holds in-year Ohio estimates with an unreconciled additional income-tax total',async()=>{
 const {state}=completeTreasuryRouting('OH',false);
 state.sectionData.deductions={...state.sectionData.deductions,method:'itemized',stateLocalTaxes:'400.25',realEstateTaxes:'18000'};
 confirmCurrentOhioWorkspaceOriginals(state,[{date:'2025-04-15',amount:'400.25'}]);
 const before=structuredClone(state);
 const renderer=vi.spyOn(scheduleAPdf,'fillScheduleA');
 const workspace=stateOriginalsReviewWorkspace();
 const reconcile=/reconcile.*additional state and local income tax.*Ohio estimated payment/i;
 const blocked=computeGuidedPreviewEvaluation(state);
 expect.soft(blocked.preview.metrics).toBeNull();
 expect.soft(blocked.preview.blockedBy??'').toMatch(reconcile);
 const exportError=await buildWorkspaceFilledReturnDownload(workspace,state).then(()=>'',(error:unknown)=>error instanceof Error?error.message:'');
 expect.soft(exportError).toMatch(reconcile);
 expect(renderer.mock.calls.length).toBe(0);
 expect(state).toEqual(before);

 // No 2025 Ohio estimate overlaps the additional total in either control.
 for(const remaining of [[],[{date:'2026-01-15',amount:'400.25'}]]){
  const control=confirmCurrentOhioWorkspaceOriginals(structuredClone(state),remaining);
  const preview=computeGuidedPreviewEvaluation(control);
  expect(preview.sourceReplaySucceeded).toBe(true);
  const federal=calculateFederalTax(buildGuidedStateOriginals(required(preview.input),control));
  expect(federal.allLines.find(line=>line.form==='Sched A'&&line.line==='5a')?.value.toString()).toBe('2400.25');
  const output=await buildWorkspaceFilledReturnDownload(workspace,control);
  expect(output.includedForms).toContain('f1040sa-filled.pdf');
 }
});
