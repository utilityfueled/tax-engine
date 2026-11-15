// Spec: state/oh-sd-100-guided-remaining-balance.yaml. Only new payment evidence is originated visibly.
import {expect,test,type Page} from '@playwright/test';
import {guidedSchoolBalanceFixture,balanceVisibleFields} from '../../../tests/fixtures/guided-oh-sd-100-remaining-balance';
import {required,sdConfirmLabel} from '../../../tests/fixtures/guided-oh-school-district-complete';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '../src/lib/guided-state-engine-inputs';
import {calculateFederalTax} from '../../../src/engine/federal';
import {calculateOhioResidentReturn} from '../../../src/engine/state/oh-return';
import {buildOhioResidentReturnInput} from '../../../src/engine/state/oh-input-adapter';
import {TaxYearInputSchema} from '../../../src/models/inputs';
async function entered(page:Page,label:string,value:string){const field=page.locator('label').filter({has:page.getByText(label,{exact:true})}).locator('input,select');if(await field.evaluate(el=>el.tagName)==='SELECT')await field.selectOption(value);else await field.fill(value);}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
for(const width of [1280,390]){
 test(`collects current-original school balance receipts without double credit at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const traffic:string[]=[],protectedRequests:string[]=[],externalRequests:string[]=[];
  const expectedOrigin=new URL(process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:3099').origin;
  expect(expectedOrigin).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
  page.on('request',request=>{traffic.push(request.url(),request.postData()??'');if(/^\/api\/(provider(?:\/|$)|filled-return(?:\/|$)|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(new URL(request.url()).pathname))protectedRequests.push(new URL(request.url()).pathname);});
  await page.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.origin!==expectedOrigin){externalRequests.push(url.origin);await route.abort();return;}
   if(/^\/api\/(provider(?:\/|$)|filled-return(?:\/|$)|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(url.pathname)){await route.abort();return;}
   await route.continue();
  });
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id=required(new URL(page.url()).pathname.split('/').at(-1));
  await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  const f=guidedSchoolBalanceFixture('unpaid'),state=f.state;
  // Existing household/W2/Ohio residence/IT/baseline-school originals only.
  // Every NEW current-original credit/status/receipt field is absent here.
  delete f.draft.payments.account.currentOriginalReturnPaymentCredited;
  f.draft.payments.remainingTaxPayment={status:'',sourceReference:'',sourceFactsConfirmed:null};
  f.draft.sourceFactsConfirmed=null;f.draft.originalFederalSources=undefined;
  const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='state-return');
  expect(index).toBeGreaterThanOrEqual(0);state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(section=>section.id);
  await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});
  await page.reload();
  await entered(page,'School remaining tax payment status','unpaid');
  await expect(page.getByRole('textbox',{name:'School account current-original payment credited',exact:true})).toHaveValue('');
  await entered(page,'School remaining tax payment reference',`PRIVATE-UNPAID-SOURCE-${width}`);await entered(page,'Actual school remaining payment records checked','true');
  await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'School district sources require current explicit confirmation.'})).toHaveCount(1);
  await entered(page,'School account current-original payment credited','0');await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Actual school district sources explicitly confirmed.'})).toHaveCount(1);
  for(const[label,value]of balanceVisibleFields)await entered(page,label,value);
  await entered(page,'School balance original tax year','');await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'School district sources require current explicit confirmation.'})).toHaveCount(1);
  await entered(page,'School balance original tax year','2025');await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Actual school district sources explicitly confirmed.'})).toHaveCount(1);
  const complete=await saved(page,id),raw=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(complete))),canonical=buildGuidedStateOriginals(raw,complete);
  const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(canonical,calculateFederalTax(canonical)));
  expect(result.sd100?.line8_totalTaxAfterCredits.toString()).toBe('1000');expect(result.sd100?.line11_sdWithholding.toString()).toBe('600');expect(result.sd100?.line12_estimatedPayments.toString()).toBe('0');expect(result.sd100?.line18_totalAmountDue.toString()).toBe('400');expect(result.schoolDistrictSource?.remainingTaxPayment?.outstandingTaxBalance.toString()).toBe('0');
  await page.reload();await expect(page.getByLabel('School balance original confirmation number',{exact:true})).toHaveValue('PRIVATE-FICTIONAL-SD-GUIDE-BALANCE');await expect(page.getByRole('textbox',{name:'School account current-original payment credited',exact:true})).toHaveValue('400');
  await entered(page,'School account current-original payment credited','399');await expect(page.getByRole('status').filter({hasText:'School district sources require current explicit confirmation.'})).toHaveCount(1);
  await entered(page,'School account current-original payment credited','400');await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();
  await entered(page,'School remaining tax payment status','unpaid');await page.getByRole('button',{name:sdConfirmLabel,exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Inactive remaining-payment details remain saved.'})).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/sd-remaining-${width}.png`,fullPage:true});
  await page.getByRole('combobox',{name:'Tax year for this interview',exact:true}).selectOption('2026');await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();
  await expect(page.getByRole('region',{name:'Return Summary',exact:true})).toContainText('2026 not supported yet');await expect(page.getByRole('button',{name:'Download Draft Filled Return PDF',exact:true})).toHaveCount(0);
  expect(protectedRequests).toEqual([]);expect(externalRequests).toEqual([]);for(const marker of [`PRIVATE-UNPAID-SOURCE-${width}`,'PRIVATE-FICTIONAL-SD-GUIDE-BALANCE','900-70-0302'])expect(traffic.join('\n')).not.toContain(marker);
 });
}
