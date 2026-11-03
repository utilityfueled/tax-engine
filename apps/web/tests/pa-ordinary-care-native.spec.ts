// Spec: spec/state/pa-ordinary-care-native-browser.yaml.
import {expect,test,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {guidedPACareBrowserFixture} from '../../../tests/fixtures/guided-pa-care-browser';
import type {GuidedFlowState} from '../src/lib/guided-interview-flow';
function control(page:Page,label:string){return page.getByRole('textbox',{name:label,exact:true}).or(page.getByRole('combobox',{name:label,exact:true})).or(page.getByRole('spinbutton',{name:label,exact:true}));}
async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null')as GuidedFlowState,id);}
async function seedUnrelatedOriginals(page:Page){
 const f=guidedPACareBrowserFixture();await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
 const id=new URL(page.url()).pathname.split('/').at(-1);if(!id||id==='new')throw Error('Actual distinct local workspace required');
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
 // Single initial fictional general/federal summary and unrelated state-source seed;
 // actual provider/person and all PA care sources begin absent, never seeded later.
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state:f.state});await page.reload();return{f,id};
}
async function enterFederalProviderAndPerson(page:Page,f:ReturnType<typeof guidedPACareBrowserFixture>){
 const c=f.actual.input.dependentCare,p=c?.providers?.[0],q=c?.qualifyingPersons?.[0];if(!c||!p||!q)throw Error('Independent actual federal provider/person originals required');
 await page.getByRole('button',{name:'Add care provider',exact:true}).click();
 for(const[label,value]of [['Provider 1 name',p.name],['Provider 1 address',p.address],['Provider 1 identification status','tin'],['Provider 1 tax ID',p.taxId??''],['Was provider 1 your household employee?','false'],['Amount paid to provider 1','3,000']])await enter(page,label,value);
 await page.getByRole('button',{name:'Add qualifying person',exact:true}).click();
 for(const[label,value]of [['Qualifying person 1 first name',q.firstName],['Qualifying person 1 last name',q.lastName],['Qualifying person 1 identification status','tax_id'],['Qualifying person 1 tax ID',q.taxId??''],['Was person 1 over age 12 and incapable of self-care when care was provided?','false'],['Does person 1 meet the Form 2441 qualifying-person, residence and dependency requirements?','true'],['Qualified expenses for person 1','3,000'],['Have you checked these provider and qualifying-person details against your actual records?','true']])await enter(page,label,value);
}
async function enterPACare(page:Page,f:ReturnType<typeof guidedPACareBrowserFixture>){
 const care=f.actual.sources.care,m=care.originalCarePayments[0],packet=care.careSources,p=packet.payments[0],o=p.originalReceipt;
 await enter(page,'Care source status','actual_expenses');await enter(page,'Care original source reference',care.sourceReference);await enter(page,'All actual care payment sources reviewed','true');await enter(page,'All actual employer benefits included in source review','true');
 await page.getByRole('button',{name:'Add care payment original document',exact:true}).click();
 for(const[label,value]of [['original reference',m.sourceReference],['document name',m.documentName],['actual issuer name',m.issuerName],['actual printed tax year','2025'],['actual printed recipient name',m.recipientName],['actual printed recipient TIN',m.recipientTin],['actual printed record date',m.recordDate],['actual original document available and checked','true']])await enter(page,'Care payment original 1 '+label,value);
 await enter(page,'PA care source tax year','2025');await enter(page,'PA care collection original source reference',packet.sourceReference);await enter(page,'Actual federal care originals reviewed for this source collection','true');await page.getByRole('button',{name:'Capture reviewed current federal care originals',exact:true}).click();await page.getByRole('button',{name:'Add actual current care payment',exact:true}).click();
 await expect(control(page,'Care receipt 1 actual amount')).toHaveValue('');await expect(control(page,'Care receipt 1 actual provider')).toHaveValue('');
 for(const[label,value]of [['actual source reference',p.sourceReference],['actual provider','0'],['actual qualifying person','0'],['actual paid date',p.paidOn],['actual service from',p.serviceFrom],['actual service through',p.serviceThrough],['actual amount','3,000'],['original receipt number',o.receiptNumber],['original receipt date',o.date],['original receipt amount','3,000'],['original provider name',o.providerName],['original provider TIN',o.providerTin],['original qualifying person name',o.qualifyingPersonName],['original qualifying person TIN',o.qualifyingPersonTin],['actual original available and checked','true'],['actual employment-related expense checked','true'],['actual expense not claimed on another return checked','true']])await enter(page,'Care receipt 1 '+label,value);
}
const inspectSaved=String.raw`from pypdf import PdfReader
import json,sys,hashlib
r=PdfReader(sys.argv[1],strict=True);blank=PdfReader(sys.argv[2],strict=True)
texts=[p.extract_text() or '' for p in r.pages]
assert r.get_fields() is None,'public review packet must be flattened'
for p,t in zip(r.pages,texts):
 assert 'FOR REVIEW ONLY - NOT FOR FILING' in t
 for ref in p['/Annots'] if '/Annots' in p else []:
  a=ref.get_object();assert a is not None and a.get('/Subtype')!='/Widget'
alltext='\n'.join(texts);normalized=' '.join(alltext.split())
assert 'REFERENCE SUMMARY ONLY' in alltext
assert 'not an official PA Schedule DC filing copy' in normalized
for secret in ['900-70-0311','900700311','900-70-0312','900700312','Fictional actual care source collection','Fictional original current care receipt','Fictional care3000','Independent care3000 identity edited']:
 assert secret not in alltext and secret not in str(r.metadata),(secret,'private original leakage')
pages=[i for i,t in enumerate(texts) if '2500210055' in t];assert len(pages)==1,pages
expected={'23.Total Other Credits':'600','24. Total Payments and Credits':'3674','29. OVERPAYMENT':'600','30. Refund':'600'}
rects={}
for ref in blank.pages[1]['/Annots']:
 a=ref.get_object();names=[];node=a
 while node:
  if node.get('/T') is not None:names.append(str(node['/T']))
  link=node.get('/Parent');node=link.get_object() if link else None
 name='.'.join(reversed(names))
 if name in expected:rects[name]=[float(x) for x in a['/Rect']]
assert set(rects)==set(expected)
actual={k:[] for k in expected}
def visitor(text,cm,tm,font,size):
 for k,b in rects.items():
  if abs(cm[4]-b[0])<.02 and abs(cm[5]-b[1])<.02 and text.strip():actual[k].append(text.strip().replace(',',''))
r.pages[pages[0]].extract_text(visitor_text=visitor)
for k,v in expected.items():assert actual[k]==[v],(k,actual[k],v)
print(json.dumps({'sha256':hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest(),'pages':len(texts),'physicalPA40Cells':actual,'reviewNotices':len(texts),'widgets':0,'unresolvedAnnotations':0,'privateOriginalsPresent':False,'DCReferenceOnly':True}))`;
for(const viewport of[{width:1280,height:900},{width:390,height:844}])test.describe(`Native PA care at ${viewport.width}px`,()=>{
 test('enters actual care records confirms exports and reopens without inferred facts',async({page},testInfo)=>{
  test.setTimeout(240000);await page.setViewportSize(viewport);const errors:string[]=[],requests:Array<{url:string;body:string}>=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',r=>requests.push({url:r.url(),body:r.postData()??''}));
  const{f,id}=await seedUnrelatedOriginals(page);expect(await page.title()).not.toBe('');await expect(page.getByText('Child and Dependent Care Credit (Form 2441)',{exact:true})).toBeVisible();
  const start=(await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.care;expect(start?.status).toBe('unknown');expect(start?.originalCarePayments).toEqual([]);expect(start).not.toHaveProperty('careSources');
  await enterFederalProviderAndPerson(page,f);await page.locator('.guided-progress-step').filter({hasText:'State Return'}).click();
  await page.getByRole('button',{name:'Confirm all actual PA source records after the last edit',exact:true}).click();await page.getByRole('button',{name:'Confirm all actual PA return sources after the last edit',exact:true}).click();
  await page.getByRole('button',{name:'Add actual PA current care source records',exact:true}).click();await expect(control(page,'PA care source tax year')).toHaveValue('');
  await page.reload();await expect(control(page,'PA care source tax year')).toHaveValue('');expect((await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.care.careSources?.sourceFactsConfirmed).toBeNull();
  await control(page,'PA care source tax year').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('unknown-care.png')});
  await enterPACare(page,f);await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
  const stateHeader=page.getByText('Pennsylvania (PA)',{exact:true}).filter({visible:true});await expect(stateHeader).toHaveCount(0);
  await page.getByRole('button',{name:'Confirm actual PA care payment records after the last edit',exact:true}).click();await expect.poll(async()=>Boolean((await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.care.careSources?.sourceFactsConfirmed)).toBe(true);await expect(stateHeader).toHaveCount(0);
  await page.getByRole('button',{name:'Confirm actual PA completion sources after the last edit',exact:true}).click();await expect(stateHeader.first()).toBeVisible();
  const stateTax=page.locator('.guided-ticker-breakdown-row').filter({hasText:/^State Tax/}).filter({visible:true});await expect(stateTax.first()).toContainText('$2,474');await expect(page.locator('.guided-ticker-breakdown-row').filter({hasText:/^State Refund/}).filter({visible:true}).first()).toContainText('$600');
  const ready=(await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources;expect(ready?.care.careSources?.payments[0].amount).toBe('3000');expect(ready?.sourceFactsConfirmed).toBe(true);
  await control(page,'Care receipt 1 actual amount').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('confirmed-care.png')});
  await enter(page,'Care receipt 1 original receipt number','Independent care3000 identity edited');await expect(stateHeader).toHaveCount(0);
  const changed=(await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources;expect(changed?.care.careSources?.sourceFactsConfirmed).toBeNull();expect(changed?.sourceFactsConfirmed).toBeNull();expect(changed?.care.careSources?.payments[0].amount).toBe('3000');
  await page.reload();await expect(control(page,'Care receipt 1 original receipt number')).toHaveValue('Independent care3000 identity edited');expect((await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  await control(page,'Care receipt 1 original receipt number').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('same-cash-edit-needs-review.png')});
  await page.getByRole('button',{name:'Confirm actual PA care payment records after the last edit',exact:true}).click();await page.getByRole('button',{name:'Confirm actual PA completion sources after the last edit',exact:true}).click();
  const final=(await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources;expect(final?.sourceFactsConfirmed).toBe(true);expect(final?.care.careSources?.sourceFactsConfirmed).toBe(true);expect(final?.care.careSources?.originalDependentCare).toEqual(ready?.care.careSources?.originalDependentCare);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Open Full Return',exact:true}).click();
  const downloadReview=async(name:string)=>{const bundle=page.getByRole('region',{name:'Return Bundle',exact:true});const dl=page.waitForEvent('download'),response=page.waitForResponse(r=>r.url().endsWith('/api/workspace/filled-return'));await bundle.getByRole('button',{name:'Download Review PDF',exact:true}).click();expect((await response).status()).toBe(200);const output=testInfo.outputPath(name);await(await dl).saveAs(output);const inspection=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',inspectSaved,output,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../forms/blank/2025/pa-40.pdf')],{encoding:'utf8',timeout:15000}));await writeFile(output+'.inspection.json',JSON.stringify(inspection,null,2));return inspection;};
  const initialPDF=await downloadReview('actual-care-review.pdf');await page.goto('/');await page.goto(`/returns/${id}`);await expect(page.getByRole('region',{name:'Return Bundle',exact:true})).toBeVisible();
  const reopened=(await saved(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources;expect(reopened).toEqual(final);const reopenedPDF=await downloadReview('reopened-care-review.pdf');expect(reopenedPDF.physicalPA40Cells).toEqual(initialPDF.physicalPA40Cells);
  await page.screenshot({path:testInfo.outputPath('reopened-care-workspace.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  const secrets=['900-70-0311','900-70-0312','Fictional actual care source collection','Fictional care3000','Independent care3000 identity edited'];const origin=new URL(page.url()).origin;
  for(const request of requests)for(const secret of secrets){expect(request.url).not.toContain(secret);if(request.body.includes(secret)){expect(new URL(request.url).origin).toBe(origin);expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');}}
  await writeFile(testInfo.outputPath('journey-receipt.json'),JSON.stringify({id,viewport,sourceScope:'Only unrelated factual originals seeded once; actual provider/person and PA care records typed',actualCare:'3000',expectedCredit:'600',expectedPATax:'3074',initialPDF,reopenedPDF,privateSourceDigest:createHash('sha256').update(JSON.stringify(final)).digest('hex'),requestCount:requests.length,errors},null,2));
 });
});
