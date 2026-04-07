/**
 * Form 4684 — Casualties and Thefts, Section A (Personal Use Property)
 * Spec: spec/federal/form-4684.yaml
 *
 * Computes deductible personal casualty and theft losses under IRC §165(h).
 * Post-TCJA (2018–2025): only federally declared disaster losses qualify.
 *
 * Per-property: loss = min(basis, FMV decrease) − insurance.
 * Per-event: aggregate property losses − $100 floor (IRC §165(h)(1)).
 * Aggregate: total losses − total gains − 10% AGI (IRC §165(h)(2)(A)).
 * Result flows to Schedule A Line 15.
 */

import Decimal from "decimal.js";
import type { Form4684Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

const ZERO = new Decimal(0);
const PER_EVENT_FLOOR = new Decimal(100);
const AGI_THRESHOLD_RATE = new Decimal("0.10");

export interface Form4684Result {
  /** Line 13: Total losses after per-event $100 floors */
  totalLosses: Decimal;
  /** Line 14: Total casualty gains (insurance > basis) */
  totalGains: Decimal;
  /** Line 15: Net casualty gain when gains > losses (→ Form 8949) */
  netCasualtyGain: Decimal;
  /** Line 18: Net loss before AGI threshold (losses − gains) */
  netLossBeforeAgi: Decimal;
  /** Line 19: 10% of AGI */
  tenPercentAgi: Decimal;
  /** Line 20: Deductible casualty loss (→ Schedule A Line 15) */
  deductibleLoss: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

interface PropertyResult {
  netLoss: Decimal;
  gain: Decimal;
}

function computeProperty(prop: {
  costOrBasis?: string;
  insuranceReimbursement?: string;
  fairMarketValueBefore?: string;
  fairMarketValueAfter?: string;
}): PropertyResult {
  const basis = Decimal.max(ZERO, d(prop.costOrBasis));
  const insurance = Decimal.max(ZERO, d(prop.insuranceReimbursement));
  const fmvBefore = Decimal.max(ZERO, d(prop.fairMarketValueBefore));
  const fmvAfter = Decimal.max(ZERO, d(prop.fairMarketValueAfter));

  // Line 7: FMV decrease
  const fmvDecrease = zeroFloor(fmvBefore.minus(fmvAfter));

  // Line 8: Smaller of basis or FMV decrease
  const lossBase = Decimal.min(basis, fmvDecrease);

  // Line 4: Gain when insurance exceeds basis
  const gain = zeroFloor(insurance.minus(basis));

  // Line 9: Net loss = max(0, lossBase − insurance)
  const netLoss = zeroFloor(lossBase.minus(insurance));

  return { netLoss, gain };
}

export function calculateForm4684(
  input: Form4684Input,
  agi: Decimal
): Form4684Result {
  const audit = new AuditTrail();

  for (const event of input.events) {
    if (!event.femaDeclarationNumber?.trim()) {
      const eventLabel = event.description?.trim() || "an unnamed casualty event";
      throw new Error(
        `Form 4684 personal casualty event "${eventLabel}" requires a FEMA declaration number in the supported 2025 slice`
      );
    }
  }

  let totalLosses = ZERO;
  let totalGains = ZERO;

  for (const event of input.events) {
    let eventLoss = ZERO;
    let eventGains = ZERO;

    for (const prop of event.properties) {
      const { netLoss, gain } = computeProperty(prop);
      eventLoss = eventLoss.plus(netLoss);
      eventGains = eventGains.plus(gain);
    }

    // Line 11-12: Per-event $100 floor on losses
    const eventLossAfterFloor = zeroFloor(eventLoss.minus(PER_EVENT_FLOOR));

    totalLosses = totalLosses.plus(eventLossAfterFloor);
    totalGains = totalGains.plus(eventGains);
  }

  // Line 13: Total losses
  audit.record("Form 4684", "13", "Total personal casualty losses (after $100 per-event floor)", totalLosses,
    "Sum of per-event losses after IRC §165(h)(1) $100 floor");

  // Line 14: Total gains
  audit.record("Form 4684", "14", "Total personal casualty gains", totalGains,
    "Sum of insurance/reimbursement amounts exceeding property basis");

  // Lines 15-20: Netting and AGI threshold
  let netCasualtyGain = ZERO;
  let netLossBeforeAgi = ZERO;
  let tenPercentAgi = ZERO;
  let deductibleLoss = ZERO;

  if (totalGains.greaterThan(totalLosses)) {
    // Line 15: Net gain → Form 8949/Schedule D
    netCasualtyGain = totalGains.minus(totalLosses);
    audit.record("Form 4684", "15", "Net casualty gain (→ Form 8949)", netCasualtyGain,
      `Gains ${totalGains} − losses ${totalLosses}`);
  } else {
    // Line 18: Net loss
    netLossBeforeAgi = zeroFloor(totalLosses.minus(totalGains));
    audit.record("Form 4684", "18", "Net casualty loss before AGI threshold", netLossBeforeAgi,
      `Losses ${totalLosses} − gains ${totalGains}`);

    // Line 19: 10% of AGI
    tenPercentAgi = Decimal.max(ZERO, agi).times(AGI_THRESHOLD_RATE);
    audit.record("Form 4684", "19", "10% of AGI", tenPercentAgi,
      `10% × ${agi}`);

    // Line 20: Deductible loss → Schedule A Line 15
    deductibleLoss = zeroFloor(netLossBeforeAgi.minus(tenPercentAgi));
    audit.record("Form 4684", "20", "Deductible casualty loss (→ Schedule A Line 15)", deductibleLoss,
      `max(0, ${netLossBeforeAgi} − ${tenPercentAgi})`);
  }

  return {
    totalLosses,
    totalGains,
    netCasualtyGain,
    netLossBeforeAgi,
    tenPercentAgi,
    deductibleLoss,
    lines: audit.getLines(),
  };
}
