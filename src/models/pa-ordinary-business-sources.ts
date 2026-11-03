/** Private actual cash-service business source records. No source defaults or inferred zero. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const original=z.record(z.string(),z.unknown()).optional();
const expenseCategory=z.enum(['advertising','amortization','badDebts','bankCharges','carAndTruck','commissionsAndFees','contractLabor','depletion','depreciation','duesAndPublications','employeeBenefitPrograms','businessInterest','freight','idcsAmortization','idcsCurrentExpensing','section179Expense','insurance','laundryAndCleaning','legalAndProfessional','managementFees','officeExpense','pensionAndProfitSharing','postage','rentOnBusinessProperty','repairsAndMaintenance','startupCostsDirectExpense','supplies','taxes','telephone','travel','meals','utilities','wages','otherExpenses']);
export const PAOrdinaryBusinessSourceSchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 owner:z.object({accountHolder:z.enum(['','primary','spouse']),originalTaxpayer:z.object({firstName:z.string(),lastName:z.string(),ssn:z.string()}).strict().optional()}).strict(),
 businessIdentity:z.object({name:z.string(),activity:z.string(),businessCode:z.string(),einStatus:z.enum(['','issued','not_issued']),ein:z.string(),sourceReference:z.string()}).strict(),
 originalScheduleC:original,necOriginals:z.array(z.object({originalIndex:z.number().int().nullable(),sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,currentUncorrectedNonvoidOriginalConfirmed:answer,allOriginalBoxesKnownConfirmed:answer,original}).strict()),
 commercialEnterpriseConfirmed:answer,cashMethodConsistentConfirmed:answer,allIncomeAndExpenseSourcesCompleteConfirmed:answer,noInventoryCOGSConfirmed:answer,noOtherBusinessIncomeConfirmed:answer,noHomeOfficeOrOtherAdjustmentsConfirmed:answer,
 allocation:z.object({method:z.enum(['','separate_books','nrh_apportionment']),sourceReference:z.string(),separateBooksCompleteConfirmed:answer,independentProfitCentersConfirmed:answer,noIntercenterTransfersConfirmed:answer,freeOutsidePurchasingConfirmed:answer,noGeographicCompetitionConfirmed:answer,liabilitiesCompleteConfirmed:answer,
  locations:z.array(z.object({locationId:z.string(),sourceReference:z.string(),address:z.string(),state:z.string(),from:z.string(),through:z.string(),systematicRegularOperationsConfirmed:answer}).strict()),
 }).strict(),
 incomeReceipts:z.array(z.object({receiptId:z.string(),sourceReference:z.string(),transactionReference:z.string(),receivedOn:z.string(),serviceFrom:z.string(),serviceThrough:z.string(),locationId:z.string(),originalNECIndex:z.number().int().nullable(),amount:z.string(),invoiceNumber:z.string(),invoiceDate:z.string(),customerName:z.string(),cashbookRecordReference:z.string()}).strict()),
 manualCashbook:z.object({status:z.enum(['unknown','known_none','actual_receipts']),sourceReference:z.string()}).strict(),
 customerRefunds:z.array(z.object({refundId:z.string(),receiptId:z.string(),paidOn:z.string(),amount:z.string(),sourceReference:z.string(),transactionReference:z.string()}).strict()),
 expenseCategories:z.record(z.string(),z.object({status:z.enum(['unknown','known_none','receipts']),sourceReference:z.string()}).strict()),
 expenseReceipts:z.array(z.object({receiptId:z.string(),sourceReference:z.string(),transactionReference:z.string(),vendorName:z.string(),invoiceNumber:z.string(),lineReference:z.string(),paidOn:z.string(),benefitFrom:z.string(),benefitThrough:z.string(),locationId:z.string(),category:expenseCategory,description:z.string(),amountPaid:z.string(),businessAmount:z.string(),personalAmount:z.string(),allocationSourceReference:z.string(),ordinaryActualReasonableNecessaryConfirmed:answer,noncapitalCurrentCostConfirmed:answer,notOwnerBenefitOrIncomeTaxConfirmed:answer,actualCostNotPerDiemConfirmed:answer,noResidentialUtilityUseConfirmed:answer}).strict()),
 expenseRefunds:z.array(z.object({refundId:z.string(),receiptId:z.string(),paidOn:z.string(),businessAmount:z.string(),personalAmount:z.string(),sourceReference:z.string(),transactionReference:z.string()}).strict()),
 lossHistory:z.object({status:z.enum(['unknown','not_needed','two_profitable_years']),sourceReference:z.string(),priorProfits:z.array(z.object({taxYear:z.number().int(),netProfit:z.string(),accountName:z.string(),accountSsn:z.string(),businessActivity:z.string(),sourceReference:z.string()}).strict())}).strict(),
}).strict();
export type PAOrdinaryBusinessSource=z.infer<typeof PAOrdinaryBusinessSourceSchema>;
