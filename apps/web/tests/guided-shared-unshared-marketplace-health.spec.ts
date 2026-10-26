// Spec: spec/federal/shared-unshared-marketplace-health.yaml.
import { expect,test } from '@playwright/test';
import { guidedSharedUnsharedHealthRecords } from '../../../tests/fixtures/guided-shared-unshared-health-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal={...taxpayerFacts2025,firstName:'Jordan',ssn:'111-22-3333'};
const business={necEntries:[],manualGrossReceipts:'50000',qbiMateriallyParticipated:true,
  expenses:{advertising:'0',carAndTruck:'0',insurance:'0',officeExpense:'0',supplies:'0',travel:'0',meals:'0',utilities:'0',otherExpenses:'0'},
  businessFacts:{accountHolder:'primary',activityDescription:'Independent design services',businessCode:'541430',accountingMethod:'cash',singleBusinessConfirmed:true,incomeReconciled:true,expensesReconciled:true,returnsAndAllowances:'0',costOfGoodsSold:'0',otherIncome:'0',contractLabor:'0',depreciation:'0',legalAndProfessional:'0',w2WagesPaid:'0',ubiaQualifiedProperty:'0',isSST:false,allInvestmentAtRisk:true,priorYearUnallowedLoss:'0',additionalWorksheetRequired:false,otherExpenseDescription:'Fictional qualified business expense',mealsEligibilityConfirmed:true,carExpenseWorksheetConfirmed:true,depreciationWorksheetConfirmed:true}};
for(const scenario of [{method:'agreement',viewport:{width:1280,height:900},agi:'$44,415',premium:'1200',advance:'650',original:'1000'},{method:'no-advance',viewport:{width:390,height:844},agi:'$43,275',premium:'1700',advance:'50',original:'1500'}] as const)test.describe(`Shared ${scenario.method} health`,()=>{
  const {viewport}=scenario;
  test('retains shared and unshared health sources after reload',async({page},testInfo)=>{
    await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
    await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing synthetic return');
    await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
    await page.evaluate(({id,personal,business,records})=>{
      localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify({factsVersion:2,phase:'interview',taxYear:2025,currentSectionIndex:2,completedSections:['personal-info','income-self-employment'],
        segmentation:{filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:['self-employed-health-insurance'],stateCode:null},
        sectionData:{'personal-info':personal,'income-self-employment':business,
          adjustments:{hsaDeduction:'',studentLoanInterest:'',selfEmployedHealthInsurance:'',educatorExpenses:'',iraDeduction:'',alimonyPaid:'',healthInsuranceFacts:records.health},
          credits:{dependentCare:{expenses:'',qualifyingIndividuals:''},education:{aocStudents:[],llcExpenses:''},
            energy:{solarElectricCost:'',solarWaterHeatingCost:'',insulationCost:'',exteriorDoorsWindowsCost:'',roofCost:'',energyEfficientHvacCost:'',waterHeaterHeatPumpCost:''},
            premiumTaxCredit:records.coverage}}}));
    },{id,personal,business,records:guidedSharedUnsharedHealthRecords(scenario.method)});
    await page.reload();const hero=page.locator('.guided-ticker-value-hero').first();
    await testInfo.attach('actual-seeded-state',{body:JSON.stringify(await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}'),id)),contentType:'application/json'});
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText(scenario.agi,{exact:true}).first()).toBeVisible();
    const reference=page.getByRole('textbox',{name:'Plan 1 shared health: Source reference',exact:true});
    const inner=page.getByRole('combobox',{name:'Plan 1 shared health: Person links checked after the last edit',exact:true});
    const allocation=page.getByRole('combobox',{name:'Allocation sources checked after the last edit',exact:true});
    const marketplace=page.getByRole('combobox',{name:'Marketplace sources checked after the last edit',exact:true});
    const outer=page.getByRole('combobox',{name:'Health insurance sources checked after the last edit',exact:true});
    await expect(page.getByRole('combobox',{name:'Plan 1 policy 2: Original Marketplace policy',exact:true})).toHaveValue('form1095A:1');
    await expect(page.getByRole('combobox',{name:'Allocation policy 2: Allocation situation',exact:true})).toHaveValue('not_shared');
    await expect(page.getByRole('combobox',{name:'Allocation policy 2: All covered people belong to this tax family',exact:true})).toHaveValue('true');
    await reference.fill('synthetic-private-shared-unshared-health');await reference.press('Tab');await expect(inner).toHaveValue('');await expect(allocation).toHaveValue('');await expect(marketplace).toHaveValue('');await expect(outer).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
    await inner.selectOption('true');await outer.selectOption('true');
    if(scenario.method==='no-advance')await page.getByRole('combobox',{name:'Allocation policy 1: Benchmark sources checked after the last edit',exact:true}).selectOption('true');
    if(scenario.method==='no-advance')await page.getByRole('combobox',{name:'Complete coverage-family sources checked after the last edit',exact:true}).selectOption('true');
    await allocation.selectOption('true');await marketplace.selectOption('true');await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.adjustments?.healthInsuranceFacts?.plans?.[0]?.sharedMarketplaceSources?.sourceFactsConfirmed,id)).toBe(true);
    await page.reload();await expect(reference).toHaveValue('synthetic-private-shared-unshared-health');await expect(inner).toHaveValue('true');
    const original=page.getByRole('textbox',{name:'Plan 1 payment 1: Original premium',exact:true});await expect(original).toHaveValue(scenario.premium);
    const paid=page.getByRole('textbox',{name:"Plan 1 payment 1: Other person's paid share",exact:true});await paid.fill('');await paid.press('Tab');await expect(inner).toHaveValue('');await expect(outer).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.adjustments?.healthInsuranceFacts?.plans?.[0]?.payments?.[0]?.otherPersonPaid,id)).toBe('');
    await page.reload();await expect(paid).toHaveValue('');await expect(original).toHaveValue(scenario.premium);
    const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData,id);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe(scenario.advance);
    expect(saved.credits.premiumTaxCredit.policies[0].monthlyPremiums[0].enrolleePremium).toBe(scenario.original);
    expect(saved.credits.premiumTaxCredit.policies[1].monthlyPremiums[0].enrolleePremium).toBe('200');
    expect(saved.credits.premiumTaxCredit.sharedPolicyAllocations.policies[1].monthlyAllocations).toEqual([]);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].marketplacePolicySourceIds).toEqual(['form1095A:0','form1095A:1']);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].sharedMarketplaceSources.persons[1].coveredIndividualSsn).toBe('444-55-6666');
    await reference.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`shared-unshared-${scenario.method}-health-${viewport.width}.png`)});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    for(const secret of ['synthetic-private-shared-unshared-health','111-22-3333','444-55-6666','policy-123'])expect(requests.join('\n')).not.toContain(secret);
  });
});
