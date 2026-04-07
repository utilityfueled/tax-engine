/**
 * Illinois Schedule G — Voluntary Charitable Donations
 * Spec: spec/state/il-schedule-g.yaml
 *
 * Computes the six supported 2025 voluntary charitable donation lines and the
 * total amount that flows to IL-1040 Line 35.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

export interface ScheduleGInput {
  taxYear: number;
  wildlifePreservationFund: Decimal;
  alzheimersFund: Decimal;
  assistanceToHomelessFund: Decimal;
  diabetesResearchFund: Decimal;
  hungerReliefFund: Decimal;
  ronaldMcDonaldHouseCharitiesFund: Decimal;
}

export interface ScheduleGResult {
  wildlifePreservationFund: Decimal;
  alzheimersFund: Decimal;
  assistanceToHomelessFund: Decimal;
  diabetesResearchFund: Decimal;
  hungerReliefFund: Decimal;
  ronaldMcDonaldHouseCharitiesFund: Decimal;
  totalDonations: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);

function validateDonationAmount(value: Decimal, label: string): void {
  if (value.lt(0)) {
    throw new Error(`Schedule G ${label} donation cannot be negative`);
  }

  if (!value.isInteger()) {
    throw new Error(`Schedule G ${label} donation must be a whole-dollar amount`);
  }
}

export function calculateScheduleG(input: ScheduleGInput): ScheduleGResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`Schedule G is not supported for tax year ${input.taxYear}`);
  }

  validateDonationAmount(input.wildlifePreservationFund, "Wildlife Preservation Fund");
  validateDonationAmount(input.alzheimersFund, "Alzheimer's Disease Research, Care, and Support Fund");
  validateDonationAmount(input.assistanceToHomelessFund, "Assistance to the Homeless Fund");
  validateDonationAmount(input.diabetesResearchFund, "Diabetes Research Fund");
  validateDonationAmount(input.hungerReliefFund, "Hunger Relief Fund");
  validateDonationAmount(input.ronaldMcDonaldHouseCharitiesFund, "Ronald McDonald House Charities Fund");

  const audit = new AuditTrail();
  const FORM = "Schedule G";

  const line1a = audit.record(
    FORM,
    "1a",
    "Wildlife Preservation Fund donation",
    input.wildlifePreservationFund,
    "Whole-dollar input amount or 0",
    { wildlifePreservationFund: input.wildlifePreservationFund },
  );
  const line1b = audit.record(
    FORM,
    "1b",
    "Alzheimer's Disease Research, Care, and Support Fund donation",
    input.alzheimersFund,
    "Whole-dollar input amount or 0",
    { alzheimersFund: input.alzheimersFund },
  );
  const line1c = audit.record(
    FORM,
    "1c",
    "Assistance to the Homeless Fund donation",
    input.assistanceToHomelessFund,
    "Whole-dollar input amount or 0",
    { assistanceToHomelessFund: input.assistanceToHomelessFund },
  );
  const line1d = audit.record(
    FORM,
    "1d",
    "Diabetes Research Fund donation",
    input.diabetesResearchFund,
    "Whole-dollar input amount or 0",
    { diabetesResearchFund: input.diabetesResearchFund },
  );
  const line1e = audit.record(
    FORM,
    "1e",
    "Hunger Relief Fund donation",
    input.hungerReliefFund,
    "Whole-dollar input amount or 0",
    { hungerReliefFund: input.hungerReliefFund },
  );
  const line1f = audit.record(
    FORM,
    "1f",
    "Ronald McDonald House Charities Fund donation",
    input.ronaldMcDonaldHouseCharitiesFund,
    "Whole-dollar input amount or 0",
    { ronaldMcDonaldHouseCharitiesFund: input.ronaldMcDonaldHouseCharitiesFund },
  );

  const line2 = audit.record(
    FORM,
    "2",
    "Total voluntary charitable donations",
    line1a.plus(line1b).plus(line1c).plus(line1d).plus(line1e).plus(line1f),
    "Line 1a + Line 1b + Line 1c + Line 1d + Line 1e + Line 1f",
    { line1a, line1b, line1c, line1d, line1e, line1f },
  );

  return {
    wildlifePreservationFund: line1a,
    alzheimersFund: line1b,
    assistanceToHomelessFund: line1c,
    diabetesResearchFund: line1d,
    hungerReliefFund: line1e,
    ronaldMcDonaldHouseCharitiesFund: line1f,
    totalDonations: line2,
    lines: audit.getLines(),
  };
}
