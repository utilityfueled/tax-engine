import { expect, test } from '@playwright/test';
import { carriedCurrentCharitableSources } from '../../../tests/fixtures/form-172-charitable-carried-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Old and current charitable loss sources at ${viewport.width}px`, () => {
    test('preserves old and current loss sources through the production guide', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = carriedCurrentCharitableSources(); sources.current.sourceFactsConfirmed = null;
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
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Deductions', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      await page.getByRole('textbox', { name: 'AMT loss 1 original worksheet reference', exact: true }).fill('synthetic-private-old-amt');
      for (const label of ['AMT loss 1 original filed loss', 'AMT loss 1 opening carryforward']) {
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.fill('100001'); await field.press('Tab');
      }
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      for (const label of ['Charitable carryover sources checked after the last edit', 'Charitable carry histories checked after the last edit',
        'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit',
        'Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit',
        'Current loss sources checked after the last edit']) {
        await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      }
      await page.getByRole('button', { name: /^Deductions(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.reload(); await page.getByText('Net operating loss carry sources', { exact: true }).click();
      const opening = page.getByRole('textbox', { name: 'AMT loss 1 opening carryforward', exact: true });
      await expect(opening).toHaveValue('100,001');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.deductions.donationEntries).toEqual(sources.deductions.donationEntries);
      expect(saved.deductions.charitableCarryoverSources.vintages[0].openingCarryforward).toBe('5000');
      expect(saved.adjustments.netOperatingLossSources.vintages).toEqual(sources.prior.vintages);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.vintages[0].openingCarryforward).toBe('100,001');
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory).toEqual(sources.prior.alternativeTax?.charitableCarryoverHistory);
      await opening.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await opening.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`carried-current-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-old-amt', state.sectionData['personal-info'].ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
