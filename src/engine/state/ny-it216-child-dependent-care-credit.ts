/**
 * New York IT-216: Child and Dependent Care Credit.
 * Computes the NYS child and dependent care credit (IT-201 line 64)
 * and optional NYC child and dependent care credit.
 * Spec: spec/state/ny-it216-child-dependent-care-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYIT216Input {
  /** Total qualified child/dependent care expenses paid */
  qualifiedExpenses: Decimal | string | number;
  /** Number of qualifying persons (children under 13, disabled dependents) */
  numberOfQualifyingPersons: number;
  /** Taxpayer's earned income */
  taxpayerEarnedIncome: Decimal | string | number;
  /** Spouse's earned income (required for MFJ; for other statuses, defaults to taxpayer's) */
  spouseEarnedIncome?: Decimal | string | number;
  /** Federal adjusted gross income (Form 1040 line 11 / IT-201 line 19) */
  federalAgi: Decimal | string | number;
  /** New York adjusted gross income (IT-201 line 33) */
  nyAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;

  /* ----- NYC credit (optional) ----- */
  /** Whether taxpayer is a NYC resident (full-year or part-year) */
  isNYCResident?: boolean;
  /** Qualified expenses paid for children under age 4 (subset of qualifiedExpenses) */
  qualifiedExpensesForChildrenUnder4?: Decimal | string | number;
}

export interface NYIT216Result {
  /* Intermediate values */
  qualifiedExpenses: Decimal;
  expenseLimit: Decimal;
  /** Line 8: Allowable expenses (smallest of expenses, limit, earned incomes) */
  allowableExpenses: Decimal;
  /** Line 10: Federal credit percentage */
  federalDecimal: Decimal;
  /** Line 12: Federal-style credit (line 8 × line 10) */
  federalStyleCredit: Decimal;
  /** Line 13: NYS limitation decimal */
  nysLimitationDecimal: Decimal;

  /** Line 14: New York State child and dependent care credit */
  nysCredit: Decimal;

  /* NYC credit */
  /** NYC credit qualification */
  nycQualified: boolean;
  /** Worksheet 2, line 6: NYC limitation decimal */
  nycLimitationDecimal: Decimal;
  /** NYC child and dependent care credit */
  nycCredit: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Federal Credit Percentage Table (Line 10) ---------- */

/**
 * Federal decimal table for child and dependent care credit.
 * Based on FAGI, identical to Form 2441 table.
 * Each entry: [agiCeiling, decimal]. Ordered lowest to highest.
 */
const FEDERAL_DECIMAL_TABLE: Array<[number, string]> = [
  [15000, "0.35"],
  [17000, "0.34"],
  [19000, "0.33"],
  [21000, "0.32"],
  [23000, "0.31"],
  [25000, "0.30"],
  [27000, "0.29"],
  [29000, "0.28"],
  [31000, "0.27"],
  [33000, "0.26"],
  [35000, "0.25"],
  [37000, "0.24"],
  [39000, "0.23"],
  [41000, "0.22"],
  [43000, "0.21"],
];
const FEDERAL_DECIMAL_FLOOR = new Decimal("0.20");

export function lookupFederalDecimal(fagi: Decimal): Decimal {
  for (const [ceiling, decimal] of FEDERAL_DECIMAL_TABLE) {
    if (fagi.lessThanOrEqualTo(ceiling)) {
      return new Decimal(decimal);
    }
  }
  return FEDERAL_DECIMAL_FLOOR;
}

/* ---------- NYS Limitation Table (Line 13) ---------- */

/**
 * NYS child and dependent care credit limitation table.
 * Keyed by tax year. The table has flat ranges and granular $200-bracket ranges.
 *
 * For granular ranges, decimals are stored as arrays where index i
 * corresponds to the bracket "Over rangeStart + i*200 but not over rangeStart + (i+1)*200".
 */
interface NYSLimitationTableYear {
  /** $0 to $25,000 flat decimal */
  flatLow: string;
  /** $25,000 to $40,000: 75 entries in $200 brackets */
  range25k40k: string[];
  /** $40,000 to $50,000 flat decimal */
  flatMid: string;
  /** $50,000 to $55,000: 25 entries in $200 brackets */
  range50k55k: string[];
  /** $55,000 to $60,000: 25 entries in $200 brackets */
  range55k60k: string[];
  /** $60,000 to $65,000: 25 entries in $200 brackets */
  range60k65k: string[];
  /** $65,000 to $150,000 flat decimal */
  flatUpper: string;
  /** Over $150,000 flat decimal */
  flatTop: string;
}

const NYS_LIMITATION_TABLES: Record<number, NYSLimitationTableYear> = {
  2025: {
    flatLow: "1.100",
    range25k40k: [
      "1.099", "1.098", "1.097", "1.095", "1.094", "1.093", "1.091", "1.090", "1.089", "1.087",
      "1.086", "1.085", "1.083", "1.082", "1.081", "1.079", "1.078", "1.077", "1.075", "1.074",
      "1.073", "1.071", "1.070", "1.069", "1.067", "1.066", "1.065", "1.063", "1.062", "1.061",
      "1.059", "1.058", "1.057", "1.055", "1.054", "1.053", "1.051", "1.050", "1.049", "1.047",
      "1.046", "1.045", "1.043", "1.042", "1.041", "1.039", "1.038", "1.037", "1.035", "1.034",
      "1.033", "1.031", "1.030", "1.029", "1.027", "1.026", "1.025", "1.023", "1.022", "1.021",
      "1.019", "1.018", "1.017", "1.015", "1.014", "1.013", "1.011", "1.010", "1.009", "1.007",
      "1.006", "1.005", "1.003", "1.002", "1.001",
    ],
    flatMid: "1.000",
    range50k55k: [
      "1.162", "1.150", "1.137", "1.125", "1.112", "1.099", "1.088", "1.075", "1.062", "1.050",
      "1.037", "1.025", "1.013", "1.000", "0.987", "0.975", "0.963", "0.950", "0.938", "0.925",
      "0.912", "0.901", "0.888", "0.875", "0.863",
    ],
    range55k60k: [
      "0.927", "0.913", "0.900", "0.886", "0.872", "0.859", "0.845", "0.831", "0.819", "0.805",
      "0.791", "0.778", "0.764", "0.750", "0.737", "0.723", "0.709", "0.696", "0.682", "0.668",
      "0.656", "0.642", "0.628", "0.615", "0.601",
    ],
    range60k65k: [
      "1.070", "1.047", "1.022", "0.996", "0.973", "0.947", "0.922", "0.899", "0.873", "0.848",
      "0.824", "0.799", "0.773", "0.750", "0.724", "0.699", "0.676", "0.650", "0.625", "0.601",
      "0.576", "0.550", "0.527", "0.502", "0.476",
    ],
    flatUpper: "0.600",
    flatTop: "0.200",
  },
};

/**
 * Look up the NYS limitation decimal for a given NY AGI.
 */
export function lookupNYSLimitationDecimal(nyAgi: Decimal, taxYear: number): Decimal {
  const table = NYS_LIMITATION_TABLES[taxYear];
  if (!table) {
    throw new Error(`NYS child care credit limitation table not available for tax year ${taxYear}`);
  }

  // $0 - $25,000
  if (nyAgi.lessThanOrEqualTo(25000)) {
    return new Decimal(table.flatLow);
  }

  // $25,000 - $40,000 (75 brackets of $200)
  if (nyAgi.lessThanOrEqualTo(40000)) {
    const index = bracketIndex(nyAgi, 25000, 200, table.range25k40k.length);
    return new Decimal(table.range25k40k[index]);
  }

  // $40,000 - $50,000
  if (nyAgi.lessThanOrEqualTo(50000)) {
    return new Decimal(table.flatMid);
  }

  // $50,000 - $55,000 (25 brackets of $200)
  if (nyAgi.lessThanOrEqualTo(55000)) {
    const index = bracketIndex(nyAgi, 50000, 200, table.range50k55k.length);
    return new Decimal(table.range50k55k[index]);
  }

  // $55,000 - $60,000 (25 brackets of $200)
  if (nyAgi.lessThanOrEqualTo(60000)) {
    const index = bracketIndex(nyAgi, 55000, 200, table.range55k60k.length);
    return new Decimal(table.range55k60k[index]);
  }

  // $60,000 - $65,000 (25 brackets of $200)
  if (nyAgi.lessThanOrEqualTo(65000)) {
    const index = bracketIndex(nyAgi, 60000, 200, table.range60k65k.length);
    return new Decimal(table.range60k65k[index]);
  }

  // $65,000 - $150,000
  if (nyAgi.lessThanOrEqualTo(150000)) {
    return new Decimal(table.flatUpper);
  }

  // Over $150,000
  return new Decimal(table.flatTop);
}

/* ---------- NYC Limitation Table (Worksheet 2, Line 6) ---------- */

interface NYCChildCareLimitationTableYear {
  /** FAGI ≤ $25,000 flat decimal */
  flatLow: string;
  /** $25,000 - $30,000: 25 entries in $200 brackets */
  range25k30k: string[];
  /** Over $30,000: always 0 */
}

const NYC_LIMITATION_TABLES: Record<number, NYCChildCareLimitationTableYear> = {
  2025: {
    flatLow: "0.750",
    range25k30k: [
      "0.735", "0.705", "0.675", "0.645", "0.615", "0.585", "0.555", "0.525", "0.495", "0.465",
      "0.435", "0.405", "0.375", "0.345", "0.315", "0.285", "0.255", "0.225", "0.195", "0.165",
      "0.135", "0.105", "0.075", "0.045", "0.015",
    ],
  },
};

/**
 * Look up the NYC child care credit limitation decimal for a given FAGI.
 */
export function lookupNYCLimitationDecimal(fagi: Decimal, taxYear: number): Decimal {
  const table = NYC_LIMITATION_TABLES[taxYear];
  if (!table) return ZERO;

  if (fagi.lessThanOrEqualTo(25000)) {
    return new Decimal(table.flatLow);
  }

  if (fagi.lessThanOrEqualTo(30000)) {
    const index = bracketIndex(fagi, 25000, 200, table.range25k30k.length);
    return new Decimal(table.range25k30k[index]);
  }

  return ZERO;
}

/* ---------- Helpers ---------- */

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

/**
 * Compute bracket index for a value in a granular range.
 * For "Over rangeStart but not over rangeStart + bracketWidth", index = 0.
 * Clamped to [0, maxIndex - 1].
 */
function bracketIndex(value: Decimal, rangeStart: number, bracketWidth: number, maxEntries: number): number {
  // value is > rangeStart (guaranteed by caller)
  const excess = value.minus(rangeStart);
  // Floor to get the 0-based bracket index
  // "Over 25000 but not over 25200" → excess is (0, 200], index = 0
  const rawIndex = excess.minus(1).div(bracketWidth).floor().toNumber();
  return Math.max(0, Math.min(rawIndex, maxEntries - 1));
}

/**
 * Get the expense limit based on number of qualifying persons.
 * Standard limits: $3,000 for 1 person, $6,000 for 2+ persons.
 */
export function getExpenseLimit(numberOfQualifyingPersons: number): Decimal {
  if (numberOfQualifyingPersons <= 0) return ZERO;
  if (numberOfQualifyingPersons === 1) return new Decimal(3000);
  return new Decimal(6000);
}

/* ---------- Main computation ---------- */

export function calculateNYIT216(input: NYIT216Input): NYIT216Result {
  const audit = new AuditTrail();

  const qualifiedExpenses = zeroFloor(d(input.qualifiedExpenses));
  const numberOfQualifyingPersons = Math.max(0, Math.floor(input.numberOfQualifyingPersons));
  const taxpayerEarnedIncome = zeroFloor(d(input.taxpayerEarnedIncome));
  const fagi = d(input.federalAgi);
  const nyAgi = d(input.nyAgi);

  audit.record("NY-IT216", "3a", "Total qualified expenses paid", qualifiedExpenses,
    "Sum of qualified expenses for all qualifying persons before line 5/8 limits");
  audit.record("NY-IT216", "9", "Federal adjusted gross income", fagi,
    "From Form IT-201/IT-203 line 19");

  // Spouse earned income: for MFJ use provided value; for others use taxpayer's
  const spouseEarnedIncome = input.filingStatus === "married_filing_jointly"
    ? zeroFloor(d(input.spouseEarnedIncome))
    : taxpayerEarnedIncome;

  // No credit if zero qualifying persons or zero earned income
  if (numberOfQualifyingPersons === 0 || taxpayerEarnedIncome.lessThanOrEqualTo(ZERO) ||
      spouseEarnedIncome.lessThanOrEqualTo(ZERO)) {
    audit.record("NY-IT216", "14", "NYS child and dependent care credit", ZERO,
      numberOfQualifyingPersons === 0
        ? "No qualifying persons"
        : "Zero earned income — credit not allowed");
    return zeroResult(qualifiedExpenses, audit);
  }

  // Line 5: Expense limit
  const expenseLimit = getExpenseLimit(numberOfQualifyingPersons);
  audit.record("NY-IT216", "5", "Dollar limit for qualified expenses", expenseLimit,
    `$${expenseLimit.toString()} for ${numberOfQualifyingPersons} qualifying person(s)`);

  // Line 8: Allowable expenses = min(expenses, limit, taxpayer earned income, spouse earned income)
  const allowableExpenses = [qualifiedExpenses, expenseLimit, taxpayerEarnedIncome, spouseEarnedIncome]
    .reduce((a, b) => min(a, b));
  audit.record("NY-IT216", "8", "Allowable qualified expenses", allowableExpenses,
    "Smallest of qualified expenses, dollar limit, taxpayer earned income, spouse earned income", {
      "Qualified expenses": qualifiedExpenses.toString(),
      "Expense limit": expenseLimit.toString(),
      "Taxpayer earned income": taxpayerEarnedIncome.toString(),
      "Spouse earned income": spouseEarnedIncome.toString(),
    });

  // Line 10: Federal credit decimal
  const federalDecimal = lookupFederalDecimal(fagi);
  audit.record("NY-IT216", "10", "Federal credit decimal", federalDecimal,
    "From Table for line 10 based on FAGI", {
      "Federal AGI": fagi.toString(),
    });

  // Line 11-12: Federal-style credit
  const federalStyleCredit = allowableExpenses.times(federalDecimal);
  audit.record("NY-IT216", "11", "Tentative federal-style credit", federalStyleCredit,
    "Line 8 × Line 10", {
      "Allowable expenses": allowableExpenses.toString(),
      "Federal decimal": federalDecimal.toString(),
    });
  audit.record("NY-IT216", "12", "Federal-style credit", federalStyleCredit,
    "Line 8 × Line 10", {
      "Allowable expenses": allowableExpenses.toString(),
      "Federal decimal": federalDecimal.toString(),
    });

  // Line 13: NYS limitation decimal
  const nysLimitationDecimal = lookupNYSLimitationDecimal(nyAgi, input.taxYear);
  audit.record("NY-IT216", "13", "NYS limitation decimal", nysLimitationDecimal,
    "From NYS child and dependent care credit limitation table", {
      "NY AGI": nyAgi.toString(),
    });

  // Line 14: NYS credit
  const nysCredit = roundDollar(federalStyleCredit.times(nysLimitationDecimal));
  audit.record("NY-IT216", "14", "NYS child and dependent care credit", nysCredit,
    "Line 12 × Line 13, rounded to nearest dollar", {
      "Federal-style credit": federalStyleCredit.toString(),
      "NYS limitation decimal": nysLimitationDecimal.toString(),
    });

  // NYC credit computation
  let nycQualified = false;
  let nycLimitationDecimal = ZERO;
  let nycCredit = ZERO;

  const isNYCResident = input.isNYCResident ?? false;
  const expensesForUnder4 = zeroFloor(d(input.qualifiedExpensesForChildrenUnder4));

  if (isNYCResident && fagi.lessThanOrEqualTo(30000) && expensesForUnder4.greaterThan(ZERO) &&
      nysCredit.greaterThan(ZERO)) {
    nycQualified = true;

    // Worksheet 2, Line 4: ratio of under-4 expenses to total expenses
    const under4Ratio = qualifiedExpenses.greaterThan(ZERO)
      ? min(expensesForUnder4.div(qualifiedExpenses).toDecimalPlaces(4, Decimal.ROUND_DOWN), ONE)
      : ZERO;

    // Worksheet 2, Line 5: NYC credit base
    const nycCreditBase = nysCredit.times(under4Ratio);

    // Worksheet 2, Line 6: NYC limitation decimal
    nycLimitationDecimal = lookupNYCLimitationDecimal(fagi, input.taxYear);

    // Worksheet 2, Line 7: NYC credit
    nycCredit = roundDollar(nycCreditBase.times(nycLimitationDecimal));

    audit.record("NY-IT216", "WS2-4", "Under-4 expense ratio", under4Ratio,
      "Expenses for children under 4 ÷ total qualified expenses", {
        "Under-4 expenses": expensesForUnder4.toString(),
        "Total qualified expenses": qualifiedExpenses.toString(),
      });
    audit.record("NY-IT216", "WS2-6", "NYC limitation decimal", nycLimitationDecimal,
      "From NYC child and dependent care credit limitation table", {
        "Federal AGI": fagi.toString(),
      });
    audit.record("NY-IT216", "WS2-7", "NYC child and dependent care credit", nycCredit,
      "NYC credit base × NYC limitation decimal", {
        "NYC credit base (WS2 line 5)": nycCreditBase.toString(),
        "NYC limitation decimal": nycLimitationDecimal.toString(),
      });
  }

  return {
    qualifiedExpenses,
    expenseLimit,
    allowableExpenses,
    federalDecimal,
    federalStyleCredit,
    nysLimitationDecimal,
    nysCredit,
    nycQualified,
    nycLimitationDecimal,
    nycCredit,
    lines: audit.getLines(),
  };
}

function zeroResult(qualifiedExpenses: Decimal, audit: AuditTrail): NYIT216Result {
  return {
    qualifiedExpenses,
    expenseLimit: ZERO,
    allowableExpenses: ZERO,
    federalDecimal: ZERO,
    federalStyleCredit: ZERO,
    nysLimitationDecimal: ZERO,
    nysCredit: ZERO,
    nycQualified: false,
    nycLimitationDecimal: ZERO,
    nycCredit: ZERO,
    lines: audit.getLines(),
  };
}
