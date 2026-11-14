// Spec: spec/federal/foreign-tax-direct-credit.yaml, guided-portfolio-k3-browser.
import { expect, test } from '@playwright/test';
import { buildSectionRoute } from '../src/lib/guided-interview-flow';
import { guidedForeignTaxK3Fixture } from '../../../tests/fixtures/guided-foreign-tax-k3';

for (const width of [1280, 375]) {
  test.describe(`Actual qualified K3 originals at ${width}px`, () => {
    test('types original portfolio K3 facts and preserves unknowns and source review after reload', async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const requestBodies: string[] = [];
      const protectedRequests: string[] = [];
      page.on('request', request => {
        requestBodies.push(request.postData() ?? '');
        const pathname = new URL(request.url()).pathname;
        if (/^\/api\/(provider\/|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(pathname)) protectedRequests.push(pathname);
      });
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id) throw new Error('Missing synthetic workspace');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const { state } = guidedForeignTaxK3Fixture();
      const annual = state.sectionData['other-taxes']?.foreignTaxElection;
      if (!annual) throw new Error('Missing synthetic annual source');
      // Seed established W2/1099 and annual election only. Every new K1/K3 original is typed below.
      delete annual.qualifiedK3Statements;
      annual.sources = annual.sources?.filter(row => !row.sourceId?.startsWith('scheduleK1:'));
      const sections = buildSectionRoute(state.segmentation);
      state.currentSectionIndex = sections.findIndex(section => section.id === 'other-taxes');
      state.completedSections = sections.slice(0, state.currentSectionIndex).map(section => section.id);
      const key = `tax-engine.guided-flow-state.v1:${id}`;
      await page.evaluate(({ id, key, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(key, JSON.stringify(state));
      }, { id, key, state });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Other Taxes', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add original partnership K1 and K3', exact: true }).click();
      const interest = page.getByRole('textbox', { name: 'K3 1 original interest', exact: true });
      const foreignTax = page.getByRole('textbox', { name: 'K3 1 actual foreign tax', exact: true });
      const originalConfirmation = page.getByRole('combobox', { name: 'K3 1 original facts checked after the last edit', exact: true });
      const directConfirmation = page.getByRole('combobox', { name: 'Direct-credit election facts checked after the last edit', exact: true });
      const annualConfirmation = page.getByRole('combobox', { name: 'Foreign-tax election sources checked after the last edit', exact: true });
      await expect(interest).toHaveValue(''); await expect(foreignTax).toHaveValue(''); await expect(originalConfirmation).toHaveValue('');
      for (const [label, value] of [
        ['original tax year', '2025'], ['partnership name', 'Fictional Portfolio LP'], ['partnership EIN', '12-3456789'],
        ['original recipient name', 'Jordan Example'], ['recipient taxpayer identifier last four digits', '3333'], ['original K1 reference', 'synthetic-private-typed-k1-original'],
        ['qualified K3 and country detail reference', 'synthetic-private-typed-k3-country-original'], ['actual foreign country', 'Canada'],
        ['original interest', '100.00'], ['original ordinary dividends', '40.00'], ['original qualified-dividend subset', '20.00'],
        ['actual foreign gross income', '140.00'], ['actual foreign tax', '50.00'], ['opening outside basis', '100.00'],
        ['opening outside basis reference', 'synthetic-private-typed-outside-basis'],
      ]) await page.getByRole('textbox', { name: `K3 1 ${label}`, exact: true }).fill(value);
      for (const [label, value] of [
        ['entity type', 'partnership'], ['return owner', 'primary'], ['actual qualified statement', 'schedule_k3_1065'], ['actual foreign income category', 'passive'],
        ['is an actual continuing domestic non-PTP partnership', 'true'],
        ['has only portfolio interest and dividends outside the ordinary course of business, all foreign and passive category', 'true'],
        ['has known zero other boxes, including business, rental, capital gains or losses, self-employment, QBI, deductions, distributions, withholding, credits and AMT items', 'true'],
        ['has no other basis changes, including contributions or liability changes', 'true'], ['has no prior basis-suspended amounts, including foreign tax', 'true'],
        ['has no prior at-risk-suspended amounts', 'true'], ['has no prior passive-suspended amounts', 'true'],
      ]) await page.getByRole('combobox', { name: `K3 1 ${label}`, exact: true }).selectOption(value);
      await originalConfirmation.selectOption('true');
      await page.getByRole('button', { name: 'Add foreign-tax statement', exact: true }).click();
      await page.getByRole('combobox', { name: 'Foreign-tax statement 2', exact: true }).selectOption('scheduleK1:0');
      await page.getByRole('combobox', { name: 'Source 2 jurisdiction', exact: true }).selectOption('foreign_country');
      for (const label of ['is a qualified foreign income tax', 'is passive income', 'is legally owed by this taxpayer', 'has no refund or subsidy entitlement', 'meets the actual holding-period requirement', 'has no related-payment obligation', 'has no disallowed-country or boycott reduction']) {
        await page.getByRole('combobox', { name: `Source 2 ${label}`, exact: true }).selectOption('true');
      }
      for (const label of ['tax on excluded income', 'tax deducted elsewhere', 'investment tax allocation']) await page.getByRole('textbox', { name: `Source 2 ${label}`, exact: true }).fill('0');
      await expect(page.getByRole('button', { name: 'Add payment for source 2', exact: true })).toHaveCount(0);
      await directConfirmation.selectOption('true'); await annualConfirmation.selectOption('true');
      await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').sectionData?.['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed, key)).toBe(true);
      await page.reload();
      await expect(interest).toHaveValue('100.00'); await expect(foreignTax).toHaveValue('50.00');
      await expect(originalConfirmation).toHaveValue('true'); await expect(directConfirmation).toHaveValue('true'); await expect(annualConfirmation).toHaveValue('true');
      await foreignTax.fill('0'); await foreignTax.blur();
      await expect(originalConfirmation).toHaveValue(''); await expect(directConfirmation).toHaveValue(''); await expect(annualConfirmation).toHaveValue('');
      await page.reload(); await expect(foreignTax).toHaveValue('0');
      await foreignTax.fill(''); await foreignTax.blur();
      await page.reload(); await expect(foreignTax).toHaveValue('');
      await expect(originalConfirmation).toHaveValue('');
      await interest.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`actual-k3-originals-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(protectedRequests).toEqual([]);
      for (const privateFact of ['synthetic-private-typed-k1-original', 'synthetic-private-typed-k3-country-original', 'synthetic-private-typed-outside-basis', 'Jordan Example', '111-22-3333']) expect(requestBodies.join('\n')).not.toContain(privateFact);
    });
  });
}
