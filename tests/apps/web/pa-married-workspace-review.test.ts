/** Spec: state/pa-married-workspace-review.yaml; actual current guided originals only. */
import React from 'react';
import {createRequire}from 'node:module';
import {expect,it,vi}from 'vitest';
import {execFileSync}from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {buildWorkspaceFilledReturnDownload}from '@/lib/workspace-filled-return';
import {createWorkspaceRecord}from '@/lib/workspace-storage';
import {buildGuidedStateOriginals}from '@/lib/guided-state-engine-inputs';
import {computeGuidedPreviewOutcome}from '@/lib/guided-preview-compute';
import {isSeparateStatePreview}from '@/lib/guided-interview-bridge';
import {calculateFederalTax}from '@/engine/federal';
import {calculatePAMarriedOrdinaryReturn}from '@/engine/state/pa-married-ordinary-return';
import {assessReturnReadiness}from '@/utils/return-readiness';
import {PAMarriedOrdinaryDetails}from '@/components/guided-interview/pa-married-ordinary-details';
import {PASeparateReturnPreview}from '@/components/pa-separate-return-preview';
import {mountGuidedPanel}from './guided-panel-dom';
import {guidedPAMarriedNativeFixture}from '../../fixtures/guided-pa-married-native';
vi.mock('server-only',()=>({}));
const cases=[
 {mode:'J',name:'whole',owners:[['joint','80000','2456','2456','0','0']]},
 {mode:'M',name:'whole',owners:[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]},
 {mode:'J',name:'cents',owners:[['joint','80001','2457','2456','0','1']]},
 {mode:'M',name:'cents',owners:[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]},
 {mode:'J',name:'shared-sp',owners:[['joint','13001','399','399','359','359']]},
 {mode:'M',name:'shared-sp',owners:[['primary','10000','307','307','276','276'],['spouse','3001','92','92','83','83']]},
]as const;
// Exact retained source cover lines pinned before pagination product/output; financial assertions remain separate.
const retainedCoverLines={
 "J-cents": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 7 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule D,",
  "and 1 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate shows a balance due of $5,170.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Joint Pennsylvania PA-40.",
  "•",
  "The owned joint Pennsylvania review uses the same actual federal household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "The return currently includes an estimated tax penalty of $208, but Form 2210 is not auto-attached to this draft",
  "packet.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ],
 "J-shared-sp": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 8 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule D,",
  "and 2 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate is effectively balanced with no refund or balance due.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Joint Pennsylvania PA-40, Joint Pennsylvania Schedule SP.",
  "•",
  "The owned joint Pennsylvania review uses the same actual federal household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ],
 "J-whole": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 7 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule D,",
  "and 1 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate shows a balance due of $5,170.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Joint Pennsylvania PA-40.",
  "•",
  "The owned joint Pennsylvania review uses the same actual federal household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "The return currently includes an estimated tax penalty of $208, but Form 2210 is not auto-attached to this draft",
  "packet.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ],
 "M-cents": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 8 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule D,",
  "and 2 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate shows a balance due of $5,170.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Primary Pennsylvania PA-40, Spouse Pennsylvania PA-40.",
  "•",
  "The two owned Pennsylvania returns keep each person’s tax, payments and requested refund separate. The",
  "federal return is one actual household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "The return currently includes an estimated tax penalty of $208, but Form 2210 is not auto-attached to this draft",
  "packet.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ],
 "M-shared-sp": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 10 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule",
  "D, and 4 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate is effectively balanced with no refund or balance due.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Primary Pennsylvania PA-40, Primary Pennsylvania Schedule SP, Spouse",
  "Pennsylvania PA-40, Spouse Pennsylvania Schedule SP.",
  "•",
  "The two owned Pennsylvania returns keep each person’s tax, payments and requested refund separate. The",
  "federal return is one actual household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ],
 "M-whole": [
  "EXPERIMENTAL TAX RETURN REFERENCE",
  "DO NOT SUBMIT AS-IS",
  "This packet is an experimental reference copy only. It may omit required filing forms, elections,",
  "adjustments, or supporting schedules.",
  "Review every page independently before relying on any value in this packet.",
  "SUMMARY OF THIS REVIEW PACKET",
  "The summary below is generated from structured return data and should be treated as a starting point for review,",
  "not a filing certification.",
  "What was compiled",
  "•",
  "Built from guided interview answers for tax year 2025.",
  "•",
  "This packet includes 8 filled forms: Form 1040, Schedule 1, Schedule 2, Schedule 3, Schedule C, Schedule D,",
  "and 2 more.",
  "•",
  "Documents reviewed for this workspace: 0; manual-review uploads still open: 0.",
  "•",
  "Current federal estimate shows a balance due of $5,170.",
  "•",
  "Social Security numbers are intentionally redacted from this PDF packet.",
  "•",
  "Owned Pennsylvania review pages: Primary Pennsylvania PA-40, Spouse Pennsylvania PA-40.",
  "•",
  "The two owned Pennsylvania returns keep each person’s tax, payments and requested refund separate. The",
  "federal return is one actual household.",
  "•",
  "Packet completeness status: partial.",
  "•",
  "Line calculation status: partial.",
  "•",
  "E-file and business-rule validation: not-validated.",
  "What may be missing or still needs review",
  "•",
  "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax",
  "advice.",
  "•",
  "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  "•",
  "Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page",
  "with its original source documents.",
  "•",
  "Checklist item still not ready: Upload tax documents.",
  "•",
  "Checklist item still not ready: Check document support.",
  "•",
  "Checklist item still not ready: Answer missing questions.",
  "•",
  "Checklist item still not ready: Review summary and completed return.",
  "•",
  "The return currently includes an estimated tax penalty of $208, but Form 2210 is not auto-attached to this draft",
  "packet.",
  "•",
  "Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual",
  "original sources. Filing and separate local returns remain unqualified.",
  "•",
  "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
  "•",
  "IRS MeF and state e-file business-rule validation have not been run for this packet yet."
 ]
}as const;
const strictReader=String.raw`
import sys,json,re
from pypdf import PdfReader
from pypdf._font import Font
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
r=PdfReader(sys.argv[1],strict=True);assert len(r.pages)>=2;assert not r.get_fields();assert '/AcroForm' not in r.trailer['/Root'];positions=json.loads(sys.argv[2]);seen=set();strings=[]
def walk(x):
 if isinstance(x,IndirectObject):
  key=(x.idnum,x.generation)
  if key in seen:return
  seen.add(key);v=x.get_object();assert v is not None,('unresolved',key);walk(v);return
 if isinstance(x,DictionaryObject):
  assert str(x.get('/Subtype',''))!='/Widget'
  for k,v in x.items():
   assert str(k) not in ['/JS','/JavaScript','/AA','/OpenAction'];walk(v)
  if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
 elif isinstance(x,(list,ArrayObject)):
  for v in x:walk(v)
 elif isinstance(x,str):strings.append(x)
walk(r.trailer)
for gen,entries in r.xref.items():
 if gen!=65535:
  for oid in entries:
   if oid:walk(IndirectObject(oid,gen,r))
for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
def mul(a,b):return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
texts=[p.extract_text() or '' for p in r.pages]
covers=[]
for pi,page in enumerate(r.pages):
 if 'EXPERIMENTAL TAX RETURN REFERENCE'not in texts[pi] or 'SUMMARY OF THIS REVIEW PACKET'not in texts[pi]:continue
 rows=[]
 def cover_text(text,cm,tm,font_dict,size):
  if not text.strip():return
  assert font_dict is not None,('missing actual cover font',pi)
  font=Font.from_font_resource(font_dict)
  actual=mul(tm,cm)
  assert abs(actual[1])<1e-8 and abs(actual[2])<1e-8 and actual[0]>0 and actual[3]>0,('unexpected cover transform',actual)
  for line in text.splitlines():
   if not line.strip():continue
   assert all(char in font.character_widths for char in line),('unknown actual glyph width',line)
   rows.append({'text':line.strip(),'x':actual[4],'y':actual[5],'right':actual[4]+font.text_width(line)*size*actual[0]/1000,'top':actual[5]+size*actual[3],'size':size,'font':font.name})
 page.extract_text(visitor_text=cover_text)
 covers.append({'page':pi,'width':float(page.mediabox.width),'height':float(page.mediabox.height),'rows':rows})
for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
alltext='\n'.join(texts+strings)
for token in ['900-70-0411','900700411','900-70-0412','900700412','91-0000411','910000411','91-0000412','910000412','Fictional native complete married household sources']:
 assert token not in alltext,('private',token)
values={name:'' for name in positions}
def bounds(box,m):
 x0,y0,x1,y1=map(float,box);pts=[(x*m[0]+y*m[2]+m[4],x*m[1]+y*m[3]+m[5])for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
 return min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)
for pi,page in enumerate(r.pages):
 def forms(content,resources,matrix,depth=0):
  assert depth<20;stack=[]
  for args,op in ContentStream(content,r).operations:
   if op==b'q':stack.append(matrix)
   elif op==b'Q':matrix=stack.pop()
   elif op==b'cm':matrix=mul(tuple(map(float,args)),matrix)
   elif op==b'Do':
    obj=resources['/XObject'][args[0]].get_object()
    if obj.get('/Subtype')!='/Form':continue
    actual=mul(tuple(map(float,obj.get('/Matrix',[1,0,0,1,0,0]))),matrix);left,bottom,right,top=bounds(obj['/BBox'],actual);matches=[]
    for name,pos in positions.items():
     x0,y0,x1,y1=pos['rect']
     if pos['page']==pi and left>=min(x0,x1)-.25 and right<=max(x0,x1)+.25 and bottom>=min(y0,y1)-.25 and top<=max(y0,y1)+.25:matches.append(name)
    if matches:
     text=re.sub(r'\s+','',''.join(page.extract_xform_text(obj)))
     if text:
      assert len(matches)==1,('ambiguous',matches);values[matches[0]]+=text
    else:forms(obj,obj.get('/Resources',resources),actual,depth+1)
 forms(page['/Contents'],page['/Resources'],(1,0,0,1,0,0))
print(json.dumps({'cells':values,'texts':texts,'objects':len(seen),'covers':covers}))
`;

const federalForms=[['f1040-filled.pdf',2],['f1040s1-filled.pdf',2],['f1040s2-filled.pdf',2],['f1040s3-filled.pdf',1],['f1040sc-filled.pdf',2],['f1040sd-filled.pdf',2]]as const;
function required<T>(value:T|null|undefined):T{if(value===undefined||value===null)throw Error('Actual fictional record required');return value;}
it.each(cases)('PA married workspace current original packets produce actual review $mode $name',async row=>{
 const f=guidedPAMarriedNativeFixture(row.mode,row.name),state=JSON.parse(JSON.stringify(f.state))as typeof f.state,before=JSON.stringify(state),workspace=createWorkspaceRecord('actual-married-'+row.mode+'-'+row.name);workspace.returnSummary.targetTaxYear=2025;
 const originals=buildGuidedStateOriginals(f.input,state),federal=calculateFederalTax(originals),married=calculatePAMarriedOrdinaryReturn(originals,originals.paMarriedOrdinarySources);expect(married.returns.map(v=>[v.accountHolder,v.pa40.compensation.toFixed(0),v.pa40.stateWithholding.toFixed(0),v.pa40.taxLiability.toFixed(0),v.scheduleSP.taxForgivenessCredit.toFixed(0),v.refundDisposition.refund.toFixed(0)])).toEqual(row.owners);
 const download=await buildWorkspaceFilledReturnDownload(workspace,state);expect(download.includedForms.filter(n=>!n.startsWith('pa-'))).toEqual(federalForms.map(([name])=>name));expect(download.includedForms.filter(n=>n==='f1040-filled.pdf')).toHaveLength(1);expect(download.includedForms.filter(n=>n.startsWith('pa-'))).toEqual(row.owners.flatMap(v=>['pa-'+v[0]+'-40-review.pdf',...(v[4]!=='0'?['pa-'+v[0]+'-sp-review.pdf']:[])]));expect(download.includedForms).not.toContain('pa-40-filled.pdf');
 const retained=process.env.TAX_ENGINE_PA_MARRIED_WORKSPACE_ARTIFACT_DIR,directory=retained??await mkdtemp(join(tmpdir(),'actual-married-workspace-'));await mkdir(directory,{recursive:true});
 try{const file=join(directory,row.mode+'-'+row.name+'.pdf');await writeFile(file,download.contents);const parsed=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictReader,file,'{}'],{encoding:'utf8'}))as{texts:string[];objects:number;covers:{page:number;width:number;height:number;rows:{text:string;x:number;y:number;right:number;top:number;size:number;font:string}[]}[]};const text=parsed.texts.join(' ');expect(parsed.objects).toBeGreaterThan(0);expect(text).toContain('Packet completeness status: partial.');expect(text).toContain('E-file and business-rule validation: not-validated.');expect(text).not.toContain('paper export remains unavailable');expect(text).not.toContain('no qualified separately owned PA40/SP');expect(text).toMatch(/local.*separate|separate.*local/i);
 // Check actual saved text geometry before page-count assertions, so old off-page content is a behavioral failure.
 for(const cover of parsed.covers){
  expect(cover.width).toBe(612);expect(cover.height).toBe(792);
  for(const line of cover.rows){
   expect(line.x,`actual visible left edge: ${line.text}`).toBeGreaterThanOrEqual(0);expect(line.right,`actual visible right edge: ${line.text}`).toBeLessThanOrEqual(612);expect(line.top,`actual visible top edge: ${line.text}`).toBeLessThanOrEqual(792);
   if(line.text==='FOR REVIEW ONLY - NOT FOR FILING'){expect(line.y).toBeGreaterThanOrEqual(0);continue;}
   expect(line.x,`retained body origin margin: ${line.text}`).toBeGreaterThanOrEqual(42);expect(line.y,`actual visible body baseline: ${line.text}`).toBeGreaterThanOrEqual(42);
   expect(['Helvetica','Helvetica-Bold']).toContain(line.font);expect([10.5,13,15,18,20]).toContain(line.size);
  }
 }
 expect(parsed.covers).toHaveLength(2);expect(parsed.covers.map(cover=>cover.page)).toEqual([0,1]);
 for(const [index,cover]of parsed.covers.entries()){
  const lines=cover.rows.map(line=>line.text);expect(lines.filter(line=>line==='EXPERIMENTAL TAX RETURN REFERENCE')).toHaveLength(1);expect(lines.filter(line=>line==='DO NOT SUBMIT AS-IS')).toHaveLength(1);expect(lines.filter(line=>line==='FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(1);
  expect(lines).toContain(index===0?'SUMMARY OF THIS REVIEW PACKET':'SUMMARY OF THIS REVIEW PACKET (CONTINUED)');
  for(const sourceLine of retainedCoverLines[`${row.mode}-${row.name}`].slice(0,8)){if(sourceLine!=='SUMMARY OF THIS REVIEW PACKET')expect(lines).toContain(sourceLine);}
  expect(lines).toContain(index===0?'What was compiled':'What may be missing or still needs review');
  const retainedBody=new Set<string>(retainedCoverLines[`${row.mode}-${row.name}`].slice(10).filter(line=>line!=='What may be missing or still needs review'));
  for(const line of cover.rows){if(retainedBody.has(line.text))expect(line.size).toBe(10.5);if(line.text==='What was compiled'||line.text==='What may be missing or still needs review')expect(line.size).toBe(13);}
 }
 const coverText=parsed.covers.flatMap(cover=>cover.rows.map(line=>line.text)).join(' ');let retainedCursor=0;
 for(const line of retainedCoverLines[`${row.mode}-${row.name}`]){const found=coverText.indexOf(line,retainedCursor);expect(found,`complete retained disclosure in source order: ${line}`).toBeGreaterThanOrEqual(retainedCursor);retainedCursor=found+line.length;}
 expect(parsed.texts).toHaveLength(2+federalForms.reduce((n,[,pages])=>n+pages,0)+row.owners.reduce((n,v)=>n+2+(v[4]!=='0'?2:0),0));for(const owner of row.owners)expect(text.replace(/\s+/g,' ')).toContain(owner[0]==='joint'?'Joint Pennsylvania PA-40':owner[0]==='primary'?'Primary Pennsylvania PA-40':'Spouse Pennsylvania PA-40');if(row.mode==='J'&&row.name==='cents')expect(text).toContain('PA does not issue refunds of $1 or less');
 expect(calculateFederalTax(originals).totalTax.toFixed()).toBe(federal.totalTax.toFixed());expect(JSON.stringify(state)).toBe(before);
 }finally{if(!retained)await rm(directory,{recursive:true,force:true});}
});
it.each(['missing','unknown','choice','equal-money-employer','conflicting-single','generic-cash','workspace-year']as const)('PA married workspace missing or stale sources deny without refresh %s',async kind=>{
 const f=guidedPAMarriedNativeFixture('M','whole'),data=required(f.state.sectionData['state-return']),workspace=createWorkspaceRecord('actual-married-gap-'+kind);workspace.returnSummary.targetTaxYear=2025;
 if(kind==='missing')delete data.paMarriedOrdinarySources;if(kind==='unknown')f.sources.sourceFactsConfirmed=null;if(kind==='choice')f.sources.filingMode='';if(kind==='equal-money-employer')required(required(f.state.sectionData['income-w2']).entries[0]).employerName+=' actual new original';if(kind==='conflicting-single')Object.assign(data,{paOrdinaryReturnCompletionSources:{sourceReference:'Retained actual conflicting source'}});if(kind==='generic-cash')data.additionalStateWithholding='1';if(kind==='workspace-year')workspace.returnSummary.targetTaxYear=2026;
 const before=JSON.stringify(f.state);let error:unknown;try{await buildWorkspaceFilledReturnDownload(workspace,f.state);}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(TypeError);expect(String(error)).toMatch(/source|original|packet|year|Pennsylvania|married|complete|confirm|withholding/i);expect(JSON.stringify(f.state)).toBe(before);
});
function temporaryDOM(){
 const jsdomModule=createRequire(import.meta.url)('jsdom')as{JSDOM:new(html:string,options:{url:string})=>{window:Window&{close:()=>void}}};
 const browser=new jsdomModule.JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'}),keys=['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLDetailsElement','Event','MouseEvent','Node','DOMException'];
 const before=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?browser.window:Reflect.get(browser.window,key)});
 return()=>{browser.window.close();for(const key of keys){const descriptor=before.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}};
}
it('PA married review disclosure follows actual supported route and keeps filing closed',async()=>{
 const restoreDOM=temporaryDOM();try{
 const f=guidedPAMarriedNativeFixture('M','shared-sp'),state=required(computeGuidedPreviewOutcome(f.state).metrics?.state);if(!isSeparateStatePreview(state))throw Error('Actual current separate PA metrics required');const dom=await mountGuidedPanel(React.createElement(PASeparateReturnPreview,{metrics:state}));
 try{expect(dom.container.textContent).not.toContain('Paper export still needs');expect(dom.container.textContent).toContain('Supported PA40 and Schedule SP review pages require current source validation. Filing and separate local returns remain unqualified.');expect(dom.container.textContent).toContain('$276');expect(dom.container.textContent).toContain('$83');}finally{await dom.dispose();}
 const native=await mountGuidedPanel(React.createElement(PAMarriedOrdinaryDetails,{originalInput:f.input,data:f.sources,onChange:()=>{}}));try{await native.click('Confirm actual married PA household sources after the last edit');expect(native.container.querySelector('[role="status"]')?.textContent).toBe('Actual married household sources confirmed for review. Supported PA40 and Schedule SP review pages require current source validation. Filing and separate local returns remain unqualified.');}finally{await native.dispose();}
 const original=buildGuidedStateOriginals(f.input,f.state),federal=calculateFederalTax(original),result={...federal,stateReturns:{pennsylvania:calculatePAMarriedOrdinaryReturn(original,original.paMarriedOrdinarySources)}},assessment=assessReturnReadiness({taxInput:original,federalResult:result,includedForms:['f1040-filled.pdf','pa-primary-40-review.pdf','pa-primary-sp-review.pdf','pa-spouse-40-review.pdf','pa-spouse-sp-review.pdf'],stateCode:'PA'});expect(assessment.packetCompleteness).toBe('partial');expect(assessment.lineCompleteness).toBe('partial');expect(assessment.filingQualified).toBe(false);expect(assessment.businessRuleValidation).toBe('not-validated');expect(assessment.findings.join(' ')).not.toContain('paper export remains unavailable');
 }finally{restoreDOM();}
});
