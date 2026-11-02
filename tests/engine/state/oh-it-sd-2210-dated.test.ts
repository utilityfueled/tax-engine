/** Spec: state/oh-it-sd-2210-dated.yaml. Originals/expected numbers precede outputs. */
import {expect,it} from 'vitest';
import {calculateOhioDatedPartII} from '@/engine/state/oh-it-sd-2210-dated.js';
import {ohioDatedOrdinaryOriginals as originals} from '../../fixtures/oh-dated-payments.js';
it('OH dated PartII preserves actual endpoint inputs and whole-dollar originals',()=>{
 const input=structuredClone(originals.full),before=structuredClone(input);const result=calculateOhioDatedPartII(input);
 expect(result.quarters.map(q=>q.line16.toString())).toEqual(['14','40','79','69']);expect(result.line17.toString()).toBe('202');expect(input).toEqual(before);
 expect(()=>calculateOhioDatedPartII({...input,requiredAnnualPayment:'4000.01'})).toThrow(/whole|cents/i);
});
it('OH dated PartII reduces actual partial payments before the next endpoint',()=>{
 const result=calculateOhioDatedPartII({...originals.full,payments:[originals.partial]});expect(result.quarters[0]?.line16.toString()).toBe('9');
});
it('OH dated PartII honors actual last-quarter early settlement',()=>{const input=structuredClone(originals.lastQuarter);const result=calculateOhioDatedPartII(input);expect(result.quarters.map(q=>q.line16.toString())).toEqual(['0','0','0','3']);expect(result.line17.toString()).toBe('3');});
it('OH dated PartII rejects future unpaid periods beyond actual asof',()=>{expect(()=>calculateOhioDatedPartII({...originals.lastQuarter,payments:originals.lastQuarter.payments.slice(0,3),actualAsOfDate:'2026-01-20'})).toThrow(/as.of|future|actual/i);});
it('OH dated PartII guards conflicting six-digit full and partial precision',()=>{
 for(const payment of [{date:'2025-04-16',amount:'1'},{date:'2025-06-15',amount:'2000000'}])expect(()=>calculateOhioDatedPartII({...originals.full,requiredAnnualPayment:'8000000',payments:[payment]})).toThrow(/precision/i);
 // Even a small amount can disagree: exact6.495496=>6, cent segments3.29+3.21=>7.
 expect(()=>calculateOhioDatedPartII({...originals.full,requiredAnnualPayment:'2000',payments:[{date:'2025-05-15',amount:'42'}]})).toThrow(/precision/i);
});
it('OH dated PartII retains published precision when no interior balance changes',()=>{const result=calculateOhioDatedPartII({...originals.full,requiredAnnualPayment:'8000000'});expect(result.quarters[0]?.line16.toString()).toBe('27160');});
it('OH dated PartII totals reported cells without annual catchup erasing earlier interest',()=>{
 const result=calculateOhioDatedPartII({...originals.full,payments:[{date:'2026-01-15',amount:'4000'}]});expect(result.quarters.map(q=>q.line16.toString())).toEqual(['14','40','79','0']);expect(result.line17.toString()).toBe('133');
});
it('OH dated PartII rejects unknown dates, future receipts, nonfinite or negative amounts and unqualified years',()=>{
 for(const raw of [{...originals.full,taxYear:2026},{...originals.full,annualWithholding:'NaN'},{...originals.full,annualWithholding:'-1'},{...originals.full,payments:[{date:'2025-02-30',amount:'1'}]},{...originals.full,payments:[{date:'2026-04-16',amount:'1'}]},{...originals.full,actualAsOfDate:'2026-02-01',payments:[{date:'2026-03-01',amount:'1'}]}])expect(()=>calculateOhioDatedPartII(raw)).toThrow();
});
it('OH dated PartII retains the original partial full-calendar35 control',()=>{
 const result=calculateOhioDatedPartII({...originals.full,payments:[originals.partial,{date:'2025-06-16',amount:'1000'},{date:'2025-09-15',amount:'1000'},{date:'2026-01-15',amount:'1000'}]});expect(result.quarters.map(q=>q.line16.toString())).toEqual(['9','8','11','7']);expect(result.line17.toString()).toBe('35');
});
it('OH dated PartII splits actual rate-boundary partial payments for original28 control',()=>{
 const result=calculateOhioDatedPartII({...originals.full,payments:[{date:'2025-04-15',amount:'1000'},{date:'2025-06-16',amount:'1000'},{date:'2025-12-01',amount:'600'},{date:'2026-01-15',amount:'1000'}]});expect(result.quarters.map(q=>q.line16.toString())).toEqual(['0','0','21','7']);expect(result.line17.toString()).toBe('28');
});

it('OH dated PartII ignores zero and fully excess receipts as accrual events',()=>{
 // Independent review retained the original42May15 conflict; zeroApr26 must
 // not create a cent-rounding boundary that silently changes6/6/7 to6/6/6.
 expect(()=>calculateOhioDatedPartII({...originals.full,requiredAnnualPayment:'2000',payments:[{date:'2025-04-26',amount:'0'},{date:'2025-05-15',amount:'42'}]})).toThrow(/precision/i);
 const baseline={...originals.lastQuarter,actualAsOfDate:'2026-02-15'};
 const settled=calculateOhioDatedPartII(baseline);
 const excess=calculateOhioDatedPartII({...baseline,payments:[...baseline.payments,{date:'2026-02-15',amount:'50'}]});
 expect(excess.quarters.map(q=>q.line16.toString())).toEqual(settled.quarters.map(q=>q.line16.toString()));
 expect(excess.line17.toString()).toBe('3');
});
