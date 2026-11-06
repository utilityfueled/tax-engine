// Spec: state/oh-workspace-actual-source-export.yaml. Source-first actual private context controls.
import {afterEach,it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import * as source from '@/engine/state/oh-residency-source';
import * as pdf from '@/pdf/fill-oh-reference-forms';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {actualOhioWorkspaceFlow} from '../../fixtures/oh-workspace-actual-originals';
import {stateOriginalsReviewWorkspace} from '../../fixtures/guided-state-originals';
vi.mock('server-only',()=>({}));
afterEach(()=>vi.restoreAllMocks());
it.each([['full_year_resident','2323','105'],['part_year_resident','929','41'],['nonresident','465','0']]as const)('actual Ohio workspace prepared originals survive redaction for %s',async(status,tax,penalty)=>{
  const state=actualOhioWorkspaceFlow(status),before=structuredClone(state),actualFill=pdf.fillOhioReferenceForms;
  const prepared=vi.spyOn(source,'prepareOhioResidencyReview');
  const renderer=vi.spyOn(pdf,'fillOhioReferenceForms').mockImplementation(async(input,federal,dir,overlay,token)=>{
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
it('Ohio workspace refuses duplicate saved receipt claims before rendering',async()=>{
 const {state,data}=withReceipt();data.stateEstimatedPayments.push({state:'OH',date:'2025-04-15',amount:'100.01'});explicitlyReconfirmSavedLedgerOriginals(state);const render=vi.spyOn(pdf,'fillOhioReferenceForms');await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/distinct|reconcile|receipt/i);expect(render).not.toHaveBeenCalled();expect(data.stateEstimatedPayments).toHaveLength(2);
});
it('Ohio workspace refuses unmatched saved receipt cents before rendering',async()=>{
 const {state,data}=withReceipt(),saved=data.stateEstimatedPayments[0];if(!saved)throw Error('Independent saved row missing');saved.amount='100.02';explicitlyReconfirmSavedLedgerOriginals(state);const render=vi.spyOn(pdf,'fillOhioReferenceForms');await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/reconcile|receipt/i);expect(render).not.toHaveBeenCalled();expect(saved.amount).toBe('100.02');
});
it('Ohio source receipt field still rejects one oversized actual amount without widening its bound',()=>{
 const {state,data,input}=withReceipt(),draft=data.ohioPayments;if(!draft)throw Error('Independent actual payment fixture missing');const row=draft.paymentRows[0];if(!row)throw Error('Independent actual receipt missing');Object.assign(row,{amount:'9007199254740993.01'});const original=row.original;if(!original||typeof original!=='object')throw Error('Independent actual original missing');Object.assign(original,{amount:'9007199254740993.01'});expect(()=>confirmGuidedOhioPaymentFacts(input,draft)).toThrow();expect(()=>buildGuidedStateOriginals(input,state)).toThrow();expect(row.amount).toBe('9007199254740993.01');
});
