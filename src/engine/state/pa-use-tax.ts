/**
 * Pennsylvania Use Tax Worksheet
 * Spec: spec/state/pa-use-tax.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

export type PAUseTaxLocality =
  | "remainder_of_pa"
  | "allegheny_county"
  | "philadelphia";

interface PAUseTaxTableConfig {
  rate: Decimal;
  fixedAmounts: readonly [
    Decimal,
    Decimal,
    Decimal,
    Decimal,
    Decimal,
    Decimal,
    Decimal,
  ];
  highIncomeRate: Decimal;
  highIncomeCap: Decimal;
}

const d = (value: string | number) => new Decimal(value);

const PA_USE_TAX_CONSTANTS: Record<number, Record<PAUseTaxLocality, PAUseTaxTableConfig>> = {
  2024: {
    remainder_of_pa: {
      rate: d("0.06"),
      fixedAmounts: [d(6), d(12), d(17), d(23), d(32), d(44), d(57)],
      highIncomeRate: d("0.0003"),
      highIncomeCap: d(75),
    },
    allegheny_county: {
      rate: d("0.07"),
      fixedAmounts: [d(7), d(14), d(19), d(26), d(37), d(52), d(66)],
      highIncomeRate: d("0.00035"),
      highIncomeCap: d(88),
    },
    philadelphia: {
      rate: d("0.08"),
      fixedAmounts: [d(8), d(17), d(22), d(30), d(43), d(59), d(76)],
      highIncomeRate: d("0.0004"),
      highIncomeCap: d(100),
    },
  },
  2025: {
    remainder_of_pa: {
      rate: d("0.06"),
      fixedAmounts: [d(6), d(12), d(17), d(23), d(32), d(44), d(57)],
      highIncomeRate: d("0.0003"),
      highIncomeCap: d(75),
    },
    allegheny_county: {
      rate: d("0.07"),
      fixedAmounts: [d(7), d(14), d(19), d(26), d(37), d(52), d(66)],
      highIncomeRate: d("0.00035"),
      highIncomeCap: d(88),
    },
    philadelphia: {
      rate: d("0.08"),
      fixedAmounts: [d(8), d(17), d(22), d(30), d(43), d(59), d(76)],
      highIncomeRate: d("0.0004"),
      highIncomeCap: d(100),
    },
  },
  2026: {
    remainder_of_pa: {
      rate: d("0.06"),
      fixedAmounts: [d(6), d(12), d(17), d(23), d(32), d(44), d(57)],
      highIncomeRate: d("0.0003"),
      highIncomeCap: d(75),
    },
    allegheny_county: {
      rate: d("0.07"),
      fixedAmounts: [d(7), d(14), d(19), d(26), d(37), d(52), d(66)],
      highIncomeRate: d("0.00035"),
      highIncomeCap: d(88),
    },
    philadelphia: {
      rate: d("0.08"),
      fixedAmounts: [d(8), d(17), d(22), d(30), d(43), d(59), d(76)],
      highIncomeRate: d("0.0004"),
      highIncomeCap: d(100),
    },
  },
};

export interface PAUseTaxInput {
  taxYear: number;
  paTaxableIncome: Decimal;
  locality: PAUseTaxLocality;
  taxableItemPurchases: Decimal;
  taxableServicePurchases: Decimal;
  electEstimatedTable: boolean;
  salesTaxAlreadyPaid: Decimal;
  salesTaxAlreadyPaidEntries?: PAUseTaxSalesTaxPaidEntry[];
}

export interface PAUseTaxResult {
  paTaxableIncome: Decimal;
  locality: PAUseTaxLocality;
  taxableItemPurchases: Decimal;
  taxableServicePurchases: Decimal;
  totalTaxablePurchases: Decimal;
  taxRate: Decimal;
  actualPurchaseUseTax: Decimal;
  estimatedTableUseTax: Decimal;
  salesTaxAlreadyPaid: Decimal;
  totalUseTaxLiability: Decimal;
  lines: CalculatedLine[];
}

export interface PAUseTaxSalesTaxPaidEntry {
  taxablePurchaseAmount: Decimal;
  salesTaxPaid: Decimal;
}

function calculateEstimatedTableUseTax(
  paTaxableIncome: Decimal,
  config: PAUseTaxTableConfig,
): Decimal {
  if (paTaxableIncome.lessThanOrEqualTo(15000)) {
    return config.fixedAmounts[0];
  }
  if (paTaxableIncome.lessThanOrEqualTo(30000)) {
    return config.fixedAmounts[1];
  }
  if (paTaxableIncome.lessThanOrEqualTo(50000)) {
    return config.fixedAmounts[2];
  }
  if (paTaxableIncome.lessThanOrEqualTo(75000)) {
    return config.fixedAmounts[3];
  }
  if (paTaxableIncome.lessThanOrEqualTo(100000)) {
    return config.fixedAmounts[4];
  }
  if (paTaxableIncome.lessThanOrEqualTo(150000)) {
    return config.fixedAmounts[5];
  }
  if (paTaxableIncome.lessThanOrEqualTo(200000)) {
    return config.fixedAmounts[6];
  }

  return min(roundDollar(paTaxableIncome.times(config.highIncomeRate)), config.highIncomeCap);
}

function calculateItemizedSalesTaxAlreadyPaid(
  entries: readonly PAUseTaxSalesTaxPaidEntry[] | undefined,
  rate: Decimal,
  actualPurchaseUseTax: Decimal,
): Decimal | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const cappedOffset = entries.reduce((total, entry) => total.plus(
    min(
      zeroFloor(entry.salesTaxPaid),
      zeroFloor(entry.taxablePurchaseAmount).times(rate),
    ),
  ), new Decimal(0));

  return min(roundDollar(cappedOffset), actualPurchaseUseTax);
}

export function calculatePAUseTax(input: PAUseTaxInput): PAUseTaxResult {
  const constants = PA_USE_TAX_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Use Tax Worksheet constants not available for tax year ${input.taxYear}`);
  }

  const config = constants[input.locality];
  const audit = new AuditTrail();
  const paTaxableIncome = zeroFloor(input.paTaxableIncome);
  const taxableItemPurchases = zeroFloor(input.taxableItemPurchases);
  const taxableServicePurchases = zeroFloor(input.taxableServicePurchases);
  const salesTaxAlreadyPaid = zeroFloor(input.salesTaxAlreadyPaid);
  const totalTaxablePurchases = sum(taxableItemPurchases, taxableServicePurchases);
  const actualPurchaseUseTax = roundDollar(totalTaxablePurchases.times(config.rate));
  const itemizedSalesTaxAlreadyPaid = calculateItemizedSalesTaxAlreadyPaid(
    input.salesTaxAlreadyPaidEntries,
    config.rate,
    actualPurchaseUseTax,
  );
  const estimatedTableUseTax = input.electEstimatedTable
    ? calculateEstimatedTableUseTax(paTaxableIncome, config)
    : new Decimal(0);
  const allowedSalesTaxAlreadyPaid = itemizedSalesTaxAlreadyPaid ?? salesTaxAlreadyPaid;
  const totalUseTaxLiability = zeroFloor(
    sum(actualPurchaseUseTax, estimatedTableUseTax).minus(allowedSalesTaxAlreadyPaid),
  );

  audit.record(
    "PA-Use-Tax",
    "1",
    "Taxable item purchases",
    taxableItemPurchases,
    "User-provided taxable item purchases, including shipping and handling",
  );
  audit.record(
    "PA-Use-Tax",
    "2",
    "Taxable service purchases",
    taxableServicePurchases,
    "User-provided taxable service purchases",
  );
  audit.record(
    "PA-Use-Tax",
    "3",
    "Total taxable purchases",
    totalTaxablePurchases,
    "Line 1 + Line 2",
  );
  audit.record(
    "PA-Use-Tax",
    "4",
    "Use-tax rate",
    config.rate,
    `Published ${input.locality} use-tax rate`,
  );
  audit.record(
    "PA-Use-Tax",
    "5",
    "Use tax on actual purchases",
    actualPurchaseUseTax,
    "Round to nearest dollar: Line 3 × Line 4",
    { totalTaxablePurchases, taxRate: config.rate },
  );
  audit.record(
    "PA-Use-Tax",
    "6",
    "Additional estimated use tax from Table 1",
    estimatedTableUseTax,
    input.electEstimatedTable
      ? `Apply the published ${input.taxYear} Table 1 bracket or high-income cap for the selected locality`
      : "0 because the taxpayer did not elect the Table 1 estimate",
    { paTaxableIncome },
  );
  audit.record(
    "PA-Use-Tax",
    "7",
    "Sales tax previously paid",
    allowedSalesTaxAlreadyPaid,
    itemizedSalesTaxAlreadyPaid
      ? "Itemized prior sales tax paid, capped per purchase at the applicable Pennsylvania locality rate and limited to Line 5"
      : "User-provided sales tax already paid on included purchases",
  );
  audit.record(
    "PA-Use-Tax",
    "8",
    "Total use tax liability",
    totalUseTaxLiability,
    "Floor at 0: Line 5 + Line 6 - Line 7",
    {
      actualPurchaseUseTax,
      estimatedTableUseTax,
      salesTaxAlreadyPaid: allowedSalesTaxAlreadyPaid,
    },
  );

  return {
    paTaxableIncome,
    locality: input.locality,
    taxableItemPurchases,
    taxableServicePurchases,
    totalTaxablePurchases,
    taxRate: config.rate,
    actualPurchaseUseTax,
    estimatedTableUseTax,
    salesTaxAlreadyPaid: allowedSalesTaxAlreadyPaid,
    totalUseTaxLiability,
    lines: audit.getLines(),
  };
}
