// Spec: spec/federal/guided-k1-charitable-sources.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedK1Charity, actualGuidedLinkedK1Charity } from '../../../tests/fixtures/guided-k1-charitable-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic K1 charity employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual K1 charitable sources at ${viewport.width}px`, () => {
    test('retains original K1 charitable sources through local reload', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
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
      }, { id, personal, w2, sources: actualGuidedK1Charity() });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      const taxable = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' });
      await expect(taxable).toContainText('$99,870');
      const open = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
        await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      };
      await open();
      await expect(page.getByRole('textbox', { name: 'Charitable K-1 1 original capital gain property code E', exact: true })).toHaveValue('150.00');
      await page.getByRole('textbox', { name: 'K-1 charitable packet source reference', exact: true }).fill('synthetic-private-k1-charity-packet');
      for (const label of ['Charitable K-1 1 original capital gain property code E', 'Charitable K-1 1 current gift 1 contribution share', 'Charitable K-1 1 receipt 1 allocated original fair market value']) {
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.fill('150.60'); await field.press('Tab'); await expect(field).toHaveValue('150.60');
      }
      const confirmations = ['Charitable K-1 1 basis', 'Charitable K-1 1 at risk', 'Charitable K-1 1 prior at-risk history', 'K-1 charitable packet'];
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const prefix of confirmations) await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true');
      await expect(taxable).toContainText('$99,869');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('true');
      await expect(page.getByRole('textbox', { name: 'Charitable K-1 1 current gift 1 contribution share', exact: true })).toHaveValue('150.60');
      const amt = page.getByRole('combobox', { name: 'Charitable K-1 1 regular and AMT treatment are the same', exact: true });
      await amt.selectOption('false'); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.sameRegularAmtTreatmentConfirmed, id)).toBe(false);
      await amt.selectOption('true');
      for (const prefix of confirmations) await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const sourceAmount = page.getByRole('textbox', { name: 'Charitable K-1 1 Form 6198 ordinary income or loss', exact: true });
      await sourceAmount.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.original?.form6198?.ordinaryIncome, id)).toBe('');
      await page.reload(); await open(); await expect(sourceAmount).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources, id);
      expect(saved.statements[0].original.charitableCapitalGain30).toBe('150.60');
      expect(saved.statements[0].original.section199AIsSST).toBe(false);
      expect(saved.statements[0].basis.priorBasisSuspensions).toEqual([]);
      expect(saved.statements[0].atRisk.priorLossHistory.vintages).toEqual([]);
      expect(saved.statements[0].original.form6198.otherIncomeGains).toBe('0');
      expect(saved.statements[0].receipts[0].basisSourceId).toBe('original-gift-1');
      expect(saved.sourceFactsConfirmed).toBeNull(); expect(saved).not.toHaveProperty('allowedDeduction'); expect(saved).not.toHaveProperty('agi');
      await sourceAmount.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`k1-charitable-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-k1-charity-packet', 'original-gift-1', 'Fictional original basis worksheet', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });

    test('completes linked charity attachments before advancing from adjustments', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = actualGuidedLinkedK1Charity(); sources.charity.sourceFactsConfirmed = false;
      await page.evaluate(({ id, personal, w2, sources }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, adjustments: { k1LossSources: sources.qualifiedLoss }, deductions: {
            method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0',
            casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: sources.charity,
          } } }));
      }, { id, personal, w2, sources });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect(page.locator('.guided-progress-step-active')).toContainText('Adjustments');
      await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
      const confirmation = page.getByRole('combobox', { name: 'K-1 charitable packet checked after the last edit', exact: true });
      await expect(confirmation).toHaveValue('false');
      await confirmation.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' })).toContainText('$95,000');
      await expect(page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' })).toContainText('$90,000');
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      await page.getByText('Charitable contributions reported on Schedule K-1', { exact: true }).click();
      await page.getByText('Charitable K-1 1 original and attachments', { exact: true }).click();
      await expect(confirmation).toHaveValue('true');
      await expect(page.getByRole('combobox', { name: 'Charitable K-1 1 existing original K-1', exact: true })).toHaveValue('scheduleK1:0');
      await expect(page.getByRole('textbox', { name: 'Charitable K-1 1 original cash contributions code A', exact: true })).toHaveValue('10000.00');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.adjustments.k1LossSources.activities).toHaveLength(1);
      expect(saved.deductions.k1CharitableSources.statements).toHaveLength(1);
      expect(saved.adjustments.k1LossSources.activities[0].allOtherAmountsZeroConfirmed).toBe(false);
      expect(saved.adjustments.k1LossSources.activities[0].allOtherNonCharitableAmountsZeroConfirmed).toBe(true);
      await confirmation.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`k1-charitable-linked-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['original-gift-1', 'Fictional original basis worksheet', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
