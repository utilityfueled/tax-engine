// Spec: spec/federal/foreign-tax-k3-ordinary-browser.yaml, visible-originals.
import { expect, test } from '@playwright/test';
import { buildSectionRoute } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { calculateFederalTax } from '../../../src/engine/federal';
import { TaxYearInputSchema } from '../../../src/models/inputs';
import { guidedOrdinaryK3, required } from '../../../tests/fixtures/foreign-tax-k3-ordinary';

for (const width of [1280, 390]) {
  test.describe(`Ordinary qualified K3 originals at ${width}px`, () => {
    test('originates ordinary K3 originals and refreshes source proof after an unknown edit', async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const bodies: string[] = [], protectedRequests: string[] = [];
      page.on('request', request => {
        bodies.push(request.postData() ?? '');
        const path = new URL(request.url()).pathname;
        if (/^\/api\/(provider\/|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(path)) protectedRequests.push(path);
      });
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = required(new URL(page.url()).pathname.split('/').at(-1));
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const { state } = guidedOrdinaryK3();
      const annual = required(required(state.sectionData['other-taxes']).foreignTaxElection);
      // Established household/W2/annual eligibility and actual AMT history only.
      // Every original K1/K3 and both source selections are visibly originated below.
      annual.qualifiedK3Statements = [];
      annual.sources = [];
      annual.sourceFactsConfirmed = null;
      required(annual.creditWithForm1116).incomeSources = [];
      required(annual.creditWithForm1116).sourceFactsConfirmed = null;
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
      const text = (label: string) => page.getByRole('textbox', { name: label, exact: true });
      const choice = (label: string) => page.getByRole('combobox', { name: label, exact: true });
      const hero = page.locator('.guided-ticker-value-hero').first();
      const originalConfirmation = choice('K3 1 original facts checked after the last edit');
      const ordinaryConfirmation = choice('Ordinary credit sources checked after the last edit');
      const annualConfirmation = choice('Foreign-tax election sources checked after the last edit');
      await page.getByRole('button', { name: 'Add original partnership K1 and K3', exact: true }).click();
      await expect(text('K3 1 allocated foreign deductions')).toHaveValue('');
      await expect(choice('K3 1 original entity-paid taxes are reported in USD')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const [label, value] of [
        ['original tax year', '2025'], ['partnership name', 'Fictional Ordinary LP'], ['partnership EIN', '12-3456789'],
        ['original recipient name', 'Jordan Example'], ['recipient taxpayer identifier last four digits', '3333'],
        ['original K1 reference', 'Private original K1'], ['qualified K3 and country detail reference', 'Private K3 original and Canada detail'],
        ['actual foreign country', 'Canada'], ['original interest', '20000'], ['original ordinary dividends', '0'],
        ['original qualified-dividend subset', '0'], ['actual foreign gross income', '20000'], ['actual foreign tax', '900'],
        ['opening outside basis', '10000'], ['opening outside basis reference', 'Private opening basis'],
        ['allocated foreign deductions', '0'], ['allocated foreign interest expense', '0'], ['allocated other expenses', '0'],
        ['tax reductions', '0'], ['redetermination amount', '0'], ['USD paid-tax original reference', 'Private PartIII section4 original USD paid tax details'],
      ]) await text(`K3 1 ${label}`).fill(value);
      for (const [label, value] of [
        ['entity type', 'partnership'], ['return owner', 'primary'], ['actual qualified statement', 'schedule_k3_1065'],
        ['actual foreign income category', 'passive'], ['is an actual calendar-year partnership', 'true'],
        ['original entity-paid taxes are reported in USD', 'true'], ['is an actual continuing domestic non-PTP partnership', 'true'],
        ['has only portfolio interest and dividends outside the ordinary course of business, all foreign and passive category', 'true'],
        ['has known zero other boxes, including business, rental, capital gains or losses, self-employment, QBI, deductions, distributions, withholding, credits and AMT items', 'true'],
        ['has no other basis changes, including contributions or liability changes', 'true'],
        ['has no prior basis-suspended amounts, including foreign tax', 'true'], ['has no prior at-risk-suspended amounts', 'true'],
        ['has no prior passive-suspended amounts', 'true'],
      ]) await choice(`K3 1 ${label}`).selectOption(value);
      await page.getByRole('button', { name: 'Add K3 1 entity-paid tax detail', exact: true }).click();
      await text('K3 1 entity-paid detail 1 date').fill('2025-09-15');
      await text('K3 1 entity-paid detail 1 USD amount').fill('900');
      await originalConfirmation.selectOption('true');
      await page.getByRole('button', { name: 'Add ordinary foreign income statement', exact: true }).click();
      await page.getByRole('button', { name: 'Add foreign-tax statement', exact: true }).click();
      async function selectAndConfirmSources() {
        await choice('Ordinary income statement 1').selectOption('scheduleK1:0');
        await choice('Ordinary income 1 passive group').selectOption('withholding_under_15');
        await choice('Foreign-tax statement 1').selectOption('scheduleK1:0');
        await choice('Source 1 jurisdiction').selectOption('foreign_country');
        for (const label of ['is a qualified foreign income tax', 'is passive income', 'is legally owed by this taxpayer', 'has no refund or subsidy entitlement', 'meets the actual holding-period requirement', 'has no related-payment obligation', 'has no disallowed-country or boycott reduction']) {
          await choice(`Source 1 ${label}`).selectOption('true');
        }
        for (const label of ['tax on excluded income', 'tax deducted elsewhere', 'investment tax allocation']) await text(`Source 1 ${label}`).fill('0');
        await expect(page.getByRole('button', { name: 'Add payment for source 1', exact: true })).toHaveCount(0);
        await ordinaryConfirmation.selectOption('true');
        await annualConfirmation.selectOption('true');
      }
      async function assertFreshResult() {
        await expect(hero).toHaveText('$555');
        const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), key);
        const input = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(saved)));
        const result = calculateFederalTax(input);
        expect(result.totalTax.toFixed()).toBe('12555');
        expect(input.w2s[0].federalWithheld).toBe('12000');
        expect(result.totalPayments.toFixed()).toBe('12000');
        expect(result.estimatedTaxPenalty.toFixed()).toBe('0');
        expect(result.amountOwed.toFixed()).toBe('555');
        expect(result.foreignTaxCredit.toFixed()).toBe('900');
        expect(result.foreignTaxOrdinaryCredit?.amt.creditAllowed.toFixed()).toBe('619');
        expect(result.foreignTaxOrdinaryCredit?.amt.currentCarryforward.toFixed()).toBe('281');
      }
      await selectAndConfirmSources();
      await assertFreshResult();
      // A substantive original edit revokes actual confirmation; blank remains unknown.
      await text('K3 1 allocated foreign deductions').fill('');
      await text('K3 1 allocated foreign deductions').blur();
      await expect(originalConfirmation).toHaveValue('');
      await expect(ordinaryConfirmation).toHaveValue('');
      await expect(annualConfirmation).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload();
      await expect(text('K3 1 allocated foreign deductions')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await text('K3 1 allocated foreign deductions').fill('0');
      await text('K3 1 allocated foreign deductions').blur();
      await expect(text('K3 1 allocated foreign deductions')).toHaveValue('0');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await originalConfirmation.selectOption('true');
      await selectAndConfirmSources();
      await assertFreshResult();
      await page.reload();
      await expect(originalConfirmation).toHaveValue('true');
      await expect(ordinaryConfirmation).toHaveValue('true');
      await expect(annualConfirmation).toHaveValue('true');
      await expect(text('K3 1 allocated foreign deductions')).toHaveValue('0');
      await expect(text('K3 1 entity-paid detail 1 date')).toHaveValue('2025-09-15');
      await assertFreshResult();
      await text('K3 1 original interest').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`ordinary-k3-originals-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(protectedRequests).toEqual([]);
      for (const marker of ['Private original K1', 'Private K3 original and Canada detail', 'Private opening basis', 'Private PartIII section4 original USD paid tax details', 'Fictional Ordinary LP', '12-3456789', 'Jordan Example', '111-22-3333', '2025-09-15']) expect(bodies.join('\n')).not.toContain(marker);
    });
  });
}
