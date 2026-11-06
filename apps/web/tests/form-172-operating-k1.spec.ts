import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { operatingK1GuideSources } from '../../../tests/fixtures/form-172-operating-k1-guide-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Operating K1 current loss at ${viewport.width}px`, () => {
    test('preserves original operating K1 through source confirmation and review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = operatingK1GuideSources(); sources.current.sourceFactsConfirmed = null;
      const entity = sources.qualifiedLoss.activities?.[0]?.entityName;
      if (!entity) throw new Error('Missing fictional original entity');
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3,
        completedSections: ['personal-info', 'income-w2', 'income-investments'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: ['current-year-loss', 'k1-loss-sources'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [sources.w2] }, 'income-investments': { interestEntries: [sources.interest], dividendEntries: [], brokerageEntries: [] },
          adjustments: { netOperatingLossSources: sources.prior, currentLossOrigin: sources.current, k1LossSources: sources.qualifiedLoss },
          deductions: { ...sources.deductions, donationEntries: [], k1CharitableSources: sources.charity } } };
      await page.evaluate(({ id, state }) => { localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true'); localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state)); }, { id, state });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      const actualSource = page.getByRole('combobox', { name: 'Current business 1 source', exact: true });
      await expect(actualSource).toHaveValue('scheduleK1:0');
      await expect(actualSource.locator('option:checked')).toContainText(entity);
      await page.getByRole('combobox', { name: 'Current loss sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$10,000');
      await page.reload(); await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      await expect(actualSource).toHaveValue('scheduleK1:0');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(Object.keys(saved.adjustments)).toEqual(['netOperatingLossSources', 'currentLossOrigin', 'k1LossSources']);
      expect(saved.adjustments.k1LossSources).toEqual(sources.qualifiedLoss); expect(saved.deductions.k1CharitableSources).toEqual(sources.charity);
      expect(saved.adjustments.netOperatingLossSources).toEqual(sources.prior);
      for (const key of ['allowedOrdinary', 'agi', 'originalLoss']) expect(saved.adjustments.currentLossOrigin).not.toHaveProperty(key);
      for (const secret of ['Fictional actual operating business participation', '111-22-3333']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await actualSource.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`operating-k1-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`operating-k1-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", output], { encoding: 'utf8' })) as string[];
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const value of ['Current regular PartI loss 16000', 'Current alternative PartI loss 0', 'Operating K1 1 allowed ordinary business income: -40000', 'Selected regular charitable deduction in nonbusiness group: 6000']) expect(text).toContain(value);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', 'Fictional actual operating business participation']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('Fictional actual operating business participation'))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`operating-k1-review-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Start guided interview', exact: true }).click();
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Current business 1 source', exact: true }).selectOption('');
      await expect(hero).toHaveText('Enter more info for an estimate');
    });
  });
}
