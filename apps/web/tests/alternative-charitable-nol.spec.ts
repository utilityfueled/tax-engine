import { expect, test } from '@playwright/test';
import { actualGuidedNolSources } from '../../../tests/fixtures/guided-net-operating-loss';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic NOL Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0', socialSecurityWages: '0', socialSecurityTips: '0', socialSecurityWithheld: '0', medicareWages: '0', medicareWithheld: '0', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Alternative charity histories at ${viewport.width}px`, () => {
    test('preserves independently entered charitable histories', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2, sources }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'], segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, adjustments: { netOperatingLossSources: sources } },
        }));
      }, { id, personal, w2, sources: actualGuidedNolSources });
      await page.reload();
      const open = () => page.getByText('Net operating loss carry sources', { exact: true }).click(); await open();
      await page.getByRole('button', { name: 'Add independent charitable carry histories', exact: true }).click();
      await expect(page.getByText('This regular charitable history is unknown.', { exact: true })).toBeVisible();
      await expect(page.getByText('This AMT charitable history is unknown.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Record no prior regular charitable carryovers', exact: true }).click();
      await expect(page.getByText('This AMT charitable history is unknown.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Record no prior AMT charitable carryovers', exact: true }).click();
      await page.getByRole('textbox', { name: 'Charitable histories source tax year', exact: true }).fill('2024');
      await page.getByRole('textbox', { name: 'Charitable histories source reference', exact: true }).fill('synthetic-private-charity-history');
      await page.getByRole('combobox', { name: 'All prior regular and AMT charitable carryovers included', exact: true }).selectOption('true');
      for (const label of ['Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
      }
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open();
      await expect(page.getByRole('textbox', { name: 'Charitable histories source reference', exact: true })).toHaveValue('synthetic-private-charity-history');
      await expect(page.getByRole('combobox', { name: 'Charitable carry histories checked after the last edit', exact: true })).toHaveValue('true');
      await page.getByRole('textbox', { name: 'Charitable histories source tax year', exact: true }).fill('2023');
      for (const label of ['Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveValue('');
      }
      await page.getByRole('textbox', { name: 'Charitable histories source tax year', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`alternative-charity-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-charity-history', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
    });
  });
}
