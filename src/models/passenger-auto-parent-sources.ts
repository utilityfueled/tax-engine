/** Spec: spec/federal/schedule-c-passenger-first-year-sources.yaml. Engine-only actual parent sources. */
import {z} from 'zod';
const reference=z.string().trim().min(1).max(500);
const amount=z.string().max(100).regex(/^\d+(\.\d+)?$/);
export const PASSENGER_PARENT_EXPENSE_KEYS=[
 'advertising','amortization','badDebts','bankCharges','carAndTruck','commissionsAndFees','contractLabor','depletion','depreciation','duesAndPublications','employeeBenefitPrograms','businessInterest','freight','idcsAmortization','idcsCurrentExpensing','section179Expense','insurance','laundryAndCleaning','legalAndProfessional','managementFees','officeExpense','pensionAndProfitSharing','postage','rentOnBusinessProperty','repairsAndMaintenance','startupCostsDirectExpense','supplies','taxes','telephone','travel','meals','utilities','wages','otherExpenses',
] as const;
export const PASSENGER_PARENT_EMPTY_ARRAYS=['w2s','form1099Int','form1099Div','form1099B','form1099DA','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','scheduleK1','scheduleK1Form1041','form1098','form1098E','form1095A','donations','rentalProperties','savingsBondRedemptions','form6252','form8814','homeSales','form8824'] as const;
export const PASSENGER_PARENT_ALLOWED_EXPENSES=['advertising','insurance','legalAndProfessional','officeExpense','supplies','utilities'] as const;
// Finite native context only: no dependent, alien, itemized or other income method.
export const PassengerNativeContextSchema=z.strictObject({
 standardDeductionFacts:z.strictObject({primaryBlind:z.literal(false),primaryCanBeClaimedAsDependent:z.literal(false),dualStatusAlien:z.literal(false),nonresidentAlien:z.literal(false),shortTaxYear:z.literal(false),primaryDeathDate:z.null(),
  spouseBlind:z.literal(false).optional(),spouseCanBeClaimedAsDependent:z.literal(false).optional(),spouseItemizes:z.literal(false).optional(),residentJointElection:z.literal(false).optional(),claimSpouseAdditionalDeduction:z.literal(false).optional(),spouseHasGrossIncome:z.literal(false).optional(),spouseFilesReturn:z.literal(false).optional()}),
 deductionElection:z.enum(['automatic','standard']),
 form1099R:z.array(z.never()).length(0),formSSA1099:z.array(z.never()).length(0),formRRB1099:z.array(z.never()).length(0),
 childTaxCredit:z.strictObject({bonaFidePuertoRicoResident:z.literal(false),puertoRicoExcludedIncome:amount.refine(v=>/^0+(?:\.0+)?$/.test(v)),form4563ExcludedIncome:amount.refine(v=>/^0+(?:\.0+)?$/.test(v)),possessionIncomeExclusion:amount.refine(v=>/^0+(?:\.0+)?$/.test(v)).optional(),nonTaxableCombatPayElection:amount.refine(v=>/^0+(?:\.0+)?$/.test(v)).optional()}).optional(),
});
export const PASSENGER_NATIVE_CONTEXT_KEYS=['standardDeductionFacts','deductionElection','form1099R','formSSA1099','formRRB1099','childTaxCredit'] as const;
export const PASSENGER_NATIVE_OTHER_INVENTORIES=[...PASSENGER_PARENT_EMPTY_ARRAYS,'form1099R','formSSA1099','formRRB1099'] as const;
export const PassengerNativeOtherSourcesSchema=z.strictObject(Object.fromEntries(PASSENGER_NATIVE_OTHER_INVENTORIES.map(k=>[k,z.strictObject({sourceReference:reference,reviewedNoneConfirmed:z.literal(true)})])));
export const PassengerAutoParentSourcesSchema=z.strictObject({
 version:z.literal('passenger-parent-v1'),sourceTaxYear:z.literal(2026),sourceReference:reference,confirmed:z.boolean().nullable(),accountHolder:z.literal('primary'),
 originalNativeContext:PassengerNativeContextSchema.optional(),nativeOtherSources:PassengerNativeOtherSourcesSchema.optional(),
 originalTaxpayer:z.record(z.string(),z.unknown()),originalBusiness:z.record(z.string(),z.unknown()),originalForm:z.record(z.string(),z.unknown()),assetIndex:z.literal(0),assetReference:reference,
 incomeWorksheetReference:reference,ledgerReference:reference,nonNecCashReceipts:amount,
 necRows:z.array(z.strictObject({index:z.number().int().min(0),originalRecord:z.record(z.string(),z.unknown()),sourceReference:reference,confirmed:z.literal(true),actualSameBusinessCashServicesConfirmed:z.literal(true)})),
 amounts:z.strictObject({grossReceipts:amount,returnsAndAllowances:amount,costOfGoodsSold:amount,otherIncome:amount,expenses:z.strictObject(Object.fromEntries(PASSENGER_PARENT_EXPENSE_KEYS.map(key=>[key,amount])) as Record<typeof PASSENGER_PARENT_EXPENSE_KEYS[number],typeof amount>)}),
 expenseClassifications:z.array(z.strictObject({category:z.enum(PASSENGER_PARENT_ALLOWED_EXPENSES),sourceReference:reference,currentCashBusinessOnlyConfirmed:z.literal(true),notCapitalizedInventoryPersonalOrDeductedElsewhereConfirmed:z.literal(true),noHealthInsuranceOrOtherLimitedDeductionConfirmed:z.literal(true)})).length(6),
 scope:z.strictObject({fullCalendarYearConfirmed:z.literal(true),domesticCashServicesConfirmed:z.literal(true),activeSoleProprietorConfirmed:z.literal(true),completeAnnualLedgerConfirmed:z.literal(true),allIncomeSourcesReviewedConfirmed:z.literal(true),noEmployeeCompensationConfirmed:z.literal(true),noOtherActiveActivitiesOrWorkingCapitalIncomeConfirmed:z.literal(true),noSalesRecaptureForeignOrDigitalBusinessConfirmed:z.literal(true),noNolSuspendedLossOrIncomeLimitedDeductionsConfirmed:z.literal(true),noOtherAssetsOrDeductionsConfirmed:z.literal(true)}),
});
export type PassengerAutoParentSources=z.infer<typeof PassengerAutoParentSourcesSchema>;
