/** Finite original-source admission only. Spec: spec/federal/foreign-tax-k3-ordinary.yaml. */
import { ForeignTaxK3OrdinaryProofSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { calculatePartnerBasisSchedule } from './partner-basis-schedule.js';
import type { ForeignTaxCreditSourceInput } from './foreign-tax-credit-source-records.js';
type Income = NonNullable<NonNullable<NonNullable<ForeignTaxCreditSourceInput['foreignTaxElection']>['creditWithForm1116']>['incomeSources']>[number];
const confirmations = ['domesticContinuingNonPtpConfirmed','portfolioIncomeOnlyConfirmed','allOtherK1AmountsZeroConfirmed','noOtherBasisChangesConfirmed','priorBasisSuspensionsZeroConfirmed','priorAtRiskSuspensionsZeroConfirmed','priorPassiveSuspensionsZeroConfirmed','sourceFactsConfirmed'] as const;
const zeroAmounts = ['foreignDeductions','foreignInterestExpense','otherExpenses','taxReduction','redeterminationAmount'] as const;
const identity = new Set(['taxYear','partnershipName','partnershipEIN','accountHolder','entityType','foreignTaxCategory']);
const allowedAmounts = new Set(['interestIncome','foreignSourceIncome','foreignTaxPaid','beginningBasis']);
const normalized = (value: string | undefined) => value?.trim().toUpperCase();
const tin = (value: string | undefined) => value?.replaceAll('-', '').trim();
function actual(value: string | undefined): value is string { return value !== undefined && /^\d+(?:\.\d+)?$/.test(value) && d(value).isFinite(); }
/** Called only for ordinary K3 records. Existing direct and bank source paths are untouched. */
export function requireForeignTaxK3Ordinary(input: ForeignTaxCreditSourceInput, source: Income) {
  const annual=input.foreignTaxElection, facts=annual?.creditWithForm1116;
  const parsed=ForeignTaxK3OrdinaryProofSchema.safeParse(source.qualifiedPartnership), proof=parsed.success?parsed.data:undefined;
  const original=input.scheduleK1?.[0];
  if(input.taxpayer.taxYear!==2025 || input.taxpayer.filingStatus!=='single' || source.sourceId!=='scheduleK1:0'
    || input.scheduleK1.length!==1 || (input.scheduleK1Form1041 ?? []).length!==0 || input.form1099Int.length!==0 || input.form1099Div.length!==0
    || !proof || proof.sourceTaxYear!==2025 || confirmations.some(key=>proof[key]!==true)
    || proof.calendarYearPartnershipConfirmed !== true || proof.usdReportedPaidTaxesConfirmed !== true || !proof.usdPaidTaxSourceReference?.trim()
    || !Array.isArray(proof.entityPaidTaxPayments) || proof.entityPaidTaxPayments.length === 0
    || proof.entityPaidTaxPayments.some(row => !row.date || !/^2025-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0,10) !== row.date || !actual(row.amountUsd))
    || !proof.originalK1Reference?.trim() || !proof.qualifiedK3Reference?.trim() || !proof.beginningBasisSourceReference?.trim()
    || zeroAmounts.some(key=>!actual(proof[key]) || !d(proof[key]).isZero())
    || facts?.carryovers?.length!==0 || facts.amtCarryovers?.length!==0
    || !original || original.taxYear!==2025 || original.entityType!=='partnership' || original.accountHolder!=='primary'
    || original.foreignTaxCategory!=='passive' || source.owner!=='primary'
    || !original.partnershipName.trim() || normalized(source.payerName)!==normalized(original.partnershipName)
    || !/^\d{9}$/.test(tin(original.partnershipEIN)??'') || tin(source.payerTin)!==tin(original.partnershipEIN)
    || source.accountReference!==undefined || source.sourceReference?.trim()!==proof.qualifiedK3Reference.trim()
    || !actual(original.beginningBasis) || !actual(original.interestIncome) || !actual(original.foreignSourceIncome) || !actual(original.foreignTaxPaid)
    || !d(original.foreignSourceIncome).eq(original.interestIncome) || !actual(source.reportedIncome) || !d(source.reportedIncome).eq(original.interestIncome)
    || !actual(source.foreignIncome) || !d(source.foreignIncome).eq(original.foreignSourceIncome)) {
    throw new Error('Ordinary K3 credit requires one actual primary2025 passive-interest partnership and complete qualified original zero-history records');
  }
  // A true documentary answer cannot override a positive/unsupported actual canonical K1 box.
  for(const [key,value]of Object.entries(original)) {
    if(value===undefined || identity.has(key) || allowedAmounts.has(key))continue;
    if(key==='priorSuspendedLosses') {
      if(!value || typeof value!=='object' || Object.values(value).some(amount=>typeof amount!=='string'||!actual(amount)||!d(amount).isZero()))throw new Error('Ordinary K3 credit has actual prior basis suspensions');
    } else if(typeof value==='boolean' ? value : typeof value!=='string'||!actual(value)||!d(value).isZero()) {
      throw new Error('Ordinary K3 credit other actual K1 boxes require their separate source method');
    }
  }
  const payments = proof.entityPaidTaxPayments;
  if (!payments) throw new Error('Ordinary K3 entity-paid USD details are required');
  const paidTotal = payments.reduce((total, row) => {
    if (!actual(row.amountUsd)) throw new Error('Ordinary K3 entity-paid USD amount is required');
    return total.plus(row.amountUsd);
  }, d('0'));
  if (!paidTotal.eq(original.foreignTaxPaid)) throw new Error('Ordinary K3 entity-paid USD details must equal actual PartIII section4 tax');
  const tax=annual?.sources?.find(row=>row.sourceId===source.sourceId);
  if(!tax || tax.qualifiedPayeeStatement!=='schedule_k3' || tax.sourceReference?.trim()!==proof.qualifiedK3Reference.trim()
    || normalized(tax.foreignCountry)!==normalized(source.foreignCountry))throw new Error('Ordinary K3 credit original country and qualified statement reference must reconcile');
  const basis=calculatePartnerBasisSchedule(original), category=basis.lossCategories.find(row=>row.key==='foreignTax');
  if(!category || !category.allowed.eq(original.foreignTaxPaid) || !category.suspended.isZero() || !basis.totalSuspendedLosses.isZero())throw new Error('Ordinary K3 foreign tax requires actual fully sufficient basis without suspensions');
  return original;
}
