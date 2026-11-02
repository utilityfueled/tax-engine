/** Fictional actual-source §197 fixture. No candidate output supplies the dollar oracle. */
import type {TaxYearInput} from '@/models/inputs.js';
import {scheduleCSourceFixture} from './schedule-c-source-facts.js';
export const scheduleCAmortizationProof=(year=2025)=>({
 sourceTaxYear:year,sourceReference:'Private goodwill purchase and C attribution original',sourceFactsConfirmed:true,
 fullCalendarYearConfirmed:true,allAssetsForThisScheduleCConfirmed:true,notDeductedElsewhereConfirmed:true,
 remainingOtherExpenses:'500',remainingOtherExpenseSourceReference:'Actual remaining office cleaning ledger excludes goodwill amortization',
 rows:[{assetIndex:0,sourceReference:'Private original acquired goodwill asset',sourceFactsConfirmed:true,accountHolder:'primary' as const,
 originalAsset:{description:'Acquired customer-business goodwill',amortizableAmount:'18000',dateAmortizationBegins:`${year}-07`,codeSection:'197' as const},
 acquisitionDate:`${year}-07-15`,businessStartDate:`${year}-01-01`,acquiredGoodwillForThisBusinessConfirmed:true,
 armsLengthTaxableCashPurchaseAfter1993Confirmed:true,noSelfCreatedRelatedPartyAntiChurningForeignLeaseOrDispositionConfirmed:true,fullBusinessUseConfirmed:true}],
});
export function scheduleCAmortizationFixture(year:2025|2026=2025):TaxYearInput{
 const input=scheduleCSourceFixture(year),proof=scheduleCAmortizationProof(year);
 input.form4562={taxYear:year,section179ExpenseDeduction:'0',specialDepreciationAllowance:'0',macrsCurrentYearGdsDepreciation:'0',listedPropertyDepreciation:'0',currentYearAmortization:'0',priorYearAmortization:'0',amortizableAssets:[structuredClone(proof.rows[0].originalAsset)]};
 (input.scheduleC!.sourceFacts! as unknown as Record<string,unknown>).amortization=proof;
 return input;
}
