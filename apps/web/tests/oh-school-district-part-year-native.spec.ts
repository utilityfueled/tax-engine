// Spec: spec/state/oh-school-district-part-year-native-browser.yaml. Source-first actual native originals.
import { nativeControlTag } from './helpers/native-control-snapshot';
import {expect,test,type Page,type Locator,type TestInfo} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {schoolPyHeaderPacket,schoolPyPaperCases,schoolPyPaperCells,schoolPyStatuses,schoolPyPlans,type SchoolPyPaperCase} from '../../../tests/fixtures/oh-school-district-part-year-official-review';
import {guidedSchoolDistrictFixture,enteredSchoolDraft,schoolNativeFields,sdConfirmLabel} from '../../../tests/fixtures/guided-oh-school-district-complete';
import {buildTaxInputFromGuidedData,buildGuidedW2SourceContext} from '../src/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '../src/lib/guided-w2-state-local-facts';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
const paperDisclosure='Experimental SD 100 and school withholding review PDFs cover only qualified, current original-bound Hillsdale (0302) full-year or 212-day Ohio / 153-day Virginia payroll methods. The part-year packet requires actual Ashland County / Hillsdale header originals. Other methods and incomplete sources remain unavailable for paper review; filing remains unavailable.';
const parentConfirm='Confirm actual Ohio residency sources',paymentConfirm='Confirm actual Ohio payment sources',headerConfirm='Confirm actual Ohio resident return header sources';
function required<T>(v:T|null|undefined):T{if(v==null)throw Error('Actual supplied PY school source required');return v;}
function control(page:Page,label:string){const span=page.locator('label').getByText(label,{exact:true});return span.locator('..').locator('input,select');}
async function enter(page:Page,label:string,value:string){const field=control(page,label);const [tagName]=await Promise.all([nativeControlTag(field),expect(page.locator('label').getByText(label,{exact:true}).locator('..').getByText(label,{exact:true})).toHaveCount(1)]);if(tagName==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
async function fields(page:Page,rows:readonly(readonly[string,string])[]){for(const[label,value]of rows)await enter(page,label,value);}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return required(await page.evaluate(id=>{const raw=localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`);return raw?JSON.parse(raw)as GuidedFlowState:null;},id));}
async function stateData(page:Page,id:string){return required((await saved(page,id)).sectionData['state-return']);}
function read(root:unknown,path:readonly(string|number)[]):string{let v=root;for(const key of path){if(v==null||typeof v!=='object')throw Error('Actual source path absent '+path.join('.'));v=Reflect.get(v,key);}if(!['string','number','boolean'].includes(typeof v))throw Error('Actual scalar source absent '+path.join('.'));return String(v);}
async function geometry(page:Page,info:TestInfo,phase:string,scope:Locator,anchor:Locator){await expect(scope).toHaveCount(1);await expect(anchor).toHaveCount(1);await anchor.evaluate(n=>n.scrollIntoView({block:'center',inline:'nearest'}));await expect(anchor).toBeVisible();const actual=await scope.evaluate(root=>{const issues=[];for(const n of[root,...root.querySelectorAll('input,select,button,label,fieldset,[role="alert"]')]){const r=n.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(n).visibility==='hidden')continue;if(r.left< -1||r.right>innerWidth+1)issues.push({tag:n.tagName,text:(n.textContent??'').slice(0,100),left:r.left,right:r.right});}return{documentWidth:document.documentElement.scrollWidth,width:innerWidth,issues};});const hit=await anchor.evaluate(n=>{const r=n.getBoundingClientRect(),point=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{top:r.top,bottom:r.bottom,height:innerHeight,uncovered:point===n||!!point&&n.contains(point)};});await writeFile(info.outputPath(phase+'-geometry.json'),JSON.stringify({phase,actual,hit},null,2));await page.screenshot({path:info.outputPath(phase+'.png')});expect(actual.documentWidth).toBeLessThanOrEqual(actual.width);expect(actual.issues).toEqual([]);expect(hit.top).toBeGreaterThanOrEqual(-1);expect(hit.bottom).toBeLessThanOrEqual(hit.height+1);expect(hit.uncovered).toBe(true);}
async function validationReadability(page:Page,info:TestInfo,phase:string,scope:Locator){
 const alert=scope.getByRole('alert');await expect(alert).toHaveCount(1);const text=required(await alert.textContent());expect(text.trim().length).toBeGreaterThan(0);
 const probes=[];
 for(const edge of ['first','last']as const){
  const probe=await alert.evaluate((node,edge)=>{
   const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),texts:Text[]=[];let child=walker.nextNode();
   while(child){if(child.textContent?.trim())texts.push(child as Text);child=walker.nextNode();}
   const target=edge==='first'?texts[0]:texts.at(-1);if(!target||!target.textContent)throw Error('Actual validation text endpoint missing');
   const offset=edge==='first'?0:target.textContent.length-1,range=document.createRange();range.setStart(target,offset);range.setEnd(target,offset+1);
   const initial=range.getBoundingClientRect();window.scrollBy({top:initial.top-(innerHeight-initial.height)/2,behavior:'instant'});
   const rect=range.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2),full=node.getBoundingClientRect();
   return{edge,top:rect.top,bottom:rect.bottom,height:innerHeight,left:rect.left,right:rect.right,width:innerWidth,uncovered:hit===node||!!hit&&node.contains(hit),text:node.textContent,alertTop:full.top,alertBottom:full.bottom,alertHeight:full.height};
  },edge);
  expect(probe.text).toBe(text);expect(probe.top).toBeGreaterThanOrEqual(-1);expect(probe.bottom).toBeLessThanOrEqual(probe.height+1);expect(probe.left).toBeGreaterThanOrEqual(-1);expect(probe.right).toBeLessThanOrEqual(probe.width+1);expect(probe.uncovered).toBe(true);probes.push(probe);
  await page.screenshot({path:info.outputPath(phase+'-alert-'+edge+'.png')});
 }
 await writeFile(info.outputPath(phase+'-alert-readability.json'),JSON.stringify({text,probes},null,2));
}
async function seedFederalOnly(page:Page,c:SchoolPyPaperCase){
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);const id=required(new URL(page.url()).pathname.split('/').at(-1));await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
 const packet=schoolPyHeaderPacket(c),state=guidedSchoolDistrictFixture().state,w=required(packet.canonical.w2s[0]),person=packet.original.taxpayer.primary,address=packet.original.taxpayer.address;
 Object.assign(required(state.sectionData['personal-info']),{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth,stateResidency:'part-year',addressLine1:address.street,addressLine2:address.apt??'',city:address.city,state:address.state,zip:address.zip});
 const entry=required(required(state.sectionData['income-w2']).entries[0]);Object.assign(entry,{employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages,socialSecurityWithheld:w.socialSecurityWithheld,medicareWages:w.medicareWages,medicareWithheld:w.medicareWithheld,stateTaxReporting:'multiple',state:'OH',stateWages:'40000',stateWithheld:'2000',localWages:'40000',localTaxWithheld:c.withheld,localityName:w.localityName,stateLocalSources:structuredClone(required(w.stateLocalSources))});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:''};entry.stateLocalSources=confirmGuidedW2StateLocalSources(required(buildGuidedW2SourceContext(state)),0,required(entry.stateLocalSources));
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(s=>s.id==='state-return');expect(index).toBeGreaterThanOrEqual(0);state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(s=>s.id);const original=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
 expect(original.taxpayer.taxYear).toBe(2025);expect(original.w2s[0]?.wages).toBe('60000');expect(Object.keys(required(state.sectionData['state-return'])).sort()).toEqual(['additionalStateWithholding','stateEstimatedPayments']);for(const key of['ohioResidency','ohioPayments','ohioSchoolDistrict','ohioReturnHeaderSources'])expect(original).not.toHaveProperty(key);
 // The only source storage write in this test: unrelated federal/household originals, all Ohio roots absent.
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});await page.reload();return{id,packet,original,initial:structuredClone(state)};
}
const categories=[['wages','Wages and compensation'],['capitalGains','Nonbusiness capital gains and losses'],['rentsRoyalties','Nonbusiness rents and royalties'],['gambling','Gambling income'],['interestDividends','Interest and dividends'],['pensions','Pensions and IRA distributions'],['unemployment','Unemployment'],['otherIncome','Other nonbusiness income'],['federalAdjustments','Federal adjustments to income']]as const;
async function enterParents(page:Page,packet:ReturnType<typeof schoolPyHeaderPacket>,id:string){const r=packet.canonical.ohioResidency,o=required(r.owners[0]),p=packet.canonical.ohioPayments;
 await page.getByRole('button',{name:'Add Ohio residency source facts',exact:true}).click();await page.getByRole('button',{name:'Add primary owner domicile source',exact:true}).click();await expect(control(page,'primary domicile period 1 begins')).toHaveValue('');for(let i=1;i<o.periods.length;i++)await page.getByRole('button',{name:'Add primary domicile period',exact:true}).click();
 await fields(page,[['Ohio residency source year','2025'],['Ohio residency source reference',r.sourceReference],['Ohio school district residency source status','actual_district_sources_required'],['primary domicile source reference',o.sourceReference],['primary actual Ohio residency status','part_year_resident'],['All actual federal income and adjustment sources included','true'],['Actual sources contain no business income requiring Ohio apportionment','true']]);
 for(const[i,p]of o.periods.entries())await fields(page,[[`primary domicile period ${i+1} begins`,p.from],[`primary domicile period ${i+1} ends`,p.to],[`primary domicile period ${i+1} state`,p.domicileState]]);
 for(const[key,label]of categories){const v=required(o.amounts)[key];await fields(page,[[`primary ${label} original source reference`,v.sourceReference],[`primary ${label}: Full federal source amount`,v.federalAmount],[`primary ${label}: Amount received while an Ohio resident`,v.residentAmount],[`primary ${label}: Ohio-source amount while a nonresident`,v.nonresidentOhioAmount]]);}
 await page.getByRole('button',{name:parentConfirm,exact:true}).click();await expect.poll(async()=>(await stateData(page,id)).ohioResidency?.sourceFactsConfirmed).toBe(true);
 await fields(page,[['Ohio payment source year','2025'],['Ohio payment records source reference',p.sourceReference],['These records cover the complete calendar tax year','true'],['All payments and account credits are included','true'],['Current return is original or amended','original'],['Current filing extension records','none'],['Current payment extension records','none'],['Farming or fishing income in these actual records','known_none'],['Military or disaster relief affecting these tax payments','known_none'],['Prior-year Ohio return history','no_return'],['Prior return history source reference',p.priorReturn.sourceReference],['Prior credit carryforward account records','none'],['Prior credit account source reference',p.priorCreditCarryforward.sourceReference],['Records as-of date','2026-04-01'],['Current return filing timing','expected'],['Expected current return filing date','2026-04-15'],['Remaining-tax payment records','no_remaining_tax'],['Remaining-tax payment source reference',p.remainingTaxPayment.sourceReference],['These remaining-tax payment facts match current records','true'],['Use-tax and refund-election source reference',required(p.balanceFacts).sourceReference],['Actual use tax','0'],['Actual outgoing credit carryforward election','0'],['Actual donation election','0']]);
 await page.getByRole('button',{name:parentConfirm,exact:true}).click();await expect.poll(async()=>(await stateData(page,id)).ohioResidency?.sourceFactsConfirmed).toBe(true);await page.getByRole('button',{name:paymentConfirm,exact:true}).click();await expect.poll(async()=>(await stateData(page,id)).ohioPayments?.sourceFactsConfirmed).toBe(true);
}
async function enterSchool(page:Page,packet:ReturnType<typeof schoolPyHeaderPacket>){const actual=packet.canonical.ohioSchoolDistrict,draft=enteredSchoolDraft(actual),baseline=guidedSchoolDistrictFixture();
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Add actual school residence period',exact:true}).click();await page.getByRole('button',{name:'Add actual school W2 source coverage',exact:true}).click();await page.getByRole('button',{name:'Add actual local source row',exact:true}).click();
 for(const[label,path]of schoolNativeFields({...baseline,draft}))await enter(page,label,read(draft,path));const period=required(actual.residence.periods[1]);await fields(page,[['School residence period 2 begins',period.from],['School residence period 2 ends',period.through],['School residence period 2 district code',period.districtCode],['School residence period 2 reference',period.sourceReference]]);
 await page.getByRole('button',{name:'Add actual part-year school payroll sources',exact:true}).click();const py=actual.partYearWageSources;await fields(page,[['Part-year school wage method','specific_payroll'],['Part-year school method reference',py.sourceReference],['All actual original part-year payroll records are included','true']]);
 for(const[i,h]of py.residenceOriginals.entries()){await page.getByRole('button',{name:'Add actual part-year school home original',exact:true}).click();const pre=`Part-year school home ${i+1}`;await fields(page,[[pre+' reference',h.sourceReference],[pre+' begins',h.from],[pre+' ends',h.through],[pre+' domicile state',h.domicileState]]);for(const key of['street','city','state','zip']as const)await enter(page,pre+' original address '+key,h.originalAddress[key]);}
 for(const[i,row]of py.payrollOriginals.entries()){await page.getByRole('button',{name:'Add actual part-year school payroll original',exact:true}).click();const pre=`Part-year payroll ${i+1}`;await fields(page,[[pre+' source reference',row.sourceReference],[pre+' original ID',row.payrollId],[pre+' current W2 original','0'],[pre+' owner','primary'],[pre+' source year','2025'],[pre+' original first name',row.originalTaxpayer.firstName],[pre+' original last name',row.originalTaxpayer.lastName],[pre+' original SSN',row.originalTaxpayer.ssn],[pre+' original birth date',row.originalTaxpayer.dateOfBirth],[pre+' original employer name',row.employer.name],[pre+' original employer EIN',row.employer.ein],[pre+' paid on',row.paidOn],[pre+' services begin',row.serviceFrom],[pre+' services end',row.serviceThrough],[pre+' service state',row.serviceState],[pre+' actual records show no Ohio services outside Ohio residence','true'],[pre+' gross wages',row.grossWages],[pre+' federal withholding',row.federalWithheld]]);
  for(const[j,s]of row.stateRows.entries()){await page.getByRole('button',{name:`Add actual part-year payroll ${i+1} state row`,exact:true}).click();await fields(page,[[pre+` state row ${j+1} state`,s.state],[pre+` state row ${j+1} wages`,s.wages],[pre+` state row ${j+1} withholding`,s.withheld]]);}await enter(page,pre+' school reporting',row.schoolReporting.status);if(row.schoolReporting.status==='reported')await fields(page,[[pre+' school district code',row.schoolReporting.districtCode],[pre+' school wages',row.schoolReporting.wages],[pre+' school withholding',row.schoolReporting.withheld]]);
 }
}
async function enterHeader(page:Page,h:ReturnType<typeof schoolPyHeaderPacket>['header']){
 await page.getByRole('button',{name:'Add actual Ohio residential period',exact:true}).click();const o=h.owner.originalTaxpayer,p=required(h.residence.periods[0]),f=h.finderOriginal,c=h.countyOriginal,i=h.officialInventoryOriginal;
 await fields(page,[['Header source tax year','2025'],['Header source record reference',h.sourceReference],['Header source as of date',h.asOfDate],['Header account owner','primary'],['Header original first name',o.firstName],['Header original last name',o.lastName],['Header original SSN',o.ssn],['Header original date of birth',required(o.dateOfBirth)],['Residence original reference',h.residence.sourceReference],['Actual residence period original reference',p.sourceReference],['Actual residence from',p.from],['Actual residence through',p.through],['All actual Ohio residential periods included','true'],['Finder original reference',f.sourceReference],['Finder original tax year','2025'],['Finder original lookup date',f.lookupDate],['Actual school district number','0302'],['Actual school district name','Hillsdale LSD'],['County shown in Finder original','Ashland'],['School income tax shown in actual original','reported'],['I reviewed the actual official Finder result','true'],['County original reference',c.sourceReference],['County original tax year','2025'],['County original record date',c.recordDate],['Actual county name','Ashland'],['Actual official district list publication','ohio_2025_it1040_booklet'],['Official district list original reference',i.sourceReference],['Official district list tax year','2025'],['Official district list printed page','51'],['District number in official list','0302'],['District name in official list','Hillsdale LSD'],['Rate shown in official district list','.0125'],['Tax base shown in official district list','E'],['I reviewed the actual official district list row','true']]);
 for(const[prefix,a]of[['Actual residential',h.residence.originalAddress],['Finder queried residential',f.originalAddress],['County original residential',c.originalAddress]]as const)for(const[key,label]of[['street','street'],['city','city'],['state','state'],['zip','ZIP']]as const)await enter(page,prefix+' '+label,a[key]);
}
async function confirmSchool(page:Page,id:string){await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();await expect.poll(async()=>(await stateData(page,id)).ohioSchoolDistrict?.sourceFactsConfirmed).toBe(true);}
async function confirmHeader(page:Page,id:string){await page.getByRole('button',{name:headerConfirm,exact:true}).click();await expect.poll(async()=>(await stateData(page,id)).ohioReturnHeaderSources?.sourceFactsConfirmed).toBe(true);}
async function results(page:Page,c:SchoolPyPaperCase){const school=page.getByRole('region',{name:'School district return review',exact:true});await expect(school).toHaveCount(1);for(const[label,value]of[['School district earned income','$40,000'],['School district tax','$500'],['School district withholding',c.withheld==='600'?'$600':'$500'],['Calculated school district refund',c.refund==='100'?'$100':'$0'],['School district balance due','$0']]){const row=school.getByText(label,{exact:true}).locator('..');await expect(row).toHaveCount(1);await expect(row.locator('.guided-ticker-breakdown-value')).toHaveText(value);}const it=page.getByText('Ohio IT1040 Payments',{exact:true}).locator('..').filter({visible:true});await expect(it).toHaveCount(1);await expect(it.locator('.guided-ticker-breakdown-value')).toHaveText('$2,000');await expect(school).toContainText('A calculated refund is not received cash.');await expect(school).toContainText(paperDisclosure);for(const secret of['900-74-0302','PRIVATE-','originalFederalSources','302 Fictional July District Lane'])await expect(school).not.toContainText(secret);}

const strictCombined=String.raw`
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject,ContentStream
import sys,json,re
file=Path(sys.argv[1]);plans=json.loads(sys.argv[2]);cells=json.loads(sys.argv[3]);private=json.loads(sys.argv[4]);strike_regions=json.loads(sys.argv[5]);statuses=json.loads(sys.argv[6]);reports={}
def mult(m,n):
 a,b,c,d,e,f=m;g,h,i,j,k,l=n
 return[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def painted(page,r):
 matrix=[1,0,0,1,0,0];stack=[];found=[];segments=[];pending=[];point=None;stroke=(0,0,0)
 def xy(x,y):
  a,b,c,d,e,f=matrix;return[a*float(x)+c*float(y)+e,b*float(x)+d*float(y)+f]
 for args,op in ContentStream(page['/Contents'],r).operations:
  if op==b'q':stack.append((matrix[:],stroke))
  elif op==b'Q':matrix,stroke=stack.pop()
  elif op==b'cm':matrix=mult(matrix,[float(v)for v in args])
  elif op==b'RG':stroke=tuple(float(v)for v in args)
  elif op==b'G':stroke=(float(args[0]),)*3
  elif op==b'm':point=xy(*args)
  elif op==b'l' and point is not None:
   end=xy(*args);pending.append((point,end));point=end
  elif op in [b'S',b's',b'B',b'B*',b'b',b'b*']:
   segments.extend((p,q,stroke)for p,q in pending);pending=[];point=None
  elif op in [b'n',b'f',b'f*']:pending=[];point=None
  elif op==b'Do':
   xo=page.get('/Resources',{}).get('/XObject',{}).get(args[0])
   if xo is None:continue
   xo=xo.get_object()
   if xo.get('/Subtype')!='/Form' or '/BBox'not in xo:continue
   m=mult(matrix,[float(v)for v in xo.get('/Matrix',[1,0,0,1,0,0])]);a,b,c,d,e,f=m;l,bt,rt,t=[float(v)for v in xo['/BBox']]
   pts=[(a*x+c*y+e,b*x+d*y+f)for x,y in[(l,bt),(l,t),(rt,bt),(rt,t)]];rect=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)]
   strings=[];ops=ContentStream(xo,r).operations;fill=(0,0,0);fillstack=[];ink=False
   for vals,operator in ops:
    if operator==b'q':fillstack.append(fill)
    elif operator==b'Q':fill=fillstack.pop()
    elif operator==b'rg':fill=tuple(float(v)for v in vals)
    elif operator==b'g':fill=(float(vals[0]),)*3
    elif operator==b'k':
     c,m,y,k=[float(v)for v in vals];fill=(1-min(1,c+k),1-min(1,m+k),1-min(1,y+k))
    elif operator in [b'f',b'f*',b'B',b'B*',b'b',b'b*'] and min(fill)<.95:ink=True
    if operator==b'Tj':strings.append(str(vals[0]))
    elif operator==b'TJ':strings.extend(str(v)for v in vals[0]if isinstance(v,str))
   found.append((rect,''.join(strings),ink or any(text.strip()for text in strings)))
 return found,segments

r=PdfReader(file,strict=True);assert not r.get_fields();assert '/AcroForm'not in r.trailer['/Root'];texts=[];objects=[]
for p in r.pages:
 assert all(a.get_object().get('/Subtype')!='/Widget'for a in p.get('/Annots',[]));text=p.extract_text()or'';assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1;texts.append(text)
def decode(v):
 if isinstance(v,bytes):
  for enc in['utf-8','latin1','utf-16-be','utf-16-le']:
   try:objects.append(v.decode(enc))
   except UnicodeError:pass
 elif isinstance(v,dict):
  for child in v.values():decode(child)
 elif isinstance(v,(list,tuple)):
  for child in v:decode(child)
 elif isinstance(v,str):objects.append(v)
ids={(gen,num)for gen,entries in r.xref.items()if gen!=65535 for num in entries if num};ids.update((0,num)for num in r.xref_objStm)
for gen,num in sorted(ids):
 obj=r.get_object(IndirectObject(num,gen,r));objects.append(str(obj));decode(obj)
 if isinstance(obj,dict):
  assert not any(k in obj for k in['/A','/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/EmbeddedFile','/FT']);assert obj.get('/S')not in['/JavaScript','/Launch','/GoToR','/SubmitForm','/ImportData'];assert obj.get('/Subtype')!='/Widget'
 if hasattr(obj,'get_data'):decode(obj.get_data())
rawbytes=file.read_bytes();decode(rawbytes)
for encoded in re.findall(rb'<([0-9A-Fa-f\s]{2,})>',rawbytes):
 try:decode(bytes.fromhex(re.sub(rb'\s',b'',encoded).decode('ascii')))
 except (ValueError,UnicodeError):pass
raw='\n'.join(objects+texts+[str(r.metadata)])
for marker in private:assert marker not in raw,('private source marker',marker)
assert not re.search(r'\b\d{3}-\d{2}-\d{4}\b',raw),'SSN format'
# Bind source-pinned official blocks by every actual appearance cell, not guessed packet offsets.
appearances={i:painted(p,r)for i,p in enumerate(r.pages)};occupied=set();total=0;status_count=0
for name,count in plans.items():
 expected=[c for c in cells if c['file']==name];matches=[]
 for offset in range(len(r.pages)-count+1):
  valid=True
  for c in expected:
   found=[t for rect,t,ink in appearances[offset+c['page']-1][0]if all(abs(a-b)<.02 for a,b in zip(rect,c['rect']))]
   if len(found)!=1 or found[0].replace(',','').strip()!=c['value']:valid=False;break
  if valid:matches.append(offset)
 assert len(matches)==1,(name,'unique source-pinned saved page block',matches)
 offset=matches[0];indices=set(range(offset,offset+count));assert not occupied.intersection(indices);occupied.update(indices)
 for i in indices:assert texts[i].count('FOR REVIEW ONLY - NOT FOR FILING')==1
 for status in statuses:
  if status['file']!=name:continue
  found=[ink for rect,t,ink in appearances[offset+status['page']-1][0]if all(abs(a-b)<.02 for a,b in zip(rect,status['rect']))]
  if status.get('blankOnly'):assert not any(found),(name,'blank status visibly selected',status,found)
  elif status['selected']:assert found==[True],(name,'actual source selected status',status,found)
  else:assert found in([], [False]),(name,'actual source unchecked status',status,found)
  status_count+=1
 if name=='oh-it-nrc-review.pdf':
  marks,segments=appearances[offset+2]
  for region in strike_regions:
   left,bottom,right,top=region['rect'];assert any(min(p[0],q[0])<=left+1 and max(p[0],q[0])>=right-1 and bottom<=p[1]<=top and bottom<=q[1]<=top and max(color)<.2 for p,q,color in segments),('source weight strike',region)
  assert texts[offset+2].count('.20')>=2 and '.60'in texts[offset+2]
 reports[name]={'pages':count,'cells':len(expected),'actualPageNumbers':[i+1 for i in sorted(indices)]};total+=len(expected)
assert total==165;assert status_count==22;assert len(occupied)==4
assert 'REFERENCE SUMMARY ONLY'in'\n'.join(texts)
assert 'not-validated'in'\n'.join(texts).lower()
print(json.dumps({'pages':len(r.pages),'objects':len(ids),'texts':texts,'official':reports,'sourceCells':total,'sourceStatuses':status_count}))
`;


async function reviewDownload(page:Page,info:TestInfo,c:SchoolPyPaperCase){const button=page.getByRole('button',{name:'Download Review PDF',exact:true});await expect(button).toHaveCount(1);const endpoint=new URL('/api/workspace/filled-return',page.url()).href;const responsePromise=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='POST'),downloadPromise=page.waitForEvent('download');await button.click();const response=await responsePromise;expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('application/pdf');expect(response.headers()['x-tax-engine-export-purpose']).toBe('review');expect(response.headers()['cache-control']).toContain('no-store');const included=required(response.headers()['x-tax-engine-included-forms']).split(',');expect(included.filter(n=>Object.hasOwn(schoolPyPlans,n)).sort()).toEqual(Object.keys(schoolPyPlans).sort());expect(included).not.toContain('oh-it-1040-review.pdf');for(const name of['f1040-filled.pdf','oh-it-1040-reference.pdf','oh-it-nrc-reference.pdf'])expect(included).toContain(name);const download=await downloadPromise,file=info.outputPath('actual-py-school-review.pdf');await download.saveAs(file);const bytes=await readFile(file);expect(bytes).toEqual(await response.body());const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictCombined,file,JSON.stringify(schoolPyPlans),JSON.stringify(schoolPyPaperCells(c)),JSON.stringify(['900-74-0302','900740302','302 Fictional July District Lane','302 FICTIONAL JULY DISTRICT LANE','PRIVATE-','FICTIONAL-SUPPLIED-2025-HILLSDALE-LOOKUP-ORIGINAL','originalFederalSources','confirmedHeaderSources','partYearWageSources']),JSON.stringify([]),JSON.stringify(schoolPyStatuses)],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024}))as{pages:number;sourceCells:number;sourceStatuses:number};expect(report.sourceCells).toBe(165);expect(report.sourceStatuses).toBe(22);await writeFile(info.outputPath('actual-py-school-pdf-report.json'),JSON.stringify({case:c.name,included,sha256:createHash('sha256').update(bytes).digest('hex'),purpose:'review',filingQualified:false,...report},null,2));return endpoint;}
for(const viewport of[{width:1280,height:900},{width:390,height:844}])for(const c of schoolPyPaperCases)test.describe(`PY school ${c.name} at ${viewport.width}px`,()=>{
 test('originates dated school and header originals through actual review and saved reopen',async({page},info)=>{
  await page.setViewportSize(viewport);const errors:string[]=[],consoleErrors:string[]=[],requests:Array<{url:string;method:string;body:string}>=[],downloads:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()??''}));page.on('download',d=>downloads.push(d.suggestedFilename()));
  const{id,packet,original,initial}=await seedFederalOnly(page,c),active=page.locator('.guided-section-transition');for(const key of['ohioResidency','ohioPayments','ohioSchoolDistrict','ohioReturnHeaderSources'])expect(await stateData(page,id)).not.toHaveProperty(key);await geometry(page,info,'initial',active,active.getByRole('heading',{name:'Ohio State Return',exact:true}));
  await enterParents(page,packet,id);expect((await stateData(page,id)).ohioResidency?.owners[0]?.periods).toEqual([{from:'2025-01-01',to:'2025-07-31',domicileState:'OH'},{from:'2025-08-01',to:'2025-12-31',domicileState:'VA'}]);expect((await stateData(page,id)).ohioPayments?.paymentRows).toEqual([]);
  await page.getByRole('button',{name:'Add actual Ohio school district source facts',exact:true}).click();const school=page.getByRole('region',{name:'Ohio school district actual source facts',exact:true});await expect(school).toContainText('actual Ashland County / Hillsdale (0302) header originals');await expect(school).toContainText('Part-year sources without that header and broader methods have no qualified paper packet. Filing remains unavailable.');await expect(control(page,'School district source year')).toHaveValue('');expect(required((await stateData(page,id)).ohioSchoolDistrict).sourceFactsConfirmed).toBeNull();await school.getByRole('button',{name:sdConfirmLabel,exact:true}).click();expect(required((await stateData(page,id)).ohioSchoolDistrict).sourceFactsConfirmed).toBeNull();expect(required((await stateData(page,id)).ohioSchoolDistrict).originalFederalSources).toBeUndefined();await validationReadability(page,info,'school-blank-validation',school);await geometry(page,info,'school-blank-validation',school,school.getByRole('button',{name:sdConfirmLabel,exact:true}));
  await enterSchool(page,packet);await expect(control(page,'Part-year payroll 1 original SSN')).toHaveAttribute('type','password');expect(required((await stateData(page,id)).ohioSchoolDistrict).sourceFactsConfirmed).toBeNull();await geometry(page,info,'school-entered',school,control(page,'Part-year payroll 2 paid on'));await confirmSchool(page,id);await results(page,c);const confirmedSchool=structuredClone(required((await stateData(page,id)).ohioSchoolDistrict));expect(confirmedSchool.originalFederalSources).toEqual(JSON.parse(JSON.stringify(original)));expect(confirmedSchool.partYearWageSources?.payrollOriginals.map(p=>p.grossWages)).toEqual(['40000','20000']);expect(confirmedSchool.payments.account.estimatedPaymentsCredited).toBe('0');expect(confirmedSchool.payments.account.priorCreditApplied).toBe('0');await geometry(page,info,'school-confirmed',school,page.getByRole('button',{name:sdConfirmLabel,exact:true}));
  await page.getByRole('button',{name:'Add actual Ohio resident return header sources',exact:true}).click();const header=active.locator('.guided-card').filter({has:page.getByRole('heading',{name:'Ohio resident return header originals',exact:true})});for(const label of['Header source tax year','Header original SSN','Actual school district number','Actual county name'])await expect(control(page,label)).toHaveValue('');await header.getByRole('button',{name:headerConfirm,exact:true}).click();expect(required((await stateData(page,id)).ohioReturnHeaderSources).sourceFactsConfirmed).toBeNull();expect(required((await stateData(page,id)).ohioReturnHeaderSources).confirmedHeaderSources).toBeUndefined();await validationReadability(page,info,'header-blank-validation',header);await geometry(page,info,'header-blank-validation',header,header.getByRole('button',{name:headerConfirm,exact:true}));await enterHeader(page,packet.header);await confirmHeader(page,id);const confirmedHeader=structuredClone(required((await stateData(page,id)).ohioReturnHeaderSources));expect(confirmedHeader.originalFederalSources).toEqual(JSON.parse(JSON.stringify(original)));expect(confirmedHeader.confirmedHeaderSources).toHaveProperty('countyOriginal.countyName','Ashland');expect(confirmedHeader.confirmedHeaderSources).toHaveProperty('residence.originalAddress.street','302 Fictional July District Lane');expect(original.taxpayer.address.state).toBe('VA');await geometry(page,info,'header-confirmed',header,page.getByRole('button',{name:headerConfirm,exact:true}));
  const changed='PRIVATE-PY-SCHOOL-SAME-CASH-RECONFIRMED';await enter(page,'School account reference',changed);const pending=structuredClone(required((await stateData(page,id)).ohioSchoolDistrict));expect(pending.sourceFactsConfirmed).toBeNull();expect(pending.originalFederalSources).toEqual(confirmedSchool.originalFederalSources);expect(pending.payments.account).toEqual({...confirmedSchool.payments.account,sourceReference:changed});expect(pending.partYearWageSources).toEqual(confirmedSchool.partYearWageSources);expect((await stateData(page,id)).ohioReturnHeaderSources).toEqual({...confirmedHeader,sourceFactsConfirmed:null});await expect(page.getByRole('region',{name:'School district return review',exact:true})).toHaveCount(0);await geometry(page,info,'same-cash-source-pending',school,control(page,'School account reference'));await page.reload();expect((await stateData(page,id)).ohioSchoolDistrict).toEqual(pending);await confirmSchool(page,id);await confirmHeader(page,id);await results(page,c);
  const beforeUnknown=structuredClone(await stateData(page,id));await enter(page,'Part-year payroll 1 gross wages','');const unknown=structuredClone(await stateData(page,id));expect(required(unknown.ohioSchoolDistrict).sourceFactsConfirmed).toBeNull();expect(required(unknown.ohioSchoolDistrict).partYearWageSources?.payrollOriginals[0]?.grossWages).toBe('');expect(required(unknown.ohioSchoolDistrict).originalFederalSources).toEqual(beforeUnknown.ohioSchoolDistrict?.originalFederalSources);expect(unknown.ohioReturnHeaderSources).toEqual({...beforeUnknown.ohioReturnHeaderSources,sourceFactsConfirmed:null});await school.getByRole('button',{name:sdConfirmLabel,exact:true}).click();expect(required((await stateData(page,id)).ohioSchoolDistrict).sourceFactsConfirmed).toBeNull();await expect(page.getByRole('region',{name:'School district return review',exact:true})).toHaveCount(0);await geometry(page,info,'unknown-payroll',school,control(page,'Part-year payroll 1 gross wages'));await page.reload();expect(await stateData(page,id)).toEqual(unknown);await expect(control(page,'Part-year payroll 1 gross wages')).toHaveValue('');await geometry(page,info,'saved-unknown-payroll',school,control(page,'Part-year payroll 1 gross wages'));await enter(page,'Part-year payroll 1 gross wages','40000');await confirmSchool(page,id);await confirmHeader(page,id);await results(page,c);const final=structuredClone(await stateData(page,id));expect(final.ohioPayments).toEqual(beforeUnknown.ohioPayments);expect(final.ohioResidency).toEqual(beforeUnknown.ohioResidency);
  await page.goto('/');await page.getByRole('link',{name:`Continue tax return ${id}`,exact:true}).click();expect(await stateData(page,id)).toEqual(final);expect((await saved(page,id)).sectionData['income-w2']).toEqual(initial.sectionData['income-w2']);await results(page,c);await geometry(page,info,'reopened',school,page.getByRole('button',{name:sdConfirmLabel,exact:true}));await page.locator('.guided-nav').getByRole('button',{name:'Continue',exact:true}).click();await page.locator('.guided-nav').getByRole('button',{name:'Open Full Return',exact:true}).click();await expect(page.locator('.guided-interview-shell')).toHaveCount(0);const button=page.getByRole('button',{name:'Download Review PDF',exact:true});await geometry(page,info,'public-review',button.locator('xpath=ancestor::section[1]'),button);const endpoint=await reviewDownload(page,info,c);expect(downloads).toHaveLength(1);
  const payload=await page.evaluate(id=>({workspace:JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces[id],guidedFlowState:JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),purpose:'filing'}),id);const filing=await page.request.post(endpoint,{data:payload});expect(filing.status()).toBe(400);expect(await filing.json()).toEqual({error:'Filing exports are not qualified. Only review downloads are available.'});expect(downloads).toHaveLength(1);expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);for(const request of requests){if(request.url===endpoint&&request.method==='POST')continue;for(const secret of['900-74-0302','900740302','PRIVATE-','302 Fictional July District Lane','91-7400302'])expect(request.url+'\n'+request.body).not.toContain(secret);}expect(requests.filter(r=>r.url===endpoint&&r.method==='POST')).toHaveLength(1);expect(requests.some(r=>/thefinder\.tax\.ohio\.gov|api\.stripe\.com|api\.openai\.com/i.test(r.url))).toBe(false);
  await page.goto('/');const remove=page.getByRole('button',{name:`Delete tax return ${id}`,exact:true});await expect(remove).toHaveCount(1);await geometry(page,info,'delete',remove.locator('xpath=ancestor::li[1]'),remove);await remove.click();await expect(remove).toHaveCount(0);expect(await page.evaluate(id=>({workspace:JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]??null,guided:localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)}),id)).toEqual({workspace:null,guided:null});
 });
});
