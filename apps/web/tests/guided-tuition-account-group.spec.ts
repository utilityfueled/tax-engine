// Spec: spec/federal/form-1099-q-tuition-account-group.yaml.
import { expect, test } from '@playwright/test';
import { tuitionAccountGroupFixture } from '../../../tests/fixtures/education-tuition-account-group';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual tuition and ESA allocation at ${viewport.width}px`, () => {
    test('preserves shared tuition and separate ESA sources through correction and reload', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const original = tuitionAccountGroupFixture();
      const state = { factsVersion: 2, taxYear: 2025,
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, ...original.taxpayer.primary },
          'income-w2': { entries: [{ employerName: 'Fictional education employer', employerEin: '12-3456789', accountHolder: 'primary',
            wages: '50000', federalWithheld: '20000', socialSecurityWages: '50000', socialSecurityTips: '0', socialSecurityWithheld: '3100',
            medicareWages: '50000', medicareWithheld: '725', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '',
              roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' },
            education: { ...original.educationExpenses, canBeClaimedAsDependent: false,
              llcStudents: original.educationExpenses!.llcStudents!.map(student => ({ ...student, institutions: [{ name: 'Fictional university',
                address: '100 College Road, Columbus OH 43215', ein: '12-3456789', receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }] })) },
            educationDistributions: { ...original.qualifiedEducationExpenses!.sourceFacts, taxYear: '2025',
              forms: original.form1099Q.map(({ transfer, ...fields }) => ({ fields: { ...fields, taxYear: '2025' }, transfer })) } } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: 'interview',
          currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'deductions'] }));
      }, { id, state });
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const checked = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const amounts = page.getByRole('textbox', { name: 'Net expense allocated to this distribution', exact: true });
      const basis = page.getByRole('textbox', { name: 'Actual prior-year account basis', exact: true });
      await expect(hero).toHaveText('$16,091');
      await expect(amounts).toHaveCount(4); await expect(basis).toHaveCount(2);
      await expect(amounts.nth(0)).toHaveValue('1000'); await expect(amounts.nth(3)).toHaveValue('1500');
      await amounts.nth(0).fill('1500'); await amounts.nth(2).fill('2500'); await amounts.nth(2).press('Tab');
      await expect(checked).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await checked.selectOption('true'); await expect(hero).toHaveText('$16,078');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.educationDistributions?.allocations?.[0]?.amount, id)).toBe('1,500');
      await page.reload(); await expect(amounts.nth(0)).toHaveValue('1,500'); await expect(amounts.nth(2)).toHaveValue('2,500');
      await basis.nth(1).fill(''); await checked.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(basis.nth(1)).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await basis.nth(1).fill('800'); await checked.selectOption('true'); await expect(hero).toHaveText('$16,078');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.educationDistributions, id);
      expect(saved.expenses.map((row: { amount: string }) => row.amount)).toEqual(['8000']);
      expect(saved.inKindBenefits.map((row: { amount: string }) => row.amount)).toEqual(['2500', '1500']);
      expect(saved.coverdellAccounts.map((row: { priorYearBasis: string }) => row.priorYearBasis)).toEqual(['3200', '800']);
      expect(saved.forms.map((row: { fields: { sourceId: string; grossDistribution: string; earnings: string; basis: string } }) => [row.fields.sourceId, row.fields.grossDistribution, row.fields.earnings, row.fields.basis]))
        .toEqual([['prepaid', '2500', '500', '2000'], ['prepaid-spring', '1500', '600', '900'], ['esa', '4000', '800', '3200'], ['esa-second', '2000', '1200', '800']]);
      await amounts.nth(0).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`tuition-account-group-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of [original.taxpayer.primary.ssn, 'actual-esa-account', 'Synthetic actual tuition credit application']) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
