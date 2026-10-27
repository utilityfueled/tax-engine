// Spec: spec/federal/education-annual-category-limits.yaml browser.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { actualAnnualCategoryInterview } from './guided-annual-category-fixture';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const apprenticeship of [false, true]) {
    test.describe(`Annual ${apprenticeship ? 'apprenticeship' : 'K12'} sources at ${viewport.width}px`, () => {
      test('preserves annual category facts through edits reload and review', async ({ page }, testInfo) => {
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
        }, { id, state: actualAnnualCategoryInterview(apprenticeship) });
        await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
        const hero = page.locator('.guided-ticker-value-hero').first();
        const annual = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
        const paid = page.getByRole('textbox', { name: 'Actual expense paid', exact: true });
        if (apprenticeship) {
          const registered = page.getByRole('combobox', { name: 'Apprenticeship is registered and certified with the U.S. Department of Labor', exact: true });
          await expect(hero).toHaveText('$14,541');
          await registered.selectOption('false'); await expect(annual).toHaveValue('');
          await expect(hero).toHaveText('Enter more info for an estimate');
          await annual.selectOption('true'); await expect(hero).toHaveText('$14,145');
          await page.reload(); await expect(registered).toHaveValue('false');
          await registered.selectOption(''); await annual.selectOption('true');
          await expect(hero).toHaveText('Enter more info for an estimate');
          await page.reload(); await expect(registered).toHaveValue('');
          await registered.selectOption('true'); await annual.selectOption('true'); await expect(hero).toHaveText('$14,541');
        } else {
          await expect(hero).toHaveText('$14,805');
          await paid.fill('9000'); await paid.press('Tab'); await expect(annual).toHaveValue('');
          await expect(hero).toHaveText('Enter more info for an estimate');
          await annual.selectOption('true'); await expect(hero).toHaveText('$14,739');
          await page.reload(); await expect(paid).toHaveValue('9,000');
          await paid.fill(''); await paid.press('Tab'); await annual.selectOption('true');
          await expect(hero).toHaveText('Enter more info for an estimate');
          await paid.fill('9000'); await paid.press('Tab'); await annual.selectOption('true'); await expect(hero).toHaveText('$14,739');
        }
        const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
        const label = `${apprenticeship ? 'apprenticeship' : 'k12'}-${viewport.width}`;
        writeFileSync(testInfo.outputPath(`annual-category-original-${label}.json`), JSON.stringify(saved, null, 2) + '\n');
        expect(saved.sectionData.credits.educationDistributions.forms.map((row: { fields: { earnings: string } }) => row.fields.earnings)).toEqual(['3000', '6000']);
        expect(saved.sectionData.credits.educationDistributions.forms[0].fields.isTrusteeToTrustee).toBe(false);
        expect(saved.sectionData.credits.educationDistributions.allocations).toEqual([]);
        const secrets = ['123-45-6789', 'fictional-cash-first', 'fictional-cash-second'];
        for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
        await paid.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-category-source-${label}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
        await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
        const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
        const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
        await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
        const output = testInfo.outputPath(`annual-category-review-${label}.pdf`); await (await downloading).saveAs(output);
        const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
          'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
        const text = pages.join(' ').replace(/\s+/g, ' ');
        for (const literal of ['Statement 1: Annual cash gross: $30000', `Statement 1: Annual qualified cash expenses: $${apprenticeship ? '6000' : '9000'}`,
          `Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $${apprenticeship ? '7200' : '6300'}`,
          `Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $${apprenticeship ? '720' : '630'}`]) expect(text).toContain(literal);
        for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
        for (const secret of [...secrets, '123456789']) expect(text).not.toContain(secret);
        for (const request of requests.filter(request => request.body.includes('fictional-cash-first'))) {
          expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
          expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
        }
        await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-category-review-${label}.png`) });
      });
    });
  }
}
