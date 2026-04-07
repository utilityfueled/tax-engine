/**
 * New York MCTMT — Metropolitan Commuter Transportation Mobility Tax
 * for self-employed individuals.
 * Spec: spec/state/ny-mctmt.yaml
 *
 * Two-zone flat-rate tax on net SE earnings allocated to the MCTD.
 * Zone 1 (NYC): 0.60% for TY 2024-2025
 * Zone 2 (Suburban): 0.34% for TY 2023-2025
 * Cliff threshold: $50,000 — if exceeded, rate applies to full amount.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface MCTMTRateYear {
  zone1Rate: Decimal;
  zone2Rate: Decimal;
  threshold: Decimal;
}

export interface NYMCTMTInput {
  taxYear: number;

  /** Net SE earnings allocated to Zone 1 (NYC — 5 boroughs).
   *  This is the IRC §1402(a) amount (Schedule SE Part I Line 6)
   *  multiplied by the Zone 1 allocation percentage. */
  zone1Earnings?: Decimal | string | number;

  /** Net SE earnings allocated to Zone 2 (suburban MCTD counties:
   *  Dutchess, Nassau, Orange, Putnam, Rockland, Suffolk, Westchester). */
  zone2Earnings?: Decimal | string | number;

  /** Spouse Zone 1 earnings (MFJ only — each spouse evaluated separately). */
  spouseZone1Earnings?: Decimal | string | number;
  /** Spouse Zone 2 earnings (MFJ only). */
  spouseZone2Earnings?: Decimal | string | number;
}

export interface NYMCTMTZoneResult {
  zone: 1 | 2;
  earnings: Decimal;
  rate: Decimal;
  threshold: Decimal;
  exceedsThreshold: boolean;
  tax: Decimal;
}

export interface NYMCTMTResult {
  /** Zone 1 (NYC) result for primary taxpayer */
  zone1: NYMCTMTZoneResult;
  /** Zone 2 (suburban) result for primary taxpayer */
  zone2: NYMCTMTZoneResult;
  /** Zone 1 result for spouse (null if no spouse earnings) */
  spouseZone1: NYMCTMTZoneResult | null;
  /** Zone 2 result for spouse (null if no spouse earnings) */
  spouseZone2: NYMCTMTZoneResult | null;
  /** Total MCTMT (all zones, both spouses) */
  totalMCTMT: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

export const MCTMT_RATES: Record<number, MCTMTRateYear> = {
  2023: {
    zone1Rate: new Decimal("0.0047"),
    zone2Rate: new Decimal("0.0034"),
    threshold: new Decimal(50000),
  },
  2024: {
    zone1Rate: new Decimal("0.0060"),
    zone2Rate: new Decimal("0.0034"),
    threshold: new Decimal(50000),
  },
  2025: {
    zone1Rate: new Decimal("0.0060"),
    zone2Rate: new Decimal("0.0034"),
    threshold: new Decimal(50000),
  },
};

/* ---------- Helpers ---------- */

/**
 * Compute MCTMT for a single zone.
 * Cliff threshold: if earnings > threshold, rate × full earnings; else $0.
 */
export function computeZoneMCTMT(
  earnings: Decimal,
  rate: Decimal,
  threshold: Decimal
): Decimal {
  if (earnings.lessThanOrEqualTo(threshold)) return ZERO;
  return roundDollar(earnings.times(rate));
}

/* ---------- Main computation ---------- */

export function calculateNYMCTMT(input: NYMCTMTInput): NYMCTMTResult {
  const rates = MCTMT_RATES[input.taxYear];
  if (!rates) {
    throw new Error(`MCTMT rates not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const z1Earnings = d(input.zone1Earnings);
  const z2Earnings = d(input.zone2Earnings);
  const spZ1Earnings = d(input.spouseZone1Earnings);
  const spZ2Earnings = d(input.spouseZone2Earnings);

  const hasSpouse =
    !spZ1Earnings.equals(ZERO) || !spZ2Earnings.equals(ZERO);

  // Primary taxpayer Zone 1
  const z1Tax = computeZoneMCTMT(z1Earnings, rates.zone1Rate, rates.threshold);
  audit.record("NY-MCTMT", "54a", "Net SE earnings allocated to Zone 1 (NYC)",
    z1Earnings, "Schedule SE Line 6 × Zone 1 allocation %");
  audit.record("NY-MCTMT", "54c", "MCTMT on Zone 1 earnings", z1Tax,
    z1Earnings.greaterThan(rates.threshold)
      ? `${z1Earnings} × ${rates.zone1Rate} (exceeds $${rates.threshold} threshold)`
      : `$0 (earnings ≤ $${rates.threshold} threshold)`,
    { "Zone 1 earnings": z1Earnings.toString(), "Zone 1 rate": rates.zone1Rate.toString() });

  const zone1: NYMCTMTZoneResult = {
    zone: 1,
    earnings: z1Earnings,
    rate: rates.zone1Rate,
    threshold: rates.threshold,
    exceedsThreshold: z1Earnings.greaterThan(rates.threshold),
    tax: z1Tax,
  };

  // Primary taxpayer Zone 2
  const z2Tax = computeZoneMCTMT(z2Earnings, rates.zone2Rate, rates.threshold);
  audit.record("NY-MCTMT", "54b", "Net SE earnings allocated to Zone 2 (suburban)",
    z2Earnings, "Schedule SE Line 6 × Zone 2 allocation %");
  audit.record("NY-MCTMT", "54d", "MCTMT on Zone 2 earnings", z2Tax,
    z2Earnings.greaterThan(rates.threshold)
      ? `${z2Earnings} × ${rates.zone2Rate} (exceeds $${rates.threshold} threshold)`
      : `$0 (earnings ≤ $${rates.threshold} threshold)`,
    { "Zone 2 earnings": z2Earnings.toString(), "Zone 2 rate": rates.zone2Rate.toString() });

  const zone2: NYMCTMTZoneResult = {
    zone: 2,
    earnings: z2Earnings,
    rate: rates.zone2Rate,
    threshold: rates.threshold,
    exceedsThreshold: z2Earnings.greaterThan(rates.threshold),
    tax: z2Tax,
  };

  // Spouse zones (evaluated separately per MFJ rules)
  let spouseZone1: NYMCTMTZoneResult | null = null;
  let spouseZone2: NYMCTMTZoneResult | null = null;
  let spZ1Tax = ZERO;
  let spZ2Tax = ZERO;

  if (hasSpouse) {
    spZ1Tax = computeZoneMCTMT(spZ1Earnings, rates.zone1Rate, rates.threshold);
    spouseZone1 = {
      zone: 1,
      earnings: spZ1Earnings,
      rate: rates.zone1Rate,
      threshold: rates.threshold,
      exceedsThreshold: spZ1Earnings.greaterThan(rates.threshold),
      tax: spZ1Tax,
    };
    audit.record("NY-MCTMT", "54a-sp", "Spouse net SE earnings allocated to Zone 1",
      spZ1Earnings, "Spouse Schedule SE × Zone 1 allocation %");

    spZ2Tax = computeZoneMCTMT(spZ2Earnings, rates.zone2Rate, rates.threshold);
    spouseZone2 = {
      zone: 2,
      earnings: spZ2Earnings,
      rate: rates.zone2Rate,
      threshold: rates.threshold,
      exceedsThreshold: spZ2Earnings.greaterThan(rates.threshold),
      tax: spZ2Tax,
    };
    audit.record("NY-MCTMT", "54b-sp", "Spouse net SE earnings allocated to Zone 2",
      spZ2Earnings, "Spouse Schedule SE × Zone 2 allocation %");
  }

  const totalMCTMT = sum(z1Tax, z2Tax, spZ1Tax, spZ2Tax);
  audit.record("NY-MCTMT", "54e", "Total MCTMT", totalMCTMT,
    "Zone 1 tax + Zone 2 tax" + (hasSpouse ? " + spouse Zone 1 + spouse Zone 2" : ""), {
      "Zone 1 tax": z1Tax.toString(),
      "Zone 2 tax": z2Tax.toString(),
      ...(hasSpouse ? {
        "Spouse Zone 1 tax": spZ1Tax.toString(),
        "Spouse Zone 2 tax": spZ2Tax.toString(),
      } : {}),
    });

  return {
    zone1,
    zone2,
    spouseZone1,
    spouseZone2,
    totalMCTMT,
    lines: audit.getLines(),
  };
}
