import {expect,test,type Page} from '@playwright/test';
import {completePersonalInfo} from '../../../tests/guided-interview/complete-facts';
import {medicalMileageHohFixture} from '../../../tests/fixtures/medical-mileage-hoh';
import {startInterview,updateSectionData,emptyDeductionData,buildSectionRoute,validateSection,type GuidedFlowState} from '../src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '../../../src/models/inputs';
import {calculateScheduleA} from '../../../src/engine/schedules/schedule-a';
import {FEDERAL_2026_CONSTANTS} from '../../../src/models/federal-2026-indexed';
import {d} from '../../../src/utils/decimal';
const medicalConfirmations=['Trips were essential to my own qualified medical care','One vehicle and only eligible parking and tolls','All claimed transportation costs were paid and unreimbursed','No actual vehicle costs or duplicate tax benefits'];
const householdConfirmations=['Unmarried at year end and not a qualifying surviving spouse','Full-year U.S. citizen or resident, not another taxpayer’s dependent or qualifying child','Child unmarried all year, did not file a joint return, is a U.S. citizen/resident/national, and did not provide over half their own support','No other person qualifies for this child or uses the child for head of household','No custody release, temporary absence, birth/death, adoption/foster, kidnapping or other special qualification rule','All eligible annual home-upkeep costs and actual primary payments are complete','Primary payments came from my own funds, with no child-benefit, public-benefit, shared-funds or other-person allocation'];
async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
for(const width of [1280,390]){
 test(`collects actual private HOH own-care originals and preserves annual gates at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const traffic:string[]=[];const protectedRequests:string[]=[];
  page.on('request',request=>{traffic.push(request.url(),request.postData()??'');const p=new URL(request.url()).pathname;if(/^\/api\/(provider\/|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(p))protectedRequests.push(p);});
  await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw Error('Missing synthetic return ID');
  await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
  const original=medicalMileageHohFixture();
  const personal={...structuredClone(completePersonalInfo),...original.taxpayer.primary,spouse:undefined,addressLine1:original.taxpayer.address.street,addressLine2:'',city:original.taxpayer.address.city,state:original.taxpayer.address.state,zip:original.taxpayer.address.zip,dependentCount:'1',dependents:original.taxpayer.dependents.map(child=>({...child,monthsLivedWithYou:String(child.monthsLivedWithYou)})),usResidencyMonths:'12'};
  let state=updateSectionData(updateSectionData(startInterview({filingStatus:'hoh',incomeTypes:[],lifeEvents:[],stateCode:null},2026),'personal-info',personal),'deductions',{...emptyDeductionData,method:'itemized'});
  const route=buildSectionRoute(state.segmentation);state={...state,currentSectionIndex:route.findIndex(section=>section.id==='deductions')};
  expect(state.sectionData.deductions?.medicalMileage).toBeUndefined();
  await page.evaluate(({id,state})=>{localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify(state));},{id,state});await page.reload();
  await page.getByRole('button',{name:'Add medical mileage log',exact:true}).click();await page.getByRole('button',{name:'Add head-of-household originals',exact:true}).click();
  await expect(page.getByLabel('Original child relationship (child)',{exact:true})).toHaveValue('');
  const privateRef=`synthetic-private-hoh-${width}`;
  const entries=[['Private mileage log reference',`synthetic-private-mileage-${width}`],['Other eligible unreimbursed medical expenses','1499.25'],['Eligible medical parking and tolls','0'],['Medical mileage 1 date','2026-06-30'],['Medical mileage 1 eligible miles','10.125'],['Household source tax year','2026'],['Private household source reference',privateRef],['Original household street','123 Main St'],['Original household city','Seattle'],['Original household state','WA'],['Original household zip','98101'],['Original primary first name','Jane'],['Original primary last name','Doe'],['Original primary taxpayer ID','123-45-6789'],['Original primary birth date','1990-01-15'],['Original child index (first child is 0)','0'],['Original child relationship (child)','child'],['Original child first name','Child'],['Original child last name','Example'],['Original child taxpayer ID','333-44-5555'],['Original child birth date','2015-06-01'],['Actual child nights in the same home','365'],['Total eligible home-upkeep costs','20000'],['Home-upkeep costs paid by the primary taxpayer','10000.01']];
  for(const [name,value]of entries){if(!name||value===undefined)throw Error('Missing explicit fictional original');await (['Other eligible unreimbursed medical expenses','Eligible medical parking and tolls','Total eligible home-upkeep costs','Home-upkeep costs paid by the primary taxpayer'].includes(name)?page.getByRole('textbox',{name,exact:true}):page.getByLabel(name,{exact:true})).fill(value);}
  await page.getByRole('button',{name:'Add medical mileage date',exact:true}).click();await page.getByLabel('Medical mileage 2 date',{exact:true}).fill('2026-07-01');await page.getByLabel('Medical mileage 2 eligible miles',{exact:true}).fill('20.375');
  const allConfirmations=[...householdConfirmations,...medicalConfirmations];for(const name of allConfirmations)await page.getByRole('combobox',{name,exact:true}).selectOption('true');
  await expect.poll(async()=>validateSection(await saved(page,id),'deductions').status).toBe('complete');
  const confirmed=await saved(page,id),raw=buildTaxInputFromGuidedData(confirmed);expect(raw).not.toBeNull();const parsed=TaxYearInputSchema.parse(raw);
  // Literal Decimal oracle:1499.25+10.125*.205+20.375*.235−1500=6.11375; no model-generated expected amount.
  expect(calculateScheduleA(parsed,d('20000'),'head_of_household',FEDERAL_2026_CONSTANTS).medicalDeduction.toFixed()).toBe('6.11375');
  await page.reload();for(const name of allConfirmations)await expect(page.getByRole('combobox',{name,exact:true})).toHaveValue('true');
  const parking=page.getByRole('textbox',{name:'Eligible medical parking and tolls',exact:true});await expect(parking).toHaveValue('0');expect(buildTaxInputFromGuidedData(await saved(page,id))).toEqual(raw);
  await parking.fill('');for(const name of allConfirmations)await expect(page.getByRole('combobox',{name,exact:true})).toHaveValue('');expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
  await parking.fill('0');for(const name of allConfirmations)await page.getByRole('combobox',{name,exact:true}).selectOption('true');
  await expect.poll(async()=>validateSection(await saved(page,id),'deductions').status).toBe('complete');
  await page.getByRole('textbox',{name:'Home-upkeep costs paid by the primary taxpayer',exact:true}).fill('10000');await page.getByRole('textbox',{name:'Home-upkeep costs paid by the primary taxpayer',exact:true}).press('Tab');for(const name of allConfirmations)await expect(page.getByRole('combobox',{name,exact:true})).toHaveValue('');expect(buildTaxInputFromGuidedData(await saved(page,id))).toBeNull();
  await page.reload();await expect(page.getByRole('textbox',{name:'Home-upkeep costs paid by the primary taxpayer',exact:true})).toHaveValue('10,000');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/medical-hoh-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Switch to advanced mode',exact:true}).click();await expect(page.getByRole('region',{name:'Return Summary',exact:true})).toContainText('2026 not supported yet');
  await expect(page.getByRole('button',{name:'Download Review PDF',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Download Draft Filled Return PDF',exact:true})).toHaveCount(0);
  expect(protectedRequests).toEqual([]);for(const secret of [privateRef,`synthetic-private-mileage-${width}`,'123-45-6789','333-44-5555','123 Main St'])expect(traffic.join('\n')).not.toContain(secret);
 });
}
