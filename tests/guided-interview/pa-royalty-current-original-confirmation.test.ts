// Spec: spec/state/pa-royalty-current-original-confirmation.yaml.
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {copyPARoyaltyOriginals} from '@/lib/guided-royalty-sources';
import {confirmGuidedPAResidencySources,buildGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {nativeMIRoyaltyFixture} from '../fixtures/guided-pa-royalty-native';
function currentAfterActualEdit(){
 const f=nativeMIRoyaltyFixture(),state=structuredClone(f.state),royalty=state.sectionData['income-royalties'],property=royalty?.properties?.[0];
 if(!royalty||!property||!property.expenses?.[0])throw Error('Original actual receipt required');
 property.expenses[0].amountPaid='149.25';property.paTreatment=copyPARoyaltyOriginals(property,royalty.sourceTaxYear);property.paTreatment.sourceFactsConfirmed=true;
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Explicit current property originals must be constructible');
 return{...f,current:TaxYearInputSchema.parse(raw)};
}
it('explicit confirmation binds supplied current royalty originals after an actual receipt edit',()=>{
 const f=currentAfterActualEdit(),old=f.input.paResidencySources;if(!old)throw Error('Actual original residency source required');
 const before=JSON.stringify(old),history=JSON.stringify(f.filedFederalHistory);
 const confirmed=confirmGuidedPAResidencySources(f.current,old);
 expect(confirmed.royaltySources?.originalPropertySources).toEqual(f.current.royaltyPropertySources);
 expect(confirmed.royaltySources?.originalPropertySources).not.toEqual(old.royaltySources?.originalPropertySources);
 expect(buildGuidedPAResidencySources(f.current,confirmed)).toEqual(confirmed);
 expect(JSON.stringify(old)).toBe(before);expect(JSON.stringify(f.filedFederalHistory)).toBe(history);
 expect(f.filedFederalHistory.filedFederalAGI).toBe('211001');expect(f.filedFederalHistory.originalGuidedPropertySources.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('49.25');
});
it('read cannot silently follow changed current property originals',()=>{
 const f=currentAfterActualEdit(),old=f.input.paResidencySources;if(!old)throw Error('Actual residency source required');const before=JSON.stringify(old);
 expect(()=>buildGuidedPAResidencySources(f.current,old)).toThrow(/property source confirmation is missing or stale/);expect(JSON.stringify(old)).toBe(before);
});
it.each(['missingProperty','missingOriginal','unknownClassification','falseNested']as const)('explicit binding cannot invent or repair unknown current source facts %s',kind=>{
 const f=currentAfterActualEdit(),old=structuredClone(f.input.paResidencySources);if(!old)throw Error('Actual residency source required');
 if(kind==='missingProperty')Reflect.deleteProperty(f.current,'royaltyPropertySources');
 if(kind==='missingOriginal')f.current.form1099Misc=[];
 if(kind==='unknownClassification'){const pa=f.current.royaltyPropertySources?.properties?.[0]?.paTreatment;if(!pa)throw Error('Current PA classification required');Reflect.set(pa,'ownerFullYearPAResident',null);}
 if(kind==='falseNested'){if(!old.royaltySources)throw Error('Actual royalty source required');old.royaltySources.sourceFactsConfirmed=false;}
 expect(()=>confirmGuidedPAResidencySources(f.current,old)).toThrow();
});
it('unchanged current originals remain exact on explicit confirmation',()=>{
 const f=nativeMIRoyaltyFixture(),old=f.input.paResidencySources;if(!old)throw Error('Actual residency source required');const before=JSON.stringify(old),history=JSON.stringify(f.filedFederalHistory);
 expect(confirmGuidedPAResidencySources(f.input,old)).toEqual(old);expect(JSON.stringify(old)).toBe(before);expect(JSON.stringify(f.filedFederalHistory)).toBe(history);
});
