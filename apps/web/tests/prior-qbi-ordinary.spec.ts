// Spec: qbi-prior-carry-sources.yaml production
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GuidedFlowState } from '../src/lib/guided-interview-flow';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual ordinary prior QBI at ${viewport.width}px`, () => {
    test('retains actual ordinary prior sources without NOL setup through review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = JSON.parse(readFileSync(new URL('../../../tests/fixtures/guided-prior-qbi-ordinary-browser.json', import.meta.url), 'utf8')) as GuidedFlowState;
      state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
      const original = structuredClone(state.sectionData.adjustments!.k1LossSources!);
      expect(state.segmentation.lifeEvents).not.toContain('net-operating-loss');
      expect(state.sectionData.adjustments!.netOperatingLossSources).toBeUndefined();
      state.sectionData.adjustments!.k1LossSources!.sourceFactsConfirmed = null;
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const open = async () => {
        await page.getByText('K-1 and qualified loss sources', { exact: true }).click();
        await page.getByText('K-1 1 original and histories', { exact: true }).click();
      };
      await open();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('combobox', { name: 'K-1 packet checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const prior = page.getByRole('textbox', { name: 'Prior ordinary QBI filed ordinary loss carry', exact: true });
      const priorStatus = page.getByRole('combobox', { name: 'Prior ordinary QBI actual prior filing status', exact: true });
      await expect(priorStatus).toHaveValue('married_filing_jointly');
      await expect(page.getByRole('textbox', { name: 'Prior ordinary QBI original preceding-year return', exact: true })).toHaveValue('ordinary-filed-prior-return');
      await prior.fill(''); await prior.press('Tab'); await expect(hero).toHaveText('Enter more info for an estimate');
      const confirmations = page.getByRole('combobox', { name: /checked after the last edit$/ });
      expect(await confirmations.count()).toBeGreaterThanOrEqual(6);
      for (const field of await confirmations.all()) await expect(field).toHaveValue('');
      await prior.fill('0'); await prior.press('Tab');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await prior.fill('7000'); await prior.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await open(); await expect(prior).toHaveValue('7,000');
      await expect(priorStatus).toHaveValue('married_filing_jointly');
      await expect(page.getByRole('combobox', { name: 'Prior ordinary QBI same taxpayers on the prior and current returns', exact: true })).toHaveValue('true');
      await expect(page.getByRole('textbox', { name: 'Prior ordinary QBI independently recorded active portion (optional)', exact: true })).toHaveValue('');
      await priorStatus.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`ordinary-prior-qbi-filing-unit-${viewport.width}.png`) });
      await prior.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) expect(await prior.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
      await page.screenshot({ path: testInfo.outputPath(`ordinary-prior-qbi-source-${viewport.width}.png`) });
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      expect(saved.sectionData.adjustments.netOperatingLossSources).toBeUndefined();
      expect(saved.sectionData.adjustments.k1LossSources.activities).toEqual(original.activities);
      expect(saved.sectionData.adjustments.k1LossSources.priorQbiCarry.lossCarryforward).toBe('7,000');
      expect(saved.sectionData.adjustments.k1LossSources.priorQbiCarry.sourceFactsConfirmed).toBe(true);
      expect(saved.sectionData.adjustments.k1LossSources.priorQbiCarry.activeLossCarryforward).toBeUndefined();
      for (const key of ['currentDeduction', 'agi', 'taxableIncome', 'qbiDeduction']) expect(saved.sectionData.adjustments).not.toHaveProperty(key);
      await writeFile(testInfo.outputPath(`ordinary-prior-qbi-original-workspace-${viewport.width}.json`), JSON.stringify(saved, null, 2));
      expect(requests.some(row => row.body.includes(original.priorQbiCarry!.sourceReference!))).toBe(false);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Deductions', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const file = testInfo.outputPath(`ordinary-prior-qbi-review-${viewport.width}.pdf`); await (await downloading).saveAs(file);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Actual opening ordinary QBI loss carry: $7000', 'Ordinary QBI loss carryforward: $0',
        'Active-character portion of the ordinary prior carry: unknown', '18600']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', '222-33-4444', '222334444', 'ordinary-filed-prior-return', original.priorQbiCarry!.sourceReference!]) expect(text).not.toContain(secret);
      for (const request of requests.filter(row => row.body.includes(original.priorQbiCarry!.sourceReference!))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`ordinary-prior-qbi-review-${viewport.width}.png`) });
    });
  });
}
