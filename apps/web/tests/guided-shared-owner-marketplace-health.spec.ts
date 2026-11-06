// Spec: spec/federal/shared-owner-marketplace-health.yaml.
import { expect, test } from '@playwright/test';
import { guidedSharedOwnerHealthRecords } from '../../../tests/fixtures/guided-shared-owner-health-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', livedWithSpouseAtAnyTimeDuringYear: true,
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1992-09-10', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '30000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };
const wages = { entries: [{ employerName: 'Actual Spouse Corporation', employerEin: '12-3456789', accountHolder: 'spouse', wages: '20000', federalWithheld: '0', socialSecurityWages: '17000', socialSecurityTips: '0', socialSecurityWithheld: '0', medicareWages: '17000', medicareWithheld: '0', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none', state: '', stateWages: '', stateWithheld: '' }] };

for (const scenario of [{ second: 'shared', viewport: { width: 1280, height: 900 }, premium: '500', advance: '10' }, { second: 'household', viewport: { width: 390, height: 844 }, premium: '250', advance: '5' }] as const) test.describe(`Separate ${scenario.second} plan health`, () => {
  test('retains actual separate health plans through source edits and reload', async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport); const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, business, wages, records }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'income-self-employment'],
        segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment', 'w2-wages'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-self-employment': business, 'income-w2': wages,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, business, wages, records: guidedSharedOwnerHealthRecords(scenario.second) });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText('$46,657', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Plan 2 shared health: Source reference', exact: true });
    const inner = (plan: number) => page.getByRole('combobox', { name: `Plan ${plan} shared health: Person links checked after the last edit`, exact: true });
    const outer = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const allocation = page.getByRole('combobox', { name: 'Allocation sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    await expect(page.getByRole('combobox', { name: 'Plan 2: Business or shareholder employer', exact: true })).toHaveValue('formW2:0');
    await expect(page.getByRole('combobox', { name: 'Plan 2 policy 1: Original Marketplace policy', exact: true })).toHaveValue('form1095A:1');
    await expect(page.getByRole('combobox', { name: 'Allocation policy 2: Allocation situation', exact: true })).toHaveValue(scenario.second === 'shared' ? 'other_two_tax_families' : 'not_shared');
    await reference.fill('synthetic-private-separate-owner-health'); await reference.press('Tab');
    for (const field of [inner(1), inner(2), outer, allocation, marketplace]) await expect(field).toHaveValue('');
    await expect(hero).toHaveText('Enter more info for an estimate');
    for (const field of [inner(1), inner(2), outer, allocation, marketplace]) await field.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.healthInsuranceFacts?.plans?.[1]?.sharedMarketplaceSources?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-separate-owner-health'); await expect(inner(2)).toHaveValue('true');
    const original = page.getByRole('textbox', { name: 'Plan 2 payment 1: Original premium', exact: true }); await expect(original).toHaveValue(scenario.premium);
    const paid = page.getByRole('textbox', { name: "Plan 2 payment 1: Other person's paid share", exact: true });
    await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`separate-owner-valid-${scenario.viewport.width}.png`) });
    await paid.fill(''); await paid.press('Tab'); await expect(inner(2)).toHaveValue(''); await expect(outer).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.healthInsuranceFacts?.plans?.[1]?.payments?.[0]?.otherPersonPaid, id)).toBe('');
    await page.reload(); await expect(paid).toHaveValue(''); await expect(original).toHaveValue(scenario.premium);
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.healthInsuranceFacts.plans.map((plan: { accountHolder: string; businessSourceId: string; marketplacePolicySourceIds: string[] }) => [plan.accountHolder, plan.businessSourceId, plan.marketplacePolicySourceIds])).toEqual([['primary', 'scheduleC', ['form1095A:0']], ['spouse', 'formW2:0', ['form1095A:1']]]);
    expect(saved.adjustments.healthInsuranceFacts.plans[1].payments[0].advancePremiumTaxCredit).toBe(scenario.advance);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].otherPersonPaid).toBe('490');
    expect(saved.credits.premiumTaxCredit.policies[1].monthlyPremiums[0].enrolleePremium).toBe(scenario.premium);
    expect(saved.adjustments.healthInsuranceFacts.plans[1].sharedMarketplaceSources.persons[0].coveredIndividualSsn).toBe('222-33-4444');
    await paid.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`separate-owner-unknown-${scenario.viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const secret of ['synthetic-private-separate-owner-health', '111-22-3333', '222-33-4444', '444-55-6666', '345-67-8901', 'actual-spouse-policy']) expect(requests.join('\n')).not.toContain(secret);
  });
});
