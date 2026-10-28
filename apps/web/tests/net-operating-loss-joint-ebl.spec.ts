// Spec: net-operating-loss-joint-ebl.yaml production-source
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GuidedFlowState } from '../src/lib/guided-interview-flow';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual joint EBL sources at ${viewport.width}px`, () => {
    test('preserves actual EBL character through edit reload and review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = JSON.parse(readFileSync(new URL('../../../tests/fixtures/guided-net-operating-loss-joint-ebl-browser.json', import.meta.url), 'utf8')) as GuidedFlowState;
      state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
      const originals = structuredClone(state.sectionData.adjustments!);
      state.sectionData.adjustments!.k1LossSources!.sourceFactsConfirmed = null;
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const open = async () => {
        await page.getByText('Net operating loss carry sources', { exact: true }).click();
        await page.getByText('K-1 and qualified loss sources', { exact: true }).click();
        await page.getByText('EBL history 1', { exact: true }).click();
      };
      await open();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('combobox', { name: 'K-1 packet checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$115,000');
      const qualifiedOriginal = page.getByRole('textbox', { name: 'EBL history 1 filed original qualified loss', exact: true });
      const qualifiedOpening = page.getByRole('textbox', { name: 'EBL history 1 filed opening qualified carry', exact: true });
      await qualifiedOriginal.fill('30002'); await qualifiedOpening.fill('25002'); await qualifiedOpening.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      const confirmations = page.getByRole('combobox', { name: /checked after the last edit$/ });
      expect(await confirmations.count()).toBe(18);
      for (const field of await confirmations.all()) await expect(field).toHaveValue('');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await open();
      await expect(qualifiedOriginal).toHaveValue('30,002'); await expect(qualifiedOpening).toHaveValue('25,002');
      await expect(page.getByRole('combobox', { name: 'EBL history 1 current material participation', exact: true })).toHaveValue('false');
      await qualifiedOpening.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await qualifiedOpening.fill('25002'); await qualifiedOpening.press('Tab');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const ordinaryPrior = page.getByRole('textbox', { name: 'Prior ordinary QBI filed ordinary loss carry', exact: true });
      await ordinaryPrior.fill(''); await ordinaryPrior.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect(page.getByRole('combobox', { name: 'Prior ordinary QBI checked after the last edit', exact: true })).toHaveValue('');
      await ordinaryPrior.fill('0'); await ordinaryPrior.press('Tab');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await ordinaryPrior.fill('7000'); await ordinaryPrior.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const field of await confirmations.all()) await field.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await open(); await expect(ordinaryPrior).toHaveValue('7,000');
      await qualifiedOpening.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) expect(await qualifiedOpening.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
      await page.screenshot({ path: testInfo.outputPath(`joint-ebl-source-${viewport.width}.png`) });
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const adjustments = saved.sectionData.adjustments;
      expect(adjustments.netOperatingLossSources.vintages).toEqual(originals.netOperatingLossSources!.vintages);
      expect(adjustments.netOperatingLossSources.alternativeTax.vintages).toEqual(originals.netOperatingLossSources!.alternativeTax!.vintages);
      expect(adjustments.k1LossSources.excessBusinessLossHistories[0].originalNol).toEqual(originals.k1LossSources!.excessBusinessLossHistories![0]!.originalNol);
      expect(adjustments.k1LossSources.excessBusinessLossHistories[0].qualifiedOpeningCarryforward).toBe('25,002');
      expect(adjustments.k1LossSources.priorQbiCarry.lossCarryforward).toBe('7,000');
      expect(adjustments.k1LossSources.priorQbiCarry.sourceFactsConfirmed).toBe(true);
      for (const key of ['currentDeduction', 'ownerCurrentDeduction', 'agi', 'taxableIncome']) expect(adjustments).not.toHaveProperty(key);
      await writeFile(testInfo.outputPath(`joint-ebl-original-workspace-${viewport.width}.json`), JSON.stringify(saved, null, 2));
      for (const secret of ['Actual same-couple marital-year records', '111-22-3333']) expect(requests.some(row => row.body.includes(secret))).toBe(false);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Deductions', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true }); await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const file = testInfo.outputPath(`joint-ebl-review-${viewport.width}.pdf`); await (await downloading).saveAs(file);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", file],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Section 461 EBL', 'Ordinary NOL', 'claimed 50000', 'claimed 35000', 'Regular NOL: claimed 85000',
        'Ordinary QBI loss carryforward: $32002', 'Actual opening ordinary QBI loss carry: $7000', 'qualified remaining carry: $0']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', '222-33-4444', '222334444', 'jane-loss2021', 'alex-loss2021', 'Actual same-couple marital-year records']) expect(text).not.toContain(secret);
      for (const request of requests.filter(row => row.body.includes('Actual same-couple marital-year records'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`joint-ebl-review-${viewport.width}.png`) });
    });
  });
}
