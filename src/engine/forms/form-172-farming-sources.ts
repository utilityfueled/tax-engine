/** Actual farm-only origins and already-filed waiver. Spec: form-172-farming-waiver.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { d, roundDollar } from '@/utils/decimal.js';
import { calculateScheduleF, type ScheduleFResult } from '@/engine/schedules/schedule-f.js';
import { calculateForm172Origin, type Form172OriginResult } from './form-172-origin.js';

const receipts = ['salesOfPurchasedLivestock','costOfPurchasedLivestock','salesOfProductsRaised','cooperativeDistributions','cooperativeNonIncomeItems',
 'agriculturalProgramPayments','agriculturalProgramMaterialsServices','cccLoansElected','cccLoansForfeited','cropInsuranceProceeds','priorYearDeferredCropInsurance',
 'customHireIncome','otherFarmIncome','accrualSalesDuringYear','accrualBeginningInventory','accrualPurchasesDuringYear','accrualEndingInventory',
 'conservationCarryforward','w2WagesPaid','ubiaQualifiedProperty'] as const;
const expenses = ['breedingFees','carAndTruck','chemicals','conservation','customHire','depreciation','section179Expense','employeeBenefits','feed','fertilizersAndLime',
 'freightAndTrucking','gasolineFuelOil','insurance','jobsCredit','landClearing','mortgageInterest','otherInterest','laborHired','pensionAndProfitSharing',
 'rentLeaseVehicles','rentLeaseOther','repairsAndMaintenance','seedsAndPlants','storageAndWarehousing','supplies','taxes','utilities','veterinaryBreedingMedicine','otherExpenses'] as const;
const confirmationFields = ['cashMethodConfirmed','raisedProductsOnlyConfirmed','domesticForProfitFarmConfirmed','allCurrentYearFarmSourcesIncluded',
 'materiallyParticipatedConfirmed','allInvestmentAtRiskConfirmed','priorAtRiskSuspensionsKnownEmptyConfirmed','priorPassiveSuspensionsKnownEmptyConfirmed',
 'seedsPaidAndUsedDuringYearConfirmed','noPrepaidFarmSuppliesConfirmed','section464LimitationNotApplicableConfirmed','notTaxShelterConfirmed',
 'noSection263ACapitalizationRequiredConfirmed','noFarmAccountingOrBasisElectionsConfirmed','noCapitalOrPreproductiveCostsConfirmed','deductibleSeedsAfterAllFarmLimitationsConfirmed',
 'noOtherFarmIncomeOrDeductionsConfirmed','noOtherBusinessSourcesConfirmed'] as const;
interface FarmOriginals { receipts?:Record<string,string>; expenses?:Record<string,string> }
export interface Form172FarmingValidation { regularFarmNet:Decimal; alternativeFarmNet:Decimal }
export interface Form172FarmingResult {
 waiverVerified:true; carrybackUsed:Decimal;
 regularFarmOnly:Form172OriginResult; alternativeFarmOnly:Form172OriginResult;
 regularFarmingLoss:Decimal; alternativeFarmingLoss:Decimal;
 regularNonfarmLoss:Decimal; alternativeNonfarmLoss:Decimal;
}
function fail(message:string):never { throw Error(`Form172 farming sources ${message}`); }
function verified(source:{sourceReference?:string;sourceFactsConfirmed?:boolean}|undefined):boolean {
 return source?.sourceFactsConfirmed===true && !!source.sourceReference?.trim();
}
function readLedger(original:FarmOriginals|undefined):{receipts:Record<string,string>;expenses:Record<string,string>} {
 if(!original?.receipts||!original.expenses)fail('require every actual original regular and AMT receipt and expense, including known zeros');
 const check=(values:Record<string,string>,keys:readonly string[],positiveKey:string)=>{
  if(Object.keys(values).length!==keys.length||Object.keys(values).some(key=>!keys.includes(key)))fail('require the exact complete original ledger boxes');
  for(const key of keys){const value=values[key];if(value===undefined||!/^\d+(\.\d+)?$/.test(value)||!d(value).isFinite())fail('require explicit finite nonnegative original boxes');
   if(key!==positiveKey&&!d(value).isZero())fail('require a separate method for other farm receipts, expenses, elections and basis adjustments');}
 };
 check(original.receipts,receipts,'salesOfProductsRaised');check(original.expenses,expenses,'seedsAndPlants');
 return {receipts:original.receipts,expenses:original.expenses};
}
function bindLedger(input:TaxYearInput,original:ReturnType<typeof readLedger>):void {
 const farm=input.scheduleF;if(!farm?.expenses)fail('require the actual ScheduleF original');
 for(const key of receipts){const value=farm[key];if(value===undefined||!d(value).eq(d(original.receipts[key])))fail('do not match an actual ScheduleF receipt or source zero');}
 for(const key of expenses){const value=farm.expenses[key];if(value===undefined||!d(value).eq(d(original.expenses[key])))fail('do not match an actual ScheduleF expense or source zero');}
}
function net(original:ReturnType<typeof readLedger>):Decimal {
 // Independent regular and AMT original ledgers are each run through the real
 // cash-farm calculation; AMT is not copied from regular return computation.
 return calculateScheduleF({...original.receipts,accountingMethod:'cash',expenses:{...original.expenses}}).netFarmProfit;
}
export function validateForm172FarmingSources(input:TaxYearInput,canonical?:ScheduleFResult):Form172FarmingValidation|undefined {
 const facts=input.form172,source=facts?.farmingSources;
 if(!source){if(facts?.farmingLossIncluded!==false||input.scheduleF)fail('require the separate actual farm ledger and filed waiver');return undefined;}
 if(!facts||facts.farmingLossIncluded!==true||input.taxpayer.taxYear!==2025||input.taxpayer.filingStatus!=='single'
  ||source.sourceTaxYear!==2025||!verified(source)||!input.scheduleF)fail('require actual2025 single-owner current farm originals');
 const farm=input.scheduleF,primary=input.taxpayer.primary;
 if(source.accountHolder!=='primary'||farm.accountHolder!=='primary'||source.farmerName?.trim()!==`${primary.firstName} ${primary.lastName}`.trim()
  ||!/^\d{4}$/.test(source.farmerSsnLast4??'')||source.farmerSsnLast4!==primary.ssn.replace(/-/g,'').slice(-4)
  ||!source.principalCropOrActivity?.trim()||source.principalCropOrActivity.trim()!==farm.principalCropOrActivity?.trim()
  ||!/^111\d{3}$/.test(source.activityCode??'')||source.activityCode!==farm.activityCode
  ||!/^\d{2}-\d{7}$/.test(source.ein??'')||source.ein!==farm.ein)fail('must bind actual farm year, owner, name, activity, EIN and taxpayer identity');
 if(confirmationFields.some(key=>source[key]!==true)||farm.accountingMethod!=='cash'||farm.materiallyParticipated!==true||farm.qbiMateriallyParticipated!==true
  ||farm.agriculturalPaymentSources!==undefined)fail('require full original active cash raised-product facts and known-empty limitations');
 if(input.scheduleC||input.scheduleK1.length||input.scheduleK1Form1041.length||input.rentalProperties.length||input.form1099Nec.length
  ||input.form1099C.length||input.codExclusion||input.form982NolSources||input.form982PrincipalResidenceSources||input.form982AttributeSources
  ||(facts.businessSources?.length??0)!==0)fail('require a separate source method for another business or debt cancellation');
 const prior=input.netOperatingLoss;
 if(!prior||!Array.isArray(prior.vintages)||prior.vintages.length!==0||!Array.isArray(prior.alternativeTax?.vintages)||prior.alternativeTax.vintages.length!==0
  ||Object.values(input.priorYear??{}).some(value=>Array.isArray(value)?value.length>0:typeof value==='string'&&!d(value).isZero()))fail('require complete known-empty independent regular and AMT prior histories');
 if(input.scheduleA||input.donations.length||input.adjustments||input.form8889||input.iraDeductionWorksheet
  ||(input.form1099R?.length??0)>0)fail('require a separate attribution method for additional original deduction or pension sources');
 const waiver=source.waiver;
 if(!verified(waiver)||!waiver?.originalReturnReference?.trim()||waiver.statementAttachedToOriginalReturnConfirmed!==true
  ||waiver.entireCarrybackPeriodWaivedConfirmed!==true||waiver.irrevocableElectionConfirmed!==true||waiver.originalTimelyReturnConfirmed!==true
  ||waiver.extensionUsed!==false||waiver.amendedReturn!==false||!waiver.returnFiledDate||!waiver.statementExecutedDate
  ||waiver.returnFiledDate<'2026-01-01'||waiver.returnFiledDate>'2026-04-15'||waiver.statementExecutedDate<'2026-01-01'
  ||waiver.statementExecutedDate>waiver.returnFiledDate)fail('require an actual timely filed original entire-period section172(b)(3) waiver, not an inferred election');
 const original=readLedger(source.originals),alternative=source.alternativeTax;
 if(!verified(alternative)||alternative?.sameBasisAndLossLimitationsConfirmed!==true||alternative.allAlternativeAdjustmentsIncludedConfirmed!==true)fail('require independent actual AMT farm source facts');
 const alternativeOriginal=readLedger(alternative.originals);
 bindLedger(input,original);bindLedger(input,alternativeOriginal);
 const regularFarmNet=net(original),alternativeFarmNet=net(alternativeOriginal);
 if(!regularFarmNet.lt(0)||!alternativeFarmNet.lt(0))fail('require an actual current farm loss');
 if(canonical&&(!canonical.netFarmProfit.eq(regularFarmNet)||!canonical.grossFarmIncome.eq(d(original.receipts.salesOfProductsRaised))
  ||!canonical.totalExpenses.eq(d(original.expenses.seedsAndPlants))))fail('must reconcile to the actual completed canonical ScheduleF');
 const ebl=input.form461;
 if(!verified(ebl)||ebl?.sourceTaxYear!==2025||ebl.atRiskAndPassiveLimitationsApplied!==true||ebl.noncapitalBusinessNet===undefined
  ||!d(ebl.noncapitalBusinessNet).eq(roundDollar(regularFarmNet)))fail('require actual complete reconciled post-at-risk Form461 classification');
 for(const key of ['scheduleESupplementalIncome','tradeOrBusinessCapitalGainNetIncome','noncapitalNonbusinessIncome','noncapitalNonbusinessLoss','otherBusinessIncome','otherBusinessDeductions'] as const){
  if(ebl[key]===undefined||!d(ebl[key]).isZero())fail('require explicit original Form461 zero classifications');}
 return {regularFarmNet,alternativeFarmNet};
}
export function calculateForm172FarmingSources(input:TaxYearInput,source:Form172FarmingValidation,regular:Form172OriginResult,alternative:Form172OriginResult,excessBusinessLoss:Decimal):Form172FarmingResult {
 const zero=d('0');
 const farmOnly=(farmNet:Decimal)=>calculateForm172Origin({taxYear:input.taxpayer.taxYear,filingStatus:input.taxpayer.filingStatus,
  adjustedGrossIncome:farmNet.plus(excessBusinessLoss),deductionAmount:zero,nonbusinessCapitalLosses:zero,nonbusinessCapitalGains:zero,
  nonbusinessDeductions:zero,nonbusinessOrdinaryIncome:zero,businessCapitalLosses:zero,businessCapitalGains:zero,netCapitalGainOrLoss:zero,
  section1202Exclusion:zero,otherYearNolDeduction:zero});
 const regularFarmOnly=farmOnly(source.regularFarmNet),alternativeFarmOnly=farmOnly(source.alternativeFarmNet);
 const regularFarmingLoss=Decimal.min(regular.netOperatingLoss,regularFarmOnly.netOperatingLoss);
 const alternativeFarmingLoss=Decimal.min(alternative.netOperatingLoss,alternativeFarmOnly.netOperatingLoss);
 return {waiverVerified:true,carrybackUsed:zero,regularFarmOnly,alternativeFarmOnly,regularFarmingLoss,alternativeFarmingLoss,
  regularNonfarmLoss:regular.netOperatingLoss.minus(regularFarmingLoss),alternativeNonfarmLoss:alternative.netOperatingLoss.minus(alternativeFarmingLoss)};
}
