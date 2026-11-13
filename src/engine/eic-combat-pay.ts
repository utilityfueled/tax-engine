import { EicConfigSchema, W2Schema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

/** IRC32(c)(2)(B)(vi). Resolve only an entered per-filer EIC election. */
export function resolveEicCombatPay(input: TaxYearInput) {
  const election = EicConfigSchema.shape.combatPayElection.parse(input.eic?.combatPayElection);
  if (election === undefined) return undefined;
  const { taxpayer, w2s } = input;
  const joint = taxpayer.filingStatus === "married_filing_jointly" && taxpayer.spouse !== undefined;
  if (election.spouse !== undefined && !joint) throw new Error("A spouse combat pay choice requires the spouse on an actual joint return");

  const reported = w2s.map(w2 => W2Schema.shape.box12CodeQ.parse(w2.box12CodeQ));
  if ((election.primary === true || election.spouse === true || reported.some(amount => d(amount).gt(0)))
    && reported.some(amount => amount === undefined)) {
    throw new Error("Confirm actual combat pay or the absence of Code Q on every W-2");
  }

  const totals = { primary: d(0), spouse: d(0) };
  for (const [index, w2] of w2s.entries()) {
    const amount = d(reported[index]);
    if (amount.isZero()) continue;
    const owner = w2.accountHolder;
    if (w2.taxYear !== taxpayer.taxYear || (owner !== "primary" && !(joint && owner === "spouse"))) {
      throw new Error("The EIC combat pay election requires the matching original W-2 year and owner for Code Q");
    }
    totals[owner] = totals[owner].plus(amount);
  }

  let elected = d(0);
  for (const owner of ["primary", "spouse"] as const) {
    if (totals[owner].gt(0) && election[owner] === undefined) throw new Error(`Confirm the ${owner} combat pay choice for the EIC`);
    if (election[owner] === true) {
      if (totals[owner].isZero()) throw new Error(`The ${owner} EIC election requires positive original combat pay`);
      elected = elected.plus(totals[owner]);
    }
  }
  return elected.gt(0) ? elected : undefined;
}
