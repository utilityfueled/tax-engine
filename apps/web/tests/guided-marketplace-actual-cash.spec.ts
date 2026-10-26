// Spec: spec/federal/marketplace-actual-cash-health.yaml, browser.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { marketplaceActualCashRecords } from '../../../tests/fixtures/marketplace-actual-cash-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-02-15',
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1990-02-15', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '300000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };
for (const scenario of [{ width: 1280, height: 900, shared: false }, { width: 390, height: 844, shared: true }]) test.describe(`Actual independent cash at ${scenario.width}px`, () => {
  test('preserves actual payments independently of policy allocation after edits and reload', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height }); const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, business, records }) => {
      const workspaces = JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}');
      workspaces.workspaces[id].returnSummary.targetTaxYear = 2025;
      localStorage.setItem('tax-engine.return-workspaces.v1', JSON.stringify(workspaces));
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-self-employment'],
        segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-self-employment': business,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' }, energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, business, records: marketplaceActualCashRecords(scenario.shared) });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText('$279,665', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Plan 1 coverage family: Source reference', exact: true });
    const benchmark = page.getByRole('textbox', { name: 'Plan 1 coverage family month 1: Noncoverage-family SLCSP', exact: true });
    const family = page.getByRole('combobox', { name: 'Plan 1 coverage family: Sources checked after the last edit', exact: true });
    const outer = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    await reference.fill('synthetic-private-actual-cash-proof'); await reference.press('Tab'); await benchmark.fill('600'); await benchmark.press('Tab');
    await expect(family).toHaveValue(''); await expect(outer).toHaveValue(''); await expect(marketplace).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await family.selectOption('true');
    if (scenario.shared) {
      await page.getByRole('combobox', { name: 'Plan 1 shared health: Person links checked after the last edit', exact: true }).selectOption('true');
      await page.getByRole('combobox', { name: 'Allocation policy 1: Benchmark sources checked after the last edit', exact: true }).selectOption('true');
      await page.getByRole('combobox', { name: 'Allocation sources checked after the last edit', exact: true }).selectOption('true');
    }
    await outer.selectOption('true'); await marketplace.selectOption('true'); await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.locator('.guided-ticker-breakdown').getByText('$279,665', { exact: true }).first()).toBeVisible();
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-actual-cash-proof'); await expect(benchmark).toHaveValue('600'); await expect(family).toHaveValue('true');
    const original = page.getByRole('textbox', { name: 'Plan 1 payment 1: Original premium', exact: true }); await expect(original).toHaveValue(scenario.shared ? '1875' : '1250');
    const actualSaved = await page.evaluate(id => ({
      state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
      workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id],
    }), id);
    writeFileSync(testInfo.outputPath('actual-confirmed-source.json'), JSON.stringify(actualSaved, null, 2) + '\n');
    const otherMec = page.getByRole('combobox', { name: 'Plan 1 coverage family month 1 person 2: Eligible for other minimum essential coverage', exact: true });
    await otherMec.selectOption(''); await expect(family).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(otherMec).toHaveValue(''); await expect(benchmark).toHaveValue('600');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].grossPremium).toBe(scenario.shared ? '1875' : '1250');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe('0');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].coverageFamilySources.months[0].personFacts[1].otherMecEligible).toBeNull();
    expect(saved.credits.premiumTaxCredit.policies[0].coveredIndividuals[1].ssn).toBe('987-65-4321');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts[1].advancePremiumTaxCredit).toBe('0');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].ownerOrBusinessPaid).toBe('450');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].otherPersonPaid).toBe(scenario.shared ? '1425' : '800');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts[0].amountPaid).toBe('300');
    await benchmark.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`actual-cash-${scenario.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-actual-cash-proof', '123-45-6789', '987-65-4321', '234-56-7890', 'ACTUAL-POLICY']) expect(requests.join('\n')).not.toContain(value);
  });
});
