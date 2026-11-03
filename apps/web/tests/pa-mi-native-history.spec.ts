// Spec: spec/state/pa-mi-native-browser.yaml.
import {expect,test,type Page} from '@playwright/test';
import {nativeMIRoyaltyFixture,nativeMIAgencyEntries,nativeMICorrectionEntries,nativeMIFiledUseEntries} from '../../../tests/fixtures/guided-pa-royalty-native';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';

function control(page:Page,label:string){return page.getByRole('textbox',{name:label,exact:true}).or(page.getByRole('combobox',{name:label,exact:true})).or(page.getByRole('spinbutton',{name:label,exact:true}));}
async function enter(page:Page,label:string,value:string){
 const field=control(page,label);await expect(field).toHaveCount(1);
 if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);
 else{await field.fill(value);await field.press('Tab');}
}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null')as GuidedFlowState,id);}
async function newLocalReturn(page:Page){
 await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
 const id=new URL(page.url()).pathname.split('/').at(-1);if(!id||id==='new')throw Error('A distinct local synthetic workspace is required');
 await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);return id;
}
async function seedUnrelatedOriginals(page:Page){
 const f=nativeMIRoyaltyFixture(),historicalId=await newLocalReturn(page);
 // This is a separately entered original local return, not a read-time current clone.
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id:historicalId,state:f.historicalState});
 const currentId=await newLocalReturn(page),state=structuredClone(f.state),section=state.sectionData['state-return'];if(!section)throw Error('Complete unrelated PA records required');
 const completion=structuredClone(f.completionWithoutMI);
 // Every MI-specific payment history, agency and historical documentary fact starts absent/unknown.
 completion.otherStateTaxes={status:'unknown',sourceReference:'',allJurisdictionsAndPaymentsReviewedConfirmed:null,jurisdictions:[]};
 section.paOrdinaryReturnCompletionSources=completion;
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='state-return');if(index<0)throw Error('Actual state interview route is required');
 state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index+1).map(section=>section.id);
 await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id:currentId,state});
 await page.reload();return{f,currentId,historicalId};
}
async function enterMIHistory(page:Page,f:ReturnType<typeof nativeMIRoyaltyFixture>,historicalId:string){
 const other=f.completion.otherStateTaxes,row=other.jurisdictions[0];if(!row)throw Error('Separate actual MI payment history required');
 await enter(page,'Other-state tax source status','actual_payments');await enter(page,'Other-state complete history original reference',other.sourceReference);
 await enter(page,'All actual other-state jurisdictions and payment sources reviewed','true');await page.getByRole('button',{name:'Add actual other-state history',exact:true}).click();
 for(const[label,value]of [['actual state',row.state],['original reference',row.sourceReference],['actual source tax year',String(row.sourceTaxYear)],['actual account name',row.accountName],['actual account SSN',row.accountSsn],['actually complete through date',row.completeThroughDate],['actual tax paid',row.taxPaid],['actual income tax withheld',row.incomeTaxWithheld]])await enter(page,'Other-state history 1 '+label,value);
 await page.getByRole('button',{name:'Add actual MI remittance original',exact:true}).click();
 for(const[label,value]of nativeMIAgencyEntries(f))await enter(page,label,value);
 await enter(page,'Filed original local return',historicalId);await enter(page,'Selected historical originals checked against actual filed return','true');
 await page.getByRole('button',{name:'Use checked historical original records',exact:true}).click();
 for(const[label,value]of nativeMIFiledUseEntries(f))await enter(page,label,value);
 const h=f.filedFederalHistory;
 for(const[label,value]of [['Filed federal source tax year','2025'],['Filed federal original source reference',h.sourceReference],['Filed federal actual owner','primary'],['Filed federal actual return identifier',h.returnId],['Filed federal actual filed date',h.filedOn],['Filed federal actual AGI',h.filedFederalAGI],['Filed federal actual royalty net',h.filedFederalRoyaltyNet],['Filed federal actual MI source income',h.filedMichiganSourceIncome],['All filed original income and expense sources reviewed','true'],['Historical correction status','none'],['MI withholding original 1 all original source facts reviewed','true'],['Actual filed MI federal history checked after the last edit','true']])await enter(page,label,value);
}
for(const viewport of[{width:1280,height:900},{width:390,height:844}]){
 test.describe(`Native MI history at ${viewport.width}px`,()=>{
  test('originates MI settlement and preserves filed history through actual expense correction',async({page},testInfo)=>{
   test.setTimeout(180000);await page.setViewportSize(viewport);
   const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>requests.push(request.url()+'\n'+(request.postData()??'')));
   const{f,currentId,historicalId}=await seedUnrelatedOriginals(page);expect(currentId).not.toBe(historicalId);
   const initial=(await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes;
   expect(initial).not.toHaveProperty('refundedRoyaltySources');expect(initial).not.toHaveProperty('refundedRoyaltyDraft');expect(initial?.jurisdictions).toEqual([]);
   await page.getByRole('button',{name:'Add actual Michigan copyright settlement and filed history',exact:true}).click();
   await expect(control(page,'MI refund source tax year')).toHaveValue('');await expect(control(page,'MI received refund actual received amount')).toHaveValue('');await expect(control(page,'Filed federal actual AGI')).toHaveValue('');
   const options=control(page,'Filed original local return').locator('option');expect(await options.evaluateAll(nodes=>nodes.map(node=>(node as HTMLOptionElement).value))).not.toContain(currentId);expect((await options.allTextContents()).join(' ')).not.toContain(f.input.taxpayer.primary.ssn);
   await page.reload();await expect(control(page,'MI received refund actual received amount')).toHaveValue('');await expect(control(page,'Historical correction status')).toHaveValue('unknown');
   await page.screenshot({path:testInfo.outputPath(`native-mi-unknown-${viewport.width}.png`)});
   await enterMIHistory(page,f,historicalId);
   await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
   const stateHeader=page.getByText('Pennsylvania (PA)',{exact:true}).filter({visible:true}),stateTax=page.locator('.guided-ticker-breakdown-row').filter({hasText:/^State Tax/}).filter({visible:true}),agi=page.locator('.guided-ticker-breakdown-row').filter({hasText:'Adjusted Gross Income'}).filter({visible:true});
   await expect(agi.first()).toContainText('$211,001');await expect(stateHeader).toHaveCount(0);
   await page.getByRole('button',{name:'Confirm actual MI royalty refund and historical sources after the last edit',exact:true}).click();await expect(stateHeader).toHaveCount(0);
   await expect.poll(async()=>Boolean((await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources?.sourceFactsConfirmed)).toBe(true);
   await page.getByRole('button',{name:'Confirm actual PA completion sources after the last edit',exact:true}).click();await expect(stateHeader.first()).toBeVisible();await expect(stateTax.first()).toContainText('$6,478');
   const original=(await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources;if(!original?.filedFederalHistory)throw Error('Native entered immutable filed originals required');
   expect(original.filedFederalHistory.filedFederalAGI).toBe('211001');expect(original.filedFederalHistory.originalGuidedPropertySources.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('49.25');expect(original.refund.amount).toBe('80.20');expect(original.filedReturn.reportedWithholding).toBe('80');
   await control(page,'MI received refund actual received amount').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`native-mi-confirmed-${viewport.width}.png`)});
   await page.locator('.guided-progress-step').filter({hasText:'Royalty Income'}).click();
   const expense=control(page,'Property 1 expense 1 actual amount paid');await expect(expense).toHaveValue('49.25');await expense.fill('149.25');await expense.press('Tab');
   const sourceChecks=['Royalty statement 1 checked after the last edit','Royalty packet checked after the last edit'];for(const label of sourceChecks)await expect(control(page,label)).toHaveValue('');
   await expect(control(page,'Property 1 PA classification checked after the last edit')).toHaveValue('');await expect(stateHeader).toHaveCount(0);
   await page.getByRole('button',{name:'Copy property 1 PA originals',exact:true}).click();for(const label of sourceChecks)await enter(page,label,'true');await enter(page,'Property 1 PA classification checked after the last edit','true');await expect(agi.first()).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);
   await expense.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`native-mi-current-edit-needs-review-${viewport.width}.png`)});
   await page.locator('.guided-progress-step').filter({hasText:'State Return'}).click();
   await page.getByRole('button',{name:'Confirm all actual PA source records after the last edit',exact:true}).click();
   await expect.poll(async()=>Boolean((await saved(page,currentId)).sectionData['state-return']?.paResidencySources?.sourceFactsConfirmed)).toBe(true);
   const corrected=nativeMIRoyaltyFixture(true);await enter(page,'Actual or expected amount applied to tax','6475');await enter(page,'Remaining-tax payment original source reference',corrected.facts.timing.remainingTaxPayment.sourceReference);
   await page.getByRole('button',{name:'Confirm all actual PA return sources after the last edit',exact:true}).click();await expect(stateHeader).toHaveCount(0);
   await enter(page,'Historical correction status','reported');for(const[label,value]of nativeMICorrectionEntries(corrected))await enter(page,label,value);
   await enter(page,'Actual MI expense correction and amendment review checked after the last edit','true');await enter(page,'Actual filed MI federal history checked after the last edit','true');
   await page.getByRole('button',{name:'Confirm actual MI royalty refund and historical sources after the last edit',exact:true}).click();await expect(stateHeader).toHaveCount(0);
   await expect.poll(async()=>Boolean((await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources?.historicalExpenseCorrection?.sourceFactsConfirmed)).toBe(true);
   await page.getByRole('button',{name:'Confirm actual PA completion sources after the last edit',exact:true}).click();await expect(stateHeader.first()).toBeVisible();await expect(stateTax.first()).toContainText('$6,475');
   const final=(await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes;if(!final?.refundedRoyaltySources)throw Error('Corrected actual native MI source packet required');
   expect(final.refundedRoyaltySources.filedFederalHistory).toEqual(original.filedFederalHistory);expect(final.refundedRoyaltySources.filedReturn).toEqual(original.filedReturn);expect(final.refundedRoyaltySources.refund).toEqual(original.refund);
   expect(final.refundedRoyaltySources.historicalExpenseCorrection).toEqual(corrected.historicalExpenseCorrection);expect(final.refundedRoyaltySources.historicalExpenseCorrection?.correctedLegalReceipt.amountPaid).toBe('149.25');
   await control(page,'MI expense correction actual current federal AGI').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`native-mi-corrected-${viewport.width}.png`)});
   await page.goto('/');await page.goto(`/returns/${currentId}`);await expect(control(page,'Filed federal actual AGI')).toHaveValue('211001');await expect(control(page,'MI expense correction actual current federal AGI')).toHaveValue('210901');
   expect((await saved(page,currentId)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes).toEqual(final);
   const separate=await saved(page,historicalId);expect(separate.sectionData['income-royalties']?.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('49.25');
   await control(page,'Filed federal actual AGI').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`native-mi-reopened-${viewport.width}.png`)});
   await expect(page.locator('textarea')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
   for(const secret of [f.input.taxpayer.primary.ssn,'royalty-original-1','royalty-account-1','Fictional private legal receipt',original.refund.confirmationNumber,original.filedReturn.returnId])expect(requests.join('\n')).not.toContain(secret);
  });
 });
}
