// Spec: spec/federal/guided-royalty-sources.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedRoyaltySources } from '../../../tests/fixtures/guided-royalty-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal={...taxpayerFacts2025,firstName:'Jordan',ssn:'111-22-3333'};
const w2={employerName:'Fictional royalty employer',employerEin:'12-3456789',accountHolder:'primary',wages:'200000',federalWithheld:'0',
  socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900',
  box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'};
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  test.describe(`Actual royalty sources at ${viewport.width}px`,()=>{
    test('retains actual royalty statements and property records through local reload',async({page},testInfo)=>{
      await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
      await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing fictional return');
      await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
      await page.evaluate(({id,personal,w2,sources})=>{
        localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify({factsVersion:2,phase:'interview',taxYear:2025,currentSectionIndex:2,completedSections:['personal-info','income-w2'],
          segmentation:{filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:null},
          sectionData:{'personal-info':personal,'income-w2':{entries:[w2]},'income-royalties':sources}}));
      },{id,personal,w2,sources:actualGuidedRoyaltySources()});
      await page.reload();await expect(page.locator('.guided-progress-step-active')).toContainText('Royalty Income');
      const hero=page.locator('.guided-ticker-value-hero').first();await expect(hero).not.toHaveText('Enter more info for an estimate');
      const box2=page.getByRole('textbox',{name:'Royalty statement 1 Original Form 1099-MISC Box 2 royalties',exact:true});await expect(box2).toHaveValue('12000.25');
      await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
      const agi=page.locator('.guided-ticker-breakdown-row').filter({hasText:'Adjusted Gross Income'});await expect(agi).toContainText('$211,001');
      const expense=page.getByRole('textbox',{name:'Property 1 expense 2 actual amount paid',exact:true});await expense.fill('951.60');await expense.press('Tab');
      const confirmations=['Royalty statement 1 checked after the last edit','Royalty packet checked after the last edit'];
      for(const label of confirmations)await expect(page.getByRole('combobox',{name:label,exact:true})).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for(const label of confirmations)await page.getByRole('combobox',{name:label,exact:true}).selectOption('true');
      await expect(agi).toContainText('$210,999');
      await box2.fill('12001.25');await box2.press('Tab');
      const allocation=page.getByRole('textbox',{name:'Property 1 income link 1 actual gross allocation',exact:true});await allocation.fill('12001.25');await allocation.press('Tab');
      for(const label of confirmations)await page.getByRole('combobox',{name:label,exact:true}).selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties']?.properties?.[0]?.incomeSources?.[0]?.original?.royalties,id)).toBe('12000.25');
      await page.getByRole('button',{name:'Copy property 1 income link 1 original',exact:true}).click();
      for(const label of confirmations)await page.getByRole('combobox',{name:label,exact:true}).selectOption('true');
      await expect(agi).toContainText('$211,000');await page.reload();
      await expect(expense).toHaveValue('951.60');await expect(box2).toHaveValue('12,001.25');
      for(const label of confirmations)await expect(page.getByRole('combobox',{name:label,exact:true})).toHaveValue('true');
      const cash=page.getByRole('combobox',{name:'Property 1 Do the actual property records use the cash method?',exact:true});await cash.selectOption('');
      await expect(hero).toHaveText('Enter more info for an estimate');await page.reload();await expect(cash).toHaveValue('');
      const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties'],id);
      expect(saved.properties[0].cashMethod).toBeNull();expect(saved.properties[0].tradeOrBusiness).toBe(false);
      expect(saved.properties[0].expenses[1].amountPaid).toBe('951.60');expect(saved.statements[0].otherIncome).toBe('0');
      expect(saved.properties[0].incomeSources[0].sourceId).toBe('royalty-original-1');expect(saved.sourceFactsConfirmed).toBeNull();
      expect(saved).not.toHaveProperty('netIncome');expect(saved).not.toHaveProperty('agi');
      await cash.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`royalty-sources-${viewport.width}.png`)});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      for(const secret of ['royalty-original-1','royalty-account-1','Fictional private legal receipt',personal.ssn])expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
