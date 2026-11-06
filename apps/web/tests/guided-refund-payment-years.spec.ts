// Spec: spec/federal/guided-refund-payment-years-browser.yaml. Prospective source journeys only.
import { expect, test, type Page } from '@playwright/test';
import { refundPaymentBrowserFixture, refundStatementAnswers, refundHistoryAnswers, refundBrowserReplacementReference, refundPaymentBrowserPrivateMarkers, refundPaymentBrowserContainsPrivate } from '../../../tests/fixtures/guided-refund-payment-years-browser';
import type { GuidedFlowState } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '../../../src/models/inputs';
import { calculateTaxableStateRefundRecoveries } from '../../../src/engine/forms/taxable-state-refund-recoveries';
import { calculateStateLocalIncomeTaxDeduction } from '../../../src/engine/forms/state-local-income-tax-deduction';
const scopes=[['filledReturn',/^\/api\/workspace\/filled-return\/?$/u],['provider',/^\/api\/provider(?:\/.*)?$/u],['businessExpenseAnalysis',/^\/api\/business-expense-analysis\/?$/u],['selfEmploymentIncomeAnalysis',/^\/api\/self-employment-income-analysis\/?$/u]]as const;
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Missing actual saved original fact');return value;}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
const data=(state:GuidedFlowState)=>required(state.sectionData['income-unemployment']);
const collection=(state:GuidedFlowState)=>required(data(state).refundRecoveries);
function control(page:Page,label:string){return page.locator('label').getByText(label,{exact:true}).locator('..').locator('input,select');}
async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
function expectLiteralRecovery(state:GuidedFlowState){
 const before=JSON.stringify(state),input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),result=calculateTaxableStateRefundRecoveries(input);
 expect(result.taxableRefund.toFixed()).toBe('300');expect(result.currentYearRefund.toFixed()).toBe('100');expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe('900');
 expect(input.form1099G?.[0].refundPaymentBasis?.payments?.[3].currentYearPayment).toEqual({collection:'estimatedTaxPayments',index:0});
 expect(input.taxableRefundWorksheet).toBeUndefined();expect(JSON.stringify(state)).toBe(before);
}
for(const width of [1280,390])test.describe(`Visible dated refund originals at ${width}px`,()=>{
 test('collects actual dated refund originals and preserves source-bound recovery',async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const errors:string[]=[],downloads:string[]=[],requests:Array<{url:string;body:string}>=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>requests.push({url:request.url(),body:request.postData()??''}));page.on('download',download=>downloads.push(download.suggestedFilename()));
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);const id=required(new URL(page.url()).pathname.split('/').at(-1));
  await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  const {initial,basis,collection:answers}=refundPaymentBrowserFixture();expect(initial.sectionData['income-unemployment']).toBeUndefined();
  // Sole pre-entry setup: unrelated household/W2/deductions/current estimated-payment
  // originals only. No target statement, historical worksheet, snapshot or result.
  await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state:initial});
  await page.reload();await expect(page.getByRole('heading',{name:'Government Payments',exact:true})).toBeVisible();
  await expect(control(page,'Government statement reference (local label or last four account digits)')).toHaveValue('');
  expect((await saved(page,id)).sectionData['income-unemployment']?.refundRecoveries).toBeUndefined();
  for(const[label,value]of refundStatementAnswers())await enter(page,label,value);
  await page.getByText('Refund payments made in different years',{exact:true}).click();
  await page.getByRole('button',{name:'Add mixed-payment-year refund collection',exact:true}).click();
  await expect(control(page,'Recovery collection receipt year')).toHaveValue('');await expect(control(page,'All actual refund statements are included in this collection')).toHaveValue('');
  await page.getByRole('button',{name:'Add dated basis for statement 1',exact:true}).click();
  expect(required(data(await saved(page,id)).entries?.[0].refundPaymentBasis)).toEqual({});
  await enter(page,'Recovery collection receipt year','2025');await enter(page,'Recovery collection original reference',required(answers.sourceReference));await enter(page,'All actual refund statements are included in this collection','true');
  await enter(page,'Statement 1 payment ledger reference',required(basis.sourceReference));await enter(page,'Statement 1 actual refund receipt date',required(basis.receivedDate));await enter(page,'Statement 1 refunded state','PA');await enter(page,'Statement 1 complete original payment inventory','true');
  for(const[index,payment]of required(basis.payments).entries()){
   await page.getByRole('button',{name:'Add payment to statement 1',exact:true}).click();
   expect(required(data(await saved(page,id)).entries?.[0].refundPaymentBasis?.payments?.[index])).toEqual({});
   await enter(page,`Statement 1 payment ${index+1} original reference`,required(payment.sourceReference));await enter(page,`Statement 1 payment ${index+1} date paid`,required(payment.datePaid));await enter(page,`Statement 1 payment ${index+1} actual amount`,required(payment.amount));await enter(page,`Statement 1 payment ${index+1} is a current-year state estimated payment`,String(payment.currentYearStatePaymentConfirmed));
  }
  await enter(page,'Statement 1 payment basis checked after the last edit','true');await enter(page,'Have you checked this government-payment source after the last edit?','true');
  await page.getByRole('button',{name:'Add historical return',exact:true}).click();await expect(control(page,'Historical property taxes paid')).toHaveValue('');await expect(control(page,'Historical AMT')).toHaveValue('');
  for(const[label,value]of refundHistoryAnswers())await enter(page,label,value);
  await enter(page,'Historical return facts checked after the last edit','true');
  const beforeCapture=await saved(page,id);expect(collection(beforeCapture).originalSources).toBeUndefined();expect(buildTaxInputFromGuidedData(beforeCapture)).toBeNull();
  await page.getByRole('button',{name:'Capture current refund payment-year originals',exact:true}).click();await expect(page.locator('next-route-announcer #__next-route-announcer__')).toHaveCount(1);
  await expect(page.locator('#__next-route-announcer__')).toHaveCount(1);
  await expect(page.getByRole('alert').and(page.locator(':not(#__next-route-announcer__)'))).toHaveCount(0);
  const captured=structuredClone(required(collection(await saved(page,id)).originalSources));await enter(page,'Refund payment-year collection checked after the last edit','true');
  const current=await saved(page,id);expectLiteralRecovery(current);expect(collection(current).originalSources).toEqual(captured);
  const noOp=control(page,'Statement 1 payment 1 actual amount');await noOp.focus();await noOp.press('Tab');expect(data(await saved(page,id))).toEqual(data(current));
  await page.reload();await page.getByText('Refund payments made in different years',{exact:true}).click();expect(data(await saved(page,id))).toEqual(data(current));await expect(control(page,'Refund payment-year collection checked after the last edit')).toHaveValue('true');expectLiteralRecovery(await saved(page,id));
  await enter(page,'Statement 1 payment 1 original reference',refundBrowserReplacementReference);
  const stale=await saved(page,id);expect(collection(stale).sourceFactsConfirmed).toBeNull();expect(collection(stale).originalSources).toEqual(captured);expect(data(stale).entries?.[0].refundPaymentBasis?.payments?.[0].amount).toBe('1000');expect(buildTaxInputFromGuidedData(stale)).toBeNull();
  await enter(page,'Refund payment-year collection checked after the last edit','true');expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();expect(collection(await saved(page,id)).originalSources).toEqual(captured);
  await enter(page,'Statement 1 payment basis checked after the last edit','true');await enter(page,'Have you checked this government-payment source after the last edit?','true');
  await page.getByRole('button',{name:'Capture current refund payment-year originals',exact:true}).click();await enter(page,'Refund payment-year collection checked after the last edit','true');const recaptured=await saved(page,id);expectLiteralRecovery(recaptured);expect(collection(recaptured).originalSources).not.toEqual(captured);
  await enter(page,'Historical property taxes paid','');const unknown=await saved(page,id);expect(collection(unknown).years?.[0].priorYearPropertyTaxesPaid).toBe('');expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  await page.reload();await page.getByText('Refund payments made in different years',{exact:true}).click();await expect(control(page,'Historical property taxes paid')).toHaveValue('');expect(collection(await saved(page,id)).originalSources).toEqual(collection(recaptured).originalSources);
  await enter(page,'Historical property taxes paid','0');await enter(page,'Historical return facts checked after the last edit','true');await page.getByRole('button',{name:'Capture current refund payment-year originals',exact:true}).click();await enter(page,'Refund payment-year collection checked after the last edit','true');const final=await saved(page,id);expectLiteralRecovery(final);
  const geometry=await control(page,'Recovery collection receipt year').locator('xpath=ancestor::details').evaluate(root=>({documentWidth:document.documentElement.scrollWidth,issues:[root,...root.querySelectorAll('label,input,select,button,fieldset')].flatMap(node=>{const r=node.getBoundingClientRect();return !r.width||!r.height||getComputedStyle(node).visibility==='hidden'||r.left>=-1&&r.right<=innerWidth+1?[]:[{tag:node.tagName,left:r.left,right:r.right}];})}));
  expect(geometry.documentWidth).toBeLessThanOrEqual(width);expect(geometry.issues).toEqual([]);await info.attach('refund-payment-original-control-geometry.json',{body:JSON.stringify(geometry),contentType:'application/json'});await page.screenshot({path:info.outputPath('refund-payment-originals.png')});
  await page.goto('/');await page.goto(`/returns/${id}`);await page.getByText('Refund payments made in different years',{exact:true}).click();expect(data(await saved(page,id))).toEqual(data(final));expectLiteralRecovery(await saved(page,id));
  const counts=Object.fromEntries(scopes.map(([name,pattern])=>[name,requests.filter(request=>pattern.test(new URL(request.url).pathname)).length]));expect(counts).toEqual({filledReturn:0,provider:0,businessExpenseAnalysis:0,selfEmploymentIncomeAnalysis:0});expect(refundPaymentBrowserPrivateMarkers.length).toBeGreaterThan(0);expect(requests.some(request=>refundPaymentBrowserContainsPrivate(request.url)||refundPaymentBrowserContainsPrivate(request.body))).toBe(false);expect(errors).toEqual([]);expect(downloads).toEqual([]);
  await info.attach('refund-payment-request-counts.json',{body:JSON.stringify(counts),contentType:'application/json'});
 });
});
