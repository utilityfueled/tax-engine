// @vitest-environment jsdom
// Spec: spec/federal/eic-combat-pay-election.yaml.
import { expect, it } from "vitest";
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { clearGuidedFlowState, emptyW2Entry, loadGuidedFlowState, saveGuidedFlowState, startInterview, updateSectionData, validateSection, type W2EntryData } from "@/lib/guided-interview-flow";
import { reportedCombatPayOwners, w2FactErrors } from "@/lib/guided-w2-facts";
import { completePersonalInfo } from "./complete-facts";

const w2: W2EntryData = {
  ...emptyW2Entry,
  employerName: "Fictional Original Employer",
  employerEin: "90-7000111",
  accountHolder: "primary",
  sourceTaxYear: "2025",
  wages: "2000",
  federalWithheld: "0",
  socialSecurityWages: "2000",
  socialSecurityTips: "0",
  socialSecurityWithheld: "124",
  medicareWages: "2000",
  medicareWithheld: "29",
  box10DependentCareBenefits: "0",
  stateTaxReporting: "none",
  box12CodeQ: "1000.10",
};

it("rejects malformed grouping in a reported Code Q original", () => {
  const invalid = [{ ...w2, box12CodeQ: "1,,000.10" }];
  expect(w2FactErrors(invalid, "single", 2025)["w2-0-box12CodeQ"]).toMatch(/actual nonnegative/i);
  expect(reportedCombatPayOwners(invalid)).toEqual([]);
  const valid = [{ ...w2, box12CodeQ: "1,000.10" }];
  expect(w2FactErrors(valid, "single", 2025)["w2-0-box12CodeQ"]).toBeUndefined();
  expect(reportedCombatPayOwners(valid)).toEqual(["primary"]);
});

it("requires an actual election for each owner and preserves exact source cents", () => {
  const state = startInterview({ filingStatus: "mfj", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "WA" }, 2025);
  state.sectionData["personal-info"] = structuredClone(completePersonalInfo);
  const entries: W2EntryData[] = [
    w2,
    { ...w2, accountHolder: "spouse", wages: "0", box12CodeQ: "2250.50" },
    { ...w2, employerEin: "90-7000112", box12CodeQ: undefined },
  ];
  const incomplete = updateSectionData(state, "income-w2", { entries });
  expect(validateSection(incomplete, "income-w2").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(incomplete)).toBeNull();
  const checkedEntries = [entries[0], entries[1], { ...entries[2], box12CodeQ: "0.00" }];
  const originals = updateSectionData(incomplete, "income-w2", { entries: checkedEntries });
  expect(buildGuidedW2SourceContext(originals)).not.toBeNull();
  expect(buildTaxInputFromGuidedData(originals)).toBeNull();
  const primary = updateSectionData(originals, "income-w2", { entries: checkedEntries, combatPayElection: { primary: false } });
  expect(buildTaxInputFromGuidedData(primary)).toBeNull();
  const both = updateSectionData(primary, "income-w2", { entries: checkedEntries, combatPayElection: { primary: false, spouse: true } });
  const workspace = "fictional-combat-pay-originals";
  saveGuidedFlowState(window.localStorage, workspace, both);
  const reopened = loadGuidedFlowState(window.localStorage, workspace);
  clearGuidedFlowState(window.localStorage, workspace);
  if (!reopened) throw new Error("Saved fictional combat-pay choices did not reopen");
  expect(validateSection(reopened, "income-w2").status).toBe("complete");
  const actual = buildTaxInputFromGuidedData(reopened);
  expect(actual?.eic?.combatPayElection).toEqual({ primary: false, spouse: true });
  expect(actual?.w2s.map(row => row.box12CodeQ)).toEqual(["1000.10", "2250.50", "0.00"]);

  const edited = updateSectionData(reopened, "income-w2", {
    ...reopened.sectionData["income-w2"],
    entries: [checkedEntries[0], { ...checkedEntries[1], box12CodeQ: "2250.51" }, checkedEntries[2]],
  });
  expect(edited.sectionData["income-w2"]?.combatPayElection).toEqual({ primary: false });
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
});
