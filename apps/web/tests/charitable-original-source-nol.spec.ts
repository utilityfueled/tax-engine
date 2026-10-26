import { expect, test } from '@playwright/test';
import { originalCharitableGuideSources } from '../../../tests/fixtures/charitable-original-nol-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Original charitable NOL sources at ${viewport.width}px`, () => {
    test('preserves original charitable receipts and independent NOL histories', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const { loss, charity } = originalCharitableGuideSources();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3,
        completedSections: ['personal-info', 'income-w2', 'adjustments'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [{ employerName: 'Synthetic Original Charity Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '30000',
            socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
          adjustments: { netOperatingLossSources: loss }, deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0',
            casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: charity } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$44,000');
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' })).toContainText('$30,800');
      const openCharity = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
        await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      };
      await openCharity();
      await page.getByRole('textbox', { name: 'K-1 charitable packet source reference', exact: true }).fill('synthetic-private-original-NOL');
      for (const label of ['Charitable K-1 1 original capital gain property code E', 'Charitable K-1 1 current gift 1 contribution share', 'Charitable K-1 1 receipt 1 allocated original fair market value']) {
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.fill('80000.49'); await field.press('Tab');
      }
      const charitableConfirmations = ['Charitable K-1 1 basis', 'Charitable K-1 1 at risk', 'Charitable K-1 1 prior at-risk history', 'K-1 charitable packet'];
      for (const prefix of charitableConfirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const prefix of charitableConfirmations) await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      const lossConfirmations = ['Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit'];
      for (const label of lossConfirmations) await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
      for (const label of lossConfirmations) await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      await page.reload(); await openCharity();
      const original = page.getByRole('textbox', { name: 'Charitable K-1 1 original capital gain property code E', exact: true });
      await expect(original).toHaveValue('80,000.49');
      await expect(page.getByRole('textbox', { name: 'Charitable K-1 1 current gift 1 adjusted basis share', exact: true })).toHaveValue('40,000.00');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(Object.keys(saved.adjustments)).toEqual(['netOperatingLossSources']);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorRegularCarryovers).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorAlternativeCarryovers).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.vintages).toEqual([]);
      expect(saved.deductions.k1CharitableSources.statements[0].original.form6198.otherIncomeGains).toBe('0');
      expect(saved.deductions.k1CharitableSources.statements[0].original.section199AIsSST).toBe(false);
      for (const key of ['agi', 'allowedDeduction', 'charitableCarryforward']) expect(saved.deductions.k1CharitableSources).not.toHaveProperty(key);
      await original.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.original?.charitableCapitalGain30, id)).toBe('');
      await original.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`original-charity-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-original-NOL', 'original-gift-1', state.sectionData['personal-info'].ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
