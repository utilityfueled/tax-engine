/** Independently explicit fictional UI records, not established user facts. Core originals stay unchanged. */
import {TaxYearInputSchema}from '@/models/inputs';
import {PAResidencySourcesSchema}from '@/models/pa-residency';
import {paPersonalCodForeignFixture}from './pa-personal-debt-foreign-sources';
export function paGuidedPersonalDebtForeignFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paPersonalCodForeignFixture(status),input=TaxYearInputSchema.parse(f.input),residency=PAResidencySourcesSchema.parse(f.sources);
 // Separate fictional PA source review explicitly establishes no collateral, in addition to retained federal evidence.
 if(!residency.personalDebtDischarges?.[0])throw Error('Missing explicit fictional actual personal discharge');
 residency.personalDebtDischarges[0].qualification.noCollateralOfAnyKindConfirmed=true;
 const draft={personalDebtDischarges:structuredClone(residency.personalDebtDischarges),foreignBankTaxSources:structuredClone(residency.foreignBankTaxSources??[])};
 return {...f,input,residency,draft};
}
