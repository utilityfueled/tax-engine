// Spec: spec/federal/guided-schedule-1-a.yaml.
import { expect, it } from "vitest";
import { buildW2Inputs, buildNecInputs } from "@/lib/guided-interview-bridge";
import { w2FactErrors } from "@/lib/guided-w2-facts";
import { businessFactErrors } from "@/lib/guided-business-facts";
import { completeW2Entry, completeBusinessSection } from "./complete-facts";
it("preserves actual reporting years tips overtime and unknown fields", () => {
  const entry = { ...completeW2Entry, sourceTaxYear: "2026", allocatedTips: "0", box12CodeTP: "9007199254740993.01", box12CodeTT: "0", treasuryTippedOccupationCodes: ["102", "106"] };
  expect(buildW2Inputs([entry])[0]).toMatchObject({ taxYear: 2026, allocatedTips: "0", box12CodeTP: "9007199254740993.01", box12CodeTT: "0", treasuryTippedOccupationCodes: ["102", "106"] });
  expect(buildW2Inputs([{ ...completeW2Entry }])[0]).toMatchObject({ taxYear: undefined, box12CodeTP: undefined, box12CodeTT: undefined, treasuryTippedOccupationCodes: undefined });
  expect(w2FactErrors([entry], "single", 2026)).toEqual({});
  for (const patch of [{ sourceTaxYear: "2025" }, { sourceTaxYear: "2026x" }, { box12CodeTP: "NaN" }, { box12CodeTT: "-1" }, { treasuryTippedOccupationCodes: ["102", "102"] }, { treasuryTippedOccupationCodes: ["10"] }]) expect(Object.keys(w2FactErrors([{ ...entry, ...patch }], "single", 2026)).length).toBeGreaterThan(0);
  const business = structuredClone(completeBusinessSection);
  business.necEntries = [{ payerName: "Actual client", payerTin: "12-3456789", accountHolder: "primary", nonemployeeCompensation: "9007199254740993.01", federalWithheld: "0", stateTaxReporting: "none", sourceTaxYear: "2026", cashTips: "9007199254740993.01", qualifiedOvertimeCompensation: "0", treasuryTippedOccupationCodes: ["102"] }];
  expect(buildNecInputs(business.necEntries)[0]).toMatchObject({ taxYear: 2026, cashTips: "9007199254740993.01", qualifiedOvertimeCompensation: "0", treasuryTippedOccupationCodes: ["102"] });
  expect(businessFactErrors(business, "single", [], undefined, 2026)).toEqual({});
  business.necEntries[0]!.sourceTaxYear = "2025"; expect(Object.keys(businessFactErrors(business, "single", [], undefined, 2026)).length).toBeGreaterThan(0);
  business.necEntries[0]!.sourceTaxYear = ""; business.necEntries[0]!.cashTips = ""; business.necEntries[0]!.qualifiedOvertimeCompensation = ""; business.necEntries[0]!.treasuryTippedOccupationCodes = undefined;
  expect(buildNecInputs(business.necEntries)[0]).toMatchObject({ taxYear: undefined, cashTips: undefined, qualifiedOvertimeCompensation: undefined, treasuryTippedOccupationCodes: undefined });
});
