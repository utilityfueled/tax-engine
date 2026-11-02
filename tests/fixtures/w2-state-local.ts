/** Explicit fictional reported source rows; no state/local liability is inferred. */
import { paOrdinaryResidencyFixture } from "./pa-residency-sources.js";
import type { W2StateLocalSources } from "@/models/w2-state-local.js";
export function w2StateLocalFixture(year = 2025) {
  const { input } = paOrdinaryResidencyFixture("resident", year);
  input.form1099Int = [];
  input.taxpayer.primary.lastName = "MultiState";
  Object.assign(input.w2s[0], { federalWithheld: "5000", stateTaxWithheld: "1535", localWages: "50000", localTaxWithheld: "1875", localityName: "Philadelphia" });
  const current = input.taxpayer.primary;
  const sources: W2StateLocalSources = {
    sourceTaxYear: year, sourceReference: "fictional-private-W2-economic-original", sourceFactsConfirmed: true,
    owner: { accountHolder: "primary", originalTaxpayer: { firstName: current.firstName, lastName: current.lastName, ssn: current.ssn } },
    originalW2: structuredClone(input.w2s[0]), currentUncorrectedNonvoidOriginalConfirmed: true,
    allOriginalBoxesKnownConfirmed: true, singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
    stateReporting: "multiple", localReporting: "multiple", legacyScalarProjection: "first_entered_rows",
    stateRows: [
      { printedRow: 1, sourceReference: "fictional-private-printed-state-1", state: "PA", employerStateIDStatus: "reported", employerStateID: "PA-actual-employer-ID", wages: "50000", withheld: "1535" },
      { printedRow: 2, sourceReference: "fictional-private-printed-state-2", state: "OH", employerStateIDStatus: "reported", employerStateID: "OH-actual-employer-ID", wages: "50000", withheld: "1000" },
    ],
    localRows: [
      { printedRow: 1, sourceReference: "fictional-private-printed-local-1", localityNameStatus: "reported", localityName: "Philadelphia", wages: "50000", withheld: "1875" },
      { printedRow: 2, sourceReference: "fictional-private-printed-local-2", localityNameStatus: "reported", localityName: "Columbus", wages: "50000", withheld: "1250" },
    ],
  };
  return { input, sources };
}
