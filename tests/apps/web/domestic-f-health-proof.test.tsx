// @vitest-environment jsdom
// Spec: spec/federal/form-7206-return.yaml, signed-domestic-f-facts.
import React,{act,useState} from "react";
import {createRoot} from "react-dom/client";
import {expect,it} from "vitest";
import {HealthInsuranceSourceDetails} from "@/components/guided-interview/health-insurance-source-details";
import {emptyHealthInsuranceFacts,type HealthInsuranceData} from "@/lib/guided-health-insurance-facts";
it("collects proof only for supplied actual farm options and invalidates retained source facts",async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement("div");document.body.appendChild(el);const root=createRoot(el);let latest:HealthInsuranceData|undefined;
 function Harness({farm=false}:{farm?:boolean}){const [data,setData]=useState({...emptyHealthInsuranceFacts});return <HealthInsuranceSourceDetails data={data} sources={farm?[{sourceId:"scheduleF",accountHolder:"primary",kind:"self_employed",label:"Actual imported farm"}]:[]} onChange={next=>{latest=next;setData(next);}}/>;}
 async function click(label:string){const b=[...el.querySelectorAll("button")].find(v=>v.textContent===label);if(!b)throw Error(label);await act(async()=>b.click());}
 async function change(label:string,value:string){const c=[...el.querySelectorAll("label")].find(v=>v.querySelector(".guided-field-label")?.textContent===label)?.querySelector<HTMLInputElement|HTMLSelectElement>("input,select");if(!c)throw Error(label);const setter=Object.getOwnPropertyDescriptor(c.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")?.set;if(!setter)throw Error("Missing native setter");await act(async()=>{setter.call(c,value);c.dispatchEvent(new Event(c.tagName==="SELECT"?"change":"input",{bubbles:true}));});}
 try{
  await act(async()=>root.render(<Harness/>));expect(el.textContent).not.toContain("Add domestic farm proof");
  await act(async()=>root.render(<Harness farm/>));await click("Add domestic farm proof");
  expect(latest?.domesticFarmSources?.allIncomeDomesticConfirmed).toBeNull();
  await change("Actual domestic farm business","scheduleF");expect(latest?.domesticFarmSources?.accountHolder).toBe("primary");
  await change("All actual farm income is domestic","false");expect(latest?.domesticFarmSources?.allIncomeDomesticConfirmed).toBe(false);
  await change("All actual farm income is domestic","true");await change("Domestic farm proof checked after the last edit","true");
  expect(latest?.domesticFarmSources?.sourceFactsConfirmed).toBe(true);
  await change("Domestic farm source reference","Original revised farm ledger");expect(latest?.domesticFarmSources?.sourceFactsConfirmed).toBeNull();expect(latest?.sourceFactsConfirmed).toBeNull();
  expect(el.textContent).toContain("ordinary interview cannot originate Schedule F");
 }finally{await act(async()=>root.unmount());el.remove();}
});
