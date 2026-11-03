import {requiredNative} from '../../fixtures/pa-married-native-public';
// @vitest-environment jsdom
// Spec: spec/state/pa-married-preview-priority.yaml. Existing mounted ticker, real native computation.
import React from 'react';
import {expect,it} from 'vitest';
import {RefundTicker,type RefundTickerPreviewData} from '@/components/refund-ticker';
import type {WorkspaceEnginePreview} from '@tax-engine/contracts';
import {computeGuidedPreviewOutcome} from '@/lib/guided-preview-compute';
import {buildTaxInputFromGuidedData,isSeparateStatePreview} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
import {TaxYearInputSchema} from '@/models/inputs';
import {guidedPAMarriedNativeFixture} from '../../fixtures/guided-pa-married-native';
import {mountGuidedPanel} from './guided-panel-dom';
function actualCurrentFallback():RefundTickerPreviewData{
 const f=guidedPAMarriedNativeFixture('M','shared-sp');requiredNative(f.state.sectionData['income-w2']).entries[0].federalWithheld='400';const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state));requiredNative(f.state.sectionData['state-return']).paMarriedOrdinarySources=confirmGuidedPAMarriedOrdinarySources(input,f.sources);
 const out=computeGuidedPreviewOutcome(f.state);expect(out.blockedBy).toBeNull();expect(out.metrics?.refund).toBe('400');expect(out.metrics?.amountOwed).toBe('0');if(!out.metrics||!isSeparateStatePreview(out.metrics.state))throw Error('Actual current separately owned M preview is required');expect(out.metrics.state.returns.map(r=>[r.accountHolder,r.stateRefund,r.stateAmountOwed])).toEqual([['primary','276','0'],['spouse','83','0']]);const{state,...metrics}=out.metrics;return{filingStatus:'married_filing_jointly',taxYear:2025,metrics,separateStateReturns:state};
}
function expectActualDisplay(container:HTMLElement){expect(container.querySelector('.guided-ticker-value-hero')?.textContent).toBe('$400');const primary=container.querySelector('[aria-label="Primary PA return"]'),spouse=container.querySelector('[aria-label="Spouse PA return"]');expect(primary).not.toBeNull();expect(spouse).not.toBeNull();expect(primary?.textContent).toContain('$276');expect(spouse?.textContent).toContain('$83');expect(container.textContent).not.toContain('$6,000');expect(container.textContent).not.toContain('$759');expect(container.textContent).not.toContain('$359');}
it('Current actual separate M preview outranks older workspace aggregate',async()=>{const current=actualCurrentFallback(),older:WorkspaceEnginePreview={mode:'engine-recompute',title:'Fictional older saved scalar preview',taxYear:2025,filingStatus:'married_filing_jointly',sourceDocumentIds:[],sourceFixtureIds:[],assumptions:[],highlightedLines:[],metrics:{...current.metrics,refund:'1000',amountOwed:'0'},stateMetrics:{stateCode:'PA',stateTax:'0',totalPayments:'5000',refund:'5000',amountOwed:'0'}};const dom=await mountGuidedPanel(<RefundTicker enginePreview={older} fallbackPreview={current}/>);try{expectActualDisplay(dom.container);}finally{await dom.dispose();}});
it('Ready standalone ticker shows both actual M owner accounts',async()=>{const current=actualCurrentFallback(),dom=await mountGuidedPanel(<RefundTicker enginePreview={null} fallbackPreview={current}/>);try{expectActualDisplay(dom.container);}finally{await dom.dispose();}});
