// Spec: spec/federal/guided-rrta-payroll-browser.yaml. Prospective real browser journeys.
import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {startCompleteInterview,completeW2Entry} from '../../../tests/guided-interview/complete-facts';
import {actualTipIncome} from '../../../tests/guided-interview/guided-tip-income-fixtures';
import {buildSectionRoute,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculateFederalTax} from '../../../src/engine/federal';
import {getConstants} from '../../../src/models/constants';
import {assertPdfExportAllowed,PDF_MAPPING_PACKS} from '../../../src/pdf/export-policy';

const backupPassword='synthetic-railroad-recovery-password';
const incorrectBackupPassword='incorrect-synthetic-railroad-password';
const editedReference='fictional-railroad-same-cash-original-edited';
const sourceReference='fictional-private-railroad-annual-original';
const scopes=[['filledReturn',/^\/api\/workspace\/filled-return\/?$/u],['provider',/^\/api\/provider(?:\/.*)?$/u],['businessExpenseAnalysis',/^\/api\/business-expense-analysis\/?$/u],['selfEmploymentIncomeAnalysis',/^\/api\/self-employment-income-analysis\/?$/u]]as const;
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Actual fictional source is absent');return value;}
/** Only unrelated household/W2/tip-diary setup. No collector, snapshot or target payroll source. */
export function rrtaBrowserFixture():GuidedFlowState{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:['additional-deductions'],stateCode:null});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,sourceTaxYear:'2025',employerName:'Fictional Railroad',employerEin:'11-1111111',wages:'230000',federalWithheld:'60000',allocatedTips:'0'}]};
 const tips=actualTipIncome();tips.railroadRetirementCompensation='0';tips.noncashTipsNotIncludedInWages='0';tips.sourceFactsConfirmed=null;
 tips.employers[0]={...required(tips.employers[0]),w2SourceIds:[],cashAndChargeTipsReceived:'1000',tipsReportedToEmployer:'0',allocatedTips:'0',smallTipMonths:[]};
 state.sectionData['additional-deductions']={tipIncomeAccounts:[tips]};
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='additional-deductions');if(index<0)throw Error('Original-source route is absent');
 state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(section=>section.id);return state;
}
export const rrtaCollectionAnswers=[['RRTA collection source tax year','2025'],['RRTA collection source reference',sourceReference],['All railroad compensation sources are included','true'],['No employee representative compensation','true'],['No payroll corrections or settlements requiring adjustments','true'],['No other railroad tax adjustments','true'],['No self-employment income','true']]as const;
export const rrtaRowAnswers=[['Actual owner','primary'],['Actual W-2 source','formW2:0'],['Source label','fictional-railroad-source'],['Source tax year','2025'],['Original reference','fictional-private-railroad-box14'],['Actual Tier1 Social Security compensation','230000'],['Actual Tier1 Medicare compensation','230000'],['Actual Additional Medicare tax withheld','0'],['Actual Box 1 equals railroad Medicare compensation','true'],['Ordinary FICA boxes 3 4 5 6 7 and8 are checked zero','true'],['No railroad-covered tips','true'],['Original row checked after the last edit','true']]as const;
/** Explicit census of private fixture/source strings, never inferred from totals. */
export function rrtaPrivateMarkers(initial:GuidedFlowState):string[]{
 const markers=new Set<string>([sourceReference,editedReference]);
 const privateKeys=new Set(['firstName','lastName','ssn','dateOfBirth','addressLine1','addressLine2','employerName','employerEin','sourceReference','sourceId','reportedTipReconciliationReference']);
 function collect(value:unknown):void{if(Array.isArray(value)){for(const row of value)collect(row);return;}if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){if(privateKeys.has(key)&&typeof child==='string'&&child.length){markers.add(child);if(key==='ssn'||key==='employerEin')markers.add(child.replaceAll('-',''));}else if(child&&typeof child==='object')collect(child);}}
 collect(initial.sectionData['personal-info']);collect(initial.sectionData['income-w2']);collect(initial.sectionData['additional-deductions']);
 for(const[label,value]of rrtaRowAnswers)if(label==='Source label'||label==='Original reference')markers.add(value);
 return [...markers];
}
/** Tax originals may travel only in the intended review POST body; URLs/passwords never. */
export function rrtaRequestPrivacyFailure(request:{url:string;body:string;method:string},origin:string,markers:readonly string[]):string|null{
 const url=new URL(request.url);if(url.origin!==origin)return 'outside-origin';
 function surfaces(raw:string):string[]|null{
  const values=[raw];try{const parsed:unknown=JSON.parse(raw);const visit=(value:unknown):void=>{if(typeof value==='string')values.push(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(parsed);}catch{/* Non-JSON request surfaces are still checked verbatim and decoded below. */}
  const decoded:string[]=[];for(const value of values){let current=value;decoded.push(current);for(let depth=0;depth<3;depth++){let next:string;try{next=decodeURIComponent(current.replaceAll('+',' '));}catch{return null;}if(next===current)break;decoded.push(next);current=next;}if(/%[0-9a-f]{2}/iu.test(current))return null;}return decoded;
 }
 const urls=surfaces(request.url),bodies=surfaces(request.body);if(!urls||!bodies)return 'unchecked-encoding';
 const has=(values:readonly string[],terms:readonly string[])=>values.some(value=>terms.some(term=>value.includes(term)));
 if(has([...urls,...bodies],[backupPassword,incorrectBackupPassword]))return 'recovery-password';
 if(has(urls,markers))return 'private-url';
 if(has(bodies,markers)&&(url.pathname!=='/api/workspace/filled-return'||request.method!=='POST'))return 'private-body';
 return null;
}
function control(page:Page,label:string){return page.locator('label').getByText(label,{exact:true}).locator('..').locator('input,select');}
async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
function draft(state:GuidedFlowState){return required(state.sectionData['additional-deductions']?.rrtaPayrollSources);}
function canonical(state:GuidedFlowState){return TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));}
async function stored(page:Page,id:string){return page.evaluate(id=>({raw:localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`),workspace:JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id],keys:Object.keys(localStorage).filter(key=>key.includes(id))}),id);}
async function capture(page:Page){await enter(page,'Railroad original 1: Original row checked after the last edit','true');await page.getByRole('button',{name:'Capture reviewed original railroad payroll sources',exact:true}).click();}
async function confirm(page:Page){await enter(page,'RRTA originals confirmed after capture and the last edit','true');}

for(const width of [1280,390])test.describe(`Native RRTA original lifecycle at ${width}px`,()=>{
 test('captures actual payroll originals and preserves stale recovery and unsupported-year gates',async({page},info)=>{
  await page.setViewportSize({width,height:900});const errors:string[]=[],requests:Array<{url:string;body:string;method:string}>=[],downloads:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push({url:request.url(),body:request.postData()??'',method:request.method()}));page.on('download',download=>downloads.push(download.suggestedFilename()));
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);const id=required(new URL(page.url()).pathname.split('/').at(-1));
  await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  const initial=rrtaBrowserFixture();expect(initial.sectionData['additional-deductions']?.rrtaPayrollSources).toBeUndefined();expect(buildTaxInputFromGuidedData(initial)).toBeNull();
  // Sole setup writes. All target source/confirmation edits below use visible controls.
  await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state:initial});await page.reload();
  await enter(page,'Tip owner 1: Railroad compensation','230000');await enter(page,'Tip owner 1: Tip sources checked after the last edit','true');
  await page.getByRole('button',{name:'Add original railroad payroll sources',exact:true}).click();await page.getByRole('button',{name:'Add actual railroad original',exact:true}).click();
  const panel=page.getByRole('region',{name:'Original railroad payroll sources',exact:true});
  await expect(control(page,'Railroad original 1: Actual Additional Medicare tax withheld')).toHaveValue('');
  for(const[label,value]of rrtaCollectionAnswers)await enter(page,label,value);
  for(const[label,value]of rrtaRowAnswers)await enter(page,'Railroad original 1: '+label,value);
  await enter(page,'No payroll corrections or settlements requiring adjustments','');await capture(page);
  await expect(panel.getByRole('status')).toBeVisible();expect(draft(await saved(page,id)).noCorrectionsConfirmed).toBeNull();expect(draft(await saved(page,id)).sources[0]?.additionalMedicareTaxWithheld).toBe('0');expect(draft(await saved(page,id)).capturedOriginal).toBeUndefined();expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
  await enter(page,'No payroll corrections or settlements requiring adjustments','true');await capture(page);await confirm(page);
  await expect.poll(async()=>draft(await saved(page,id)).sourceFactsConfirmed).toBe(true);
  const zero=canonical(await saved(page,id));expect(zero.rrtaPayrollSources?.sources?.[0]?.additionalMedicareTaxWithheld).toBe('0');expect(calculateFederalTax(zero).form8959?.withholdingCredit.toString()).toBe('0');expect(calculateFederalTax(zero).totalWithholding.toString()).toBe('60000');
  await enter(page,'Railroad original 1: Actual Additional Medicare tax withheld','270');expect(draft(await saved(page,id)).sourceFactsConfirmed).toBeNull();await capture(page);await confirm(page);
  const current=await saved(page,id),proof=structuredClone(draft(current).capturedOriginal),result=calculateFederalTax(canonical(current));
  // Independent literal oracle: (230000-200000)*.009=270; actual credit270;
  // RRTA exhausts SocialSecurity base; separate nonrailroad1000*.0145 rounds15.
  expect(result.form8959?.additionalMedicareTax.toString()).toBe('270');expect(result.form8959?.withholdingCredit.toString()).toBe('270');expect((result.form4137ByOwner?.primary??result.form4137)?.line13.toString()).toBe('15');expect(result.totalWithholding.toString()).toBe('60270');
  const reference=control(page,'Railroad original 1: Original reference');await reference.focus();await reference.press('Tab');expect(draft(await saved(page,id))).toEqual(draft(current));
  await reference.scrollIntoViewIfNeeded();const geometry=await panel.evaluate(root=>({documentWidth:document.documentElement.scrollWidth,issues:[root,...root.querySelectorAll('label,input,select,button,fieldset')].flatMap(node=>{const r=node.getBoundingClientRect();return!r.width||!r.height||getComputedStyle(node).visibility==='hidden'||r.left>=-1&&r.right<=innerWidth+1?[]:[{tag:node.tagName,left:r.left,right:r.right}];})}));expect(geometry.documentWidth).toBeLessThanOrEqual(width);expect(geometry.issues).toEqual([]);await page.screenshot({path:info.outputPath('actual-rrta-original-capture.png')});
  await page.reload();expect(draft(await saved(page,id))).toEqual(draft(current));
  await enter(page,'Railroad original 1: Original reference',editedReference);const stale=await saved(page,id);expect(draft(stale).sourceFactsConfirmed).toBeNull();expect(draft(stale).sources[0]?.sourceFactsConfirmed).toBeNull();expect(draft(stale).capturedOriginal).toEqual(proof);expect(buildTaxInputFromGuidedData(stale)).toBeNull();
  await confirm(page);expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();expect(draft(await saved(page,id)).capturedOriginal).toEqual(proof);await page.reload();expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
  await capture(page);await confirm(page);const recaptured=await saved(page,id);expect(draft(recaptured).capturedOriginal?.packet.sources?.[0]?.sourceReference).toBe(editedReference);expect(calculateFederalTax(canonical(recaptured)).totalWithholding.toString()).toBe('60270');
  await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();const before=await stored(page,id);expect(before.raw).not.toBeNull();
  const review=page.getByRole('button',{name:/^Download (?:Review PDF|Draft Filled Return PDF)$/u});await expect(review).toHaveCount(1);
  const denied=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/workspace/filled-return');await review.click();expect((await denied).status()).toBe(400);await expect(page.getByText('Could not generate the review PDF. Check required taxpayer facts, source documents and supported tax year.',{exact:true})).toBeVisible();expect(downloads).toEqual([]);
  await page.goto('/');const card=page.getByRole('listitem').filter({hasText:`Tax Return ${id}`});await card.getByText('Back up this return',{exact:true}).click();await card.getByLabel('Backup password (at least 12 characters)').fill(backupPassword);
  const backupDownload=page.waitForEvent('download');await card.getByRole('button',{name:'Download encrypted backup',exact:true}).click();const backup=info.outputPath('encrypted-rrta-recovery.json');await(await backupDownload).saveAs(backup);const encrypted=await readFile(backup,'utf8');expect(JSON.parse(encrypted)).toMatchObject({format:'tax-engine-encrypted-recovery',cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000});
  for(const marker of [sourceReference,editedReference,backupPassword,required(initial.sectionData['personal-info']).ssn])expect(encrypted).not.toContain(marker);
  await card.getByRole('button',{name:`Delete tax return ${id}`,exact:true}).click();await expect(card).toHaveCount(0);await page.reload();expect(await stored(page,id)).toEqual({raw:null,workspace:undefined,keys:[]});
  const restore=page.locator('details').filter({has:page.getByText('Restore an encrypted backup',{exact:true})});await restore.getByText('Restore an encrypted backup',{exact:true}).click();await restore.getByLabel('Encrypted recovery file').setInputFiles(backup);await restore.getByLabel('Backup password (at least 12 characters)').fill(incorrectBackupPassword);await restore.getByRole('button',{name:'Restore as new local return',exact:true}).click();await expect(restore.getByRole('status')).toContainText('incorrect');await expect(restore.getByRole('link',{name:'Open restored return',exact:true})).toHaveCount(0);
  await restore.getByLabel('Backup password (at least 12 characters)').fill(backupPassword);await restore.getByRole('button',{name:'Restore as new local return',exact:true}).click();const restoredLink=restore.getByRole('link',{name:'Open restored return',exact:true});await expect(restoredLink).toBeVisible();const restoredId=required((await restoredLink.getAttribute('href'))?.split('/').at(-1)?.split('?')[0]);expect(restoredId).not.toBe(id);await restoredLink.click();await expect(page).toHaveURL(new URL(`/returns/${restoredId}?local=1`,page.url()).href);await page.reload();
  expect((await stored(page,restoredId)).raw).toBe(before.raw);expect(draft(await saved(page,restoredId))).toEqual(draft(recaptured));expect(calculateFederalTax(canonical(await saved(page,restoredId))).totalWithholding.toString()).toBe('60270');
  await page.getByRole('button',{name:'Get step-by-step help',exact:true}).click();await enter(page,'Tax year for this interview','2026');await expect.poll(async()=>(await saved(page,restoredId)).taxYear).toBe(2026);await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.',{exact:true})).toBeVisible();expect(buildTaxInputFromGuidedData(await saved(page,restoredId))).toBeNull();expect(()=>getConstants(2026)).toThrow();expect(PDF_MAPPING_PACKS[2026]).toMatchObject({reviewAvailable:false,filingQualified:false});expect(()=>assertPdfExportAllowed(2026,2026,'review')).toThrow();expect(()=>assertPdfExportAllowed(2026,2026,'filing')).toThrow();
  await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();await expect(page.getByText('2026 not supported yet',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Download (?:Review PDF|Draft Filled Return PDF)$/u})).toHaveCount(0);
  await page.goto('/');const restoredCard=page.getByRole('listitem').filter({hasText:`Tax Return ${restoredId}`});await restoredCard.getByRole('button',{name:`Delete tax return ${restoredId}`,exact:true}).click();await expect(restoredCard).toHaveCount(0);await page.reload();expect(await stored(page,restoredId)).toEqual({raw:null,workspace:undefined,keys:[]});expect(await stored(page,id)).toEqual({raw:null,workspace:undefined,keys:[]});
  const counts=Object.fromEntries(scopes.map(([name,pattern])=>[name,requests.filter(request=>pattern.test(new URL(request.url).pathname)).length]));expect(counts).toEqual({filledReturn:1,provider:0,businessExpenseAnalysis:0,selfEmploymentIncomeAnalysis:0});
  const privateMarkers=rrtaPrivateMarkers(initial);for(const marker of privateMarkers)expect(encrypted).not.toContain(marker);
  const origin=new URL(page.url()).origin;for(const request of requests){expect(rrtaRequestPrivacyFailure(request,origin,privateMarkers)).toBeNull();expect(new URL(request.url).origin).toBe(origin);expect(request.body).not.toContain(backupPassword);expect(request.body).not.toContain('incorrect-synthetic-railroad-password');if([sourceReference,editedReference,required(initial.sectionData['personal-info']).ssn].some(marker=>request.body.includes(marker)))expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');}
  expect(downloads).toHaveLength(1);expect(downloads[0]).toBe(`tax-return-${id}.recovery.json`);expect(errors).toEqual([]);await info.attach('rrta-request-counts.json',{body:JSON.stringify({counts,actualReviewStatus:400,originalDeleted:true,restoredDeleted:true,geometry}),contentType:'application/json'});
 });
});
