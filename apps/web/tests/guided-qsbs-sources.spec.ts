import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualGuidedQsbs } from '../../../tests/fixtures/guided-qsbs';
import { actualGuidedScheduleD } from '../../../tests/fixtures/guided-schedule-d-sources';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`QSBS sources at ${viewport.width}px`, () => {
  test('preserves actual QSBS issuer history', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
    await page.evaluate(({ id, personal, qsbs, capital }) => {
      const trade = { description: 'Synthetic eligible corporation', dateAcquired: '2008-01-02', dateSold: '2025-06-30',
        proceeds: '1100.35', costBasis: '100.10', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long',
        basisReportedToIRS: false, digitalAsset: false, sourceClassificationConfirmed: true, specialGainCharacter: 'qsbs' };
      const broker = { broker: 'Actual broker', sourceId: 'Original broker statement', sourceTaxYear: '2025', accountHolder: 'primary', federalWithheld: '0', stateTaxReporting: 'none', transactions: [trade] };
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 1, completedSections: ['personal-info'], segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [broker], section1202Sources: qsbs,
          scheduleDSources: { ...capital, priorShortTermCapitalLoss: '0', longTermAssets: [{ ...trade, sourceId: 'form1099B:0:transaction:0', sourceTaxYear: '2025', sourceReference: 'Original broker statement', accountHolder: 'primary', payerName: broker.broker, character: 'qsbs' }] } } },
      }));
    }, { id, personal, qsbs: actualGuidedQsbs, capital: actualGuidedScheduleD });
    await page.reload();
    const open = () => page.getByText('Small business stock issuer and lot sources', { exact: true }).click(); await open();
    await page.getByRole('textbox', { name: 'QSBS source packet reference', exact: true }).fill('synthetic-private-qsbs-packet');
    await page.getByRole('button', { name: 'Add Issuer 1 prior return', exact: true }).click();
    for (const [label, value] of [['Issuer 1 prior return 1 tax year', '2020'], ['Issuer 1 prior return 1 source reference', 'synthetic-private-prior-issuer'], ['Issuer 1 prior return 1 primary first name', 'Jordan'], ['Issuer 1 prior return 1 primary last name', 'Example'], ['Issuer 1 prior return 1 primary ID last four', '3333'], ['Issuer 1 prior return 1 eligible gain used', '1000.01']]) await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    await page.getByRole('combobox', { name: 'Issuer 1 prior return 1 filing status', exact: true }).selectOption('single');
    await page.getByRole('textbox', { name: /^Issuer 1 prior eligible gain before exclusion(?:\s|$)/ }).fill('1000.01');
    await page.getByText('Capital gain character and loss carryovers (Schedule D)', { exact: true }).click();
    const capitalConfirmed = page.getByRole('combobox', { name: 'Have you reviewed the capital source worksheet after the last edit?', exact: true });
    const qsbsConfirmed = page.getByRole('combobox', { name: 'QSBS sources checked after the last edit', exact: true });
    await expect(capitalConfirmed).toHaveValue(''); await expect(qsbsConfirmed).toHaveValue('');
    await capitalConfirmed.selectOption('true'); await qsbsConfirmed.selectOption('true'); await expect(capitalConfirmed).toHaveValue('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.section1202Sources?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await open();
    await expect(qsbsConfirmed).toHaveValue('true');
    await expect(page.getByRole('textbox', { name: /^Issuer 1 prior eligible gain before exclusion(?:\s|$)/ })).toHaveValue('1,000.01');
    await expect(page.getByRole('textbox', { name: 'Issuer 1 prior return 1 eligible gain used', exact: true })).toHaveValue('1,000.01');
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.brokerageEntries?.[0]?.transactions?.[0]?.proceeds, id)).toBe('1100.35');
    const assets = page.getByRole('textbox', { name: 'Lot 1 maximum gross assets before issue', exact: true }); await assets.fill('');
    await expect(qsbsConfirmed).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.section1202Sources?.lots?.[0]?.qualification?.maxGrossAssetsBeforeIssue, id)).toBe('');
    await assets.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`qsbs-history-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const value of ['synthetic-private-qsbs-packet', 'synthetic-private-prior-issuer', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
  });
  });
}
