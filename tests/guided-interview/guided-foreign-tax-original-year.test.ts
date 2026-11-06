// Spec: spec/federal/guided-foreign-tax-ordinary-credit.yaml, fictional-source-year.
import {expect,it} from 'vitest';
import {investmentFactErrors} from '@/lib/guided-investment-facts';
import {guidedOrdinaryCreditFixture} from '../fixtures/guided-foreign-tax-ordinary';

it('retains the independently supplied foreign interest original year',()=>{
 const {investment,facts}=guidedOrdinaryCreditFixture();
 expect(investment.interestEntries[0]).toMatchObject({sourceTaxYear:'2025',payer:'Synthetic investment bank',payerTin:'112233445',accountReference:'Private synthetic account A',interestIncome:'20000',foreignTaxPaid:'900',foreignCountry:'Canada'});
 expect(facts.creditWithForm1116?.incomeSources?.[0].foreignIncome).toBe('10000');
 expect(investmentFactErrors(investment,'single',2025)).not.toHaveProperty('interest-0-year');
});

it('keeps an omitted original year unknown despite the dated annual election',()=>{
 const {investment,facts}=guidedOrdinaryCreditFixture();
 Reflect.deleteProperty(investment.interestEntries[0],'sourceTaxYear');
 expect(facts.taxYear).toBe('2025');
 expect(investmentFactErrors(investment,'single',2025)).toHaveProperty('interest-0-year');
});
