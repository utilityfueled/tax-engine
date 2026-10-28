// Spec: spec/federal/guided-k1-passive-distribution.yaml
import { expect, test } from '@playwright/test';
import { actualGuidedK1PassiveDistribution } from '../../../tests/fixtures/guided-k1-passive-distribution';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic passive distribution employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual passive distribution at ${viewport.width}px`, () => {
    test('retains linked passive distribution sources through local reload', async ({ page }, testInfo) => {
      const scorp = viewport.width === 390, sources = actualGuidedK1PassiveDistribution('1500', scorp), posts: string[] = [];
      await page.setViewportSize(viewport); page.on('request', request => posts.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
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
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Adjustments');
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      const agi = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Adjusted Gross Income' }); await expect(agi).toContainText('$100,000');
      const open = async () => {
        for (const name of ['K-1 and qualified loss sources', 'K-1 1 original and histories', 'Charitable contributions reported on Schedule K-1', 'Charitable K-1 1 original and attachments']) await page.getByText(name, { exact: true }).click();
      };
      await open();
      const prefix = 'Charitable K-1 1 passive valuation';
      const date = page.getByRole('textbox', { name: `${prefix} actual report valuation date`, exact: true });
      await expect(date).toHaveValue('2025-12-31');
      await page.getByRole('textbox', { name: `${prefix} original report reference`, exact: true }).fill('synthetic-private-passive-valuation');
      await date.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      const confirmations = ['K-1 packet', 'Prior ordinary QBI', 'K-1 1 basis', 'K-1 1 at risk', 'K-1 1 prior at-risk history', 'K-1 1 prior passive history',
        ...(!scorp ? ['K-1 1 SE', 'K-1 1 prior SE history'] : []),
        'Charitable K-1 1 basis', 'Charitable K-1 1 at risk', 'Charitable K-1 1 prior at-risk history', 'Charitable K-1 1 distribution', prefix, 'K-1 charitable packet'];
      for (const name of confirmations) await expect(page.getByRole('combobox', { name: `${name} checked after the last edit`, exact: true })).toHaveValue('');
      const confirm = async () => { for (const name of confirmations) await page.getByRole('combobox', { name: `${name} checked after the last edit`, exact: true }).selectOption('true'); };
      await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await date.fill('2025-12-31'); await confirm(); await expect(agi).toContainText('$100,000');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.cashDistribution?.passiveActivity?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open(); await expect(date).toHaveValue('2025-12-31');
      for (const name of confirmations) await expect(page.getByRole('combobox', { name: `${name} checked after the last edit`, exact: true })).toHaveValue('true');
      const actual = page.getByRole('combobox', { name: `${prefix} asset 1 continuously used in this passive activity`, exact: true });
      await actual.selectOption('false'); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.cashDistribution?.passiveActivity?.assets?.[0]?.continuousPassiveUseConfirmed, id)).toBe(false);
      await actual.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.k1CharitableSources?.statements?.[0]?.cashDistribution?.passiveActivity?.assets?.[0]?.continuousPassiveUseConfirmed, id)).toBe(null);
      await page.reload(); await open(); await expect(actual).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.deductions.k1CharitableSources.statements[0].cashDistribution.passiveActivity).toMatchObject({ sourceTaxYear: '2025', sourceFactsConfirmed: null,
        appreciatedContributionsFmv: '0', assets: [{ sourceId: 'asset-1', adjustedBasis: '60000', ownerBasisAdjustment: '0', continuousPassiveUseConfirmed: null }] });
      expect(saved.adjustments.k1LossSources.activities).toHaveLength(1);
      expect(saved.adjustments.k1LossSources.activities[0].priorPassiveLoss).toBe('1500');
      expect(saved.adjustments.k1LossSources).not.toHaveProperty('form461Classification');
      expect(saved.deductions.k1CharitableSources.statements[0].cashDistribution).not.toHaveProperty('gain');
      await actual.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`k1-passive-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of [personal.ssn, 'synthetic-private-passive-valuation', 'Fictional original business asset valuation', 'original-gift-1']) expect(posts.join('\n')).not.toContain(secret);
    });
  });
}
