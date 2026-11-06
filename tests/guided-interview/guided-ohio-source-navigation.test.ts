import { expect, it } from "vitest";
import * as residence from "@/lib/guided-ohio-residency-facts";
import * as payment from "@/lib/guided-ohio-payment-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { validateSection, updateSectionData } from "@/lib/guided-interview-flow";
import { guidedOhioNavigationFixture, ohioNavigationStatuses } from "../fixtures/guided-ohio-source-navigation.js";
import { guidedPAOrdinaryPanelFixture } from "../fixtures/guided-pa-ordinary-panels.js";
function blocked(state: ReturnType<typeof guidedOhioNavigationFixture>["state"]) {
 const result = validateSection(state, "state-return");
 expect(result.status).toBe("partial"); expect(result.allowSkip).toBe(false); expect(Object.keys(result.fieldErrors ?? {}).length).toBeGreaterThan(0);
}
// Spec: state/guided-ohio-source-navigation.yaml#mandatory-packets
it("Ohio navigation requires residency and payment sources for all three residencies", () => {
 for (const status of ohioNavigationStatuses) {
  const f = guidedOhioNavigationFixture(status); expect(validateSection(f.state, "state-return").status).toBe("complete");
  const missingResidency = structuredClone(f.state); delete required(missingResidency.sectionData["state-return"]).ohioResidency; blocked(missingResidency);
  const missingPayment = structuredClone(f.state); delete required(missingPayment.sectionData["state-return"]).ohioPayments; blocked(missingPayment);
 }
});
it.each(ohioNavigationStatuses)("Ohio %s requires actual confirmation of each source packet", status => {
 const f = guidedOhioNavigationFixture(status);
 for (const root of ["ohioResidency", "ohioPayments"] as const) { const s = structuredClone(f.state); required(required(s.sectionData["state-return"])[root]).sourceFactsConfirmed = null; blocked(s); }
});
it("Ohio navigation rejects missing current federal owner originals", () => { const f=guidedOhioNavigationFixture(); required(f.state.sectionData["personal-info"]).dateOfBirth=""; blocked(f.state); });
it("Ohio navigation rejects unknown current source year without inventing it", () => { const f=guidedOhioNavigationFixture(); f.state.taxYear=null; blocked(f.state); expect(f.state.taxYear).toBeNull(); });
it("Ohio navigation rejects mismatched actual residency year", () => { const f=guidedOhioNavigationFixture("part_year_resident"); required(f.data.ohioResidency).taxYear="2024"; blocked(f.state); });
it("Ohio navigation rejects mismatched actual payment year", () => { const f=guidedOhioNavigationFixture(); required(f.data.ohioPayments).taxYear="2024"; blocked(f.state); });
it("Ohio navigation rejects absent actual owner domicile periods", () => { const f=guidedOhioNavigationFixture("nonresident"); required(f.data.ohioResidency).owners=[]; blocked(f.state); });
it("Ohio navigation rejects missing actual NRC source categories", () => { const f=guidedOhioNavigationFixture("part_year_resident"); required(required(f.data.ohioResidency).owners[0]).amounts=undefined; blocked(f.state); });
it("Ohio navigation rejects a receipt belonging to a different actual taxpayer", () => {
 const f=guidedOhioNavigationFixture(); const row=required(required(f.data.ohioPayments).paymentRows[0]); const original=row.original; if (!original || typeof original!=="object") throw new Error("Explicit original required");
 Object.assign(original,{accountSsn:"900-70-0999"}); blocked(f.state); expect(row.amount).toBe("100.01");
});
it("Ohio navigation rejects source edits with prior confirmation cleared", () => { const f=guidedOhioNavigationFixture(); const next=updateSectionData(f.state,"personal-info",{...required(f.state.sectionData["personal-info"]),lastName:"Changed"}); blocked(next); expect(required(required(next.sectionData["state-return"]).ohioPayments).sourceFactsConfirmed).toBeNull(); });
// Spec: state/guided-ohio-source-navigation.yaml#special-method-guard
it("Ohio navigation preserves and guards unknown and positive special source facts", () => {
 for (const field of ["farmingFishingIncome","militaryDisasterRelief"] as const) for (const value of ["", "reported_present"]) {
  const f=guidedOhioNavigationFixture("nonresident"); required(f.data.ohioPayments).specialFacts[field]=value; const before=structuredClone(f.state); blocked(f.state); expect(f.state).toEqual(before); expect(required(f.data.ohioPayments).specialFacts[field]).toBe(value);
 }
});
// Spec: state/guided-ohio-source-navigation.yaml#pure-read
it("Ohio navigation is a pure read and preserves federal originals when state sources are missing", () => {
 for (const status of ohioNavigationStatuses) {
  const f=guidedOhioNavigationFixture(status); const original=buildTaxInputFromGuidedData(f.state); const saved=structuredClone(f.state);
  expect(validateSection(f.state,"state-return").status).toBe("complete"); expect(validateSection(f.state,"state-return").status).toBe("complete"); expect(f.state).toEqual(saved);
  delete f.data.ohioPayments; const without=structuredClone(f.state); blocked(f.state); expect(buildTaxInputFromGuidedData(f.state)).toEqual(original); expect(f.state).toEqual(without);
  expect(required(f.data.ohioResidency).sourceFactsConfirmed).toBe(true);
 }
});
it("Ohio navigation guard preserves current PA packet navigation", () => { for (const status of ["resident","part_year","nonresident"] as const) { const f=guidedPAOrdinaryPanelFixture(status); expect(validateSection(f.state,"state-return").status).toBe("complete"); } });

// Spec: state/guided-ohio-source-navigation.yaml#explicit-original-binding
it("Ohio reads reject boolean-only legacy confirmation without retained originals", () => {
 for (const status of ohioNavigationStatuses) { const f=guidedOhioNavigationFixture(status);
  for (const [draft, read] of [[f.data.ohioResidency, residence.buildGuidedOhioResidencyFacts], [f.data.ohioPayments, payment.buildGuidedOhioPaymentFacts]] as const) {
   const legacy=structuredClone(draft); if (!legacy) throw new Error("Actual draft required"); Reflect.deleteProperty(legacy,"originalFederalSources");
   expect(() => (read as (draft:unknown,input:typeof f.original)=>unknown)(legacy,f.original)).toThrow(/original|snapshot|confirm|source/i);
  }
 }
});
it.each(ohioNavigationStatuses)("Ohio %s reads reject same-money original owner and employer edits", status => {
 const f=guidedOhioNavigationFixture(status);
 for (const change of ["owner", "employer"] as const) { const changed=structuredClone(f.original);
  if (change==="owner") changed.taxpayer.primary.lastName="ChangedOwner";
  else required(changed.w2s[0]).employer.name="ChangedEmployer";
  expect(() => residence.buildGuidedOhioResidencyFacts(f.data.ohioResidency,changed)).toThrow(/original|snapshot|confirm|source/i);
  expect(() => payment.buildGuidedOhioPaymentFacts(f.data.ohioPayments,changed)).toThrow(/original|snapshot|confirm|source/i);
  expect(required(changed.w2s[0]).wages).toBe("100000");
 }
});
it("Ohio explicit confirmation alone binds complete current originals for all three residencies", () => {
 const confirmResidence=Reflect.get(residence,"confirmGuidedOhioResidencyFacts"); const confirmPayment=Reflect.get(payment,"confirmGuidedOhioPaymentFacts");
 expect(typeof confirmResidence).toBe("function"); expect(typeof confirmPayment).toBe("function");
 for (const status of ohioNavigationStatuses) { const f=guidedOhioNavigationFixture(status); const r=structuredClone(required(f.data.ohioResidency)),p=structuredClone(required(f.data.ohioPayments));
  r.sourceFactsConfirmed=null;p.sourceFactsConfirmed=null;Reflect.deleteProperty(r,"originalFederalSources");Reflect.deleteProperty(p,"originalFederalSources");
  const confirmedR=confirmResidence(f.original,r), confirmedP=confirmPayment(f.original,p);
  expect(confirmedR).toMatchObject({sourceFactsConfirmed:true,originalFederalSources:f.original});expect(confirmedP).toMatchObject({sourceFactsConfirmed:true,originalFederalSources:f.original});
  expect(r.sourceFactsConfirmed).toBeNull();expect(p.sourceFactsConfirmed).toBeNull();
  expect(residence.buildGuidedOhioResidencyFacts(confirmedR,f.original).originalFederalSources).toEqual(f.original);
  expect(payment.buildGuidedOhioPaymentFacts(confirmedP,f.original).originalFederalSources).toEqual(f.original);
 }
});
it("Ohio explicit confirmation cannot convert unknown payment facts into ordinary eligibility", () => {
 const confirmPayment=Reflect.get(payment,"confirmGuidedOhioPaymentFacts");expect(typeof confirmPayment).toBe("function");
 for (const value of ["", "reported"]) {const f=guidedOhioNavigationFixture();required(f.data.ohioPayments).specialFacts.farmingFishingIncome=value;const before=structuredClone(f.data.ohioPayments);expect(()=>confirmPayment(f.original,f.data.ohioPayments)).toThrow(/farm|fish|actual|source|separate/i);expect(f.data.ohioPayments).toEqual(before);}
});

it("Ohio direct state-source edits clear affected headers but preserve retained originals", () => {
 const f=guidedOhioNavigationFixture();
 const r=updateSectionData(f.state,"state-return",{...f.data,ohioResidency:{...required(f.data.ohioResidency),sourceReference:"Edited domicile source"}});
 expect(required(required(r.sectionData["state-return"]).ohioResidency).sourceFactsConfirmed).toBeNull();
 expect(required(r.sectionData["state-return"]).ohioResidency).toMatchObject({originalFederalSources:f.original});
 const p=updateSectionData(f.state,"state-return",{...f.data,ohioPayments:{...required(f.data.ohioPayments),sourceReference:"Edited account source"}});
 expect(required(required(p.sectionData["state-return"]).ohioPayments).sourceFactsConfirmed).not.toBe(true);
 expect(required(p.sectionData["state-return"]).ohioPayments).toMatchObject({originalFederalSources:f.original});
 const unchanged=updateSectionData(f.state,"state-return",structuredClone(f.data));expect(unchanged.sectionData["state-return"]).toEqual(f.data);
});

it("Ohio nested remaining-payment source confirmation is an actual field edit", () => {
 const f=guidedOhioNavigationFixture();const next=updateSectionData(f.state,"state-return",{...f.data,ohioPayments:{...required(f.data.ohioPayments),remainingTaxPayment:{...required(f.data.ohioPayments).remainingTaxPayment,sourceFactsConfirmed:false}}});
 expect(required(required(next.sectionData["state-return"]).ohioPayments).sourceFactsConfirmed).not.toBe(true);
 expect(required(required(next.sectionData["state-return"]).ohioPayments).remainingTaxPayment.sourceFactsConfirmed).toBe(false);
 expect(required(next.sectionData["state-return"]).ohioPayments).toMatchObject({originalFederalSources:f.original});
});

function required<T>(value: T | undefined | null): T { if (value == null) throw new Error("Explicit source fixture value required"); return value; }
