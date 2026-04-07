/**
 * CLI entry point for running tax calculations.
 * Usage: pnpm calculate [input-dir]
 */

import { resolve } from "path";
import { calculateFederalTax } from "./engine/federal.js";
import { loadFromDirectory } from "./ingest/loader.js";

const inputDir = process.argv[2] || "data/input";
const resolvedDir = resolve(inputDir);

console.log(`Loading tax data from: ${resolvedDir}`);

try {
  const input = loadFromDirectory(resolvedDir);
  const result = calculateFederalTax(input);

  console.log("\n══════════════════════════════════════");
  console.log(`  ${result.taxYear} Federal Tax Return Summary`);
  console.log(`  Filing Status: ${result.filingStatus}`);
  console.log("══════════════════════════════════════\n");

  console.log("INCOME");
  console.log(`  Wages:              $${result.totalWages.toFixed(0)}`);
  console.log(`  Interest:           $${result.totalInterest.toFixed(0)}`);
  console.log(`  Dividends:          $${result.totalDividends.toFixed(0)}`);
  console.log(`  Capital Gain/Loss:  $${result.capitalGainLoss.toFixed(0)}`);
  console.log(`  Other Income:       $${result.otherIncome.toFixed(0)}`);
  console.log(`  ─────────────────────`);
  console.log(`  Total Income:       $${result.totalIncome.toFixed(0)}`);
  console.log(`  Adjustments:       -$${result.adjustmentsToIncome.toFixed(0)}`);
  console.log(`  AGI:                $${result.agi.toFixed(0)}`);

  console.log("\nDEDUCTIONS");
  console.log(`  Using: ${result.deductionUsed} ($${result.deductionAmount.toFixed(0)})`);
  console.log(`  Taxable Income:     $${result.taxableIncome.toFixed(0)}`);

  console.log("\nTAX");
  console.log(`  Income Tax:         $${result.totalTaxBeforeCredits.toFixed(0)}`);
  console.log(`  Credits:           -$${result.totalCredits.toFixed(0)}`);
  console.log(`  SE Tax:            +$${result.selfEmploymentTax.toFixed(0)}`);
  console.log(`  Add'l Medicare:    +$${result.additionalMedicareTax.toFixed(0)}`);
  console.log(`  NIIT:              +$${result.niitTax.toFixed(0)}`);
  console.log(`  ─────────────────────`);
  console.log(`  Total Tax:          $${result.totalTax.toFixed(0)}`);

  console.log("\nPAYMENTS");
  console.log(`  Withholding:        $${result.totalWithholding.toFixed(0)}`);
  console.log(`  Estimated:          $${result.estimatedTaxPayments.toFixed(0)}`);
  console.log(`  ─────────────────────`);
  console.log(`  Total Payments:     $${result.totalPayments.toFixed(0)}`);

  console.log("\nRESULT");
  if (result.refund.greaterThan(0)) {
    console.log(`  REFUND:             $${result.refund.toFixed(0)}`);
  } else {
    console.log(`  AMOUNT OWED:        $${result.amountOwed.toFixed(0)}`);
  }

  console.log("\n══════════════════════════════════════\n");
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
}
