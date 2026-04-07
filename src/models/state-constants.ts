/**
 * State income tax constants organized by state and tax year.
 * Each state entry contains brackets, deductions, and exemptions
 * needed by the generic resident return engine.
 *
 * Source URLs are documented per-state in comments.
 * When rates change year-to-year, add a new year entry — existing years remain immutable.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";

/** A single bracket in a state's graduated tax schedule */
export interface StateTaxBracket {
  min: Decimal;
  max: Decimal | null; // null = no upper limit
  rate: Decimal;
}

/** A standard deduction lookup row keyed by state adjusted income */
export interface StateStandardDeductionRange {
  min: Decimal;
  max: Decimal | null; // null = no upper limit
  amount: Decimal;
  maxExclusive?: boolean;
}

/** Per-state, per-year tax constants */
export interface StateYearConstants {
  /** Display name for the state */
  name: string;
  /** Tax brackets by filing status */
  taxBrackets: Partial<Record<FilingStatus, StateTaxBracket[]>>;
  /** Standard deduction by filing status (0 if state has no standard deduction) */
  standardDeduction: Partial<Record<FilingStatus, Decimal>>;
  /** Optional income-based standard deduction table keyed by filing status */
  standardDeductionTable?: Partial<Record<FilingStatus, StateStandardDeductionRange[]>>;
  /** Whether the configured deduction reduces taxable income or only feeds a credit computation */
  standardDeductionMode?: "taxable_income" | "credit_base_only";
  /** Personal exemption amounts */
  personalExemption: {
    amount: Decimal; // per taxpayer
    spouseAmount: Decimal; // for spouse (MFJ/MFS)
    dependentAmount: Decimal; // per dependent
    /** Optional filing-status-specific base exemption that already includes spouse treatment */
    filingStatusBaseAmounts?: Partial<Record<FilingStatus, Decimal>>;
    /** Optional income-based filing-status base exemption table */
    incomeBasedBaseAmounts?: Partial<Record<FilingStatus, StateStandardDeductionRange[]>>;
  };
  /** Optional phase-out for personal exemptions at high income */
  exemptionPhaseOut?: {
    threshold: Partial<Record<FilingStatus, Decimal>>;
    /** Amount of income per dollar of exemption-credit reduction */
    divisor: Decimal;
  };
  /** Whether the state starts from federal AGI (true) or has its own income definition (false) */
  useFederalAGI: boolean;
  /** Whether this state has local/city taxes that stack on top */
  hasLocalTax: boolean;
  /** Whether the state uses federal taxable income as starting point instead of AGI */
  usesFederalTaxableIncome?: boolean;
  /** Whether personal exemptions are applied as credits (multiplied by lowest bracket rate) vs deductions */
  exemptionsAreCredits?: boolean;
  /** Optional rate applied to the deduction/exemption credit base */
  creditRate?: Decimal;
}

// Helper to reduce verbosity in bracket definitions
const D = (n: number | string) => new Decimal(n);

function brackets(
  ...entries: [number, number | null, number][]
): StateTaxBracket[] {
  return entries.map(([min, max, rate]) => ({
    min: D(min),
    max: max !== null ? D(max) : null,
    rate: D(rate),
  }));
}

function deductionTable(
  ...entries: [number, number | null, number][]
): StateStandardDeductionRange[] {
  return entries.map(([min, max, amount]) => ({
    min: D(min),
    max: max !== null ? D(max) : null,
    amount: D(amount),
  }));
}

function deductionTableExclusive(
  ...entries: [number, number | null, number][]
): StateStandardDeductionRange[] {
  return entries.map(([min, max, amount]) => ({
    min: D(min),
    max: max !== null ? D(max) : null,
    amount: D(amount),
    maxExclusive: max !== null,
  }));
}

/** State constants keyed by two-letter state code, then by tax year */
export const STATE_CONSTANTS: Record<string, Record<number, StateYearConstants>> = {};

// ════════════════════════════════════════════════════════════════
// ALABAMA (AL)
// Source: Alabama Code §40-18-5, Alabama DOR
// https://www.revenue.alabama.gov/tax-types/individual-income-tax/
// https://www.revenue.alabama.gov/faqs/how-much-is-the-alabama-standard-deduction/
// https://www.revenue.alabama.gov/wp-content/uploads/2021/10/10stddeduction.pdf
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["AL"] = {
  2025: {
    name: "Alabama",
    taxBrackets: {
      single: brackets(
        [0, 500, 0.02],
        [500, 3000, 0.04],
        [3000, null, 0.05]
      ),
      married_filing_jointly: brackets(
        [0, 1000, 0.02],
        [1000, 6000, 0.04],
        [6000, null, 0.05]
      ),
      married_filing_separately: brackets(
        [0, 500, 0.02],
        [500, 3000, 0.04],
        [3000, null, 0.05]
      ),
      head_of_household: brackets(
        [0, 500, 0.02],
        [500, 3000, 0.04],
        [3000, null, 0.05]
      ),
    },
    // Form 40 uses an AGI-based standard deduction table by filing status.
    // Keep the floor amount here as fallback; the generic engine uses the table when present.
    standardDeduction: {
      single: D(2000),
      married_filing_jointly: D(4000),
      married_filing_separately: D(2000),
      head_of_household: D(2000),
    },
    standardDeductionTable: {
      single: deductionTable(
        [0, 20499, 2500],
        [20500, 20999, 2475],
        [21000, 21499, 2450],
        [21500, 21999, 2425],
        [22000, 22499, 2400],
        [22500, 22999, 2375],
        [23000, 23499, 2350],
        [23500, 23999, 2325],
        [24000, 24499, 2300],
        [24500, 24999, 2275],
        [25000, 25499, 2250],
        [25500, 25999, 2225],
        [26000, 26499, 2200],
        [26500, 26999, 2175],
        [27000, 27499, 2150],
        [27500, 27999, 2125],
        [28000, 28499, 2100],
        [28500, 28999, 2075],
        [29000, 29499, 2050],
        [29500, 29999, 2025],
        [30000, null, 2000]
      ),
      married_filing_jointly: deductionTable(
        [0, 20499, 7500],
        [20500, 20999, 7325],
        [21000, 21499, 7150],
        [21500, 21999, 6975],
        [22000, 22499, 6800],
        [22500, 22999, 6625],
        [23000, 23499, 6450],
        [23500, 23999, 6275],
        [24000, 24499, 6100],
        [24500, 24999, 5925],
        [25000, 25499, 5750],
        [25500, 25999, 5575],
        [26000, 26499, 5400],
        [26500, 26999, 5225],
        [27000, 27499, 5050],
        [27500, 27999, 4875],
        [28000, 28499, 4700],
        [28500, 28999, 4525],
        [29000, 29499, 4350],
        [29500, 29999, 4175],
        [30000, null, 4000]
      ),
      married_filing_separately: deductionTable(
        [0, 10249, 3750],
        [10250, 10499, 3662],
        [10500, 10749, 3574],
        [10750, 10999, 3486],
        [11000, 11249, 3398],
        [11250, 11499, 3310],
        [11500, 11749, 3222],
        [11750, 11999, 3134],
        [12000, 12249, 3046],
        [12250, 12499, 2958],
        [12500, 12749, 2870],
        [12750, 12999, 2782],
        [13000, 13249, 2694],
        [13250, 13499, 2606],
        [13500, 13749, 2518],
        [13750, 13999, 2430],
        [14000, 14249, 2342],
        [14250, 14499, 2254],
        [14500, 14749, 2166],
        [14750, 14999, 2078],
        [15000, null, 2000]
      ),
      head_of_household: deductionTable(
        [0, 20499, 4700],
        [20500, 20999, 4565],
        [21000, 21499, 4430],
        [21500, 21999, 4295],
        [22000, 22499, 4160],
        [22500, 22999, 4025],
        [23000, 23499, 3890],
        [23500, 23999, 3755],
        [24000, 24499, 3620],
        [24500, 24999, 3485],
        [25000, 25499, 3350],
        [25500, 25999, 3215],
        [26000, 26499, 3080],
        [26500, 26999, 2945],
        [27000, 27499, 2810],
        [27500, 27999, 2675],
        [28000, 28499, 2540],
        [28500, 28999, 2405],
        [29000, 29499, 2270],
        [29500, 29999, 2135],
        [30000, null, 2000]
      ),
    },
    personalExemption: {
      amount: D(1500),       // taxpayer fallback
      spouseAmount: D(1500), // spouse fallback
      dependentAmount: D(300),
      filingStatusBaseAmounts: {
        single: D(1500),
        married_filing_jointly: D(3000),
        married_filing_separately: D(1500),
        head_of_household: D(3000),
      },
    },
    useFederalAGI: true,
    hasLocalTax: true, // Birmingham, Gadsden, Macon County, etc.
  },
};

// ════════════════════════════════════════════════════════════════
// ARIZONA (AZ)
// Source: A.R.S. §43-1011, Arizona DOR
// https://azdor.gov/individual-income-tax-rates
// 2023+: Flat 2.5% rate (Proposition 208 surcharge struck down; Prop 211 failed)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["AZ"] = {
  2025: {
    name: "Arizona",
    // Flat 2.5% rate for all filing statuses
    taxBrackets: {
      single: brackets([0, null, 0.025]),
      married_filing_jointly: brackets([0, null, 0.025]),
      married_filing_separately: brackets([0, null, 0.025]),
      head_of_household: brackets([0, null, 0.025]),
    },
    // AZ 2025 standard deduction (matches federal per Executive Order 2025-15)
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
    },
    personalExemption: {
      amount: D(0),         // AZ eliminated personal exemptions (2019+)
      spouseAmount: D(0),
      dependentAmount: D(0), // AZ has dependent credit ($100/$25) handled separately
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// ARKANSAS (AR)
// Source: Arkansas Code §26-51-201, AR DFA 2025 resident instructions and tax tables
// https://www.dfa.arkansas.gov/wp-content/uploads/2025_AR1000F_and_AR1000NR_Instructions.pdf
// https://www.dfa.arkansas.gov/wp-content/uploads/2025_TaxTables.pdf
// 2025: Reduced rates per Act 1 of 2023 Special Session; standard deduction indexed to $2,470 single and $4,940 MFJ
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["AR"] = {
  2025: {
    name: "Arkansas",
    // AR 2025 income tax table (same brackets for all filing statuses)
    taxBrackets: {
      single: brackets(
        [0, 5100, 0.00],
        [5100, 10300, 0.02],
        [10300, 14600, 0.03],
        [14600, 24300, 0.034],
        [24300, null, 0.039]
      ),
      married_filing_jointly: brackets(
        [0, 5100, 0.00],
        [5100, 10300, 0.02],
        [10300, 14600, 0.03],
        [14600, 24300, 0.034],
        [24300, null, 0.039]
      ),
    },
    standardDeduction: {
      single: D(2470),
      married_filing_jointly: D(4940),
      married_filing_separately: D(2470),
      head_of_household: D(2470),
      qualifying_surviving_spouse: D(2470),
    },
    personalExemption: {
      amount: D(29),         // $29 tax credit per exemption
      spouseAmount: D(29),
      dependentAmount: D(29),
      filingStatusBaseAmounts: {
        single: D(29),
        married_filing_jointly: D(58),
        married_filing_separately: D(29),
        head_of_household: D(58),
        qualifying_surviving_spouse: D(58),
      },
    },
    exemptionsAreCredits: true,
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// COLORADO (CO)
// Source: C.R.S. §39-22-104, Colorado DOR
// https://tax.colorado.gov/individual-income-tax
// CO starts from federal taxable income (not AGI). Flat rate.
// 2025: 4.4% (2024 was 4.25%; Proposition 121 approved Nov. 2022)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["CO"] = {
  2025: {
    name: "Colorado",
    taxBrackets: {
      single: brackets([0, null, 0.044]),
      married_filing_jointly: brackets([0, null, 0.044]),
      married_filing_separately: brackets([0, null, 0.044]),
      head_of_household: brackets([0, null, 0.044]),
    },
    // CO uses federal taxable income — no additional standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: false,
    usesFederalTaxableIncome: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// CONNECTICUT (CT)
// Source: CGS §12-700, CT DRS Form CT-1040 TCS (Rev. 12/25)
// https://portal.ct.gov/drs/drs-forms/current-year-forms/individual-income-tax-forms
// CT has no standard deduction; uses a personal exemption (Table A) + personal
// tax credit system + tax recapture add-on. Generic engine models Table A but not
// the separate personal tax credit or tax recapture worksheets.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["CT"] = {
  2025: {
    name: "Connecticut",
    taxBrackets: {
      single: brackets(
        [0, 10000, 0.02],
        [10000, 50000, 0.045],
        [50000, 100000, 0.055],
        [100000, 200000, 0.06],
        [200000, 250000, 0.065],
        [250000, 500000, 0.069],
        [500000, null, 0.0699]
      ),
      married_filing_jointly: brackets(
        [0, 20000, 0.02],
        [20000, 100000, 0.045],
        [100000, 200000, 0.055],
        [200000, 400000, 0.06],
        [400000, 500000, 0.065],
        [500000, 1000000, 0.069],
        [1000000, null, 0.0699]
      ),
      married_filing_separately: brackets(
        [0, 10000, 0.02],
        [10000, 50000, 0.045],
        [50000, 100000, 0.055],
        [100000, 200000, 0.06],
        [200000, 250000, 0.065],
        [250000, 500000, 0.069],
        [500000, null, 0.0699]
      ),
      head_of_household: brackets(
        [0, 16000, 0.02],
        [16000, 80000, 0.045],
        [80000, 160000, 0.055],
        [160000, 320000, 0.06],
        [320000, 400000, 0.065],
        [400000, 800000, 0.069],
        [800000, null, 0.0699]
      ),
    },
    // CT has no standard deduction.
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // CT Table A personal exemptions keyed by Connecticut AGI.
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
      incomeBasedBaseAmounts: {
        single: deductionTable(
          [0, 30000, 15000],
          [30000.01, 31000, 14000],
          [31000.01, 32000, 13000],
          [32000.01, 33000, 12000],
          [33000.01, 34000, 11000],
          [34000.01, 35000, 10000],
          [35000.01, 36000, 9000],
          [36000.01, 37000, 8000],
          [37000.01, 38000, 7000],
          [38000.01, 39000, 6000],
          [39000.01, 40000, 5000],
          [40000.01, 41000, 4000],
          [41000.01, 42000, 3000],
          [42000.01, 43000, 2000],
          [43000.01, 44000, 1000],
          [44000.01, null, 0]
        ),
        married_filing_jointly: deductionTable(
          [0, 48000, 24000],
          [48000.01, 49000, 23000],
          [49000.01, 50000, 22000],
          [50000.01, 51000, 21000],
          [51000.01, 52000, 20000],
          [52000.01, 53000, 19000],
          [53000.01, 54000, 18000],
          [54000.01, 55000, 17000],
          [55000.01, 56000, 16000],
          [56000.01, 57000, 15000],
          [57000.01, 58000, 14000],
          [58000.01, 59000, 13000],
          [59000.01, 60000, 12000],
          [60000.01, 61000, 11000],
          [61000.01, 62000, 10000],
          [62000.01, 63000, 9000],
          [63000.01, 64000, 8000],
          [64000.01, 65000, 7000],
          [65000.01, 66000, 6000],
          [66000.01, 67000, 5000],
          [67000.01, 68000, 4000],
          [68000.01, 69000, 3000],
          [69000.01, 70000, 2000],
          [70000.01, 71000, 1000],
          [71000.01, null, 0]
        ),
        qualifying_surviving_spouse: deductionTable(
          [0, 48000, 24000],
          [48000.01, 49000, 23000],
          [49000.01, 50000, 22000],
          [50000.01, 51000, 21000],
          [51000.01, 52000, 20000],
          [52000.01, 53000, 19000],
          [53000.01, 54000, 18000],
          [54000.01, 55000, 17000],
          [55000.01, 56000, 16000],
          [56000.01, 57000, 15000],
          [57000.01, 58000, 14000],
          [58000.01, 59000, 13000],
          [59000.01, 60000, 12000],
          [60000.01, 61000, 11000],
          [61000.01, 62000, 10000],
          [62000.01, 63000, 9000],
          [63000.01, 64000, 8000],
          [64000.01, 65000, 7000],
          [65000.01, 66000, 6000],
          [66000.01, 67000, 5000],
          [67000.01, 68000, 4000],
          [68000.01, 69000, 3000],
          [69000.01, 70000, 2000],
          [70000.01, 71000, 1000],
          [71000.01, null, 0]
        ),
        married_filing_separately: deductionTable(
          [0, 24000, 12000],
          [24000.01, 25000, 11000],
          [25000.01, 26000, 10000],
          [26000.01, 27000, 9000],
          [27000.01, 28000, 8000],
          [28000.01, 29000, 7000],
          [29000.01, 30000, 6000],
          [30000.01, 31000, 5000],
          [31000.01, 32000, 4000],
          [32000.01, 33000, 3000],
          [33000.01, 34000, 2000],
          [34000.01, 35000, 1000],
          [35000.01, null, 0]
        ),
        head_of_household: deductionTable(
          [0, 38000, 19000],
          [38000.01, 39000, 18000],
          [39000.01, 40000, 17000],
          [40000.01, 41000, 16000],
          [41000.01, 42000, 15000],
          [42000.01, 43000, 14000],
          [43000.01, 44000, 13000],
          [44000.01, 45000, 12000],
          [45000.01, 46000, 11000],
          [46000.01, 47000, 10000],
          [47000.01, 48000, 9000],
          [48000.01, 49000, 8000],
          [49000.01, 50000, 7000],
          [50000.01, 51000, 6000],
          [51000.01, 52000, 5000],
          [52000.01, 53000, 4000],
          [53000.01, 54000, 3000],
          [54000.01, 55000, 2000],
          [55000.01, 56000, 1000],
          [56000.01, null, 0]
        ),
      },
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// DELAWARE (DE)
// Source: 30 Del. C. §1102, Delaware Division of Revenue
// https://revenue.delaware.gov/frequently-asked-questions/personal-income-tax-faqs/
// DE uses same brackets for all filing statuses.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["DE"] = {
  2025: {
    name: "Delaware",
    taxBrackets: {
      single: brackets(
        [0, 2000, 0.00],
        [2000, 5000, 0.022],
        [5000, 10000, 0.039],
        [10000, 20000, 0.048],
        [20000, 25000, 0.052],
        [25000, 60000, 0.0555],
        [60000, null, 0.066]
      ),
      married_filing_jointly: brackets(
        [0, 2000, 0.00],
        [2000, 5000, 0.022],
        [5000, 10000, 0.039],
        [10000, 20000, 0.048],
        [20000, 25000, 0.052],
        [25000, 60000, 0.0555],
        [60000, null, 0.066]
      ),
    },
    standardDeduction: {
      single: D(3250),
      married_filing_jointly: D(6500),
      married_filing_separately: D(3250),
      head_of_household: D(3250),
    },
    personalExemption: {
      amount: D(110),       // $110 credit per exemption
      spouseAmount: D(110),
      dependentAmount: D(110),
    },
    exemptionsAreCredits: true,
    useFederalAGI: true,
    hasLocalTax: false, // Wilmington has a wage tax, not income tax
  },
};

// ════════════════════════════════════════════════════════════════
// GEORGIA (GA)
// Source: O.C.G.A. §48-7-20, HB 1015 (2022), HB 111 (2025), GA DOR 2025 IT-511
// https://dor.georgia.gov/taxes/important-tax-updates
// https://dor.georgia.gov/document/document/2025-it-511-individual-income-tax-booklet/download
// 2025: Flat 5.19% (HB 111 signed April 2025; reducing toward 4.99%)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["GA"] = {
  2025: {
    name: "Georgia",
    // Flat rate 5.19% for 2025 (HB 111 retroactive reduction from 5.39%)
    taxBrackets: {
      single: brackets([0, null, 0.0519]),
      married_filing_jointly: brackets([0, null, 0.0519]),
      married_filing_separately: brackets([0, null, 0.0519]),
      head_of_household: brackets([0, null, 0.0519]),
    },
    // Standard deductions under HB 1015
    standardDeduction: {
      single: D(12000),
      married_filing_jointly: D(24000),
      married_filing_separately: D(12000),
      head_of_household: D(12000),
      qualifying_surviving_spouse: D(12000),
    },
    // Taxpayer/spouse exemptions repealed; dependent exemption $4,000 per dependent
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(4000),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// HAWAII (HI)
// Source: HRS §235-51, Hawaii Dept of Taxation (Act 45, SLH 2024 widened thresholds)
// https://tax.hawaii.gov/forms/d_25table-on/d_25table-on_p13/
// https://files.hawaii.gov/tax/forms/current/n11ins.pdf
// HI has 12 brackets with rates from 1.4% to 11%
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["HI"] = {
  2025: {
    name: "Hawaii",
    taxBrackets: {
      single: brackets(
        [0, 9600, 0.014],
        [9600, 14400, 0.032],
        [14400, 19200, 0.055],
        [19200, 24000, 0.064],
        [24000, 36000, 0.068],
        [36000, 48000, 0.072],
        [48000, 125000, 0.076],
        [125000, 175000, 0.079],
        [175000, 225000, 0.0825],
        [225000, 275000, 0.09],
        [275000, 325000, 0.10],
        [325000, null, 0.11]
      ),
      married_filing_jointly: brackets(
        [0, 19200, 0.014],
        [19200, 28800, 0.032],
        [28800, 38400, 0.055],
        [38400, 48000, 0.064],
        [48000, 72000, 0.068],
        [72000, 96000, 0.072],
        [96000, 250000, 0.076],
        [250000, 350000, 0.079],
        [350000, 450000, 0.0825],
        [450000, 550000, 0.09],
        [550000, 650000, 0.10],
        [650000, null, 0.11]
      ),
      married_filing_separately: brackets(
        [0, 9600, 0.014],
        [9600, 14400, 0.032],
        [14400, 19200, 0.055],
        [19200, 24000, 0.064],
        [24000, 36000, 0.068],
        [36000, 48000, 0.072],
        [48000, 125000, 0.076],
        [125000, 175000, 0.079],
        [175000, 225000, 0.0825],
        [225000, 275000, 0.09],
        [275000, 325000, 0.10],
        [325000, null, 0.11]
      ),
      head_of_household: brackets(
        [0, 14400, 0.014],
        [14400, 21600, 0.032],
        [21600, 28800, 0.055],
        [28800, 36000, 0.064],
        [36000, 54000, 0.068],
        [54000, 72000, 0.072],
        [72000, 187500, 0.076],
        [187500, 262500, 0.079],
        [262500, 337500, 0.0825],
        [337500, 412500, 0.09],
        [412500, 487500, 0.10],
        [487500, null, 0.11]
      ),
    },
    // 2025 standard deduction (Act 45 doubled amounts)
    standardDeduction: {
      single: D(4400),
      married_filing_jointly: D(8800),
      married_filing_separately: D(4400),
      head_of_household: D(6424),
      qualifying_surviving_spouse: D(8800),
    },
    personalExemption: {
      amount: D(1144),
      spouseAmount: D(1144),
      dependentAmount: D(1144),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// IDAHO (ID)
// Source: Idaho Code §63-3024, Idaho State Tax Commission
// https://tax.idaho.gov/taxes/income-tax/individual-income-tax/
// 2025: 5.3% flat rate (reduced from 5.695% in 2024) with zero-bracket threshold
// Source: https://tax.idaho.gov/taxes/income-tax/individual-income/online-guide/
// Idaho adopted federal standard deduction starting TY2023
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["ID"] = {
  2025: {
    name: "Idaho",
    // Two-tier: 0% up to threshold, then 5.3%
    taxBrackets: {
      single: brackets(
        [0, 4811, 0.00],
        [4811, null, 0.053]
      ),
      married_filing_jointly: brackets(
        [0, 9622, 0.00],
        [9622, null, 0.053]
      ),
      married_filing_separately: brackets(
        [0, 4811, 0.00],
        [4811, null, 0.053]
      ),
      head_of_household: brackets(
        [0, 4811, 0.00],
        [4811, null, 0.053]
      ),
    },
    // Idaho conforms to federal standard deduction
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
    },
    // Personal exemptions eliminated with flat tax adoption (HB 1)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// ILLINOIS (IL)
// Source: 35 ILCS 5/201, Illinois DOR
// https://tax.illinois.gov/individuals.html
// Flat 4.95% rate. No standard deduction. Personal exemption subtracted from income.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["IL"] = {
  2025: {
    name: "Illinois",
    taxBrackets: {
      single: brackets([0, null, 0.0495]),
      married_filing_jointly: brackets([0, null, 0.0495]),
      married_filing_separately: brackets([0, null, 0.0495]),
      head_of_household: brackets([0, null, 0.0495]),
    },
    // IL has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // IL personal exemption: $2,850 per person (2025, indexed)
    // Source: https://tax.illinois.gov/research/publications/bulletins/fy-2025-16.html
    personalExemption: {
      amount: D(2850),
      spouseAmount: D(2850),
      dependentAmount: D(2850),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// INDIANA (IN)
// Source: IC §6-3-2-1, Indiana DOR
// https://www.in.gov/dor/individual-income-taxes/
// 2025: Flat 3.0% (HEA 1001, 2022 — phased reduction from 3.23%)
// IN has no standard deduction. County taxes are significant but not modeled here.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["IN"] = {
  2025: {
    name: "Indiana",
    taxBrackets: {
      single: brackets([0, null, 0.03]),
      married_filing_jointly: brackets([0, null, 0.03]),
      married_filing_separately: brackets([0, null, 0.03]),
      head_of_household: brackets([0, null, 0.03]),
    },
    // IN has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // IN personal exemption: $1,000 per taxpayer/spouse, $1,500 per qualifying dependent child
    personalExemption: {
      amount: D(1000),
      spouseAmount: D(1000),
      dependentAmount: D(1500),
    },
    useFederalAGI: true,
    hasLocalTax: true, // County income taxes ranging from ~0.5% to 3.38%
  },
};

// ════════════════════════════════════════════════════════════════
// IOWA (IA)
// Source: Iowa Code §422.5, Iowa Dept of Revenue
// https://tax.iowa.gov/individual-income-tax
// 2025: Flat 3.8% (SF 2417, 2022 — phased to flat rate by 2025)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["IA"] = {
  2025: {
    name: "Iowa",
    // Flat 3.8% for 2025 (SF 2417 phase-in complete)
    taxBrackets: {
      single: brackets([0, null, 0.038]),
      married_filing_jointly: brackets([0, null, 0.038]),
      married_filing_separately: brackets([0, null, 0.038]),
      head_of_household: brackets([0, null, 0.038]),
    },
    // Iowa adopted federal standard deduction starting 2025
    // Source: https://revenue.iowa.gov/press-release/2024-10-16/idr-announces-2025-individual-income-tax-brackets-and-interest-rates
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
    },
    // Personal exemptions eliminated starting 2025 (SF 2417 reform)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false, // School district surtax exists but applied separately
  },
};

// ════════════════════════════════════════════════════════════════
// KANSAS (KS)
// Source: K.S.A. §79-32,110, Kansas DOR
// https://www.ksrevenue.gov/persincome.html
// 2025: 2 graduated brackets. Large personal exemptions.
// Source: https://www.ksrevenue.gov/taxrates.html
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["KS"] = {
  2025: {
    name: "Kansas",
    taxBrackets: {
      single: brackets(
        [0, 23000, 0.052],
        [23000, null, 0.0558]
      ),
      married_filing_jointly: brackets(
        [0, 46000, 0.052],
        [46000, null, 0.0558]
      ),
    },
    standardDeduction: {
      single: D(3605),
      married_filing_jointly: D(8240),
      married_filing_separately: D(4120),
      head_of_household: D(6180),
    },
    // Kansas personal exemption: $9,160 single, $18,320 MFJ (split), $2,320 per dependent
    personalExemption: {
      amount: D(9160),
      spouseAmount: D(9160),
      dependentAmount: D(2320),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// KENTUCKY (KY)
// Source: KRS §141.020, Kentucky DOR
// https://revenue.ky.gov/Individual/Individual-Income-Tax/Pages/default.aspx
// 2025: Flat 4.0% (HB 1 revenue trigger met; reduced from 4.5% in 2024)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["KY"] = {
  2025: {
    name: "Kentucky",
    taxBrackets: {
      single: brackets([0, null, 0.04]),
      married_filing_jointly: brackets([0, null, 0.04]),
      married_filing_separately: brackets([0, null, 0.04]),
      head_of_household: brackets([0, null, 0.04]),
    },
    // KY standard deduction: $3,270 for 2025 (indexed, same for all statuses)
    // Source: https://revenue.ky.gov/News/pages/kentucky-dor-announces-2025-standard-deduction.aspx
    standardDeduction: {
      single: D(3270),
      married_filing_jointly: D(3270),
      married_filing_separately: D(3270),
      head_of_household: D(3270),
    },
    // Personal exemptions eliminated in 2018 reform (HB 366)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: true, // Louisville, Lexington, and other cities have occupational taxes
  },
};

// ════════════════════════════════════════════════════════════════
// LOUISIANA (LA)
// Source: R.S. 47:32, Louisiana DOR
// https://revenue.louisiana.gov/IndividualIncomeTax
// 2025: Major reform (Act 1, 2024 3rd Extraordinary Session) — flat 3% rate
// replacing old 2%/4%/6% graduated structure. Eliminated federal income tax
// deduction and personal exemptions. Added standard deduction.
// Source: https://revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform/what-are-the-individual-income-tax-rates-and-brackets/
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["LA"] = {
  2025: {
    name: "Louisiana",
    // Flat 3% for all filing statuses (2025 reform)
    taxBrackets: {
      single: brackets([0, null, 0.03]),
      married_filing_jointly: brackets([0, null, 0.03]),
      married_filing_separately: brackets([0, null, 0.03]),
      head_of_household: brackets([0, null, 0.03]),
    },
    // LA new standard deduction (2025 reform): $12,500 S/MFS, $25,000 MFJ/HOH
    standardDeduction: {
      single: D(12500),
      married_filing_jointly: D(25000),
      married_filing_separately: D(12500),
      head_of_household: D(25000),
    },
    // Personal exemptions repealed as of 2025
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// MAINE (ME)
// Source: 36 M.R.S.A. §5111, Maine Revenue Services
// https://www.maine.gov/revenue/taxes/income-estate-tax/individual-income-tax
// https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_tax_tables.pdf
// 3 graduated brackets, inflation-adjusted annually.
// Maine conforms to federal standard deduction.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["ME"] = {
  2025: {
    name: "Maine",
    // 2025 brackets (inflation-adjusted from 2024 per Revenue Services bulletin)
    taxBrackets: {
      single: brackets(
        [0, 26800, 0.058],
        [26800, 63450, 0.0675],
        [63450, null, 0.0715]
      ),
      married_filing_jointly: brackets(
        [0, 53600, 0.058],
        [53600, 126900, 0.0675],
        [126900, null, 0.0715]
      ),
      head_of_household: brackets(
        [0, 40200, 0.058],
        [40200, 75450, 0.0675],
        [75450, null, 0.0715]
      ),
    },
    // Maine standard deduction (2025)
    // Source: https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/ind_tax_rate_sched_2025.pdf
    standardDeduction: {
      single: D(15000),
      married_filing_jointly: D(30000),
      married_filing_separately: D(15000),
      head_of_household: D(22500),
    },
    // Maine personal exemption: $5,150 per person (2025 indexed)
    personalExemption: {
      amount: D(5150),
      spouseAmount: D(5150),
      dependentAmount: D(5150),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// MARYLAND (MD)
// Source: Comptroller of Maryland, Tax-General Article §10-105
// https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf
// https://marylandtaxes.gov/forms/Tax_Publications/Tax_Facts/Withholding_Tax_Facts/Withholding-Tax-Facts-2025.pdf
// 8 graduated brackets from 2% to 5.75%. Same brackets for all statuses.
// 2025 resident booklet Instruction 16 uses fixed resident standard deduction amounts.
// County piggyback tax (1.75%–3.2%) NOT modeled in generic engine.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MD"] = {
  2025: {
    name: "Maryland",
    taxBrackets: {
      single: brackets(
        [0, 1000, 0.02],
        [1000, 2000, 0.03],
        [2000, 3000, 0.04],
        [3000, 100000, 0.0475],
        [100000, 125000, 0.05],
        [125000, 150000, 0.0525],
        [150000, 250000, 0.055],
        [250000, null, 0.0575]
      ),
      married_filing_jointly: brackets(
        [0, 1000, 0.02],
        [1000, 2000, 0.03],
        [2000, 3000, 0.04],
        [3000, 150000, 0.0475],
        [150000, 175000, 0.05],
        [175000, 225000, 0.0525],
        [225000, 300000, 0.055],
        [300000, null, 0.0575]
      ),
      married_filing_separately: brackets(
        [0, 1000, 0.02],
        [1000, 2000, 0.03],
        [2000, 3000, 0.04],
        [3000, 100000, 0.0475],
        [100000, 125000, 0.05],
        [125000, 150000, 0.0525],
        [150000, 250000, 0.055],
        [250000, null, 0.0575]
      ),
      head_of_household: brackets(
        [0, 1000, 0.02],
        [1000, 2000, 0.03],
        [2000, 3000, 0.04],
        [3000, 150000, 0.0475],
        [150000, 175000, 0.05],
        [175000, 225000, 0.0525],
        [225000, 300000, 0.055],
        [300000, null, 0.0575]
      ),
    },
    standardDeduction: {
      single: D(3350),
      married_filing_jointly: D(6700),
      married_filing_separately: D(3350),
      head_of_household: D(6700),
      qualifying_surviving_spouse: D(6700),
    },
    // $3,200 per exemption (taxpayer, spouse, each dependent) — 2025 indexed
    personalExemption: {
      amount: D(3200),
      spouseAmount: D(3200),
      dependentAmount: D(3200),
    },
    useFederalAGI: true,
    hasLocalTax: true, // County piggyback taxes 1.75%–3.2%
  },
};

// ════════════════════════════════════════════════════════════════
// MASSACHUSETTS (MA)
// Source: MGL ch. 62, Mass DOR
// https://www.mass.gov/info-details/mass-dor-tax-rates
// Flat 5% on Part B income (wages, salaries, business income).
// 4% surtax on income over $1M (Fair Share Amendment) NOT modeled in generic engine.
// MA has no standard deduction; uses personal exemptions deducted from income.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MA"] = {
  2025: {
    name: "Massachusetts",
    // Flat 5.0% rate for all filing statuses
    taxBrackets: {
      single: brackets([0, null, 0.05]),
      married_filing_jointly: brackets([0, null, 0.05]),
      married_filing_separately: brackets([0, null, 0.05]),
      head_of_household: brackets([0, null, 0.05]),
    },
    // MA has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // MA personal exemption: $4,400 single, $4,400 each spouse, $1,000 per dependent
    personalExemption: {
      amount: D(4400),
      spouseAmount: D(4400),
      dependentAmount: D(1000),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// MICHIGAN (MI)
// Source: MCL §206.51, Michigan Dept of Treasury
// https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2025/446_Withholding-Guide_2025.pdf
// Flat 4.25% rate. No standard deduction. Personal exemption deducted from income.
// 2023 had a temporary reduction to 4.05%; reverted to 4.25% for 2024+.
// 24 cities levy local income taxes (not modeled).
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MI"] = {
  2025: {
    name: "Michigan",
    taxBrackets: {
      single: brackets([0, null, 0.0425]),
      married_filing_jointly: brackets([0, null, 0.0425]),
      married_filing_separately: brackets([0, null, 0.0425]),
      head_of_household: brackets([0, null, 0.0425]),
    },
    // MI has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // MI personal exemption: $5,800 per person for 2025
    personalExemption: {
      amount: D(5800),
      spouseAmount: D(5800),
      dependentAmount: D(5800),
    },
    useFederalAGI: true,
    hasLocalTax: true, // Detroit 2.4%, other cities 1%–2%
  },
};

// ════════════════════════════════════════════════════════════════
// MINNESOTA (MN)
// Source: Minn. Stat. §290.06, Minnesota DOR
// https://www.revenue.state.mn.us/press-release/2024-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption
// 4 graduated brackets from 5.35% to 9.85%. Conforms to federal standard deduction.
// No taxpayer/spouse exemption in the generic model, but Minnesota keeps a
// state dependent exemption that reduces taxable income.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MN"] = {
  2025: {
    name: "Minnesota",
    // 2025 brackets (inflation-adjusted)
    taxBrackets: {
      single: brackets(
        [0, 32570, 0.0535],
        [32570, 106990, 0.068],
        [106990, 198630, 0.0785],
        [198630, null, 0.0985]
      ),
      married_filing_jointly: brackets(
        [0, 47620, 0.0535],
        [47620, 189180, 0.068],
        [189180, 330410, 0.0785],
        [330410, null, 0.0985]
      ),
      married_filing_separately: brackets(
        [0, 23810, 0.0535],
        [23810, 94590, 0.068],
        [94590, 165205, 0.0785],
        [165205, null, 0.0985]
      ),
      head_of_household: brackets(
        [0, 40100, 0.0535],
        [40100, 161130, 0.068],
        [161130, 264050, 0.0785],
        [264050, null, 0.0985]
      ),
    },
    // Minnesota 2025 indexed standard deduction amounts
    standardDeduction: {
      single: D(14950),
      married_filing_jointly: D(29900),
      married_filing_separately: D(14950),
      head_of_household: D(22500),
    },
    // Minnesota keeps a dependent exemption even without taxpayer/spouse exemptions
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(5200),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// MISSISSIPPI (MS)
// Source: Miss. Code §27-7-5, Mississippi DOR
// https://www.dor.ms.gov/individual-income-tax
// HB 531 (2022) phased reform: 2025 has 0% bracket up to $10,000, then flat 4.4%.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MS"] = {
  2025: {
    name: "Mississippi",
    // Same brackets for all filing statuses
    taxBrackets: {
      single: brackets(
        [0, 10000, 0.00],
        [10000, null, 0.044]
      ),
      married_filing_jointly: brackets(
        [0, 10000, 0.00],
        [10000, null, 0.044]
      ),
    },
    standardDeduction: {
      single: D(2300),
      married_filing_jointly: D(4600),
      married_filing_separately: D(2300),
      head_of_household: D(3400),
    },
    // MS personal exemption: $6,000 single, $12,000 MFJ, $1,500 per dependent
    personalExemption: {
      amount: D(6000),
      spouseAmount: D(6000),
      dependentAmount: D(1500),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// MISSOURI (MO)
// Source: RSMo §143.011, Missouri DOR
// https://dor.mo.gov/taxation/individual/tax-types/income/year-changes/
// 2025: Top rate 4.7% (statutory trigger reduction). Graduated brackets
// with narrow low-income tiers. MO conforms to federal standard deduction.
// HB 798 (2024) will transition to flat 4.7% in 2026.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MO"] = {
  2025: {
    name: "Missouri",
    // 2025 brackets (indexed; same for all filing statuses)
    taxBrackets: {
      single: brackets(
        [0, 1313, 0.00],
        [1313, 2626, 0.02],
        [2626, 3939, 0.025],
        [3939, 5252, 0.03],
        [5252, 6565, 0.035],
        [6565, 7878, 0.04],
        [7878, 9191, 0.045],
        [9191, null, 0.047]
      ),
      married_filing_jointly: brackets(
        [0, 1313, 0.00],
        [1313, 2626, 0.02],
        [2626, 3939, 0.025],
        [3939, 5252, 0.03],
        [5252, 6565, 0.035],
        [6565, 7878, 0.04],
        [7878, 9191, 0.045],
        [9191, null, 0.047]
      ),
    },
    // MO adopted federal standard deduction (2025)
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
    },
    // Personal exemptions eliminated
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: true, // KC/STL levy 1% local earnings tax
  },
};

// ════════════════════════════════════════════════════════════════
// MONTANA (MT)
// Source: MCA §15-30-2103, Montana DOR
// https://mtrevenue.gov/taxes/individual-income-tax/
// https://revenue.mt.gov/montana-tax-simplification-resource-hub
// SB 399 (2021) + SB 121 (2023): Reduced to 2 brackets for 2024+.
// Starts from federal taxable income (not AGI). No state standard deduction
// (federal already deducted). Personal exemptions eliminated.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["MT"] = {
  2025: {
    name: "Montana",
    // 2025: 2 brackets (SB 399/SB 121 reform)
    taxBrackets: {
      single: brackets(
        [0, 21100, 0.047],
        [21100, null, 0.059]
      ),
      married_filing_jointly: brackets(
        [0, 42200, 0.047],
        [42200, null, 0.059]
      ),
      married_filing_separately: brackets(
        [0, 21100, 0.047],
        [21100, null, 0.059]
      ),
      head_of_household: brackets(
        [0, 31700, 0.047],
        [31700, null, 0.059]
      ),
    },
    // MT starts from federal taxable income — no additional standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // Personal exemptions eliminated under SB 399
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: false,
    usesFederalTaxableIncome: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// NEBRASKA (NE)
// Source: R.R.S. Neb. §77-2715, Nebraska DOR
// https://revenue.nebraska.gov/individuals/individual-income-tax
// LB 754 (2023): Phased rate reductions. 2025 top rate 5.20% (→3.99% by 2027).
// NE has its own standard deduction (not federal). Exemptions applied as credits.
// Source: https://revenue.nebraska.gov/individuals/individual-income-tax
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["NE"] = {
  2025: {
    name: "Nebraska",
    // 2025 brackets (indexed, LB 754 rate reductions)
    taxBrackets: {
      single: brackets(
        [0, 4030, 0.0246],
        [4030, 24120, 0.0351],
        [24120, 38870, 0.0501],
        [38870, null, 0.052]
      ),
      married_filing_jointly: brackets(
        [0, 8040, 0.0246],
        [8040, 48250, 0.0351],
        [48250, 77730, 0.0501],
        [77730, null, 0.052]
      ),
      married_filing_separately: brackets(
        [0, 4030, 0.0246],
        [4030, 24120, 0.0351],
        [24120, 38870, 0.0501],
        [38870, null, 0.052]
      ),
      head_of_household: brackets(
        [0, 7510, 0.0246],
        [7510, 38590, 0.0351],
        [38590, 57630, 0.0501],
        [57630, null, 0.052]
      ),
    },
    // NE has its own standard deduction (different from federal)
    standardDeduction: {
      single: D(8600),
      married_filing_jointly: D(17200),
      married_filing_separately: D(8600),
      head_of_household: D(12600),
    },
    // NE personal exemption credit: $171 per person (2025 indexed)
    personalExemption: {
      amount: D(171),
      spouseAmount: D(171),
      dependentAmount: D(171),
    },
    exemptionsAreCredits: true,
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// NEW JERSEY (NJ)
// Source: N.J.S.A. 54A:2-1, NJ Division of Taxation
// https://www.nj.gov/treasury/taxation/taxtables.shtml
// 7 graduated brackets from 1.4% to 10.75%. Same brackets all filing statuses.
// NJ has no standard deduction. NJ Gross Income is not federal AGI;
// the generic engine uses federal AGI only as a best-effort approximation.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["NJ"] = {
  2025: {
    name: "New Jersey",
    // Same rate schedule for all filing statuses
    taxBrackets: {
      single: brackets(
        [0, 20000, 0.014],
        [20000, 35000, 0.0175],
        [35000, 40000, 0.035],
        [40000, 75000, 0.05525],
        [75000, 500000, 0.0637],
        [500000, 1000000, 0.0897],
        [1000000, null, 0.1075]
      ),
      married_filing_jointly: brackets(
        [0, 20000, 0.014],
        [20000, 35000, 0.0175],
        [35000, 40000, 0.035],
        [40000, 75000, 0.05525],
        [75000, 500000, 0.0637],
        [500000, 1000000, 0.0897],
        [1000000, null, 0.1075]
      ),
    },
    // NJ has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // NJ personal exemption: $1,000 per taxpayer/spouse, $1,500 per dependent
    personalExemption: {
      amount: D(1000),
      spouseAmount: D(1000),
      dependentAmount: D(1500),
    },
    useFederalAGI: false,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// NEW MEXICO (NM)
// Source: N.M. Stat. §7-2-7, NM Taxation and Revenue Dept
// https://www.tax.newmexico.gov/individuals/personal-income-tax-information-overview/
// 2025 rates: https://www.tax.newmexico.gov/all-nm-taxes/current-historic-tax-rates-overview/personal-income-tax-rates/
// HB 252 (Laws 2024 Ch. 67) restructured 2025 into 6 graduated brackets from 1.5% to 5.9%.
// Heads of household share the joint/surviving-spouse schedule; MFS has its own schedule.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["NM"] = {
  2025: {
    name: "New Mexico",
    taxBrackets: {
      single: brackets(
        [0, 5500, 0.015],
        [5500, 16500, 0.032],
        [16500, 33500, 0.043],
        [33500, 66500, 0.047],
        [66500, 210000, 0.049],
        [210000, null, 0.059]
      ),
      married_filing_jointly: brackets(
        [0, 8000, 0.015],
        [8000, 25000, 0.032],
        [25000, 50000, 0.043],
        [50000, 100000, 0.047],
        [100000, 315000, 0.049],
        [315000, null, 0.059]
      ),
      married_filing_separately: brackets(
        [0, 4000, 0.015],
        [4000, 12500, 0.032],
        [12500, 25000, 0.043],
        [25000, 50000, 0.047],
        [50000, 157500, 0.049],
        [157500, null, 0.059]
      ),
      head_of_household: brackets(
        [0, 8000, 0.015],
        [8000, 25000, 0.032],
        [25000, 50000, 0.043],
        [50000, 100000, 0.047],
        [100000, 315000, 0.049],
        [315000, null, 0.059]
      ),
    },
    // NM conforms to federal standard deduction
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
    },
    // Personal exemptions not modeled in generic engine (NM uses credits/rebates separately)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// NEW YORK (NY)
// Source: N.Y. Tax Law §601, NY Dept of Taxation and Finance
// https://www.tax.ny.gov/pit/file/tax-tables/2025.htm
// 9 graduated brackets from 4% to 10.9%. NYC/Yonkers local taxes not modeled.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["NY"] = {
  2025: {
    name: "New York",
    taxBrackets: {
      single: brackets(
        [0, 8500, 0.04],
        [8500, 11700, 0.045],
        [11700, 13900, 0.0525],
        [13900, 80650, 0.055],
        [80650, 215400, 0.06],
        [215400, 1077550, 0.0685],
        [1077550, 5000000, 0.0965],
        [5000000, 25000000, 0.103],
        [25000000, null, 0.109]
      ),
      married_filing_jointly: brackets(
        [0, 17150, 0.04],
        [17150, 23600, 0.045],
        [23600, 27900, 0.0525],
        [27900, 161550, 0.055],
        [161550, 323200, 0.06],
        [323200, 2155350, 0.0685],
        [2155350, 5000000, 0.0965],
        [5000000, 25000000, 0.103],
        [25000000, null, 0.109]
      ),
    },
    // NY standard deduction (state-specific amounts, not federal)
    standardDeduction: {
      single: D(8000),
      married_filing_jointly: D(16050),
      married_filing_separately: D(8000),
      head_of_household: D(11200),
    },
    // NY: no personal exemption for taxpayer/spouse; $1,000 per dependent
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(1000),
    },
    useFederalAGI: true,
    hasLocalTax: true, // NYC 3.078%–3.876%, Yonkers 16.75% surcharge
  },
};

// ════════════════════════════════════════════════════════════════
// NORTH CAROLINA (NC)
// Source: N.C.G.S. §105-153.7, NC DOR
// https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules
// 2025: Flat 4.25% (HB 334 schedule: 4.99%→4.75%→4.5%→4.25%→3.99% in 2026)
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["NC"] = {
  2025: {
    name: "North Carolina",
    taxBrackets: {
      single: brackets([0, null, 0.0425]),
      married_filing_jointly: brackets([0, null, 0.0425]),
      married_filing_separately: brackets([0, null, 0.0425]),
      head_of_household: brackets([0, null, 0.0425]),
    },
    standardDeduction: {
      single: D(12750),
      married_filing_jointly: D(25500),
      married_filing_separately: D(12750),
      head_of_household: D(19125),
    },
    // NC eliminated personal exemptions
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// NORTH DAKOTA (ND)
// Source: N.D.C.C. §57-38-30.3, ND Office of State Tax Commissioner
// https://www.tax.nd.gov/individual-income-tax-history
// HB 1158 (2023): 3 brackets (0%, 1.95%, 2.5%) replacing old 5-bracket system.
// Large zero-rate bracket effectively exempts low-to-moderate income.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["ND"] = {
  2025: {
    name: "North Dakota",
    taxBrackets: {
      single: brackets(
        [0, 47150, 0.00],
        [47150, 238200, 0.0195],
        [238200, null, 0.025]
      ),
      married_filing_jointly: brackets(
        [0, 78775, 0.00],
        [78775, 275100, 0.0195],
        [275100, null, 0.025]
      ),
    },
    // ND standard deduction (state-specific amounts)
    standardDeduction: {
      single: D(15000),
      married_filing_jointly: D(30000),
      married_filing_separately: D(15000),
      head_of_household: D(22500),
    },
    // Personal exemptions eliminated under HB 1158
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// OHIO (OH)
// Source: ORC §5747.02, Ohio Dept of Taxation
// https://tax.ohio.gov/individual/resources/annual-tax-rates
// HB 33 (2023): 3 brackets (0%, 2.75%, 3.125%). No standard deduction.
// Personal exemptions are income-dependent ($1,850-$2,350); generic uses $2,350.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["OH"] = {
  2025: {
    name: "Ohio",
    // Same brackets for all filing statuses
    taxBrackets: {
      single: brackets(
        [0, 26050, 0.00],
        [26050, 100000, 0.0275],
        [100000, null, 0.03125]
      ),
      married_filing_jointly: brackets(
        [0, 26050, 0.00],
        [26050, 100000, 0.0275],
        [100000, null, 0.03125]
      ),
    },
    // OH has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // OH personal exemption: $2,350 per person (income-dependent; generic uses max)
    // Actual: ≤$40K→$2,350, $40K-$80K→$2,100, >$80K→$1,850
    personalExemption: {
      amount: D(2350),
      spouseAmount: D(2350),
      dependentAmount: D(2350),
    },
    useFederalAGI: true,
    hasLocalTax: true, // Most cities levy 1.5%–2.5% municipal income tax
  },
};

// ════════════════════════════════════════════════════════════════
// OKLAHOMA (OK)
// Source: 68 O.S. §2355, Oklahoma Tax Commission
// https://oklahoma.gov/tax/individuals.html
// 6 graduated brackets from 0.25% to 4.75%.
// MFJ brackets are double single thresholds.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["OK"] = {
  2025: {
    name: "Oklahoma",
    taxBrackets: {
      single: brackets(
        [0, 1000, 0.0025],
        [1000, 2500, 0.0075],
        [2500, 3750, 0.0175],
        [3750, 4900, 0.0275],
        [4900, 7200, 0.0375],
        [7200, null, 0.0475]
      ),
      married_filing_jointly: brackets(
        [0, 2000, 0.0025],
        [2000, 5000, 0.0075],
        [5000, 7500, 0.0175],
        [7500, 9800, 0.0275],
        [9800, 14400, 0.0375],
        [14400, null, 0.0475]
      ),
    },
    standardDeduction: {
      single: D(6350),
      married_filing_jointly: D(12700),
      married_filing_separately: D(6350),
      head_of_household: D(9350),
    },
    // OK personal exemption: $1,000 per person
    personalExemption: {
      amount: D(1000),
      spouseAmount: D(1000),
      dependentAmount: D(1000),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// OREGON (OR)
// Source: ORS §316.037, Oregon DOR
// https://www.oregon.gov/dor/programs/individuals/pages/pit.aspx
// 4 graduated brackets from 4.75% to 9.9%.
// OR allows deduction for federal income tax paid (not modeled in generic).
// Portland Metro/Multnomah County taxes not modeled.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["OR"] = {
  2025: {
    name: "Oregon",
    taxBrackets: {
      single: brackets(
        [0, 4400, 0.0475],
        [4400, 11050, 0.0675],
        [11050, 125000, 0.0875],
        [125000, null, 0.099]
      ),
      married_filing_jointly: brackets(
        [0, 8800, 0.0475],
        [8800, 22100, 0.0675],
        [22100, 250000, 0.0875],
        [250000, null, 0.099]
      ),
      married_filing_separately: brackets(
        [0, 4400, 0.0475],
        [4400, 11050, 0.0675],
        [11050, 125000, 0.0875],
        [125000, null, 0.099]
      ),
      head_of_household: brackets(
        [0, 8800, 0.0475],
        [8800, 22100, 0.0675],
        [22100, 250000, 0.0875],
        [250000, null, 0.099]
      ),
    },
    // OR standard deduction (2025 indexed)
    standardDeduction: {
      single: D(2835),
      married_filing_jointly: D(5670),
      married_filing_separately: D(2835),
      head_of_household: D(4560),
    },
    // Personal exemptions eliminated (TCJA conformity); OR has $200 dependent credit (not modeled)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: true, // Portland Metro 1%, Multnomah County preschool 1.5%
  },
};

// ════════════════════════════════════════════════════════════════
// PENNSYLVANIA (PA)
// Source: 72 P.S. §7302, PA DOR
// https://www.revenue.pa.gov/Tax%20Types/PIT/Pages/default.aspx
// Flat 3.07% rate. PA does NOT conform to federal AGI — it uses
// 8 classes of income. The generic engine uses federal AGI only as a
// best-effort approximation.
// No standard deduction, no personal exemptions (uses Tax Forgiveness).
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["PA"] = {
  2025: {
    name: "Pennsylvania",
    taxBrackets: {
      single: brackets([0, null, 0.0307]),
      married_filing_jointly: brackets([0, null, 0.0307]),
      married_filing_separately: brackets([0, null, 0.0307]),
      head_of_household: brackets([0, null, 0.0307]),
    },
    // PA has no standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // PA has no personal exemptions (Tax Forgiveness not modeled in generic engine)
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: false,
    hasLocalTax: true, // Philadelphia 3.75%, many localities have earned income tax
  },
};

// ════════════════════════════════════════════════════════════════
// RHODE ISLAND (RI)
// Source: RIGL §44-30-2.6, RI Division of Taxation
// https://tax.ri.gov/tax-sections/personal-income-tax
// 3 graduated brackets. Same brackets for all filing statuses.
// 2025 thresholds indexed for inflation.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["RI"] = {
  2025: {
    name: "Rhode Island",
    taxBrackets: {
      // Same brackets for all filing statuses (ADV 2025-22)
      single: brackets(
        [0, 79900, 0.0375],
        [79900, 181650, 0.0475],
        [181650, null, 0.0599]
      ),
      married_filing_jointly: brackets(
        [0, 79900, 0.0375],
        [79900, 181650, 0.0475],
        [181650, null, 0.0599]
      ),
    },
    // RI standard deduction (2025 indexed per ADV 2025-22)
    standardDeduction: {
      single: D(10900),
      married_filing_jointly: D(21800),
      married_filing_separately: D(10900),
      head_of_household: D(16350),
    },
    // RI personal exemption: $5,100 per exemption (2025 indexed per ADV 2025-22)
    // Phases out between $254,250–$283,250 MAGI (not modeled in generic engine)
    personalExemption: {
      amount: D(5100),
      spouseAmount: D(5100),
      dependentAmount: D(5100),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// SOUTH CAROLINA (SC)
// Source: SC Code §12-6-510, SC DOR
// https://dor.sc.gov/iit
// https://dor.sc.gov/sites/dor/files/forms/IITPacket_2025.pdf
// 2025: Top rate reduced to 6.0% (from 6.2% in 2024), brackets indexed.
// SC starts from federal taxable income (Line 15), so federal std deduction
// is already applied. Dependent exemption $4,930.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["SC"] = {
  2025: {
    name: "South Carolina",
    // SC 2025: 0%/$3,560, 3%/$17,830, 6.0% top (H.4880 schedule, inflation-adjusted)
    taxBrackets: {
      single: brackets(
        [0, 3560, 0.00],
        [3560, 17830, 0.03],
        [17830, null, 0.06]
      ),
      married_filing_jointly: brackets(
        [0, 3560, 0.00],
        [3560, 17830, 0.03],
        [17830, null, 0.06]
      ),
    },
    // SC starts from federal taxable income — no additional standard deduction
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // SC: no taxpayer/spouse exemption (embedded in federal); $4,930 per dependent
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(4930),
    },
    useFederalAGI: false,
    usesFederalTaxableIncome: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// UTAH (UT)
// Source: Utah Code §59-10-104, Utah State Tax Commission
// https://tax.utah.gov/forms/drafts/tc-40inst.pdf
// Flat 4.5% for 2025 (HB 106, down from 4.55%).
// UT computes tax on Utah taxable income, then applies a 6% credit based on the
// federal standard/itemized deduction plus $2,111 per dependent, phased out by
// 1.3% of income above the filing-status threshold.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["UT"] = {
  2025: {
    name: "Utah",
    taxBrackets: {
      single: brackets([0, null, 0.045]),
      married_filing_jointly: brackets([0, null, 0.045]),
      married_filing_separately: brackets([0, null, 0.045]),
      head_of_household: brackets([0, null, 0.045]),
    },
    // Federal standard deduction amounts used as the Utah credit base when itemized is not provided.
    standardDeduction: {
      single: D(15750),
      married_filing_jointly: D(31500),
      married_filing_separately: D(15750),
      head_of_household: D(23625),
      qualifying_surviving_spouse: D(31500),
    },
    standardDeductionMode: "credit_base_only",
    // Dependent exemption amount before the 6% Utah credit rate is applied.
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(2111),
    },
    exemptionsAreCredits: true,
    creditRate: D(0.06),
    exemptionPhaseOut: {
      threshold: {
        single: D(18213),
        married_filing_jointly: D(36426),
        married_filing_separately: D(18213),
        head_of_household: D(27320),
        qualifying_surviving_spouse: D(36426),
      },
      divisor: D("76.9230769230769231"), // equivalent to a 1.3% phase-out rate
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// VERMONT (VT)
// Source: 32 V.S.A. §5822, VT Department of Taxes
// https://tax.vermont.gov/individuals/income-tax-rates
// 4 graduated brackets. VT conforms to federal standard deduction
// and personal exemption.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["VT"] = {
  2025: {
    name: "Vermont",
    taxBrackets: {
      single: brackets(
        [0, 45400, 0.0335],
        [45400, 110050, 0.066],
        [110050, 229550, 0.076],
        [229550, null, 0.0875]
      ),
      married_filing_jointly: brackets(
        [0, 76000, 0.0335],
        [76000, 183400, 0.066],
        [183400, 279450, 0.076],
        [279450, null, 0.0875]
      ),
      married_filing_separately: brackets(
        [0, 38000, 0.0335],
        [38000, 91700, 0.066],
        [91700, 139725, 0.076],
        [139725, null, 0.0875]
      ),
      head_of_household: brackets(
        [0, 60850, 0.0335],
        [60850, 156900, 0.066],
        [156900, 254650, 0.076],
        [254650, null, 0.0875]
      ),
    },
    // VT conforms to federal standard deduction
    standardDeduction: {
      single: D(15000),
      married_filing_jointly: D(30000),
      married_filing_separately: D(15000),
      head_of_household: D(22500),
    },
    // VT personal exemption: $4,700 (2025 indexed, matches federal)
    personalExemption: {
      amount: D(4700),
      spouseAmount: D(4700),
      dependentAmount: D(4700),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// VIRGINIA (VA)
// Source: Va. Code §58.1-320, Virginia Tax
// https://www.tax.virginia.gov/individual-income-tax
// https://www.tax.virginia.gov/deductions
// https://www.tax.virginia.gov/exemptions
// 4 brackets (unchanged since 1987). Same brackets for all filers.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["VA"] = {
  2025: {
    name: "Virginia",
    taxBrackets: {
      single: brackets(
        [0, 3000, 0.02],
        [3000, 5000, 0.03],
        [5000, 17000, 0.05],
        [17000, null, 0.0575]
      ),
      married_filing_jointly: brackets(
        [0, 3000, 0.02],
        [3000, 5000, 0.03],
        [5000, 17000, 0.05],
        [17000, null, 0.0575]
      ),
    },
    // VA standard deduction: $8,750 single/MFS, $17,500 MFJ
    standardDeduction: {
      single: D(8750),
      married_filing_jointly: D(17500),
      married_filing_separately: D(8750),
      head_of_household: D(8750),
    },
    // VA personal exemption: $930 per person
    personalExemption: {
      amount: D(930),
      spouseAmount: D(930),
      dependentAmount: D(930),
    },
    useFederalAGI: true,
    hasLocalTax: false, // VA localities impose separate personal property tax, not income tax
  },
};

// ════════════════════════════════════════════════════════════════
// WEST VIRGINIA (WV)
// Source: WV Code §11-21-4e, WV State Tax Department
// https://tax.wv.gov/Individuals/Pages/PersonalIncomeTax.aspx
// https://tax.wv.gov/Documents/PIT/2025/it140.PersonalIncomeTaxFormsAndInstructions.2025.pdf
// 2025: Per HB 2526, rates reduced to 2.22%–4.82%.
// Schedule II applies separate thresholds for married filing separately.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["WV"] = {
  2025: {
    name: "West Virginia",
    taxBrackets: {
      single: brackets(
        [0, 10000, 0.0222],
        [10000, 25000, 0.0296],
        [25000, 40000, 0.0333],
        [40000, 60000, 0.0444],
        [60000, null, 0.0482]
      ),
      married_filing_jointly: brackets(
        [0, 10000, 0.0222],
        [10000, 25000, 0.0296],
        [25000, 40000, 0.0333],
        [40000, 60000, 0.0444],
        [60000, null, 0.0482]
      ),
      married_filing_separately: brackets(
        [0, 5000, 0.0222],
        [5000, 12500, 0.0296],
        [12500, 20000, 0.0333],
        [20000, 30000, 0.0444],
        [30000, null, 0.0482]
      ),
    },
    // WV does not have a general standard deduction on Form IT-140.
    standardDeduction: {
      single: D(0),
      married_filing_jointly: D(0),
      married_filing_separately: D(0),
      head_of_household: D(0),
    },
    // WV personal exemption: $2,000 per person
    personalExemption: {
      amount: D(2000),
      spouseAmount: D(2000),
      dependentAmount: D(2000),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

const WI_2025_STANDARD_DEDUCTION_ROWS: Array<
  [number, number | null, number, number, number, number]
> = [
  [0, 13390, 13560, 25110, 11930, 17520],
  [13390, 13500, 13560, 25110, 11919, 17520],
  [13500, 14000, 13560, 25110, 11859, 17520],
  [14000, 14500, 13560, 25110, 11760, 17520],
  [14500, 15000, 13560, 25110, 11661, 17520],
  [15000, 15500, 13560, 25110, 11562, 17520],
  [15500, 16000, 13560, 25110, 11463, 17520],
  [16000, 16500, 13560, 25110, 11364, 17520],
  [16500, 17000, 13560, 25110, 11265, 17520],
  [17000, 17500, 13560, 25110, 11167, 17520],
  [17500, 18000, 13560, 25110, 11068, 17520],
  [18000, 18500, 13560, 25110, 10969, 17520],
  [18500, 19000, 13560, 25110, 10870, 17520],
  [19000, 19500, 13560, 25110, 10771, 17520],
  [19500, 20000, 13536, 25110, 10672, 17475],
  [20000, 20500, 13476, 25110, 10573, 17362],
  [20500, 21000, 13416, 25110, 10474, 17250],
  [21000, 21500, 13356, 25110, 10375, 17137],
  [21500, 22000, 13296, 25110, 10277, 17025],
  [22000, 22500, 13236, 25110, 10178, 16912],
  [22500, 23000, 13176, 25110, 10079, 16800],
  [23000, 23500, 13116, 25110, 9980, 16687],
  [23500, 24000, 13056, 25110, 9881, 16574],
  [24000, 24500, 12996, 25110, 9782, 16462],
  [24500, 25000, 12936, 25110, 9683, 16349],
  [25000, 25500, 12876, 25110, 9584, 16237],
  [25500, 26000, 12816, 25110, 9485, 16124],
  [26000, 26500, 12756, 25110, 9387, 16011],
  [26500, 27000, 12696, 25110, 9288, 15899],
  [27000, 27500, 12636, 25110, 9189, 15786],
  [27500, 28000, 12576, 25110, 9090, 15674],
  [28000, 28500, 12516, 25102, 8991, 15561],
  [28500, 29000, 12456, 25003, 8892, 15449],
  [29000, 29500, 12396, 24904, 8793, 15336],
  [29500, 30000, 12336, 24805, 8694, 15223],
  [30000, 30500, 12276, 24707, 8595, 15111],
  [30500, 31000, 12216, 24608, 8497, 14998],
  [31000, 31500, 12156, 24509, 8398, 14886],
  [31500, 32000, 12096, 24410, 8299, 14773],
  [32000, 32500, 12036, 24311, 8200, 14661],
  [32500, 33000, 11976, 24212, 8101, 14548],
  [33000, 33500, 11916, 24113, 8002, 14435],
  [33500, 34000, 11856, 24014, 7903, 14323],
  [34000, 34500, 11796, 23915, 7804, 14210],
  [34500, 35000, 11736, 23817, 7705, 14098],
  [35000, 35500, 11676, 23718, 7607, 13985],
  [35500, 36000, 11616, 23619, 7508, 13873],
  [36000, 36500, 11556, 23520, 7409, 13760],
  [36500, 37000, 11496, 23421, 7310, 13647],
  [37000, 37500, 11436, 23322, 7211, 13535],
  [37500, 38000, 11376, 23223, 7112, 13422],
  [38000, 38500, 11316, 23124, 7013, 13310],
  [38500, 39000, 11256, 23025, 6914, 13197],
  [39000, 39500, 11196, 22927, 6815, 13085],
  [39500, 40000, 11136, 22828, 6717, 12972],
  [40000, 40500, 11076, 22729, 6618, 12859],
  [40500, 41000, 11016, 22630, 6519, 12747],
  [41000, 41500, 10956, 22531, 6420, 12634],
  [41500, 42000, 10896, 22432, 6321, 12522],
  [42000, 42500, 10836, 22333, 6222, 12409],
  [42500, 43000, 10776, 22234, 6123, 12297],
  [43000, 43500, 10716, 22135, 6024, 12184],
  [43500, 44000, 10656, 22036, 5925, 12071],
  [44000, 44500, 10596, 21938, 5827, 11959],
  [44500, 45000, 10536, 21839, 5728, 11846],
  [45000, 45500, 10476, 21740, 5629, 11734],
  [45500, 46000, 10416, 21641, 5530, 11621],
  [46000, 46500, 10356, 21542, 5431, 11508],
  [46500, 47000, 10296, 21443, 5332, 11396],
  [47000, 47500, 10236, 21344, 5233, 11283],
  [47500, 48000, 10176, 21245, 5134, 11171],
  [48000, 48500, 10116, 21146, 5035, 11058],
  [48500, 49000, 10056, 21048, 4936, 10946],
  [49000, 49500, 9996, 20949, 4838, 10833],
  [49500, 50000, 9936, 20850, 4739, 10720],
  [50000, 50500, 9876, 20751, 4640, 10608],
  [50500, 51000, 9816, 20652, 4541, 10495],
  [51000, 51500, 9756, 20553, 4442, 10383],
  [51500, 52000, 9696, 20454, 4343, 10270],
  [52000, 52500, 9636, 20355, 4244, 10158],
  [52500, 53000, 9576, 20256, 4145, 10045],
  [53000, 53500, 9516, 20158, 4046, 9932],
  [53500, 54000, 9456, 20059, 3948, 9820],
  [54000, 54500, 9396, 19960, 3849, 9707],
  [54500, 55000, 9336, 19861, 3750, 9595],
  [55000, 55500, 9276, 19762, 3651, 9482],
  [55500, 56000, 9216, 19663, 3552, 9370],
  [56000, 56500, 9156, 19564, 3453, 9257],
  [56500, 57000, 9096, 19465, 3354, 9144],
  [57000, 57500, 9036, 19366, 3255, 9036],
  [57500, 58000, 8976, 19268, 3156, 8976],
  [58000, 58500, 8916, 19169, 3058, 8916],
  [58500, 59000, 8856, 19070, 2959, 8856],
  [59000, 59500, 8796, 18971, 2860, 8796],
  [59500, 60000, 8736, 18872, 2761, 8736],
  [60000, 60500, 8676, 18773, 2662, 8676],
  [60500, 61000, 8616, 18674, 2563, 8616],
  [61000, 61500, 8556, 18575, 2464, 8556],
  [61500, 62000, 8496, 18476, 2365, 8496],
  [62000, 62500, 8436, 18378, 2266, 8436],
  [62500, 63000, 8376, 18279, 2168, 8376],
  [63000, 63500, 8316, 18180, 2069, 8316],
  [63500, 64000, 8256, 18081, 1970, 8256],
  [64000, 64500, 8196, 17982, 1871, 8196],
  [64500, 65000, 8136, 17883, 1772, 8136],
  [65000, 65500, 8076, 17784, 1673, 8076],
  [65500, 66000, 8016, 17685, 1574, 8016],
  [66000, 66500, 7956, 17586, 1475, 7956],
  [66500, 67000, 7896, 17488, 1376, 7896],
  [67000, 67500, 7836, 17389, 1278, 7836],
  [67500, 68000, 7776, 17290, 1179, 7776],
  [68000, 68500, 7716, 17191, 1080, 7716],
  [68500, 69000, 7656, 17092, 981, 7656],
  [69000, 69500, 7596, 16993, 882, 7596],
  [69500, 70000, 7536, 16894, 783, 7536],
  [70000, 70500, 7476, 16795, 684, 7476],
  [70500, 71000, 7416, 16696, 585, 7416],
  [71000, 71500, 7356, 16598, 486, 7356],
  [71500, 72000, 7296, 16499, 388, 7296],
  [72000, 72500, 7236, 16400, 289, 7236],
  [72500, 73000, 7176, 16301, 190, 7176],
  [73000, 73500, 7116, 16202, 91, 7116],
  [73500, 74000, 7056, 16103, 0, 7056],
  [74000, 74500, 6996, 16004, 0, 6996],
  [74500, 75000, 6936, 15905, 0, 6936],
  [75000, 75500, 6876, 15806, 0, 6876],
  [75500, 76000, 6816, 15708, 0, 6816],
  [76000, 76500, 6756, 15609, 0, 6756],
  [76500, 77000, 6696, 15510, 0, 6696],
  [77000, 77500, 6636, 15411, 0, 6636],
  [77500, 78000, 6576, 15312, 0, 6576],
  [78000, 78500, 6516, 15213, 0, 6516],
  [78500, 79000, 6456, 15114, 0, 6456],
  [79000, 79500, 6396, 15015, 0, 6396],
  [79500, 80000, 6336, 14916, 0, 6336],
  [80000, 80500, 6276, 14818, 0, 6276],
  [80500, 81000, 6216, 14719, 0, 6216],
  [81000, 81500, 6156, 14620, 0, 6156],
  [81500, 82000, 6096, 14521, 0, 6096],
  [82000, 82500, 6036, 14422, 0, 6036],
  [82500, 83000, 5976, 14323, 0, 5976],
  [83000, 83500, 5916, 14224, 0, 5916],
  [83500, 84000, 5856, 14125, 0, 5856],
  [84000, 84500, 5796, 14026, 0, 5796],
  [84500, 85000, 5736, 13928, 0, 5736],
  [85000, 85500, 5676, 13829, 0, 5676],
  [85500, 86000, 5616, 13730, 0, 5616],
  [86000, 86500, 5556, 13631, 0, 5556],
  [86500, 87000, 5496, 13532, 0, 5496],
  [87000, 87500, 5436, 13433, 0, 5436],
  [87500, 88000, 5376, 13334, 0, 5376],
  [88000, 88500, 5316, 13235, 0, 5316],
  [88500, 89000, 5256, 13136, 0, 5256],
  [89000, 89500, 5196, 13038, 0, 5196],
  [89500, 90000, 5136, 12939, 0, 5136],
  [90000, 90500, 5076, 12840, 0, 5076],
  [90500, 91000, 5016, 12741, 0, 5016],
  [91000, 91500, 4956, 12642, 0, 4956],
  [91500, 92000, 4896, 12543, 0, 4896],
  [92000, 92500, 4836, 12444, 0, 4836],
  [92500, 93000, 4776, 12345, 0, 4776],
  [93000, 93500, 4716, 12246, 0, 4716],
  [93500, 94000, 4656, 12147, 0, 4656],
  [94000, 94500, 4596, 12049, 0, 4596],
  [94500, 95000, 4536, 11950, 0, 4536],
  [95000, 95500, 4476, 11851, 0, 4476],
  [95500, 96000, 4416, 11752, 0, 4416],
  [96000, 96500, 4356, 11653, 0, 4356],
  [96500, 97000, 4296, 11554, 0, 4296],
  [97000, 97500, 4236, 11455, 0, 4236],
  [97500, 98000, 4176, 11356, 0, 4176],
  [98000, 98500, 4116, 11257, 0, 4116],
  [98500, 99000, 4056, 11159, 0, 4056],
  [99000, 99500, 3996, 11060, 0, 3996],
  [99500, 100000, 3936, 10961, 0, 3936],
  [100000, 100500, 3876, 10862, 0, 3876],
  [100500, 101000, 3816, 10763, 0, 3816],
  [101000, 101500, 3756, 10664, 0, 3756],
  [101500, 102000, 3696, 10565, 0, 3696],
  [102000, 102500, 3636, 10466, 0, 3636],
  [102500, 103000, 3576, 10367, 0, 3576],
  [103000, 103500, 3516, 10269, 0, 3516],
  [103500, 104000, 3456, 10170, 0, 3456],
  [104000, 104500, 3396, 10071, 0, 3396],
  [104500, 105000, 3336, 9972, 0, 3336],
  [105000, 105500, 3276, 9873, 0, 3276],
  [105500, 106000, 3216, 9774, 0, 3216],
  [106000, 106500, 3156, 9675, 0, 3156],
  [106500, 107000, 3096, 9576, 0, 3096],
  [107000, 107500, 3036, 9477, 0, 3036],
  [107500, 108000, 2976, 9379, 0, 2976],
  [108000, 108500, 2916, 9280, 0, 2916],
  [108500, 109000, 2856, 9181, 0, 2856],
  [109000, 109500, 2796, 9082, 0, 2796],
  [109500, 110000, 2736, 8983, 0, 2736],
  [110000, 110500, 2676, 8884, 0, 2676],
  [110500, 111000, 2616, 8785, 0, 2616],
  [111000, 111500, 2556, 8686, 0, 2556],
  [111500, 112000, 2496, 8587, 0, 2496],
  [112000, 112500, 2436, 8489, 0, 2436],
  [112500, 113000, 2376, 8390, 0, 2376],
  [113000, 113500, 2316, 8291, 0, 2316],
  [113500, 114000, 2256, 8192, 0, 2256],
  [114000, 114500, 2196, 8093, 0, 2196],
  [114500, 115000, 2136, 7994, 0, 2136],
  [115000, 115500, 2076, 7895, 0, 2076],
  [115500, 116000, 2016, 7796, 0, 2016],
  [116000, 116500, 1956, 7697, 0, 1956],
  [116500, 117000, 1896, 7599, 0, 1896],
  [117000, 117500, 1836, 7500, 0, 1836],
  [117500, 118000, 1776, 7401, 0, 1776],
  [118000, 118500, 1716, 7302, 0, 1716],
  [118500, 119000, 1656, 7203, 0, 1656],
  [119000, 119500, 1596, 7104, 0, 1596],
  [119500, 120000, 1536, 7005, 0, 1536],
  [120000, 120500, 1476, 6906, 0, 1476],
  [120500, 121000, 1416, 6807, 0, 1416],
  [121000, 121500, 1356, 6709, 0, 1356],
  [121500, 122000, 1296, 6610, 0, 1296],
  [122000, 122500, 1236, 6511, 0, 1236],
  [122500, 123000, 1176, 6412, 0, 1176],
  [123000, 123500, 1116, 6313, 0, 1116],
  [123500, 124000, 1056, 6214, 0, 1056],
  [124000, 124500, 996, 6115, 0, 996],
  [124500, 125000, 936, 6016, 0, 936],
  [125000, 125500, 876, 5917, 0, 876],
  [125500, 126000, 816, 5819, 0, 816],
  [126000, 126500, 756, 5720, 0, 756],
  [126500, 127000, 696, 5621, 0, 696],
  [127000, 127500, 636, 5522, 0, 636],
  [127500, 128000, 576, 5423, 0, 576],
  [128000, 128500, 516, 5324, 0, 516],
  [128500, 129000, 456, 5225, 0, 456],
  [129000, 129500, 396, 5126, 0, 396],
  [129500, 130000, 336, 5027, 0, 336],
  [130000, 130500, 276, 4929, 0, 276],
  [130500, 131000, 216, 4830, 0, 216],
  [131000, 131500, 156, 4731, 0, 156],
  [131500, 132000, 96, 4632, 0, 96],
  [132000, 132500, 36, 4533, 0, 36],
  [132500, 133000, 0, 4434, 0, 0],
  [133000, 133500, 0, 4335, 0, 0],
  [133500, 134000, 0, 4236, 0, 0],
  [134000, 134500, 0, 4137, 0, 0],
  [134500, 135000, 0, 4039, 0, 0],
  [135000, 135500, 0, 3940, 0, 0],
  [135500, 136000, 0, 3841, 0, 0],
  [136000, 136500, 0, 3742, 0, 0],
  [136500, 137000, 0, 3643, 0, 0],
  [137000, 137500, 0, 3544, 0, 0],
  [137500, 138000, 0, 3445, 0, 0],
  [138000, 138500, 0, 3346, 0, 0],
  [138500, 139000, 0, 3247, 0, 0],
  [139000, 139500, 0, 3149, 0, 0],
  [139500, 140000, 0, 3050, 0, 0],
  [140000, 140500, 0, 2951, 0, 0],
  [140500, 141000, 0, 2852, 0, 0],
  [141000, 141500, 0, 2753, 0, 0],
  [141500, 142000, 0, 2654, 0, 0],
  [142000, 142500, 0, 2555, 0, 0],
  [142500, 143000, 0, 2456, 0, 0],
  [143000, 143500, 0, 2357, 0, 0],
  [143500, 144000, 0, 2258, 0, 0],
  [144000, 144500, 0, 2160, 0, 0],
  [144500, 145000, 0, 2061, 0, 0],
  [145000, 145500, 0, 1962, 0, 0],
  [145500, 146000, 0, 1863, 0, 0],
  [146000, 146500, 0, 1764, 0, 0],
  [146500, 147000, 0, 1665, 0, 0],
  [147000, 147500, 0, 1566, 0, 0],
  [147500, 148000, 0, 1467, 0, 0],
  [148000, 148500, 0, 1368, 0, 0],
  [148500, 149000, 0, 1270, 0, 0],
  [149000, 149500, 0, 1171, 0, 0],
  [149500, 150000, 0, 1072, 0, 0],
  [150000, 150500, 0, 973, 0, 0],
  [150500, 151000, 0, 874, 0, 0],
  [151000, 151500, 0, 775, 0, 0],
  [151500, 152000, 0, 676, 0, 0],
  [152000, 152500, 0, 577, 0, 0],
  [152500, 153000, 0, 478, 0, 0],
  [153000, 153500, 0, 380, 0, 0],
  [153500, 154000, 0, 281, 0, 0],
  [154000, 154500, 0, 182, 0, 0],
  [154500, 155000, 0, 83, 0, 0],
  [155000, 155169, 0, 17, 0, 0],
  [155169, null, 0, 0, 0, 0],
];

function wiStandardDeductionTable(
  valueIndex: 2 | 3 | 4 | 5
): StateStandardDeductionRange[] {
  return deductionTableExclusive(
    ...WI_2025_STANDARD_DEDUCTION_ROWS.map(
      (row) => [row[0], row[1], row[valueIndex]] as [number, number | null, number]
    )
  );
}

// ════════════════════════════════════════════════════════════════
// WISCONSIN (WI)
// Source: Wis. Stat. §71.06, WI DOR
// https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx
// https://www.revenue.wi.gov/TaxForms2025/2025-Form1-ES-Inst.pdf
// https://www.revenue.wi.gov/TaxForms2025/2025-Form1-Inst.pdf
// 4 graduated brackets. WI has its own standard deduction that
// phases out at higher incomes; maximum 2025 resident amounts are used here.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["WI"] = {
  2025: {
    name: "Wisconsin",
    taxBrackets: {
      single: brackets(
        [0, 14680, 0.035],
        [14680, 50480, 0.044],
        [50480, 323290, 0.053],
        [323290, null, 0.0765]
      ),
      married_filing_jointly: brackets(
        [0, 19580, 0.035],
        [19580, 67300, 0.044],
        [67300, 431060, 0.053],
        [431060, null, 0.0765]
      ),
      married_filing_separately: brackets(
        [0, 9790, 0.035],
        [9790, 33650, 0.044],
        [33650, 215530, 0.053],
        [215530, null, 0.0765]
      ),
    },
    // WI standard deduction (maximum resident amount; phases out at higher income)
    standardDeduction: {
      single: D(13560),
      married_filing_jointly: D(25110),
      married_filing_separately: D(11930),
      head_of_household: D(17520),
    },
    standardDeductionTable: {
      single: wiStandardDeductionTable(2),
      married_filing_jointly: wiStandardDeductionTable(3),
      married_filing_separately: wiStandardDeductionTable(4),
      head_of_household: wiStandardDeductionTable(5),
    },
    // WI personal exemption: $700 taxpayer, spouse on joint return, and each dependent
    personalExemption: {
      amount: D(700),
      spouseAmount: D(700),
      dependentAmount: D(700),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};

// ════════════════════════════════════════════════════════════════
// DISTRICT OF COLUMBIA (DC)
// Source: DC Code §47-1806.03, DC OTR
// https://otr.cfo.dc.gov/page/individual-income-tax-rates
// https://otr.cfo.dc.gov/sites/default/files/dc/sites/otr/publication/attachments/2025_D40_Book_Final_wLinks_030526_v1.0.pdf
// 7 graduated brackets, same for all filing statuses.
// ════════════════════════════════════════════════════════════════
STATE_CONSTANTS["DC"] = {
  2025: {
    name: "District of Columbia",
    taxBrackets: {
      single: brackets(
        [0, 10000, 0.04],
        [10000, 40000, 0.06],
        [40000, 60000, 0.065],
        [60000, 250000, 0.085],
        [250000, 500000, 0.0925],
        [500000, 1000000, 0.0975],
        [1000000, null, 0.1075]
      ),
      married_filing_jointly: brackets(
        [0, 10000, 0.04],
        [10000, 40000, 0.06],
        [40000, 60000, 0.065],
        [60000, 250000, 0.085],
        [250000, 500000, 0.0925],
        [500000, 1000000, 0.0975],
        [1000000, null, 0.1075]
      ),
    },
    // DC 2025 basic standard deduction amounts are now defined in the D-40 booklet.
    standardDeduction: {
      single: D(15000),
      married_filing_jointly: D(30000),
      married_filing_separately: D(15000),
      head_of_household: D(22500),
      qualifying_surviving_spouse: D(30000),
    },
    // D-40 no longer includes a general personal exemption deduction in the base computation.
    personalExemption: {
      amount: D(0),
      spouseAmount: D(0),
      dependentAmount: D(0),
    },
    useFederalAGI: true,
    hasLocalTax: false,
  },
};
