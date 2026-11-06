// Spec: state/guided-pa-dividend-sources.yaml. Source-first draft/original controls.
import {expect,it} from 'vitest';
import {emptyGuidedPADividendSource,emptyGuidedPADividendCredit,GuidedPADividendSourceSchema,updateGuidedPADividendSource} from '@/lib/guided-pa-dividend-sources';
import {paOrdinaryInvestmentFixture} from '../../fixtures/pa-ordinary-investment-sources';

it('PA dividend draft starts with actual facts unknown',()=>{
 const row=emptyGuidedPADividendSource(),credit=emptyGuidedPADividendCredit();
 expect(row).toEqual({originalIndex:null,sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,ordinaryPersonalDividendIncomeConfirmed:null,capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:null,noOtherPADividendAdjustmentsConfirmed:null,currentUncorrectedNonvoidOriginalConfirmed:null,allOriginalBoxesKnownConfirmed:null,credits:[]});
 expect(credit).toEqual({sourceReference:'',creditedOn:'',ordinaryDividends:'',capitalGainDistributions:''});expect(row.original).toBeUndefined();
 row.credits.push({...credit,ordinaryDividends:'0'});expect(GuidedPADividendSourceSchema.parse(row).credits[0]).toMatchObject({ordinaryDividends:'0',capitalGainDistributions:''});expect(emptyGuidedPADividendSource().credits).toEqual([]);
});
it('PA dividend draft preserves strict existing source schema',()=>{
 const f=paOrdinaryInvestmentFixture(),row=f.residency.dividends[0];expect(GuidedPADividendSourceSchema.parse(row)).toEqual(row);
 expect(()=>GuidedPADividendSourceSchema.parse({...row,paDividendOverride:'0'})).toThrow();expect(()=>GuidedPADividendSourceSchema.parse({...row,credits:[{...row.credits[0],estimatedShare:'50'}]})).toThrow();
});
it('PA dividend draft edits retain original identity and revoke source confirmation',()=>{
 const row=paOrdinaryInvestmentFixture().residency.dividends[0],before=structuredClone(row),edited=updateGuidedPADividendSource(row,{credits:[{...row.credits[0],ordinaryDividends:'1000.01'},row.credits[1]]});
 expect(edited.sourceFactsConfirmed).toBeNull();expect(edited.original).toEqual(before.original);expect(row).toEqual(before);
 expect(updateGuidedPADividendSource(edited,{sourceFactsConfirmed:true}).sourceFactsConfirmed).toBe(true);expect(updateGuidedPADividendSource(row,{sourceReference:'Changed actual record',sourceFactsConfirmed:true}).sourceFactsConfirmed).toBeNull();
 expect(updateGuidedPADividendSource(row,{originalIndex:null}).original).toEqual(before.original);
});
