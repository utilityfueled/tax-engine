// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { validateSection, updateSectionData } from "@/lib/guided-interview-flow";
import { healthInsuranceSourceErrors } from "@/lib/guided-health-insurance-facts";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { guidedMarketplaceNonspecifiedStopState } from "../fixtures/guided-marketplace-nonspecified-stop";

it("passes complete original plans through the actual published stop", () => {
  const state = guidedMarketplaceNonspecifiedStopState(), before = JSON.stringify(state);
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(validateSection(state, "credits").status).toBe("complete");
  const built = buildTaxInputFromGuidedData(state); expect(built).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(built));
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7646");
  expect(result.agi.toFixed()).toBe("47000");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("4515");
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-nonspecified-stop-2025");
  expect(built?.form7206?.plans?.map(row => [row.businessSourceId, row.accountHolder, row.marketplaceCoverage])).toEqual([
    ["scheduleC", "primary", true], ["formW2:0", "spouse", false], ["scheduleC", "primary", false],
  ]);
  expect(JSON.stringify(state)).toBe(before);
  const original = state.sectionData.adjustments;
  if (!original) throw new Error("Missing actual adjustment sources");
  const changed = structuredClone(original), payment = changed.healthInsuranceFacts?.plans[2]?.payments[0];
  if (!payment) throw new Error("Missing actual third-plan payment");
  payment.ownerOrBusinessPaid = "";
  const edited = updateSectionData(state, "adjustments", changed);
  expect(edited.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
  expect(healthInsuranceSourceErrors(edited)).not.toEqual({});
});
