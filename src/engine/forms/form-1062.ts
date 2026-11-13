import type Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

interface TaxDetermination {
  regularIncomeTax: string;
  additions: string;
  credits: {
    foreignTax: string;
    nonrefundablePersonal: string;
    generalBusiness: string;
    otherApplicable: string;
  };
}

export interface Form1062Input {
  taxYear: 2026;
  transactionType: "direct_sale";
  qualifiedSaleConfirmed: true;
  covenantIncluded: true;
  electionConfirmed: true;
  scheduleALine13: string;
  taxableIncome: string;
  withGain: TaxDetermination;
  withoutGain: TaxDetermination & { taxableIncome: string };
}

function amount(value: string | undefined, line: string): Decimal {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error(`Form 1062 requires a confirmed nonnegative dollar and cent amount for line ${line}`);
  }
  return d(value);
}

/** Worksheet for one confirmed 2026 direct sale. See spec/federal/form-1062.yaml. */
export function calculateForm1062(input: Form1062Input) {
  if (input.taxYear !== 2026 || input.transactionType !== "direct_sale" || input.qualifiedSaleConfirmed !== true
    || input.covenantIncluded !== true || input.electionConfirmed !== true) {
    throw new Error("Form 1062 requires a confirmed 2026 qualified direct sale, covenant and election");
  }
  const income = amount(input.taxableIncome, "6");
  const gain = amount(input.scheduleALine13, "7");
  if (!gain.gt(0)) throw new Error("Form 1062 requires a positive elected Schedule A gain");
  const comparisonIncome = zeroFloor(income.minus(gain));
  if (!comparisonIncome.eq(amount(input.withoutGain?.taxableIncome, "8"))) {
    throw new Error("Form 1062 requires the redetermined tax to use the reconciled line 8 income");
  }

  const audit = new AuditTrail();
  const record = (line: string, description: string, value: Decimal, formula: string) =>
    audit.record("Form 1062", line, description, value, formula);
  const netIncomeTax = (determination: TaxDetermination, taxLine: number, capCredits: boolean) => {
    const creditLine = taxLine + 3;
    const tax = record(String(taxLine), "Regular income tax", amount(determination?.regularIncomeTax, String(taxLine)), "Confirmed tax determination");
    const additions = record(String(taxLine + 1), "Applicable additions", amount(determination?.additions, String(taxLine + 1)), "Confirmed tax determination");
    const liability = record(String(taxLine + 2), "Regular tax liability", tax.plus(additions), `Lines ${taxLine} and ${taxLine + 1}`);
    const foreignTax = record(`${creditLine}a`, "Foreign tax credit", amount(determination?.credits?.foreignTax, `${creditLine}a`), "Confirmed applicable credit");
    const personal = record(`${creditLine}b`, "Nonrefundable personal credits", amount(determination?.credits?.nonrefundablePersonal, `${creditLine}b`), "Confirmed applicable credits");
    const business = record(`${creditLine}c`, "General business credits", amount(determination?.credits?.generalBusiness, `${creditLine}c`), "Confirmed applicable credits");
    const other = record(`${creditLine}d`, "Other applicable credits", amount(determination?.credits?.otherApplicable, `${creditLine}d`), "Confirmed remaining applicable credits");
    const credits = sum(foreignTax, personal, business, other);
    if (!capCredits && credits.gt(liability)) {
      throw new Error("Form 1062 requires allowed credits on line 4z to be within the regular tax liability");
    }
    const total = record(`${creditLine}z`, "Total applicable credits", capCredits ? min(credits, liability) : credits,
      capCredits ? `Sum of lines ${creditLine}a through ${creditLine}d, capped at line ${taxLine + 2}` : `Sum of lines ${creditLine}a through ${creditLine}d`);
    return record(String(taxLine + 4), "Net income tax", liability.minus(total), `Line ${taxLine + 2} minus line ${creditLine}z`);
  };

  const withGain = netIncomeTax(input.withGain, 1, false);
  record("6", "Taxable income", income, "Confirmed taxable income including elected gain");
  record("7", "Elected section 1062 gain", gain, "Schedule A line 13");
  record("8", "Taxable income excluding elected gain", comparisonIncome, "Greater of zero or line 6 minus line 7");
  const withoutGain = netIncomeTax(input.withoutGain, 9, true);
  const applicableNetTaxLiability = record("14", "Applicable net tax liability", zeroFloor(withGain.minus(withoutGain)), "Greater of zero or line 5 minus line 13");
  const firstInstallment = record("15", "First installment", applicableNetTaxLiability.times("0.25"), "25% of line 14");
  return {
    applicableNetTaxLiability,
    firstInstallment,
    firstInstallmentWholeDollars: roundDollar(firstInstallment),
    deferredTax: applicableNetTaxLiability.minus(firstInstallment),
    lines: audit.getLines(),
  };
}
