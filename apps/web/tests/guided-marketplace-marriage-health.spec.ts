// Spec: spec/federal/marketplace-marriage-health.yaml, browser.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { marketplaceMarriageHealthRecords } from '../../../tests/fixtures/marketplace-marriage-health-records';

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

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Marriage and health sources at ${viewport.width}px`, () => {
    test('preserves marriage and health sources through edits and reload', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
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
      }, { id, business, records: marketplaceMarriageHealthRecords() });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('$86,597', { exact: true }).first()).toBeVisible();

      const reference = page.getByRole('textbox', { name: 'Marriage worksheet reference', exact: true });
      const benchmark = page.getByRole('textbox', { name: 'Primary month 1: Corrected alternative SLCSP premium', exact: true });
      const health = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
      const marriage = page.getByRole('combobox', { name: 'Marriage sources checked after the last edit', exact: true });
      const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
      await expect(page.getByRole('textbox', { name: 'Actual marriage date (YYYY-MM-DD)', exact: true })).toHaveValue('2025-07-15');
      await expect(page.getByRole('textbox', { name: 'Plan 1 payment 1: Original premium', exact: true })).toHaveValue('1000');
      await reference.fill('synthetic-private-marriage-health-proof'); await reference.press('Tab');
      await expect(health).toHaveValue(''); await expect(marriage).toHaveValue(''); await expect(marketplace).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await health.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      for (let month = 1; month <= 7; month++) {
        await page.getByRole('combobox', { name: `Primary month ${month}: Benchmark source checked after the last edit`, exact: true }).selectOption('true');
      }
      await marriage.selectOption('true'); await marketplace.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect(page.locator('.guided-ticker-breakdown').getByText('$86,597', { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(reference).toHaveValue('synthetic-private-marriage-health-proof');
      await expect(benchmark).toHaveValue('800'); await expect(health).toHaveValue('true'); await expect(marriage).toHaveValue('true');
      const confirmed = await page.evaluate(id => ({
        state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
        workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id],
      }), id);
      writeFileSync(testInfo.outputPath('actual-confirmed-source.json'), JSON.stringify(confirmed, null, 2) + '\n');
      await benchmark.fill(''); await benchmark.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect(health).toHaveValue(''); await expect(marriage).toHaveValue(''); await expect(marketplace).toHaveValue('');
      await page.reload(); await expect(benchmark).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].grossPremium).toBe('1000');
      expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe('700');
      expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].personAmounts[0].amountPaid).toBe('300');
      expect(saved.credits.premiumTaxCredit.marriageSources.benchmarks[0].slcsp).toBe('');
      expect(saved.credits.premiumTaxCredit.marriageSources.policies[0].original.monthlyPremiums[0].enrolleePremium).toBe('1000');
      await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`marriage-health-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-marriage-health-proof', '111-22-3333', '444-55-6666', 'MARRIAGE-HEALTH-ORIGINAL']) {
        expect(requests.join('\n')).not.toContain(secret);
      }
    });
  });
}
