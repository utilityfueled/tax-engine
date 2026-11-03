// Spec: state/pa-complete-workspace-export.yaml. Real bridge, engine, renderer and merged PDFs.
import {expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import * as rendering from '@/pdf/fill-return';
import {guidedPACompleteOriginals} from '../../fixtures/guided-pa-complete-originals';
import {stateOriginalsReviewWorkspace} from '../../fixtures/guided-state-originals';
vi.mock('server-only',()=>({}));
async function inspectPacket(contents:Uint8Array,name:string){
 const output=process.env.TAX_ENGINE_PA_WORKSPACE_REVIEW_OUTPUT_DIR;
 const directory=output??await mkdtemp(join(tmpdir(),'pa-workspace-review-'));
 await mkdir(directory,{recursive:true});const file=join(directory,name+'.pdf');await writeFile(file,contents);
 try{return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',`import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1],strict=True)
print(json.dumps({'pages':len(r.pages),'text':'\\n'.join(p.extract_text() or '' for p in r.pages),'fields':len(r.get_fields() or {}),'widgets':sum(1 for p in r.pages for a in (p.get('/Annots') or []) if a.get_object().get('/Subtype')=='/Widget')}))`,file],{encoding:'utf8',timeout:30000})) as {pages:number;text:string;fields:number;widgets:number};}
 finally{if(!output)await rm(directory,{recursive:true,force:true});}
}
it('complete PA workspace exports replay all three actual ordinary residency results',async()=>{
 const renderer=vi.spyOn(rendering,'fillReturn');
 try{for(const [status,tax] of [['resident','1539'],['part_year','799'],['nonresident','184']] as const){
  renderer.mockClear();const state=guidedPACompleteOriginals(status),before=structuredClone(state);
  const download=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state);
  expect(renderer).toHaveBeenCalledTimes(1);const call=renderer.mock.calls[0];if(!call)throw Error('Actual renderer was omitted');
  const [input,result,options]=call;
  expect(result.stateReturns?.pennsylvania).toMatchObject({methodVersion:'pa-ordinary-return-v1',residencyStatus:status});
  expect(result.stateReturns?.pennsylvania?.pa40.taxLiability.toFixed()).toBe(tax);
  expect(options).toHaveProperty('paOrdinaryReview');expect(Reflect.get(options,'paOrdinaryReview')).toBeTruthy();
  expect(input.paOrdinaryReturnFacts).toBeTruthy();expect(input.paOrdinaryReturnCompletionSources).toBeTruthy();
  const personal=state.sectionData['personal-info'];if(!personal)throw Error('Explicit complete personal source is missing');const ssn=personal.ssn;
  for(const serial of [JSON.stringify(input),JSON.stringify(result)]){expect(serial).not.toContain(ssn);expect(serial).not.toContain(ssn.replace(/\D/g,''));}
  expect(download.includedForms).toContain('pa-40-filled.pdf');
  const scanned=await inspectPacket(download.contents,status);expect(scanned.pages).toBeGreaterThanOrEqual(4);expect(scanned.fields).toBe(0);expect(scanned.widgets).toBe(0);
  expect(scanned.text).toMatch(/review/i);expect(scanned.text).not.toContain(ssn);expect(scanned.text).not.toContain(ssn.replace(/\D/g,''));
  expect(state).toEqual(before);
 }}finally{renderer.mockRestore();}
});
it('complete PA workspace rejects missing source packet before actual rendering',async()=>{
 const renderer=vi.spyOn(rendering,'fillReturn');try{for(const status of ['resident','part_year','nonresident'] as const){const state=guidedPACompleteOriginals(status);delete state.sectionData['state-return']?.paOrdinaryReturnCompletionSources;await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/actual|complete|source|confirm/i);}expect(renderer).not.toHaveBeenCalled();}finally{renderer.mockRestore();}
});
it('complete PA workspace rejects stale original confirmation without refreshing it',async()=>{
 const state=guidedPACompleteOriginals();const facts=state.sectionData['state-return']?.paOrdinaryReturnFacts;if(!facts)throw Error('Actual facts missing');facts.originalFederalSources={};const before=structuredClone(state),renderer=vi.spyOn(rendering,'fillReturn');try{await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/original|source|confirm|current/i);expect(renderer).not.toHaveBeenCalled();expect(state).toEqual(before);}finally{renderer.mockRestore();}
});
it('complete PA workspace rejects edited federal originals before actual rendering',async()=>{
 const state=guidedPACompleteOriginals();const wage=state.sectionData['income-w2']?.entries[0];if(!wage)throw Error('Actual W2 missing');wage.wages='50000.01';const before=structuredClone(state),renderer=vi.spyOn(rendering,'fillReturn');try{await expect(buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state)).rejects.toThrow(/original|source|confirm|current/i);expect(renderer).not.toHaveBeenCalled();expect(state).toEqual(before);}finally{renderer.mockRestore();}
});
it('complete PA workspace retains year and unqualified2026 export gates',async()=>{
 const renderer=vi.spyOn(rendering,'fillReturn');try{const state=guidedPACompleteOriginals(),workspace=stateOriginalsReviewWorkspace();state.taxYear=2026;await expect(buildWorkspaceFilledReturnDownload(workspace,state)).rejects.toThrow(/year|agree/i);workspace.returnSummary.targetTaxYear=2026;await expect(buildWorkspaceFilledReturnDownload(workspace,state)).rejects.toThrow(/2026|qualif|available|support|gate/i);expect(renderer).not.toHaveBeenCalled();}finally{renderer.mockRestore();}
});
