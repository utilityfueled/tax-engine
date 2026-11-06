// Spec: spec/federal/passenger-native-source-collector-browser.yaml. No post-entry proof injection.
import { nativeControlTag } from './helpers/native-control-snapshot';
import {expect,test,type Page} from '@playwright/test';
import {passengerNativeFixture} from '../../../tests/fixtures/passenger-native';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculateScheduleC} from '../../../src/engine/schedules/schedule-c';
import {calculateFederalTax} from '../../../src/engine/federal';
import {assertPdfExportAllowed,PDF_MAPPING_PACKS} from '../../../src/pdf/export-policy';

function required<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error('Actual native fixture or source is missing');return value;}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
function draft(state:GuidedFlowState){return required(required(state.sectionData['income-self-employment']?.businessFacts).passengerSources);}
function labelControl(page:Page,label:string){return page.locator('label').getByText(label,{exact:true}).locator('..').locator('input,select');}
async function enterControl(field:ReturnType<Page['locator']>,value:string){const tagName=await nativeControlTag(field);if(tagName==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
function leaves(value:unknown,path:string[]=[]):Array<[string,unknown]>{return value!==null&&typeof value==='object'?Object.entries(value).flatMap(([key,child])=>leaves(child,[...path,key])):[[path.join('.'),value]];}
const protectedRequest=/^\/api\/(?:workspace\/filled-return|provider(?:\/.*)?|business-expense-analysis|self-employment-income-analysis)\/?$/u;
for(const {width,bonus,profit,deduction} of [{width:1280,bonus:false,profit:'3775',deduction:'9225'},{width:390,bonus:true,profit:'4775',deduction:'15225'}] as const){
 test.describe(`Native passenger original lifecycle at ${width}px`,()=>{
  test('enters passenger originals saves reopens and revokes stale proof while 2026 remains blocked',async({page},info)=>{
   await page.setViewportSize({width,height:900});const errors:string[]=[],requests:Array<{url:string;body:string}>=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push({url:r.url(),body:r.postData()??''}));
   await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);
   const id=required(new URL(page.url()).pathname.split('/').at(-1));
   await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
   const f=passengerNativeFixture(bonus),target=structuredClone(f.draft);delete f.facts.passengerSources;delete f.facts.depreciationMethod;
   const route=buildSectionRoute(f.state.segmentation),index=route.findIndex(section=>section.id==='income-self-employment');expect(index).toBeGreaterThanOrEqual(0);
   f.state.phase='interview';f.state.currentSectionIndex=index;f.state.completedSections=route.slice(0,index).map(section=>section.id);
   // Only initial unrelated taxpayer/business facts. No vehicle, parent source,
   // inventory review, election, completion or result exists in saved setup.
   expect(f.state.sectionData['income-self-employment']?.businessFacts?.passengerSources).toBeUndefined();
   expect(f.state.sectionData['income-self-employment']?.businessFacts?.scheduleCSourceFacts?.passengerFirstYear).toBeUndefined();
   await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state:f.state});await page.reload();
   await enterControl(labelControl(page,'Depreciation source method'),'passenger');
   expect((await saved(page,id)).sectionData['income-self-employment']?.businessFacts?.passengerSources?.originalInput).toBeUndefined();expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
   await expect(page.locator('[data-passenger-path="vehicle.grossCostBasis"] input')).toHaveValue('');
   for(let n=0;n<6;n++)await page.getByRole('button',{name:'Add actual expense classification (all six required)',exact:true}).click();
   await page.getByRole('button',{name:'Record reviewed empty NEC inventory',exact:true}).click();
   // Fixed public fixture documents are expectations; every answer is entered
   // through the actual browser control, never copied into storage after setup.
   for(const [path,value] of leaves(target)){
    if(path==='sourceFactsConfirmed'||value===undefined||value===null)continue;
    const field=page.locator(`[data-passenger-path="${path}"]`).locator('input,select');await enterControl(field,String(value));
   }
   if(bonus)await page.getByRole('button',{name:'Record no class election-out reference for actual 100% branch',exact:true}).click();
   for(const name of ['Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','Have you reconciled receipts with all source forms and excluded duplicate income from the manual total?','Have you checked every expense amount, business use and deduction qualification against the records?'])await enterControl(labelControl(page,name),'true');
   expect(draft(await saved(page,id)).originalInput).toBeUndefined();
   await page.getByRole('button',{name:'Capture and confirm complete passenger sources after the last edit',exact:true}).click();
   await expect.poll(async()=>draft(await saved(page,id)).sourceFactsConfirmed).toBe(true);
   const actual=await saved(page,id),captured=structuredClone(draft(actual)),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(actual)),result=calculateScheduleC(input,input.scheduleC);
   expect(result.netProfit.toString()).toBe(profit);expect(result.form4562?.line22.toString()).toBe(deduction);
   expect(()=>calculateFederalTax(input)).toThrow(/incomplete; calculation is unavailable/u);
   expect(PDF_MAPPING_PACKS[2026]).toMatchObject({reviewAvailable:false,filingQualified:false});
   expect(()=>assertPdfExportAllowed(2026,2026,'review')).toThrow();expect(()=>assertPdfExportAllowed(2026,2026,'filing')).toThrow();
   await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.',{exact:true})).toBeVisible();
   const gross=page.locator('[data-passenger-path="vehicle.grossCostBasis"] input');await gross.focus();await gross.press('Tab');expect(draft(await saved(page,id))).toEqual(captured);
   await gross.scrollIntoViewIfNeeded();const bounds=await gross.evaluate(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,documentWidth:document.documentElement.scrollWidth};});expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width);expect(bounds.documentWidth).toBeLessThanOrEqual(width);
   await page.screenshot({path:info.outputPath('actual-passenger-source-capture.png')});
   await page.reload();expect(draft(await saved(page,id))).toEqual(captured);
   await enterControl(page.locator('[data-passenger-path="vehicle.invoiceReference"] input'),'fictional-browser-passenger-same-cash-new-original');
   const stale=await saved(page,id);expect(draft(stale).sourceFactsConfirmed).toBeNull();expect(draft(stale).originalInput).toEqual(captured.originalInput);expect(draft(stale).originalDraft).toEqual(captured.originalDraft);expect(buildTaxInputFromGuidedData(stale)).toBeNull();
   await page.reload();expect(draft(await saved(page,id))).toEqual(draft(stale));expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
   // The actual navigation button synchronizes saved facts into advanced local
   // workspace. Unsupported-year UI must withhold export actions without HTTP.
   await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();
   await expect(page.getByText('2026 not supported yet',{exact:true})).toBeVisible();
   await expect(page.getByRole('region',{name:'Draft Return Bundle',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Download Review PDF',exact:true})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Download Draft Filled Return PDF',exact:true})).toHaveCount(0);
   expect(requests.filter(request=>protectedRequest.test(new URL(request.url).pathname))).toEqual([]);
   expect(requests.some(request=>request.body.includes('fictional-browser-passenger-same-cash-new-original')||request.body.includes('private-parent-source'))).toBe(false);expect(errors).toEqual([]);
   await info.attach('passenger-request-counts.json',{body:JSON.stringify({filledReturn:0,provider:0,businessExpenseAnalysis:0,selfEmploymentIncomeAnalysis:0,observed:requests.map(({url})=>new URL(url).pathname)}),contentType:'application/json'});
  });
 });
}
