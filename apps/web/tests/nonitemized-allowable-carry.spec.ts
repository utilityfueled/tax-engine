// Spec: nonitemized-allowable-charitable-carry.yaml, production-source-boundary.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/nonitemized-allowable-carry-guide-original.json', import.meta.url), 'utf8'));

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Otherwise-allowable charity at ${viewport.width}px`, () => {
    test('preserves actual current cash and the closed2026 output boundary', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const bodies: string[] = [];
      page.on('request', request => bodies.push(request.postData() ?? ''));
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
      await expect(standard).toBeChecked();
      await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.', { exact: true })).toBeVisible();
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      const amount = page.getByRole('textbox', { name: /^Donation amount \/ fair market value/ });
      await amount.fill('70000.02'); await amount.press('Tab');
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      const confirmation = page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true });
      await expect(confirmation).toHaveValue('');
      const reference = `fictional-private-allowable-history-${viewport.width}`;
      await page.getByRole('textbox', { name: 'Charitable carryover packet reference', exact: true }).fill(reference);
      await confirmation.selectOption('true');
      await page.reload();
      await expect(standard).toBeChecked(); await expect(amount).toHaveValue('70,000.02');
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await expect(confirmation).toHaveValue('true');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      expect(saved.sectionData.deductions.charitableCarryoverSources.vintages).toEqual([]);
      expect(saved.sectionData.deductions.charitableCarryoverSources.sourceReference).toBe(reference);
      expect(saved.sectionData.deductions.donationEntries[0]).toMatchObject({ amount: '70,000.02', date: '2026-06-01',
        qualifiedOrganization: true, recipientCategory: 'fifty-percent', supportingOrganization: false, donorAdvisedFund: false });
      for (const field of ['charitableCarryforward', 'contributionBase', 'allowedDeduction']) expect(saved.sectionData.deductions).not.toHaveProperty(field);
      writeFileSync(testInfo.outputPath(`allowable-carry-state-${viewport.width}.json`), JSON.stringify(saved, null, 2)+'\n');
      await confirmation.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`allowable-carry-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
      await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`allowable-carry-year-gate-${viewport.width}.png`) });
      for (const value of [reference, original.sectionData['personal-info'].ssn]) expect(bodies.join('\n')).not.toContain(value);
    });
  });
}
