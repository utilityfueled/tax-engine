// Spec: k1-charitable-first-admission.yaml, production-source-boundary.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/k1-charitable-first-admission-guide-original.json', import.meta.url), 'utf8'));
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Original basis admission at ${viewport.width}px`, () => {
    test('preserves first-admission source edits without opening2026 output', async ({ page }, testInfo) => {
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
      const root = page.getByRole('combobox', { name: 'K-1 charitable packet checked after the last edit', exact: true });
      const prefix = 'Charitable K-1 1 prior basis origin 1 section170 admission';
      const sourceConfirmation = page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true });
      const openSources = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
        await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      };
      await expect(standard).toBeChecked();
      await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.', { exact: true })).toBeVisible();
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await openSources();
      const year = page.getByRole('textbox', { name: `${prefix} year 1 tax year`, exact: true });
      await expect(year).toHaveValue('2018');
      const reference = `fictional-private-admission-annual-${viewport.width}`;
      const referenceField = page.getByRole('textbox', { name: `${prefix} year 1 charitable worksheet reference`, exact: true });
      await referenceField.fill(reference); await referenceField.press('Tab');
      await expect(root).toHaveValue(''); await expect(sourceConfirmation).toHaveValue('');
      await page.getByRole('button', { name: `Add ${prefix} year 1 regular carry`, exact: true }).click();
      const carryId = page.getByRole('textbox', { name: `${prefix} year 1 regular carry 1 source ID`, exact: true });
      await expect(carryId).toHaveValue('');
      await page.getByRole('button', { name: `Record no ${prefix} year 1 regular carries`, exact: true }).click();
      await expect(carryId).toHaveCount(0);
      for (const label of [`${prefix} checked after the last edit`,
        'Charitable K-1 1 basis checked after the last edit',
        'Charitable K-1 1 prior at-risk history checked after the last edit',
        'Charitable K-1 1 at risk checked after the last edit',
        'K-1 charitable packet checked after the last edit']) {
        await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      }
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true }).selectOption('true');
      await page.reload(); await openSources();
      await expect(standard).toBeChecked(); await expect(year).toHaveValue('2018');
      await expect(referenceField).toHaveValue(reference);
      await expect(sourceConfirmation).toHaveValue('true'); await expect(root).toHaveValue('true');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const packet = saved.sectionData.deductions.k1CharitableSources;
      const statement = packet.statements[0], prior = statement.basis.priorBasisSuspensions[0];
      const expectedAnnual = structuredClone(original.sectionData.deductions.k1CharitableSources.statements[0].basis.priorBasisSuspensions[0].section170AdmissionSources.records);
      expectedAnnual[0].charitableWorksheetReference = reference;
      expect(prior.section170AdmissionSources.records).toEqual(expectedAnnual);
      expect(prior.basisUseHistory).toEqual(original.sectionData.deductions.k1CharitableSources.statements[0].basis.priorBasisSuspensions[0].basisUseHistory);
      expect(prior.originTaxYear).toBe('2018'); expect(statement.receipts[0].contributionDate).toBe('2018-06-01');
      expect(saved.sectionData.deductions.charitableCarryoverSources.vintages).toEqual([]);
      expect(statement.atRisk.activityAllocation).toBeUndefined();
      expect(statement.atRisk.priorLossHistory.characterSources).toBeUndefined();
      expect(statement.atRisk.priorLossHistory.vintages).toEqual([]);
      for (const source of [packet, statement.basis, prior.section170AdmissionSources,
        statement.atRisk, statement.atRisk.priorLossHistory,
        saved.sectionData.deductions.charitableCarryoverSources]) expect(source.sourceFactsConfirmed).toBe(true);
      for (const key of ['admissionTaxYear', 'currentAdmission', 'charitableCarryforward']) expect(prior.section170AdmissionSources).not.toHaveProperty(key);
      writeFileSync(testInfo.outputPath(`basis-first-admission-state-${viewport.width}.json`), JSON.stringify(saved, null, 2)+'\n');
      await referenceField.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`basis-first-admission-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
      await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`basis-first-admission-year-gate-${viewport.width}.png`) });
      for (const value of [reference, original.sectionData['personal-info'].ssn]) expect(bodies.join('\n')).not.toContain(value);
    });
  });
}
