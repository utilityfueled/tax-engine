/** Source-first public Decimal identity controls after genuine eight-PDF strict replay failure. */
import {expect,it} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import Decimal from 'decimal.js';
import {calculatePAScheduleC} from '@/engine/state/pa-schedule-c';
import {calculatePAOrdinaryBusinessSources} from '@/engine/state/pa-ordinary-business-sources';
import {paOrdinaryBusinessFixture} from '../../fixtures/pa-ordinary-business-sources';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return';
function stableAmounts(value:unknown):void{if(Decimal.isDecimal(value))expect(value.constructor).toBe(Decimal);else if(value&&typeof value==='object')Object.values(value).forEach(stableAmounts);}
const context={status:'resident' as const,residentPeriods:[{from:Date.parse('2025-01-01T00:00:00.000Z')/86400000,through:Date.parse('2025-12-31T00:00:00.000Z')/86400000}]};
it('business exact local arithmetic returns replay stable Schedule C outputs',()=>{
 const precision=Decimal.precision,gross=new Decimal('10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.50'),advertising=new Decimal('9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999.49');
 const a=calculatePAScheduleC({taxYear:2025,grossReceipts:gross,expenses:{advertising}}),b=calculatePAScheduleC({taxYear:2025,grossReceipts:gross,expenses:{advertising}});
 expect(a.line39.toFixed()).toBe('2');expect(isDeepStrictEqual(a,b)).toBe(true);stableAmounts(a);expect(Decimal.precision).toBe(precision);
});
it('business explicit absent original produces stable real zero results',()=>{
 const f=paOrdinaryReturnFixture(),a=calculatePAOrdinaryBusinessSources(f.input,undefined,context),b=calculatePAOrdinaryBusinessSources(f.input,undefined,context);
 expect(a.reportedBusinessIncome.toFixed()).toBe('0');expect(isDeepStrictEqual(a,b)).toBe(true);stableAmounts(a);
});
it('business actual source schedules and all audit fields replay with stable constructors',()=>{
 const f=paOrdinaryBusinessFixture(),before=structuredClone(f.input),a=calculatePAOrdinaryBusinessSources(f.input,[f.business],context),b=calculatePAOrdinaryBusinessSources(structuredClone(f.input),[structuredClone(f.business)],context);
 expect(a.scheduleC?.line39.toFixed()).toBe('15200');expect(a.worldwideScheduleC?.line39.toFixed()).toBe('15200');expect(isDeepStrictEqual(a,b)).toBe(true);stableAmounts(a);expect(f.input).toEqual(before);
});
