import {bindGuidedRefundRecoveryInput} from "@/lib/guided-tax-refund-recoveries";
// @vitest-environment jsdom
// Spec: spec/federal/guided-tax-refund-payment-years.yaml.
import React, { act, useState } from "react";
import sourceFixture from "../../fixtures/guided-tax-refund-payment-years.json";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionUnemployment } from "@/components/guided-interview/section-unemployment";
import { type GuidedFlowState, updateSectionData } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { refundHistoryAmounts, refundHistoryExclusions } from "@/lib/guided-tax-refund-recoveries";
function required<T>(value:T|null|undefined):T{if(value==null)throw new Error("Missing synthetic source");return value;}
it("collects payment-year originals explicitly and revokes provenance edits", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element);
  let latest:GuidedFlowState=JSON.parse(JSON.stringify(sourceFixture));
  const originals=structuredClone(required(latest.sectionData["income-unemployment"])),expected=required(originals.refundRecoveries),year=required(expected.years?.[0]),basis=required(originals.entries?.[0].refundPaymentBasis);
  delete required(latest.sectionData["income-unemployment"]).refundRecoveries;
  delete required(required(latest.sectionData["income-unemployment"]).entries?.[0]).refundPaymentBasis;
  let writes=0;
  function Harness(){const [state,setState]=useState(latest);return <SectionUnemployment state={state} data={state.sectionData["income-unemployment"]} onDataChange={next=>{writes++;latest=updateSectionData(state,"income-unemployment",next);setState(latest);}}/>;}
  async function click(label:string){const button=[...element.querySelectorAll("button")].find(node=>node.textContent===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());}
  async function change(label:string,value:string){const input=[...element.querySelectorAll("label")].find(node=>node.querySelector("span")?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>("input,select");if(!input)throw new Error(`Missing ${label}`);await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")?.set?.call(input,value);input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));});}
  const current=()=>required(latest.sectionData["income-unemployment"]);
  try {
    await act(async()=>root.render(<Harness/>));await click("Add mixed-payment-year refund collection");expect(current().refundRecoveries).toEqual({});
    await click("Add dated basis for statement 1");expect(current().entries?.[0].refundPaymentBasis).toEqual({});expect(current().entries?.[0].refundPaymentBasis?.payments).toBeUndefined();
    await change("Recovery collection receipt year","2025");await change("Recovery collection original reference",required(expected.sourceReference));
    await change("All actual refund statements are included in this collection","true");
    await change("Statement 1 payment ledger reference",required(basis.sourceReference));await change("Statement 1 actual refund receipt date",required(basis.receivedDate));await change("Statement 1 refunded state",required(basis.state));await change("Statement 1 complete original payment inventory","true");
    for(const [i,payment] of required(basis.payments).entries()){
      await click("Add payment to statement 1");expect(current().entries?.[0].refundPaymentBasis?.payments?.[i]).toEqual({});
      await change(`Statement 1 payment ${i+1} original reference`,required(payment.sourceReference));await change(`Statement 1 payment ${i+1} date paid`,required(payment.datePaid));await change(`Statement 1 payment ${i+1} actual amount`,required(payment.amount));await change(`Statement 1 payment ${i+1} is a current-year state estimated payment`,String(payment.currentYearStatePaymentConfirmed));
    }
    await change("Statement 1 payment basis checked after the last edit","true");await change("Have you checked this government-payment source after the last edit?","true");
    await click("Add historical return");expect(current().refundRecoveries?.years?.[0]).toEqual({});
    for(const [label,value] of [["Actual historical deduction year",year.priorTaxYear],["Historical return original reference",year.sourceReference],["Historical return filing status",year.priorYearFilingStatus],["Historical primary taxpayer SSN",year.priorYearPrimarySsn],["Historical return itemized deductions",String(year.priorYearItemized)],["Historical state tax election",year.priorYearStateLocalTaxElection]] as const)await change(label,required(value));
    for(const [key,label] of refundHistoryAmounts)await change(label,required(year[key]));
    for(const [key,label] of refundHistoryExclusions)await change(label,String(year[key]));
    await change("Historical return facts checked after the last edit","true");
    expect(current().refundRecoveries?.years?.[0]).toEqual(year);expect(current().refundRecoveries?.originalSources).toBeUndefined();expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await click("Capture current refund payment-year originals");expect(element.querySelector('[role="alert"]')?.textContent).toBeUndefined();
    const captured=structuredClone(current().refundRecoveries?.originalSources);expect(captured).toBeDefined();
    await change("Refund payment-year collection checked after the last edit","true");{const o=required(latest.sectionData["income-unemployment"]?.refundRecoveries?.originalSources);expect(()=>bindGuidedRefundRecoveryInput({taxpayer:o.taxpayer,form1099G:o.forms,adjustments:o.adjustments}, latest)).not.toThrow();}expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    const count=writes;await change("Statement 1 payment 1 actual amount","1000");expect(writes).toBe(count);expect(current().refundRecoveries?.sourceFactsConfirmed).toBe(true);
    await change("Statement 1 payment 1 original reference","FixtureOnly replacement provenance");expect(current().refundRecoveries?.sourceFactsConfirmed).toBeNull();expect(current().entries?.[0].sourceFactsConfirmed).toBeNull();expect(current().refundRecoveries?.originalSources).toEqual(captured);
    await change("Refund payment-year collection checked after the last edit","true");expect(buildTaxInputFromGuidedData(latest)).toBeNull();expect(current().refundRecoveries?.originalSources).toEqual(captured);
    await change("Statement 1 payment basis checked after the last edit","true");await change("Have you checked this government-payment source after the last edit?","true");await click("Capture current refund payment-year originals");await change("Refund payment-year collection checked after the last edit","true");expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();expect(current().refundRecoveries?.originalSources).not.toEqual(captured);
    await change("Statement 1 payment 1 actual amount","");expect(current().entries?.[0].refundPaymentBasis?.payments?.[0].amount).toBe("");
    await change("Statement 1 payment 1 actual amount","0");expect(current().entries?.[0].refundPaymentBasis?.payments?.[0].amount).toBe("0");
  } finally { await act(async()=>root.unmount());element.remove(); }
});
