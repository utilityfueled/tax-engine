// Spec: spec/federal/guided-schedule-ai-investment-election.yaml actual-browser.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { guidedInvestmentElectionFixture } from '../../../tests/fixtures/guided-schedule-ai-investment-election';
import { getGuidedSectionRoute } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { parseInput, calculateFederalTax } from '../../../src/index';
import { ESTIMATED_INVESTMENT_AMOUNTS } from '../src/lib/guided-estimated-investment-election';


function required<T,>(value:T|null|undefined):T { if(value===undefined||value===null)throw Error('Complete actual synthetic fixture required');return value; }
for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
 test.describe(`Schedule AI election originals at ${viewport.width}px`,()=>{
  test('enters actual period election originals and revokes stale confirmation',async({page},testInfo)=>{
   await page.setViewportSize(viewport);
   const requests:{url:string;body:string}[]=[];page.on('request',request=>requests.push({url:request.url(),body:request.postData()??''}));
   const {state,packet}=guidedInvestmentElectionFixture();
   state.currentSectionIndex=getGuidedSectionRoute(state).findIndex(section=>section.id==='payments');
   if(state.currentSectionIndex<0)throw Error('Actual payments section required');
   Reflect.deleteProperty(required(required(state.sectionData.payments).estimatedTaxFacts),'investmentElectionSources');
   required(required(state.sectionData.payments).estimatedTaxFacts).sourceFactsConfirmed=null;
   await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
   const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw Error('Missing fictional return');
   await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
   const storageKey=`tax-engine.guided-flow-state.v1:${id}`;
   await page.evaluate(({id,state,key})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(key,JSON.stringify(state));},{id,state,key:storageKey});
   await page.reload();await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Add actual period investment-interest election originals',exact:true}).click();
   const textbox=(name:string)=>page.getByRole('textbox',{name,exact:true});
   const choice=(name:string)=>page.getByRole('combobox',{name,exact:true});
   const fill=async(name:string,value:string)=>{await textbox(name).fill(value);await textbox(name).blur();};
   const overall=choice('All investment-election originals checked after the last edit');
   const estimated=choice('Estimated-tax sources checked after the last edit');
   await expect(textbox('Election period 2: Actual elected preferential income')).toHaveValue('');
   await overall.selectOption('true');await estimated.selectOption('true');
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();
   for(const[key,label]of [['sourceTaxYear','Election originals tax year'],['sourceReference','Election originals source reference'],['taxpayerFirstName','Election original taxpayer first name'],['taxpayerLastName','Election original taxpayer last name'],['taxpayerSsnLast4','Election original taxpayer ID last four digits'],['annualForm4952SourceReference','Annual Form 4952 original source reference']]as const)await fill(label,packet[key]);
   await choice('Election original owner').selectOption('primary');
   await choice('All four actual election period originals are complete').selectOption('true');
   await choice('Actual investment-income election is valid').selectOption('true');
   await choice('Other investment income is present outside these originals').selectOption('false');
   const amt=packet.annualAmtCapitalGains;
   await fill('Annual AMT capital original tax year',amt.sourceTaxYear);await fill('Annual AMT capital original source reference',amt.sourceReference);
   for(const[key,label]of [['qualifiedDividends','Qualified dividends'],['netCapitalGain','Net capital gain'],['section1250Gain','Section 1250 gain'],['collectiblesGain','Collectibles gain']]as const)await fill(`Annual AMT capital original: ${label}`,amt[key]);
   await choice('Annual AMT capital original checked after the last edit').selectOption('true');
   for(const[rowIndex,row]of packet.periods.entries()){
    const prefix=`Election period ${rowIndex+1}`;
    await page.getByLabel(`${prefix}: Actual cumulative cutoff date`,{exact:true}).fill(row.periodEnd);
    await fill(`${prefix}: Original tax year`,row.form4952.sourceTaxYear);await fill(`${prefix}: Original source reference`,row.form4952.sourceReference);
    for(const[key,label]of ESTIMATED_INVESTMENT_AMOUNTS)await fill(`${prefix}: ${label}`,row.form4952[key]);
    await fill(`${prefix}: Other itemized deductions`,row.otherItemizedDeductions);
    await choice(`${prefix}: Original checked after the last edit`).selectOption('true');
   }
   await expect(overall).toHaveValue('');await expect(estimated).toHaveValue('');
   await overall.selectOption('true');await estimated.selectOption('true');
   const saved=async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'{}'),storageKey);
   await expect.poll(async()=>buildTaxInputFromGuidedData(await saved())?.form2210?.investmentElectionSources?.periods?.length).toBe(4);
   const canonical=calculateFederalTax(parseInput(buildTaxInputFromGuidedData(await saved())));
   expect(canonical.totalTaxBeforeCredits.toFixed()).toBe('32537');
   expect(canonical.form2210?.lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14b')?.value.toFixed()).toBe('40655');
   await expect(page.locator('.guided-ticker-value-hero').first()).not.toHaveText('Enter more info for an estimate');
   await page.reload();await expect(overall).toHaveValue('true');await expect(estimated).toHaveValue('true');
   await expect(textbox('Election period 2: Actual elected preferential income')).toHaveValue('1');
   await expect(textbox('Election period 2: Original source reference')).toHaveValue(required(packet.periods[1]).form4952.sourceReference);
   await fill('Election period 2: Current investment interest expense','2');
   const periodConfirmed=choice('Election period 2: Original checked after the last edit');
   await expect(periodConfirmed).toHaveValue('');await expect(overall).toHaveValue('');await expect(estimated).toHaveValue('');
   expect(buildTaxInputFromGuidedData(await saved())).toBeNull();
   await periodConfirmed.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');
   const partial=calculateFederalTax(parseInput(buildTaxInputFromGuidedData(await saved())));expect(partial.totalTaxBeforeCredits.toFixed()).toBe('32537');
   await page.reload();await expect(textbox('Election period 2: Current investment interest expense')).toHaveValue('2');await expect(overall).toHaveValue('true');
   const enteredPeriod=page.getByRole('group',{name:'Election period 2',exact:true});
   await expect(textbox('Election period 2: Current investment interest expense')).toHaveValue('2');
   await enteredPeriod.scrollIntoViewIfNeeded();await expect(enteredPeriod).toBeVisible();
   await enteredPeriod.screenshot({path:testInfo.outputPath(`investment-election-originals-${viewport.width}.png`),animations:'disabled'});
   writeFileSync(testInfo.outputPath(`investment-election-canonical-${viewport.width}.json`),JSON.stringify({taxYear:2025,totalTaxBeforeCredits:partial.totalTaxBeforeCredits.toFixed(),line14b:partial.form2210?.lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14b')?.value.toFixed(),reopenedActualInterest:'2'},null,2)+'\n');
   await fill('Election period 2: Actual elected net capital gain','');
   await periodConfirmed.selectOption('true');await overall.selectOption('true');await estimated.selectOption('true');
   expect(buildTaxInputFromGuidedData(await saved())).toBeNull();
   await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   const protectedPatterns=[/\/api\/filled-return(?:[/?]|$)/,/\/api\/provider(?:[/?]|$)/,/\/api\/business-expense-analysis(?:[/?]|$)/,/\/api\/self-employment-income-analysis(?:[/?]|$)/];
   for(const pattern of protectedPatterns)expect(requests.filter(row=>pattern.test(new URL(row.url).pathname))).toHaveLength(0);
   for(const request of requests){const wire=request.url+'\n'+request.body;let decoded=wire;try{decoded=decodeURIComponent(wire);}catch{/* Retain the raw wire for non-percent-encoded requests. */}for(const secret of [packet.sourceReference,packet.annualForm4952SourceReference,packet.annualAmtCapitalGains.sourceReference,'123-45-6789']){expect(wire).not.toContain(secret);expect(decoded).not.toContain(secret);}}
  });
 });
}
