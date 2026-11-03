import {fictionalEmptyEicHistory} from '../fixtures/eic-disallowance.js';
/** Spec: state/pa-married-official-independent.yaml. Sources/oracles predate products. */
import {expect,it,vi} from 'vitest';
import {PDFForm,PDFTextField,PDFDict,PDFStream} from 'pdf-lib';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {preparePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {fillPAMarriedOfficialReview} from '@/pdf/mappings/2025/fill-pa-married-official-review.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedOfficialFixture} from '../fixtures/pa-married-official-review.js';
type Kind='pa40'|'sp';type Geometry={page:number;rect:number[]};
const geometry:Record<Kind,Record<string,Geometry>>={"pa40":{"1a":{"page":0,"rect":[420.923,360.584,555.391,378.375]},"1b":{"page":0,"rect":[420.923,339.598,555.391,357.389]},"1c":{"page":0,"rect":[420.543,318.125,555.391,335.917]},"2":{"page":0,"rect":[420.543,296.506,555.391,314.591]},"3":{"page":0,"rect":[420.493,274.461,554.961,291.959]},"4":{"page":0,"rect":[420.923,253.561,555.391,270.739]},"5":{"page":0,"rect":[420.924,231.37,555.391,249.775]},"6":{"page":0,"rect":[420.923,209.75,555.391,226.928]},"7":{"page":0,"rect":[420.923,188.531,555.391,206.935]},"8":{"page":0,"rect":[420.543,166.806,555.391,183.984]},"9":{"page":0,"rect":[420.164,144.901,555.391,162.693]},"10":{"page":0,"rect":[420.164,123.101,555.391,140.892]},"11":{"page":0,"rect":[420.77,101.964,555.998,120.369]},"12":{"page":1,"rect":[420.692,686.45,556.888,705.467]},"13":{"page":1,"rect":[420.692,664.729,556.888,683.748]},"14":{"page":1,"rect":[420.262,642.955,556.458,661.973]},"15":{"page":1,"rect":[420.692,621.484,556.888,640.502]},"16":{"page":1,"rect":[420.692,599.864,556.888,618.882]},"17":{"page":1,"rect":[420.692,578.012,556.888,597.031]},"18":{"page":1,"rect":[420.692,557.153,556.888,576.171]},"19b":{"page":1,"rect":[526.702,535.108,557.969,553.593]},"20":{"page":1,"rect":[301.387,513.438,436.596,531.883]},"21":{"page":1,"rect":[420.692,490.886,556.888,509.904]},"22":{"page":1,"rect":[420.692,469.764,556.888,488.783]},"23":{"page":1,"rect":[420.692,446.508,556.888,465.526]},"24":{"page":1,"rect":[420.692,425.522,556.888,444.54]},"25":{"page":1,"rect":[420.692,403.669,556.888,422.688]},"26":{"page":1,"rect":[421.105,382.32,557.301,401.339]},"27":{"page":1,"rect":[420.692,362.23,556.888,381.248]},"28":{"page":1,"rect":[421.175,340.371,557.371,358.776]},"29":{"page":1,"rect":[420.692,317.309,556.888,336.327]},"30":{"page":1,"rect":[420.692,295.645,556.888,314.663]},"31":{"page":1,"rect":[420.692,274.364,556.888,293.383]}},"sp":{"A1":{"page":1,"rect":[69.6653,588.694,145.275,600.28]},"A2":{"page":1,"rect":[69.6653,578.307,145.275,589.893]},"A3":{"page":1,"rect":[69.6653,566.962,145.275,578.548]},"A4":{"page":1,"rect":[69.6653,555.987,145.275,567.573]},"A5":{"page":1,"rect":[69.6653,545.401,145.275,556.987]},"A6":{"page":1,"rect":[69.6653,534.644,145.275,546.23]},"A7":{"page":1,"rect":[69.6653,524.059,145.275,535.645]},"A8":{"page":1,"rect":[69.6653,513.693,145.275,525.279]},"A9":{"page":1,"rect":[69.6653,502.718,145.275,514.304]},"A10":{"page":1,"rect":[69.6653,491.742,145.275,503.328]},"B1":{"page":1,"rect":[393.953,589.128,468.953,600.714]},"B2":{"page":1,"rect":[393.953,577.762,468.953,589.348]},"B3":{"page":1,"rect":[393.953,567.396,468.953,578.982]},"B4":{"page":1,"rect":[393.953,556.421,468.953,568.007]},"B5":{"page":1,"rect":[393.953,545.835,468.953,557.421]},"B6":{"page":1,"rect":[393.953,535.078,468.953,546.664]},"B7":{"page":1,"rect":[393.953,524.493,468.953,536.079]},"B8":{"page":1,"rect":[393.953,514.127,468.953,525.713]},"B9":{"page":1,"rect":[393.953,503.152,468.953,514.738]},"B10":{"page":1,"rect":[393.953,492.176,468.953,503.762]},"C1":{"page":1,"rect":[480.149,589.128,555.76,600.714]},"C2":{"page":1,"rect":[480.149,577.762,555.76,589.348]},"C3":{"page":1,"rect":[480.149,567.396,555.76,578.982]},"C4":{"page":1,"rect":[480.149,556.421,555.76,568.007]},"C5":{"page":1,"rect":[480.149,545.835,555.76,557.421]},"C6":{"page":1,"rect":[480.149,535.078,555.76,546.664]},"C7":{"page":1,"rect":[480.149,524.493,555.76,536.079]},"C8":{"page":1,"rect":[480.149,514.127,555.76,525.713]},"C9":{"page":1,"rect":[480.149,503.152,555.76,514.738]},"C10":{"page":1,"rect":[480.759,492.176,555.76,503.762]},"A11":{"page":1,"rect":[69.6653,480.738,145.275,493.821]},"BC11":{"page":1,"rect":[474.052,470.943,555.76,482.529]},"J12":{"page":1,"rect":[67.3973,431.939,143.008,443.525]},"J13":{"page":1,"rect":[67.3973,421.194,143.008,432.779]},"J14":{"page":1,"rect":[67.3973,410.119,143.008,421.705]},"J15":{"page":1,"rect":[94.1565,395.925,131.962,407.511]},"J16":{"page":1,"rect":[67.3973,378.211,143.008,389.797]},"M12":{"page":1,"rect":[471.785,431.939,553.492,443.525]},"M13":{"page":1,"rect":[471.785,421.194,553.492,432.779]},"M14":{"page":1,"rect":[471.785,410.609,553.492,422.195]},"M15":{"page":1,"rect":[506.049,393.486,543.855,407.511]},"M16":{"page":1,"rect":[471.785,378.211,553.492,389.797]}}};
const statusGeometry:Record<string,Geometry>={"forgiveness/1":{"page":1,"rect":[143.769,533.645,161.56,545.303]},"forgiveness/2":{"page":1,"rect":[238.243,533.645,256.034,545.303]},"forgiveness/3":{"page":1,"rect":[312.169,533.646,329.96,545.303]},"filing/1":{"page":0,"rect":[427.233,582.882,442.57,591.471]},"filing/2":{"page":0,"rect":[427.233,571.839,442.57,580.428]},"filing/3":{"page":0,"rect":[427.233,560.719,442.57,569.308]},"filing/4":{"page":0,"rect":[427.233,550.112,442.57,558.7]},"residency/1":{"page":0,"rect":[427.233,641.04,442.57,649.629]},"residency/2":{"page":0,"rect":[427.233,629.508,442.57,638.097]},"residency/3":{"page":0,"rect":[427.233,619.078,442.57,627.667]},"sp-broadMarried":{"page":0,"rect":[62.823,479.898,80.5062,493.922]},"sp-J3a":{"page":0,"rect":[82.692,469.458,96.1066,481.044]},"sp-M3b":{"page":0,"rect":[82.692,458.298,96.1066,470.492]},"sp-Mcertification":{"page":0,"rect":[238.32,459.462,253.564,471.048]}};

const readSaved=String.raw`
import sys,json,re
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
r=PdfReader(sys.argv[1],strict=True);assert len(r.pages)==2;assert not r.get_fields();assert '/AcroForm' not in r.trailer['/Root'];positions=json.loads(sys.argv[2]);seen=set();strings=[]
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
texts=[p.extract_text() or '' for p in r.pages]
for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
alltext='\n'.join(texts+strings)
for token in ['900-70-0411','900700411','900-70-0412','900700412','91-0000411','910000411','91-0000412','910000412','Fictional native complete married household sources']:
 assert token not in alltext,('private',token)
values={name:'' for name in positions}
def mul(a,b):return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
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
print(json.dumps({'cells':values,'texts':texts,'objects':len(seen)}))
`;

const blank=join(process.cwd(),'forms/blank/2025');
const cases=[
 {mode:'J',name:'whole',owners:[['joint','80000','2456','2456','0','0','2456','80000']]},
 {mode:'M',name:'whole',owners:[['primary','50000','1535','1535','0','0','1535','80000'],['spouse','30000','921','921','0','0','921','80000']]},
 {mode:'J',name:'cents',owners:[['joint','80001','2457','2456','0','1','2457','80001']]},
 {mode:'M',name:'cents',owners:[['primary','50000','1535','1535','0','0','1535','80000'],['spouse','30000','921','921','0','0','921','80000']]},
 {mode:'J',name:'shared-sp',owners:[['joint','13001','399','399','359','359','758','13001']]},
 {mode:'M',name:'shared-sp',owners:[['primary','10000','307','307','276','276','583','13001'],['spouse','3001','92','92','83','83','175','13001']]},
] as const;
type Snapshot={values:Record<string,string>;selected:Record<string,boolean>;appearanceCount:number};
function sameRect(a:number[],b:number[]){return a.length===b.length&&a.every((v,i)=>Math.abs(v-(b[i]??Infinity))<.025);}
function capture(snapshots:Snapshot[]){
 const original=PDFForm.prototype.flatten;
 return vi.spyOn(PDFForm.prototype,'flatten').mockImplementation(function(this:PDFForm,options){
  const snapshot:Snapshot={values:{},selected:{},appearanceCount:0};
  for(const field of this.getFields())for(const widget of field.acroField.getWidgets()){
   const box=widget.getRectangle(),rect=[box.x,box.y,box.x+box.width,box.y+box.height];
   const page=this.doc.getPages().findIndex(p=>p.ref.toString()===widget.P()?.toString());
   const value=field instanceof PDFTextField?field.getText()??'':'';
   for(const [kind,positions]of Object.entries(geometry))for(const [key,pos]of Object.entries(positions))if(pos.page===page&&sameRect(pos.rect,rect))snapshot.values[`${kind}:${key}`]=value;
   const normal=widget.getAppearances()?.normal;
   if(value){expect(normal).toBeInstanceOf(PDFStream);if(!(normal instanceof PDFStream))throw Error('Actual saved text AP source missing');expect(normal.getContents().length).toBeGreaterThan(0);snapshot.appearanceCount++;}
   const state=widget.getAppearanceState(),selected=Boolean(state&&state.toString()!=='/Off');
   for(const [key,pos]of Object.entries(statusGeometry))if(pos.page===page&&sameRect(pos.rect,rect))snapshot.selected[key]=selected;
   if(selected){expect(normal).toBeInstanceOf(PDFDict);if(!(normal instanceof PDFDict)||!state)throw Error('Actual selected source AP dictionary missing');const stream=normal.lookup(state);expect(stream).toBeInstanceOf(PDFStream);if(!(stream instanceof PDFStream))throw Error('Actual selected source AP missing');expect(stream.getContents().length).toBeGreaterThan(0);snapshot.appearanceCount++;}
  }
  snapshots.push(snapshot);original.call(this,options);
 });
}
type Saved={cells:Record<string,string>;texts:string[];objects:number};
async function render(f:ReturnType<typeof paMarriedOfficialFixture>,name:string,originalInput=false){
 const before=JSON.stringify(f.input),beforeResult=JSON.stringify(f.result),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=capture(snapshots);
 const directory=process.env.TAX_ENGINE_PA_MARRIED_INDEPENDENT_ARTIFACT_DIR?join(process.env.TAX_ENGINE_PA_MARRIED_INDEPENDENT_ARTIFACT_DIR,name):await mkdtemp(join(tmpdir(),'pa-married-independent-'));await mkdir(directory,{recursive:true});
 try{
  const docs=await fillPAMarriedOfficialReview(originalInput?f.input:redactReviewIdentifiers(f.input),f.result,blank,token);
  const saved:Array<{owner:string;kind:Kind;file:string;values:Saved}>=[];
  for(const doc of docs){const file=join(directory,doc.filename);await writeFile(file,await doc.doc.save({useObjectStreams:false}));const values=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',readSaved,file,JSON.stringify(geometry[doc.kind])],{encoding:'utf8'}))as Saved;saved.push({owner:doc.accountHolder,kind:doc.kind,file,values});}
  expect(JSON.stringify(f.input)).toBe(before);expect(JSON.stringify(f.result)).toBe(beforeResult);
  await writeFile(join(directory,'independent-canonical.json'),JSON.stringify(snapshots,null,2)+'\n');return{saved,snapshots};
 }finally{spy.mockRestore();if(!process.env.TAX_ENGINE_PA_MARRIED_INDEPENDENT_ARTIFACT_DIR)await rm(directory,{recursive:true,force:true});}
}
function actual<T>(value:T|undefined):T{if(value===undefined)throw Error('Actual independent source required');return value;}
it.each(cases)('independent PA married source physical cells and selected appearances $mode $name',async oracle=>{
 const f=paMarriedOfficialFixture(oracle.mode,oracle.name),r=await render(f,`${oracle.mode}-${oracle.name}`);
 expect(r.saved.map(x=>`${x.owner}:${x.kind}`)).toEqual(oracle.owners.flatMap(row=>[`${row[0]}:pa40`,...(row[4]!=='0'?[`${row[0]}:sp`]:[])]));
 let index=0;
 for(const [owner,wages,withheld,tax,credit,refund,total,eligibility]of oracle.owners){
  const paper=actual(r.saved[index]),snap=actual(r.snapshots[index]);expect(paper.values.objects).toBeGreaterThan(0);expect(snap.appearanceCount).toBeGreaterThan(0);
  const required:Record<string,string>={'1a':wages,'1b':'0','1c':wages,'2':'0','3':'0','4':'0','5':'0','6':'0','7':'0','8':'0','9':wages,'10':'0','11':wages,'12':tax,'13':withheld,'14':'0','15':'0','16':'0','17':'0','18':'0','22':'0','23':'0','24':total,'25':'0','26':'0','27':'0','28':'0','29':refund,'30':refund,'31':'0','19b':credit==='0'?'':'0','20':credit==='0'?'':eligibility,'21':credit==='0'?'':credit};
  const current=actual(f.married.returns.find(row=>row.accountHolder===owner));
  for(const key of ['unreimbursedExpenses','interest','dividends','netBusinessIncome','netGainOrLoss','netRentalIncome','estateTrustIncome','gamblingIncome','otherDeductions','creditFromPriorYear','estimatedPayments','extensionPayment','nonresidentTaxWithheld','totalEstimatedPaymentsAndCredits','residentCredit','otherCredits','useTax','taxDue','underpaymentPenalty','lateFilingOrPaymentPenalty','latePaymentInterest','totalAmountDue']as const)expect(current.pa40[key].toFixed(0),`${owner} actual source amount ${key}`).toBe('0');
  const optionalZero=new Set(['1b','2','3','4','5','6','7','8','10','14','15','16','17','18','22','23','26','28']);
  required['27']=''; // PA booklet printed23 expressly requires blank when no penalty/interest.
  for(const[key,value]of Object.entries(required)){
   const allowed=optionalZero.has(key)&&value==='0'?['','0']:[value];
   expect(allowed,`${owner} saved PA40 ${key}`).toContain(paper.values.cells[key]);expect(allowed,`${owner} canonical PA40 ${key}`).toContain(snap.values[`pa40:${key}`]);
  }
  expect(snap.selected[`filing/${oracle.mode==='J'?'2':'3'}`]).toBe(true);expect(snap.selected['residency/1']).toBe(true);
  for(const state of ['/1','/2','/3'])expect(snap.selected[`forgiveness${state}`]??false).toBe(credit!=='0'&&state==='/2');
  if(oracle.mode==='J'&&oracle.name==='cents'){expect(paper.values.texts.join(' ')).toContain('PA does not issue refunds of $1 or less');expect(paper.values.cells['30']).toBe('1');}
  index++;
  if(credit!=='0'){
   const sp=actual(r.saved[index]),spSnap=actual(r.snapshots[index]);expect(sp.kind).toBe('sp');const cols=oracle.mode==='J'?['A']:['B','C'];
   for(const col of ['A','B','C'])for(let line=1;line<=10;line++){
    const expected=!cols.includes(col)?'':line===1?(oracle.mode==='J'?'13001':col==='B'?(owner==='primary'?'10000':'3001'):(owner==='primary'?'3001':'10000')):'0';
    expect(sp.values.cells[col+line],`${owner} SP${col}${line}`).toBe(expected);
   }
   expect(sp.values.cells[oracle.mode==='J'?'A11':'BC11']).toBe('13001');expect(sp.values.cells[oracle.mode==='J'?'BC11':'A11']).toBe('');
   for(const [line,value]of Object.entries({'12':tax,'13':'0','14':tax,'15':'0.90','16':credit})){expect(sp.values.cells[oracle.mode+line],`${owner} SP${line}`).toBe(value);expect(sp.values.cells[(oracle.mode==='J'?'M':'J')+line]).toBe('');}
   expect(spSnap.selected['sp-broadMarried']).toBe(true);expect(spSnap.selected[oracle.mode==='J'?'sp-J3a':'sp-M3b']).toBe(true);expect(spSnap.selected[oracle.mode==='J'?'sp-M3b':'sp-J3a']??false).toBe(false);expect(spSnap.selected['sp-Mcertification']??false).toBe(oracle.mode==='M');index++;
  }
 }
});
it.each(['J','M']as const)('independent PA married actual gift columns reconcile %s',async mode=>{
 const f=paMarriedOfficialFixture(mode,'shared-sp');
 for(const owner of f.sources.owners){const ssn=owner.originalTaxpayer.ssn;owner.sp.categories['5']={status:'entries',sourceReference:`Independent quarter-dollar gift ${owner.accountHolder}`,entries:[{sourceReference:`Independent actual external gift original ${owner.accountHolder}`,date:'2025-12-30',amount:'0.25',notElsewhereConfirmed:true,original:{kind:'outside_household_gift',date:'2025-12-30',amount:'0.25',donorName:`Independent fictional outside donor ${owner.accountHolder}`,recipientSsn:ssn,donorInHousehold:false}}]};}
 const married=calculatePAMarriedOrdinaryReturn(f.input,f.sources),result={...calculateFederalTax(f.input),stateReturns:{pennsylvania:married}};const r=await render({...f,married,result},`${mode}-actual-gifts`);
 const sp=r.saved.filter(x=>x.kind==='sp');expect(sp).toHaveLength(mode==='J'?1:2);
 for(const row of sp){if(mode==='J'){expect(row.values.cells.A5).toBe('1');expect(row.values.cells.A11).toBe('13002');}else{expect(row.values.cells.B5).toBe('0');expect(row.values.cells.C5).toBe('0');expect(row.values.cells.BC11).toBe('13001');}
  const tax=mode==='J'?'399':row.owner==='primary'?'307':'92',credit=mode==='J'?'359':row.owner==='primary'?'276':'83';
  for(const[line,value]of Object.entries({'12':tax,'13':'0','14':tax,'15':'0.90','16':credit}))expect(row.values.cells[mode+line],`${row.owner} actual gift SP${line}`).toBe(value);
 }
});
it('independent PA married original-input display privacy',async()=>{
 const f=paMarriedOfficialFixture('J','whole');f.input.taxpayer.primary.firstName='900-70-0411';const owner=actual(f.sources.owners.find(x=>x.accountHolder==='primary'));owner.originalTaxpayer.firstName='900-70-0411';
 const eic=actual(f.input.eic);eic.disallowanceSources=fictionalEmptyEicHistory(f.input.taxpayer);
 const original=structuredClone(f.input);delete original.paMarriedOrdinarySources;f.sources.originalFederalSources=original;const married=calculatePAMarriedOrdinaryReturn(f.input,f.sources),result={...calculateFederalTax(f.input),stateReturns:{pennsylvania:married}};
 const r=await render({...f,married,result},'original-input-private-name',true);expect(r.saved).toHaveLength(1);expect(r.saved[0]?.values.cells['13']).toBe('2456');
});
it.each(['copied-token','missing-token','mode','owner-order','owner-cash','election','equal-money-name','packet']as const)('independent PA married stale authority rejects before IO %s',async kind=>{
 const f=paMarriedOfficialFixture('M','shared-sp'),token=preparePAMarriedReturnReview(f.input);let supplied:typeof token=token;
 if(kind==='copied-token')supplied={...token};if(kind==='missing-token')supplied=undefined as unknown as typeof token;
 if(kind==='mode')f.sources.filingMode='J';if(kind==='owner-order')f.married.returns.reverse();
 if(kind==='owner-cash'){const row=actual(f.married.returns[0]);row.pa40.stateWithholding=row.pa40.stateWithholding.plus(1);}
 if(kind==='election')actual(f.sources.dispositions[0]).refundRequested='1';if(kind==='equal-money-name')actual(f.input.w2s[1]).employer.name+=' same cash new original';if(kind==='packet')delete f.input.paMarriedOrdinarySources;
 await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,'/not-a-real-independent-template-path',supplied)).rejects.toThrow(/source|original|context|packet|prepared|result|changed/i);
});
it.each(['pa-40.pdf','pa-schedule-sp.pdf']as const)('independent PA married source revision rejects %s',async name=>{
 const f=paMarriedOfficialFixture('M','shared-sp'),token=preparePAMarriedReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-married-peer-revision-'));
 try{for(const file of ['pa-40.pdf','pa-schedule-sp.pdf'])await writeFile(join(dir,file),await readFile(join(blank,file)));await writeFile(join(dir,name),Buffer.concat([await readFile(join(dir,name)),Buffer.from('\n% independent source revision\n')]));await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,dir,token)).rejects.toThrow(/revision|template|hash/i);}finally{await rm(dir,{recursive:true,force:true});}
});
