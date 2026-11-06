/** Spec: state/pa-married-native-browser.yaml. Independent saved-byte reader, not application calculation. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect} from '@playwright/test';

export const PA_MARRIED_REVIEW_FEDERAL_FILES = [
  'f1040-filled.pdf','f1040s1-filled.pdf','f1040s2-filled.pdf',
  'f1040s3-filled.pdf','f1040sc-filled.pdf','f1040sd-filled.pdf',
] as const;
export function marriedReviewFiles(mode:'J'|'M'):string[] {
  return [...PA_MARRIED_REVIEW_FEDERAL_FILES,...(mode==='J'
    ?['pa-joint-40-review.pdf']:['pa-primary-40-review.pdf','pa-spouse-40-review.pdf'])];
}

// Printed rectangles were independently pinned from the official PA40 source before browser output.
// Names in the source are misleading for some lines; these keys are the actual printed numbers.
const printed = {
  first:{page:0,rect:[68.5693,584.801,299.857,603.206]},
  spouse:{page:0,rect:[68.5693,552.513,300.471,570.917]},
  primarySSN:{page:0,rect:[69.8678,658.034,208.518,676.439]},
  spouseSSN:{page:0,rect:[228.177,659.034,367.44,677.439]},
  '1a':{page:0,rect:[420.923,360.584,555.391,378.375]},
  '1c':{page:0,rect:[420.543,318.125,555.391,335.917]},
  '2':{page:0,rect:[420.543,296.506,555.391,314.591]},
  '9':{page:0,rect:[420.164,144.901,555.391,162.693]},
  '11':{page:0,rect:[420.77,101.964,555.998,120.369]},
  '12':{page:1,rect:[420.692,686.45,556.888,705.467]},
  '13':{page:1,rect:[420.692,664.729,556.888,683.748]},
  '16':{page:1,rect:[420.692,599.864,556.888,618.882]},
  '24':{page:1,rect:[420.692,425.522,556.888,444.54]},
  '25':{page:1,rect:[420.692,403.669,556.888,422.688]},
  '27':{page:1,rect:[420.692,362.23,556.888,381.248]},
  '29':{page:1,rect:[420.692,317.309,556.888,336.327]},
  '30':{page:1,rect:[420.692,295.645,556.888,314.663]},
  '31':{page:1,rect:[420.692,274.364,556.888,293.383]},
} as const;
const statuses = {
  resident:{page:0,rect:[427.233,641.04,442.57,649.629]},
  partYear:{page:0,rect:[427.233,629.508,442.57,638.097]},
  nonresident:{page:0,rect:[427.233,619.078,442.57,627.667]},
  single:{page:0,rect:[427.233,582.882,442.57,591.471]},
  joint:{page:0,rect:[427.233,571.839,442.57,580.428]},
  separate:{page:0,rect:[427.233,560.719,442.57,569.308]},
  deceased:{page:0,rect:[427.233,550.112,442.57,558.7]},
} as const;
const templateHashes = {
  'pa-40.pdf':'fcd7648601f3ce5a7a258be49c54aa1c604e1c61c1fe9175351451ac6087d8b3',
  'f1040.pdf':'3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982',
  'f1040s1.pdf':'8dafec719f6a4716c259a2bdaca546d9bb9e262d1eabef885fe116a7327458fa',
  'f1040s2.pdf':'64d867b683334cfc533993e37ccb0d143449ec29428a78206be2e4de333941e8',
  'f1040s3.pdf':'008cfd3fe3ebd0860452069b90fd0a3d53dda6dd8a5d870278370aa899a63f82',
  'f1040sc.pdf':'ddf401dbe060467d39f90ad2abf645df1de31512821a150dc68a3882bbf19716',
  'f1040sd.pdf':'90564c8b7e49280363612639b804d113ebedb516c2e87c70649f29c844da1d2e',
} as const;
// Full retained approved cover lines, removing only four source-proven absent not-ready bullets.
const nativeCoverLines = {
  "J": [
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
    "Documents reviewed for this workspace: 1; manual-review uploads still open: 0.",
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
  "M": [
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
    "Documents reviewed for this workspace: 1; manual-review uploads still open: 0.",
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
} as const;
const readSaved = String.raw`
import sys,json,re,hashlib
from pathlib import Path
from pypdf import PdfReader,__version__
from pypdf._font import Font
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
assert __version__=='6.10.0',('reader version',__version__)
path=Path(sys.argv[1]);opt=json.loads(sys.argv[2]);blank=Path(opt['blank'])
for name,wanted in opt['hashes'].items():assert hashlib.sha256((blank/name).read_bytes()).hexdigest()==wanted,('template changed',name)
r=PdfReader(path,strict=True);assert not r.get_fields();assert '/AcroForm' not in r.trailer['/Root'];seen=set();strings=[]
def walk(x):
 if isinstance(x,IndirectObject):
  key=(x.idnum,x.generation)
  if key in seen:return
  seen.add(key);v=x.get_object();assert v is not None,('unresolved',key);walk(v);return
 if isinstance(x,DictionaryObject):
  assert str(x.get('/Subtype',''))!='/Widget'
  assert '/AcroForm' not in x
  assert str(x.get('/S','')) not in ['/JavaScript','/Launch','/SubmitForm','/ImportData','/GoToR','/URI']
  for k,v in x.items():assert str(k) not in ['/JS','/JavaScript','/AA','/OpenAction','/A'];walk(v)
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
texts=[p.extract_text() or '' for p in r.pages];notice='FOR REVIEW ONLY - NOT FOR FILING'
for t in texts:assert t.count(notice)==1,('review marker',t.count(notice))
alltext='\n'.join(texts+strings)
for token in opt['private']:
 assert token not in alltext,('private source token present',hashlib.sha256(token.encode()).hexdigest())
# This is the one fitting native cover, not the empty-workspace two-cover fixture.
assert sum('SUMMARY OF THIS REVIEW PACKET' in t for t in texts)==1
assert 'SUMMARY OF THIS REVIEW PACKET' in texts[0];assert 'CONTINUED' not in texts[0]
rows=[]
def mul(a,b):return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
def cover_text(text,cm,tm,font_dict,size):
 if not text.strip():return
 assert font_dict is not None
 font=Font.from_font_resource(font_dict);actual=mul(tm,cm)
 assert abs(actual[1])<1e-8 and abs(actual[2])<1e-8 and actual[0]>0 and actual[3]>0
 for line in text.splitlines():
  if not line.strip():continue
  assert all(char in font.character_widths for char in line),('unknown actual glyph width',line)
  x=actual[4];y=actual[5];right=x+font.text_width(line)*size*actual[0]/1000;top=y+size*actual[3]
  assert x>=0 and right<=612 and top<=792,('cover glyph bounds',line,x,y,right,top)
  if line.strip()==notice:assert y>=0
  else:
   assert x>=42 and y>=42,('cover body margin',line,x,y)
   assert font.name in ['Helvetica','Helvetica-Bold'];assert size in [10.5,13,15,18,20]
  rows.append({'text':line.strip(),'x':x,'y':y,'right':right,'top':top,'size':size,'font':font.name})
assert list(map(float,r.pages[0].mediabox))==[0,0,612,792]
r.pages[0].extract_text(visitor_text=cover_text)
# Pin the original on-state AP bytes by physical rectangle, not misleading field names.
source=PdfReader(blank/'pa-40.pdf',strict=True);source_states={}
for pi,page in enumerate(source.pages):
 for ref in page.get('/Annots',[]):
  widget=ref.get_object();rect=list(map(float,widget.get('/Rect',[])))
  for name,pos in opt['statuses'].items():
   if pi==pos['page'] and len(rect)==4 and all(abs(a-b)<.025 for a,b in zip(rect,pos['rect'])):
    normal=widget.get('/AP',{}).get('/N',{}).get_object()
    entries=[st.get_object().get_data()for key,st in normal.items()if str(key)!='/Off']
    assert len(entries)==1 and entries[0];source_states[name]=hashlib.sha256(entries[0]).hexdigest()
assert set(source_states)==set(opt['statuses'])
def bounds(box,m):
 x0,y0,x1,y1=map(float,box);pts=[(x*m[0]+y*m[2]+m[4],x*m[1]+y*m[3]+m[5])for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
 return min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)
def inside(a,b):return a[0]>=b[0]-.25 and a[1]>=b[1]-.25 and a[2]<=b[2]+.25 and a[3]<=b[3]+.25
owners=[]
for oi,owner in enumerate(opt['owners']):
 first=12+2*oi;values={name:''for name in opt['printed']};selected={name:0 for name in opt['statuses']};counts={name:0 for name in opt['printed']}
 for pi in [0,1]:
  page=r.pages[first+pi]
  def forms(content,resources,matrix,depth=0):
   assert depth<20,('excessive form nesting',depth);stack=[]
   for args,op in ContentStream(content,r).operations:
    if op==b'q':stack.append(matrix)
    elif op==b'Q':assert stack;matrix=stack.pop()
    elif op==b'cm':matrix=mul(tuple(map(float,args)),matrix)
    elif op==b'Do':
     obj=resources['/XObject'][args[0]].get_object()
     if obj.get('/Subtype')!='/Form':continue
     actual=mul(tuple(map(float,obj.get('/Matrix',[1,0,0,1,0,0]))),matrix);box=bounds(obj['/BBox'],actual)
     found=[name for name,pos in opt['printed'].items()if pos['page']==pi and inside(box,pos['rect'])]
     if found:
      assert len(found)==1,('ambiguous printed cell',found);name=found[0];text=re.sub(r'\s+','',''.join(page.extract_xform_text(obj)))
      if text:counts[name]+=1;assert counts[name]==1,('duplicate printed appearance',name);values[name]=text
     for name,pos in opt['statuses'].items():
      if pos['page']==pi and inside(box,pos['rect']) and hashlib.sha256(obj.get_data()).hexdigest()==source_states[name]:selected[name]+=1
     if not found:forms(obj,obj.get('/Resources',resources),actual,depth+1)
   assert not stack,('unbalanced form graphics state',depth)
  forms(page['/Contents'],page['/Resources'],(1,0,0,1,0,0))
 for line in ['1a','1c','9','11']:assert values[line]==owner['wages'],('owner wages',owner['owner'],line,values[line])
 for line in ['12','13','24']:assert values[line]==owner['tax'],('owner tax/payments',owner['owner'],line,values[line])
 assert values['16'] in ['','0'],('explicitly no extension payment',owner['owner'],values['16'])
 for line in ['25','29','30','31']:assert values[line]=='0',('actual cash',owner['owner'],line,values[line])
 assert values['27']=='';assert values['2'] in ['','0'];assert values['primarySSN']==values['spouseSSN']==''
 assert values['first']==('ROBIN' if owner['owner']=='spouse' else 'TAYLOR')
 assert values['spouse']==('TAYLOR' if owner['owner']=='spouse' else 'ROBIN')
 for name,count in selected.items():assert count==(1 if name in ['resident','joint' if opt['mode']=='J' else 'separate'] else 0),('actual selected status',owner['owner'],name,count)
 owners.append({'owner':owner['owner'],'cells':values,'selected':selected})
assert len(r.pages)==(14 if opt['mode']=='J' else 16),('source-derived page count',len(r.pages))
# One household federal sequence; PA pages start at index12 after cover+eleven federal pages.
for start,title in [(1,'U.S. Individual Income Tax Return'),(3,'Additional Income and Adjustments to Income'),(5,'Additional Taxes'),(7,'Additional Credits and Payments'),(8,'Profit or Loss From Business'),(10,'Capital Gains and Losses')]:
 assert title in re.sub(r'\s+',' ',texts[start]),('federal form sequence',start,title)
for oi in range(len(owners)):
 assert 'PA-40' in texts[12+2*oi];assert 'PA-40' in texts[13+2*oi]
cover=re.sub(r'\s+',' ',texts[0])
for required in ['EXPERIMENTAL TAX RETURN REFERENCE','DO NOT SUBMIT AS-IS','This packet is an experimental reference copy only. It may omit required filing forms, elections, adjustments, or supporting schedules.','Review every page independently before relying on any value in this packet.','The summary below is generated from structured return data and should be treated as a starting point for review, not a filing certification.','Documents reviewed for this workspace: 1; manual-review uploads still open: 0.','Packet completeness status: partial.','Line calculation status: partial.','E-file and business-rule validation: not-validated.','Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page with its original source documents.','Married Pennsylvania owned PA40 and Schedule SP review coverage must be verified against the actual original sources. Filing and separate local returns remain unqualified.','IRS MeF and state e-file business-rule validation have not been run for this packet yet.']:
 assert required in cover,('complete actual disclosure',required)
cursor=0
for source_line in opt['coverLines']:
 found=cover.find(source_line,cursor);assert found>=cursor,('full disclosure source order',source_line);cursor=found+len(source_line)
assert 'Checklist item still not ready:'not in cover
for owner in opt['owners']:
 label={'joint':'Joint','primary':'Primary','spouse':'Spouse'}[owner['owner']]+' Pennsylvania PA-40'
 assert label in cover,('actual included owned label',label)
print(json.dumps({'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':len(r.pages),'objects':len(seen),'coverRows':rows,'owners':owners,'allObjectPrivacy':True,'oneReviewNoticeEveryPage':True,'sourceTemplatesVerified':list(opt['hashes'])}))
`;
export async function inspectMarriedReviewDownload(file:string,mode:'J'|'M',privateValues:readonly string[]) {
  // Normal browser runner cwd is apps/web. Explicit env override uses committed templates only.
  const blank=process.env.TAX_ENGINE_PDF_TEST_BLANK_DIR??resolve(process.cwd(),'../../forms/blank/2025');
  const owners=mode==='J'?[{owner:'joint',wages:'80000',tax:'2456'}]
    :[{owner:'primary',wages:'50000',tax:'1535'},{owner:'spouse',wages:'30000',tax:'921'}];
  const options={mode,blank,printed,statuses,hashes:templateHashes,owners,coverLines:nativeCoverLines[mode],private:[...privateValues]};
  const result=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',
    ['-c',readSaved,file,JSON.stringify(options)],{encoding:'utf8',maxBuffer:8*1024*1024})) as {
      sha256:string;pages:number;objects:number;allObjectPrivacy:boolean;oneReviewNoticeEveryPage:boolean;
      coverRows:Array<{text:string;x:number;y:number;right:number;top:number;size:number;font:string}>;
      owners:Array<{owner:string;cells:Record<string,string>;selected:Record<string,number>}>;
    };
  expect(result.sha256).toBe(createHash('sha256').update(await readFile(file)).digest('hex'));
  expect(result.objects).toBeGreaterThan(0);expect(result.pages).toBe(mode==='J'?14:16);
  expect(result.allObjectPrivacy).toBe(true);expect(result.oneReviewNoticeEveryPage).toBe(true);
  return result;
}
