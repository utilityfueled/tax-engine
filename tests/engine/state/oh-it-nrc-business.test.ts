import { describe, it, expect } from 'vitest';
import { calculateOhioBusinessApportionment } from '@/engine/state/oh-it-nrc-business.js';
import { ohioBusinessApportionmentFixture } from '../../fixtures/oh-business-apportionment.js';

describe('Ohio actual ordinary business NRC SectionsII/III', () => {
  it('matches actual ordinary C SectionsII/III line identities and source originals', () => {
    const r = calculateOhioBusinessApportionment(ohioBusinessApportionmentFixture());
    expect(r.methodId).toBe('ohio-itnrc-ordinary-c-exact-factors-v1');
    expect(r.taxYear).toBe(2025);
    const b = r.businesses[0];
    expect(b).toBeDefined();
    if (!b) throw new Error('Missing actual business worksheet');
    expect([b.propertyRatio, b.propertyWeight, b.payrollWeight, b.salesRatio, b.salesWeight, b.apportionmentRatio].map(v => v.toFixed())).toEqual(['0.5', '0.25', '0', '0.25', '0.75', '0.3125']);
    expect(Array.from({length:18},(_,i)=>b.worksheetLines[String(i+5)]?.toFixed())).toEqual(['0','400000','0','0','0','0','0','0','0','400000','125000','0','0','125000','0','0','0','0']);
    expect([r.columnA, r.columnB, r.columnC, r.businessIncomeBeforeDeductionCap, r.businessIncomeDeduction, r.ohioBusinessAfterDeduction].map(v=>v.toFixed())).toEqual(['400000','0','125000','383725','250000','0']);
    expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(r.lines)).not.toContain('actual-invoice-001');
  });
  it.each([
    ['100000','92935','92935','92935','0'],
    ['400000','383725','383725','250000','0'],
    ['1000000','975691','975691','250000','62500'],
  ])('reconciles independently pinned actual federalAGI cap for C%s', (profit,agi,line11,bid,ohio) => {
    const f=ohioBusinessApportionmentFixture(profit);f.federalAgi=agi;
    const r=calculateOhioBusinessApportionment(f);
    expect([r.businessIncomeBeforeDeductionCap,r.businessIncomeDeduction,r.ohioBusinessAfterDeduction].map(v=>v.toFixed())).toEqual([line11,bid,ohio]);
  });
  it('uses the actual MFS deduction cap without a free override',()=>{const f=ohioBusinessApportionmentFixture();f.filingStatus='married_filing_separately';const r=calculateOhioBusinessApportionment(f);expect(r.businessIncomeDeduction.toFixed()).toBe('125000');});
  it('preserves signed actual business loss without flooring its Ohio apportioned income',()=>{const f=ohioBusinessApportionmentFixture();f.originalBusinesses[0]!.netProfit='-4000';f.originalBusinesses[0]!.original.expenses.otherExpenses='404000';f.facts.businesses[0]!.originalBusiness=structuredClone(f.originalBusinesses[0]!.original);f.federalAgi='10000';const r=calculateOhioBusinessApportionment(f);expect([r.columnA,r.columnC,r.businessIncomeDeduction,r.ohioBusinessAfterDeduction].map(v=>v.toFixed())).toEqual(['-4000','-1250','0','-1250']);});
  it('does not calendarprorate actual partyear annual business factors',()=>{const f=ohioBusinessApportionmentFixture();f.originalBusinesses[0]!.ownerResidencyStatus='part_year_resident';f.facts.businesses[0]!.ownerResidencyStatus='part_year_resident';expect(calculateOhioBusinessApportionment(f).columnC.toFixed()).toBe('125000');});
  it('keeps actual isolated2026 method identity separate from yearpack qualification',()=>{const f=ohioBusinessApportionmentFixture();f.taxYear=2026;f.facts.taxYear=2026;f.facts.businesses[0]!.sourceTaxYear=2026;const r=calculateOhioBusinessApportionment(f);expect(r.taxYear).toBe(2026);expect(r.qualifiedYearPack).toBe(false);expect(r.columnC.toFixed()).toBe('125000');});
  it('averages actual beginning and ending original property costs',()=>{const f=ohioBusinessApportionmentFixture();f.facts.businesses[0]!.property.ownedBeginning={ohio:'0',everywhere:'10000'};f.facts.businesses[0]!.property.ownedEnd={ohio:'20000',everywhere:'30000'};const r=calculateOhioBusinessApportionment(f);expect(r.businesses[0]?.propertyRatio.toFixed()).toBe('0.5');expect(r.columnC.toFixed()).toBe('125000');});
  it('uses eight times actual net annual rent with current source reconciliation',()=>{const f=ohioBusinessApportionmentFixture();const o=f.originalBusinesses[0]!;o.original.expenses.rentOnBusinessProperty='100';o.netAnnualRent='100';o.netProfit='399900';f.federalAgi='383627';const b=f.facts.businesses[0]!;b.originalBusiness=structuredClone(o.original);b.property.ownedBeginning={ohio:'0',everywhere:'800'};b.property.ownedEnd={ohio:'0',everywhere:'800'};b.property.annualRent={ohio:'50',everywhere:'100'};const r=calculateOhioBusinessApportionment(f);expect([r.businesses[0]?.worksheetLines['1bOhio']?.toFixed(),r.businesses[0]?.worksheetLines['1bEverywhere']?.toFixed(),r.businesses[0]?.propertyRatio.toFixed(),r.columnC.toFixed()]).toEqual(['400','800','0.25','99975']);});
  it('retains20/20/60 weights when all actual factors exist',()=>{const f=ohioBusinessApportionmentFixture();const o=f.originalBusinesses[0]!;o.original.expenses.wages='100';o.employeeCompensation='100';o.netProfit='399900';f.federalAgi='383627';const b=f.facts.businesses[0]!;b.originalBusiness=structuredClone(o.original);b.payroll.ohio='50';b.payroll.everywhere='100';const r=calculateOhioBusinessApportionment(f);expect([r.businesses[0]?.propertyWeight.toFixed(),r.businesses[0]?.payrollWeight.toFixed(),r.businesses[0]?.salesWeight.toFixed(),r.businesses[0]?.apportionmentRatio.toFixed(),r.columnC.toFixed()]).toEqual(['0.2','0.2','0.6','0.35','139965']);});
  it('uses100percent sales weight when other actual denominators arezero',()=>{const f=ohioBusinessApportionmentFixture();const b=f.facts.businesses[0]!;b.property.ownedBeginning={ohio:'0',everywhere:'0'};b.property.ownedEnd={ohio:'0',everywhere:'0'};const r=calculateOhioBusinessApportionment(f);expect(r.businesses[0]?.salesWeight.toFixed()).toBe('1');expect(r.columnC.toFixed()).toBe('100000');});
  it('preserves actualzero business andfactor originals distinctly from missing',()=>{const f=ohioBusinessApportionmentFixture('0');f.federalAgi='0';const b=f.facts.businesses[0]!;b.property.ownedBeginning={ohio:'0',everywhere:'0'};b.property.ownedEnd={ohio:'0',everywhere:'0'};b.sales.rows=[];const r=calculateOhioBusinessApportionment(f);expect([r.columnA,r.columnB,r.columnC,r.businessIncomeDeduction,r.ohioBusinessAfterDeduction].map(v=>v.toFixed())).toEqual(['0','0','0','0','0']);});
  it.each([
    ['missing actual property amount',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{delete (f.facts.businesses[0]!.property.ownedBeginning as Record<string,unknown>).ohio;}],
    ['negative property amount',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.property.ownedBeginning.ohio='-1';}],
    ['Ohio property above everywhere',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.property.ownedBeginning.ohio='20001';}],
    ['nonfinite income',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.netProfit='NaN';}],
    ['missing original business',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses=[];}],
    ['duplicate business',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses.push(structuredClone(f.facts.businesses[0]!));}],
    ['contradictory original gross',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.original.grossReceipts='100000';f.facts.businesses[0]!.originalBusiness=structuredClone(f.originalBusinesses[0]!.original);}],
    ['contradictory raw original owner',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.original.accountHolder='spouse';f.facts.businesses[0]!.originalBusiness=structuredClone(f.originalBusinesses[0]!.original);}],
    ['changed original owner',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.accountHolder='spouse';}],
    ['equalmoney different original identity',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.original.businessName='Different actual business';}],
    ['fullresident owner',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.originalBusinesses[0]!.ownerResidencyStatus='full_year_resident';f.facts.businesses[0]!.ownerResidencyStatus='full_year_resident';}],
    ['missing confirmed Ohio depreciation history',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.noOhioDepreciationAdjustmentsConfirmed=false;}],
    ['unconfirmed current source',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.sourceFactsConfirmed=false;}],
    ['missing actual full business coverage',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.allBusinessesIncludedConfirmed=false;}],
    ['unqualified lower tier',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.noLowerTierEntitiesConfirmed=false;}],
    ['unqualified alternative allocation',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.noSpecialIndustryOrAlternativeAllocationConfirmed=false;}],
    ['incomplete receipts',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.sales.rows[0]!.grossReceipt='399999';}],
    ['Ohio receipt above actual gross',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.sales.rows[0]!.ohioBenefitReceipt='400001';}],
    ['duplicate receipt original',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.sales.rows.push(structuredClone(f.facts.businesses[0]!.sales.rows[0]!));}],
    ['unreconciled payroll',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.payroll.everywhere='100';}],
    ['unknown sixplace factor quantization',(f:ReturnType<typeof ohioBusinessApportionmentFixture>)=>{f.facts.businesses[0]!.property.ownedBeginning={ohio:'10000',everywhere:'30000'};f.facts.businesses[0]!.property.ownedEnd={ohio:'10000',everywhere:'30000'};}],
  ])('rejects %s without inventing missing source facts',(_label,mutate)=>{const f=ohioBusinessApportionmentFixture();mutate(f);expect(()=>calculateOhioBusinessApportionment(f)).toThrow();});
});
