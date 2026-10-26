// Spec: spec/federal/guided-marriage-policy.yaml.
import {expect,test} from '@playwright/test';
import {actualMarriagePersonal,actualMarriagePolicyData} from '../../../tests/fixtures/guided-marriage-policy';

const w2={employerName:'Synthetic Employer',employerEin:'12-3456789',accountHolder:'primary',wages:'117000',federalWithheld:'0',socialSecurityWages:'117000',socialSecurityTips:'0',socialSecurityWithheld:'7254',medicareWages:'117000',medicareWithheld:'1696.50',box10DependentCareBenefits:'0',box12CodeW:'0',stateTaxReporting:'none'};
for(const viewport of [{width:1280,height:900},{width:390,height:844}])test.describe(`Marriage sources at ${viewport.width}px`,()=>{
  test('preserves actual marriage sources and corrected benchmarks',async({page},testInfo)=>{
    await page.setViewportSize(viewport);const requests:string[]=[];page.on('request',request=>requests.push(request.postData()??''));
    await page.goto('/returns/new');await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id=new URL(page.url()).pathname.split('/').at(-1);if(!id)throw new Error('Missing synthetic return');
    await expect.poll(()=>page.evaluate(id=>Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id]),id)).toBe(true);
    await page.evaluate(({id,personal,w2,coverage})=>{
      localStorage.setItem(`tax-engine:guided-mode:${id}`,'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`,JSON.stringify({factsVersion:2,phase:'interview',taxYear:2025,currentSectionIndex:3,completedSections:['personal-info','income-w2','deductions'],
        segmentation:{filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:null},sectionData:{'personal-info':personal,'income-w2':{entries:[w2]},credits:{dependentCare:{expenses:'',qualifyingIndividuals:''},education:{aocStudents:[],llcExpenses:''},energy:{solarElectricCost:'',solarWaterHeatingCost:'',insulationCost:'',exteriorDoorsWindowsCost:'',roofCost:'',energyEfficientHvacCost:'',waterHeaterHeatPumpCost:''},premiumTaxCredit:coverage}}}));
    },{id,personal:actualMarriagePersonal(),w2,coverage:actualMarriagePolicyData()});
    await page.reload();const hero=page.locator('.guided-ticker-value-hero').first();await expect(hero).not.toHaveText('Enter more info for an estimate');
    const reference=page.getByRole('textbox',{name:'Marriage worksheet reference',exact:true}),inner=page.getByRole('combobox',{name:'Marriage sources checked after the last edit',exact:true}),outer=page.getByRole('combobox',{name:'Marketplace sources checked after the last edit',exact:true});
    await expect(page.getByRole('textbox',{name:'Actual marriage date (YYYY-MM-DD)',exact:true})).toHaveValue('2025-07-15');
    await reference.fill('synthetic-private-marriage-record');await reference.press('Tab');
    await expect(inner).toHaveValue('');await expect(outer).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
    const benchmark=page.getByRole('textbox',{name:'Primary month 1: Corrected alternative SLCSP premium',exact:true});await benchmark.fill('433.01');await benchmark.press('Tab');
    for(const owner of ['Primary','Spouse'])for(let month=1;month<=7;month++)await page.getByRole('combobox',{name:`${owner} month ${month}: Benchmark source checked after the last edit`,exact:true}).selectOption('true');
    await inner.selectOption('true');await outer.selectOption('true');await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.credits?.premiumTaxCredit?.marriageSources?.benchmarks?.[0]?.slcsp,id)).toBe('433.01');
    await page.reload();await expect(reference).toHaveValue('synthetic-private-marriage-record');await expect(benchmark).toHaveValue('433.01');await expect(inner).toHaveValue('true');
    const original=page.getByRole('textbox',{name:'Policy 1 month 1: Original enrollment premium',exact:true});await expect(original).toHaveValue('500');
    await benchmark.fill('');await benchmark.press('Tab');await expect(inner).toHaveValue('');await expect(outer).toHaveValue('');await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData?.credits?.premiumTaxCredit?.marriageSources?.benchmarks?.[0]?.slcsp,id)).toBe('');
    await page.reload();await expect(benchmark).toHaveValue('');
    const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'{}').sectionData.credits.premiumTaxCredit,id);
    expect(saved.policies[0].monthlyPremiums[0].enrolleePremium).toBe('500');expect(saved.marriageSources.policies[0].original.monthlyPremiums[0].enrolleePremium).toBe('500');expect(saved.monthlyReconciliation[0].advancePremiumTaxCredit).toBe('794');expect(saved.marriageSources.dependents[0].qualifiesForPrimary).toBe(false);
    await reference.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`marriage-sources-${viewport.width}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    for(const secret of ['synthetic-private-marriage-record','111-22-3333','444-55-6666','777-88-1111','P-actual'])expect(requests.join('\n')).not.toContain(secret);
  });
});
