// Spec: spec/state/guided-pa-royalty-sources.yaml.
import {expect,test} from '@playwright/test';
import {actualGuidedPARoyaltySources} from '../../../tests/fixtures/guided-pa-royalty-sources';
import {taxpayerFacts2025} from './guided-fixtures';
const personal={...taxpayerFacts2025,firstName:'Jordan',ssn:'111-22-3333',state:'PA',stateResidency:'full-year'};
const w2={employerName:'Fictional royalty employer',employerEin:'12-3456789',accountHolder:'primary',wages:'200000',federalWithheld:'0',
 socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900',
 box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'};
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 test.describe(`PA original royalty records at ${viewport.width}px`,()=>{
  test('reconciles original state receipts through correction and local reload',async({page},testInfo)=>{
   await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
   await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
   const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing synthetic return');
   await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
   await page.evaluate(({id,personal,w2,sources})=>{
    localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify({factsVersion:2,phase:'interview',taxYear:2025,currentSectionIndex:2,completedSections:['personal-info','income-w2'],
     segmentation:{filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:'PA'},
     sectionData:{'personal-info':personal,'income-w2':{entries:[w2]},'income-royalties':sources}}));
   },{id,personal,w2,sources:actualGuidedPARoyaltySources()});
   await page.reload();await expect(page.locator('.guided-progress-step-active')).toContainText('Royalty Income');
   await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
   const agi=page.locator('.guided-ticker-breakdown-row').filter({hasText:'Adjusted Gross Income'});
   const stateHeader=page.getByText('Pennsylvania (PA)',{exact:true}),stateTax=page.locator('.guided-ticker-breakdown-row').filter({hasText:/^State Tax/});
   await expect(agi).toContainText('$211,001');await expect(stateHeader).toBeVisible();await expect(stateTax).toContainText('$6,478');
   const expense=page.getByRole('textbox',{name:'Property 1 expense 1 actual amount paid',exact:true});await expense.fill('149.25');await expense.press('Tab');
   const confirmLabels=['Royalty statement 1 checked after the last edit','Royalty packet checked after the last edit'];
   const paConfirm=page.getByRole('combobox',{name:'Property 1 PA classification checked after the last edit',exact:true});
   await expect(paConfirm).toHaveValue('');
   for(const name of confirmLabels){const field=page.getByRole('combobox',{name,exact:true});await expect(field).toHaveValue('');await field.selectOption('true');}
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);
   await paConfirm.selectOption('true');await expect(stateHeader).toHaveCount(0);
   await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties']?.properties?.[0]?.paTreatment?.expenses?.[0]?.amountPaid,id)).toBe('49.25');
   await page.getByRole('button',{name:'Copy property 1 PA originals',exact:true}).click();await expect(paConfirm).toHaveValue('');
   for(const name of confirmLabels)await page.getByRole('combobox',{name,exact:true}).selectOption('true');await paConfirm.selectOption('true');
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toBeVisible();await expect(stateTax).toContainText('$6,475'); // 210900 * .0307 = 6474.63, rounded to 6475.
   const resident=page.getByRole('combobox',{name:'Property 1 PA Was this owner a full-year Pennsylvania resident?',exact:true});await resident.selectOption('');
   for(const name of confirmLabels)await page.getByRole('combobox',{name,exact:true}).selectOption('true');
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);await page.reload();await expect(resident).toHaveValue('');await expect(paConfirm).toHaveValue('');
   const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties'],id);
   expect(saved.properties[0].paTreatment.ownerFullYearPAResident).toBeNull();expect(saved.properties[0].paTreatment.expenses[0].surfaceRights).toBe(false);
   expect(saved.properties[0].paTreatment.expenses[0].amountPaid).toBe('149.25');expect(saved.properties[0].paTreatment.sourceFactsConfirmed).toBeNull();
   expect(saved.properties[0].paTreatment).not.toHaveProperty('netIncome');
   await resident.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`pa-royalty-${viewport.width}.png`)});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   for(const secret of ['royalty-original-1','royalty-account-1','Fictional private legal receipt','Fictional PA property classification record',personal.ssn])expect(requests.join('\n')).not.toContain(secret);
  });
 });
}
