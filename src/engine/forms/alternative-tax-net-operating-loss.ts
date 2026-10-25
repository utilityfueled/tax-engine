/** Separate alternative-tax carry ledger. Spec: alternative-tax-net-operating-loss.yaml. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { NetOperatingLossResult, NetOperatingLossVintageResult } from "./net-operating-loss.js";

export interface AlternativeTaxNolResult {
  sourceFactsVerified: true;
  calculationComplete: true;
  amtiBeforeAtnol: Decimal;
  modifiedAmtiBeforeAtnol: Decimal;
  deduction: Decimal;
  absorbed: Decimal;
  expired: Decimal;
  carryforward: Decimal;
  vintages: Array<NetOperatingLossVintageResult & { deduction: Decimal; absorbed: Decimal; expired: Decimal; remainingCarryforward: Decimal }>;
  lines: CalculatedLine[];
}

/** Inputs are validated independent AMT sources and engine-derived income contexts,
 * never regular-tax carry amounts or taxpayer-entered AMTI overrides. */
export function calculateAlternativeTaxNol(input: {
  taxYear: number;
  sources: NetOperatingLossResult;
  amtiBeforeAtnol: Decimal;
  modifiedAmtiBeforeAtnol: Decimal;
}): AlternativeTaxNolResult {
  if (![2025, 2026].includes(input.taxYear) || input.sources.sourceFactsVerified !== true) throw new Error("ATNOL requires verified actual-year source history");
  for (const amount of [input.amtiBeforeAtnol, input.modifiedAmtiBeforeAtnol]) {
    if (!(amount instanceof Decimal) || !amount.isFinite()) throw new Error("ATNOL canonical AMTI must be finite");
  }
  const amtiBeforeAtnol = roundDollar(input.amtiBeforeAtnol);
  const modifiedAmtiBeforeAtnol = roundDollar(input.modifiedAmtiBeforeAtnol);
  const currentLimit = roundDollar(zeroFloor(amtiBeforeAtnol).times("0.9"));
  const modifiedLimit = roundDollar(zeroFloor(modifiedAmtiBeforeAtnol).times("0.9"));
  let currentRemaining = currentLimit;
  let modifiedRemaining = modifiedLimit;
  const audit = new AuditTrail();
  audit.record("Alternative NOL Worksheet", "current-limit", "Current90percent ATNOLD limit", currentLimit,
    "90percent of canonical AMTI before ATNOLD; separate from regular172 deduction", { "AMTI before ATNOLD": amtiBeforeAtnol });
  audit.record("Alternative NOL Worksheet", "modified-limit", "Modified90percent absorption capacity", modifiedLimit,
    "Modified AMTI under172 and56(d)(1)(B)(ii), applying the alternative90percent limitation once",
    { "Modified AMTI": modifiedAmtiBeforeAtnol, "Complementary reserve": zeroFloor(modifiedAmtiBeforeAtnol).minus(modifiedLimit) });
  const vintages = input.sources.vintages.map(row => {
    const available = row.openingCarryforward.minus(row.expiredBeforeYear);
    const deduction = Decimal.min(available, currentRemaining);
    const absorbed = Decimal.min(available, modifiedRemaining);
    currentRemaining = currentRemaining.minus(deduction);
    modifiedRemaining = modifiedRemaining.minus(absorbed);
    const unused = available.minus(absorbed);
    const expires = row.lossTaxYear < 2018 && input.taxYear === row.lossTaxYear + 20;
    const expired = row.expiredBeforeYear.plus(expires ? unused : d("0"));
    const remainingCarryforward = expires ? d("0") : unused;
    if (!sum(absorbed, expired, remainingCarryforward).eq(row.openingCarryforward)) throw new Error("ATNOL closing source amounts must conserve the opening balance");
    audit.record("Alternative NOL Worksheet", row.sourceId, "Alternative-tax carry absorption", absorbed,
      "Oldest actual vintage first; current claim and modified carry use independent capacities",
      { "Opening carry": row.openingCarryforward, "Current deduction": deduction, "Expired": expired, "Remaining carry": remainingCarryforward });
    return { ...row, deduction, absorbed, expired, remainingCarryforward };
  });
  return { sourceFactsVerified: true, calculationComplete: true, amtiBeforeAtnol, modifiedAmtiBeforeAtnol,
    deduction: sum(...vintages.map(row => row.deduction)), absorbed: sum(...vintages.map(row => row.absorbed)),
    expired: sum(...vintages.map(row => row.expired)), carryforward: sum(...vintages.map(row => row.remainingCarryforward)),
    vintages, lines: audit.getLines() };
}
