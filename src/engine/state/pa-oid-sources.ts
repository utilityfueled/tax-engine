/** PA OID reconciliation: spec/state/pa-oid-sources.yaml. */
import Decimal from "decimal.js";
import type { Form1099OID, PAScheduleA } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

type SourceFacts = NonNullable<PAScheduleA["oidSources"]>[number];
export interface PAOIDSourcesResult {
  federalTaxableInterest: Decimal;
  federalTaxExemptInterest: Decimal;
  federalPremiumAddback: Decimal;
  paPremiumReduction: Decimal;
  paDirectObligationInterest: Decimal;
  usGovernmentInterest: Decimal;
  forfeitedInterestPenalty: Decimal;
  stateWithholding: Decimal;
  lines: CalculatedLine[];
}
function actual(value: string | undefined, name: string): Decimal {
  if (value === undefined || value.trim() === "") throw new Error(`PA OID requires actual ${name}.`);
  const number = d(value);
  if (!number.isFinite() || number.isNegative()) throw new Error(`PA OID ${name} must be finite and nonnegative.`);
  return number;
}

export function calculatePAOIDSources(forms: Form1099OID[], facts: SourceFacts[] | undefined, taxYear: number): PAOIDSourcesResult {
  const result: PAOIDSourcesResult = { federalTaxableInterest: d(0), federalTaxExemptInterest: d(0),
    federalPremiumAddback: d(0), paPremiumReduction: d(0), paDirectObligationInterest: d(0),
    usGovernmentInterest: d(0), forfeitedInterestPenalty: d(0), stateWithholding: d(0), lines: [] };
  if (forms.length === 0) {
    if (facts?.length) throw new Error("PA OID source facts have no matching source.");
    return result;
  }
  const federal = calculateForm1099OID(forms, taxYear);
  if (!federal.sourceFactsVerified) throw new Error("PA OID requires verified federal source facts.");
  if (!facts || facts.length !== forms.length || new Set(facts.map(row => row.sourceId)).size !== facts.length) {
    throw new Error("PA OID requires one actual reconciliation for each source.");
  }
  const audit = new AuditTrail();
  for (const [index, source] of federal.sources.entries()) {
    const form = forms[index];
    const row = facts.find(candidate => candidate.sourceId === source.sourceId);
    if (!row || row.factsConfirmed !== true || !row.sourceReference.trim()
      || !["taxable", "pennsylvania", "us_government"].includes(row.paTaxTreatment) || typeof row.strippedBond !== "boolean") {
      throw new Error("PA OID requires confirmed actual treatment and a source worksheet reference.");
    }
    const netted = actual(row.bondPremiumNettedOnStatement, "premium already netted on the statement");
    if (!form.interestReportedNetOfBondPremium && !netted.isZero()) throw new Error("PA OID statement premium contradicts gross interest reporting.");
    const federalPremium = source.bondPremiumInterestReduction.plus(netted);
    const paPremium = actual(row.paBondPremiumAmortization, "PA premium amortization");
    const currentMarket = form.marketDiscountElection === true
      ? d(form.marketDiscount).plus(form.recipientAdjustments?.marketDiscount ?? "0") : d(0);
    const ordinaryBeforePAPremium = source.taxableInterest.plus(source.taxExemptInterest).minus(currentMarket).plus(federalPremium);
    if (paPremium.gt(ordinaryBeforePAPremium)) throw new Error("PA OID premium exceeds same-source interest; an actual disposition worksheet is required.");
    const ordinary = ordinaryBeforePAPremium.minus(paPremium);
    let exempt = d(0);
    if (row.paTaxTreatment !== "taxable") {
      exempt = row.strippedBond ? actual(row.strippedBondExemptInterest, "stripped-bond exempt allocation") : ordinary;
      if (exempt.gt(ordinary)) throw new Error("PA OID exemption exceeds same-source ordinary interest.");
    }
    if (row.strippedBondExemptInterest !== undefined && (!row.strippedBond || row.paTaxTreatment === "taxable")) {
      throw new Error("PA OID stripped-bond exemption contradicts its actual classification.");
    }
    const taxable = ordinary.plus(currentMarket).minus(exempt);
    if (source.earlyWithdrawalPenalty.gt(taxable)) throw new Error("PA OID excess forfeited interest requires an actual disposition worksheet.");
    const paExempt = row.paTaxTreatment === "pennsylvania" ? exempt : d(0);
    const usExempt = row.paTaxTreatment === "us_government" ? exempt : d(0);
    const withholding = source.stateWithholding.reduce((total, state) => state.state === "PA" ? total.plus(state.stateWithheld) : total, d(0));
    for (const [key, value, formula] of [
      ["federalTaxableInterest", source.taxableInterest, "Verified federal taxable recipient interest"],
      ["federalTaxExemptInterest", source.taxExemptInterest, "Verified federal exempt recipient interest"],
      ["federalPremiumAddback", federalPremium, "Calculated federal coupon reduction + actual premium already netted on statement"],
      ["paPremiumReduction", paPremium, "Actual PA amortization worksheet; do not infer from federal method"],
      ["paDirectObligationInterest", paExempt, "Actual PA direct-obligation classification and any stripped allocation"],
      ["usGovernmentInterest", usExempt, "Actual U.S. direct-obligation classification and any stripped allocation"],
      ["forfeitedInterestPenalty", source.earlyWithdrawalPenalty, "Actual same-source penalty bounded by PA-taxable interest"],
      ["stateWithholding", withholding, "Actual PA Box 12/14 rows only"],
    ] as const) {
      result[key] = result[key].plus(value);
      audit.record("PA-OID-Sources", `${source.sourceId}:${key}`, key, value, `${formula}; ${row.sourceReference}`);
    }
  }
  result.lines = audit.getLines();
  return result;
}
