// Spec: spec/federal/guided-schedule-ai-investment-household.yaml actual-browser.
import {expect,test} from '@playwright/test';
import {writeFileSync}from 'node:fs';
import {guidedInvestmentHouseholdFixture}from '../../../tests/fixtures/guided-schedule-ai-investment-household';
import {getGuidedSectionRoute}from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData}from '../src/lib/guided-interview-bridge';
import {calculateFederalTax,parseInput}from '../../../src/index';
import {HOUSEHOLD_TEXT,HOUSEHOLD_FLAGS,SPOUSE_AMOUNTS,DIVIDEND_TEXT,DIVIDEND_AMOUNTS}from '../src/lib/guided-estimated-investment-household';
function required<T,>(v:T|null|undefined):T{if(v==null)throw Error('Actual source required');return v;}
for(const viewport of[{width:1280,height:900},{width:390,height:844}])test.describe(`Joint household originals at ${viewport.width}px`,()=>{
 test('enters both spouse and dividend originals without inferred facts',async({page},testInfo)=>{
 await page.setViewportSize(viewport);const requests:{url:string;body:string}[]=[],external:string[]=[];page.on('request',r=>requests.push({url:r.url(),body:r.postData()??''}));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.protocol==='http:'&&u.hostname==='127.0.0.1')await route.continue();else{external.push(u.origin);await route.abort();}});
 const x=guidedInvestmentHouseholdFixture(),target=x.household,state=x.state;
 state.currentSectionIndex=getGuidedSectionRoute(state).findIndex(s=>s.id==='payments');if(state.currentSectionIndex<0)throw Error('Payments section required');
 Reflect.deleteProperty(required(required(state.sectionData.payments).estimatedTaxFacts).investmentElectionSources,'household');required(required(state.sectionData.payments).estimatedTaxFacts).sourceFactsConfirmed=null;
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
 const id=required(new URL(page.url()).pathname.split('/').at(-1)),key=`tax-engine.guided-flow-state.v1:${id}`;
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
 await page.evaluate(({id,key,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(key,JSON.stringify(state));},{id,key,state});await page.reload();
 await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();await page.getByRole('button',{name:'Add actual joint household investment originals',exact:true}).click();
 const text=(name:string)=>page.getByRole('textbox',{name,exact:true}),choice=(name:string)=>page.getByRole('combobox',{name,exact:true});
 const fill=async(name:string,v:string)=>{await text(name).fill(v);await text(name).blur();};
 const household=choice('Joint household originals checked after the last edit'),overall=choice('All investment-election originals checked after the last edit'),estimated=choice('Estimated-tax sources checked after the last edit');
 await expect(text('Spouse actual investment income')).toHaveValue('');await household.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();
 for(const[key,label]of HOUSEHOLD_TEXT)await fill(label,target[key]);for(const[key,label]of HOUSEHOLD_FLAGS)await choice(label).selectOption(String(target[key]));for(const[key,label]of SPOUSE_AMOUNTS)await fill(label,target[key]);
 for(const owner of['primary','spouse']as const){for(const[key,label]of[['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const)await fill(`Household ${owner}: original ${label}`,target[owner][key]);const d=owner==='primary'?target.primaryDomicile:target.spouseDomicile;for(const[key,label]of[['state','domicile state'],['startDate','domicile start date'],['endDate','domicile end date'],['sourceReference','domicile original reference']]as const){const name=`Household ${owner}: ${label}`;if(key==='startDate'||key==='endDate')await page.getByLabel(name,{exact:true}).fill(d[key]);else await fill(name,d[key]);}}
 await page.getByRole('button',{name:'Add actual household dividend original',exact:true}).click();const div=required(target.dividendSources[0]);
 for(const[key,label]of DIVIDEND_TEXT)await fill(`Household dividend 1: ${label}`,div[key]);for(const[key,label]of[['firstName','first name'],['lastName','last name'],['ssn','complete SSN']]as const)await fill(`Household dividend 1: recipient ${label}`,div.recipient[key]);await choice('Household dividend 1: Actual owner').selectOption('primary');for(const[key,label]of DIVIDEND_AMOUNTS)await fill(`Household dividend 1: ${label}`,div[key]);await choice('Household dividend 1: All other reported boxes are actually zero').selectOption('true');
 await expect(household).toHaveValue('');await expect(overall).toHaveValue('');await expect(estimated).toHaveValue('');
 await household.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');
 const saved=async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{}'),key);
 await expect.poll(async()=>buildTaxInputFromGuidedData(await saved())?.form2210?.investmentElectionSources?.household?.spouseInvestmentIncome).toBe('0');
 const result=calculateFederalTax(parseInput(buildTaxInputFromGuidedData(await saved())));expect(result.totalTaxBeforeCredits.toFixed()).toBe('22078');const vector=result.form2210?.lines.filter(r=>r.form==='Form 2210 Schedule AI'&&/^14[a-d]$/.test(r.line)).map(r=>r.value.toFixed());expect(vector).toEqual(['24888','34012','18636','22078']);
 await expect(page.locator('.guided-ticker-value-hero').first()).not.toHaveText('Enter more info for an estimate');
 await page.reload();await expect(household).toHaveValue('true');await expect(estimated).toHaveValue('true');await expect(text('Household spouse: domicile original reference')).toHaveValue(target.spouseDomicile.sourceReference);await expect(text('Spouse actual investment income')).toHaveValue('0');
 await fill('Spouse actual investment income','');await expect(household).toHaveValue('');await expect(overall).toHaveValue('');await expect(estimated).toHaveValue('');expect(buildTaxInputFromGuidedData(await saved())).toBeNull();
 await household.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');expect(buildTaxInputFromGuidedData(await saved())).toBeNull();
 await page.reload();await expect(text('Spouse actual investment income')).toHaveValue('');await fill('Spouse actual investment income','0');await household.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');expect(calculateFederalTax(parseInput(buildTaxInputFromGuidedData(await saved()))).totalTaxBeforeCredits.toFixed()).toBe('22078');
 await fill('Household dividend 1: Dividend original account reference','ActualChangedAccount');await expect(household).toHaveValue('');await expect(overall).toHaveValue('');await expect(estimated).toHaveValue('');
 await household.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');const stale=buildTaxInputFromGuidedData(await saved());if(stale!==null)expect(()=>calculateFederalTax(parseInput(stale))).toThrow();
 await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
 const group=page.getByRole('group',{name:'Actual joint household investment originals',exact:true});await group.scrollIntoViewIfNeeded();await expect(group).toBeVisible();await group.screenshot({path:testInfo.outputPath(`joint-household-${viewport.width}.png`),animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const protectedPatterns=[/\/api\/(?:workspace\/)?filled-return(?:[/?]|$)/,/\/api\/(?:workspace\/tax-explanation|provider)(?:[/?]|$)/,/\/api\/business-expense-analysis(?:[/?]|$)/,/\/api\/self-employment-income-analysis(?:[/?]|$)/];const counts=protectedPatterns.map(p=>requests.filter(r=>p.test(new URL(r.url).pathname)).length);for(const count of counts)expect(count).toBe(0);expect(external).toEqual([]);
 for(const r of requests){const wire=r.url+'\n'+r.body;let decoded=wire;try{decoded=decodeURIComponent(wire);}catch{/* Keep exact non-percent-encoded wire. */}for(const secret of['PRIVATE-','123-45-6789','234-56-7890','PrivateMfjSpouseName']){expect(wire).not.toContain(secret);expect(decoded).not.toContain(secret);}}
 writeFileSync(testInfo.outputPath(`joint-household-receipt-${viewport.width}.json`),JSON.stringify({taxYear:2025,totalTaxBeforeCredits:'22078',line14:vector,actualTypedHousehold:true,zeroBlankRetained:true,staleAccountDenied:true,protectedCounts:counts,externalRequests:external.length,full2026Qualified:false},null,2)+'\n');
 });
});
