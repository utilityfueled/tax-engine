// Spec: spec/federal/guided-goodwill-amortization.yaml. Visible source origination; no post-entry injection.
import {expect,test,type Page} from '@playwright/test';
import {completeBusinessSection,startCompleteInterview} from '../../../tests/guided-interview/complete-facts';
import {goodwillFacts} from '../../../tests/fixtures/guided-goodwill-amortization';
import {goodwillCollectionQuestions,goodwillRowQuestions} from '../src/lib/guided-goodwill-amortization';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculateFederalTax} from '../../../src/engine/federal';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Missing explicit synthetic source or visible control');return v;}
function control(page:Page,label:string){return page.locator('label').filter({has:page.getByText(label,{exact:true})}).locator('input,select');}
async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(n=>n.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
function canonical(state:GuidedFlowState){return calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))));}
for(const width of [1280,390])test.describe(`Actual goodwill originals at ${width}px`,()=>{test('originates private acquired-goodwill originals and preserves source gates',async({page},info)=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[],traffic:string[]=[],protectedRequests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{traffic.push(request.url(),request.postData()??'');const path=new URL(request.url()).pathname;if(/^\/api\/(?:provider(?:\/|$)|filled-return(?:\/|$)|workspace(?:\/|$)|guided-review-summary(?:\/|$)|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(path))protectedRequests.push(path);});
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/i);const id=required(new URL(page.url()).pathname.split('/').at(-1));
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:null}),facts=goodwillFacts();expect(facts.goodwillAmortization).toBeUndefined();
 state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:'40000',expenses:{...completeBusinessSection.expenses,otherExpenses:'500'},businessFacts:facts};
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='income-self-employment');expect(index).toBeGreaterThanOrEqual(0);state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(section=>section.id);
 // Existing unrelated personal/business scaffold only; no goodwill asset, basis, dates or proof is inserted.
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});await page.reload();
 await page.getByRole('button',{name:'Add acquired-goodwill originals',exact:true}).click();expect(required((await saved(page,id)).sectionData['income-self-employment']).businessFacts?.goodwillAmortization).toEqual({});
 await page.getByRole('button',{name:'Add goodwill original',exact:true}).click();await expect(control(page,'Goodwill 1 acquired basis')).toHaveValue('');
 const reference=`private-goodwill-browser-${width}`;
 for(const[label,value]of [['Goodwill original tax year','2025'],['Complete goodwill inventory reference',reference],['Goodwill ledger remaining nonamortization other expenses','500'],['Goodwill remaining expense ledger reference',reference+'-ledger'],['Goodwill 1 original reference',reference+'-asset'],['Goodwill 1 actual description','Private goodwill purchase'],['Goodwill 1 acquired basis','18000.15'],['Goodwill 1 acquisition date','2025-07-15'],['Goodwill 1 business-start date','2025-01-01'],['Goodwill 1 original amortization start month (YYYY-MM)','2025-07']])await enter(page,required(label),required(value));
 for(const label of [...Object.values(goodwillCollectionQuestions),...Object.values(goodwillRowQuestions)])await enter(page,label,'true');
 await page.getByRole('button',{name:'Confirm complete goodwill originals',exact:true}).click();
 for(const label of ['Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','Have you checked every expense amount, business use and deduction qualification against the records?'])await enter(page,label,'true');
 const confirmed=await saved(page,id),packet=required(required(confirmed.sectionData['income-self-employment']).businessFacts?.goodwillAmortization);expect(packet.sourceFactsConfirmed).toBe(true);expect(required(packet.rows?.[0]).basis).toBe('18,000.15');
 // Independent amount:18000.15/180*6=600.005, reported600; 500+600+1000=2100 expenses,40000−2100=37900.
 expect(canonical(confirmed).scheduleC?.form4562?.line44.toFixed()).toBe('600');expect(canonical(confirmed).scheduleC?.netProfit.toFixed()).toBe('37900');
 await page.reload();expect(required(required((await saved(page,id)).sectionData['income-self-employment']).businessFacts?.goodwillAmortization)).toEqual(packet);
 const basis=control(page,'Goodwill 1 acquired basis');await basis.focus();await basis.press('Tab');expect(required(required((await saved(page,id)).sectionData['income-self-employment']).businessFacts?.goodwillAmortization)).toEqual(packet);
 await enter(page,'Goodwill 1 acquired basis','');expect(required(required((await saved(page,id)).sectionData['income-self-employment']).businessFacts?.goodwillAmortization).sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
 await page.reload();await expect(control(page,'Goodwill 1 acquired basis')).toHaveValue('');await enter(page,'Goodwill 1 acquired basis','0');await page.getByRole('button',{name:'Confirm complete goodwill originals',exact:true}).click();
 for(const label of ['Have you reconciled every actual source, owner, year and eligibility fact in this Schedule C packet?','Have you checked every expense amount, business use and deduction qualification against the records?'])await enter(page,label,'true');expect(canonical(await saved(page,id)).scheduleC?.form4562?.line44.toFixed()).toBe('0');
 await enter(page,'Goodwill 1 original reference',reference+'-changed');const changed=await saved(page,id);expect(required(required(changed.sectionData['income-self-employment']).businessFacts?.goodwillAmortization).sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(changed)).toBeNull();
 await control(page,'Goodwill 1 original reference').scrollIntoViewIfNeeded();const geometry=await control(page,'Goodwill 1 original reference').evaluate(node=>{const box=node.getBoundingClientRect();return{left:box.left,right:box.right,scroll:document.documentElement.scrollWidth};});expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(width);expect(geometry.scroll).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('actual-goodwill-originals.png')});
 await enter(page,'Tax year for this interview','2026');await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.',{exact:true})).toBeVisible();expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
 await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();await expect(page.getByRole('button',{name:'Download Review PDF',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Download Draft Filled Return PDF',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);expect(protectedRequests).toEqual([]);expect(traffic.join('\n')).not.toContain(reference);expect(traffic.join('\n')).not.toContain('111-22-3333');
});});
