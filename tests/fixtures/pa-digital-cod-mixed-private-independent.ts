/** NEW explicitly fictional mixed annual source records, not the predecessor
 * deduction-year carryover case. Its immutable original diagnostic remains
 * archived. This separate case includes the personal300 in federal ordinary
 * income, seeks no exclusion and has no insolvency/Form982/NOL proof packet.
 * Actual annual election here is independently documented credit
 * under904j with complete zero regular/AMT carryover records through2024.
 */
import {TaxYearInputSchema}from '@/models/inputs';
import {PAOrdinaryReturnFactsSchema}from '@/models/pa-ordinary-return-facts';
import {PAOrdinaryReturnCompletionSourcesSchema}from '@/models/pa-ordinary-return-completion';
import {calculatePAOrdinaryReturn}from '@/engine/state/pa-ordinary-return';
import {snapshotPAOrdinaryReturnOriginals}from '@/engine/state/pa-ordinary-return-facts';
import {calculateFederalTax}from '@/engine/federal';
import {paPersonalCodForeignFixture}from './pa-personal-debt-foreign-sources';
import {paOrdinaryDigitalFixture}from './pa-ordinary-digital-sources';
export const mixedPrivateKeys=['legalSourceReference','useSourceReference','receiptNumber','deductionSourceReference','relationshipSourceReference','propertySourceReference']as const;
export type MixedPrivateKey=typeof mixedPrivateKeys[number];
export function mixedPrivateDigitalFixture(keys:readonly MixedPrivateKey[]){
 const f=paPersonalCodForeignFixture(),d=paOrdinaryDigitalFixture(),originalTax=f.input.form1099Int[0];
 // Separate actual fictional federal-included debt case: never a changed
 // reading of the predecessor's insolvency election or later-attribute history.
 delete f.input.codExclusion;delete f.input.form982NolSources;delete f.input.form982AttributeSources;delete f.input.netOperatingLoss;
 Object.assign(f.personalDebtDischarges[0].qualification,{noCollateralOfAnyKindConfirmed:true});
 f.personalDebtDischarges[0].qualification.propertySourceReference='NEW fictional complete personal unsecured loan contract and no-collateral property records, no federal exclusion sought';
 if(!originalTax)throw Error('Actual fictional foreign bank original missing');
 // Independently authored new annual election/history. No known carryover
 // record from the predecessor is discarded or claimed to have changed.
 f.input.foreignTaxElection={taxYear:2025,election:'credit',accountingMethod:'paid',priorAccruedCreditElection:false,sourceReference:'NEW fictional mixed annual904j election original2025 return, never predecessor deduction election',sourceFactsConfirmed:true,allQualifiedForeignTaxesIncludedConfirmed:true,noUnusedCreditCarryoversConfirmed:true,noRedeterminationsConfirmed:true,
  creditWithoutForm1116:{electionConfirmed:true,filingContext:'original_return',allForeignGrossIncomePassiveConfirmed:true,allForeignIncomeOnQualifiedPayeeStatementsConfirmed:true,noRequiredTaxReductionsConfirmed:true,sourceFactsConfirmed:true,sourceReference:'NEW fictional complete2025 passive qualified-payee100credit worksheet and all prior return/account histories',taxpayers:[{owner:'primary',status:'us_citizen',sourceReference:'NEW fictional mixed Jane citizenship original'}],carryoverHistoryConfirmed:true,adjustedThroughTaxYear:2024,filingHistory:'continuous_individual',carryovers:[],amtCarryovers:[]},
  sources:[{sourceId:'form1099Int:0',payerName:originalTax.payer,payerTin:originalTax.payerTin,accountReference:originalTax.accountReference,owner:'primary',foreignCountry:'Canada',jurisdictionType:'foreign_country',reportedTaxAmount:'100',qualifiedIncomeTaxConfirmed:true,taxOnExcludedIncome:'0',taxDeductedElsewhere:'0',investmentAllocableAmount:'0',payments:[{date:'2025-09-15',amountUsd:'100'}],sourceReference:'NEW fictional actual original Canada100USD payment and bank5000interest payee statement',creditEligibility:{passiveIncomeConfirmed:true,legalTaxLiabilityConfirmed:true,noRefundOrSubsidyConfirmed:true,holdingPeriodRequirementMetConfirmed:true,noRelatedPaymentsConfirmed:true,noDisallowedCountryOrBoycottConfirmed:true}}]};
 const secrets=keys.map(key=>'PRIVATE-MIXED-ACTUAL-'+key+'-938472');
 keys.forEach((key,index)=>{if(key==='receiptNumber')f.foreignBankTaxSources[0].payments[0].receiptNumber=secrets[index];else f.personalDebtDischarges[0].qualification[key]=secrets[index];});
 const statement=structuredClone(d.input.form1099DA[0]);statement.transactions[0].digitalAssetName='Complete mixed actual safe prefix '+secrets.join(' ')+' COMPLETE MIXED ACTUAL SAFE END';
 f.input.form1099DA=[statement];Object.assign(f.sources,{digitalSources:{...structuredClone(d.digital),statements:[{originalIndex:0,sourceReference:'NEW fictional Jane current actual DA original and remittance proof',sourceFactsConfirmed:true,original:structuredClone(statement),actualPaymentToPAConfirmed:false,notRefundedByPayerConfirmed:true}]}});
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.facts.disposition.refundRequested='929';f.completion.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 const input=TaxYearInputSchema.parse({...f.input,paOrdinaryReturnFacts:PAOrdinaryReturnFactsSchema.parse(f.facts),paOrdinaryReturnCompletionSources:PAOrdinaryReturnCompletionSourcesSchema.parse(f.completion)});
 const ordinary=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};
 return {input,ordinary,result,secrets};
}
