/** Spec: spec/federal/macrs-ordinary-disposition.yaml. */
import { describe, expect, it } from 'vitest';
import { Form4562Schema, DepreciableAssetSchema, type DepreciableAsset } from '@/models/inputs.js';
import { computeAssetDepreciation, computeAggregateDepreciation, computeListedPropertyDepreciation, computeListedPropertyAggregation } from '@/utils/macrs.js';
import { calculateForm4562 } from '@/engine/forms/form-4562.js';
import { dispositionFixture } from './macrs-disposition-fixtures.js';
const direct = (v: unknown) => v as DepreciableAsset;
describe('Ordinary source-bound nonterminal MACRS disposal', () => {
    it('reproduces the published quarter and residential disposal examples', () => {
        for (const [kind, want, raw] of [['quarter', '513', '513'], ['residential', '758', '757.5']] as const) {
            const original = dispositionFixture(kind), before = JSON.stringify(original), parsed = DepreciableAssetSchema.parse(original);
            const result = computeAssetDepreciation(parsed, 2025);
            expect(result?.depreciation.toFixed()).toBe(want);
            expect(result).toHaveProperty('dispositionSourceStatus', 'documented_ordinary_nonterminal');
            expect(result).toHaveProperty('dispositionAudit.preRoundDepreciation', expect.objectContaining({}));
            expect((result as unknown as {
                dispositionAudit: {
                    preRoundDepreciation: {
                        toFixed(): string;
                    };
                };
            }).dispositionAudit.preRoundDepreciation.toFixed()).toBe(raw);
            expect(JSON.stringify(original)).toBe(before);
            expect(JSON.stringify(parsed)).toContain('dispositionSources');
            expect(result?.basisSourceStatus).toBe('legacy_unqualified');
            expect(computeAggregateDepreciation([parsed], 2025).priorYearAssets.toFixed()).toBe(want);
        }
    });
    it('rounds once and refuses unsupported or incomplete disposition paths', () => {
        const half = dispositionFixture('half');
        expect(computeAssetDepreciation(DepreciableAssetSchema.parse(half), 2025)?.depreciation.toFixed()).toBe('960');
        const missing = {
            ...half, dispositionSources: undefined
        };
        expect(() => computeAssetDepreciation(direct(missing), 2025)).toThrow(/disposition sources/i);
        expect(() => computeAggregateDepreciation([direct(missing)], 2025)).toThrow(/disposition sources/i);
        expect(() => computeListedPropertyDepreciation(direct({
            ...half, isListedProperty: true
        }), 2025)).toThrow(/disposition sources/i);
        for (const changed of [{
                ...half, dispositionSources: {
                    ...half.dispositionSources, sourceTaxYear: 2026
                }
            }, {
                ...half, dispositionSources: {
                    ...half.dispositionSources, history: []
                }
            }, {
                ...half, dispositionSources: {
                    ...half.dispositionSources, dispositionDate: '2025-02-31'
                }
            }, {
                ...half, basisSources: {}
            }, {
                ...half, costBasis: '0'
            }])
            expect(() => computeAssetDepreciation(direct(changed), 2025)).toThrow();
    });
    it('uses all four actual disposition quarters and preserves annual rate separately', () => {
        const base = dispositionFixture();
        for (const [date, want] of [['2025-01-02', '171'], ['2025-04-02', '513'], ['2025-07-02', '855'], ['2025-10-02', '1197']]) {
            const asset = {
                ...base, dispositionSources: {
                    ...base.dispositionSources, dispositionDate: date
                }
            };
            const result = computeAssetDepreciation(DepreciableAssetSchema.parse(asset), 2025);
            expect(result?.depreciation.toFixed()).toBe(want);
            expect(result?.percentage.toFixed()).toBe('13.68');
        }
    });
    it('requires an explicit form owner year and emits no documentary identity in audit', () => {
        const raw = dispositionFixture();
        raw.description = 'PRIVATE-ORIGINAL-ASSET-DISPLAY';
        raw.dispositionSources.assetSnapshot.description = raw.description;
        const without = Form4562Schema.parse({
            assets: [raw]
        });
        expect(() => calculateForm4562(without)).toThrow(/explicit.*year/i);
        const withYear = Form4562Schema.parse({
            taxYear: 2025, assets: [raw]
        });
        const result = calculateForm4562(withYear, 2025);
        expect(result.line17.toFixed()).toBe('513');
        expect(() => calculateForm4562(withYear, 2026)).toThrow(/year/i);
        const entry = result.lines.find(v => v.line === 'asset' && v.inputs['Disposition source status'] === 'documented_ordinary_nonterminal');
        expect(entry?.inputs['Actual disposition date']).toBe('2025-04-10');
        expect(entry?.value.toFixed()).toBe('513');
        const audit = JSON.stringify(result.lines);
        for (const marker of [raw.description, raw.dispositionSources.sourceReference, raw.dispositionSources.assetIdentity, raw.dispositionSources.activityIdentity, raw.dispositionSources.history[0].sourceReference])
            expect(audit).not.toContain(marker);
    });
    it('rejects duplicate actual asset records before aggregate sums', () => {
        const a = DepreciableAssetSchema.parse(dispositionFixture());
        expect(() => computeAggregateDepreciation([a, a], 2025)).toThrow(/duplicate.*asset/i);
    });
});

describe('Actual owner-year and supported leap-day boundaries',()=>{
 it('calculates the same finite quarter cohort in actual2026 without a default year',()=>{
  const a=dispositionFixture();a.placedInServiceDate='2023-12-02';a.dispositionSources.assetSnapshot.placedInServiceDate=a.placedInServiceDate;a.dispositionSources.sourceTaxYear=2026;a.dispositionSources.dispositionDate='2026-04-10';a.dispositionSources.history=a.dispositionSources.history.map(r=>({...r,taxYear:r.taxYear+1,sourceReference:`fictional-following-year-${r.taxYear+1}`}));
  const parsed=DepreciableAssetSchema.parse(a);expect(computeAssetDepreciation(parsed,2026)?.depreciation.toFixed()).toBe('513');expect(()=>computeAssetDepreciation(parsed,2025)).toThrow(/year/);
  expect(calculateForm4562(Form4562Schema.parse({assets:[parsed]}),2026).line17.toFixed()).toBe('513');
 });
 it('admits an actual leap-day only with fully reconciled original history',()=>{
  const a=dispositionFixture('half');a.cumulativePriorMacrsDeductions='2001';a.dispositionSources.assetSnapshot.cumulativePriorMacrsDeductions='2001';a.dispositionSources.sourceTaxYear=2024;a.dispositionSources.dispositionDate='2024-02-29';a.dispositionSources.history=a.dispositionSources.history.slice(0,1);a.dispositionSources.adjustedBasisAtYearStart='8004.20';
  expect(computeAssetDepreciation(DepreciableAssetSchema.parse(a),2024)?.depreciation.toFixed()).toBe('1601');
 });
 it('retains only legacy same-year exclusion and rejects any supplied malformed packet first',()=>{
  const legacy={costBasis:'10000',placedInServiceDate:'2026-04',recoveryPeriod:'5',disposedDuringYear:true}as const;expect(computeAssetDepreciation(DepreciableAssetSchema.parse(legacy),2026)).toBeNull();expect(()=>computeAssetDepreciation(direct({...legacy,dispositionSources:{}}),2026)).toThrow(/disposition sources/);
 });
});

describe('Remaining finite original class records',()=>{
 it.each([['3','3333','6667','2223'],['7','1429','8571','1225'],['10','1000','9000','900']]as const)('reconciles original %s-year history before disposal',(period,prior,opening,want)=>{
  const a=dispositionFixture('half');Object.assign(a,{costBasis:'10000',placedInServiceDate:'2024-06-01',recoveryPeriod:period,cumulativePriorMacrsDeductions:prior});Object.assign(a.dispositionSources,{grossCostBasis:'10000',originalMacrsBasis:'10000',adjustedBasisAtYearStart:opening});a.dispositionSources.assetSnapshot={...a.dispositionSources.assetSnapshot,...{costBasis:a.costBasis,placedInServiceDate:a.placedInServiceDate,recoveryPeriod:a.recoveryPeriod,cumulativePriorMacrsDeductions:prior}};a.dispositionSources.history=[{...a.dispositionSources.history[0],taxYear:2024,originalMacrsBasis:'10000',regularAllowedOrAllowable:prior,regularClaimed:prior}];
  expect(computeAssetDepreciation(DepreciableAssetSchema.parse(a),2025)?.depreciation.toFixed()).toBe(want);
 });
 it('reconciles published A7a July placement history for ordinary39-year property',()=>{
  const a=dispositionFixture('residential');a.recoveryPeriod='39';a.cumulativePriorMacrsDeductions='3741';a.dispositionSources.assetSnapshot.recoveryPeriod='39';a.dispositionSources.assetSnapshot.cumulativePriorMacrsDeductions='3741';a.dispositionSources.adjustedBasisAtYearStart='96259';a.dispositionSources.history=a.dispositionSources.history.map((r,i)=>({...r,regularAllowedOrAllowable:i?'2564':'1177',regularClaimed:i?'2564':'1177'}));
  expect(computeAssetDepreciation(DepreciableAssetSchema.parse(a),2025)?.depreciation.toFixed()).toBe('534');
 });
});

// Spec: validate-before-listed-skip. Runtime inputs remain validated before filtering.
it('validates ordinary disposition packets before nonlisted aggregation exclusion', () => {
    const original = dispositionFixture();
    const before = JSON.stringify(original);
    expect(computeListedPropertyAggregation([DepreciableAssetSchema.parse(original)], 2025).totalDepreciation.toFixed()).toBe('0');
    expect(computeListedPropertyAggregation([DepreciableAssetSchema.parse(original)], 2025).results).toEqual([]);
    for (const dispositionSources of [{}, null, { ...original.dispositionSources, confirmed: false }, { ...original.dispositionSources, sourceTaxYear: 2026 }]) {
        const malformed = { ...original, dispositionSources };
        const saved = JSON.stringify(malformed);
        expect(() => computeListedPropertyAggregation([direct(malformed)], 2025)).toThrow(/disposition sources/i);
        expect(JSON.stringify(malformed)).toBe(saved);
    }
    expect(JSON.stringify(original)).toBe(before);
});
