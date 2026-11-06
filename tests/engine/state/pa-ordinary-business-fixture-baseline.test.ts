/** Independent fixture sanity before existing calculation entrypoints are changed. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {paOrdinaryBusinessFixture,businessExpenseDollars} from '../../fixtures/pa-ordinary-business-sources';
it('business fictional source records retain original cash and actual meal dollars',()=>{
 const f=paOrdinaryBusinessFixture('part_year');
 expect(f.input.form1099Nec[0].nonemployeeCompensation).toBe('18000');expect(f.input.scheduleC?.grossReceipts).toBe('18000');
 expect(f.business.necOriginals[0].original).toEqual(f.input.form1099Nec[0]);expect(f.business.originalScheduleC).toEqual(f.input.scheduleC);
 expect(Object.values(businessExpenseDollars).reduce((n,x)=>n.plus(x),new Decimal(0)).toFixed()).toBe('2800');
 expect(f.input.scheduleC?.expenses?.meals).toBe('200');expect(f.business.incomeReceipts.reduce((n,r)=>n.plus(r.amount),new Decimal(0)).toFixed()).toBe('18000');
 expect(f.business.allocation.locations.map(x=>x.state)).toEqual(['NY','PA']);
});
