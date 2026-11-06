// Spec: spec/federal/marketplace-business-credit-method.yaml.
import { expect, test } from '@playwright/test';
import { guidedMarketplaceBusinessCreditMethodRecords } from '../../../tests/fixtures/guided-marketplace-business-credit-method-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-02-15',
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1990-02-15', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '20000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };

const wages = { entries: [{ employerName: 'Actual Shareholder Corporation', employerEin: '12-3456789', accountHolder: 'spouse', wages: '20000', federalWithheld: '0', socialSecurityWages: '14000', socialSecurityTips: '0', socialSecurityWithheld: '868', medicareWages: '14000', medicareWithheld: '203', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none', state: '', stateWages: '', stateWithheld: '' }] };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`Recorded business method at ${viewport.width}px`, () => {
  test('preserves the recorded method and independent owner sources through edits and reload', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, business, wages, records }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'income-self-employment'],
        segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment', 'w2-wages'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-self-employment': business, 'income-w2': wages,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' }, energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, business, wages, records: guidedMarketplaceBusinessCreditMethodRecords() });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText('$35,587', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Credit allocation source reference', exact: true });
    const method = page.getByRole('combobox', { name: 'Credit allocation method', exact: true });
    const consistency = page.getByRole('combobox', { name: 'Same method used for every calculation', exact: true });
    const choice = page.getByRole('combobox', { name: 'Credit allocation choice checked after the last edit', exact: true });
    const family = (plan: number) => page.getByRole('combobox', { name: `Plan ${plan} coverage family: Sources checked after the last edit`, exact: true });
    const outer = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    await expect(method).toHaveValue('monthly_eligible_plan_enrollment');
    await expect(page.getByRole('combobox', { name: 'Plan 2: Business or shareholder employer', exact: true })).toHaveValue('formW2:0');
    await reference.fill('synthetic-private-recorded-business-method'); await reference.press('Tab');
    for (const field of [choice, family(1), family(2), outer, marketplace]) await expect(field).toHaveValue('');
    await expect(hero).toHaveText('Enter more info for an estimate'); await expect(consistency).toHaveValue('true');
    for (const field of [family(1), family(2), choice, outer, marketplace]) await field.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.locator('.guided-ticker-breakdown').getByText('$35,587', { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.healthInsuranceFacts?.marketplaceCreditAllocation?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-recorded-business-method'); await expect(choice).toHaveValue('true');
    const original = page.getByRole('textbox', { name: 'Plan 1 payment 1: Original premium', exact: true }); await expect(original).toHaveValue('750');
    await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`business-method-valid-${viewport.width}.png`) });
    await consistency.selectOption(''); await expect(choice).toHaveValue(''); await expect(outer).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(consistency).toHaveValue(''); await expect(method).toHaveValue('monthly_eligible_plan_enrollment');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.healthInsuranceFacts.marketplaceCreditAllocation.sameMethodForAllCalculationsConfirmed).toBeNull();
    expect(saved.adjustments.healthInsuranceFacts.plans.map((plan: { accountHolder: string; businessSourceId: string; marketplacePolicySourceIds: string[] }) => [plan.accountHolder, plan.businessSourceId, plan.marketplacePolicySourceIds])).toEqual([['primary', 'scheduleC', ['form1095A:0']], ['spouse', 'formW2:0', ['form1095A:1']]]);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].grossPremium).toBe('750');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe('0');
    expect(saved.credits.premiumTaxCredit.policies[1].monthlyPremiums[0].enrolleePremium).toBe('500');
    expect(saved.credits.premiumTaxCredit.policies[0].coveredIndividuals[1].ssn).toBe('987-65-4321');
    await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`business-method-unknown-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-recorded-business-method', '123-45-6789', '987-65-4321', 'Actual shareholder family policy']) expect(requests.join('\n')).not.toContain(value);
  });
});
