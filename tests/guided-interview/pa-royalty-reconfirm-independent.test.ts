// Spec: spec/state/pa-royalty-reconfirm-independent.yaml. Distinct technical review.
import {expect,it} from 'vitest';
import {confirmGuidedPAResidencySources,buildGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {nativeMIRoyaltyFixture} from '../fixtures/guided-pa-royalty-native';
function actual<T>(value:T|null|undefined):T{if(value==null)throw Error('Independent fixture requires actual source');return value;}
function source(f:ReturnType<typeof nativeMIRoyaltyFixture>){return actual(f.input.paResidencySources);}
function royalty(f:ReturnType<typeof nativeMIRoyaltyFixture>){return actual(source(f).royaltySources);}

it('explicit reconfirmation binds current receipt sources while preserving filed historical originals',()=>{
 const old=nativeMIRoyaltyFixture(),current=nativeMIRoyaltyFixture(true),draft=source(old);
 const inputBefore=JSON.stringify(current.input),draftBefore=JSON.stringify(draft),historyBefore=JSON.stringify(old.filedFederalHistory);
 expect(calculatePAResidencySources(old.input,draft).taxBeforeCredits.toFixed()).toBe('6478');
 expect(()=>buildGuidedPAResidencySources(current.input,draft)).toThrow(/property source confirmation is missing or stale/);
 const confirmed=confirmGuidedPAResidencySources(current.input,draft),result=calculatePAResidencySources(current.input,confirmed);
 expect(result.taxBeforeCredits.toFixed()).toBe('6475');expect(result.royaltySources?.reportedIncome.toFixed()).toBe('10900');
 expect(confirmed.royaltySources?.originalPropertySources).toEqual(current.input.royaltyPropertySources);
 expect(confirmed.royaltySources?.originalPropertySources).not.toBe(current.input.royaltyPropertySources);
 expect(confirmed.royaltySources?.originals).not.toBe(royalty(old).originals);
 const oldProof=actual(royalty(old).originals[0]),newProof=actual(confirmed.royaltySources?.originals[0]);
 const{original:_oldOriginal,...oldReview}=oldProof,{original:_currentOriginal,...currentReview}=newProof;
 expect(currentReview).toEqual(oldReview);expect(newProof.original).toEqual(current.input.form1099Misc[0]);expect(newProof.original).not.toBe(current.input.form1099Misc[0]);
 expect(buildGuidedPAResidencySources(current.input,confirmed)).toEqual(confirmed);
 expect(JSON.stringify(current.input)).toBe(inputBefore);expect(JSON.stringify(draft)).toBe(draftBefore);expect(JSON.stringify(old.filedFederalHistory)).toBe(historyBefore);
 expect(old.filedFederalHistory.filedFederalAGI).toBe('211001');expect(old.filedFederalHistory.originalGuidedPropertySources.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('49.25');
 expect(current.input.royaltyPropertySources?.properties?.[0]?.expenses?.[0]?.amountPaid).toBe('149.25');
});
it('same cash current MISC identity changes require explicit original rebinding without aliasing',()=>{
 const f=nativeMIRoyaltyFixture(),draft=structuredClone(source(f)),input=structuredClone(f.input),currentOriginal=actual(input.form1099Misc[0]);
 currentOriginal.payerStateId='Independently supplied corrected actual payer-state identifier';
 const beforeInput=JSON.stringify(input),beforeDraft=JSON.stringify(draft),beforeHistory=JSON.stringify(f.filedFederalHistory);
 expect(()=>buildGuidedPAResidencySources(input,draft)).toThrow(/complete current distinct original confirmation/);
 const confirmed=confirmGuidedPAResidencySources(input,draft),copy=actual(confirmed.royaltySources?.originals[0]);
 expect(copy.original).toEqual(currentOriginal);expect(copy.original).not.toBe(currentOriginal);
 expect(calculatePAResidencySources(input,confirmed).taxBeforeCredits.toFixed()).toBe('6478');
 expect(JSON.stringify(input)).toBe(beforeInput);expect(JSON.stringify(draft)).toBe(beforeDraft);expect(JSON.stringify(f.filedFederalHistory)).toBe(beforeHistory);
 copy.original.payer='Mutation of returned private copy only';
 expect(JSON.stringify(input)).toBe(beforeInput);expect(JSON.stringify(draft)).toBe(beforeDraft);expect(JSON.stringify(f.filedFederalHistory)).toBe(beforeHistory);
});
it.each(['nested-owner','source-year','current-original-year','current-return-year'] as const)('explicit reconfirmation cannot repair actual royalty owner or year conflicts %s',kind=>{
 const f=nativeMIRoyaltyFixture(),input=structuredClone(f.input),draft=structuredClone(source(f)),nested=actual(draft.royaltySources);
 if(kind==='nested-owner')nested.owner.originalTaxpayer.ssn='900-88-7777';
 if(kind==='source-year')nested.sourceTaxYear=2026;
 if(kind==='current-original-year')actual(input.form1099Misc[0]).taxYear=2026;
 if(kind==='current-return-year')input.taxpayer.taxYear=2026;
 const beforeInput=JSON.stringify(input),beforeDraft=JSON.stringify(draft);
 expect(()=>confirmGuidedPAResidencySources(input,draft)).toThrow();
 expect(JSON.stringify(input)).toBe(beforeInput);expect(JSON.stringify(draft)).toBe(beforeDraft);
});
it.each(['missing','duplicate'] as const)('explicit reconfirmation retains distinct actual original index coverage %s',kind=>{
 const f=nativeMIRoyaltyFixture(),draft=structuredClone(source(f)),nested=actual(draft.royaltySources);
 if(kind==='missing')actual(nested.originals[0]).originalIndex=1;
 else nested.originals.push(structuredClone(actual(nested.originals[0])));
 const beforeInput=JSON.stringify(f.input),beforeDraft=JSON.stringify(draft);
 expect(()=>confirmGuidedPAResidencySources(f.input,draft)).toThrow();
 expect(JSON.stringify(f.input)).toBe(beforeInput);expect(JSON.stringify(draft)).toBe(beforeDraft);
});
it.each(['all-boxes-unknown','not-current-original'] as const)('explicit reconfirmation cannot promote missing or false per-original review %s',kind=>{
 const f=nativeMIRoyaltyFixture(),draft=structuredClone(source(f)),proof=actual(actual(draft.royaltySources).originals[0]);
 if(kind==='all-boxes-unknown')proof.allOriginalBoxesKnownConfirmed=null;
 else proof.currentUncorrectedNonvoidOriginalConfirmed=false;
 const beforeInput=JSON.stringify(f.input),beforeDraft=JSON.stringify(draft);
 expect(()=>confirmGuidedPAResidencySources(f.input,draft)).toThrow();
 expect(JSON.stringify(f.input)).toBe(beforeInput);expect(JSON.stringify(draft)).toBe(beforeDraft);
});
