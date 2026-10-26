import { expect, test } from '@playwright/test';
import { priorCharitableGuideSources } from '../../../tests/fixtures/charitable-prior-nol-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Prior charitable NOL sources at ${viewport.width}px`, () => {
    test('preserves the independent prior AMT charitable history', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const { regular, loss } = priorCharitableGuideSources();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2', 'adjustments', 'deductions'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [{ employerName: 'Synthetic Prior Charity Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '20000',
            socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
          adjustments: { netOperatingLossSources: loss }, deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0',
            casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], charitableCarryoverSources: regular } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const open = async () => {
        await page.getByText('Net operating loss carry sources', { exact: true }).click();
        await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      };
      await open();
      await page.getByRole('textbox', { name: 'Charitable carryover packet reference', exact: true }).fill('synthetic-private-independent-AMT');
      for (const label of ['Contribution 1 original excess', 'Contribution 1 opening carryforward', 'AMT charitable carry 1 amount']) {
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.fill('10000.49'); await field.press('Tab');
      }
      const confirmations = ['Charitable carryover sources checked after the last edit', 'Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit'];
      for (const label of confirmations) await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const label of confirmations) await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      // The source edit also revokes the separate regular-history review.
      await page.getByRole('button', { name: /^Deductions(?: — needs review)?$/, exact: true }).click();
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.getByRole('button', { name: /^Adjustments(?: — needs review)?$/, exact: true }).click();
      await page.reload(); await open();
      const opening = page.getByRole('textbox', { name: 'Contribution 1 opening carryforward', exact: true });
      await expect(opening).toHaveValue('10,000.49');
      await expect(page.getByRole('textbox', { name: 'Contribution 1 original tax year', exact: true })).toHaveValue('2024');
      await expect(page.getByRole('textbox', { name: 'Charitable carryover packet reference', exact: true })).toHaveValue('synthetic-private-independent-AMT');
      await opening.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      for (const label of confirmations) await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
      await opening.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`prior-charity-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport.width === 390) {
        expect(await opening.evaluate(element => element.closest('.guided-input-prefix-wrap')?.getBoundingClientRect().width)).toBeGreaterThanOrEqual(220);
        expect(await opening.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
      }
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory, id);
      expect(saved.alternativeCarryoverSources.vintages[0].openingCarryforward).toBe('');
      expect(saved.priorRegularCarryovers[0].amount).toBe('50000');
      for (const forbidden of ['deduction', 'contributionBase', 'currentDeduction']) expect(saved.alternativeCarryoverSources).not.toHaveProperty(forbidden);
      for (const secret of ['synthetic-private-independent-AMT', state.sectionData['personal-info'].ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
