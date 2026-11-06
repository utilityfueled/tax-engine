import { expect, test } from '@playwright/test';
import { currentOriginCharitableHistorySources } from '../../../tests/fixtures/form-172-charitable-history-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Current loss charitable histories at ${viewport.width}px`, () => {
    test('preserves current loss and independent charitable histories through the production guide', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = currentOriginCharitableHistorySources(); sources.current.sourceFactsConfirmed = null;
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 4,
        completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [sources.w2] }, 'income-self-employment': sources.business,
          'income-investments': { interestEntries: [sources.interest], dividendEntries: [], brokerageEntries: [] },
          deductions: sources.deductions, adjustments: { netOperatingLossSources: sources.prior, currentLossOrigin: sources.current } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Current loss sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$10,000');
      // Visit the actual next section before using its completed-step shortcut.
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Deductions', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      const openCarry = async () => {
        await page.getByText('Net operating loss carry sources', { exact: true }).click();
        await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      };
      await openCarry();
      await page.getByRole('textbox', { name: 'Charitable carryover packet reference', exact: true }).fill('synthetic-private-current-history');
      for (const label of ['Contribution 1 original excess', 'Contribution 1 opening carryforward', 'AMT charitable carry 1 amount']) {
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.fill('500.49'); await field.press('Tab');
      }
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const label of ['Charitable carryover sources checked after the last edit', 'Charitable carry histories checked after the last edit',
        'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
        await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      }
      for (const label of ['Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit',
        'Current loss sources checked after the last edit']) await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      await page.getByRole('button', { name: /^Deductions(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.reload(); await openCarry();
      const opening = page.getByRole('textbox', { name: 'Contribution 1 opening carryforward', exact: true });
      await expect(opening).toHaveValue('500.49');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.deductions.donationEntries).toEqual(sources.deductions.donationEntries);
      expect(saved.deductions.charitableCarryoverSources.vintages[0].openingCarryforward).toBe('5000');
      expect(saved.adjustments.netOperatingLossSources.vintages).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.vintages).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.alternativeCarryoverSources.vintages[0].openingCarryforward).toBe('500.49');
      await opening.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await opening.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current-history-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-current-history', state.sectionData['personal-info'].ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
