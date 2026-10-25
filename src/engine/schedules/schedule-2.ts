/**
 * Schedule 2 — Additional Taxes
 * Spec: spec/federal/schedule-2.yaml
 *
 * Part I: AMT + excess PTC repayment
 * Part II: SE tax, Additional Medicare, NIIT, etc.
 * Total flows to Form 1040 Line 23.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Schedule2Input {
  amt?: Decimal; // Line 2 (Form 6251)
  excessAPTCRepayment?: Decimal; // Line 1a
  selfEmploymentTax: Decimal; // Line 4 (Schedule SE)
  additionalMedicareTax: Decimal; // Line 11 (Form 8959)
  niitTax: Decimal; // Line 12 (Form 8960)
  hsaAdditionalTax?: Decimal; // Line 17c (Form 8889)
  hsaRecaptureTax?: Decimal; // Line 17d (Form 8889)
  unreportedSSTax?: Decimal; // Line 5 (Form 4137)
  form8919Tax?: Decimal; // Line 6
  uncollectedSSTax?: Decimal; // Line 13
  householdEmploymentTax?: Decimal; // Line 9 (Schedule H)
  penaltyTax?: Decimal; // Line 8 (Form 5329 early distribution and related retirement-plan tax)
  /** @deprecated Accepted for compatibility but never included; Form 2210 belongs on Form 1040 line 38. */
  estimatedTaxPenalty?: Decimal;
}

export interface Schedule2Result {
  amt: Decimal;
  excessAPTCRepayment: Decimal;
  partITotal: Decimal; // Line 3

  selfEmploymentTax: Decimal;
  unreportedSSTax: Decimal;
  form8919Tax: Decimal;
  additionalMedicareTax: Decimal;
  niitTax: Decimal;
  hsaAdditionalTax: Decimal;
  hsaRecaptureTax: Decimal;
  householdEmploymentTax: Decimal;
  partIITotal: Decimal; // Line 21

  totalAdditionalTaxes: Decimal; // Line 21 → 1040 Line 23

  lines: CalculatedLine[];
}

export function calculateSchedule2(input: Schedule2Input): Schedule2Result {
  const audit = new AuditTrail();

  // ── Part I ────────────────────────────────────────────

  const amt = input.amt ?? new Decimal(0);
  audit.record("Sched 2", "2", "AMT", amt, "Form 6251");

  const excessAPTCRepayment = input.excessAPTCRepayment ?? new Decimal(0);
  audit.record("Sched 2", "1a", "Excess APTC repayment", excessAPTCRepayment, "Form 8962");

  audit.record("Sched 2", "1z", "Additions to tax", excessAPTCRepayment, "Supported line 1a; other line 1 additions require separate support");
  const partITotal = amt.plus(excessAPTCRepayment);
  audit.record("Sched 2", "3", "Part I total", partITotal, "Line 1z + Line 2");

  // ── Part II ───────────────────────────────────────────

  audit.record("Sched 2", "4", "Self-employment tax", input.selfEmploymentTax, "Schedule SE Line 12");
  const unreportedSSTax = input.unreportedSSTax ?? new Decimal(0);
  audit.record(
    "Sched 2",
    "5",
    "Additional Social Security and Medicare tax on tips",
    unreportedSSTax,
    "Form 4137 Line 13"
  );

  const form8919Tax = input.form8919Tax ?? new Decimal(0);
  audit.record(
    "Sched 2",
    "6",
    "Uncollected Social Security and Medicare tax on wages",
    form8919Tax,
    "Form 8919 Line 13"
  );

  const line7 = unreportedSSTax.plus(form8919Tax);
  audit.record(
    "Sched 2",
    "7",
    "Total of lines 5 and 6",
    line7,
    "Line 5 + Line 6",
    {
      "Line 5": unreportedSSTax,
      "Line 6": form8919Tax,
    }
  );

  const uncollectedSSTax = input.uncollectedSSTax ?? new Decimal(0);
  audit.record(
    "Sched 2",
    "13",
    "Uncollected Social Security, Medicare, or RRTA tax",
    uncollectedSSTax,
    "Uncollected Social Security, Medicare, or RRTA tax on tips or group-term life insurance"
  );

  const penaltyTax = input.penaltyTax ?? new Decimal(0);
  audit.record(
    "Sched 2",
    "8",
    "Additional tax on IRAs and other qualified retirement plans",
    penaltyTax,
    "Form 5329 additional tax on early or other supported retirement-plan distributions"
  );

  audit.record("Sched 2", "11", "Additional Medicare Tax", input.additionalMedicareTax, "Form 8959 Line 18");
  audit.record("Sched 2", "12", "Net Investment Income Tax", input.niitTax, "Form 8960 Line 17");
  const hsaAdditionalTax = input.hsaAdditionalTax ?? new Decimal(0);
  audit.record("Sched 2", "17c", "Additional tax on HSA distributions", hsaAdditionalTax, "Form 8889 Line 17b");
  const hsaRecaptureTax = input.hsaRecaptureTax ?? new Decimal(0);
  audit.record("Sched 2", "17d", "Additional tax from HSA testing-period failure", hsaRecaptureTax, "Form 8889 Line 21");

  const householdEmploymentTax = input.householdEmploymentTax ?? new Decimal(0);
  audit.record("Sched 2", "9", "Household employment taxes", householdEmploymentTax, "Schedule H Line 26");

  const partIITotal = sum(
    input.selfEmploymentTax,
    line7,
    penaltyTax,
    householdEmploymentTax,
    input.additionalMedicareTax,
    input.niitTax,
    uncollectedSSTax,
    hsaAdditionalTax,
    hsaRecaptureTax
  );
  audit.record("Sched 2", "18", "Subtotal of line 17 additional taxes", hsaAdditionalTax.plus(hsaRecaptureTax), "Supported lines 17c + 17d");
  audit.record("Sched 2", "19", "Net elective-payment recapture", new Decimal(0), "No supported Form 4255 recapture; estimated-tax penalty is reported on Form 1040 line 38");
  const totalAdditionalTaxes = partIITotal;
  audit.record("Sched 2", "21", "Total other taxes", totalAdditionalTaxes, "Lines 4, 7 through 16, 18 and 19 → Form 1040 line 23; excludes Part I and estimated-tax penalty");

  return {
    amt,
    excessAPTCRepayment,
    partITotal,
    selfEmploymentTax: input.selfEmploymentTax,
    unreportedSSTax,
    form8919Tax,
    additionalMedicareTax: input.additionalMedicareTax,
    niitTax: input.niitTax,
    hsaAdditionalTax,
    hsaRecaptureTax,
    householdEmploymentTax,
    partIITotal,
    totalAdditionalTaxes,
    lines: audit.getLines(),
  };
}
