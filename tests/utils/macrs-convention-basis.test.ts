import {describe,expect,it} from 'vitest';
import type {DepreciableAsset} from '@/models/inputs.js';
import {computeAggregateDepreciation,computeAssetDepreciation,computeListedPropertyDepreciation,isMidQuarterRequired} from '@/utils/macrs.js';

// Spec: federal/macrs-convention-basis.yaml. Expected rates from Pub946 A-2/A-5.
const asset=(overrides:Partial<DepreciableAsset>={}):DepreciableAsset=>({costBasis:'10000',placedInServiceDate:'2026-01',recoveryPeriod:'5',...overrides});
describe('MACRS-Convention-Basis',()=>{
  it('includes explicit convention basis and applies the mandatory aggregate convention',()=>{
    const a=[asset({convention:'halfYear'}),asset({costBasis:'20000',placedInServiceDate:'2026-10',convention:'halfYear'})];
    expect(isMidQuarterRequired(a,2026)).toBe(true);
    const r=computeAggregateDepreciation(a,2026);
    expect(r.midQuarterRequired).toBe(true);
    expect(r.assetResults.map(x=>[x.convention,x.depreciation.toFixed(0)])).toEqual([['midQuarter','3500'],['midQuarter','1000']]);
    const listed=computeAggregateDepreciation([a[0],{...a[1],isListedProperty:true,businessUsePercentage:100}],2026);
    expect(listed.listedProperty.results[0]).toMatchObject({convention:'midQuarter'});
    expect(listed.listedProperty.totalDepreciation.toFixed(0)).toBe('1000');
  });
  it('uses listed business basis at both sides of the strict threshold',()=>{
    const before=asset({costBasis:'6000'}),q4=asset({costBasis:'10000',placedInServiceDate:'2026-12',isListedProperty:true,businessUsePercentage:40});
    expect(isMidQuarterRequired([before,q4],2026)).toBe(false); //4000/10000 exactly40%
    expect(isMidQuarterRequired([before,{...q4,businessUsePercentage:40.01}],2026)).toBe(true);
    expect(isMidQuarterRequired([before,{...q4,businessUsePercentage:0}],2026)).toBe(false);
    expect(isMidQuarterRequired([asset({costBasis:'10000',isListedProperty:true,businessUsePercentage:10}),asset({costBasis:'1000',placedInServiceDate:'2026-12'})],2026)).toBe(true); //1000/2000
  });
  it('excludes explicitly known same-year dispositions from basis and deductions',()=>{
    const disposed=asset({costBasis:'100000',placedInServiceDate:'2026-12',disposedDuringYear:true});
    expect(isMidQuarterRequired([asset(),disposed],2026)).toBe(false);
    expect(isMidQuarterRequired([asset({disposedDuringYear:true}),asset({placedInServiceDate:'2026-12'})],2026)).toBe(true);
    expect(computeAssetDepreciation(disposed,2026)).toBeNull();
    expect(computeListedPropertyDepreciation({...disposed,isListedProperty:true,businessUsePercentage:100},2026)).toBeNull();
    expect(computeAssetDepreciation({...disposed,recoveryPeriod:'39'},2026)).toBeNull();
    const r=computeAggregateDepreciation([asset(),disposed,{...disposed,isListedProperty:true}],2026);
    expect(r.currentYearGds.toFixed(0)).toBe('2000');
    expect(r.assetResults).toHaveLength(1);expect(r.listedProperty.results).toHaveLength(0);
  });
  it('preserves cents and the exact strict threshold without division rounding',()=>{
    expect(isMidQuarterRequired([asset({costBasis:'6000.00'}),asset({costBasis:'4000.00',placedInServiceDate:'2026-10'})],2026)).toBe(false);
    expect(isMidQuarterRequired([asset({costBasis:'6000.00'}),asset({costBasis:'4000.01',placedInServiceDate:'2026-10'})],2026)).toBe(true);
    expect(isMidQuarterRequired([asset({costBasis:'6000.01'}),asset({costBasis:'4000.00',placedInServiceDate:'2026-10'})],2026)).toBe(false);
  });
  it('preserves prior-year convention and does not assume a missing disposition',()=>{
    const r=computeAggregateDepreciation([asset({placedInServiceDate:'2025-01',convention:'halfYear'}),asset({placedInServiceDate:'2026-12'})],2026);
    expect(r.assetResults.map(x=>[x.convention,x.depreciation.toFixed(0)])).toEqual([['halfYear','3200'],['midQuarter','500']]);
    expect(isMidQuarterRequired([asset({placedInServiceDate:'2026-12'})],2026)).toBe(true);
    expect(computeAssetDepreciation(asset(),2026)?.depreciation.toFixed(0)).toBe('2000');
  });
  it('preserves prior-year listed conventions when new assets trigger mid-quarter',()=>{
    for(const convention of ['halfYear',undefined] as const){
      const prior=asset({placedInServiceDate:'2025-01',convention,isListedProperty:true,businessUsePercentage:100});
      const r=computeAggregateDepreciation([prior,asset({placedInServiceDate:'2026-12'})],2026);
      expect(r.listedProperty.results[0].convention).toBe('halfYear');
      expect(r.listedProperty.totalDepreciation.toFixed(0)).toBe('3200');
      expect(computeListedPropertyDepreciation(prior,2026,'midQuarter')?.convention).toBe('halfYear');
      expect(computeAssetDepreciation({...prior,isListedProperty:false},2026,'midQuarter')?.convention).toBe('halfYear');
      const ads=computeAggregateDepreciation([{...prior,businessUsePercentage:40},asset({placedInServiceDate:'2026-12'})],2026);
      expect(ads.listedProperty.results[0].convention).toBe('halfYear');
      expect(ads.listedProperty.totalDepreciation.toFixed(0)).toBe('800');
    }
  });
});
