// Spec: spec/federal/form-8962-no-advance-allocation.yaml.
import { expect, test } from '@playwright/test';
import { actualNoAdvanceAllocationData } from '../../../tests/fixtures/guided-no-advance-allocation';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal={...taxpayerFacts2025,firstName:'Jordan',ssn:'111-22-3333'};
const w2={employerName:'Synthetic Employer',employerEin:'12-3456789',accountHolder:'primary',wages:'30000',federalWithheld:'0',socialSecurityWages:'30000',socialSecurityTips:'0',socialSecurityWithheld:'1860',medicareWages:'30000',medicareWithheld:'435',box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'};
for(const viewport of [{width:1280,height:900},{width:390,height:844}])test.describe(`No-advance shared policy at ${viewport.width}px`,()=>{
 test('preserves actual no-advance benchmark sources',async({page},testInfo)=>{
  await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing synthetic return');
  await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  await page.evaluate(({id,personal,w2,coverage})=>{
   localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
   localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify({factsVersion:2,phase:'interview',taxYear:2025,currentSectionIndex:3,completedSections:['personal-info','income-w2','deductions'],segmentation:{filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null},sectionData:{'personal-info':personal,'income-w2':{entries:[w2]},credits:{dependentCare:{expenses:'',qualifyingIndividuals:''},education:{aocStudents:[],llcExpenses:''},energy:{solarElectricCost:'',solarWaterHeatingCost:'',insulationCost:'',exteriorDoorsWindowsCost:'',roofCost:'',energyEfficientHvacCost:'',waterHeaterHeatPumpCost:''},premiumTaxCredit:coverage}}}));
  },{id,personal,w2,coverage:actualNoAdvanceAllocationData()});
  await page.reload();const hero=page.locator('.guided-ticker-value-hero').first();await expect(hero).not.toHaveText('Enter more info for an estimate');
  await expect(page.getByRole('combobox',{name:'Allocation policy 1: Allocation situation',exact:true})).toHaveValue('no_advance_credit');
  await expect(page.getByRole('textbox',{name:'Allocation policy 1: Month 1 agreed fraction',exact:true})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'Policy 1 month 1: Original SLCSP box is printed blank',exact:true})).toHaveValue('true');
  await expect(page.getByRole('textbox',{name:'Policy 1 month 1: Original SLCSP premium',exact:true})).toHaveCount(0);
  const reference=page.getByRole('textbox',{name:'Allocation policy 1: Benchmark worksheet reference',exact:true});await reference.fill('synthetic-private-benchmark');await reference.press('Tab');
  const outer=page.getByRole('combobox',{name:'Marketplace sources checked after the last edit',exact:true}),inner=page.getByRole('combobox',{name:'Allocation sources checked after the last edit',exact:true}),benchmark=page.getByRole('combobox',{name:'Allocation policy 1: Benchmark sources checked after the last edit',exact:true});
  await expect(inner).toHaveValue('');await expect(outer).toHaveValue('');await expect(benchmark).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
  await benchmark.selectOption('true');await inner.selectOption('true');await page.getByRole('button',{name:'Calculate household amounts from allocation',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:/\S/})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Coverage month 1: Eligible enrollment premium',exact:true})).toHaveValue('1000');
  await expect(page.getByRole('textbox',{name:'Coverage month 1: Corrected household SLCSP premium',exact:true})).toHaveValue('1200');
  await expect(page.getByRole('textbox',{name:'Coverage month 1: Reconciled advance credit',exact:true})).toHaveValue('0');
  await expect(page.getByRole('textbox',{name:'Policy 1 month 1: Original enrollment premium',exact:true})).toHaveValue('1500');
  await benchmark.selectOption('true');await inner.selectOption('true');await outer.selectOption('true');await expect(hero).not.toHaveText('Enter more info for an estimate');
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.credits?.premiumTaxCredit?.sharedPolicyAllocations?.policies?.[0]?.noAdvanceAllocation?.sourceReference,id)).toBe('synthetic-private-benchmark');
  await page.reload();await expect(reference).toHaveValue('synthetic-private-benchmark');await expect(benchmark).toHaveValue('true');await expect(inner).toHaveValue('true');
  const enrollment=page.getByRole('textbox',{name:'Allocation policy 1: Month 1 other-return benchmark',exact:true});await enrollment.fill('');await enrollment.press('Tab');
  await expect(inner).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.credits?.premiumTaxCredit?.sharedPolicyAllocations?.policies?.[0]?.noAdvanceAllocation?.monthlyBenchmarks?.[0]?.otherReturnSlcsp,id)).toBe('');
  await page.reload();await expect(enrollment).toHaveValue('');
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData.credits.premiumTaxCredit,id);
  expect(saved.policies[0].monthlyPremiums[0].enrolleePremium).toBe('1500');expect(saved.sharedPolicyAllocations.policies[0].original.monthlyPremiums[0].enrolleePremium).toBe('1500');expect(saved.monthlyReconciliation[0].advancePremiumTaxCredit).toBe('0');
  expect(saved.policies[0].monthlyPremiums[0].slcsp).toBe('');expect(saved.policies[0].monthlyPremiums[0].slcspReportedBlank).toBe(true);
  expect(saved.sharedPolicyAllocations.policies[0].monthlyAllocations.every((row:{fraction:string})=>row.fraction==='')).toBe(true);
  await reference.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`no-advance-allocation-${viewport.width}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  for(const secret of ['synthetic-private-benchmark',personal.ssn,'444-55-6666','555-66-7777','policy-123'])expect(requests.join('\n')).not.toContain(secret);
 });
});
