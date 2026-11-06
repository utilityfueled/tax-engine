// Spec: spec/state/guided-pa-royalty-sources.yaml.
import { nativeControlTag } from './helpers/native-control-snapshot';
import {expect,test,type Page} from '@playwright/test';
import {nativeMIRoyaltyFixture,nativeMICorrectionEntries} from '../../../tests/fixtures/guided-pa-royalty-native';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {actualGuidedPARoyaltySources} from '../../../tests/fixtures/guided-pa-royalty-sources';
import {taxpayerFacts2025} from './guided-fixtures';
const personal={...taxpayerFacts2025,firstName:'Jordan',ssn:'111-22-3333',state:'PA',stateResidency:'full-year'};
const w2={employerName:'Fictional royalty employer',employerEin:'12-3456789',accountHolder:'primary',wages:'200000',federalWithheld:'0',
 socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900',
 box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'};
function control(page:Page,label:string){return page.getByRole('textbox',{name:label,exact:true}).or(page.getByRole('combobox',{name:label,exact:true})).or(page.getByRole('spinbutton',{name:label,exact:true}));}
async function enter(page:Page,label:string,value:string){
 const field=control(page,label);const tagName=await nativeControlTag(field);
 if(tagName==='SELECT')await field.selectOption(value);
 else{await field.fill(value);await field.press('Tab');}
}
async function savedState(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null')as GuidedFlowState,id);}
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 test.describe(`PA original royalty records at ${viewport.width}px`,()=>{
  test('reconciles original state receipts through correction and local reload',async({page},testInfo)=>{
   await page.setViewportSize(viewport);const requests:string[]=[],errors:string[]=[];page.on('request',request=>requests.push(request.url()+'\n'+(request.postData()??'')));
   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
   const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing synthetic return');
   await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
   const f=nativeMIRoyaltyFixture(),state=structuredClone(f.state);
   // Preserve the exact original identity/address/cash cohort; only add separately supplied actual sources.
   expect(state.sectionData['personal-info']).toEqual(personal);expect(state.sectionData['income-w2']?.entries).toEqual([w2]);
   expect(state.sectionData['income-royalties']).toEqual(actualGuidedPARoyaltySources());
   const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='income-royalties');if(index<0)throw Error('Actual royalty interview route required');
   state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,route.findIndex(section=>section.id==='state-return')+1).map(section=>section.id);
   await page.evaluate(({id,state})=>{
    localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));
   },{id,state});
   const original=(await savedState(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources;
   if(!original?.filedFederalHistory)throw Error('Separately supplied actual filed MI originals required');
   expect(original.filedFederalHistory.filedFederalAGI).toBe('211001');expect(original.filedFederalHistory.originalGuidedPropertySources.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('49.25');
   expect(original.refund.amount).toBe('80.20');expect(original.filedReturn.reportedWithholding).toBe('80');
   await page.reload();await expect(page.locator('.guided-progress-step-active')).toContainText('Royalty Income');
   await page.getByRole('button',{name:'Expand Ticker',exact:true}).click();await page.locator('.guided-ticker-clickable').first().click();
   const ticker=page.locator('.guided-refund-ticker-sticky');await expect(ticker).toHaveCount(1);
   const agi=ticker.locator('.guided-ticker-breakdown-row').filter({hasText:'Adjusted Gross Income'});
   const stateHeader=ticker.getByText('Pennsylvania (PA)',{exact:true}),stateTax=ticker.locator('.guided-ticker-breakdown-row').filter({hasText:/^State Tax/});
   await expect(agi).toContainText('$211,001');await expect(stateHeader).toBeVisible();await expect(stateTax).toContainText('$6,478');
   const expense=page.getByRole('textbox',{name:'Property 1 expense 1 actual amount paid',exact:true});await expense.fill('149.25');await expense.press('Tab');
   const confirmLabels=['Royalty statement 1 checked after the last edit','Royalty packet checked after the last edit'];
   const paConfirm=page.getByRole('combobox',{name:'Property 1 PA classification checked after the last edit',exact:true});
   await expect(paConfirm).toHaveValue('');
   for(const name of confirmLabels){const field=page.getByRole('combobox',{name,exact:true});await expect(field).toHaveValue('');await field.selectOption('true');}
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);
   await paConfirm.selectOption('true');await expect(stateHeader).toHaveCount(0);
   await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties']?.properties?.[0]?.paTreatment?.expenses?.[0]?.amountPaid,id)).toBe('49.25');
   await page.getByRole('button',{name:'Copy property 1 PA originals',exact:true}).click();await expect(paConfirm).toHaveValue('');
   for(const name of confirmLabels)await page.getByRole('combobox',{name,exact:true}).selectOption('true');await paConfirm.selectOption('true');
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);
   // Current PA source roots and actual MI filed history are independent reviews, never refreshed by a read.
   await page.locator('.guided-progress-step').filter({hasText:'State Return'}).click();
   await page.getByRole('button',{name:'Confirm all actual PA source records after the last edit',exact:true}).click();
   await expect.poll(async()=>Boolean((await savedState(page,id)).sectionData['state-return']?.paResidencySources?.sourceFactsConfirmed)).toBe(true);await expect(stateHeader).toHaveCount(0);
   const corrected=nativeMIRoyaltyFixture(true);await enter(page,'Actual or expected amount applied to tax','6475');await enter(page,'Remaining-tax payment original source reference',corrected.facts.timing.remainingTaxPayment.sourceReference);
   await page.getByRole('button',{name:'Confirm all actual PA return sources after the last edit',exact:true}).click();await expect(stateHeader).toHaveCount(0);
   await enter(page,'Historical correction status','reported');for(const[label,value]of nativeMICorrectionEntries(corrected))await enter(page,label,value);
   await enter(page,'Actual MI expense correction and amendment review checked after the last edit','true');await enter(page,'Actual filed MI federal history checked after the last edit','true');
   await page.getByRole('button',{name:'Confirm actual MI royalty refund and historical sources after the last edit',exact:true}).click();await expect(stateHeader).toHaveCount(0);
   await expect.poll(async()=>Boolean((await savedState(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources?.historicalExpenseCorrection?.sourceFactsConfirmed)).toBe(true);
   await page.getByRole('button',{name:'Confirm actual PA completion sources after the last edit',exact:true}).click();
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toBeVisible();await expect(stateTax).toContainText('$6,475'); // 210900 * .0307 = 6474.63, rounded to 6475.
   const correctedPacket=(await savedState(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources;
   if(!correctedPacket)throw Error('Actual native correction and parent confirmation required');
   expect(correctedPacket.filedFederalHistory).toEqual(original.filedFederalHistory);expect(correctedPacket.filedReturn).toEqual(original.filedReturn);expect(correctedPacket.refund).toEqual(original.refund);
   expect(correctedPacket.historicalExpenseCorrection).toEqual(corrected.historicalExpenseCorrection);
   await page.locator('.guided-progress-step').filter({hasText:'Royalty Income'}).click();
   const resident=page.getByRole('combobox',{name:'Property 1 PA Was this owner a full-year Pennsylvania resident?',exact:true});await resident.selectOption('');
   for(const name of confirmLabels)await page.getByRole('combobox',{name,exact:true}).selectOption('true');
   await expect(agi).toContainText('$210,901');await expect(stateHeader).toHaveCount(0);await page.reload();await expect(resident).toHaveValue('');await expect(paConfirm).toHaveValue('');
   const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.['income-royalties'],id);
   expect(saved.properties[0].paTreatment.ownerFullYearPAResident).toBeNull();expect(saved.properties[0].paTreatment.expenses[0].surfaceRights).toBe(false);
   expect(saved.properties[0].paTreatment.expenses[0].amountPaid).toBe('149.25');expect(saved.properties[0].paTreatment.sourceFactsConfirmed).toBeNull();
   expect(saved.properties[0].paTreatment).not.toHaveProperty('netIncome');
   const retained=(await savedState(page,id)).sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources;
   expect(retained?.filedFederalHistory).toEqual(original.filedFederalHistory);expect(retained?.filedReturn).toEqual(original.filedReturn);expect(retained?.refund).toEqual(original.refund);
   await expect(page.locator('textarea')).toHaveCount(0);expect(errors).toEqual([]);
   await resident.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`pa-royalty-${viewport.width}.png`)});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   for(const secret of ['royalty-original-1','royalty-account-1','Fictional private legal receipt','Fictional PA property classification record',personal.ssn])expect(requests.join('\n')).not.toContain(secret);
  });
 });
}
