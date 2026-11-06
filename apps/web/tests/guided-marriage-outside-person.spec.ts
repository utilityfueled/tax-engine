// Spec: spec/federal/marketplace-marriage-outside-person.yaml, browser.
import { expect,test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { marriageOutsidePersonRecords } from '../../../tests/fixtures/marketplace-marriage-outside-person-records';
const business = {
  necEntries: [], manualGrossReceipts: '100000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: {
    accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash',
    singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0',
    contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true,
    priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense',
    mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true,
  },
};

for(const viewport of [{width:1280,height:900},{width:390,height:844}])test.describe(`${viewport.width}px`,()=>{test('preserves actual outside child marriage sources through edits and reload',async({page},testInfo)=>{
 await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
 const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing fictional return');
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
      await page.evaluate(({ id, business, records }) => {
        const workspaces = JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}');
        workspaces.workspaces[id].returnSummary.targetTaxYear = 2025;
        localStorage.setItem('tax-engine.return-workspaces.v1', JSON.stringify(workspaces));
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({
          factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2,
          completedSections: ['personal-info', 'income-self-employment'],
          segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
          sectionData: {
            'personal-info': records.personal, 'income-self-employment': business,
            adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
            credits: {
              dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
              energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' },
              premiumTaxCredit: records.coverage,
            },
          },
        }));
      }, { id, business, records: marriageOutsidePersonRecords() });


 await page.reload();const hero=page.locator('.guided-ticker-value-hero').first();await expect(hero).not.toHaveText('Enter more info for an estimate');
 await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
 await expect(page.locator('.guided-ticker-breakdown').getByText('$86,060',{exact:true}).first()).toBeVisible();
 const prefix='Plan 1 person 2 child relationship',date=page.getByLabel(`${prefix}: Relationship began on`,{exact:true});
 const ref=page.getByRole('textbox',{name:`${prefix}: Source reference`,exact:true});
 await expect(date).toHaveValue('1999-01-02');
 await ref.fill('synthetic-private-parent-child-original');await ref.press('Tab');
 await expect(page.getByRole('combobox',{name:`${prefix}: Sources checked after the last edit`,exact:true})).toHaveValue('');
 await expect(hero).toHaveText('Enter more info for an estimate');
 await page.getByRole('combobox',{name:'Health insurance sources checked after the last edit',exact:true}).selectOption('true');
 await expect(hero).toHaveText('Enter more info for an estimate');
 const reconfirm=async()=>{
  for(let month=1;month<=7;month++)await page.getByRole('combobox',{name:`Primary month ${month}: Benchmark source checked after the last edit`,exact:true}).selectOption('true');
  for(const name of [`${prefix}: Sources checked after the last edit`,'Plan 1 coverage family: Sources checked after the last edit','Plan 1 shared health: Person links checked after the last edit',
   'Health insurance sources checked after the last edit','Allocation policy 1: Benchmark sources checked after the last edit','Allocation sources checked after the last edit',
   'Marriage sources checked after the last edit','Marketplace sources checked after the last edit'])await page.getByRole('combobox',{name,exact:true}).selectOption('true');
 };
 await reconfirm();await expect(hero).not.toHaveText('Enter more info for an estimate');
 await date.fill('');await date.press('Tab');await reconfirm();await expect(hero).toHaveText('Enter more info for an estimate');
 await date.fill('1999-01-02');await date.press('Tab');await reconfirm();await expect(hero).not.toHaveText('Enter more info for an estimate');
 await expect(page.locator('.guided-ticker-breakdown').getByText('$86,060',{exact:true}).first()).toBeVisible();
 await page.reload();await expect(date).toHaveValue('1999-01-02');await expect(ref).toHaveValue('synthetic-private-parent-child-original');
 await expect(page.getByRole('combobox',{name:`${prefix}: Sources checked after the last edit`,exact:true})).toHaveValue('true');
 const confirmed=await page.evaluate(id=>({state:JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}'),workspace:JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]}),id);
 writeFileSync(testInfo.outputPath('actual-confirmed-source.json'),JSON.stringify(confirmed,null,2)+'\n');
 const plan=confirmed.state.sectionData.adjustments.healthInsuranceFacts.plans[0];
 expect(plan.coveredPersons[1].childRelationshipSources).toMatchObject({accountHolder:'primary',ownerSsn:'111-22-3333',coveredIndividualSsn:'234-56-7890',relationshipStartDate:'1999-01-02'});
 expect(plan.coverageFamilySources.outsidePersonReturns[0]).toMatchObject({returnStatus:'completed',form8962Line24:'0',policySourceIds:['form1095A:0']});
 expect(plan.payments[0]).toMatchObject({grossPremium:'3000.03',ownerOrBusinessPaid:'1100.01',otherPersonPaid:'1900.02',advancePremiumTaxCredit:'0'});
 expect(confirmed.state.sectionData.credits.premiumTaxCredit.marriageSources.dependents).toEqual([]);
 await date.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`marriage-outside-person-${viewport.width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 for(const secret of ['synthetic-private-parent-child-original','111-22-3333','444-55-6666','234-56-7890','ACTUAL-UNSHARED-PRIMARY'])expect(requests.join('\n')).not.toContain(secret);
});});
