import { currentOriginInput } from './form-172-origin.js';

// Explicit fictional originals. These zeros are test facts, never intake defaults.
const receiptFields = ['salesOfPurchasedLivestock','costOfPurchasedLivestock','salesOfProductsRaised','cooperativeDistributions','cooperativeNonIncomeItems',
  'agriculturalProgramPayments','agriculturalProgramMaterialsServices','cccLoansElected','cccLoansForfeited','cropInsuranceProceeds','priorYearDeferredCropInsurance',
  'customHireIncome','otherFarmIncome','accrualSalesDuringYear','accrualBeginningInventory','accrualPurchasesDuringYear','accrualEndingInventory',
  'conservationCarryforward','w2WagesPaid','ubiaQualifiedProperty'] as const;
const expenseFields = ['breedingFees','carAndTruck','chemicals','conservation','customHire','depreciation','section179Expense','employeeBenefits','feed','fertilizersAndLime',
  'freightAndTrucking','gasolineFuelOil','insurance','jobsCredit','landClearing','mortgageInterest','otherInterest','laborHired','pensionAndProfitSharing',
  'rentLeaseVehicles','rentLeaseOther','repairsAndMaintenance','seedsAndPlants','storageAndWarehousing','supplies','taxes','utilities','veterinaryBreedingMedicine','otherExpenses'] as const;
export function farmingWaiverInput(expense = '110000') {
  const base = currentOriginInput();
  if (!base.form172 || !base.netOperatingLoss?.alternativeTax) throw Error('Missing explicit fictional independent original packets');
  const receipts: Record<string,string> = Object.fromEntries(receiptFields.map(key => [key,'0'])); receipts.salesOfProductsRaised='10000';
  const expenses: Record<string,string> = Object.fromEntries(expenseFields.map(key => [key,'0'])); expenses.seedsAndPlants=expense;
  const originals = { receipts, expenses };
  const source = { sourceTaxYear:2025, sourceReference:'PRIVATE fictional complete farm ledger',sourceFactsConfirmed:true,
    accountHolder:'primary' as const, farmerName:`${base.taxpayer.primary.firstName} ${base.taxpayer.primary.lastName}`,
    farmerSsnLast4:base.taxpayer.primary.ssn.slice(-4), principalCropOrActivity:'Fictional raised vegetables',activityCode:'111219',ein:'12-3456789',
    cashMethodConfirmed:true,raisedProductsOnlyConfirmed:true,domesticForProfitFarmConfirmed:true,allCurrentYearFarmSourcesIncluded:true,
    materiallyParticipatedConfirmed:true,allInvestmentAtRiskConfirmed:true,priorAtRiskSuspensionsKnownEmptyConfirmed:true,priorPassiveSuspensionsKnownEmptyConfirmed:true,
    seedsPaidAndUsedDuringYearConfirmed:true,noPrepaidFarmSuppliesConfirmed:true,section464LimitationNotApplicableConfirmed:true,notTaxShelterConfirmed:true,
    noSection263ACapitalizationRequiredConfirmed:true,noFarmAccountingOrBasisElectionsConfirmed:true,noCapitalOrPreproductiveCostsConfirmed:true,deductibleSeedsAfterAllFarmLimitationsConfirmed:true,
    noOtherFarmIncomeOrDeductionsConfirmed:true,noOtherBusinessSourcesConfirmed:true,
    originals,
    alternativeTax:{sourceReference:'PRIVATE independent AMT original cash ledger',sourceFactsConfirmed:true,sameBasisAndLossLimitationsConfirmed:true,
      allAlternativeAdjustmentsIncludedConfirmed:true, originals:structuredClone(originals)},
    waiver:{sourceReference:'PRIVATE filed actual irrevocable section172 statement',sourceFactsConfirmed:true,originalReturnReference:'PRIVATE filed original return acknowledgment',
      returnFiledDate:'2026-04-10',statementExecutedDate:'2026-04-09',statementAttachedToOriginalReturnConfirmed:true,
      entireCarrybackPeriodWaivedConfirmed:true,irrevocableElectionConfirmed:true,originalTimelyReturnConfirmed:true,extensionUsed:false,amendedReturn:false},
  };
  return {...base, scheduleC:undefined,
    scheduleF:{...receipts,principalCropOrActivity:source.principalCropOrActivity,activityCode:source.activityCode,accountHolder:'primary',ein:source.ein,
      accountingMethod:'cash',materiallyParticipated:true,qbiMateriallyParticipated:true,expenses:{...expenses}},
    form461:{sourceTaxYear:2025,sourceReference:'PRIVATE actual reconciled farm Form461',sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
      scheduleESupplementalIncome:'0',tradeOrBusinessCapitalGainNetIncome:'0',noncapitalNonbusinessIncome:'0',noncapitalNonbusinessLoss:'0',
      noncapitalBusinessNet:expense==='110000' ? '-100000' : expense==='510000' ? '-500000' : '0',otherBusinessIncome:'0',otherBusinessDeductions:'0'},
    form172:{...base.form172,farmingLossIncluded:true,businessSources:[],farmingSources:source},
  };
}
