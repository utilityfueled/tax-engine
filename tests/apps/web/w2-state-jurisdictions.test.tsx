// @vitest-environment jsdom
/** Spec: spec/federal/w2-state-jurisdictions.yaml guide-source-options. */
import React,{act,useState} from "react";
import {createRoot} from "react-dom/client";
import {expect,it} from "vitest";
import {W2StateLocalDetails} from "@/components/guided-interview/w2-state-local-details";
import {confirmGuidedW2StateLocalSources,buildGuidedW2StateLocalSources,updateGuidedW2StateLocalSources} from "@/lib/guided-w2-state-local-facts";
import type {W2StateLocalSources} from "@/models/w2-state-local.js";
import {sourceJurisdictions,twoJurisdictionFixture} from "../../fixtures/w2-state-jurisdictions.js";
it("W2 US source collector exposes all states and invalidates an actual jurisdiction edit",async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;const f=twoJurisdictionFixture("OH"),element=document.createElement("div");document.body.appendChild(element);const root=createRoot(element);let latest:W2StateLocalSources|undefined;
 function Harness(){const [data,setData]=useState(f.sources);return <W2StateLocalDetails originalInput={f.input} originalIndex={0} data={data} onChange={next=>{latest=next;if(next)setData(next);}}/>;}
 try{await act(async()=>root.render(<Harness/>));const label=[...element.querySelectorAll("label")].find(value=>value.querySelector(".guided-field-label")?.textContent==="State 2 actual Box 15 state"),select=label?.querySelector("select");if(!select)throw new Error("Actual state original control missing");const choices=[...select.options].map(option=>option.value);expect(choices).toHaveLength(52);expect(new Set(choices)).toEqual(new Set(["",...sourceJurisdictions]));expect([...select.options].find(option=>option.value==="DE")?.textContent).toContain("Delaware");
 await act(async()=>{select.value="NY";select.dispatchEvent(new Event("change",{bubbles:true}));});expect(latest?.sourceFactsConfirmed).toBeNull();expect(latest?.stateRows[1]).toEqual({...f.sources.stateRows[1],state:"NY"});expect(latest?.stateRows[0]).toEqual(f.sources.stateRows[0]);expect(latest?.localRows).toEqual(f.sources.localRows);expect(element.textContent).toContain("does not create another federal W-2");
 }finally{await act(async()=>root.unmount());element.remove();}
});
it("W2 US source collector confirms actual NY and DE originals then rejects stale source edits",()=>{
 for(const code of ["NY","DE"]){const f=twoJurisdictionFixture(code),confirmed=confirmGuidedW2StateLocalSources(f.input,0,{...f.sources,sourceFactsConfirmed:null});expect(confirmed.sourceFactsConfirmed).toBe(true);expect(confirmed.stateRows[1].state).toBe(code);const current={...f.input,w2s:f.input.w2s.map(row=>({...row,stateLocalSources:confirmed}))};expect(buildGuidedW2StateLocalSources(current,0,confirmed)).toEqual(confirmed);const changed=updateGuidedW2StateLocalSources(confirmed,{stateRows:confirmed.stateRows.map((row,index)=>index===1?{...row,withheld:""}:row)});expect(changed.sourceFactsConfirmed).toBeNull();expect(()=>buildGuidedW2StateLocalSources(current,0,changed)).toThrow(/source|original|amount/i);}
});
