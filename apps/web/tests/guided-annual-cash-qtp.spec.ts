// Spec: spec/federal/form-1099-q-annual-cash.yaml browser.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { actualAnnualCashInterview } from './guided-annual-cash-fixture';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Annual cash QTP originals at ${viewport.width}px`, () => {
    test('preserves annual cash sources through edits reload and review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: 'interview', currentSectionIndex: 3,
          completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'] }));
      }, { id, state: actualAnnualCashInterview() });
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const earnings = page.getByRole('textbox', { name: 'Box 2 earnings (leave blank if not reported)', exact: true }).nth(1);
      const basis = page.getByRole('textbox', { name: 'Box 3 basis (leave blank if not reported)', exact: true }).nth(1);
      const statement = page.getByRole('combobox', { name: 'Statement facts checked against the actual source', exact: true }).nth(1);
      const period = page.getByRole('combobox', { name: 'Actual academic-period records checked', exact: true });
      const links = page.getByRole('combobox', { name: 'Receipt and period link checked', exact: true });
      const annual = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const confirm = async () => { await statement.selectOption('true'); await period.selectOption('true');
        await links.nth(0).selectOption('true'); await links.nth(1).selectOption('true'); await annual.selectOption('true'); };
      // Original annualQ6000/G20000 excludes1200+300; AGI53500 and tax4295+350.
      await expect(hero).toHaveText('$15,355'); await expect(earnings).toHaveValue('1000');
      await earnings.fill('2000'); await earnings.press('Tab');
      await expect(statement).toHaveValue(''); await expect(period).toHaveValue(''); await expect(annual).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await basis.fill('8000'); await basis.press('Tab'); await confirm();
      // New actual Box2/3: taxable4200; AGI54200 and tax4379+420.
      await expect(hero).toHaveText('$15,201');
      await page.reload(); await expect(earnings).toHaveValue('2,000'); await expect(statement).toHaveValue('true');
      await earnings.fill(''); await earnings.press('Tab'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(earnings).toHaveValue('');
      await earnings.fill('2000'); await earnings.press('Tab'); await confirm(); await expect(hero).toHaveText('$15,201');
      const savedState = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const saved = savedState.sectionData.credits.educationDistributions;
      writeFileSync(testInfo.outputPath(`annual-cash-original-${viewport.width}.json`), JSON.stringify(savedState, null, 2) + '\n');
      expect(saved.forms[1].fields.earnings).toBe('2,000'); expect(saved.forms[1].fields.basis).toBe('8,000');
      expect(saved.forms.map((row: { fields: { grossDistribution: string } }) => row.fields.grossDistribution)).toEqual(['10000','10000']);
      expect(saved.allocations.map((row: { amount: string }) => row.amount)).toEqual(['5000','5000']);
      expect(saved.forms[1].fields.isTrusteeToTrustee).toBe(false);
      const secrets = ['123-45-6789', 'fictional-institution', 'fictional-cash-first', 'fictional-cash-second'];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await earnings.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-cash-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`annual-cash-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Statement 1: Annual cash gross: $20000', 'Statement 1: Annual qualified cash expenses: $6000',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $4200',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $420']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of [...secrets, '123456789']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional-cash-first'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-cash-review-${viewport.width}.png`) });
    });
  });
}
