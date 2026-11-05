/** Spec: spec/federal/schedule-c-passenger-first-year-sources.yaml. Engine-only actual parent sources. */
import {z} from 'zod';
const reference=z.string().trim().min(1).max(500);
const amount=z.string().max(100).regex(/^\d+(\.\d+)?$/);
export const PASSENGER_PARENT_EXPENSE_KEYS=[
 'advertising','amortization','badDebts','bankCharges','carAndTruck','commissionsAndFees','contractLabor','depletion','depreciation','duesAndPublications','employeeBenefitPrograms','businessInterest','freight','idcsAmortization','idcsCurrentExpensing','section179Expense','insurance','laundryAndCleaning','legalAndProfessional','managementFees','officeExpense','pensionAndProfitSharing','postage','rentOnBusinessProperty','repairsAndMaintenance','startupCostsDirectExpense','supplies','taxes','telephone','travel','meals','utilities','wages','otherExpenses',
] as const;
export const PASSENGER_PARENT_ALLOWED_EXPENSES=['advertising','insurance','legalAndProfessional','officeExpense','supplies','utilities'] as const;
export const PassengerAutoParentSourcesSchema=z.strictObject({
 version:z.literal('passenger-parent-v1'),sourceTaxYear:z.literal(2026),sourceReference:reference,confirmed:z.boolean().nullable(),accountHolder:z.literal('primary'),
 originalTaxpayer:z.record(z.string(),z.unknown()),originalBusiness:z.record(z.string(),z.unknown()),originalForm:z.record(z.string(),z.unknown()),assetIndex:z.literal(0),assetReference:reference,
 incomeWorksheetReference:reference,ledgerReference:reference,nonNecCashReceipts:amount,
 necRows:z.array(z.strictObject({index:z.number().int().min(0),originalRecord:z.record(z.string(),z.unknown()),sourceReference:reference,confirmed:z.literal(true),actualSameBusinessCashServicesConfirmed:z.literal(true)})),
 amounts:z.strictObject({grossReceipts:amount,returnsAndAllowances:amount,costOfGoodsSold:amount,otherIncome:amount,expenses:z.strictObject(Object.fromEntries(PASSENGER_PARENT_EXPENSE_KEYS.map(key=>[key,amount])) as Record<typeof PASSENGER_PARENT_EXPENSE_KEYS[number],typeof amount>)}),
 expenseClassifications:z.array(z.strictObject({category:z.enum(PASSENGER_PARENT_ALLOWED_EXPENSES),sourceReference:reference,currentCashBusinessOnlyConfirmed:z.literal(true),notCapitalizedInventoryPersonalOrDeductedElsewhereConfirmed:z.literal(true),noHealthInsuranceOrOtherLimitedDeductionConfirmed:z.literal(true)})).length(6),
 scope:z.strictObject({fullCalendarYearConfirmed:z.literal(true),domesticCashServicesConfirmed:z.literal(true),activeSoleProprietorConfirmed:z.literal(true),completeAnnualLedgerConfirmed:z.literal(true),allIncomeSourcesReviewedConfirmed:z.literal(true),noEmployeeCompensationConfirmed:z.literal(true),noOtherActiveActivitiesOrWorkingCapitalIncomeConfirmed:z.literal(true),noSalesRecaptureForeignOrDigitalBusinessConfirmed:z.literal(true),noNolSuspendedLossOrIncomeLimitedDeductionsConfirmed:z.literal(true),noOtherAssetsOrDeductionsConfirmed:z.literal(true)}),
});
export type PassengerAutoParentSources=z.infer<typeof PassengerAutoParentSourcesSchema>;
