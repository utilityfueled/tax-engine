// Spec: spec/federal/education-annual-loan-interest.yaml browser.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { actualAnnualLoanInterestInterview } from './guided-annual-loan-interest-fixture';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual annual loan interest at ${viewport.width}px`, () => {
    test('preserves actual annual interest sources through links reload and review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: 'interview', currentSectionIndex: 2,
          completedSections: ['personal-info', 'income-w2', 'adjustments', 'deductions', 'credits', 'payments', 'review', 'final-review'] }));
      }, { id, state: actualAnnualLoanInterestInterview() });
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Adjustments');
      const hero = page.locator('.guided-ticker-value-hero').first(), steps = page.locator('.guided-progress-steps');
      const qtp = page.getByRole('textbox', { name: "Loan 1: Tax-free 529 earnings used for this loan's interest", exact: false });
      const linked = page.getByRole('checkbox', { name: 'Loan 1: Link education loan-payment expense 1', exact: true });
      const confirmed = page.getByRole('combobox', { name: 'Student-loan sources checked after the last edit', exact: true });
      await expect(qtp).toHaveValue(''); await expect(hero).not.toHaveText('Enter more info for an estimate');
      const originalPreview = await hero.textContent();
      await linked.uncheck(); await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await confirmed.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(linked).not.toBeChecked(); await expect(qtp).toHaveValue('');
      await linked.check(); await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await steps.getByRole('button', { name: 'Tax Credits', exact: true }).click();
      const educationConfirmed = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      await expect(educationConfirmed).toHaveValue(''); await educationConfirmed.selectOption('true');
      await steps.getByRole('button', { name: 'Adjustments', exact: true }).click();
      await expect(confirmed).toHaveValue(''); await confirmed.selectOption('true'); await expect(hero).toHaveText(originalPreview ?? '');
      await page.reload(); await expect(linked).toBeChecked(); await expect(qtp).toHaveValue(''); await expect(hero).toHaveText(originalPreview ?? '');
      await expect(page.getByRole('combobox', { name: 'Loan 1: The loan was from a related person under the student-loan rules', exact: true })).toHaveValue('false');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const label = String(viewport.width);
      writeFileSync(testInfo.outputPath(`annual-loan-interest-original-${label}.json`), JSON.stringify(saved, null, 2) + '\n');
      expect(saved.sectionData.adjustments.studentLoanFacts.loans[0].qtpTaxFreeEarningsUsedForInterest).toBe('');
      expect(saved.sectionData.credits.educationDistributions.forms.map((row: { fields: { earnings: string } }) => row.fields.earnings)).toEqual(['3000', '6000']);
      expect(saved.sectionData.credits.educationDistributions.allocations).toEqual([]);
      const secrets = ['123-45-6789', 'fictional-cash-first', 'fictional-cash-second', 'Fictional actual lender'];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await qtp.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-loan-interest-source-${label}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await steps.getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`annual-loan-interest-review-${label}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Statement 1: Annual cash gross: $30000', 'Statement 1: Annual qualified cash expenses: $1000',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $8700',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $870']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of [...secrets.filter(value => value !== 'Fictional actual lender'), '123456789']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional-cash-first'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`annual-loan-interest-review-${label}.png`) });
    });
  });
}
