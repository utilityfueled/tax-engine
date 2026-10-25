// Spec: spec/federal/guided-current-capital-origin.yaml.
import { expect, test } from '@playwright/test';
import { actualCurrentLossOrigin } from '../../../tests/fixtures/guided-current-loss-origin';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { actualCurrentCapitalBrokerage, actualCurrentCapitalOrigin } from '../../../tests/fixtures/guided-current-capital-origin';
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
  test.describe(`Current capital origin at ${viewport.width}px`, () => {
    test('preserves original capital records and independent carry confirmations', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const prior = structuredClone(actualGuidedNolSources); prior.vintages = [];
      if (!prior.alternativeTax) throw new Error('Missing synthetic independent prior AMT history'); prior.alternativeTax.vintages = [];
      await page.evaluate(({ id, personal, w2, business, interest, prior, current, brokerage, capital }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 4, completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, 'income-self-employment': business,
            'income-investments': { interestEntries: [interest], dividendEntries: [], brokerageEntries: [brokerage] },
            adjustments: { netOperatingLossSources: prior, currentLossOrigin: { ...current, capitalSources: capital } } } }));
      }, { id, personal, w2, business, interest, prior, current: actualCurrentLossOrigin, brokerage: actualCurrentCapitalBrokerage, capital: actualCurrentCapitalOrigin });
      await page.reload(); await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$0');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('-$75,000', { exact: true }).first()).toBeVisible();
      const open = async () => { await page.getByText('Current-year net operating loss sources', { exact: true }).click(); await page.getByText('Current loss capital sources', { exact: true }).click(); };
      await open(); await page.getByRole('button', { name: 'Copy original investment capital records', exact: true }).click();
      for (const index of [1, 2]) {
        await page.getByText(`Capital disposition ${index}`, { exact: true }).click();
        await expect(page.getByRole('combobox', { name: `Capital disposition ${index} is a nonbusiness investment`, exact: true })).toHaveValue('');
        await page.getByRole('combobox', { name: `Capital disposition ${index} is a nonbusiness investment`, exact: true }).selectOption('true');
      }
      await expect(page.getByRole('textbox', { name: 'Capital disposition 2 original proceeds', exact: true })).toHaveValue('899.50');
      await page.getByRole('textbox', { name: 'Current capital packet reference', exact: true }).fill('synthetic-private-capital-origin');
      await page.getByRole('textbox', { name: 'Filed prior short-term capital loss Use the actual signed filed loss, or known zero.', exact: true }).fill('-4000');
      await page.getByRole('textbox', { name: 'Filed prior long-term capital loss Use the actual signed filed loss, or known zero.', exact: true }).fill('-3000');
      // Finish the currency field's on-blur formatting before checking the source.
      // selectOption alone does not move focus away from the last textbox.
      await page.getByRole('textbox', { name: 'Filed prior long-term capital loss Use the actual signed filed loss, or known zero.', exact: true }).press('Tab');
      await expect(page.getByRole('textbox', { name: 'Filed prior long-term capital loss Use the actual signed filed loss, or known zero.', exact: true })).toHaveValue('-3,000');
      const confirmations = ['Filed capital carry checked after the last edit', 'Capital AMT comparison checked after the last edit', 'Current capital sources checked after the last edit', 'Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit'];
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      for (const name of confirmations) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$0');
      await expect(page.locator('.guided-ticker-breakdown').getByText('-$78,000', { exact: true }).first()).toBeVisible();
      await page.reload(); await open();
      await expect(page.getByRole('textbox', { name: 'Current capital packet reference', exact: true })).toHaveValue('synthetic-private-capital-origin');
      await expect(page.getByRole('textbox', { name: 'Filed prior short-term capital loss Use the actual signed filed loss, or known zero.', exact: true })).toHaveValue('-4,000');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('true');
      const carry = page.getByRole('textbox', { name: 'Filed prior long-term capital loss Use the actual signed filed loss, or known zero.', exact: true }); await carry.fill('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.currentLossOrigin?.capitalSources?.priorCapitalLosses?.longTermCapitalLoss, id)).toBe('');
      await page.reload(); await open(); await expect(carry).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved['income-investments'].brokerageEntries[0].transactions[1].proceeds).toBe('899.50');
      expect(saved.adjustments.currentLossOrigin.capitalSources.transactions[1].transaction.proceeds).toBe('899.50');
      expect(saved.adjustments.currentLossOrigin.capitalSources.alternativeTax.sourceFactsConfirmed).toBeNull();
      expect(saved.adjustments.currentLossOrigin).not.toHaveProperty('netOperatingLoss');
      await carry.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current-capital-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-capital-origin', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
