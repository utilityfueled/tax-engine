/** Explicit fictional composite; literal expected outcomes frozen separately before runtime. */
import {TaxYearInputSchema} from '@/models/inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {paOrdinaryEmployeeReturnFixture} from './pa-ordinary-employee-sources';
import {paOrdinaryBusinessFixture,fictionalBusinessSources} from './pa-ordinary-business-sources';
import {paOrdinaryOIDFixture} from './pa-ordinary-oid-sources';
export function mixedEmployeeFixture(status:'resident'|'part_year'|'nonresident'){
 const employee=paOrdinaryEmployeeReturnFixture(status),business=paOrdinaryBusinessFixture(status),oid=paOrdinaryOIDFixture(status);
 const staged=TaxYearInputSchema.parse({...employee.input,scheduleC:business.input.scheduleC,form1099Nec:business.input.form1099Nec,form1099OID:oid.input.form1099OID,form1099Misc:oid.input.form1099Misc});
 const nec=staged.form1099Nec[0];if(!nec)throw Error('Explicit fictional original NEC required');
 // Explicit separate fictional remittance original; no product default or previousfixture mutation.
 nec.stateWithheld='0.25';
 const books=fictionalBusinessSources(staged),investment=structuredClone(oid.oidAndMiscSources);
 const input=TaxYearInputSchema.parse({...staged,paResidencySources:{...employee.residency,businesses:[books],oidAndMiscSources:investment}});
 const facts=structuredClone(employee.facts),completion=structuredClone(employee.sources);
 facts.sourceReference='Explicit fictional composite current annual source facts';
 facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:status==='resident'?'2737':'1007',sourceReference:'Explicit fictional composite principal payment election'};
 facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);completion.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);
 return {input,facts,completion};
}
