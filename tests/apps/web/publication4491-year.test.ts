import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { officialSampleDocumentFixtures } from '@tax-engine/contracts';
import registry from '../../../sample-documents/registry.json';
import { detectUploadedDocumentFromFile, parseUploadedDocumentText, prepareUploadableFiles } from '../../../apps/web/src/lib/uploaded-document-detection';
import { getFutureYearSampleUploadMessage, getWorkspace, ingestFiles, WORKSPACE_STORAGE_KEY } from '../../../apps/web/src/lib/workspace-storage';
// Actual official cover metadata verified2026-11-15; fixtures contain no taxpayer facts.
const evidence = [
 {name:'guide2025',coverText:'4491\nVITA/TCE Training Guide\n2025 RETURNS\nPublication 4491 (Rev. 10-2025)'},
 {name:'guide2026',coverText:'4491\nVITA/TCE Training Guide\n2026 RETURNS\nPublication 4491 (Rev. 10-2026)'},
 {name:'supplement2025',coverText:'4491-X\nVITA/TCE Training Supplement\n2025 RETURNS\nPublication 4491-X (Rev. 1-2026)'},
];
async function coverFile(text:string) {
 const pdf=await PDFDocument.create();const page=pdf.addPage();const font=await pdf.embedFont(StandardFonts.Helvetica);
 text.split('\n').forEach((line,index)=>page.drawText(line,{x:50,y:750-index*20,size:12,font}));
 return new File([new Uint8Array(await pdf.save())],'irs-publication-4491-2025.pdf',{type:'application/pdf'});
}
function storage() { const values=new Map<string,string>(); return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear(),key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}}; }
describe('Publication4491 documentary return year — spec Official-Training-Publication-Year',()=>{
 it('catalog keeps fifteen historical sample IDs and separates revision from return year',()=>{
  expect(registry).toHaveLength(15);
  const guide=registry.find(row=>row.id==='irs-publication-4491-2025');if(!guide)throw Error('missing guide fixture');
  expect(guide.downloadUrl).toBe('https://www.irs.gov/pub/irs-access/p4491_accessible.pdf');
  for(const id of ['irs-publication-4491-2025','irs-publication-4491x-2026']) {
   const row=officialSampleDocumentFixtures.find(row=>row.id===id);if(!row)throw Error('missing historical fixture');
   expect(row.taxYearHint).toBe(2025);expect(row.aliases).toContain(id);
   for(const alias of ['p4491','p4491x','p4491_accessible'])expect(row.aliases).not.toContain(alias);
  }
 });
 it('actual official covers and conflicting or missing cover years remain documentary only',()=>{
  for(const row of evidence) {
   const result=parseUploadedDocumentText(row.coverText,'misleading-2024.pdf');
   expect(result).toMatchObject({kind:'training-scenario',coverage:'planned',taxYear:row.name==='guide2026'?2026:2025,seededFactIds:[],detectedFacts:[]});
  }
  const supplement=evidence.find(row=>row.name==='supplement2025');if(!supplement)throw Error('missing supplement fixture');const cover=supplement.coverText;
  for(const text of [cover.replace('2025 RETURNS',''),cover+'\n2026 RETURNS'])expect(parseUploadedDocumentText(text)?.taxYear).toBeNull();
  expect(parseUploadedDocumentText('Revision 1-2026\n2025 RETURNS','p4491x.pdf')).toBeNull();
  expect(parseUploadedDocumentText(cover+'\n2026 Form W-2 Federal income tax withheld Wages, tips, other comp.')).toMatchObject({kind:'training-scenario',taxYear:2025,detectedFacts:[]});
 });
 it('real PDF uploads propagate cover metadata without filename promotion or facts',async()=>{
  for(const row of evidence) {
   const file=await coverFile(row.coverText);
   const parsed=await detectUploadedDocumentFromFile(file);
   const year=row.name==='guide2026'?2026:2025;
   expect(parsed).toMatchObject({kind:'training-scenario',taxYear:year,detectedFacts:[],seededFactIds:[]});
   const files=await prepareUploadableFiles([file]);const st=storage();const workspace=ingestFiles(st,'actual-cover',files);
   expect(workspace.documents[0].taxYear).toBe(year);expect(workspace.seededReturn.taxYearHints).toEqual([year]);
   expect(workspace.seededReturn.facts).toEqual([]);expect(workspace.returnSummary.status).not.toBe('ready-to-recompute');expect(workspace.enginePreview).toBeNull();
   expect(Boolean(getFutureYearSampleUploadMessage(files))).toBe(year===2026);
  }
  for(const name of ['p4491.pdf','p4491x.pdf','p4491_accessible.pdf']){
   const w=ingestFiles(storage(),'generic',[{name,size:1}]);expect(w.documents[0].taxYear).toBeNull();expect(w.seededReturn.taxYearHints).toEqual([]);
  }
  const renamedGuide=ingestFiles(storage(),'misnamed-form',[{name:'irs-w2-2025.pdf',size:1,detectedDocument:parseUploadedDocumentText(evidence[1].coverText)}]);
  expect(renamedGuide.documents[0]).toMatchObject({kind:'training-scenario',taxYear:2026,matchedFixtureId:null,seededFactIds:[],detectedFacts:[]});
  expect(renamedGuide.seededReturn.facts).toEqual([]);
  const unknown=ingestFiles(storage(),'conflict',[{name:'irs-publication-4491-2025.pdf',size:1,detectedDocument:parseUploadedDocumentText(evidence[0].coverText+'\n2026 RETURNS')}]);expect(unknown.documents[0].taxYear).toBeNull();
 });
 it('reload preserves explicit historical document and workspace years',()=>{
  const st=storage();const w=ingestFiles(st,'history',[{name:'irs-publication-4491x-2026.pdf',size:1}]);
  const stored=st.getItem(WORKSPACE_STORAGE_KEY);if(!stored)throw Error('missing stored workspace');const raw=JSON.parse(stored);raw.workspaces[w.id].documents[0].taxYear=2026;raw.workspaces[w.id].returnSummary.targetTaxYear=2026;st.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(raw));
  const reopened=getWorkspace(st,w.id);if(!reopened)throw Error('missing restored workspace');expect(reopened.documents[0].taxYear).toBe(2026);expect(reopened.returnSummary.targetTaxYear).toBe(2026);expect(reopened.returnSummary.status).not.toBe('ready-to-recompute');
 });
});
