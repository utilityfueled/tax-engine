/** Spec: state/oh-2026-actual-balance-payment.yaml. No historical/year gate expansion. */
import Decimal from 'decimal.js';
import {roundDollar} from '@/utils/decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {OhioPaymentFactsSchema, type OhioPaymentFacts} from '@/models/ohio-payments.js';
import type {Ohio2026ActualBalancePaymentProjection} from '@/models/ohio-2026-return-draft.js';
function fail(detail: string): never {throw new Error(`Ohio2026 actual small-balance payment sources: ${detail}`);}
function date(value: string): string {
  const parsed=Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value) fail('valid actual calendar date required');
  return value;
}
const ssn=(value:string)=>value.replace(/[\s-]/g,'');
const name=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
/** This validates payment originals only; the caller must first prove complete current employee sources. */
export function validateOhio2026ActualBalancePaymentSources(input:TaxYearInput): OhioPaymentFacts {
  const parsed=OhioPaymentFactsSchema.safeParse(input.ohioPayments);
  if (!parsed.success||input.taxpayer.taxYear!==2026||parsed.data.taxYear!==2026) fail('complete confirmed current2026 payment originals required');
  const facts=parsed.data,pay=facts.remainingTaxPayment;
  if (facts.paymentRows.length||facts.priorReturn.status!=='no_return'||facts.priorCreditCarryforward.status!=='none'
    ||!new Decimal(facts.balanceFacts.useTax).isZero()||!new Decimal(facts.balanceFacts.outgoingCarryforward).isZero()||!new Decimal(facts.balanceFacts.donations).isZero()) fail('estimated prior carry or other balance facts need their separate method');
  if (pay.status!=='actual_payment') fail('actual original balance payment required; expected or unknown is not settlement');
  const person=pay.accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.filingStatus==='married_filing_jointly'?input.taxpayer.spouse:undefined;
  if (!person||!/^\d{9}$/.test(ssn(pay.original.accountSsn))||ssn(pay.original.accountSsn)!==ssn(person.ssn)||name(pay.original.accountName)!==name(person.firstName+' '+person.lastName)) fail('actual payment account owner differs');
  const paid=date(pay.date),originalDate=date(pay.original.date),asOf=date(facts.currentTiming.asOfDate);
  const valued=date(facts.currentTiming.kind==='filed'?facts.currentTiming.filedDate:facts.currentTiming.expectedDate);
  if (paid<'2027-01-01'||paid>'2027-04-15'||paid>asOf||originalDate!==paid||asOf<'2027-01-01'||asOf>'2027-04-15'||valued<'2027-01-01'||valued>'2027-04-15'
    ||(facts.currentTiming.kind==='filed'?valued>asOf:valued<asOf)) fail('actual timely payment and filing chronology differs');
  if (pay.original.taxYear!==2026||!new Decimal(pay.original.amount).eq(pay.amountAppliedToTax)||!new Decimal(pay.amountAppliedToTax).gt(0)) fail('actual original payment and positive applied amount must match exactly');
  return facts;
}
/** Called only after opaque current employee replay and independently computed tax/withholding. */
export function calculateOhio2026ActualBalancePayment(input:TaxYearInput,incomeTax:Decimal,withholding:Decimal,originalWithholding:string):Ohio2026ActualBalancePaymentProjection {
  const facts=validateOhio2026ActualBalancePaymentSources(input),pay=facts.remainingTaxPayment;
  if (pay.status!=='actual_payment') return fail('actual payment required');
  if (!incomeTax.isFinite()||incomeTax.isNegative()||!incomeTax.isInteger()||!withholding.isFinite()||withholding.isNegative()||!withholding.isInteger()) fail('fresh reported income tax and withholding required');
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(originalWithholding)) fail('exact original withholding required');
  const rawWithholding=new Decimal(originalWithholding);
  if (!roundDollar(rawWithholding).eq(withholding)||incomeTax.minus(rawWithholding).gt(500)) fail('actual raw withholding shortfall exceeds statutory500 threshold');
  const remaining=incomeTax.minus(withholding);
  if (!remaining.gt(0)||remaining.gt(500)) fail('actual positive balance at most500 requires this statutory method; other balances need installment evidence');
  const applied=new Decimal(pay.amountAppliedToTax);
  if (!applied.eq(remaining)) fail('actual full payment must equal fresh remaining tax without rounding receipt cash');
  return {methodVersion:'oh-2026-actual-timely-small-balance-v1',status:'actual_paid_on_time',actualPaymentDate:pay.date,actualBalancePaymentApplied:applied,outstandingTaxBalance:new Decimal(0)};
}
