import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/k1-prior-property-guide-original.json', import.meta.url), 'utf8'));

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Nonitemized prior property at ${viewport.width}px`, () => {
    test('preserves prior property sources and explicit choice without opening2026 output', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{ url: string; body: string }> = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state: original });
      await page.reload();
      const standard = page.getByRole('radio', { name: /^Standard deduction/ });
      const root = page.getByRole('combobox', { name: 'K-1 charitable packet checked after the last edit', exact: true });
      const openSources = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
        await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      };
      await expect(standard).toBeChecked();
      await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.', { exact: true })).toBeVisible();
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await openSources();
      const basis = 'Charitable K-1 1 prior basis origin 1';
      await expect(page.getByRole('textbox', { name: `${basis} origin year`, exact: true })).toHaveValue('2018');
      const useCount = original.sectionData.deductions.k1CharitableSources.statements[0].basis.priorBasisSuspensions[0].basisUseHistory.length;
      const lastUse = page.getByRole('textbox', { name: `${basis} use ${useCount} basis used`, exact: true });
      await lastUse.fill('');
      await expect(root).toHaveValue('');
      await lastUse.fill('0'); await lastUse.press('Tab');
      const privateReference = `fictional-private-property-history-${viewport.width}`;
      await page.getByRole('textbox', { name: `${basis} original reference`, exact: true }).fill(privateReference);
      for (const prefix of ['Charitable K-1 1 basis', 'Charitable K-1 1 prior at-risk character', 'Charitable K-1 1 prior at-risk history', 'Charitable K-1 1 at risk', 'K-1 charitable packet']) {
        await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true');
      }
      await page.getByRole('radio', { name: /^Itemize deductions/ }).check();
      await expect(root).toHaveValue('');
      await standard.check();
      await expect(root).toHaveValue('');
      const confirmations = ['Charitable K-1 1 basis', 'Charitable K-1 1 activity assignment',
        'Charitable K-1 1 prior at-risk character', 'Charitable K-1 1 prior at-risk history',
        'Charitable K-1 1 at risk', 'K-1 charitable packet'];
      for (const prefix of confirmations) {
        const confirmation = page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true });
        await expect(confirmation).toHaveValue('');
        await confirmation.selectOption('true');
      }
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      const carryConfirmation = page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true });
      await expect(carryConfirmation).toHaveValue('');
      await carryConfirmation.selectOption('true');
      await page.reload(); await openSources();
      await expect(standard).toBeChecked(); await expect(lastUse).toHaveValue('0');
      await expect(page.getByRole('textbox', { name: `${basis} original reference`, exact: true })).toHaveValue(privateReference);
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const packet = saved.sectionData.deductions.k1CharitableSources, statement = packet.statements[0];
      expect(saved.taxYear).toBe(2026); expect(saved.sectionData.deductions.method).toBe('standard');
      expect(statement.basis.priorBasisSuspensions[0].originTaxYear).toBe('2018');
      expect(statement.basis.priorBasisSuspensions[0].basisUseHistory).toEqual(original.sectionData.deductions.k1CharitableSources.statements[0].basis.priorBasisSuspensions[0].basisUseHistory);
      expect(statement.atRisk.priorLossHistory.characterSources.records).toEqual(original.sectionData.deductions.k1CharitableSources.statements[0].atRisk.priorLossHistory.characterSources.records);
      expect(statement.atRisk.priorLossHistory.characterSources.records[0].gift.basisOriginTaxYear).toBe('2024');
      for (const source of [packet, statement.basis, statement.atRisk, statement.atRisk.activityAllocation,
        statement.atRisk.priorLossHistory, statement.atRisk.priorLossHistory.characterSources,
        saved.sectionData.deductions.charitableCarryoverSources]) expect(source.sourceFactsConfirmed).toBe(true);
      for (const key of ['releasedBasis', 'allowedDeduction', 'charitableCarryforward']) expect(packet).not.toHaveProperty(key);
      writeFileSync(testInfo.outputPath(`prior-property-state-${viewport.width}.json`), JSON.stringify(saved, null, 2)+'\n');
      await standard.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`prior-property-sources-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
      await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`prior-property-year-gate-${viewport.width}.png`) });
      for (const secret of [privateReference, original.sectionData['personal-info'].ssn]) {
        expect(requests.some(request => request.body.includes(secret))).toBe(false);
      }
    });
  });
}
