/**
 * Form 4797 — Sales of Business Property
 * Spec: spec/federal/form-4797.yaml
 *
 * Part I:   Section 1231 gains and losses (long-term business property
 *           not subject to depreciation recapture).
 * Part II:  Ordinary gains and losses — recapture from Part III plus
 *           short-term property sales.
 * Part III: Per-property depreciation recapture under IRC §§1245 and 1250.
 */

import Decimal from "decimal.js";
import type { Form4797PropertySale, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

// ── Per-property Part III result ─────────────────────────────────
export interface PropertyRecaptureResult {
  description: string;
  propertyType: "section1245" | "section1250";
  heldMoreThanOneYear: boolean;
  costOrBasis: Decimal;            // Line 20
  depreciationAllowed: Decimal;    // Line 21
  adjustedBasis: Decimal;          // Line 22
  grossSalesPrice: Decimal;
  totalGain: Decimal;              // Line 24 (floored at 0 for Part III)
  totalGainOrLoss: Decimal;        // actual gain or loss
  section1245Recapture: Decimal;   // Line 25a
  section1250Recapture: Decimal;   // Line 25b
  totalRecapture: Decimal;         // Line 26
  nonRecaptureGain: Decimal;       // Line 27
  section1231Gain: Decimal;        // Line 29 (if held >1 year)
  unrecapturedSection1250Gain: Decimal;
}

// ── Form 4797 aggregate result ───────────────────────────────────
export interface Form4797Result {
  // Part I
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line11: Decimal;
  line12: Decimal;
  longTermCapitalGain: Decimal;

  // Part II
  partIIRecapture: Decimal;             // Line 17
  partIIShortTermOrdinary: Decimal;     // Line 18a
  partIIOrdinaryTotal: Decimal;         // Line 18b

  // Part III
  propertyResults: PropertyRecaptureResult[];
  totalUnrecapturedSection1250Gain: Decimal;

  // Combined routing
  ordinaryGainOrLoss: Decimal;
  supportedForm8824Section1231GainOrLoss: Decimal;
  supportedForm8824OrdinaryIncome: Decimal;

  // K-1 tracking (preserved from Part I)
  supportedK1Section1231Gains: Decimal;
  supportedK1Section1231NonpassiveLosses: Decimal;
  deferredPassiveK1Section1231Losses: Decimal;

  lines: CalculatedLine[];
}

export interface Form4797ExtraInput {
  supportedForm8824Section1231GainOrLoss?: Decimal;
  supportedForm8824OrdinaryIncome?: Decimal;
}

// ── Part III: Per-property depreciation recapture ────────────────
function calculatePartIII(sale: Form4797PropertySale): PropertyRecaptureResult {
  const costOrBasis = d(sale.costOrBasis);
  const depreciationAllowed = d(sale.depreciationAllowed);
  const grossSalesPrice = d(sale.grossSalesPrice);
  const adjustedBasis = costOrBasis.minus(depreciationAllowed);
  const totalGainOrLoss = grossSalesPrice.minus(adjustedBasis);
  // Part III only applies to gains; losses bypass recapture
  const totalGain = Decimal.max(new Decimal(0), totalGainOrLoss);

  let section1245Recapture = new Decimal(0);
  let section1250Recapture = new Decimal(0);

  if (totalGain.greaterThan(0)) {
    if (sale.propertyType === "section1245") {
      // IRC §1245(a)(1): ALL depreciation is recaptured as ordinary, up to gain
      section1245Recapture = Decimal.min(totalGain, depreciationAllowed);
    } else if (sale.propertyType === "section1250") {
      // IRC §1250(a)(1): Only EXCESS of actual over straight-line is ordinary
      const straightLine = sale.straightLineDepreciation !== undefined
        ? d(sale.straightLineDepreciation)
        : depreciationAllowed; // default: all SL → $0 excess (post-1986 MACRS)
      const excessDepreciation = Decimal.max(
        new Decimal(0),
        depreciationAllowed.minus(straightLine)
      );
      section1250Recapture = Decimal.min(totalGain, excessDepreciation);
    }
  }

  const totalRecapture = section1245Recapture.plus(section1250Recapture);
  const nonRecaptureGain = Decimal.max(new Decimal(0), totalGain.minus(totalRecapture));

  // Section 1231 gain: non-recapture gain on property held > 1 year
  const section1231Gain = sale.heldMoreThanOneYear ? nonRecaptureGain : new Decimal(0);

  // Unrecaptured §1250 gain: straight-line depreciation on §1250 property
  // that wasn't recaptured as ordinary but is taxed at max 25% rate
  let unrecapturedSection1250Gain = new Decimal(0);
  if (sale.propertyType === "section1250" && sale.heldMoreThanOneYear && totalGain.greaterThan(0)) {
    // The depreciation that is NOT ordinary recapture, limited by remaining gain
    const depreciationNotRecaptured = depreciationAllowed.minus(section1250Recapture);
    const gainAfterRecapture = totalGain.minus(section1250Recapture);
    unrecapturedSection1250Gain = Decimal.min(gainAfterRecapture, depreciationNotRecaptured);
  }

  return {
    description: sale.description,
    propertyType: sale.propertyType,
    heldMoreThanOneYear: sale.heldMoreThanOneYear,
    costOrBasis,
    depreciationAllowed,
    adjustedBasis,
    grossSalesPrice,
    totalGain,
    totalGainOrLoss,
    section1245Recapture,
    section1250Recapture,
    totalRecapture,
    nonRecaptureGain,
    section1231Gain,
    unrecapturedSection1250Gain,
  };
}

// ── Main calculation ─────────────────────────────────────────────
export function calculateForm4797(input: TaxYearInput, extra?: Form4797ExtraInput): Form4797Result {
  const audit = new AuditTrail();
  const propertySales = input.form4797?.propertySales ?? [];
  const supportedForm8824Section1231GainOrLoss = extra?.supportedForm8824Section1231GainOrLoss ?? new Decimal(0);
  const supportedForm8824OrdinaryIncome = extra?.supportedForm8824OrdinaryIncome ?? new Decimal(0);

  // ── Part III: Compute per-property recapture ───────────────────
  const propertyResults = propertySales.map((sale) => calculatePartIII(sale));

  for (const pr of propertyResults) {
    const label = pr.description;
    audit.record("Form 4797 Part III", `20 (${label})`, "Cost or other basis", pr.costOrBasis,
      "Original cost plus improvements plus expense of sale");
    audit.record("Form 4797 Part III", `21 (${label})`, "Depreciation allowed or allowable", pr.depreciationAllowed,
      "Total depreciation claimed on the property");
    audit.record("Form 4797 Part III", `22 (${label})`, "Adjusted basis", pr.adjustedBasis,
      "Line 20 minus Line 21", {
        "Line 20": pr.costOrBasis,
        "Line 21": pr.depreciationAllowed,
      });
    audit.record("Form 4797 Part III", `24 (${label})`, "Total gain", pr.totalGain,
      "Gross selling price minus adjusted basis", {
        "Gross selling price": pr.grossSalesPrice,
        "Adjusted basis": pr.adjustedBasis,
        "Gain or loss": pr.totalGainOrLoss,
      });

    if (pr.propertyType === "section1245") {
      audit.record("Form 4797 Part III", `25a (${label})`, "Section 1245 recapture", pr.section1245Recapture,
        "Lesser of depreciation allowed or total gain (IRC §1245(a)(1))", {
          "Depreciation allowed": pr.depreciationAllowed,
          "Total gain": pr.totalGain,
        });
    } else {
      audit.record("Form 4797 Part III", `25b (${label})`, "Section 1250 ordinary recapture", pr.section1250Recapture,
        "Lesser of excess depreciation over straight-line or total gain (IRC §1250(a)(1))", {
          "Depreciation allowed": pr.depreciationAllowed,
          "Total gain": pr.totalGain,
        });
    }

    audit.record("Form 4797 Part III", `26 (${label})`, "Total recapture", pr.totalRecapture,
      "Sum of section 1245 and section 1250 recapture", {
        "Section 1245": pr.section1245Recapture,
        "Section 1250": pr.section1250Recapture,
      });
    audit.record("Form 4797 Part III", `27 (${label})`, "Gain minus recapture", pr.nonRecaptureGain,
      "Line 24 minus Line 26", {
        "Total gain": pr.totalGain,
        "Total recapture": pr.totalRecapture,
      });

    if (pr.unrecapturedSection1250Gain.greaterThan(0)) {
      audit.record("Form 4797 Part III", `unrec1250 (${label})`,
        "Unrecaptured section 1250 gain (25% max rate)", pr.unrecapturedSection1250Gain,
        "Straight-line depreciation portion not recaptured as ordinary (IRC §1(h)(6))", {
          "Depreciation allowed": pr.depreciationAllowed,
          "Section 1250 ordinary recapture": pr.section1250Recapture,
          "Total gain": pr.totalGain,
        });
    }
  }

  // ── Part II: Aggregate ordinary amounts ────────────────────────
  // Line 17: Sum of recapture from Part III
  const partIIRecapture = sum(...propertyResults.map((pr) => pr.totalRecapture));
  audit.record("Form 4797", "17", "Recapture from Part III", partIIRecapture,
    "Sum of Part III Line 26 for all properties");

  // Line 18a: Short-term property gains/losses (held ≤1 year, entire amount is ordinary)
  const shortTermProperties = propertyResults.filter((pr) => !pr.heldMoreThanOneYear);
  const partIIShortTermOrdinary = sum(
    ...shortTermProperties.map((pr) => pr.nonRecaptureGain),
    // Also include losses from short-term properties
    ...propertySales
      .filter((s) => !s.heldMoreThanOneYear)
      .map((s) => {
        const adj = d(s.costOrBasis).minus(d(s.depreciationAllowed));
        const gl = d(s.grossSalesPrice).minus(adj);
        return gl.isNegative() ? gl : new Decimal(0);
      })
  );
  audit.record("Form 4797", "18a", "Short-term property gains and losses", partIIShortTermOrdinary,
    "Total gains/losses from property held one year or less");

  // Line 18b: Part II total = recapture + short-term
  const partIIOrdinaryTotal = partIIRecapture.plus(partIIShortTermOrdinary);
  audit.record("Form 4797", "18b", "Part II total ordinary gain or loss", partIIOrdinaryTotal,
    "Line 17 + Line 18a", {
      "Line 17 (recapture)": partIIRecapture,
      "Line 18a (short-term)": partIIShortTermOrdinary,
    });

  // ── Part I: Section 1231 gains and losses ──────────────────────
  // K-1 defaults (existing logic)
  const supportedK1Section1231Gains = sum(
    ...input.scheduleK1
      .map((k1) => d(k1.section1231Gain))
      .filter((amount) => amount.greaterThan(0))
  );
  const supportedK1Section1231NonpassiveLosses = sum(
    ...input.scheduleK1
      .filter((k1) => !k1.isPassiveActivity)
      .map((k1) => d(k1.section1231Gain))
      .filter((amount) => amount.isNegative())
  );
  const deferredPassiveK1Section1231Losses = sum(
    ...input.scheduleK1
      .filter((k1) => k1.isPassiveActivity)
      .map((k1) => d(k1.section1231Gain))
      .filter((amount) => amount.isNegative())
  );

  // Property sale section 1231 contributions (held > 1 year)
  const propertySaleSection1231Gain = sum(
    ...propertyResults
      .filter((pr) => pr.heldMoreThanOneYear)
      .map((pr) => pr.section1231Gain)
  );
  // Losses on property held > 1 year (Part III doesn't apply to losses, they go to Part I)
  const propertySaleSection1231Loss = sum(
    ...propertyResults
      .filter((pr) => pr.heldMoreThanOneYear && pr.totalGainOrLoss.isNegative())
      .map((pr) => pr.totalGainOrLoss)
  );

  const line7 = input.form4797?.netSection1231GainOrLoss !== undefined
    ? d(input.form4797.netSection1231GainOrLoss)
    : sum(
        supportedK1Section1231Gains,
        supportedK1Section1231NonpassiveLosses,
        propertySaleSection1231Gain,
        propertySaleSection1231Loss,
        supportedForm8824Section1231GainOrLoss
      );
  const line8 = Decimal.max(new Decimal(0), d(input.form4797?.nonrecapturedNetSection1231Losses));
  const line9 = line7.greaterThan(0)
    ? Decimal.max(new Decimal(0), line7.minus(line8))
    : new Decimal(0);
  const line11 = line7.isNegative() ? line7 : new Decimal(0);
  const line12 = line7.greaterThan(0)
    ? Decimal.min(line7, line8)
    : new Decimal(0);
  const longTermCapitalGain = line9;

  // Combined ordinary: Part I ordinary + Part II ordinary
  const partIOrdinary = line11.plus(line12);
  const ordinaryGainOrLoss = partIOrdinary.plus(partIIOrdinaryTotal).plus(supportedForm8824OrdinaryIncome);

  // Total unrecaptured section 1250 gain from property sales
  const totalUnrecapturedSection1250Gain = sum(
    ...propertyResults.map((pr) => pr.unrecapturedSection1250Gain)
  );

  // ── Part I audit trail ─────────────────────────────────────────
  audit.record(
    "Form 4797",
    "7",
    "Net section 1231 gain or loss",
    line7,
    input.form4797?.netSection1231GainOrLoss !== undefined
      ? "Validated Form 4797 line 7 amount"
      : "K-1 defaults + property sale section 1231 amounts",
    {
      "Validated Form 4797 line 7 amount": input.form4797?.netSection1231GainOrLoss !== undefined
        ? d(input.form4797.netSection1231GainOrLoss)
        : new Decimal(0),
      "Supported attached Schedule K-1 box 10 gains": supportedK1Section1231Gains,
      "Supported attached nonpassive Schedule K-1 box 10 losses": supportedK1Section1231NonpassiveLosses,
      "Deferred passive Schedule K-1 box 10 losses": deferredPassiveK1Section1231Losses,
      "Property sale section 1231 gain": propertySaleSection1231Gain,
      "Property sale section 1231 loss": propertySaleSection1231Loss,
      "Supported Form 8824 section 1231 gain/loss": supportedForm8824Section1231GainOrLoss,
    }
  );
  audit.record(
    "Form 4797",
    "8",
    "Nonrecaptured net section 1231 losses from prior years",
    line8,
    "Validated nonrecaptured net section 1231 losses from the prior 5 years"
  );
  audit.record(
    "Form 4797",
    "9",
    "Net section 1231 gain treated as long-term capital gain",
    line9,
    line7.greaterThan(0)
      ? "Line 7 - Line 8, floored at $0"
      : "$0 because Line 7 is not a gain",
    {
      "Line 7": line7,
      "Line 8": line8,
    }
  );
  audit.record(
    "Form 4797",
    "11",
    "Net section 1231 loss treated as ordinary loss",
    line11,
    line7.isNegative()
      ? "Line 7 because the current-year net section 1231 result is a loss"
      : "$0 because Line 7 is not a loss",
    {
      "Line 7": line7,
    }
  );
  audit.record(
    "Form 4797",
    "12",
    "Current-year net section 1231 gain recaptured as ordinary income",
    line12,
    line7.greaterThan(0)
      ? "Smaller of Line 7 or Line 8"
      : "$0 because Line 7 is not a gain",
    {
      "Line 7": line7,
      "Line 8": line8,
      "Line 9": line9,
    }
  );

  if (supportedForm8824OrdinaryIncome.greaterThan(0)) {
    audit.record(
      "Form 4797",
      "15-8824",
      "Ordinary income from Form 8824 line 21 recapture",
      supportedForm8824OrdinaryIncome,
      "Supported Form 8824 line 21 amounts reported as ordinary income through Form 4797"
    );
  }

  if (totalUnrecapturedSection1250Gain.greaterThan(0)) {
    audit.record(
      "Form 4797",
      "unrec1250-total",
      "Total unrecaptured section 1250 gain from property sales",
      totalUnrecapturedSection1250Gain,
      "Sum of per-property unrecaptured section 1250 gain (25% max rate)"
    );
  }

  return {
    line7,
    line8,
    line9,
    line11,
    line12,
    longTermCapitalGain,
    partIIRecapture,
    partIIShortTermOrdinary,
    partIIOrdinaryTotal,
    propertyResults,
    totalUnrecapturedSection1250Gain,
    ordinaryGainOrLoss,
    supportedForm8824Section1231GainOrLoss,
    supportedForm8824OrdinaryIncome,
    supportedK1Section1231Gains,
    supportedK1Section1231NonpassiveLosses,
    deferredPassiveK1Section1231Losses,
    lines: audit.getLines(),
  };
}
