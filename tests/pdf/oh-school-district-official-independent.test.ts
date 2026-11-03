/** Source-first independent actual paper checks. Spec: state/oh-school-district-official-independent.yaml. */
import { expect,it } from 'vitest';
import { mkdtemp,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import {
 schoolDistrictSourcesFixture,schoolDistrictEstimatedFixture,schoolDistrictZeroWithholdingFixture,
 schoolDistrictPriorReturn,schoolW2Packet,bindSchoolDistrictFixture,addSchoolMunicipalRow,
} from '../fixtures/oh-school-district-sources.js';

type Kind='base'|'estimates'|'outgoing'|'prior'|'zero-withholding'|'municipal-first';
const originals=[
 ['base','1100','0','1100','100','0','100'],
 ['estimates','600','400','1000','0','0','0'],
 ['outgoing','1100','0','1100','100','25','75'],
 ['prior','1100','100','1200','200','0','200'],
 ['zero-withholding','0','1000','1000','0','0','0'],
 ['municipal-first','1100','0','1100','100','0','100'],
] as const;
function original(kind:Kind){
 const input=kind==='estimates'?schoolDistrictEstimatedFixture():kind==='zero-withholding'?schoolDistrictZeroWithholdingFixture():schoolDistrictSourcesFixture();
 const row=schoolW2Packet(input).stateRows[0];if(!row)throw Error('Actual Ohio employer record required');
 row.employerStateID='12345678';
 if(kind==='outgoing')input.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward='25';
 if(kind==='prior'){
  input.ohioSchoolDistrict.payments.priorReturn=schoolDistrictPriorReturn(input,'1000','100','100');
  input.ohioSchoolDistrict.payments.priorCreditCarryforward={status:'actual_credit',sourceReference:'PRIVATE-PEER-2024-ACTUAL-CARRY',accountHolder:'primary',accountSsn:input.taxpayer.primary.ssn,electedAmount:'100',availableForThisReturn:'100',appliedToThisReturnConfirmed:true};
  input.ohioSchoolDistrict.payments.account.priorCreditApplied='100';
 }
 if(kind==='municipal-first')addSchoolMunicipalRow(input,true);
 bindSchoolDistrictFixture(input);return input;
}
const geometry={"SD100":{"page1":{"district":{"page":1,"name":"SD_NUM0","type":"/Tx","rect":[40.8641,320.81,73.8131,336.793],"maxlen":4,"AP":[]},"end":{"page":1,"name":"RES_END0","type":"/Tx","rect":[167.9,321.043,213.404,336.793],"maxlen":8,"AP":[]},"days":{"page":1,"name":"day0","type":"/Tx","rect":[237.818,321.043,265.636,336.793],"maxlen":3,"AP":[]},"factor":{"page":1,"name":"res_factor0","type":"/Tx","rect":[309.381,322.211,356.4,336.793],"maxlen":null,"AP":[]}},"page2":{"1":{"page":2,"name":"L1","type":"/Tx","rect":[465.188,679.479,578.126,697.479],"maxlen":11,"AP":[]},"3":{"page":2,"name":"L3","type":"/Tx","rect":[466.188,631.815,579.126,649.815],"maxlen":11,"AP":[]},"4":{"page":2,"name":"L4","type":"/Tx","rect":[465.333,607.922,578.271,625.922],"maxlen":5,"AP":[]},"5":{"page":2,"name":"L5","type":"/Tx","rect":[466.103,584.041,579.041,602.041],"maxlen":11,"AP":[]},"7":{"page":2,"name":"L7","type":"/Tx","rect":[509.452,512.755,577.555,530.755],"maxlen":9,"AP":[]},"8":{"page":2,"name":"L8","type":"/Tx","rect":[509.452,488.901,577.555,506.901],"maxlen":9,"AP":[]},"10":{"page":2,"name":"L10","type":"/Tx","rect":[509.452,440.855,577.555,458.855],"maxlen":9,"AP":[]},"11":{"page":2,"name":"L11","type":"/Tx","rect":[509.452,417.344,577.555,435.344],"maxlen":9,"AP":[]},"12":{"page":2,"name":"L12","type":"/Tx","rect":[509.452,393.152,577.555,411.152],"maxlen":9,"AP":[]},"13":{"page":2,"name":"L14","type":"/Tx","rect":[509.452,370.078,577.555,388.078],"maxlen":9,"AP":[]},"14":{"page":2,"name":"L15","type":"/Tx","rect":[509.452,345.999,577.555,363.999],"maxlen":9,"AP":[]},"15":{"page":2,"name":"L16","type":"/Tx","rect":[509.452,321.415,577.555,339.415],"maxlen":9,"AP":[]},"16":{"page":2,"name":"L17","type":"/Tx","rect":[509.452,284.423,577.555,302.423],"maxlen":9,"AP":[]},"17":{"page":2,"name":"L18","type":"/Tx","rect":[509.452,260.973,577.555,278.973],"maxlen":9,"AP":[]},"18":{"page":2,"name":"L19","type":"/Tx","rect":[509.452,237.108,577.555,255.108],"maxlen":9,"AP":[]},"19":{"page":2,"name":"L20","type":"/Tx","rect":[509.452,214.269,577.555,232.269],"maxlen":9,"AP":[]},"20":{"page":2,"name":"L21","type":"/Tx","rect":[509.452,189.83,577.555,207.83],"maxlen":9,"AP":[]},"21":{"page":2,"name":"L22","type":"/Tx","rect":[509.452,165.879,577.555,183.879],"maxlen":9,"AP":[]}},"page3":{"29":{"page":3,"name":"COLA30","type":"/Tx","rect":[313.979,367.719,396.957,385.72],"maxlen":11,"AP":[]},"30":{"page":3,"name":"COLA31","type":"/Tx","rect":[315.417,319.195,398.395,337.196],"maxlen":11,"AP":[]},"31":{"page":3,"name":"COLA32","type":"/Tx","rect":[314.816,295.995,397.794,313.996],"maxlen":11,"AP":[]},"32":{"page":3,"name":"COLA35","type":"/Tx","rect":[314.616,274.395,397.594,290.396],"maxlen":11,"AP":[]},"33":{"page":3,"name":"COLA36","type":"/Tx","rect":[314.416,250.795,397.394,266.796],"maxlen":11,"AP":[]},"34":{"page":3,"name":"COLA37","type":"/Tx","rect":[364.659,228.701,396.637,244.702],"maxlen":4,"AP":[]},"35":{"page":3,"name":"COLA38","type":"/Tx","rect":[315.616,204.195,398.594,220.196],"maxlen":9,"AP":[]},"36":{"page":3,"name":"COLA39","type":"/Tx","rect":[316.116,180.596,399.094,196.597],"maxlen":2,"AP":[]},"37":{"page":3,"name":"COLA40","type":"/Tx","rect":[314.816,155.196,397.794,171.197],"maxlen":9,"AP":[]},"38":{"page":3,"name":"LINE41","type":"/Tx","rect":[495.109,130.902,578.088,146.903],"maxlen":9,"AP":[]}},"earnedDistrict":{"page":3,"name":"COLASD2","type":"/Tx","rect":[350.118,391.81,382.096,409.811],"maxlen":4,"AP":[]}},"withholding":{"TotalWithholding":{"page":4,"name":"TotalWithholding","type":"/Tx","rect":[466.89,609.295,527.207,622.331],"maxlen":8,"AP":[]},"SchedW_B_L1_PS":{"page":4,"name":"SchedW_B_L1_PS","type":"/Tx","rect":[41.1148,551.964,53.9528,564.88],"maxlen":1,"AP":[]},"SchedW_B_L1_SD":{"page":4,"name":"SchedW_B_L1_SD","type":"/Tx","rect":[60.0,551.0,95.25,564.0],"maxlen":4,"AP":[]},"SchedW_B_L1_WAGE":{"page":4,"name":"SchedW_B_L1_WAGE","type":"/Tx","rect":[285.708,551.031,355.665,564.068],"maxlen":9,"AP":[]},"SchedW_B_L1_FITW":{"page":4,"name":"SchedW_B_L1_FITW","type":"/Tx","rect":[444.34,551.031,505.737,564.068],"maxlen":8,"AP":[]},"SchedW_B_L1_OHWAGE":{"page":4,"name":"SchedW_B_L1_OHWAGE","type":"/Tx","rect":[227.52,514.884,297.478,527.92],"maxlen":9,"AP":[]},"SchedW_B_L1_OHIT":{"page":4,"name":"SchedW_B_L1_OHIT","type":"/Tx","rect":[429.92,514.884,491.317,527.92],"maxlen":8,"AP":[]},"SchedW_B_L1_EIN":{"page":4,"name":"SchedW_B_L1_EIN","type":"/Tx","rect":[142.952,551.031,212.91,564.068],"maxlen":10,"AP":[]},"SchedW_B_L1_OHID":{"page":4,"name":"SchedW_B_L1_OHID","type":"/Tx","rect":[55.452,514.884,125.41,527.92],"maxlen":8,"AP":[]}},"statuses":[{"page":1,"name":"CHK_FILING_STATUS","type":"/Btn","rect":[44.201,405.515,56.285,417.89],"maxlen":null,"AP":["/1","/Off"]},{"page":1,"name":"PRIMARY_CHK0","type":"/Btn","rect":[472.749,324.419,484.608,336.793],"maxlen":null,"AP":["/1","/Off"]},{"page":1,"name":"SPOUSE_CHK0","type":"/Btn","rect":[523.276,324.419,535.135,336.793],"maxlen":null,"AP":["/1","/Off"]}]};
const reader=String.raw`
import sys,json,re
from pypdf import PdfReader
from pypdf.generic import IndirectObject,ContentStream
path,source=sys.argv[1:3];cfg=json.loads(sys.argv[3]);r=PdfReader(path,strict=True)
assert len(r.pages)==cfg['pages'],('pages',len(r.pages),cfg['pages'])
assert not r.get_fields() and '/AcroForm' not in r.trailer['/Root']
root=r.trailer['/Root'];assert '/OpenAction' not in root
assert not root.get('/Names',{}).get('/EmbeddedFiles')
alltext=[];objects=[]
for p in r.pages:
 text=p.extract_text() or '';alltext.append(text)
 assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1,('reviewnotice',text)
 for a in p.get('/Annots',[]):assert a.get_object().get('/Subtype')!='/Widget'
ids={(g,n) for g,entries in r.xref.items() if g!=65535 for n in entries if n};ids.update((0,n) for n in r.xref_objStm)
for g,n in sorted(ids):
 obj=r.get_object(IndirectObject(n,g,r))
 if isinstance(obj,dict):
  assert not any(k in obj for k in ['/AA','/OpenAction','/JS','/FT']),('activeobject',g,n)
  assert obj.get('/Subtype')!='/Widget' and obj.get('/S')!='/JavaScript'
 objects.append(str(obj))
 if hasattr(obj,'get_data'):objects.append(repr(obj.get_data()))
raw='\n'.join(alltext+objects+[str(r.metadata)])
for secret in cfg['private']:assert secret not in raw,('private',secret)
# Adobe PDF1.7/ISO32000-1 8.10: Form space BBox is transformed by
# each nested Do's Form Matrix concatenated with the current graphics CTM.
# q/Q save/restore the CTM; a page-level wrapper is never treated as a field.
def mul(m,n):
 a,b,c,d,e,f=m;g,h,i,j,k,l=n
 return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def rect(matrix,box):
 a,b,c,d,e,f=matrix;l,bt,rt,t=map(float,box)
 pts=[(a*x+c*y+e,b*x+d*y+f) for x,y in [(l,bt),(l,t),(rt,bt),(rt,t)]]
 return [min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)]
def deref(obj):return obj.get_object() if hasattr(obj,'get_object') else obj
def walk(stream,resources,matrix,ancestors=()):
 assert len(ancestors)<64,'nested Form recursion limit'
 matrix=matrix[:];stack=[];found=[]
 for args,op in ContentStream(stream,r).operations:
  if op==b'q':stack.append(matrix[:])
  elif op==b'Q':assert stack,'unbalanced graphics state';matrix=stack.pop()
  elif op==b'cm':matrix=mul(matrix,list(map(float,args)))
  elif op==b'Do':
   xobjects=deref(deref(resources).get('/XObject',{}));child=deref(xobjects.get(args[0]))
   if child is None or child.get('/Subtype')!='/Form':continue
   identity=id(child);assert identity not in ancestors,'recursive Form cycle'
   local=mul(matrix,list(map(float,child.get('/Matrix',[1,0,0,1,0,0]))))
   ops=ContentStream(child,r).operations;strings=[];mark_path=False
   for values,operator in ops:
    if operator==b'Tj':strings.append(str(values[0]))
    elif operator==b'TJ':strings.extend(str(v) for v in values[0] if isinstance(v,str))
    elif operator in [b'm',b'l',b'c',b'v',b'y']:mark_path=True
   found.append({'rect':rect(local,child['/BBox']),'text':''.join(strings),'mark':bool(''.join(strings).strip()) or mark_path})
   found.extend(walk(child,child.get('/Resources',resources),local,ancestors+(identity,)))
 assert not stack,'unclosed graphics state'
 return found
painted=[walk(p['/Contents'],p.get('/Resources',{}),[1,0,0,1,0,0]) for p in r.pages]
def matches(page,bounds):return [v for v in painted[page-1] if all(abs(a-b)<.02 for a,b in zip(v['rect'],bounds))]
checked=[]
for cell in cfg['cells']:
 candidates=matches(cell['page'],cell['rect']);values=[re.sub(r'[\s,]','',v['text']) for v in candidates if v['text'].strip()]
 assert len(values)<=1,('duplicate rendered cell',cell,values)
 value=values[0] if values else ''
 assert value in cell['values'],('PRINTED CELL',cell['printed'],cell['page'],cell['rect'],value,cell['values'])
 checked.append([cell['printed'],value])
for status in cfg.get('status',[]):
 marks=[v for v in matches(1,status['rect']) if v['mark']]
 assert len(marks)==(1 if status['selected'] else 0),('printed selected status',status,len(marks))
print(json.dumps({'pages':len(r.pages),'cells':checked,'xrefObjects':len(ids),'fields':0,'privacy':'pass'}))
`;
function cell(page:number,printed:string,rect:number[],value:string){return{page,printed,rect,values:value==='0'?['','0']:[value]};}
function config(kind:Kind,withheld:string,credited:string,payments:string,overpayment:string,carry:string,refund:string){
 const g=geometry.SD100;const cells=[
  cell(1,'district',g.page1.district.rect,'0302'),cell(1,'days',g.page1.days.rect,'365'),
  cell(2,'1',g.page2['1'].rect,'80000'),cell(2,'3',g.page2['3'].rect,'80000'),cell(2,'4',g.page2['4'].rect,'2150'),cell(2,'5',g.page2['5'].rect,'77850'),
  cell(2,'7',g.page2['7'].rect,'1000'),cell(2,'8',g.page2['8'].rect,'1000'),cell(2,'10',g.page2['10'].rect,'1000'),
  cell(2,'11',g.page2['11'].rect,withheld),cell(2,'12',g.page2['12'].rect,credited),cell(2,'13',g.page2['13'].rect,payments),
  {...cell(2,'14 amended only',g.page2['14'].rect,''),values:['']},cell(2,'15',g.page2['15'].rect,payments),
  cell(2,'19',g.page2['19'].rect,overpayment),cell(2,'20',g.page2['20'].rect,carry),cell(2,'21',g.page2['21'].rect,refund),
  cell(3,'earned district',g.earnedDistrict.rect,'0302'),
  ...(['29','31','32','33'] as const).map(line=>cell(3,line,g.page3[line].rect,'80000')),
  cell(3,'34 rate',g.page3['34'].rect,'.0125'),...(['35','37','38'] as const).map(line=>cell(3,line,g.page3[line].rect,'1000')),
 ];
 if(new Decimal(overpayment).gt(0))for(const line of ['16','17','18'] as const)cells.push({...cell(2,line+' skipped',g.page2[line].rect,''),values:['']});
 return{pages:3,cells,status:[
  {name:'Single',rect:[44.201,405.515,56.285,417.89],selected:true},
  {name:'Primary resident',rect:[472.749,324.419,484.608,336.793],selected:true},
  {name:'Spouse resident',rect:[523.276,324.419,535.135,336.793],selected:false},
  {name:'Joint',rect:[184.867,405.515,196.951,417.89],selected:false},
  {name:'MFS',rect:[292.856,405.515,304.94,417.89],selected:false},
  {name:'Amended',rect:[40.677,694.028,52.761,706.403],selected:false},
  {name:'NOL',rect:[314.87,694.028,326.954,706.403],selected:false},
 ],private:['900-70-0302','900700302','PRIVATE-']};
}
it.each(originals)('independent SD original arithmetic and exact physical cells %s',async(kind,withheld,credited,payments,overpayment,carry,refund)=>{
 const input=original(kind),before=JSON.stringify(input),precision=Decimal.precision;
 const federal=calculateFederalTax(input),ohio=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 const sd=ohio.sd100;if(!sd)throw Error('Actual complete school return required');
 expect(federal.agi.eq('80000')).toBe(true);expect(new Decimal('80000').times('.0125').eq('1000')).toBe(true);
 expect(sd.line8_totalTaxAfterCredits.toString()).toBe('1000');expect(sd.line11_sdWithholding.toString()).toBe(withheld);
 expect(sd.line12_estimatedPayments.toString()).toBe(credited);expect(sd.line15_netPayments.toString()).toBe(payments);
 expect(sd.line19_overpayment.toString()).toBe(overpayment);expect(sd.line20_creditCarryforward.toString()).toBe(carry);expect(sd.line21_refund.toString()).toBe(refund);
 expect(input.w2s[0]?.stateTaxWithheld).toBe('3000');
 const context=prepareOhioResidencyReview(input),temp=await mkdtemp(join(tmpdir(),'sd-physical-peer-'));
 const output=process.env.OH_SD_INDEPENDENT_ARTIFACT_DIR?join(process.env.OH_SD_INDEPENDENT_ARTIFACT_DIR,kind):join(temp,'packet');
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{},context);
  const names=Object.fromEntries(result.filledForms.map(file=>[basename(file),file]));
  const sdfile=names['oh-sd-100-review.pdf'];if(!sdfile)throw Error('Missing actual official SD100 saved file');
  const source=process.env.OH_SD_OFFICIAL_SOURCE??join(process.cwd(),'forms','blank','2025','oh-sd100-bundle.pdf');
  const python=process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3';
  const checked=JSON.parse(execFileSync(python,['-c',reader,sdfile,source,JSON.stringify(config(kind,withheld,credited,payments,overpayment,carry,refund))],{encoding:'utf8'}));
  expect(checked.pages).toBe(3);
  const whfile=names['oh-sd-withholding-review.pdf'];
  if(withheld==='0')expect(whfile).toBeUndefined();
  else{
   if(!whfile)throw Error('Missing actual official positive SD withholding companion');
   const w=geometry.withholding,wh={pages:1,private:['900-70-0302','900700302','PRIVATE-'],cells:[
    cell(1,'total schoolWH',w.TotalWithholding.rect,withheld),cell(1,'owner P',w.SchedW_B_L1_PS.rect,'P'),cell(1,'district',w.SchedW_B_L1_SD.rect,'0302'),
    cell(1,'federal wages',w.SchedW_B_L1_WAGE.rect,'80000'),cell(1,'federal withholding',w.SchedW_B_L1_FITW.rect,'10000'),cell(1,'school wages',w.SchedW_B_L1_OHWAGE.rect,'80000'),cell(1,'school withholding',w.SchedW_B_L1_OHIT.rect,withheld),
    {...cell(1,'actual employer business EIN',w.SchedW_B_L1_EIN.rect,'91-0000302'),values:['91-0000302','910000302']},cell(1,'actual employer Ohio withholding ID',w.SchedW_B_L1_OHID.rect,'12345678'),
   ]};
   expect(JSON.parse(execFileSync(python,['-c',reader,whfile,source,JSON.stringify(wh)],{encoding:'utf8'})).pages).toBe(1);
  }
  expect(JSON.stringify(input)).toBe(before);expect(Decimal.precision).toBe(precision);
 }finally{await rm(temp,{recursive:true,force:true});}
});

it.each(['missing context','fabricated context','same-cash employer identity','same-cash source reference','school classification','prior-account contradiction','stale federal result','year mismatch'] as const)('independent SD denies before output I/O %s',async kind=>{
 const input=original('base'),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input);
 const w2=input.w2s[0];if(!w2)throw Error('Actual current W2 required');
 if(kind==='same-cash employer identity')w2.employer.name='DIFFERENT ACTUAL SAME CASH EMPLOYER';
 if(kind==='same-cash source reference')input.ohioSchoolDistrict.sourceReference='PRIVATE-NEW-ACTUAL-SOURCE-REFERENCE';
 if(kind==='school classification'){
  const row=input.ohioSchoolDistrict.w2Sources[0]?.localRows[0];if(!row)throw Error('Actual classification required');row.classification='municipal';
 }
 if(kind==='prior-account contradiction')input.ohioSchoolDistrict.payments.account.priorCreditApplied='100';
 if(kind==='stale federal result')federal.agi=federal.agi.plus('1');
 if(kind==='year mismatch')input.taxpayer.taxYear=2026;
 const temp=await mkdtemp(join(tmpdir(),'sd-physical-peer-deny-')),output=join(temp,'never-created');
 try{
  const token=kind==='missing context'?undefined:kind==='fabricated context'?{...context}:context;
  await expect(fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{},token)).rejects.toThrow();
  await expect(access(output)).rejects.toThrow();
 }finally{await rm(temp,{recursive:true,force:true});}
});
