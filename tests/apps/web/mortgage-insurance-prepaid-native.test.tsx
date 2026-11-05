// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-insurance-prepaid.yaml
import React, { act, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeductionSourceDetails } from '@/components/guided-interview/deduction-source-details';
import { type DeductionData } from '@/lib/guided-interview-flow';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { guidedMortgagePrepaidFixture, confirmedGuidedMortgagePrepaidFixture } from '../../fixtures/guided-mortgage-insurance-prepaid';
import { mountGuidedPanel } from './guided-panel-dom';
const entryConfirmation='Have you checked all mortgage source and qualification facts after the last edit?';
const worksheetConfirmation='Have you confirmed the complete annual home-debt worksheet after the last change?';
afterEach(()=>vi.unstubAllGlobals());
async function mount(data:DeductionData, context=true) {
  let latest=data,writes=0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  function Harness(){const [value,setValue]=useState(data);return <DeductionSourceDetails data={value} includeDonations={false} {...(context?{taxYear:2026,filingStatus:'single' as const}:{})} onChange={next=>{latest=next;writes++;setValue(next);}}/>;}
  const ui=await mountGuidedPanel(<Harness/>);
  return {...ui,get latest(){return latest;},get writes(){return writes;}};
}
it('offers the current original prepaid method through actual mortgage controls',async()=>{
  const base=guidedMortgagePrepaidFixture();const e=present(present(base.mortgageEntries)[0]);
  delete e.insurancePrepaid; delete e.insuranceAllocationMethod;
  const ui=await mount(base);
  try {
    expect(ui.writes).toBe(0);expect(ui.container.textContent).not.toContain('Original prepaid mortgage insurance records');
    await ui.change('Actual mortgage insurance allocation method','current-original-prepaid');
    expect(ui.control('Actual original prepaid premium paid').value).toBe('');
    expect(ui.control('Actual stated mortgage term in whole months').value).toBe('');
    expect(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).toBeUndefined();
    await ui.click('Capture actual original premium records');
    expect(ui.container.querySelector('[role="alert"]')).not.toBeNull();
    for(const [label,value] of [
      ['Original premium policy and payment record reference','fictional-private-policy-native'],
      ['Actual original mortgage insurance provider','private'],
      ['Actual original prepaid premium paid','9,240'],
      ['Actual original premium payment method','cash'],
      ['Actual original premium payment date','2026-05-15'],
      ['Actual date this insurance was obtained','2026-05-15'],
      ['Actual stated mortgage term in whole months','180'],
      ['Do these original records include every prepaid premium for this policy?','true'],
      ['Do actual records establish qualifying private mortgage insurance under the Homeowners Protection Act?','true'],
      ['Do actual premium records establish allocation to periods beyond this year end?','true'],
      ['Was this original mortgage still outstanding at year end?','true'],
      ['Was this mortgage satisfied at any time during the year?','false'],
      ['Was this mortgage refinanced?','false'],
      ['Were any of these premiums refunded?','false'],
      ['Was this insurance cancelled?','false'],
      ['Did another borrower pay any of this original premium?','false'],
      ['Were there any other premium payments or prior premium histories for this policy?','false'],
      [entryConfirmation,'true'],[worksheetConfirmation,'true'],
    ]) await ui.change(label,value);
    expect(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid?.capturedOriginal).toBeUndefined();
    await ui.click('Capture actual original premium records');
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBeUndefined();
    const original=present(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal);
    expect(original.source.prepaidPremiumPaid).toBe('9240');
    expect(present(present(ui.latest.mortgageEntries)[0]).sourceFactsConfirmed).toBeNull();
    expect(present(ui.latest.mortgageWorksheet).sourceFactsConfirmed).toBeNull();
    expect(()=>buildGuidedMortgageInputs(ui.latest,2026,'single')).toThrow();
    await ui.change(entryConfirmation,'true');await ui.change(worksheetConfirmation,'true');
    await ui.click('Confirm retained original premium records');
    expect(ui.container.querySelector('[role="status"]')?.textContent).toContain('explicitly confirmed');
    expect(present(buildGuidedMortgageInputs(ui.latest,2026,'single').form1098[0]).mortgageInsuranceQualification?.prepaidSources?.prepaidPremiumPaid).toBe('9240');
    expect(present(present(ui.latest.mortgageEntries)[0]).insurancePremiumsAllocableToYear).toBeUndefined();
    const before=ui.writes;
    await act(async()=>{ui.control('Actual original prepaid premium paid').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
    expect(ui.writes).toBe(before);
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).sourceFactsConfirmed).toBe(true);
    await ui.change('Original premium policy and payment record reference','fictional-private-policy-native-edited');
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBe(original);
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).sourceFactsConfirmed).toBeNull();
    expect(present(present(ui.latest.mortgageEntries)[0]).sourceFactsConfirmed).toBeNull();
    expect(present(ui.latest.mortgageWorksheet).sourceFactsConfirmed).toBeNull();
    await ui.change(entryConfirmation,'true');await ui.change(worksheetConfirmation,'true');
    await ui.click('Confirm retained original premium records');
    expect(ui.container.querySelector('[role="alert"]')?.textContent).toMatch(/capture|confirm/i);
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBe(original);
  }finally{await ui.dispose();}
});
it.each(['1,0','$','-1'])('retains invalid original premium %s without silently creating an allocation',async raw=>{
  const ui=await mount(confirmedGuidedMortgagePrepaidFixture());
  try{const old=present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal;
    await ui.change('Actual original prepaid premium paid',raw);
    await act(async()=>ui.control('Actual original prepaid premium paid').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).prepaidPremiumPaid).toBe(raw);
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBe(old);
    expect(()=>buildGuidedMortgageInputs(ui.latest,2026,'single')).toThrow();
  }finally{await ui.dispose();}
});
it('revokes original confirmation on actual worksheet changes and never invents missing context',async()=>{
  const ui=await mount(confirmedGuidedMortgagePrepaidFixture());
  try{const old=present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal;
    await ui.change('Annual home-debt record reference','fictional-changed-parent');
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).sourceFactsConfirmed).toBeNull();
    expect(present(present(ui.latest.mortgageEntries)[0]).sourceFactsConfirmed).toBeNull();
    expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBe(old);
  }finally{await ui.dispose();}
  const noContext=await mount(guidedMortgagePrepaidFixture(),false);
  try{await noContext.click('Capture actual original premium records');expect(present(present(present(noContext.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBeUndefined();expect(noContext.container.querySelector('[role="alert"]')).not.toBeNull();}finally{await noContext.dispose();}
});

it('revokes all retained premium confirmations when the complete mortgage inventory changes',async()=>{
  const ui=await mount(confirmedGuidedMortgagePrepaidFixture());
  try{const old=present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal;await ui.click('Add mortgage');expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).sourceFactsConfirmed).toBeNull();expect(present(present(ui.latest.mortgageEntries)[0]).sourceFactsConfirmed).toBeNull();expect(present(present(present(ui.latest.mortgageEntries)[0]).insurancePrepaid).capturedOriginal).toBe(old);expect(present(present(ui.latest.mortgageEntries)[1]).insurancePrepaid).toBeUndefined();}finally{await ui.dispose();}
});

/** Missing synthetic fixture facts fail the test instead of being cast away. */
function present<T>(value:T|null|undefined):T {if(value==null)throw new Error('Missing synthetic fixture fact');return value;}
