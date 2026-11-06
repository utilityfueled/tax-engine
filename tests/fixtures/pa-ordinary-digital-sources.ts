/** Explicit fictional known2025 sources; no application defaults. */
import {Form1099DASchema,type TaxYearInput} from '@/models/inputs.js';
import {paOrdinaryReturnFixture} from './pa-ordinary-return.js';
import {actualDigitalAssetSource} from './digital-asset-sources.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
export function paOrdinaryDigitalFixture(){
 const f=paOrdinaryReturnFixture();
 f.input.form1099Int=[];f.input.paResidencySources.interest=[];
 f.input.w2s[0].stateTaxWithheld='0';f.input.paResidencySources.wages[0].original=structuredClone(f.input.w2s[0]);
 const statement:TaxYearInput['form1099DA'][number]=Form1099DASchema.parse(structuredClone(actualDigitalAssetSource));
 Object.assign(statement.transactions[0],{paCostBasis:'80.24',paBasisSourceReference:'Fictional actual Pennsylvania acquisition ledger',paBasisFactsConfirmed:true,paTransactionForProfitConfirmed:true});
 f.input.form1099DA=[statement];
 const digital={sourceTaxYear:2025,sourceReference:'Fictional complete original PA capital source records',sourceFactsConfirmed:true,
  allOriginalDigitalStatementsIncludedConfirmed:true,noOtherCapitalAdjustmentsConfirmed:true,
  statements:[{originalIndex:0,sourceReference:'Fictional current original DA and actual remittance records',sourceFactsConfirmed:true,original:structuredClone(statement),actualPaymentToPAConfirmed:false,notRefundedByPayerConfirmed:true}]};
 const residency=Object.assign(f.input.paResidencySources,{digitalSources:digital});
 f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'1536',sourceReference:'Fictional exact April15 expected principal'};
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 return {...f,digital,residency};
}
export function refreshDigitalFixtureOriginals(f:ReturnType<typeof paOrdinaryDigitalFixture>){
 f.digital.statements=f.input.form1099DA.map((original,originalIndex)=>({originalIndex,sourceReference:'Fictional original '+originalIndex,sourceFactsConfirmed:true,original:structuredClone(original),actualPaymentToPAConfirmed:original.stateTaxReporting!=='none',notRefundedByPayerConfirmed:true}));
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
}
