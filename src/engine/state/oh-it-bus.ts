/**
 * Ohio IT BUS — Schedule of Business Income.
 * Spec: spec/state/oh-it-bus.yaml
 *
 * Breaks down qualifying business income from federal tax documents into
 * individual source lines. The total flows to Schedule of Adjustments line 15
 * where the business income deduction ($250K/$125K MFS cap) is applied.
 *
 * Sources:
 *   Line 1: Schedule C net profit/loss (self-employment)
 *   Line 2: Schedule F net farm profit/loss
 *   Line 3: K-1 guaranteed payments (Box 4) — all K-1s
 *   Line 4: K-1 ordinary business income (Box 1) — active/non-passive only
 *   Line 5: Other qualifying business income (pass-through)
 *   Line 6: Total qualifying business income (sum of 1-5)
 *
 * R.C. 5747.01(A)(31).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

/** Per-K-1 business income data needed by IT BUS. */
export interface ITBusK1Entry {
  /** Partnership/S-corp name (for audit trail). */
  entityName: string;
  /** Box 1: ordinary business income/loss. */
  ordinaryIncome?: Decimal | string | number;
  /** Box 4: guaranteed payments. */
  guaranteedPayments?: Decimal | string | number;
  /** Whether this activity is passive (non-material participation). */
  isPassiveActivity?: boolean;
}

export interface OhioITBusInput {
  /** Schedule C net profit/loss from federal Schedule C, line 31. Default 0. */
  scheduleCNetProfit?: Decimal | string | number;
  /** Schedule F net farm profit/loss from federal Schedule F, line 34. Default 0. */
  scheduleFNetFarmProfit?: Decimal | string | number;
  /** K-1 entries with business income data. */
  k1Entries?: ITBusK1Entry[];
  /** Other qualifying business income not captured above. Default 0. */
  otherBusinessIncome?: Decimal | string | number;
}

export interface OhioITBusResult {
  line1_scheduleCNetProfit: Decimal;
  line2_scheduleFNetFarmProfit: Decimal;
  line3_k1GuaranteedPayments: Decimal;
  line4_k1ActiveOrdinaryIncome: Decimal;
  line5_otherBusinessIncome: Decimal;
  line6_totalQualifyingBusinessIncome: Decimal;

  /** Per-K-1 detail for audit trail. */
  k1Details: Array<{
    entityName: string;
    guaranteedPayments: Decimal;
    activeOrdinaryIncome: Decimal;
    isPassive: boolean;
  }>;

  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioITBus(input: OhioITBusInput): OhioITBusResult {
  const audit = new AuditTrail();

  // Line 1 — Schedule C net profit/loss
  const line1 = d(input.scheduleCNetProfit);
  audit.record(
    "OH-IT-BUS", "1",
    "Schedule C net profit or loss",
    line1,
    "Federal Schedule C, line 31",
  );

  // Line 2 — Schedule F net farm profit/loss
  const line2 = d(input.scheduleFNetFarmProfit);
  audit.record(
    "OH-IT-BUS", "2",
    "Schedule F net farm profit or loss",
    line2,
    "Federal Schedule F, line 34",
  );

  // Lines 3 & 4 — K-1 breakdown
  let line3 = new Decimal(0);
  let line4 = new Decimal(0);
  const k1Details: OhioITBusResult["k1Details"] = [];

  if (input.k1Entries) {
    for (const k1 of input.k1Entries) {
      const gp = d(k1.guaranteedPayments);
      const ordinary = d(k1.ordinaryIncome);
      const isPassive = k1.isPassiveActivity ?? false;

      // Guaranteed payments always qualify (even from passive entities)
      line3 = line3.plus(gp);

      // Ordinary income only qualifies if actively participating
      const activeOrdinary = isPassive ? new Decimal(0) : ordinary;
      line4 = line4.plus(activeOrdinary);

      k1Details.push({
        entityName: k1.entityName,
        guaranteedPayments: gp,
        activeOrdinaryIncome: activeOrdinary,
        isPassive,
      });

      audit.record(
        "OH-IT-BUS", `K1-${k1.entityName}`,
        `K-1 business income: ${k1.entityName}`,
        gp.plus(activeOrdinary),
        isPassive
          ? "Passive entity — guaranteed payments only"
          : "Active entity — guaranteed payments + ordinary income",
        {
          "Guaranteed payments": gp,
          "Ordinary income": ordinary,
          "Active ordinary": activeOrdinary,
          "Is passive": isPassive.toString(),
        },
      );
    }
  }

  audit.record(
    "OH-IT-BUS", "3",
    "K-1 guaranteed payments (all entities)",
    line3,
    "Sum of K-1 Box 4 across all K-1s",
  );

  audit.record(
    "OH-IT-BUS", "4",
    "K-1 ordinary business income (active entities only)",
    line4,
    "Sum of K-1 Box 1 where !isPassiveActivity",
  );

  // Line 5 — Other qualifying business income
  const line5 = d(input.otherBusinessIncome);
  audit.record(
    "OH-IT-BUS", "5",
    "Other qualifying business income",
    line5,
    "Pass-through input",
  );

  // Line 6 — Total qualifying business income
  const line6 = sum(line1, line2, line3, line4, line5);
  audit.record(
    "OH-IT-BUS", "6",
    "Total qualifying business income",
    line6,
    "Sum of lines 1-5",
    {
      "Line 1 (Sch C)": line1,
      "Line 2 (Sch F)": line2,
      "Line 3 (K-1 GP)": line3,
      "Line 4 (K-1 active)": line4,
      "Line 5 (other)": line5,
    },
  );

  return {
    line1_scheduleCNetProfit: line1,
    line2_scheduleFNetFarmProfit: line2,
    line3_k1GuaranteedPayments: line3,
    line4_k1ActiveOrdinaryIncome: line4,
    line5_otherBusinessIncome: line5,
    line6_totalQualifyingBusinessIncome: line6,
    k1Details,
    lines: audit.getLines(),
  };
}
