// Spec: spec/federal/guided-k1-qbi-sources.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedK1Sources } from '../../../tests/fixtures/guided-k1-qbi-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual K1 histories at ${viewport.width}px`, () => {
    test('preserves original K1 histories and local source privacy', async ({ page }, testInfo) => {
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
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, adjustments: { k1LossSources: sources } } }));
      }, { id, personal, w2, sources: actualGuidedK1Sources() });
      await page.reload();
      await expect(page.locator('.guided-ticker-value-hero').first()).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown').getByText('$40,000', { exact: true }).first()).toBeVisible();
      const open = async () => {
        await page.getByText('K-1 and qualified loss sources', { exact: true }).click();
        await page.getByText('K-1 1 original and histories', { exact: true }).click();
      };
      await open();
      const original = page.getByRole('textbox', { name: 'K-1 1 ordinary income or loss', exact: true });
      const se = page.getByRole('textbox', { name: 'K-1 1 original Box 14 code A', exact: true });
      await expect(original).toHaveValue('-100000.00');
      await page.getByRole('textbox', { name: 'K-1 packet source reference', exact: true }).fill('synthetic-private-k1-origin');
      await original.fill('-100000.10'); await se.fill('-100000.10'); await se.press('Tab');
      await expect(se).toHaveValue('-100,000.10'); await expect(se).not.toHaveAttribute('aria-invalid', 'true');
      const confirmations = ['K-1 1 basis', 'K-1 1 at risk', 'K-1 1 prior at-risk history', 'K-1 1 prior passive history',
        'K-1 1 SE', 'K-1 1 prior SE history', 'Business classification', 'Prior ordinary QBI', 'K-1 packet'];
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('');
      for (const prefix of confirmations) await page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true }).selectOption('true');
      await expect(page.locator('.guided-ticker-value-hero').first()).not.toHaveText('Enter more info for an estimate');
      await expect(page.locator('.guided-ticker-breakdown').getByText('$40,000', { exact: true }).first()).toBeVisible();
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.k1LossSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(original).toHaveValue('-100,000.10');
      await expect(page.getByRole('textbox', { name: 'K-1 packet source reference', exact: true })).toHaveValue('synthetic-private-k1-origin');
      for (const prefix of confirmations) await expect(page.getByRole('combobox', { name: `${prefix} checked after the last edit`, exact: true })).toHaveValue('true');
      const opening = page.getByRole('textbox', { name: 'K-1 1 at risk prior-year amount at risk', exact: true });
      await opening.fill('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.k1LossSources?.activities?.[0]?.atRisk?.priorYearAmountAtRisk, id)).toBe('');
      await page.reload(); await open(); await expect(opening).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.k1LossSources, id);
      expect(saved.activities[0].statement.ordinaryIncome.replaceAll(',', '')).toBe('-100000.10');
      expect(saved.activities[0].statement.section199AIsSST).toBe(false);
      expect(saved.activities[0].passiveHistory.vintages).toEqual([]);
      expect(saved.activities[0].statement).not.toHaveProperty('selfEmploymentNetEarningsAfterAdjustments');
      expect(saved.activities[0].atRisk.sourceFactsConfirmed).toBeNull();
      expect(saved).not.toHaveProperty('allowedLoss');
      await opening.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`k1-sources-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-k1-origin', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
