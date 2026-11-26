import {PA2026EicChildInventorySchema,type PA2026EicChildInventory} from '@/models/pa-2026-eic-child-inventory.js';
import {snapshotPAOrdinaryReturnOriginals} from './pa-ordinary-return-facts.js';
/** Limited state-only dependency proof. Spec: state/pa-2026-ordinary-draft.yaml. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import {roundDollar} from '@/utils/decimal.js';
import {meetsEicChildlessAgeTest} from '@/utils/eic-age.js';
import {StandardDeductionFactsSchema,type TaxYearInput} from '@/models/inputs.js';
import {FEDERAL_2026_INDEXED} from '@/models/federal-2026-indexed.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import {PA_CONSTANTS} from './pa-40.js';
import type {PAOrdinaryReturnCompletionSources} from '@/models/pa-ordinary-return-completion.js';
import type {PAOrdinaryReturnProjection} from './pa-ordinary-return-facts.js';
import type {PAResidencySourcesResult} from './pa-residency-sources.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
import {readPA2026GovernmentUnemployment,type PA2026GovernmentUnemploymentContext} from './pa-2026-unemployment-source.js';
import {isIncompleteDividendAccountReference} from '@/utils/dividend-account-reference.js';
export interface PA2026OrdinaryDependencyProof {
 methodVersion:'pa-2026-ordinary-dependencies-v1';ordinaryWages:Decimal;
 maximumCompletedEitcPhaseout:Decimal;federalEarnedIncomeCredit:Decimal;careCredit:Decimal;
 confirmedChildlessCompletedEitcPhaseout?:Decimal;reportedWageAgi?:Decimal;childlessAgeIneligible?:true;
}
const fail=(detail:string):never=>{throw new Error('PA2026 ordinary draft dependency sources: '+detail);};
const retainedCreditAmount = z.string().regex(/^\d+(?:\.\d+)?$/).optional();
const childCreditContext = z.strictObject({
 bonaFidePuertoRicoResident: z.boolean().optional(),
 puertoRicoExcludedIncome: retainedCreditAmount,
 form4563ExcludedIncome: retainedCreditAmount,
 possessionIncomeExclusion: retainedCreditAmount,
 nonTaxableCombatPayElection: retainedCreditAmount,
} satisfies Record<keyof NonNullable<TaxYearInput['childTaxCredit']>, z.ZodType>);
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
/** Documentary review inputs; neither PA/SP child count nor empty normalized dependents establish these facts. */
export function snapshotPA2026EicChildReview(data:PA2026EicChildInventory):Record<string,unknown>{return structuredClone({sourceTaxYear:data.sourceTaxYear,sourceReference:data.sourceReference,allPotentialQualifyingChildrenReviewedConfirmed:data.allPotentialQualifyingChildrenReviewedConfirmed,noQualifyingEitcChildrenConfirmed:data.noQualifyingEitcChildrenConfirmed,candidateChildren:data.candidateChildren});}
/** Pure currentness validation shared by native capture replay and the actual state-only dependency. */
export function validatePA2026EicChildInventory(input:TaxYearInput,raw:unknown,requireConfirmation=true):PA2026EicChildInventory{
 const data=PA2026EicChildInventorySchema.parse(raw),t=input.taxpayer.primary;
 if(input.taxpayer.taxYear!==2026||data.sourceTaxYear!==2026||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse)fail('no-child sources require the actual2026 single owner');
 if(!data.sourceReference.trim()||data.allPotentialQualifyingChildrenReviewedConfirmed!==true||data.noQualifyingEitcChildrenConfirmed!==true||data.candidateChildren.length)fail('complete actual no-EIC-child inventory is required; unknown is not none');
 if(!Array.isArray(input.taxpayer.dependents)||input.taxpayer.dependents.length)fail('retained actual dependents require their separate source method');
 if(!t.firstName.trim()||!t.lastName.trim()||!/^\d{3}-?\d{2}-?\d{4}$/.test(t.ssn)||stable(data.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))fail('actual no-child source owner changed or is unknown');
 if(stable(data.originalFederalSources)!==stable(snapshotPAOrdinaryReturnOriginals(input)))fail('actual no-child original snapshot is stale; explicitly recapture');
 if(stable(data.originalPAResidencySources)!==stable(input.paResidencySources))fail('actual no-child PA original snapshot is stale; explicitly recapture');
 if(stable(data.capturedReview)!==stable(snapshotPA2026EicChildReview(data)))fail('actual no-child review changed after capture; explicitly recapture');
 if(requireConfirmation&&data.sourceFactsConfirmed!==true)fail('confirm the actual no-child inventory after capture');
 return data;
}
/** Call only after the existing complete ordinary/residency source replay. No federal result is manufactured. */
export function calculatePA2026OrdinaryDependencies(input:TaxYearInput,p:PAOrdinaryReturnProjection,sources:PAOrdinaryReturnCompletionSources,income:PAResidencySourcesResult,unemployment?:PA2026GovernmentUnemploymentContext):PA2026OrdinaryDependencyProof {
 if(input.taxpayer.taxYear!==2026||p.taxYear!==2026)fail('the separately typed draft requires actual2026 sources');
 const care=sources.care;
 const actualCare=care.status==='actual_expenses';
 const careHeadOfHousehold=actualCare&&input.taxpayer.filingStatus==='head_of_household';
 if((input.taxpayer.filingStatus!=='single'&&!careHeadOfHousehold)||p.facts.filing.maritalStatus!=='unmarried'||p.facts.filing.aliveEntireYear!==true)fail('only actual single living unmarried owners or the proven Head of Household care method are supported');
 const retainedCare=input.paOrdinaryReturnCompletionSources?.care?.careSources;
 const retainedHousehold=retainedCare?.headOfHousehold2026;
 if(retainedHousehold!==undefined&&stable(retainedHousehold)!==stable(care.careSources?.headOfHousehold2026)){
  fail('retained Head of Household proof differs from the supplied care sources');
 }
 if(careHeadOfHousehold&&retainedCare?.ordinaryDraft2026?.singleNotEligibleForHeadOfHouseholdConfirmed===true){
  fail('retained Single proof conflicts with the supplied Head of Household care method');
 }
 // Empty document arrays are normalization only. They never establish the complete
 // none facts: those are independently replayed from the confirmed source packets.
 const roots=new Set(['taxpayer','w2s','paResidencySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources','standardDeductionFacts','deductionElection','childTaxCredit','scheduleBPartThree']);
 const [bankInterest] = input.form1099Int;
 const [cashDividend] = input.form1099Div;
 if (bankInterest && cashDividend) fail('the ordinary part-year method requires one additional investment original');
 if (bankInterest) roots.add('form1099Int');
 if (cashDividend) roots.add('form1099Div');
 if(actualCare)roots.add('dependentCare');
 if (unemployment && readPA2026GovernmentUnemployment(input, unemployment)) roots.add('form1099G');
 const emptyDocumentRoots=new Set(['form1099Int','form1099Div','form1099B','form1099DA','form1099Nec','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','form1099R','form1099SA','formSSA1099','formRRB1099','paScheduleGLStatements','paScheduleJStatements','paPassThroughStatements','scheduleK1','scheduleK1Form1041','form1098','form1098E','form1095A','donations','rentalProperties','savingsBondRedemptions','form6252','form8814','homeSales','form8824']);
 for(const[key,value]of Object.entries(input))if(!roots.has(key)&&value!==undefined&&!(emptyDocumentRoots.has(key)&&Array.isArray(value)&&value.length===0))fail('retained unsupported original or federal dependency: '+key);
 if(input.standardDeductionFacts!==undefined&&!StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts).success)fail('retained standard-deduction context is unsupported');
 if (typeof input.standardDeductionFacts?.primaryDeathDate === 'string') {
  fail('actual federal death date requires a separate method from the confirmed living owner draft');
 }
 if (input.standardDeductionFacts?.shortTaxYear === true) {
  fail('confirmed short tax year from an accounting-period change requires a separate Pennsylvania taxable-period method');
 }
 if(input.deductionElection!==undefined&&!['automatic','standard','itemized','nonitemized'].includes(input.deductionElection))fail('retained deduction election is unknown');
 const r=PAResidencySourcesSchema.parse(input.paResidencySources);
 const allowed=new Set(['sourceTaxYear','sourceReference','sourceFactsConfirmed','owner','residency','wages','interest','dividends','otherPAIncomeClassesConfirmedNone','otherPAAdjustmentsConfirmedNone']);
 for(const[key,value]of Object.entries(r))if(!allowed.has(key)&&value!==undefined&&!(Array.isArray(value)&&value.length===0))fail('specialized residency originals require their actual successor: '+key);
 if(!input.w2s.length||(!bankInterest&&r.interest.length)||r.otherPAIncomeClassesConfirmedNone!==true||r.otherPAAdjustmentsConfirmedNone!==true)fail('complete ordinary wage and income source coverage is required');
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,p,sources),rounding:Decimal.ROUND_HALF_UP});
 const amount=(raw:unknown):Decimal=>{if(typeof raw!=='string'||!/^\d+(\.\d+)?$/.test(raw))return fail('actual wage/benefit amount is unknown');const n=new Money(raw);return n.isFinite()?n:fail('actual wage amount is nonfinite');};
 let wages=new Money(0);
 for (const w of input.w2s) {
  wages = wages.plus(amount(w.wages));
  if (!amount(w.box10DependentCareBenefits).isZero()) fail('actual employer benefits require their source method');
  if (w.box12CodeQ !== undefined && !amount(w.box12CodeQ).isZero()) fail('actual combat pay requires its separate compensation method');
 }
 if (bankInterest || cashDividend) {
  const retainedCompletion = input.paOrdinaryReturnCompletionSources;
  if ((bankInterest && income.residencyStatus !== 'part_year') || p.paFilingChoice !== 'S' || actualCare || unemployment
    || sources.eitcChildInventory || retainedCompletion?.eitcChildInventory || retainedCompletion?.care?.status === 'actual_expenses'
    || sources.estimatedTaxReview2026 || retainedCompletion?.estimatedTaxReview2026 || p.facts.payments.rows.length) {
   fail(bankInterest
    ? 'part-year bank interest requires the ordinary high-wage single method without another special source or payment method'
    : 'cash dividends require the ordinary high-wage single method without another special source or payment method');
  }
 }
 if (bankInterest) {
  const [interestSource] = r.interest;
  if (input.form1099Int.length !== 1 || r.interest.length !== 1 || !interestSource
    || bankInterest.taxYear !== 2026 || bankInterest.accountHolder !== 'primary'
    || !bankInterest.payer.trim() || !bankInterest.accountReference?.trim()) {
   fail('part-year bank interest requires one actual 2026 Form 1099-INT for the primary owner and original account');
  }
  const otherAmounts = [bankInterest.earlyWithdrawalPenalty, bankInterest.usSavingsBondInterest, bankInterest.federalWithheld,
   bankInterest.foreignTaxPaid, bankInterest.taxExemptInterest, bankInterest.privateActivityBondInterest, bankInterest.stateWithheld];
  if (!amount(bankInterest.interestIncome).gt(0) || bankInterest.foreignCountry?.trim() || bankInterest.privateActivityBondFacts
    || otherAmounts.some(value => value === undefined || !amount(value).isZero())) {
   fail('part-year bank interest requires positive Box 1 and known-zero other amounts without specialized source facts');
  }
  const creditReferences = interestSource.credits.map(credit => credit.sourceReference.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase());
  if (new Set(creditReferences).size !== creditReferences.length) fail('conflicting dated bank credits reuse the same actual credit reference');
 }
 if (cashDividend) {
  const periods = r.residency.domicilePeriods;
  const [first, second] = periods;
  if (income.residencyStatus === 'part_year') {
   if (periods.length !== 2 || first.state === 'PA' || second.state !== 'PA') {
    fail('part-year cash dividends require one move into Pennsylvania');
   }
  } else if (periods.length !== 1 || (first.state === 'PA') !== (income.residencyStatus === 'resident')) {
   fail('full-year cash dividends require continuous confirmed domicile consistent with Pennsylvania residency');
  }
  const [dividendSource] = r.dividends ?? [];
  const accountReference = cashDividend.accountReference?.trim();
  if (input.form1099Div.length !== 1 || r.dividends?.length !== 1 || !dividendSource
    || cashDividend.taxYear !== 2026 || cashDividend.accountHolder !== 'primary'
    || !cashDividend.payer.trim() || !accountReference) {
   return fail('cash dividends require one actual 2026 Form 1099-DIV for the primary owner and original account');
  }
  if (income.residencyStatus !== 'part_year' && isIncompleteDividendAccountReference(accountReference)) {
   fail('full-year cash dividends require a complete unmasked account reference');
  }
  if (dividendSource.domesticCorporateCashDividendsOnlyConfirmed !== true) {
   fail('confirm actual domestic corporate cash dividends only for this personal investment original');
  }
  const otherAmounts = [cashDividend.totalCapitalGainDistributions, cashDividend.section1250Gain, cashDividend.section1202Gain,
   cashDividend.collectiblesGain, cashDividend.nondividendDistributions, cashDividend.federalWithheld, cashDividend.section199ADividends,
   cashDividend.foreignTaxPaid, cashDividend.exemptInterestDividends, cashDividend.specifiedPrivateActivityBondInterest, cashDividend.stateWithheld];
  if (!amount(cashDividend.ordinaryDividends).gt(0) || cashDividend.foreignCountry?.trim() || cashDividend.directReitDividendFacts
    || cashDividend.privateActivityBondFacts || otherAmounts.some(value => value === undefined || !amount(value).isZero())) {
   fail('cash dividends require positive Box 1a with known-zero other amounts including withholding and without specialized source facts');
  }
  if (dividendSource.credits.some(credit => !amount(credit.ordinaryDividends).gt(0))) {
   fail('positive dated domestic cash dividends are required for each credit');
  }
  const creditReferences = dividendSource.credits.map(credit => credit.sourceReference.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase());
  if (new Set(creditReferences).size !== creditReferences.length) fail('conflicting dated dividend credits reuse the same actual credit reference');
 }
 if (input.childTaxCredit !== undefined) {
  const parsed = childCreditContext.safeParse(input.childTaxCredit);
  if (!parsed.success) return fail('retained Form 8812 context has unknown or invalid facts');
  const { bonaFidePuertoRicoResident, ...amounts } = parsed.data;
  if (bonaFidePuertoRicoResident === true || Object.values(amounts).some(value => value !== undefined && !new Money(value).isZero())) {
   fail('retained Form 8812 context requires its separate federal source method');
  }
 }
 if(actualCare){
  const [domicile]=r.residency.domicilePeriods;
  const [child]=p.facts.filing.dependentChildren;
  if(unemployment||sources.eitcChildInventory||sources.estimatedTaxReview2026||p.facts.payments.rows.length||income.residencyStatus!=='resident'
    ||r.residency.domicilePeriods.length!==1||domicile?.state!=='PA'||domicile.from!=='2026-01-01'||domicile.through!=='2026-12-31'
    ||p.paFilingChoice!=='S'||p.claimedAsDependent||p.facts.filing.dependentChildren.length!==1
    ||input.taxpayer.dependents.length!==1||child?.originalIndex!==0
    ||(child.relationship!=='natural_child'&&(careHeadOfHousehold||child.relationship!=='adopted_child'))){
   fail('actual care requires a single directly claimed child, continuous PA domicile and the high-wage-only original method');
  }
 }else if(care.status!=='no_qualifying_expenses'||care.allCarePaymentSourcesReviewedConfirmed!==true||care.allEmployerBenefitsIncludedConfirmed!==true||care.originalCarePayments.length||care.careSources!==undefined){
  fail('complete actual no-care/no-benefit originals are required');
 }
 if(Object.values(p.facts.sp.categories).some(row=>row.status!=='known_none'||row.entries.length))fail('other worldwide SP income requires its actual successor');
 const hasUnsupportedPrepayment=p.facts.payments.rows.some(row=>row.original.kind!=='extension'||sources.estimatedTaxReview2026!==undefined);
 if(sources.otherStateTaxes.status!=='none_paid'||hasUnsupportedPrepayment||p.facts.payments.priorCredit.status!=='none'||!p.useTax.isZero())fail('other state payments, PA prepayments, carryforward or use tax require their separate methods');
 if (income.residencyStatus === 'resident' && r.residency.domicilePeriods.length === 2) {
  const formerDomicile = r.residency.domicilePeriods[0].state;
  const stateName = formerDomicile === 'FL' ? 'Florida' : formerDomicile === 'TX' ? 'Texas' : undefined;
  if (!stateName) fail('the former domicile requires a separate full-year residency method');
  const jurisdictions = sources.otherStateTaxes.jurisdictions;
  if (jurisdictions.length !== 1 || jurisdictions[0].state !== formerDomicile) {
   fail(`the ${stateName} move requires ${stateName} as the sole complete zero-tax jurisdiction history`);
  }
 }
 if(p.timing.date>'2027-04-15'||p.timing.filingExtension!=='none'||p.timing.paymentExtension!=='none')fail('late or extended timing requires its actual successor');
 const child=sources.eitcChildInventory===undefined?undefined:validatePA2026EicChildInventory(input,sources.eitcChildInventory);
 const eitc=FEDERAL_2026_INDEXED.eitc;
 const maximum=Money.max(...Object.values(eitc.completedPhaseOutSingleHoH),...Object.values(eitc.completedPhaseOutMFJ));
 const estimateReview=sources.estimatedTaxReview2026;
 const retainedEstimateReview=input.paOrdinaryReturnCompletionSources?.estimatedTaxReview2026;
 if (retainedEstimateReview !== undefined && stable(retainedEstimateReview) !== stable(estimateReview)) {
  fail('retained estimate review differs from the supplied completion sources');
 }
 if (estimateReview) {
  const supportedResidency = income.residencyStatus === 'nonresident' || income.residencyStatus === 'part_year';
  if (!supportedResidency || p.paFilingChoice !== 'S' || input.taxpayer.spouse
    || input.w2s.length !== 1 || input.w2s[0].taxYear !== 2026 || input.w2s[0].accountHolder !== 'primary'
    || !wages.gt(maximum) || child) fail('small balance requires one current W-2 for the actual single part-year or nonresident high-wage owner');
  if (!p.paWithholding.isZero()) fail('small balance requires exact zero PA withholding');
  if (stable(estimateReview.owner) !== stable(sources.owner)) fail('estimate review owner differs from the actual return owner');
  if (stable(estimateReview.originalPAResidencySources) !== stable(input.paResidencySources)) fail('estimate review PA originals are stale');
  const rate=PA_CONSTANTS[2026].taxRate;
  // REV-413(I) and section 325 apply to reasonably expected unwithheld income.
  // Treat the whole PA projection as unwithheld and keep away from both reporting boundaries.
  for (const period of estimateReview.periods) {
   const expected=amount(period.maximumExpectedPATaxableWages);
   if (expected.gte('14000')) fail('expected PA wages must be below $14,000 throughout the determination periods');
   if (roundDollar(new Money(roundDollar(expected)).times(rate)).gte('430')) fail('expected rounded PA tax must be below $430 throughout the determination periods');
  }
  if (income.compensation.gte('14000')) fail('actual PA wages must be below $14,000');
  if (!income.taxBeforeCredits.gt(0) || income.taxBeforeCredits.gte('430')
    || new Money(income.compensation).times(rate).gte('430')) fail('actual positive PA balance must be below $430');
  if (p.timing.kind !== 'filed' || p.timing.remainingTaxPayment.status !== 'actual_payment') fail('small balance requires an actual filed return and original payment receipt');
 } else if (roundDollar(p.paWithholding).lt(income.taxBeforeCredits)) {
  fail('reported PA withholding must cover fresh PA tax without an unsourced interest dependency');
 }
 const reportedWageAgi=roundDollar(wages),childlessCutoff=new Money(eitc.completedPhaseOutSingleHoH[0]);
 const proof: PA2026OrdinaryDependencyProof = {
  methodVersion: 'pa-2026-ordinary-dependencies-v1',
  ordinaryWages: publicOrdinaryMoney(wages),
  maximumCompletedEitcPhaseout: publicOrdinaryMoney(maximum),
  federalEarnedIncomeCredit: new Decimal(0),
  careCredit: new Decimal(0),
 };
 if (!child) {
  if (!wages.gt(maximum)) fail('actual wage income does not prove completed EIC phaseout for every child count and filing table');
  return proof;
 }
 proof.reportedWageAgi = publicOrdinaryMoney(reportedWageAgi);
 if (wages.gte(childlessCutoff) && reportedWageAgi.gte(childlessCutoff)) {
  proof.confirmedChildlessCompletedEitcPhaseout = publicOrdinaryMoney(childlessCutoff);
  return proof;
 }
 if (meetsEicChildlessAgeTest(input.taxpayer.primary.dateOfBirth, null, input.taxpayer.taxYear, true, 'primary')) {
  fail('actual no-child wage income is below the finite completed EIC phaseout source boundary');
 }
 proof.childlessAgeIneligible = true;
 return proof;
}
