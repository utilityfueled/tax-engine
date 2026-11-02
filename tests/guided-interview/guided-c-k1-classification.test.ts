// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-guide.
import {expect,it} from 'vitest';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateK1LossSources} from '@/lib/guided-k1-qbi-sources';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {cK1GuidedFixture,cK1OrdinaryFixture} from '../fixtures/c-k1-ordinary.js';
it('builds actual guide C and K1 canonical parity and preserves unknown proof',()=>{
 const state=cK1GuidedFixture(),before=JSON.stringify(state),raw=buildTaxInputFromGuidedData(state);expect(raw).not.toBeNull();
 const r=calculateFederalTax(TaxYearInputSchema.parse(raw)),typed=calculateFederalTax(cK1OrdinaryFixture());expect(r.totalTax.toFixed()).toBe('41851');expect(r.form461!.line14NetBusinessAmount.toFixed()).toBe(typed.form461!.line14NetBusinessAmount.toFixed());expect(r.agi.toFixed()).toBe(typed.agi.toFixed());expect(JSON.stringify(state)).toBe(before);
 const unknown=structuredClone(state);delete unknown.sectionData.adjustments!.k1LossSources!.form461Classification!.scheduleCSource;expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
 const data=state.sectionData.adjustments!.k1LossSources!,edited=updateK1LossSources(data,{form461Classification:{...data.form461Classification,scheduleCSource:{...data.form461Classification!.scheduleCSource,sourceReference:'Different actual source'}}});expect(edited.form461Classification!.sourceFactsConfirmed).toBeNull();expect(edited.form461Classification!.scheduleCSource!.sourceFactsConfirmed).toBeNull();
});

it('invalidates C source confirmation on actual guide business edits and accepts confirmed blank original lines',()=>{
 const state=cK1GuidedFixture(),business=state.sectionData['income-self-employment']!;
 const changed=updateSectionData(state,'income-self-employment',{...business,businessFacts:{...business.businessFacts!,businessName:'Changed actual name'}});
 expect(changed.sectionData.adjustments!.k1LossSources!.form461Classification!.scheduleCSource!.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(changed)).toBeNull();
 const blank=cK1GuidedFixture(),facts=blank.sectionData['income-self-employment']!.businessFacts!,proof=blank.sectionData.adjustments!.k1LossSources!.form461Classification!.scheduleCSource!;
 delete facts.businessName;delete facts.ein;Object.assign(proof,{businessNameStatus:'blank_original',businessEINStatus:'not_issued'});delete proof.businessName;delete proof.businessEIN;
 const input=buildTaxInputFromGuidedData(blank);expect(input).not.toBeNull();expect(input?.scheduleC?.businessName).toBeUndefined();expect(input?.scheduleC?.ein).toBeUndefined();expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalTax.toFixed()).toBe('41851');
});

it('rejects an actual nonzero NEC composition in the guide adapter without discarding it',()=>{
 const state=cK1GuidedFixture();state.sectionData['income-self-employment']!.necEntries=[{payerName:'Different actual business payer',payerTin:'12-4444444',accountHolder:'primary',nonemployeeCompensation:'100000',federalWithheld:'0',stateTaxReporting:'none',state:'',stateIncome:'0',stateWithheld:'0'}];
 const before=JSON.stringify(state);expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(JSON.stringify(state)).toBe(before);
});
