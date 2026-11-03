/** Entirely fictional separately supplied MI agency/payment originals. No real agency result is asserted. */
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {paOrdinaryRoyaltyFixture} from './pa-ordinary-royalty-sources';
export function paRoyaltyTaxRefundFixture(){
 const f=paOrdinaryRoyaltyFixture(),t=f.input.taxpayer.primary;
 const identity={sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,state:'MI',sourceReference:'Fictional private original Michigan account record'};
 const refund={sourceTaxYear:2025,sourceReference:'Fictional complete MI copyright settled account packet',sourceFactsConfirmed:true,completeThroughDate:'2026-03-20',
  owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},originalFederalSources:snapshotPAOrdinaryReturnOriginals(f.input),originalPAResidencySources:structuredClone(f.residency),originalPAFacts:structuredClone(f.facts),
  allMIIncomeTaxOriginalsReviewedConfirmed:true,noOtherMIIncomeCreditsPaymentsOrAssessmentsConfirmed:true,
  statements:[{originalIndex:0,sourceReference:'Fictional actual original royalty remittance and use record',sourceFactsConfirmed:true,originalStatement:structuredClone(f.input.form1099Misc[0]),
   copyrightUse:{sourceReference:'Fictional complete publisher use and commercial domicile ledger',propertyId:'copyright-1',publisherName:'Fictional Pennsylvania Publisher',publicationOriginState:'PA',publicationFrom:'2025-01-01',publicationThrough:'2025-12-31',allPublicationUsesReviewedConfirmed:true,actualPublicationOriginConfirmed:true,nonbusinessCopyrightConfirmed:true,ownerCommercialDomicileState:'PA',michiganSourceGross:'0',outsideMichiganGross:'12000.25'},
   withholdingOriginal:{...identity,date:'2025-12-31',amount:'80.20',confirmationNumber:'Fictional-MI-royalty-remittance80.20',actuallyRemittedConfirmed:true}}],
  filedReturn:{...identity,returnId:'Fictional-MI2025-original',returnKind:'original',filingStatus:'single',residency:'nonresident',filedOn:'2026-03-01',completeReturnScheduleWAndNRConfirmed:true,allIncomeAndAdjustmentsReviewedConfirmed:true,finalTax:'0',reportedWithholding:'80',totalPayments:'80',overpayment:'80',refundRequested:'80',michiganSourceIncome:'0',noOtherPaymentsCreditsOffsetsOrTransfersConfirmed:true},
  writtenClaim:{...identity,applicationId:'Fictional-MI-full80.20-written-demand',submittedOn:'2026-03-02',amountRequested:'80.20',fullOriginalPaymentDemandConfirmed:true,actuallySubmittedConfirmed:true},
  agencyAward:{...identity,awardId:'Fictional-MI-exact80.20-determination',issuedOn:'2026-03-10',applicationId:'Fictional-MI-full80.20-written-demand',originalReportedStateIncome:'12000.25',determinedMichiganSourceIncome:'0',determinationReason:'copyright_publication_outside_michigan',finalTaxDetermined:'0',refundAwarded:'80.20',printedReturnToExactAwardReconciledConfirmed:true,actualAgencyDeterminationConfirmed:true},
  refund:{...identity,postedOn:'2026-03-11',receivedOn:'2026-03-12',amount:'80.20',confirmationNumber:'Fictional-MI-received80.20',actuallyReceivedConfirmed:true},
  account:{...identity,completeThroughDate:'2026-03-20',allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed:true,noAmendmentAssessmentOrPendingAdjustmentConfirmed:true,netTaxPaymentsReported:'0',unpaidTaxReported:'0',overpaymentOutstandingReported:'0'},
 };
 const completion={...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedRoyaltySources:refund}};
 return {...f,refund,completion};
}
