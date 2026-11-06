// Spec: spec/state/pa-married-payment-native-browser.yaml. No target source injection after entry.
import { nativeControlTag } from './helpers/native-control-snapshot';
import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {paMarriedPaymentNativeBrowserFixture} from '../../../tests/fixtures/pa-married-payment-native-browser';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '../src/lib/guided-state-engine-inputs';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculatePAMarriedOrdinaryReturn} from '../../../src/engine/state/pa-married-ordinary-return';

function required<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error('Explicit actual synthetic source required');return value;}
function control(page:Page,label:string){return page.getByRole('textbox',{name:label,exact:true}).or(page.getByRole('combobox',{name:label,exact:true}));}
async function enter(page:Page,label:string,value:string){const field=control(page,label);const tagName=await nativeControlTag(field);if(tagName==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
function source(state:GuidedFlowState){return required(state.sectionData['state-return']?.paMarriedOrdinarySources);}
async function assertResults(page:Page,state:GuidedFlowState){
 const actual=source(state),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),bound=buildGuidedStateOriginals(input,state);
 expect(bound.paMarriedOrdinarySources).toEqual(actual);
 const result=calculatePAMarriedOrdinaryReturn(input,actual);
 expect(result.returns.map(row=>[row.pa40.creditFromPriorYear.toString(),row.pa40.estimatedPayments.toString(),row.pa40.extensionPayment.toString(),row.pa40.netOverpayment.toString()])).toEqual([['51','200','76','327'],['0','80','0','80']]);
 expect(result.readiness.filingEligible).toBe(false);
 const returns=page.locator('.guided-section-transition').getByRole('region',{name:'Pennsylvania separate returns',exact:true});await expect(returns).toHaveCount(1);
 for(const[owner,tax,payments,refund]of [['Primary','$1,535','$1,862','$327'],['Spouse','$921','$1,001','$80']]){
  const article=returns.getByRole('article',{name:`${owner} PA return`,exact:true});await expect(article).toHaveCount(1);
  for(const[label,value]of [['Tax before credits',tax],['Payments',payments],['Requested refund',refund],['Amount due','$0']])await expect(article.getByText(label,{exact:true}).locator('xpath=following-sibling::dd[1]')).toHaveText(value);
 }
}
async function capture(page:Page,info:TestInfo,width:number){
 const panel=page.getByRole('region',{name:'Actual separate PA payment accounts',exact:true}),anchor=control(page,'Payment account 1 receipt 1 original amount');
 await anchor.scrollIntoViewIfNeeded();await expect(anchor).toBeVisible();
 const geometry=await panel.evaluate(root=>({documentWidth:document.documentElement.scrollWidth,issues:[root,...root.querySelectorAll('label,input,select,button,fieldset')].flatMap(node=>{const r=node.getBoundingClientRect();return !r.width||!r.height||getComputedStyle(node).visibility==='hidden'||r.left>=-1&&r.right<=innerWidth+1?[]:[{tag:node.tagName,left:r.left,right:r.right}];})}));
 expect(geometry.documentWidth).toBeLessThanOrEqual(width);expect(geometry.issues).toEqual([]);
 await info.attach('actual-payment-control-geometry.json',{body:JSON.stringify(geometry),contentType:'application/json'});await page.screenshot({path:info.outputPath('actual-payment-source-capture.png')});
}
const protectedScopes=[['filledReturn',/^\/api\/workspace\/filled-return\/?$/u],['provider',/^\/api\/provider(?:\/.*)?$/u],['businessExpenseAnalysis',/^\/api\/business-expense-analysis\/?$/u],['selfEmploymentIncomeAnalysis',/^\/api\/self-employment-income-analysis\/?$/u]]as const;
const editReference='fictional-browser-payment-private-same-cash-new-receipt-reference';
for(const width of [1280,390])test.describe(`Native separate PA payment originals at ${width}px`,()=>{
 test('originates separate payment accounts and preserves current owned refunds through reopen and source edit',async({page},info)=>{
  await page.setViewportSize({width,height:900});const errors:string[]=[],requests:Array<{url:string;body:string}>=[],downloads:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push({url:r.url(),body:r.postData()??''}));page.on('download',d=>downloads.push(d.suggestedFilename()));
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);
  const id=required(new URL(page.url()).pathname.split('/').at(-1));await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  const f=paMarriedPaymentNativeBrowserFixture(),route=buildSectionRoute(f.state.segmentation),index=route.findIndex(row=>row.id==='state-return');expect(index).toBeGreaterThanOrEqual(0);
  f.state.phase='interview';f.state.currentSectionIndex=index;f.state.completedSections=route.slice(0,index).map(row=>row.id);
  expect(source(f.state).paymentSources).toBeUndefined();expect(source(f.state).sourceFactsConfirmed).toBeNull();
  expect(source(f.state).owners.map(row=>[row.payments.originalReceipts,row.payments.estimatedPaymentsStatus,row.payments.extensionPaymentsStatus,row.payments.priorCreditStatus,row.payments.priorReturnStatus])).toEqual([[[],'','','',''],[[],'','','','']]);
  // The sole setup write contains unrelated complete household originals only.
  // Every target account, posted row, receipt and prior-election answer below
  // originates through visible controls; no later storage/source injection.
  await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state:f.state});await page.reload();
  expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state)),f.state)).toThrow();
  const panel=page.getByRole('region',{name:'Actual separate PA payment accounts',exact:true});await panel.getByRole('button',{name:'Add actual separate PA payment accounts',exact:true}).click();
  expect(source(await saved(page,id)).paymentSources).toEqual({sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,accounts:[]});
  await expect(control(page,'Separate PA payment source tax year')).toHaveValue('');await enter(page,'Separate PA payment source tax year','2025');await enter(page,'Separate PA payment collection source reference',f.target.sourceReference);
  for(const[i,account]of f.target.accounts.entries()){
   const prefix=`Payment account ${i+1}`,tag=account.accountHolder==='primary'?'Primary':'Spouse';await panel.getByRole('button',{name:`Add ${account.accountHolder} actual payment account`,exact:true}).click();
   const blank=required(source(await saved(page,id)).paymentSources).accounts[i];expect(blank.originalAccount).toMatchObject({accountName:'',accountSsn:'',taxYear:null,availablePriorCredit:'',receipts:[],allPaymentsCompleteConfirmed:null});expect(blank.receipts).toEqual([]);expect(blank.priorCredit).toEqual({status:'',sourceReference:''});
   await enter(page,prefix+' actual owner',account.accountHolder);await enter(page,prefix+' original source reference',account.sourceReference);
   for(const key of ['accountName','accountSsn','returnType','filingStatus','accountKind','asOfDate','availablePriorCredit']as const)await enter(page,prefix+' printed '+key,account.originalAccount[key]);
   await enter(page,prefix+' printed taxYear','2025');await enter(page,prefix+' prior credit applied date or no date',account.originalAccount.priorCreditAppliedOn??'');
   await enter(page,prefix+' complete account checked','true');await enter(page,prefix+' no transfers offsets refunds or adjustments checked','true');
   for(const[n,row]of account.originalAccount.receipts.entries()){
    await panel.getByRole('button',{name:`Add ${prefix} posted original receipt row`,exact:true}).click();for(const[key,value]of Object.entries(row))await enter(page,`${prefix} posted row ${n+1} ${key}`,String(value));
   }
   for(const[n,row]of account.receipts.entries()){
    await panel.getByRole('button',{name:`Add ${prefix} actual payment receipt`,exact:true}).click();await enter(page,`${prefix} receipt ${n+1} source reference`,row.sourceReference);
    await enter(page,`${prefix} receipt ${n+1} intended installment`,row.intendedInstallment===null?'':String(row.intendedInstallment));
    for(const[key,value]of Object.entries(row.original))await enter(page,`${prefix} receipt ${n+1} original ${key}`,String(value));
   }
   await enter(page,prefix+' prior credit status',account.priorCredit.status);await enter(page,prefix+' prior credit source reference',account.priorCredit.sourceReference);
   if(account.priorCredit.originalPriorReturn){await panel.getByRole('button',{name:`Add ${prefix} original prior return election`,exact:true}).click();for(const[key,value]of Object.entries(account.priorCredit.originalPriorReturn))await enter(page,prefix+' prior original '+key,String(value));}
   const expected=required(f.expected.owners.find(row=>row.accountHolder===account.accountHolder)).payments;
   await enter(page,tag+' PA account original source reference',expected.sourceReference);await enter(page,tag+' all current PA payments reviewed','true');
   for(const[key,label]of [['estimatedPaymentsStatus','estimated payment history'],['extensionPaymentsStatus','extension payment history'],['priorCreditStatus','prior credit history'],['priorReturnStatus','prior return history']]as const)await enter(page,tag+' actual '+label,expected[key]);
   await enter(page,tag+' prior return original source reference',expected.priorReturnSourceReference);
   expect(required(source(await saved(page,id)).owners.find(row=>row.accountHolder===account.accountHolder)).payments.originalReceipts).toEqual([]);
   const printedBefore=structuredClone(required(source(await saved(page,id)).paymentSources).accounts[i].originalAccount);
   await panel.getByRole('button',{name:`Capture ${prefix} reviewed original receipts`,exact:true}).click();
   const captured=source(await saved(page,id));expect(required(captured.owners.find(row=>row.accountHolder===account.accountHolder)).payments.originalReceipts).toEqual(account.receipts.map(row=>row.original));expect(required(captured.paymentSources).accounts[i].originalAccount).toEqual(printedBefore);expect(captured.sourceFactsConfirmed).toBeNull();
  }
  for(const[label,value]of [['Married PA timing original source reference',f.expected.timing.sourceReference],['Married PA actual as of date','2026-04-15'],['Married PA actual filing extension','actual_extension']])await enter(page,label,value);
  for(const row of f.expected.dispositions){const tag=row.accountHolder==='primary'?'Primary':'Spouse';for(const[label,value]of [['election original source reference',row.sourceReference],['actual requested refund',row.refundRequested],['actual requested next year credit','0'],['actual remaining payment source','no_remaining_tax'],['remaining payment original source reference',row.remainingPayment.sourceReference]])await enter(page,tag+' '+label,value);}
  expect(source(await saved(page,id)).paymentSources).toEqual({...f.target,sourceFactsConfirmed:null});
  await panel.getByRole('button',{name:'Confirm actual separate PA payment accounts after the last edit',exact:true}).click();await expect.poll(async()=>required(source(await saved(page,id)).paymentSources).sourceFactsConfirmed).toBe(true);expect(source(await saved(page,id)).sourceFactsConfirmed).toBeNull();
  await page.getByRole('button',{name:'Confirm actual married PA household sources after the last edit',exact:true}).click();await expect.poll(async()=>source(await saved(page,id)).sourceFactsConfirmed).toBe(true);
  const confirmed=structuredClone(source(await saved(page,id)));expect(confirmed).toEqual(f.expected);await assertResults(page,await saved(page,id));
  const amount=control(page,'Payment account 1 receipt 1 original amount');await amount.focus();await amount.press('Tab');expect(source(await saved(page,id))).toEqual(confirmed);await capture(page,info,width);
  await page.reload();expect(source(await saved(page,id))).toEqual(confirmed);await assertResults(page,await saved(page,id));
  await enter(page,'Payment account 1 receipt 1 source reference',editReference);const stale=source(await saved(page,id));expect(stale.sourceFactsConfirmed).toBeNull();expect(required(stale.paymentSources).sourceFactsConfirmed).toBeNull();expect(stale.owners).toEqual(confirmed.owners);expect(stale.originalFederalSources).toEqual(confirmed.originalFederalSources);expect(required(stale.paymentSources).accounts[0].originalAccount).toEqual(required(confirmed.paymentSources).accounts[0].originalAccount);
  const staleState=await saved(page,id);expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(staleState)),staleState)).toThrow();
  await expect(page.locator('.guided-section-transition').getByRole('region',{name:'Pennsylvania separate returns',exact:true})).toHaveCount(0);
  await page.reload();expect(source(await saved(page,id))).toEqual(stale);
  await panel.getByRole('button',{name:'Confirm actual separate PA payment accounts after the last edit',exact:true}).click();await expect.poll(async()=>required(source(await saved(page,id)).paymentSources).sourceFactsConfirmed).toBe(true);
  await page.getByRole('button',{name:'Confirm actual married PA household sources after the last edit',exact:true}).click();await expect.poll(async()=>source(await saved(page,id)).sourceFactsConfirmed).toBe(true);await assertResults(page,await saved(page,id));
  const current=structuredClone(source(await saved(page,id)));expect(current.owners).toEqual(confirmed.owners);expect(current.originalFederalSources).toEqual(confirmed.originalFederalSources);
  await page.goto('/');await page.goto(`/returns/${id}`);expect(source(await saved(page,id))).toEqual(current);await expect(control(page,'Payment account 1 receipt 1 source reference')).toHaveValue(editReference);await assertResults(page,await saved(page,id));
  const privateMarkers=['fictional-browser-payment-private-',f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/gu,''),required(f.input.taxpayer.spouse).ssn,required(f.input.taxpayer.spouse).ssn.replace(/\D/gu,''),f.target.sourceReference,editReference,...f.target.accounts.flatMap(account=>[account.sourceReference,account.priorCredit.sourceReference,...account.receipts.flatMap(row=>[row.sourceReference,row.original.confirmationNumber])])];
  for(const request of requests)for(const marker of privateMarkers)expect(request.url+'\n'+request.body).not.toContain(marker);
  const counts=Object.fromEntries(protectedScopes.map(([name,match])=>[name,requests.filter(row=>match.test(new URL(row.url).pathname)).length]));expect(counts).toEqual({filledReturn:0,provider:0,businessExpenseAnalysis:0,selfEmploymentIncomeAnalysis:0});expect(downloads).toEqual([]);expect(errors).toEqual([]);
  await info.attach('payment-request-counts.json',{body:JSON.stringify({...counts,observed:requests.map(row=>new URL(row.url).pathname)}),contentType:'application/json'});
 });
});
