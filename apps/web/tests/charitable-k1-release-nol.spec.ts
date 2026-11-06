import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { releasedCharitableGuideSources } from '../../../tests/fixtures/charitable-k1-release-guide-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Prior K1 basis release at ${viewport.width}px`, () => {
    test('preserves prior basis sources through confirmation and saved review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: Array<{url:string;body:string}> = [];
      page.on('request', request => requests.push({ url:request.url(), body:request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const { loss, charity } = releasedCharitableGuideSources();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3,
        completedSections: ['personal-info','income-w2','adjustments'],
        segmentation: { filingStatus:'single', incomeTypes:['w2-wages'], lifeEvents:['net-operating-loss'], stateCode:null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName:'Jordan', ssn:'111-22-3333' },
          'income-w2': { entries: [{ employerName:'Synthetic Basis Release Employer', employerEin:'12-3456789', accountHolder:'primary', wages:'100000', federalWithheld:'30000',
            socialSecurityWages:'100000', socialSecurityTips:'0', socialSecurityWithheld:'6200', medicareWages:'100000', medicareWithheld:'1450', box10DependentCareBenefits:'0', box12CodeW:'0', stateTaxReporting:'none' }] },
          adjustments: { netOperatingLossSources:loss }, deductions: { method:'itemized', medicalExpenses:'0', stateLocalTaxes:'0', realEstateTaxes:'0', mortgageInterest:'0', charitableContributions:'0',
            casualtyLosses:'0', otherItemized:'0', gamblingWinnings:'0', nonW2IncomeTaxesDeductedElsewhere:'0', donationEntries:[], k1CharitableSources:charity } } };
      await page.evaluate(({id,state}) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id,state });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', {name:'Expand Ticker',exact:true}).click();
      await page.locator('.guided-ticker-clickable').first().click();
      await expect(page.locator('.guided-ticker-breakdown-row').filter({hasText:'Adjusted Gross Income'})).toContainText('$44,000');
      await expect(page.locator('.guided-ticker-breakdown-row').filter({hasText:'Taxable Income'})).toContainText('$30,800');
      const openCharity = async () => {
        await page.getByText('Charitable contributions reported on Schedule K-1',{exact:true}).click();
        await page.getByText('Charitable K-1 1 original and attachments',{exact:true}).click();
      };
      await openCharity();
      await expect(page.getByText('Explicitly recorded: no current K-1 gifts.',{exact:true})).toBeVisible();
      const history = 'Charitable K-1 1 prior basis origin 1';
      await expect(page.getByRole('textbox',{name:`${history} origin year`,exact:true})).toHaveValue('2018');
      const used = page.getByRole('textbox',{name:`${history} use 7 basis used`,exact:true});
      await expect(used).toHaveValue('0'); await used.fill('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await used.fill('0'); await used.press('Tab');
      await page.getByRole('textbox',{name:`${history} original reference`,exact:true}).fill('synthetic-private-basis-release-history');
      const confirmations = ['Charitable K-1 1 basis','Charitable K-1 1 at risk','Charitable K-1 1 prior at-risk history','K-1 charitable packet'];
      for (const prefix of confirmations) await expect(page.getByRole('combobox',{name:`${prefix} checked after the last edit`,exact:true})).toHaveValue('');
      for (const prefix of confirmations) await page.getByRole('combobox',{name:`${prefix} checked after the last edit`,exact:true}).selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button',{name:/^Adjustments(?: — needs review)?$/,exact:true}).click();
      await page.getByText('Net operating loss carry sources',{exact:true}).click();
      for (const label of ['Charitable carry histories checked after the last edit','AMT NOL sources checked after the last edit','Regular NOL sources checked after the last edit']) {
        await expect(page.getByRole('combobox',{name:label,exact:true})).toHaveValue('');
        await page.getByRole('combobox',{name:label,exact:true}).selectOption('true');
      }
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      await page.reload(); await openCharity();
      await expect(page.getByRole('textbox',{name:`${history} origin year`,exact:true})).toHaveValue('2018');
      await expect(page.getByRole('textbox',{name:`${history} use 7 basis used`,exact:true})).toHaveValue('0');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData,id);
      expect(Object.keys(saved.adjustments)).toEqual(['netOperatingLossSources']);
      expect(saved.deductions.k1CharitableSources.statements[0].basis.currentContributions).toEqual([]);
      expect(saved.deductions.k1CharitableSources.statements[0].basis.priorBasisSuspensions[0].basisUseHistory).toEqual(charity.statements?.[0].basis?.priorBasisSuspensions?.[0].basisUseHistory);
      expect(saved.deductions.k1CharitableSources.statements[0].receipts[0].contributionDate).toBe('2018-06-01');
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorRegularCarryovers).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorAlternativeCarryovers).toEqual([]);
      for (const key of ['allowedDeduction','releasedBasis','agi']) expect(saved.deductions.k1CharitableSources).not.toHaveProperty(key);
      for (const secret of ['synthetic-private-basis-release-history','111-22-3333']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await used.scrollIntoViewIfNeeded(); await page.screenshot({path:testInfo.outputPath(`basis-release-sources-${viewport.width}.png`)});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('.guided-progress-steps').getByRole('button',{name:'Final Review',exact:true})).toBeDisabled();
      await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();
      const bundle = page.getByRole('region',{name:'Draft Return Bundle',exact:true});
      await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button',{name:'Download Draft Filled Return PDF',exact:true}).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`basis-release-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3',['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))",output],{encoding:'utf8'})) as string[];
      const text = pages.join(' ').replace(/\s+/g,' ');
      for (const value of ['original year 2018; prior basis source','basis allowed this year: $60000','remaining 33360','Separate alternative-tax charitable carry 46800']) expect(text).toContain(value);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333','111223333','synthetic-private-basis-release-history','actual-prior-basis-2018']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('synthetic-private-basis-release-history'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({path:testInfo.outputPath(`basis-release-review-${viewport.width}.png`)});
    });
  });
}
