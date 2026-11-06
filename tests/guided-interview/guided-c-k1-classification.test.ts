// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-guide.
import {expect,it} from 'vitest';
import {buildNecInputs,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateK1LossSources} from '@/lib/guided-k1-qbi-sources';
import {emptyNecEntry,updateSectionData} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {cK1NecGuidedFixture,cK1GuidedFixture,cK1OrdinaryFixture} from '../fixtures/c-k1-ordinary.js';
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

it('builds actual NEC guide parity and invalidates gross preserving source edits',()=>{
 const state=cK1NecGuidedFixture(),before=JSON.stringify(state),input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();expect(input!.scheduleC!.grossReceipts).toBe('40000');expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalTax.toFixed()).toBe('41851');expect(JSON.stringify(state)).toBe(before);
 const business=structuredClone(state.sectionData['income-self-employment']!);business.necEntries[0].nonemployeeCompensation='25001.10';business.manualGrossReceipts='14998.90';const edited=updateSectionData(state,'income-self-employment',business);expect(edited.sectionData.adjustments!.k1LossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(edited)).toBeNull();
 const unknown=cK1NecGuidedFixture();unknown.sectionData['income-self-employment']!.necEntries[0].sourceTaxYear='';expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
 const missingZero=cK1NecGuidedFixture();missingZero.sectionData['income-self-employment']!.necEntries[0].federalWithheld='';expect(buildTaxInputFromGuidedData(missingZero)).toBeNull();
});

it('preserves existing original NEC converter validation after sharing source projection',()=>{
 const state=cK1NecGuidedFixture(),row=state.sectionData['income-self-employment']!.necEntries[0];expect(()=>buildNecInputs([{...row,federalWithheld:'not money'}])).toThrow();
});

it('maps actual entered NEC sources while preserving entirely blank preceding cards',()=>{
 const state=cK1NecGuidedFixture();state.sectionData['income-self-employment']!.necEntries.unshift(structuredClone(emptyNecEntry));const before=JSON.stringify(state),input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();expect(input!.form1099Nec).toHaveLength(1);expect(input!.form1099Nec[0].nonemployeeCompensation).toBe('25000.10');expect(input!.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].necSourceId).toBe('form1099Nec:0');expect(input!.scheduleC!.grossReceipts).toBe('40000');expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalTax.toFixed()).toBe('41851');expect(JSON.stringify(state)).toBe(before);
});
