// Spec: spec/federal/guided-k1-cash-distribution.yaml
import { expect, test } from '@playwright/test';
import { actualGuidedK1CashDistribution } from '../../../tests/fixtures/guided-k1-cash-distribution';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic distribution employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual cash distribution at ${viewport.width}px`, () => {
    test('retains actual cash distribution sources through local reload', async ({ page }, testInfo) => {
      const scorp = viewport.width === 390, sources = actualGuidedK1CashDistribution(scorp), posts: string[] = [];
      await page.setViewportSize(viewport); page.on('request', request => posts.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2, sources }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, deductions: {
            method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0',
            casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: sources,
          } } }));
      }, { id, personal, w2, sources });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      const agi = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' });
      const taxable = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' });
      await expect(agi).toContainText('$100,001'); await expect(taxable).toContainText(scorp ? '$99,851' : '$99,901');
      const open = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
        await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      };
      await open();
      const amount = page.getByRole('textbox', { name: 'Charitable K-1 1 distribution actual cash', exact: true });
      await expect(amount).toHaveValue('31.00');
      await page.getByRole('textbox', { name: 'Charitable K-1 1 distribution original source reference', exact: true }).fill('synthetic-private-distribution-source');
      for (const [name, value] of [
        ['Charitable K-1 1 original cash distributions', '1030.25'], ['Charitable K-1 1 distribution actual cash', '1030.25'],
        ['Charitable K-1 1 Form 6198 disposition gain or loss', '1000.25'], ['Charitable K-1 1 Form 6198 current-year decreases', '1030.25'],
        ['Charitable K-1 1 at risk current-year decreases', '1030.25'],
      ]) { const field = page.getByRole('textbox', { name, exact: true }); await field.fill(value); await field.press('Tab'); }
      const confirmations = ['Charitable K-1 1 basis', 'Charitable K-1 1 at risk', 'Charitable K-1 1 prior at-risk history', 'Charitable K-1 1 distribution', 'K-1 charitable packet'];
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      const confirm = async () => { for (const prefix of confirmations) await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true'); };
      await confirm(); await expect(agi).toContainText('$101,000'); await expect(taxable).toContainText(scorp ? '$100,850' : '$100,900');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open(); await expect(amount).toHaveValue('1,030.25');
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('true');
      const ref = page.getByRole('textbox', { name: 'Charitable K-1 1 distribution actual at-risk source reference', exact: true });
      await ref.fill('different actual activity'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await ref.fill('Fictional complete activity worksheet'); await confirm(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      const actual = page.getByRole('combobox', { name: 'Charitable K-1 1 distribution cash only', exact: true });
      await actual.selectOption('false'); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.cashDistribution?.cashOnlyConfirmed, id)).toBe(false);
      await actual.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.cashDistribution?.cashOnlyConfirmed, id)).toBe(null);
      await page.reload(); await open(); await expect(actual).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources, id);
      expect(saved.statements[0].cashDistribution).toMatchObject({ cashAmount: '1,030.25', acquisitionDate: '2023-01-01', cashOnlyConfirmed: null, sourceFactsConfirmed: null });
      expect(saved.statements[0].cashDistribution).not.toHaveProperty('gain'); expect(saved.statements[0].original.beginningBasis).toBe('30.00');
      expect(saved.statements[0].original.form6198.gainLossFromDispositions).toBe('1,000.25');
      expect(saved.statements[0].basis.priorBasisSuspensions).toEqual([]);
      await amount.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`k1-distribution-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of [personal.ssn, 'synthetic-private-distribution-source', 'Fictional original Form6198 gain item', 'original-gift-1']) expect(posts.join('\n')).not.toContain(secret);
    });
  });
}
