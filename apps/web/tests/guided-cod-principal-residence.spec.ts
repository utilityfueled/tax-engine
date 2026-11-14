// Spec: spec/federal/guided-cod-principal-residence.yaml browser-originals.
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { guidedPrincipalResidenceState } from '../../../tests/fixtures/guided-cod-principal-residence';
import { getGuidedSectionRoute, setInterviewTaxYear, type GuidedFlowState } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { buildGuidedCodPrincipalResidence } from '../src/lib/guided-cod-principal-residence';
import { calculateFederalTax, parseInput } from '../../../src/index';

const confirmationLabels=['Mortgage statement checked after the last edit','Original acquisition loan checked after the last edit',
  'Cancellation reason checked after the last edit','Residence basis history checked after the last edit','Residence cancellation packet checked after the last edit'];
async function confirm(page:Page) {for(const name of confirmationLabels){const field=page.getByRole('combobox',{name,exact:true});await field.selectOption('true');await expect(field).toHaveValue('true');}}
async function read(page:Page,id:string):Promise<GuidedFlowState> {
  return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}'),id);
}
for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test.describe(`Retained-home originals at ${viewport.width}px`,()=>{
    test('types retained-home originals, replays canonical basis and preserves closed2026 sources',async({page},testInfo)=>{
      await page.setViewportSize(viewport);
      const requests:{url:string;body:string}[]=[];
      page.on('request',request=>requests.push({url:request.url(),body:request.postData()??''}));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw Error('Missing fictional return');
      await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
      // Only unrelated household, deduction and payment prerequisites are seeded.
      // Every original mortgage answer below is entered through actual controls.
      const state=guidedPrincipalResidenceState(),facts=state.sectionData.adjustments.codPrincipalResidenceSources;
      delete state.sectionData.adjustments.codPrincipalResidenceSources;
      state.currentSectionIndex=getGuidedSectionRoute(state).findIndex(section=>section.id==='adjustments');
      state.completedSections=['personal-info'];
      await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});
      await page.reload();await expect(page.getByRole('heading',{name:'Adjustments to Income',exact:true})).toBeVisible();
      const hero=page.locator('.guided-ticker-value-hero').first();await expect(hero).toHaveText('Enter more info for an estimate');
      const disclosure=page.getByText('Canceled mortgage on a retained main home',{exact:true});await disclosure.click();
      await page.getByRole('button',{name:'Add retained-home cancellation records',exact:true}).click();
      const choice=(name:string)=>page.getByRole('combobox',{name,exact:true});
      const field=(name:string)=>/ date$/i.test(name)?page.getByLabel(name,{exact:true}):page.getByRole('textbox',{name,exact:true});
      const fill=async(name:string,value:string|undefined)=>{if(value===undefined)throw Error(`Missing original fixture ${name}`);const input=field(name);await input.fill(value);await input.press('Tab');};
      await expect(choice('You still own the home after cancellation')).toHaveValue('');
      await expect(field('Mortgage Box3 interest included')).toHaveValue('');
      await choice('Residence cancellation packet checked after the last edit').selectOption('true');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Adjustments to Income',exact:true})).toBeVisible();
      if(!facts?.debt||!facts.acquisition||!facts.reason||!facts.basis)throw Error('Missing fictional actual originals');
      await fill('Residence cancellation tax year',facts.sourceTaxYear);await fill('Residence cancellation original packet reference',facts.sourceReference);
      for(const [key,label] of [
        ['allDischargesIncluded','All canceled debts for this year are included'],['allResidenceSecuredLoansIncluded','This is the only loan secured by the residence'],
        ['regularAndAlternativeExclusionSameConfirmed','Regular and AMT treatment of this cancellation is the same'],['communityPropertyApplies','Community property rules apply'],
        ['title11Case','This cancellation occurred in a title 11 bankruptcy case'],['electInsolvencyInstead','Claim insolvency instead of the residence exclusion'],
        ['otherExclusionsOrExceptionsApply','Another debt exception or exclusion applies'],['solelyPrimaryOwnedConfirmed','The primary taxpayer alone owns the home and owes this loan'],
        ['retainedResidenceConfirmed','You still own the home after cancellation'],['noPropertyTransferConfirmed','There was no sale, foreclosure, abandonment or property transfer'],
        ['neverBusinessOrRentalUseConfirmed','This home has never had business or rental use'],
      ] as const)await choice(label).selectOption(String(facts[key]));
      for(const [key,label] of [
        ['statementId','Mortgage original statement ID'],['sourceTaxYear','Mortgage original statement tax year'],['sourceReference','Mortgage statement record reference'],
        ['debtorName','Mortgage debtor name'],['debtorSsnLast4','Mortgage debtor SSN last four'],['creditor','Mortgage creditor name'],['creditorTin','Mortgage creditor TIN'],
        ['accountReference','Mortgage original account reference'],['debtDescription','Mortgage Box4 debt description'],['dischargeDate','Mortgage Box1 discharge date'],
        ['amountDischarged','Mortgage Box2 canceled amount'],['interestIncluded','Mortgage Box3 interest included'],['fmvOfProperty','Mortgage Box7 property value'],
        ['actualDischargedPrincipal','Mortgage actual canceled principal'],['actualDischargedInterest','Mortgage actual discharged interest'],
      ] as const)await fill(label,facts.debt[key]);
      await choice('Mortgage statement owner').selectOption('primary');await choice('Mortgage Box6 event code').selectOption(facts.debt.identifiableEventCode??'');
      for(const [key,label] of [['personallyLiable','Mortgage Box5 personally liable'],['completePrincipalCancellationConfirmed','Complete actual principal cancellation is recorded'],['noDeductibleInterestDischargedConfirmed','No deductible interest was canceled']] as const)await choice(label).selectOption(String(facts.debt[key]));
      for(const [key,label] of [['sourceReference','Original acquisition loan record reference'],['originationDate','Original mortgage loan date'],['balanceAsOfDate','Mortgage balance snapshot date'],['outstandingPrincipal','Mortgage principal immediately before cancellation'],['originalAcquisitionPrincipal','Original acquisition borrowing']] as const)await fill(label,facts.acquisition[key]);
      await choice('Original mortgage proceeds use').selectOption('buy_build_substantially_improve');
      for(const key of ['street','city','state','zip'] as const)await fill(`Mortgage residence ${key}`,facts.acquisition.residenceAddress?.[key]);
      for(const [key,label] of [['mainHomeConfirmed','This is your current main home'],['securedByResidenceConfirmed','The original loan is secured by this home'],['originalLoanNotRefinancedConfirmed','This original loan has never been refinanced'],['allProceedsAcquisitionUseConfirmed','All loan proceeds were used for this acquisition or improvement'],['immediatelyBeforeDischargeConfirmed','The balance is from immediately before cancellation'],['noCapitalizedInterestOrAddedPrincipalConfirmed','No capitalized interest or other principal was added to this loan']] as const)await choice(label).selectOption(String(facts.acquisition[key]));
      await fill('Mortgage cancellation reason record reference',facts.reason.sourceReference);await choice('Reason the lender canceled debt').selectOption('taxpayer_financial_condition');
      await choice('Cancellation was not payment for services to the lender').selectOption('true');
      for(const [key,label] of [['sourceReference','Residence basis original history reference'],['asOfDate','Residence basis record date'],['purchaseCost','Residence original purchase cost'],['acquisitionCosts','Residence basis acquisition costs'],['capitalImprovements','Residence capital improvements'],['previousBasisReductions','Residence previous basis reductions']] as const)await fill(label,facts.basis[key]);
      await choice('All residence basis changes through cancellation are included').selectOption('true');
      await expect(choice('Mortgage statement checked after the last edit')).toHaveValue('');await confirm(page);
      // The new income source invalidates the downstream estimated-tax review.
      // Reconfirm that actual existing payment packet through its own control.
      for(let step=0;step<6&&!(await page.getByRole('heading',{name:'Payments & Withholding',exact:true}).isVisible());step++)await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Payments & Withholding',exact:true})).toBeVisible();
      const payments=choice('Estimated-tax sources checked after the last edit');await expect(payments).toHaveValue('');await payments.selectOption('true');
      for(let step=0;step<6&&!(await page.getByRole('heading',{name:'Adjustments to Income',exact:true}).isVisible());step++)await page.getByRole('button',{name:'Back',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Adjustments to Income',exact:true})).toBeVisible();await disclosure.click();
      const complete=await read(page,id),raw=buildTaxInputFromGuidedData(complete);expect(raw).not.toBeNull();
      const result=calculateFederalTax(parseInput(raw));
      expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('50000');expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
      expect(raw?.form982NolSources).toBeUndefined();expect(raw?.netOperatingLoss).toBeUndefined();
      await page.reload();await disclosure.click();await expect(choice('Mortgage statement checked after the last edit')).toHaveValue('true');
      expect(buildTaxInputFromGuidedData(await read(page,id))).toEqual(raw);
      writeFileSync(testInfo.outputPath(`retained-home-originals-${viewport.width}.json`),JSON.stringify(complete,null,2)+'\n');
      await fill('Mortgage Box2 canceled amount','100001');
      await field('Mortgage Box2 canceled amount').press('Tab');
      await expect(choice('Mortgage statement checked after the last edit')).toHaveValue('');await expect(choice('Residence basis history checked after the last edit')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload();await disclosure.click();await expect(field('Mortgage Box2 canceled amount')).toHaveValue('100,001');
      await expect(choice('Mortgage statement checked after the last edit')).toHaveValue('');
      // Select actual2026 separately, preserving source values with stale reviews.
      // New transition originals below are typed, never defaulted or inferred.
      const next=setInterviewTaxYear(complete,2026);
      await page.evaluate(({id,next})=>localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(next)),{id,next});
      await page.reload();await disclosure.click();
      await expect(page.getByLabel('Arrangement entered date',{exact:true})).toHaveValue('');
      await fill('Residence cancellation tax year','2026');await fill('Mortgage original statement tax year','2026');
      for(const name of ['Mortgage Box1 discharge date','Mortgage balance snapshot date','Residence basis record date'])await fill(name,'2026-09-15');
      await fill('Pre2026 written arrangement record reference','Fictional actual signed December2025 home arrangement');
      await fill('Arrangement entered date','2025-12-20');await fill('Arrangement evidenced in writing date','2025-12-20');
      await choice('This discharge is subject to that written arrangement').selectOption('true');await choice('Written arrangement checked after the last edit').selectOption('true');await confirm(page);
      await page.reload();await disclosure.click();await expect(page.getByLabel('Arrangement entered date',{exact:true})).toHaveValue('2025-12-20');
      const persisted=await read(page,id),collected=buildGuidedCodPrincipalResidence(persisted.sectionData.adjustments?.codPrincipalResidenceSources,persisted);
      expect(collected?.form982PrincipalResidenceSources.arrangement?.enteredDate).toBe('2025-12-20');
      expect(()=>calculateFederalTax(parseInput({...raw,taxpayer:{...parseInput(raw).taxpayer,taxYear:2026},...collected}))).toThrow(/rule pack.*incomplete/);
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.screenshot({path:testInfo.outputPath(`retained-home-transition-${viewport.width}.png`),fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const request of requests)for(const secret of [facts.debt.statementId,facts.debt.accountReference,facts.sourceReference])if(secret)expect(request.body).not.toContain(secret);
    });
  });
}
