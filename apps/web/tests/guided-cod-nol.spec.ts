// Spec: spec/federal/guided-cod-nol.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedCodNol } from '../../../tests/fixtures/guided-cod-nol';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic loss employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000',
  federalWithheld: '0', socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200',
  medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Canceled debt sources at ${viewport.width}px`, () => {
    test('preserves actual insolvency source records', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const prior = structuredClone(actualGuidedNolSources);
      const original = prior.vintages?.[0]; if (!original || !prior.alternativeTax) throw new Error('Missing independent synthetic loss sources');
      const first = { ...original, originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] };
      prior.vintages = [first, { ...first, sourceId: 'regular2022', lossTaxYear: '2022' }];
      prior.alternativeTax.vintages = structuredClone(prior.vintages);
      await page.evaluate(({ id, personal, w2, prior, cod }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['cancelled-debt'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, adjustments: { netOperatingLossSources: prior, codNolSources: cod } } }));
      }, { id, personal, w2, prior, cod: actualGuidedCodNol() });
      await page.reload();
      await expect(page.locator('.guided-ticker-value-hero').first()).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('$32,600', { exact: true }).first()).toBeVisible();
      const open = () => page.getByText('Canceled debt and insolvency', { exact: true }).click(); await open();
      const amount = page.getByRole('textbox', { name: 'Debt 1 Box 2 canceled debt', exact: true });
      await amount.fill('40000.50'); await amount.press('Tab'); await expect(amount).toHaveValue('40,000.50');
      await page.getByRole('textbox', { name: 'Canceled-debt packet reference', exact: true }).fill('synthetic-private-insolvency-packet');
      await expect(page.getByRole('textbox', { name: 'Debt 1 Box 3 interest included', exact: true })).toHaveValue('0');
      await expect(page.getByRole('combobox', { name: 'Debt was discharged in a title 11 bankruptcy case', exact: true })).toHaveValue('false');
      await expect(page.getByRole('combobox', { name: 'Liability 1 canceled statement', exact: true })).toHaveValue('Original statement-A');
      const confirmations = ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit', 'Canceled-debt packet checked after the last edit'];
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      for (const name of confirmations) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await expect(page.locator('.guided-ticker-breakdown').getByText('$32,600', { exact: true }).first()).toBeVisible();
      await page.reload(); await open();
      await expect(amount).toHaveValue('40,000.50');
      await expect(page.getByRole('textbox', { name: 'Canceled-debt packet reference', exact: true })).toHaveValue('synthetic-private-insolvency-packet');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('true');
      await page.getByRole('textbox', { name: 'Debt 1 Box 3 interest included', exact: true }).fill('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.codNolSources?.debts?.[0]?.interestIncluded, id)).toBe('');
      await page.reload(); await open();
      await expect(page.getByRole('textbox', { name: 'Debt 1 Box 3 interest included', exact: true })).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.adjustments, id);
      expect(saved.codNolSources.debts[0].amountDischarged).toBe('40,000.50');
      expect(saved.codNolSources.insolvency.liabilities[0].dischargedDebtStatementId).toBe('Original statement-A');
      expect(saved.codNolSources.sourceFactsConfirmed).toBeNull(); expect(saved.netOperatingLossSources.sourceFactsConfirmed).toBeNull();
      expect(saved.codNolSources).not.toHaveProperty('carryforward'); expect(saved.codNolSources).not.toHaveProperty('deduction');
      await amount.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`cod-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-insolvency-packet', personal.ssn, 'Original statement-A']) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
