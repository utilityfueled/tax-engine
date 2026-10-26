// Spec: spec/federal/form-172-charitable-origin.yaml browser-independent-history.
import { expect, test } from '@playwright/test';
import { guidedCurrentCharitableOriginals } from '../../../tests/fixtures/guided-form-172-charitable-origin-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Current charitable origins at ${viewport.width}px`, () => {
    test('requires actual independent histories for current charitable origins', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = guidedCurrentCharitableOriginals();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 4,
        completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [sources.w2] }, 'income-self-employment': sources.business,
          'income-investments': { interestEntries: [sources.interest], dividendEntries: [], brokerageEntries: [] },
          deductions: sources.deductions, adjustments: { netOperatingLossSources: sources.prior, currentLossOrigin: sources.current } } };
      const alternative = state.sectionData.adjustments.netOperatingLossSources.alternativeTax;
      if (!alternative) throw new Error('Missing fictional original alternative source');
      alternative.charitableCarryoverHistory = undefined;
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      const openCarry = () => page.getByText('Net operating loss carry sources', { exact: true }).click();
      await openCarry();
      await page.getByRole('button', { name: 'Add independent charitable carry histories', exact: true }).click();
      await expect(page.getByText('This regular charitable history is unknown.', { exact: true })).toBeVisible();
      await expect(page.getByText('This AMT charitable history is unknown.', { exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: 'Charitable histories source tax year', exact: true }).fill('2024');
      await page.getByRole('textbox', { name: 'Charitable histories source reference', exact: true }).fill('synthetic-private-current-charity');
      await page.getByRole('button', { name: 'Record no prior regular charitable carryovers', exact: true }).click();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Record no prior AMT charitable carryovers', exact: true }).click();
      for (const name of ['All prior regular and AMT charitable carryovers included', 'Charitable carry histories checked after the last edit',
        'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      for (const name of ['Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit',
        'Current loss sources checked after the last edit']) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$10,000');
      await page.reload(); await openCarry();
      await expect(page.getByRole('textbox', { name: 'Charitable histories source reference', exact: true })).toHaveValue('synthetic-private-current-charity');
      await expect(page.getByRole('combobox', { name: 'Charitable carry histories checked after the last edit', exact: true })).toHaveValue('true');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.deductions.donationEntries[0].amount).toBe('20,000.49');
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorRegularCarryovers).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorAlternativeCarryovers).toEqual([]);
      expect(saved.adjustments.currentLossOrigin.sourceFactsConfirmed).toBe(true);
      for (const key of ['netOperatingLoss', 'charitableCarryforward', 'allowedDeduction']) expect(saved.adjustments.currentLossOrigin).not.toHaveProperty(key);
      await page.getByRole('button', { name: 'Remove independent charitable carry histories', exact: true }).click();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await openCarry();
      const add = page.getByRole('button', { name: 'Add independent charitable carry histories', exact: true });
      await expect(add).toBeVisible(); await add.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`current-charity-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-current-charity', state.sectionData['personal-info']?.ssn]) if (secret) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
