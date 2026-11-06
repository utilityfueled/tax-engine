import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { taxpayerFacts2025 } from './guided-fixtures';
import { actualGuidedQsbs } from '../../../tests/fixtures/guided-qsbs';
import { actualGuidedScheduleD } from '../../../tests/fixtures/guided-schedule-d-sources';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`QSBS review at ${viewport.width}px`, () => {
    test('downloads validated QSBS amounts with redacted identifiers', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id) throw new Error('Missing synthetic workspace');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, qsbs, capital }) => {
        const trade = { description: 'Synthetic eligible corporation', dateAcquired: '2008-01-02', dateSold: '2025-06-30', proceeds: '1100.35', costBasis: '100.10',
          adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'long', basisReportedToIRS: false,
          digitalAsset: false, sourceClassificationConfirmed: true, specialGainCharacter: 'qsbs' };
        const broker = { broker: 'Actual broker', sourceId: 'Original broker statement', sourceTaxYear: '2025', accountHolder: 'primary', federalWithheld: '0', stateTaxReporting: 'none', transactions: [trade] };
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'false');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'complete', taxYear: 2025,
          currentSectionIndex: 7, completedSections: ['personal-info', 'income-investments', 'deductions', 'credits', 'other-taxes', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-investments': { interestEntries: [], dividendEntries: [], brokerageEntries: [broker], section1202Sources: qsbs,
            scheduleDSources: { ...capital, priorShortTermCapitalLoss: '0', longTermAssets: [{ ...trade, sourceId: 'form1099B:0:transaction:0', sourceTaxYear: '2025', sourceReference: 'Original broker statement', accountHolder: 'primary', payerName: broker.broker, character: 'qsbs' }] } } },
        }));
      }, { id, personal: { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' }, qsbs: actualGuidedQsbs, capital: actualGuidedScheduleD });
      await page.reload();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloaded = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const download = await downloaded; const path = await download.path();
      if (!path) throw new Error('Missing synthetic review download');
      const bytes = await readFile(path);
      const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import io,sys;from pypdf import PdfReader;print(' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))"],
      { input: bytes, encoding: 'utf8' });
      expect(text).toContain('Synthetic eligible corporation');
      expect(text).toContain('(500)'); expect(text).toContain('1100');
      for (const privateValue of ['111223333', '111-22-3333', 'Private original issuer packet']) expect(text).not.toContain(privateValue);
      expect(text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
      await page.screenshot({ path: testInfo.outputPath(`qsbs-review-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
