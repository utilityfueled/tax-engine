// Spec: spec/federal/cod-title-11-chapter-12-personal.yaml browser-originals.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { guidedCodPartialPersonalState } from '../../../tests/fixtures/guided-cod-partial-personal';

const historyLabel = 'The case was never under Chapter 7 or Chapter 11';
async function confirmOriginals(page: Page) {
  const names = ['Bankruptcy records checked', 'Debt 1 personal borrowing records checked after the last edit',
    'Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
    'Current adjustments sources checked after the last edit'];
  for (const prefix of ['Regular', 'Alternative']) {
    for (const date of ['immediately after', 'following year']) names.push(`${prefix} ${date} property 1 sources checked after the last edit`);
    names.push(`${prefix} immediately-after inventory sources checked after the last edit`,
      `${prefix} following-year inventory sources checked after the last edit`, `${prefix} attribute ledger sources checked after the last edit`);
  }
  names.push('Later-attribute packet checked after the last edit', 'Canceled-debt packet checked after the last edit');
  for (const name of names) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
  const nol = page.getByText('Net operating loss carry sources', { exact: true });
  if (await nol.locator('..').evaluate(element => !element.hasAttribute('open'))) await nol.click();
  for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
    await page.getByRole('combobox', { name, exact: true }).selectOption('true');
  }
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Chapter12 personal originals at ${viewport.width}px`, () => {
    test('collects original chapter12 history and preserves canonical review while edits block readiness', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      // Only the existing ordinary personal-debt prerequisites are seeded. Every
      // new chapter12/court/history/event/exemption answer below comes from UI.
      const state = guidedCodPartialPersonalState(); state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
      expect(state.sectionData.adjustments!.codNolSources!.title11Case).toBe(false);
      expect(state.sectionData.adjustments!.codNolSources!.title11Source).toBeUndefined();
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByText('Canceled debt, insolvency and bankruptcy', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Debt was discharged in a title 11 bankruptcy case', exact: true }).selectOption('true');
      await page.getByRole('combobox', { name: 'Bankruptcy chapter', exact: true }).selectOption('12');
      const reference = 'Fictional original Chapter12 petition docket and discharge; never Chapter7 or11';
      await page.getByRole('textbox', { name: 'Bankruptcy discharge order or plan reference', exact: true }).fill(reference);
      for (const name of ["You were a debtor under the court's jurisdiction", 'The court granted the discharge, or it follows a plan the court approved']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      await page.getByRole('combobox', { name: 'Debt 1 Box 6 event code', exact: true }).selectOption('A');
      await page.getByText('Later tax attributes and property basis', { exact: true }).click();
      for (const prefix of ['Regular', 'Alternative']) {
        await page.getByRole('combobox', { name: `${prefix} following year property 1 treated as exempt property in the bankruptcy, title 11 cases only`, exact: true }).selectOption('false');
      }
      await confirmOriginals(page);
      const history = page.getByRole('combobox', { name: historyLabel, exact: true });
      await expect(history).toHaveValue('');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Adjustments to Income', exact: true })).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: /^COD title11 requires actual case history/ })).toBeVisible();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await history.selectOption('true');
      await expect(page.getByRole('combobox', { name: 'Bankruptcy records checked', exact: true })).toHaveValue('');
      await confirmOriginals(page);
      // Source changes invalidate the downstream original estimated-tax packet.
      for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const payment = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(payment).toHaveValue(''); await payment.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const cod = saved.sectionData.adjustments.codNolSources;
      expect(cod.title11Chapter).toBe('12'); expect(cod.title11Source).toEqual({ sourceReference: reference,
        sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true, dischargeByCourtOrApprovedPlanConfirmed: true,
        caseNeverChapter7Or11Confirmed: true });
      expect(cod.debts[0].identifiableEventCode).toBe('A');
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      writeFileSync(testInfo.outputPath(`chapter12-originals-${viewport.width}.json`), JSON.stringify(saved, null, 2) + '\n');
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const download = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`chapter12-review-${viewport.width}.pdf`); await (await download).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Packet completeness status: partial.', 'Form 982 is included as a reference summary',
        'Regular remaining property basis: 72000', 'Regular unreduced excluded debt: 15000']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'Original account-A', 'Original statement-A', '12-3456789', reference]) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => ['123-45-6789', reference].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`chapter12-review-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: /start guided interview/i }).click();
      for (let step = 0; step < 8 && !(await page.getByRole('heading', { name: 'Adjustments to Income', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Back', exact: true }).click();
      }
      const disclosure = page.getByText('Canceled debt, insolvency and bankruptcy', { exact: true });
      if (await disclosure.locator('..').evaluate(element => !element.hasAttribute('open'))) await disclosure.click();
      await history.selectOption('false');
      await expect(page.getByRole('combobox', { name: 'Bankruptcy records checked', exact: true })).toHaveValue('');
      await expect(page.getByRole('combobox', { name: 'Canceled-debt packet checked after the last edit', exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await disclosure.click();
      await expect(history).toHaveValue('false');
      await expect(page.getByRole('combobox', { name: 'Bankruptcy records checked', exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
    });
  });
}
