// Spec: spec/federal/guided-market-discount-sources.yaml, visible-source-controls.
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { guidedMarketDiscountState, guidedMarketDiscountOriginal } from '../../../tests/fixtures/guided-market-discount-sources';
import { marketDiscountAmountFields, marketDiscountBooleanFields } from '../src/lib/guided-market-discount-sources';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { calculateFederalTax, parseInput } from '../../../src/index';

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test.describe(`Original market discount at ${viewport.width}px`, () => {
    test('types original debt elections and history, replays exact allocation and invalidates edits', async ({page},testInfo) => {
      await page.setViewportSize(viewport);
      const requests: {url:string;body:string}[]=[];
      page.on('request',request=>requests.push({url:request.url(),body:request.postData()??''}));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw Error('Missing fictional return');
      await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
      const state=guidedMarketDiscountState();
      expect(state.sectionData['income-investments']!.digitalAssetEntries![0].transactions![0].marketDiscountFacts).toBeUndefined();
      await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});
      await page.reload();
      await expect(page.getByRole('heading',{name:'Investment Income',exact:true})).toBeVisible();
      const hero=page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByText('Original digital assets (1099-DA)',{exact:true}).click();
      await page.getByRole('button',{name:'Add original market discount sources for DA 1 sale 1',exact:true}).click();
      const field=(label:string)=>page.getByRole('textbox',{name:`DA 1 sale 1 — ${label}`,exact:true});
      const choice=(label:string)=>page.getByRole('combobox',{name:`DA 1 sale 1 — ${label}`,exact:true});
      const debtConfirmed=choice('Debt, election, history and interest originals checked after the last edit');
      await expect(debtConfirmed).toHaveValue('');await expect(choice('Current-inclusion market discount election applies')).toHaveValue('');
      await expect(field('Previously included market discount')).toHaveValue('');
      await debtConfirmed.selectOption('true');
      await choice('Basis records checked after the last edit').selectOption('true');
      await page.getByRole('combobox',{name:'DA statement 1 — Sources checked after the last edit',exact:true}).selectOption('true');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Investment Income',exact:true})).toBeVisible();await expect(hero).toHaveText('Enter more info for an estimate');
      const original=guidedMarketDiscountOriginal(),facts=original.transactions![0].marketDiscountFacts!;
      await field('Actual debt security identifier').fill('SYNTH00001');
      for(const [key,label] of [['sourceReference','Original debt and election record reference'],['originalDispositionReference','Original full sale record reference'],['issueDate','Original debt issue date'],['maturityDate','Original debt maturity date'],['interestReconciliationReference','Original INT/OID reconciliation reference']] as const) await page.getByLabel(`DA 1 sale 1 — ${label}`,{exact:true}).fill(facts[key]!);
      await choice('Actual issuer tax treatment').selectOption('taxable_corporate');await choice('Actual cause of ordinary income').selectOption('market_discount_only');
      for(const [key,label] of marketDiscountAmountFields) await field(label).fill(facts[key]!);
      for(const [key,label] of marketDiscountBooleanFields) await choice(label).selectOption(String(facts[key]));
      await expect(debtConfirmed).toHaveValue('');await debtConfirmed.selectOption('true');
      await choice('Basis records checked after the last edit').selectOption('true');
      await page.getByRole('combobox',{name:'DA statement 1 — Sources checked after the last edit',exact:true}).selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload();await expect(page.getByRole('heading',{name:'Investment Income',exact:true})).toBeVisible();
      await page.getByText('Original digital assets (1099-DA)',{exact:true}).click();await expect(debtConfirmed).toHaveValue('true');
      const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}'),id);
      const input=parseInput(buildTaxInputFromGuidedData(saved)),result=calculateFederalTax(input),row=input.form1099DA[0].transactions[0];
      expect(row.ordinaryIncome).toBe(true);expect(row.noncoveredSecurity).toBe(true);
      expect(result.totalInterest.toFixed()).toBe('50.005');expect(result.capitalGainLoss.toFixed()).toBe('150.015');
      expect(row.marketDiscountSource?.interestReportingReconciliation.originalForm1099Int).toEqual([]);expect(input.form1099Int).toEqual([]);
      writeFileSync(testInfo.outputPath(`market-discount-originals-${viewport.width}.json`),JSON.stringify(saved,null,2)+'\n');
      await field('Original debt and election record reference').fill('Changed actual original source reference');
      await expect(debtConfirmed).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload();await page.getByText('Original digital assets (1099-DA)',{exact:true}).click();
      await expect(debtConfirmed).toHaveValue('');await expect(field('Original debt and election record reference')).toHaveValue('Changed actual original source reference');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.screenshot({path:testInfo.outputPath(`market-discount-sources-${viewport.width}.png`),fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const request of requests)for(const secret of ['Fictional original debt and election ledger','111-22-3333','SYNTH00001'])expect(request.body).not.toContain(secret);
    });
  });
}
