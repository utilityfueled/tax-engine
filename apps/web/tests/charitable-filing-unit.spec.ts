// Spec: spec/federal/charitable-filing-unit-history.yaml production-guided-history.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { guidedCharitableFilingUnitHistory } from '../../../tests/fixtures/charitable-filing-unit-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Original charitable filing history at ${viewport.width}px`, () => {
    test('preserves actual ownership history through edits reload and review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333' },
          'income-w2': { entries: [{ employerName: 'Synthetic actual employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0', socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
          deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], charitableCarryoverSources: guidedCharitableFilingUnitHistory() } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      const taxable = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' });
      await expect(taxable).toContainText('$94,000');
      const open = () => page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await open();
      const timeline = page.getByRole('combobox', { name: 'Filing-unit sources checked after the last edit', exact: true });
      const confirmed = page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true });
      const opening = page.getByRole('textbox', { name: 'Contribution 1 opening carryforward', exact: true });
      const use = page.getByRole('textbox', { name: 'Contribution 1 history 1 filed use 1 amount treated as paid', exact: true });
      await opening.fill('');
      await page.getByRole('textbox', { name: 'Contribution 1 history 1 treated as paid', exact: true }).fill('3001');
      await use.fill('3001'); await use.press('Tab');
      await expect(timeline).toHaveValue(''); await expect(confirmed).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await timeline.selectOption('true'); await confirmed.selectOption('true');
      await expect(taxable).toContainText('$94,001');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.charitableCarryoverSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(use).toHaveValue('3,001'); await expect(opening).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Person 2 SSN last four', exact: true })).toHaveValue('4321');
      await use.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect(timeline).toHaveValue(''); await expect(confirmed).toHaveValue('');
      await use.fill('3001'); await use.press('Tab'); await timeline.selectOption('true'); await confirmed.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await use.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) expect(await use.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
      await page.screenshot({ path: testInfo.outputPath(`filing-unit-source-${viewport.width}.png`) });
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.deductions.charitableCarryoverSources, id);
      expect(saved.filingUnitHistory.persons).toEqual(state.sectionData.deductions!.charitableCarryoverSources!.filingUnitHistory!.persons);
      expect(saved.vintages[0].filingUnitOrigin).toEqual(state.sectionData.deductions!.charitableCarryoverSources!.vintages![0].filingUnitOrigin);
      expect(saved.vintages[0].openingCarryforward).toBe('');
      expect(saved.vintages[0].history[0].filingUnitUses[0].treatedAsPaid).toBe('3,001');
      for (const name of ['deduction', 'currentDeduction', 'contributionBase', 'ownerClosingBalance']) expect(saved).not.toHaveProperty(name);
      for (const secret of ['Synthetic filed return and identity timeline', '111-22-3333']) expect(requests.some(row => row.body.includes(secret))).toBe(false);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true });
      await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`filing-unit-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Charitable filing-unit history', 'Current opening: 29997 / 5', 'Schedule A candidate charity: $5999']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', 'original-joint-property', 'Alex Roe']) expect(text).not.toContain(secret);
      for (const request of requests.filter(row => row.body.includes('Synthetic filed return and identity timeline'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`filing-unit-review-${viewport.width}.png`) });
    });
  });
}
