import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualGuidedChild } from '../../../tests/fixtures/guided-child-election';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`preserves actual child gain character and carryover sources at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, child }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        currentSectionIndex: 1, completedSections: ['personal-info'], segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [],
          childElections: [{ ...child, taxableInterest: '4000', taxExemptInterest: '0', amtStatements: [], capitalGainDistributions: '6000' }] } },
      }));
    }, { id, personal: taxpayerFacts2025, child: actualGuidedChild });
    await page.reload();
    await page.getByText('Report a child’s interest and dividends (Form 8814)', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Do capital distributions include collectibles, section 1250 or section 1202 gain?', exact: true }).selectOption('true');
    await page.getByLabel('Child income character source reference', { exact: true }).fill('synthetic-private-capital-source');
    for (const [label, value] of [['Child collectibles capital gain distributions', '1000.01'], ['Child unrecaptured section 1250 distributions', '2000'], ['Child section 1202 distributions', '0']]) {
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
    }
    await page.getByText('Capital gain character and loss carryovers (Schedule D)', { exact: true }).click();
    await page.getByRole('button', { name: 'Add capital source worksheet', exact: true }).click();
    await expect(page.getByLabel('Capital worksheet tax year', { exact: true })).toHaveValue('');
    for (const [label, value] of [['Capital worksheet tax year', '2025'], ['Capital worksheet source reference', 'synthetic-private-loss-source'], ['Primary capital source first name and middle initial', 'Jane'], ['Primary capital source last name', 'Example'], ['Primary capital source taxpayer ID last four digits', '0001']]) await page.getByLabel(label, { exact: true }).fill(value);
    for (const [label, value] of [['Prior short-term capital loss carryover', '-1000.01'], ['Prior long-term capital loss carryover', '0'], ['Actual section 1231 lookback amount', '0']]) await page.getByRole('textbox', { name: new RegExp(`^${label}`) }).fill(value);
    for (const [label, value] of [['Are AMT asset bases and capital loss carryovers the same as regular tax?', 'true'], ['Does the return include Form 2439 undistributed gains?', 'false'], ['Was a partnership interest disposed of?', 'false'], ['Were there other section 1250 property dispositions?', 'false'], ['Does this worksheet include every actual capital source and carryover?', 'true']]) await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
    const confirmed = page.getByRole('combobox', { name: 'Have you reviewed the capital source worksheet after the last edit?', exact: true });
    const childConfirmed = page.getByRole('combobox', { name: 'Have you reviewed all child election sources?', exact: true });
    await childConfirmed.selectOption('true'); await confirmed.selectOption('true');
    await expect(childConfirmed).toHaveValue('true');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.scheduleDSources?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload();
    await page.getByText('Capital gain character and loss carryovers (Schedule D)', { exact: true }).click();
    await expect(confirmed).toHaveValue('true');
    const loss = page.getByRole('textbox', { name: /^Prior short-term capital loss carryover/ }); await expect(loss).toHaveValue('-1,000.01');
    await page.getByText('Report a child’s interest and dividends (Form 8814)', { exact: true }).click();
    await expect(childConfirmed).toHaveValue('true');
    await expect(page.getByRole('textbox', { name: 'Child collectibles capital gain distributions', exact: true })).toHaveValue('1,000.01');
    await loss.fill(''); await expect(confirmed).toHaveValue('');
    await expect(page.getByLabel('Capital worksheet source reference', { exact: true })).toHaveValue('synthetic-private-loss-source');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-investments']?.scheduleDSources?.priorShortTermCapitalLoss, id)).toBe('');
    await page.getByText('Capital gain character and loss carryovers (Schedule D)', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`schedule-d-sources-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const privateValue of ['synthetic-private-capital-source', 'synthetic-private-loss-source', actualGuidedChild.ssn, taxpayerFacts2025.ssn]) expect(requests.join('\n')).not.toContain(privateValue);
  });
}
