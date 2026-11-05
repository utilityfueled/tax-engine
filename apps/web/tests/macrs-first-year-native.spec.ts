// Spec: spec/federal/macrs-native-first-year-ordinary.yaml. Original app deadlines; integration uses zero retries; no post-entry source injection.
import {expect,test,type Page} from '@playwright/test';
import {macrsFixture} from '../../../tests/fixtures/macrs-native-first-year';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculateScheduleC} from '../../../src/engine/schedules/schedule-c';
const fields:Array<[string,string]>=[
 ['Actual asset source tax year','2025'],['Complete asset inventory source reference','fictional-browser-private-inventory'],
 ['Do the actual records cover the full calendar tax year?','true'],['Does this complete inventory contain every asset for this Schedule C?','true'],['Do actual records establish no other activity or owner has property requiring a combined convention test?','true'],['Do actual records establish no other depreciation or amortization deductions?','true'],['Are these costs excluded from every other deduction?','true'],
 ['Asset 1 original reference','fictional-browser-private-invoice'],['Asset 1 description','Fictional ordinary machine'],['Asset 1 full placed-in-service date','2025-02-01'],['Asset 1 actual recovery class','5'],['Asset 1 actual depreciation method','200DB'],['Asset 1 actual gross basis','10000'],['Asset 1 actual business section179 deduction','0'],['Asset 1 actual business bonus deduction','0'],['Asset 1 actual business use percentage','60'],['Asset 1 gross basis original','fictional-browser-private-basis'],['Asset 1 business use original','fictional-browser-private-use'],['Asset 1 zero179 completed worksheet','fictional-browser-private-zero179'],['Asset 1 zero-bonus completed worksheet','fictional-browser-private-zero-bonus'],['Asset 1 actual zero-bonus treatment','elected_out'],['Asset 1 zero-bonus treatment original','fictional-browser-private-election'],
 ['Asset 1: Is this ordinary property outside listed-property rules?','true'],['Asset 1: Do the actual classification records establish this is not a passenger automobile?','true'],['Asset 1: Was this property retained throughout the remainder of the tax year?','true'],['Asset 1: Do actual records establish constant business use throughout its service period?','true'],['Asset 1: Is this a first-year asset with no prior depreciation history?','true'],['Asset 1: Do actual basis records exclude all other basis adjustments?','true'],['Asset 1: Do actual records exclude conversion and carryover basis?','true'],['Asset 1: Does the completed worksheet establish no section179 election for this asset?','true'],
];
function control(page:Page,label:string){return page.locator('label').getByText(label,{exact:true}).locator('..').locator('input,select');}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(n=>n.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
for(const width of [1280,390])test.describe(`Actual first-year MACRS at ${width}px`,()=>{
 test('actual first-year assets survive native entry and local reopen',async({page},info)=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[],posted:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posted.push(r.postData()??'');});
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);const id=new URL(page.url()).pathname.split('/').at(-1)!;
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
 const {state,facts}=macrsFixture();delete facts.macrsAssets;delete facts.depreciationMethod;
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(s=>s.id==='income-self-employment');expect(index).toBeGreaterThanOrEqual(0);state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(s=>s.id);
 // Initial unrelated business/personal originals only; no assets, basis sources or completion are inserted.
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});await page.reload();
 await page.getByRole('button',{name:'Use actual first-year asset records',exact:true}).click();await page.getByRole('button',{name:'Add actual ordinary asset',exact:true}).click();
 expect((await saved(page,id)).sectionData['income-self-employment']!.businessFacts!.macrsAssets!.rows).toEqual([{}]);await expect(control(page,'Asset 1 actual gross basis')).toHaveValue('');
 for(const[label,value]of fields)await enter(page,label,value);
 await page.getByRole('button',{name:'Confirm original asset 1 after the last edit',exact:true}).click();await page.getByRole('button',{name:'Confirm complete asset inventory after the last edit',exact:true}).click();
 await enter(page,'Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','true');await enter(page,'Have you checked every expense amount, business use and deduction qualification against the records?','true');
 const final=await saved(page,id),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(final));expect(calculateScheduleC(input,input.scheduleC).form4562?.line22.toString()).toBe('1200');
 const inventory=final.sectionData['income-self-employment']!.businessFacts!.macrsAssets!;expect(inventory.sourceFactsConfirmed).toBe(true);
 const basis=control(page,'Asset 1 actual gross basis');await basis.focus();await basis.press('Tab');expect((await saved(page,id)).sectionData['income-self-employment']!.businessFacts!.macrsAssets).toEqual(inventory);
 await basis.scrollIntoViewIfNeeded();const bounds=await basis.evaluate(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,width:innerWidth,documentWidth:document.documentElement.scrollWidth};});expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width);expect(bounds.documentWidth).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('actual-native-asset.png')});
 await page.reload();expect((await saved(page,id)).sectionData['income-self-employment']!.businessFacts!.macrsAssets).toEqual(inventory);
 await enter(page,'Asset 1 gross basis original','fictional-browser-same-cash-new-original');const changed=await saved(page,id);expect(changed.sectionData['income-self-employment']!.businessFacts!.macrsAssets!.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(changed)).toBeNull();expect(changed.sectionData['income-self-employment']!.businessFacts!.macrsAssets!.rows![0].originalAsset).toEqual(inventory.rows![0].originalAsset);
 expect(errors).toEqual([]);expect(posted.join('\n')).not.toMatch(/fictional-browser-private/);
});
});
