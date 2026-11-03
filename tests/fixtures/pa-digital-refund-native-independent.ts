/** Independently supplied fictional boundary sources, never user facts or production defaults. */
import {nativeRefundFixture} from './pa-digital-refund-native';
import {confirmGuidedPAOrdinaryDigitalSources} from '@/lib/guided-pa-ordinary-digital-sources';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import type {PADigitalTaxRefundSources} from '@/models/pa-digital-tax-refund-sources';
export function independentRefundThreshold(exact:'1.00'|'0.99',application:boolean){
 const seed=nativeRefundFixture('1.30'),input=structuredClone(seed.input),statement=input.form1099DA[2],residency=input.paResidencySources;
 if(!statement||!residency?.digitalSources)throw Error('Independent explicit fictional digital originals required');
 statement.stateWithheld=exact;
 const digital=confirmGuidedPAOrdinaryDigitalSources(input,residency.digitalSources,'resident');
 input.paResidencySources=confirmGuidedPAResidencySources(input,{...residency,digitalSources:digital});
 const facts=confirmGuidedPAOrdinaryReturnFacts(input,seed.facts),raw:PADigitalTaxRefundSources=structuredClone(seed.records),remittance=raw.statements[0];
 if(!remittance)throw Error('Independent explicit fictional remittance required');
 remittance.withholdingOriginal.amount=exact;remittance.withholdingOriginal.confirmationNumber='Independent actual boundary remittance '+exact;
 // Both independent actual originals report whole-dollar1; received agency refund retains exact cents.
 for(const key of ['reportedWithholding','totalPayments','overpayment','refundRequested']as const)raw.filedReturn[key]='1';
 raw.specialWrittenApplication=application?{sourceTaxYear:2025,accountName:'Jordan Example',accountSsn:'111-22-3333',state:'VA',sourceReference:'Independent fictional signed written boundary application original',applicationId:'Independent-special-application-'+exact,submittedOn:'2026-02-16',amountRequested:exact,actuallySubmittedConfirmed:true}:null;
 raw.agencyAward.applicationId=raw.specialWrittenApplication?.applicationId??'';raw.agencyAward.refundAwarded=exact;raw.refund.amount=exact;raw.refund.confirmationNumber='Independent actual boundary refund '+exact;
 return {input,facts,raw};
}
