/**
 * Schedule H — Household Employment Taxes
 * Spec: spec/federal/schedule-h.yaml
 *
 * Computes Social Security, Medicare, Additional Medicare Tax, and FUTA
 * for household employees. The total flows to Schedule 2 Line 9.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface HouseholdEmployee {
  name?: string;
  cashWages: string | Decimal;
  isSpouse?: boolean;
  isChildUnder21?: boolean;
  isParent?: boolean;
  parentCareExceptionApplies?: boolean;
  isUnder18NonPrincipal?: boolean;
  federalIncomeTaxWithheld?: string | Decimal;
}

export interface ScheduleHInput {
  employees: HouseholdEmployee[];
  /** Whether FUTA applies (total wages ≥ $1,000 in any quarter) */
  futaApplies?: boolean;
  /** Whether Section A simplified FUTA applies (single state, paid timely, no credit reduction) */
  futaSectionA?: boolean;
  /** State unemployment contributions paid (Section B only) */
  stateUnemploymentContributions?: string | Decimal;
  taxYear?: number;
  futaStatePeriods?: Array<{
    state: string;
    periodStart: string;
    periodEnd: string;
    taxableWages: string | Decimal;
    experienceRate: string | Decimal | null;
    contributionsPaidTimely: string | Decimal;
  }>;
  stateUnemploymentContributionsPaidLate?: string | Decimal;
  /** FUTA credit reduction for credit reduction states */
  futaCreditReduction?: string | Decimal;
  constants: {
    cashWageThreshold: Decimal;
    socialSecurityRate: Decimal;
    medicareRate: Decimal;
    additionalMedicareRate: Decimal;
    additionalMedicareThreshold: Decimal;
    socialSecurityWageBase: Decimal;
    futaGrossRate: Decimal;
    futaMaxCredit: Decimal;
    futaNetRate: Decimal;
    futaWageBase: Decimal;
    futaQuarterlyThreshold: Decimal;
  };
}

export interface ScheduleHResult {
  /** Line 1: Total cash wages subject to Social Security tax */
  line1: Decimal;
  /** Line 2: Social Security tax (Line 1 x 12.4%) */
  line2: Decimal;
  /** Line 3: Total cash wages subject to Medicare tax */
  line3: Decimal;
  /** Line 4: Medicare tax (Line 3 x 2.9%) */
  line4: Decimal;
  /** Line 5: Total cash wages subject to Additional Medicare Tax */
  line5: Decimal;
  /** Line 6: Additional Medicare Tax withholding (Line 5 x 0.9%) */
  line6: Decimal;
  /** Line 7: Federal income tax withheld */
  line7: Decimal;
  /** Line 8: Total SS + Medicare + income tax */
  line8: Decimal;
  /** FUTA tax (Line 16 for Section A, or Line 24 for Section B) */
  futaTax: Decimal;
  /** Line 26: Total household employment taxes */
  totalTax: Decimal;
  /** Number of qualifying employees (met threshold, not exempt) */
  qualifyingEmployeeCount: number;
  lines: CalculatedLine[];
}

export function calculateScheduleH(input: ScheduleHInput): ScheduleHResult {
  const audit = new AuditTrail();
  const c = input.constants;
  const ZERO = new Decimal(0);
  if (typeof input.futaApplies !== "boolean") throw new Error("Schedule H requires the actual current/prior-year FUTA quarterly applicability fact.");
  if (input.futaApplies && typeof input.futaSectionA !== "boolean") throw new Error("Schedule H requires actual FUTA Section A eligibility facts.");
  if (input.futaApplies && !input.futaSectionA && (!input.futaStatePeriods?.length || input.stateUnemploymentContributionsPaidLate === undefined || input.futaCreditReduction === undefined)) throw new Error("Schedule H Section B requires actual state/rate periods, contribution timing and credit-reduction facts.");

  // Filter employees: exclude exempt workers (spouse, child <21, parent, under-18 non-principal)
  // and those below the cash wage threshold
  const qualifyingEmployees: Array<{
    label: string;
    wages: Decimal;
  }> = [];

  for (const emp of input.employees) {
    const wages = d(emp.cashWages);
    const label = emp.name ?? "Employee";
    for (const field of ["isSpouse", "isChildUnder21", "isParent", "isUnder18NonPrincipal"] as const) if (typeof emp[field] !== "boolean") throw new Error(`Schedule H employee exclusion ${field} is unknown.`);
    if (!wages.isFinite() || wages.isNegative() || d(emp.federalIncomeTaxWithheld).isNegative()) throw new Error("Schedule H cash wages and federal withholding must be nonnegative amounts.");
    if (emp.isParent && typeof emp.parentCareExceptionApplies !== "boolean") throw new Error("Schedule H requires the actual parent childcare exception facts.");

    // Exempt from Social Security and Medicare entirely
    if (emp.isSpouse || emp.isChildUnder21 || (emp.isParent && !emp.parentCareExceptionApplies) || emp.isUnder18NonPrincipal) {
      audit.record("Schedule H", "exempt", `${label} — exempt from Social Security and Medicare`,
        wages,
        emp.isSpouse ? "Spouse is exempt"
          : emp.isChildUnder21 ? "Child under age 21 is exempt"
          : emp.isParent ? "Parent is exempt"
          : "Under age 18, not principal occupation — exempt");
      continue;
    }

    // Below threshold: no Schedule H obligation for this employee
    if (wages.lessThan(c.cashWageThreshold)) {
      audit.record("Schedule H", "below_threshold", `${label} — below $${c.cashWageThreshold} threshold`,
        wages,
        `Cash wages $${wages} < $${c.cashWageThreshold} threshold — no Social Security or Medicare; FUTA and withholding remain separate`);
      continue;
    }

    qualifyingEmployees.push({
      label,
      wages,
    });
  }

  // ── Part I: Social Security, Medicare, and Federal Income Taxes ──

  // Line 1: Total cash wages subject to SS tax (capped at wage base per employee)
  const line1 = sum(
    ...qualifyingEmployees.map((emp) =>
      Decimal.min(emp.wages, c.socialSecurityWageBase)
    )
  );
  audit.record("Schedule H", "1", "Total cash wages subject to Social Security tax", line1,
    `Sum of qualifying wages capped at $${c.socialSecurityWageBase}/employee`,
    Object.fromEntries(
      qualifyingEmployees.map((emp) => [
        emp.label,
        Decimal.min(emp.wages, c.socialSecurityWageBase),
      ])
    ));

  // Line 2: Social Security tax
  const line2 = line1.times(c.socialSecurityRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  audit.record("Schedule H", "2", "Social Security tax", line2,
    `$${line1} × ${c.socialSecurityRate.times(100)}%`);

  // Line 3: Total cash wages subject to Medicare tax (no cap)
  const line3 = sum(...qualifyingEmployees.map((emp) => emp.wages));
  audit.record("Schedule H", "3", "Total cash wages subject to Medicare tax", line3,
    "Sum of qualifying wages (no cap)");

  // Line 4: Medicare tax
  const line4 = line3.times(c.medicareRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  audit.record("Schedule H", "4", "Medicare tax", line4,
    `$${line3} × ${c.medicareRate.times(100)}%`);

  // Line 5: Wages subject to Additional Medicare Tax (per-employee threshold)
  const line5 = sum(
    ...qualifyingEmployees.map((emp) =>
      Decimal.max(ZERO, emp.wages.minus(c.additionalMedicareThreshold))
    )
  );
  audit.record("Schedule H", "5", "Total cash wages subject to Additional Medicare Tax withholding", line5,
    `Sum of qualifying wages exceeding $${c.additionalMedicareThreshold}/employee`);

  // Line 6: Additional Medicare Tax
  const line6 = line5.times(c.additionalMedicareRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  audit.record("Schedule H", "6", "Additional Medicare Tax withholding", line6,
    `$${line5} × ${c.additionalMedicareRate.times(100)}%`);

  // Line 7: Federal income tax withheld (voluntary)
  const line7 = sum(
    ...input.employees.map((emp) => d(emp.federalIncomeTaxWithheld))
  );
  audit.record("Schedule H", "7", "Federal income tax withheld", line7,
    "Actual federal income tax withheld from all household employees, independent of Social Security/FUTA exclusions");

  // Line 8: Total Part I
  const line8 = sum(line2, line4, line6, line7);
  audit.record("Schedule H", "8", "Total Social Security, Medicare, and income taxes", line8,
    "Line 2 + Line 4 + Line 6 + Line 7");

  // ── Part II: FUTA Tax ──

  let futaTax = ZERO;

  if (input.futaApplies) {
    // Line 15: FUTA wages (capped at $7,000 per employee)
    // FUTA excludes family wages but does not use the Social Security threshold
    // or its unrelated under-18 principal-occupation exception.
    const futaWages = sum(
      ...input.employees
        .filter((emp) => !emp.isSpouse && !emp.isChildUnder21 && !emp.isParent)
        .map((emp) => Decimal.min(d(emp.cashWages), c.futaWageBase))
    );

    if (input.futaSectionA) {
      // Section A: simplified — net rate 0.6%
      futaTax = futaWages.times(c.futaNetRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      audit.record("Schedule H", "15", "Total cash wages subject to FUTA tax", futaWages,
        `Sum of qualifying wages capped at $${c.futaWageBase}/employee`);
      audit.record("Schedule H", "16", "FUTA tax (Section A)", futaTax,
        `$${futaWages} × ${c.futaNetRate.times(100)}% (net rate after max credit)`);
    } else {
      // Section B: gross rate minus allowable credit
      const grossFuta = futaWages.times(c.futaGrossRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const maxCredit = futaWages.times(c.futaMaxCredit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      let experienceCredit = ZERO;
      let timelyContributions = ZERO;
      const periods = input.futaStatePeriods ?? [];
      const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      const states = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI".split(" "));
      periods.forEach((period, index) => {
        if (!states.has(period.state) || !validDate(period.periodStart) || !validDate(period.periodEnd) || period.periodStart > period.periodEnd || period.periodStart.slice(0, 4) !== period.periodEnd.slice(0, 4)
          || (input.taxYear != null && !period.periodStart.startsWith(`${input.taxYear}-`))) throw new Error("Schedule H requires actual state/rate period dates within the tax year.");
        if (periods.some((other, otherIndex) => otherIndex < index && other.state === period.state && period.periodStart <= other.periodEnd && period.periodEnd >= other.periodStart)) throw new Error("Schedule H state/rate periods cannot overlap for the same state.");
        const taxableWages = d(period.taxableWages);
        const paidTimely = d(period.contributionsPaidTimely);
        const rate = period.experienceRate === null ? null : d(period.experienceRate);
        if (!taxableWages.isFinite() || taxableWages.isNegative() || !paidTimely.isFinite() || paidTimely.isNegative() || (rate !== null && (!rate.isFinite() || rate.isNegative() || rate.gt(1)))) throw new Error("Schedule H state wages, contributions and experience rates must be actual nonnegative amounts/rates.");
        const additional = rate === null ? ZERO : Decimal.max(ZERO, taxableWages.times(c.futaMaxCredit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).minus(taxableWages.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)));
        experienceCredit = experienceCredit.plus(additional);
        timelyContributions = timelyContributions.plus(paidTimely);
        audit.record("Schedule H", `17-${index + 1}g`, `${period.state} experience-rate additional credit`, additional, "max(0, taxable state wages × 5.4% − taxable state wages × assigned experience rate); no assigned rate gives no additional credit");
        audit.record("Schedule H", `17-${index + 1}h`, `${period.state} timely contributions`, paidTimely, "Actual eligible state unemployment contributions paid by the unextended return due date");
      });
      const line19 = experienceCredit.plus(timelyContributions).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const paidLate = d(input.stateUnemploymentContributionsPaidLate);
      const creditReduction = d(input.futaCreditReduction);
      if (!paidLate.isFinite() || paidLate.isNegative() || !creditReduction.isFinite() || creditReduction.isNegative()) throw new Error("Schedule H late contributions and credit reduction must be actual nonnegative amounts.");
      const lateCredit = Decimal.min(Decimal.max(ZERO, maxCredit.minus(line19)), paidLate).times("0.90").toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const allowableCredit = Decimal.max(ZERO, Decimal.min(maxCredit, line19.plus(lateCredit)).minus(creditReduction));
      futaTax = Decimal.max(ZERO, grossFuta.minus(allowableCredit));

      audit.record("Schedule H", "15", "Total cash wages subject to FUTA tax", futaWages,
        `Sum of qualifying wages capped at $${c.futaWageBase}/employee`);
      audit.record("Schedule H", "21", "Gross FUTA tax (Section B)", grossFuta,
        `$${futaWages} × ${c.futaGrossRate.times(100)}%`);
      audit.record("Schedule H", "19", "Additional experience credit plus timely contributions", line19, "Sum line 17 columns g and h across state/rate periods");
      audit.record("Schedule H", "22", "Maximum FUTA credit", maxCredit, "FUTA wages × 5.4%");
      audit.record("Schedule H", "23", "Allowable FUTA credit", allowableCredit, "min(maximum credit, line 19 + limited 90% late-payment credit) minus credit reduction, floored at zero");
      audit.record("Schedule H", "24", "Net FUTA tax (Section B)", futaTax,
        `Gross $${grossFuta} - allowable credit $${allowableCredit}`, {
          "Gross FUTA": grossFuta,
          "Max credit": maxCredit,
          "Timely contributions": timelyContributions,
          "Experience-rate credit": experienceCredit,
          "Late contribution credit": lateCredit,
          "Credit reduction": creditReduction,
          "Allowable credit": allowableCredit,
        });
    }
  } else {
    audit.record("Schedule H", "FUTA", "FUTA not applicable", ZERO,
      "Total quarterly wages below $1,000 threshold — no FUTA obligation");
  }

  // ── Part III: Total ──

  const totalTax = line8.plus(futaTax);
  audit.record("Schedule H", "26", "Total household employment taxes", totalTax,
    "Line 8 + FUTA tax → Schedule 2 Line 9", {
      "Part I (Line 8)": line8,
      "FUTA tax": futaTax,
    });

  return {
    line1, line2, line3, line4, line5, line6, line7, line8,
    futaTax,
    totalTax,
    qualifyingEmployeeCount: qualifyingEmployees.length,
    lines: audit.getLines(),
  };
}
