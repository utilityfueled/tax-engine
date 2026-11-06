// @vitest-environment jsdom
// Spec: spec/federal/form-5695-source.yaml#guided-physical-controls.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildActualEnergyInput } from "@/lib/guided-energy-facts";
import { EnergySourceDetails } from "@/components/guided-interview/energy-source-details";
import { emptyEnergyCreditData, type EnergyCreditData } from "@/lib/guided-interview-flow";
import { energySource, sourceImprovement } from "../../fixtures/energy-source";
let container: HTMLDivElement, root: Root, latest: EnergyCreditData;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) {
  const item = [...container.querySelectorAll("label")].find(node => node.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  if (!item) throw new Error(`Missing ${label}`); return item;
}
async function change(label: string, value: string) {
  const input = control(label);
  await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(initial: EnergyCreditData = emptyEnergyCreditData) {
  latest = structuredClone(initial);
  function Harness() { const [data, setData] = useState(latest); return <EnergySourceDetails data={data} taxYear={2025} filingStatus="mfj" onChange={value => { latest = value; setData(value); }} />; }
  await act(async () => root.render(<Harness />));
}
const confirm = "Have you checked every installation, eligibility and allocation record after the last edit?";
describe("energy physical source interactions", () => {
  it("collects actual installation homes without copying a mailing address", async () => {
    await render(); await click("+ Add installation home");
    expect(latest.homes?.[0]).toMatchObject({ address: { street: "", city: "", state: "", zip: "" } });
    expect(control("Home owner on this return — home 1").value).toBe("");
    expect(control("Is this home in the United States? — home 1").value).toBe("");
    await change("Installation street — home 1", "19 Actual Install Street");
    await change("Home owner on this return — home 1", "primary");
    await change("Whose main home is this? — home 1", "primary");
    await change("Is this home jointly occupied with someone filing another return? — home 1", "true");
    expect(control("Have you included all occupants' corresponding property costs? — home 1").value).toBe("");
    await change("Have you included all occupants' corresponding property costs? — home 1", "true");
    await click("+ Add improvement");
    expect(latest.qualifiedImprovements?.[0].homeId).toBeUndefined();
    expect(latest.qualifiedImprovements?.[0].qualifiedCost).toBe("");
    await change("Installation home — improvement 1", latest.homes?.[0].id ?? "");
    await change("Improvement category", "exterior_door");
    await change("Do actual records establish this item's qualification?", "true");
    expect(control("Did original use begin with you? — improvement 1").value).toBe("");
    await change("Did original use begin with you? — improvement 1", "false");
    await change("Costs paid by all occupants — improvement 1", "2000.25");
    await change(confirm, "true");
    await change("Net qualified improvement cost", "1000.10");
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.qualifiedImprovements?.[0]).toMatchObject({ originalUseByTaxpayer: false, totalCostPaidByAllOccupants: "2000.25", qualifiedCost: "1000.10" });
    await click("Remove installation home 1");
    expect(latest.homes).toEqual([]); expect(latest.qualifiedImprovements?.[0].homeId).toBeTruthy();
  });
  it("keeps new clean-property capacities and association fractions unanswered", async () => {
    await render(); await click("Confirm no efficiency improvements"); await click("+ Add clean-energy property");
    await change("Clean-energy category", "battery");
    expect(control("Battery capacity in kilowatt-hours").value).toBe("");
    await change("Battery capacity in kilowatt-hours", "3.25");
    await change("Is this an association or cooperative cost share? — clean-energy property 1", "true");
    await change("Association's eligible cost — clean-energy property 1", "10000.25");
    await change("Actual share numerator — clean-energy property 1", "1");
    await change("Actual share denominator — clean-energy property 1", "10");
    await change("Allocation statement reference — clean-energy property 1", "Actual assessment");
    await change("Did both spouses own and live apart in separate main homes?", "false");
    expect(latest.qualifiedImprovements).toEqual([]);
    expect(latest.cleanEnergyProperties?.[0]).toMatchObject({ batteryKilowattHours: "3.25", associationCostShare: true, associationAllocation: { totalQualifiedCost: "10000.25", numerator: "1", denominator: "10", sourceReference: "Actual assessment" } });
    await change("Is this an association or cooperative cost share? — clean-energy property 1", "false");
    expect(latest.cleanEnergyProperties?.[0].associationAllocation?.sourceReference).toBe("Actual assessment");
    await click("Remove clean-energy property 1"); await click("Confirm no clean-energy properties");
    expect(latest.cleanEnergyProperties).toEqual([]);
    expect(buildActualEnergyInput(latest, 2025, "mfj")).toBeUndefined();
  });
  it("collects panel links and keeps source dates when the election changes", async () => {
    const panel = { ...sourceImprovement, sourceId: "panel", category: "electrical_panel" as const, installationCompletedDate: "2024-08-01" };
    const heat = { ...sourceImprovement, sourceId: "heat", category: "heat_pump_water_heater" as const };
    await render({ ...emptyEnergyCreditData, ...energySource, carryforwardSourceTaxYear: "2024", qualifiedImprovements: [panel, heat] });
    await change("Panel load capacity in amps — improvement 1", "200");
    await change("Was the installation consistent with the National Electric Code? — improvement 1", "true");
    await click("Add enabled property to panel 1");
    expect(control("Property enabled by panel 1 — link 1").value).toBe("");
    await change("Property enabled by panel 1 — link 1", "heat");
    await change("Are you electing to treat consecutive-year installations in the later year? — panel 1", "true");
    await change("Was a credit already claimed for this property in its earlier installation year? — improvement 1", "false");
    await change(confirm, "true");
    expect(latest.qualifiedImprovements?.[0]).toMatchObject({ enabledPropertyIds: ["heat"], panelLoadAmps: "200", panelCodeComplianceConfirmed: true, consecutiveYearElection: true, priorYearCreditClaimed: false, installationCompletedDate: "2024-08-01" });
    await change("Are you electing to treat consecutive-year installations in the later year? — panel 1", "false");
    expect(latest.sourceFactsConfirmed).toBeNull(); expect(latest.qualifiedImprovements?.[0].installationCompletedDate).toBe("2024-08-01");
    await click("Remove enabled-property link 1 from panel 1");
    expect(latest.qualifiedImprovements?.[0].enabledPropertyIds).toEqual([]);
    await change("Main-home start date, if needed — home 1", "2025-01-01");
    await change("Main-home end date, if needed — home 1", "2025-12-31");
    await change("Is this home in the United States? — home 1", "true");
    await change("Did you use this home as a residence? — home 1", "true");
    await change("Did you own this home? — home 1", "true");
    await change("Was this related to constructing a new home? — improvement 1", "false");
    await change("Prior-year Form 5695 carryforward", "100.25");
    expect(latest.carryforwardConfirmed).toBeNull();
    await change("Carryforward source tax year", "2024");
    await change("Is this carryforward confirmed from the prior-year Form 5695?", "true");
    expect(latest).toMatchObject({ priorYearCarryforward: "100.25", carryforwardConfirmed: true });
    await click("Remove improvement 2"); expect(latest.qualifiedImprovements).toHaveLength(1);
  });

});
