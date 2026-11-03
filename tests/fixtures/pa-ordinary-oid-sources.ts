/** Explicit fictional originals; all literal answers precede candidate execution. */
import { TaxYearInputSchema } from '@/models/inputs.js';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts.js';
import { paOrdinaryReturnFixture } from './pa-ordinary-return.js';

export function paOrdinaryOIDFixture(status: 'resident'|'part_year'|'nonresident' = 'resident', kind: 'treasury'|'taxable' = 'treasury') {
  const {input: originalInput, facts, sources: completion} = paOrdinaryReturnFixture(status);
  const oid = {
    payer: 'Explicit fictional original broker', payerTin: '12-3456789', accountHolder: 'primary',
    sourceId: 'fictional-oid-original-1', taxYear: 2025, sourceFormRevision: '2024-01',
    sourceFactsConfirmed: true, recipientAmountsConfirmed: true, obligationType: kind, inflationIndexed: false,
    description: 'Fictional original Treasury note identity A', originalIssueDiscount: kind === 'taxable' ? '1000' : '0',
    otherPeriodicInterest: '0', earlyWithdrawalPenalty: '0', federalWithheld: '0', marketDiscount: '0', acquisitionPremium: '0',
    treasuryOID: kind === 'treasury' ? '1000' : '0', investmentExpenses: '0', bondPremium: '0', taxExemptOID: '0',
    stateWithholding: [{state:'PA',statePayerId:'actual-original-state-id',stateWithheld:'0.10'}],
    oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false,
  };
  const misc = {
    taxYear:2025,sourceId:'fictional-erroneous-withholding-original',accountReference:'private-source-account',sourceFormRevision:'2025-04',
    payer:'Separate actual payer',payerTin:'98-7654321',accountHolder:'primary',rents:'0',royalties:'0',otherIncome:'0',
    federalWithheld:'0',fishingBoatProceeds:'0',medicalPayments:'0',directSales:false,substitutePayments:'0',cropInsurance:'0',
    grossAttorneyProceeds:'0',fishPurchasedForResale:'0',section409ADeferrals:'0',fatcaFilingRequirement:false,
    excessGoldenParachute:'0',nonqualifiedDeferredComp:'0',stateWithheld:'0.20',state:'PA',payerStateId:'actual-misc-state-id',stateIncome:'0',
  };
  const input = TaxYearInputSchema.parse({...originalInput,form1099OID:[oid],form1099Misc:[misc]});
  const confirmation = {sourceReference:'Fictional actual payer remittance account receipt',actualPaymentToPAConfirmed:true,notRefundedByPayerConfirmed:true};
  const oidAndMiscSources = {
    sourceTaxYear:2025,sourceReference:'Fictional complete personal investment originals',sourceFactsConfirmed:true,
    owner:{accountHolder:'primary',originalTaxpayer:{firstName:originalInput.taxpayer.primary.firstName,lastName:originalInput.taxpayer.primary.lastName,ssn:originalInput.taxpayer.primary.ssn}},
    oid:[{originalIndex:0,sourceTaxYear:2025,sourceReference:'Actual fictional OID original',sourceFactsConfirmed:true,
      original:structuredClone(input.form1099OID[0]),currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,
      personalInvestmentOnlyConfirmed:true,notNomineeOrTrustConfirmed:true,
      classification:kind === 'treasury' ? 'direct_us_treasury' : 'ordinary_taxable',
      instrument:{sourceReference:'Fictional original purchase and issuer record',securityId:'FICTIONAL-NOTE-1',issuerName:kind === 'treasury' ? 'United States Treasury' : 'Fictional taxable company',
        issuedOn:'2023-01-15',maturesOn:'2033-01-15',directLegalOwnershipConfirmed:true,usTreasuryDirectObligationConfirmed:kind === 'treasury',stripped:false,guaranteedAgencyOnly:false},
      accruals:[{from:'2025-01-01',through:'2025-06-30',oid:'700',coupon:'0',sourceReference:'Fictional actual first-period accrual'},
        {from:'2025-07-01',through:'2025-12-31',oid:'300',coupon:'0',sourceReference:'Fictional actual second-period accrual'}],
      withholdingConfirmation:structuredClone(confirmation)}],
    miscWithholding:[{originalIndex:0,sourceTaxYear:2025,sourceReference:'Actual fictional zero-income erroneous-withholding MISC',sourceFactsConfirmed:true,
      original:structuredClone(input.form1099Misc[0]),currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,
      allIncomeBoxesKnownZeroConfirmed:true,withholdingConfirmation:structuredClone(confirmation)}],
  };
  if(!originalInput.paResidencySources)throw new Error('Fixture actual residency source missing');
  const sources = {...structuredClone(originalInput.paResidencySources),oidAndMiscSources};
  const ordinary = {...structuredClone(facts),originalFederalSources:snapshotPAOrdinaryReturnOriginals(input)};
  input.paResidencySources = sources;
  completion.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);
  return {input,sources,oidAndMiscSources,facts:ordinary,completion};
}
export function refreshPAOIDOriginals(f: ReturnType<typeof paOrdinaryOIDFixture>) {
  f.oidAndMiscSources.oid.forEach(row=>{row.original=structuredClone(f.input.form1099OID[row.originalIndex]);});
  f.oidAndMiscSources.miscWithholding.forEach(row=>{row.original=structuredClone(f.input.form1099Misc[row.originalIndex]);});
  f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
  f.completion.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
  return f;
}
