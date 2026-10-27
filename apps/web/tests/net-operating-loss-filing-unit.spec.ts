// Spec: net-operating-loss-filing-unit-history.yaml production-history
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GuidedFlowState } from '../src/lib/guided-interview-flow';

function guidedChangedNolFixture(): GuidedFlowState {
  return JSON.parse(readFileSync(new URL('../../../tests/fixtures/guided-net-operating-loss-filing-unit-browser.json', import.meta.url), 'utf8')) as GuidedFlowState;
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual NOL owner histories at ${viewport.width}px`, () => {
    test('preserves actual owner histories through edits reload and review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = guidedChangedNolFixture(); state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
      const original = state.sectionData.adjustments!.netOperatingLossSources!;
      original.sourceFactsConfirmed = null;
      state.sectionData.adjustments = { netOperatingLossSources: original };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const open = () => page.getByText('Net operating loss carry sources', { exact: true }).click();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('Enter more info for an estimate');
      await open();
      const regularConfirmed = page.getByRole('combobox', { name: 'Regular NOL sources checked after the last edit', exact: true });
      await regularConfirmed.selectOption('true'); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$22,600');
      const absorption = page.getByRole('textbox', { name: 'Regular loss 1 history 1 filed use 1 owner 1 modified absorption', exact: true });
      const opening = page.getByRole('textbox', { name: 'Regular loss 1 opening carryforward', exact: true });
      await absorption.fill('5001');
      await page.getByRole('textbox', { name: 'Regular loss 1 history 1 filed use 1 return modified absorption', exact: true }).fill('5001');
      await page.getByRole('textbox', { name: 'Regular loss 1 history 1 NOL used', exact: true }).fill('5001');
      await opening.fill('47999'); await opening.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      const confirmations = page.getByRole('combobox', { name: /(?:sources|Filing-unit sources) checked after the last edit$/ });
      expect(await confirmations.count()).toBe(14);
      for (const field of await confirmations.all()) await expect(field).toHaveValue('');
      const included = page.getByRole('combobox', { name: 'Regular loss 1 history 1 filed use 1 all original owners included', exact: true });
      await included.selectOption('false');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await included.selectOption('true');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(absorption).toHaveValue('5,001'); await expect(opening).toHaveValue('47,999');
      await expect(page.getByRole('textbox', { name: 'AMT loss 1 original filed loss', exact: true })).toHaveValue('20000');
      await absorption.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await absorption.fill('5001'); await absorption.press('Tab');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await absorption.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) expect(await absorption.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
      await page.screenshot({ path: testInfo.outputPath(`nol-owner-history-${viewport.width}.png`) });
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const sources = saved.sectionData.adjustments.netOperatingLossSources;
      expect(Object.keys(saved.sectionData.adjustments)).toEqual(['netOperatingLossSources']);
      expect(sources.filingUnitHistory.persons).toEqual(original.filingUnitHistory!.persons);
      expect(sources.vintages[0].filingUnitOrigin).toEqual(original.vintages![0]!.filingUnitOrigin);
      expect(sources.alternativeTax.vintages).toEqual(original.alternativeTax!.vintages);
      expect(sources.vintages[0].history[0].filingUnitUses[0].owners[0].claimedDeduction).toBe('5000');
      for (const key of ['currentDeduction', 'ownerCurrentDeduction', 'agi', 'taxableIncome']) expect(sources).not.toHaveProperty(key);
      await writeFile(testInfo.outputPath(`nol-owner-original-workspace-${viewport.width}.json`), JSON.stringify(saved, null, 2));
      for (const secret of ['Actual complete filed membership records', '111-22-3333']) expect(requests.some(row => row.body.includes(secret))).toBe(false);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`nol-owner-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", output],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['ACTUAL FILED OWNER HISTORY', 'Original owner allocation: 60000', 'Owner remaining after year: 47999', 'Regular NOL: claimed 27400', 'remaining 20599']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', 'Alex Rowe', 'Riley Stone', 'Actual complete filed membership records']) expect(text).not.toContain(secret);
      for (const request of requests.filter(row => row.body.includes('Actual complete filed membership records'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`nol-owner-review-${viewport.width}.png`) });
    });
  });
}
