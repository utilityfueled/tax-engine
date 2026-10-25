// Spec: spec/federal/guided-current-loss-origin.yaml.
import { expect, test } from '@playwright/test';
import { actualCurrentLossOrigin } from '../../../tests/fixtures/guided-current-loss-origin';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic loss employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '20000', federalWithheld: '0',
  socialSecurityWages: '20000', socialSecurityTips: '0', socialSecurityWithheld: '1240', medicareWages: '20000', medicareWithheld: '290',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
const business = { necEntries: [], manualGrossReceipts: '0', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '100000' },
  businessFacts: { businessName: 'Actual active sole proprietorship', accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430',
    accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0',
    contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true,
    priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional actual current operating expense',
    mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };
const interest = { payer: 'Synthetic bank', payerTin: '12-3456789', accountHolder: 'primary', interestIncome: '5000', federalWithheld: '0',
  earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', foreignTaxPaid: '0', foreignCountry: '', taxExemptInterest: '0', privateActivityBondInterest: '0',
  marketDiscount: '0', bondPremium: '0', treasuryBondPremium: '0', taxExemptBondPremium: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Current loss sources at ${viewport.width}px`, () => {
    test('preserves actual current loss source facts', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const prior = structuredClone(actualGuidedNolSources); prior.vintages = [];
      if (!prior.alternativeTax) throw new Error('Missing synthetic independent prior AMT history');
      prior.alternativeTax.vintages = [];
      await page.evaluate(({ id, personal, w2, business, interest, prior, current }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 4, completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, 'income-self-employment': business,
            'income-investments': { interestEntries: [interest], dividendEntries: [], brokerageEntries: [] },
            adjustments: { netOperatingLossSources: prior, currentLossOrigin: current } } }));
      }, { id, personal, w2, business, interest, prior, current: actualCurrentLossOrigin });
      await page.reload();
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$0');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('-$75,000', { exact: true }).first()).toBeVisible();
      const open = () => page.getByText('Current-year net operating loss sources', { exact: true }).click(); await open();
      await page.getByRole('textbox', { name: 'Current loss packet reference', exact: true }).fill('synthetic-private-current-origin');
      const confirmations = ['Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit'];
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      for (const name of confirmations) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.currentLossOrigin?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(page.getByRole('textbox', { name: 'Current loss packet reference', exact: true })).toHaveValue('synthetic-private-current-origin');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('true');
      const depreciation = page.getByRole('combobox', { name: 'Current regular and AMT depreciation are the same', exact: true });
      await depreciation.selectOption('false'); await expect(depreciation).toHaveValue('false');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await depreciation.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.currentLossOrigin?.alternativeTax?.regularDepreciationSameAsAlternativeConfirmed, id)).toBeNull();
      await page.reload(); await open(); await expect(depreciation).toHaveValue('');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved['income-self-employment'].expenses.otherExpenses).toBe('100000');
      expect(saved.adjustments.netOperatingLossSources.vintages).toEqual([]); expect(saved.adjustments.netOperatingLossSources.alternativeTax.vintages).toEqual([]);
      expect(saved.adjustments.currentLossOrigin).not.toHaveProperty('netOperatingLoss');
      await depreciation.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current-origin-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-current-origin', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
