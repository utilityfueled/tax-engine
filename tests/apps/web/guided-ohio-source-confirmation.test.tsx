// @vitest-environment jsdom
/** Spec: state/guided-ohio-source-navigation.yaml#explicit-confirm-ui */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { OhioResidencyDetails } from "@/components/guided-interview/ohio-residency-details";
import { OhioPaymentDetails } from "@/components/guided-interview/ohio-payment-details";
import { SectionStateReturn } from "@/components/guided-interview/section-state-return";
import type { StateReturnData } from "@/lib/guided-interview-flow";
import type { TaxYearInput } from "@/models/inputs.js";
import { guidedOhioNavigationFixture, ohioNavigationStatuses } from "../../fixtures/guided-ohio-source-navigation.js";
async function mount(status:typeof ohioNavigationStatuses[number], context:boolean, section=false) {
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const f=guidedOhioNavigationFixture(status),container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 let latest:StateReturnData=structuredClone(f.data);required(latest.ohioResidency).sourceFactsConfirmed=null;required(latest.ohioPayments).sourceFactsConfirmed=null;Reflect.deleteProperty(required(latest.ohioResidency),"originalFederalSources");Reflect.deleteProperty(required(latest.ohioPayments),"originalFederalSources");
 const original=context?f.original:null;
 function Harness(){const [data,setData]=useState(latest);function changed(next:StateReturnData){latest=next;setData(next);}
  if(section)return <SectionStateReturn stateCode="OH" guidedPreview={null} originalInput={original} taxYear={2025} filingStatus="single" data={data} onDataChange={changed}/>;
  // Context is deliberately supplied via object spread so the new prop contract is a runtime guard first.
  const props:{originalInput:TaxYearInput|null}={originalInput:original};
  return <><OhioResidencyDetails {...props} data={data.ohioResidency} filingStatus="single" taxYear={2025} onChange={value=>changed({...data,ohioResidency:value})}/><OhioPaymentDetails {...props} data={data.ohioPayments} taxYear={2025} onChange={value=>changed({...data,ohioPayments:value})}/></>;
 }
 await act(async()=>root.render(<Harness/>));
 const button=(name:string)=>{const b=[...container.querySelectorAll("button")].find(b=>b.textContent===name);expect(b,`Missing ${name}`).toBeTruthy();return required(b);};
 const click=async(name:string)=>{await act(async()=>button(name).click());};
 const change=async(name:string,value:string)=>{const label=[...container.querySelectorAll("label")].find(l=>l.querySelector(".guided-field-label")?.textContent===name);const field=label?.querySelector("input");if(!field)throw new Error(`Missing field ${name}`);const setter=required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")).set);await act(async()=>{setter.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));});};
 return {f,container,latest:()=>latest,button,click,change,close:async()=>{await act(async()=>root.unmount());container.remove();}};
}
it("Ohio panels require current originals for explicit confirmation",async()=>{const m=await mount("full_year_resident",false);try{expect(m.button("Confirm actual Ohio residency sources").disabled).toBe(true);expect(m.button("Confirm actual Ohio payment sources").disabled).toBe(true);expect(required(m.latest().ohioResidency).sourceFactsConfirmed).toBeNull();expect(required(m.latest().ohioPayments).sourceFactsConfirmed).toBeNull();}finally{await m.close();}});
it.each(ohioNavigationStatuses)("Ohio %s panels explicitly bind originals and retain old snapshots on edits",async status=>{const m=await mount(status,true);try{await m.click("Confirm actual Ohio residency sources");await m.click("Confirm actual Ohio payment sources");expect(m.latest().ohioResidency).toMatchObject({sourceFactsConfirmed:true,originalFederalSources:m.f.original});expect(m.latest().ohioPayments).toMatchObject({sourceFactsConfirmed:true,originalFederalSources:m.f.original});await m.change("Ohio residency source reference","Edited domicile source");await m.change("Ohio payment records source reference","Edited account source");expect(required(m.latest().ohioResidency).sourceFactsConfirmed).toBeNull();expect(required(m.latest().ohioPayments).sourceFactsConfirmed).not.toBe(true);expect(m.latest().ohioResidency).toMatchObject({originalFederalSources:m.f.original});expect(m.latest().ohioPayments).toMatchObject({originalFederalSources:m.f.original});expect(required(required(m.latest().ohioPayments).paymentRows[0]).amount).toBe("100.01");}finally{await m.close();}});
it("Ohio state section forwards actual federal originals to both source panels",async()=>{const m=await mount("part_year_resident",true,true);try{await m.click("Confirm actual Ohio residency sources");await m.click("Confirm actual Ohio payment sources");expect(m.latest().ohioResidency).toMatchObject({originalFederalSources:m.f.original});expect(m.latest().ohioPayments).toMatchObject({originalFederalSources:m.f.original});}finally{await m.close();}});

function required<T>(value: T | undefined | null): T { if (value == null) throw new Error("Explicit source fixture value required"); return value; }
