// Spec: spec/federal/marketplace-outside-person-health.yaml, browser.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { marketplaceOutsidePersonRecords } from '../../../tests/fixtures/marketplace-outside-person-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-02-15',
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1990-02-15', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '300000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };
for (const scenario of [{ width: 1280, height: 900, actualFamilyCash: false }, { width: 390, height: 844, actualFamilyCash: true }]) test.describe(`Actual outside child cash at ${scenario.width}px`, () => {
  test('preserves actual outside child payments and qualification after edits and reload', async ({ page }, testInfo) => {
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
    }, { id, personal, business: { ...business, manualGrossReceipts: scenario.actualFamilyCash ? '300000' : '40000' }, records: marketplaceOutsidePersonRecords(scenario.actualFamilyCash) });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText(scenario.actualFamilyCash ? '$278,465' : '$32,974', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Plan 1 coverage family: Source reference', exact: true });
    const age = page.getByRole('textbox', { name: 'Person 3: Attained age at year end', exact: true });
    const family = page.getByRole('combobox', { name: 'Plan 1 coverage family: Sources checked after the last edit', exact: true });
    const outer = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    const reconfirm = async () => {
      for (const label of ['Plan 1 coverage family: Sources checked after the last edit', 'Plan 1 shared health: Person links checked after the last edit', 'Allocation policy 1: Benchmark sources checked after the last edit', 'Allocation sources checked after the last edit', 'Health insurance sources checked after the last edit', 'Marketplace sources checked after the last edit']) await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
    };
    const otherCredit = page.getByRole('textbox', { name: 'Plan 1 coverage family other return 1: Actual Form 8962 line 24', exact: true });
    const otherStatus = page.getByRole('combobox', { name: 'Plan 1 coverage family other return 1: Return status', exact: true });
    await expect(otherCredit).toHaveValue('0'); await expect(otherStatus).toHaveValue('completed');
    await otherStatus.selectOption('draft'); await reconfirm();
    await expect(hero).toHaveText('Enter more info for an estimate');
    await otherStatus.selectOption('completed'); await otherCredit.fill(''); await otherCredit.press('Tab'); await reconfirm();
    await expect(hero).toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(otherCredit).toHaveValue('');
    await otherCredit.fill('0'); await otherCredit.press('Tab'); await reconfirm();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(age).toHaveValue('26');
    await age.fill('27'); await age.press('Tab');
    await expect(family).toHaveValue(''); await expect(outer).toHaveValue(''); await expect(marketplace).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await reconfirm();
    await expect(page.locator('.guided-ticker-breakdown').getByText(scenario.actualFamilyCash ? '$279,665' : '$34,174', { exact: true }).first()).toBeVisible();
    await age.fill('26'); await age.press('Tab'); await reference.fill('synthetic-private-outside-child-cash'); await reference.press('Tab');
    await reconfirm(); await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.locator('.guided-ticker-breakdown').getByText(scenario.actualFamilyCash ? '$278,465' : '$32,974', { exact: true }).first()).toBeVisible();
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-outside-child-cash'); await expect(age).toHaveValue('26'); await expect(family).toHaveValue('true');
    const original = page.getByRole('textbox', { name: 'Plan 1 payment 1: Original premium', exact: true }); await expect(original).toHaveValue('1875');
    await otherCredit.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`outside-other-return-${scenario.width}.png`) });
    const actualSaved = await page.evaluate(id => ({
      state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
      workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id],
    }), id);
    writeFileSync(testInfo.outputPath('actual-confirmed-source.json'), JSON.stringify(actualSaved, null, 2) + '\n');
    await age.fill(''); await age.press('Tab'); await expect(family).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(age).toHaveValue('');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].coverageFamilySources.outsidePersonReturns[0]).toMatchObject({ returnStatus: 'completed', form8962Line24: '0', sourceTaxYear: '2025', policySourceIds: ['form1095A:0'] });
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].grossPremium).toBe('1875');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe('0');
    expect(saved.adjustments.healthInsuranceFacts.persons.find((person: { personId: string }) => person.personId === 'outside').attainedAgeAtYearEnd).toBe('');
    expect(saved.credits.premiumTaxCredit.policies[0].coveredIndividuals[1].ssn).toBe('987-65-4321');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts[1].advancePremiumTaxCredit).toBe('0');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].ownerOrBusinessPaid).toBe(scenario.actualFamilyCash ? '550' : '1350');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].otherPersonPaid).toBe(scenario.actualFamilyCash ? '1325' : '525');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts[0].amountPaid).toBe(scenario.actualFamilyCash ? '300' : '850');
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts.find((person: { personId: string }) => person.personId === 'outside').amountPaid).toBe('100');
    await age.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`outside-child-${scenario.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-outside-child-cash', '123-45-6789', '987-65-4321', '234-56-7890', 'ACTUAL-POLICY']) expect(requests.join('\n')).not.toContain(value);
  });
});
