// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SectionPayments } from '@/components/guided-interview/section-payments';
import { emptyPaymentData, updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { emptyEstimatedTaxFacts } from '@/lib/guided-estimated-tax-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { startCompleteInterview } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('edits dated federal payment types without replacing unknown source facts', async () => {
  let state = startCompleteInterview({filingStatus:'single',incomeTypes:[],lifeEvents:[],stateCode:null});
  const initial = structuredClone(state);
  function Harness() {
    const [current,setCurrent] = useState(state);
    return <SectionPayments taxYear={2025} data={current.sectionData.payments}
      onDataChange={next => { state=updateSectionData(current,'payments',next);setCurrent(state); }} />;
  }
  const dom=await mountGuidedPanel(<Harness />);
  try {
    expect(state.sectionData.payments).toBeUndefined();
    await dom.click('Add another estimated tax payment');
    expect(state.sectionData.payments?.estimatedPayments).toEqual([{date:'',amount:''}]);
    expect(validateSection(state,'payments').status).toBe('partial');
    await dom.change('Date paid','2025-04-15');
    await dom.change('Amount paid','0');
    expect(validateSection(state,'payments').status).toBe('complete');
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.estimatedTaxPayments).toEqual([{date:'2025-04-15',amount:'0',type:'federal'}]);
    await dom.click('Add another estimated tax payment');
    await dom.change('Date paid','2026-01-15',1);
    await dom.change('Amount paid','9007199254740993.01',1);
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.estimatedTaxPayments?.[1]?.amount).toBe('9007199254740993.01');
    expect(dom.container.querySelector('[role="status"]')?.textContent).toContain('9,007,199,254,740,993.01');
    await dom.change('Amount paid','',1);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    await dom.click('Remove estimated payment #2');
    expect(state.sectionData.payments?.estimatedPayments).toHaveLength(1);

    await dom.expand('Other payments');
    await dom.click('Add extension payment');
    expect(state.sectionData.payments?.extensionPayments).toEqual([{date:'',amount:''}]);
    await dom.change('Extension payment #1 date','2026-04-15');
    await dom.change('Extension payment #1 amount','0.10');
    await dom.click('Add extension payment');
    await dom.change('Extension payment #2 date','2026-04-15');
    await dom.change('Extension payment #2 amount','0.20');
    await dom.click('Add prior-year applied refund');
    expect(state.sectionData.payments?.priorYearAppliedCredits).toEqual([{sourceTaxYear:'',amount:''}]);
    await dom.change('Applied refund #1 source tax year','2024');
    await dom.change('Applied refund #1 amount','0.30');
    await dom.click('Add prior-year applied refund');
    await dom.change('Applied refund #2 source tax year','2024');
    await dom.change('Applied refund #2 amount','0');
    const input=buildTaxInputFromGuidedData(state);
    expect(input?.adjustments?.extensionPayments).toEqual([{date:'2026-04-15',amount:'0.10',type:'federal'},{date:'2026-04-15',amount:'0.20',type:'federal'}]);
    expect(input?.adjustments?.priorYearAppliedCredits).toEqual([{sourceTaxYear:2024,amount:'0.30',type:'federal'},{sourceTaxYear:2024,amount:'0',type:'federal'}]);
    await dom.change('Applied refund #2 source tax year','2023');
    expect(validateSection(state,'payments').status).toBe('partial');
    await dom.click('Remove applied refund #2');
    await dom.click('Remove extension payment #1');
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.extensionPayments).toEqual([{date:'2026-04-15',amount:'0.20',type:'federal'}]);
    expect(state.sectionData.payments?.priorYearAppliedCredits).toEqual([{sourceTaxYear:'2024',amount:'0.30'}]);
    await dom.click('Remove estimated payment #1');
    expect(state.sectionData.payments?.estimatedPayments).toEqual([]);
    expect(initial.sectionData.payments).toBeUndefined();
  } finally {await dom.dispose();}
});

it('requires actual payment reconfirmation after panel edits', async () => {
  let state=startCompleteInterview({filingStatus:'single',incomeTypes:[],lifeEvents:[],stateCode:null});
  state.sectionData.payments={...emptyPaymentData,otherPayments:'0.30',extensionPayments:[{date:'2026-04-15',amount:'0.30'}],
    estimatedTaxFacts:{...structuredClone(emptyEstimatedTaxFacts),sourceTaxYear:'2025',sourceReference:'Actual IRS payment ledger',sourceFactsConfirmed:true,
      allPaymentRecordsIncluded:true,calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
      calculationMethod:'regular',withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',earlyReturnExceptionClaimed:false}};
  function Harness(){const[current,setCurrent]=useState<GuidedFlowState>(state);return <SectionPayments taxYear={2025} data={current.sectionData.payments}
    onDataChange={next=>{state=updateSectionData(current,'payments',next);setCurrent(state);}}/>;}
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network expected'));
  const dom=await mountGuidedPanel(<Harness/>);
  const confirmation='Estimated-tax sources checked after the last edit';
  try{
    expect(validateSection(state,'payments').status).toBe('complete');
    await dom.expand('Other payments');
    await dom.change('Extension payment #1 amount','0.31');
    expect(state.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
    expect(state.sectionData.payments?.estimatedTaxFacts?.farmerOrFisher).toBe(false);
    await dom.change(confirmation,'true');
    expect(validateSection(state,'payments').status).toBe('partial');
    await dom.change('Saved other-payment total to classify','0.31');
    await dom.change(confirmation,'true');
    expect(validateSection(state,'payments').status).toBe('complete');
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.extensionPayments?.[0]?.amount).toBe('0.31');
    await dom.change('Extension payment #1 amount','');
    await dom.change(confirmation,'true');
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(state.sectionData.payments?.estimatedTaxFacts?.sourceReference).toBe('Actual IRS payment ledger');
    await dom.change('Extension payment #1 amount','0');
    await dom.change('Saved other-payment total to classify','0');
    await dom.change(confirmation,'true');
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.extensionPayments?.[0]?.amount).toBe('0');
    await dom.change(confirmation,'');
    expect(state.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
    expect(network).not.toHaveBeenCalled();
  }finally{await dom.dispose();network.mockRestore();}
});
