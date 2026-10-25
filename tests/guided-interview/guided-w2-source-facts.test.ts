// Spec: spec/federal/guided-input.yaml#w2-owner-and-source-state
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData, buildW2Inputs } from "@/lib/guided-interview-bridge";
import { emptyW2Entry, startInterview, validateSection, type W2EntryData } from "@/lib/guided-interview-flow";
import { completePersonalInfo } from "./complete-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";

const completeW2: W2EntryData = { ...emptyW2Entry, employerName: "Actual Employer", employerEin: "12-3456789", accountHolder: "spouse", wages: "9007199254740993.01", federalWithheld: "0", socialSecurityWages: "0", socialSecurityTips: "0", socialSecurityWithheld: "0", medicareWages: "0", medicareWithheld: "0", stateTaxReporting: "single", state: "NY", stateWages: "0.01", stateWithheld: "0" };
function flow(entry: W2EntryData = completeW2) {
  const state = startInterview({ filingStatus: "mfj", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "OH" }, 2025);
  state.sectionData["personal-info"] = structuredClone(completePersonalInfo);
  state.sectionData["income-w2"] = { entries: [entry] };
  return state;
}

describe("W-2 source facts", () => {
  it("preserves actual Social Security tips and keeps missing tips unknown", () => {
    expect(buildW2Inputs([{ ...completeW2, socialSecurityTips: "0.10" }])[0].socialSecurityTips).toBe("0.10");
    expect(buildW2Inputs([{ ...completeW2, socialSecurityTips: "0" }])[0].socialSecurityTips).toBe("0");
    expect(buildW2Inputs([{ ...completeW2, socialSecurityTips: undefined }])[0].socialSecurityTips).toBeUndefined();
    expect(buildTaxInputFromGuidedData(flow({ ...completeW2, socialSecurityTips: undefined }))).toBeNull();
    const pending = { ...completeW2, socialSecurityTips: "10.01", aiSuggestedFields: { socialSecurityTips: { sourceLabel: "Actual source", status: "pending-confirmation" as const } } };
    expect(buildW2Inputs([pending])[0].socialSecurityTips).toBeUndefined();
    expect(buildTaxInputFromGuidedData(flow(pending))).toBeNull();
  });

  it("preserves actual owners and source states without borrowing the mailing state", () => {
    const input = buildTaxInputFromGuidedData(flow());
    expect(input?.w2s[0]).toMatchObject({ accountHolder: "spouse", state: "NY", stateTaxWithheld: "0", wages: "9007199254740993.01" });
    expect(validateSection(flow(), "income-w2").status).toBe("complete");
    expect(buildW2Inputs([{ ...completeW2, state: undefined }])[0].state).toBeUndefined();
  });
  it("keeps explicit zero wages while blank payroll boxes remain unknown", () => {
    expect(buildW2Inputs([{ ...completeW2, wages: "0" }])).toHaveLength(1);
    const partial = buildW2Inputs([{ ...completeW2, federalWithheld: "", socialSecurityWages: "", medicareWithheld: "" }])[0];
    expect(partial.federalWithheld).toBeUndefined();
    expect(partial.socialSecurityWages).toBeUndefined();
    expect(partial.medicareWithheld).toBeUndefined();
    expect(buildTaxInputFromGuidedData(flow({ ...completeW2, socialSecurityWages: "" }))).toBeNull();
    expect(buildTaxInputFromGuidedData(flow({ ...completeW2, employerEin: "" }))).toBeNull();
    expect(buildTaxInputFromGuidedData(flow({ ...completeW2, accountHolder: undefined }))).toBeNull();
  });
  it("requires actual state reporting and rejects contradictory or multiple-state records", () => {
    for (const entry of [{ ...completeW2, state: "" }, { ...completeW2, stateTaxReporting: undefined }, { ...completeW2, stateTaxReporting: "multiple" as const }, { ...completeW2, stateWithheld: "" }, { ...completeW2, stateTaxReporting: "none" as const }]) {
      expect(buildTaxInputFromGuidedData(flow(entry))).toBeNull();
      expect(validateSection(flow(entry), "income-w2").status).toBe("partial");
    }
    const noState = { ...completeW2, stateTaxReporting: "none" as const, state: "", stateWages: "", stateWithheld: "" };
    expect(buildTaxInputFromGuidedData(flow(noState))?.w2s[0]).toMatchObject({ stateWages: "0", stateTaxWithheld: "0" });
    expect(buildTaxInputFromGuidedData(flow(noState))?.w2s[0].state).toBeUndefined();
    const single = flow(); single.segmentation.filingStatus = "single";
    expect(buildTaxInputFromGuidedData(single)).toBeNull();
  });
  it("cannot bypass pending source confirmation by calling the input builder directly", () => {
    const pending = { ...completeW2, aiSuggestedFields: { accountHolder: { sourceLabel: "Actual uploaded W-2", status: "pending-confirmation" as const } } };
    expect(buildW2Inputs([pending])[0].accountHolder).toBeUndefined();
    expect(buildTaxInputFromGuidedData(flow(pending))).toBeNull();
  });
  it("credits only withholding from the state selected for the preview", () => {
    const state = flow({ ...completeW2, accountHolder: "primary", wages: "30000", stateWages: "30000", stateWithheld: "123.45" });
    state.segmentation.filingStatus = "single";
    state.segmentation.stateCode = "PA";
    state.sectionData["personal-info"] = { ...completePersonalInfo, state: "PA" };
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0");
    state.sectionData["income-w2"]!.entries[0].state = "PA";
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("123.45");
  });
});
