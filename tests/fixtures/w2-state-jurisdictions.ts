/** Actual synthetic originals; no additional state tax liability or eligibility inferred. */
import {w2StateLocalFixture} from "./w2-state-local.js";
export const sourceJurisdictions = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
export function singleJurisdictionFixture(code: string, year = 2025) {
  const f=w2StateLocalFixture(year), row=f.sources.stateRows[0]; if(!row)throw new Error("Actual source row required");
  Reflect.set(row,"state",code);row.withheld="800.25";row.employerStateID=`PRIVATE-${code}-ACTUAL-STATE-ID`;f.sources.stateRows=[row];f.sources.stateReporting="single";
  f.input.w2s[0].state=code;f.input.w2s[0].stateTaxWithheld="800.25";f.sources.originalW2=structuredClone(f.input.w2s[0]);f.input.w2s[0].stateLocalSources=f.sources;
  return f;
}
export function twoJurisdictionFixture(code="DE", year=2025) {
  const f=w2StateLocalFixture(year),second=f.sources.stateRows[1];if(!second)throw new Error("Actual second source row required");Reflect.set(second,"state",code);second.withheld=code==="DE"?"800":"1000";second.employerStateID=`PRIVATE-${code}-ACTUAL-STATE-ID`;f.input.w2s[0].stateLocalSources=f.sources;return f;
}
export function rebindJurisdictionW2(f: ReturnType<typeof twoJurisdictionFixture>) {
  const {stateLocalSources:_s,...original}=f.input.w2s[0];f.sources.originalW2=structuredClone(original);
}
