/** Spec: state/oh-business-part-year-header.yaml. Existing APIs only before product changes. */
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {calculateOhioCanonicalBusinessSource,readOhioCanonicalBusinessSource} from '@/engine/state/oh-business-source';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {OhioReturnHeaderSourcesSchema} from '@/models/ohio-return-header-sources';
import {buildGuidedStateOriginals} from '../../../apps/web/src/lib/guided-state-engine-inputs';
import {julyCases,julyRequired,julyNativeFixture,julyHeaderPacket} from '../../fixtures/oh-business-part-year-header';
import {businessPaperFixture,businessPaperCases} from '../../fixtures/oh-business-official-review';
const cases=julyCases.map(c=>[c.name,c]as const);
it('July business independent no-header current source preconditions',()=>{
 for(const c of julyCases){const f=julyNativeFixture(c),before=structuredClone(f),federal=calculateFederalTax(f.canonical),oh=calculateOhioResidentReturnFromFederal({taxInput:f.canonical,federalResult:federal}),source=calculateOhioCanonicalBusinessSource({taxInput:f.canonical,residencyFacts:f.facts,federalResult:federal}),business=readOhioCanonicalBusinessSource(source,f.facts,federal.agi);
  expect(f.canonical.ohioReturnHeaderSources).toBeUndefined();expect(f.canonical.w2s).toEqual([]);expect(federal.scheduleC?.netProfit.toString()).toBe(c.profit);expect(federal.scheduleSE?.deductibleHalf.toString()).toBe(c.halfSE);expect(federal.agi.toString()).toBe(c.AGI);
  expect(business.worksheet.businesses[0]?.apportionmentRatio.toFixed(4)).toBe('0.3125');expect(business.worksheet.businessIncomeDeduction.toString()).toBe(c.BID);expect(business.residentFederalDeductions.toString()).toBe('0');
  expect(oh.it1040.line3_ohioAgi.toString()).toBe(c.OhioAGI);expect(oh.it1040.line4_exemptions.toString()).toBe('1900');expect(oh.it1040.line5_ohioTaxableIncome.toString()).toBe(c.taxable);expect(oh.it1040.line8b_businessTax.toString()).toBe(c.tax);expect(oh.nonresidentCreditResult?.line19.toFixed(4)).toBe(c.ratio);expect(oh.nonresidentCreditResult?.line20.toString()).toBe(c.NRC);expect(oh.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(oh.it1040.line26_refund.toString()).toBe('0');expect(f).toEqual(before);
 }
});
it('July business separately authored originals retain actual212-day dates and identities',()=>{
 const f=julyHeaderPacket(),owner=julyRequired(f.facts.owners[0]),business=julyRequired(f.facts.businessSources),before=structuredClone(f);expect(owner.periods).toEqual([{from:'2025-01-01',to:'2025-07-31',domicileState:'OH'},{from:'2025-08-01',to:'2025-12-31',domicileState:'VA'}]);
 const days=(a:string,b:string)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000+1;expect(days('2025-01-01','2025-07-31')).toBe(212);expect(days('2025-08-01','2025-12-31')).toBe(153);
 expect(business.receiptOriginals[0]?.date).toBe('2025-12-15');expect(business.receiptOriginals[0]?.originalDocumentId).toBe('PRIVATE-JULY212-RECEIPT-2025');expect(business.federalDeductionSources[0]?.original.date).toBe('2025-12-31');expect(owner.amounts?.federalAdjustments.residentAmount).toBe('0');expect(f.input.taxpayer.primary.lastName).toBe('JulyBusiness');expect(f.header.originalOhioResidencySources).toEqual(f.facts);expect(OhioReturnHeaderSourcesSchema.parse(f.header)).toEqual(f.header);expect(f).toEqual(before);
});
it.each(cases)('July business header namespace preserves current canonical money %s',(_name,c)=>{
 const f=julyHeaderPacket(c),before=structuredClone(f),federal=calculateFederalTax(f.withHeader),source=calculateOhioCanonicalBusinessSource({taxInput:f.withHeader,residencyFacts:f.facts,federalResult:federal}),r=readOhioCanonicalBusinessSource(source,f.facts,federal.agi);
 expect(r.worksheet.businessIncomeDeduction.toString()).toBe(c.BID);expect(r.federalAgi.toString()).toBe(c.AGI);expect(r.residentFederalDeductions.toString()).toBe('0');expect(f.withHeader.ohioReturnHeaderSources).toEqual(f.header);expect(f).toEqual(before);
});
it.each(['currentC identity','current owner identity','retained invoice identity','retained deduction date']as const)('July business keeps actual same-money source changes significant %s',kind=>{
 const f=julyNativeFixture(),data=julyRequired(f.state.sectionData['state-return']),child=julyRequired(data.ohioResidency?.businessSources);
 if(kind==='currentC identity')julyRequired(f.input.scheduleC).businessName='Same cash changed current business';if(kind==='current owner identity')f.input.taxpayer.primary.lastName='Same cash different current owner';if(kind==='retained invoice identity')julyRequired(child.receiptOriginals[0]).originalDocumentId='PRIVATE-SAME-CASH-REPLACEMENT';if(kind==='retained deduction date')julyRequired(child.federalDeductionSources[0]).original.date='2025-12-30';
 const before=structuredClone(f);expect(()=>buildGuidedStateOriginals(f.input,f.state)).toThrow();expect(f).toEqual(before);
});
it.each(cases)('July business existing header API projects separately sourced212-day jurisdiction %s',(_name,c)=>{
 const f=julyHeaderPacket(c),before=structuredClone(f),r=calculateOhioReturnHeaderSource(f.withHeader,f.header);expect(r.header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'part_year_resident'});expect(r.residentDays).toBe(212);expect(r.methodVersion).toBe('oh-2025-py-business-header-212-v1');expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
 const safe=JSON.stringify({header:r.header,audit:r.audit});for(const marker of ['900-74-0421',f.header.residence.originalAddress.street,f.header.finderOriginal.sourceReference,f.header.countyOriginal.sourceReference,r.sourceCommitment])expect(safe).not.toContain(marker);expect(f).toEqual(before);
});
const defects=['false confirmation','wrong2026','wrong owner','wrong identity','gap','overlap','different parent calendar','coherent unsupported county','Finder address mismatch','unknown district','taxing district','invalid record date','wrong official hash','wrong official page','missing federal snapshot','stale currentC','stale parent','stale payment']as const;
it.each(defects)('July business factual header rejects retained source conflict %s',kind=>{
 const f=julyHeaderPacket(),h=f.header;
 if(kind==='false confirmation')Reflect.set(h,'sourceFactsConfirmed',false);if(kind==='wrong2026')Reflect.set(h,'taxYear',2026);if(kind==='wrong owner')h.owner.accountHolder='spouse';if(kind==='wrong identity')h.owner.originalTaxpayer.ssn='900-74-0999';
 if(kind==='gap')julyRequired(h.residence.periods[0]).from='2025-01-02';if(kind==='overlap')h.residence.periods.push({from:'2025-07-31',through:'2025-07-31',sourceReference:'PRIVATE-DUPLICATE-RESIDENCE'});if(kind==='different parent calendar')julyRequired(f.withHeader.ohioResidency?.owners[0]?.periods[0]).to='2025-07-30';
 if(kind==='coherent unsupported county'){h.finderOriginal.countyName='Delaware';h.countyOriginal.countyName='Delaware';}if(kind==='Finder address mismatch')h.finderOriginal.originalAddress.zip='43216';if(kind==='unknown district')h.finderOriginal.districtCode='9998';if(kind==='taxing district'){h.finderOriginal.districtCode='0302';h.finderOriginal.districtName='Hillsdale LSD';h.finderOriginal.schoolIncomeTax='reported';}if(kind==='invalid record date')h.countyOriginal.recordDate='2026-02-30';if(kind==='wrong official hash')h.officialInventoryOriginal.publicationSha256='0'.repeat(64);if(kind==='wrong official page')h.officialInventoryOriginal.printedPage=49;if(kind==='missing federal snapshot')Reflect.deleteProperty(h,'originalFederalSources');if(kind==='stale currentC')julyRequired(f.withHeader.scheduleC).businessName='Same cash changed C';if(kind==='stale parent')julyRequired(f.withHeader.ohioResidency).sourceReference='PRIVATE-REPLACED-OWNER';if(kind==='stale payment')julyRequired(f.withHeader.ohioPayments).sourceReference='PRIVATE-REPLACED-PAYMENT';
 const before=structuredClone(f);expect(()=>calculateOhioReturnHeaderSource(f.withHeader,h)).toThrow();expect(f).toEqual(before);
});
it('July business old181-day header is not reinterpreted',()=>{
 const old=businessPaperFixture(julyRequired(businessPaperCases.find(c=>c.name==='py100k'))),h=julyHeaderPacket().header;h.owner.originalTaxpayer={firstName:old.input.taxpayer.primary.firstName,lastName:old.input.taxpayer.primary.lastName,ssn:old.input.taxpayer.primary.ssn,dateOfBirth:julyRequired(old.input.taxpayer.primary.dateOfBirth)};
 const{ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...federal}=old.input;h.originalFederalSources=structuredClone(federal);h.originalOhioResidencySources=structuredClone(old.facts);h.originalOhioPaymentSources=structuredClone(old.payments);julyRequired(h.residence.periods[0]).through='2025-06-30';const before=structuredClone({old,h});expect(()=>calculateOhioReturnHeaderSource(old.input,h)).toThrow();expect({old,h}).toEqual(before);
});

it('July business separately valid equal-cell originals retain distinct commitments',()=>{const a=julyHeaderPacket(),b=julyHeaderPacket();b.header.finderOriginal.sourceReference='PRIVATE-JULY212-SEPARATE-ACTUAL-LOOKUP';const before=structuredClone({a,b}),ra=calculateOhioReturnHeaderSource(a.withHeader,a.header),rb=calculateOhioReturnHeaderSource(b.withHeader,b.header);expect(ra.header).toEqual(rb.header);expect(ra.sourceCommitment).not.toBe(rb.sourceCommitment);expect({a,b}).toEqual(before);});
