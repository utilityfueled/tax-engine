import Decimal from "decimal.js";
import { ScheduleFInputSchema, type TaxYearInput } from "@/models/inputs";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, isActualDate } from "./guided-required-facts";
import type { FilingStatus, PersonalInfoData } from "./guided-interview-flow";

interface GuidedFarmReceipt {
  program?: "ordinary-taxable-usda" | "other" | "";
  payerTin?: string;
  statementReference?: string;
  reference?: string;
  receivedDate?: string;
  amount?: string;
}

export interface GuidedCashFarmData {
  owner?: "primary" | "spouse" | "";
  sourceYear?: string;
  farmReference?: string;
  principalActivity?: string;
  scopeConfirmed?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
  raisedProductSales?: string;
  seeds?: string;
  supplies?: string;
  utilities?: string;
  fuel?: string;
  repairs?: string;
  qualifiedPropertyBasis?: string;
  receipts?: GuidedFarmReceipt[];
}

export const guidedFarmMoneyFields = [
  ["raisedProductSales", "Sales of livestock, produce or crops raised by this farm"],
  ["seeds", "Seeds and plants"], ["supplies", "Farm supplies"], ["utilities", "Farm utilities"],
  ["fuel", "Farm gasoline, fuel and oil"], ["repairs", "Farm repairs and maintenance"],
  ["qualifiedPropertyBasis", "Unadjusted basis of qualified farm property for QBI"],
] as const;

function actualMoney(value: string | undefined, label: string): Decimal {
  const error = amountError(value, label);
  if (error) throw new Error(error);
  const amount = parseGuidedCurrency(value);
  if (amount.decimalPlaces() > 2) throw new Error(`Enter the actual ${label} in dollars and cents.`);
  return amount;
}

const normalizeTin = (tin?: string) => tin?.trim().replace(/-/g, "");
const normalizeReference = (reference?: string) => reference?.trim().toLowerCase();

/** Convert the confirmed local receipts using the current, validated statement IDs. */
export function buildGuidedCashFarm(
  data: GuidedCashFarmData | undefined,
  forms: NonNullable<TaxYearInput["form1099G"]>,
  taxYear: number,
  filingStatus?: FilingStatus | null,
  personalInfo?: PersonalInfoData,
  stateCode?: string | null,
): TaxYearInput["scheduleF"] {
  const statements = forms.filter(form => parseGuidedCurrency(form.agriculturePayments).gt(0));
  if (!data && !statements.length) return undefined;
  if (!data || !statements.length) throw new Error("Enter the complete actual cash-farm records and all associated USDA Box 7 statements.");
  if (stateCode !== null) throw new Error("These cash-farm facts currently require a federal-only return. A state return needs separate state farm records.");
  const owner = data.owner;
  if ((taxYear !== 2025 && taxYear !== 2026) || data.sourceYear !== String(taxYear)
    || !data.farmReference?.trim() || !data.principalActivity?.trim() || data.scopeConfirmed !== true
    || !filingStatus || !personalInfo || (owner !== "primary" && owner !== "spouse")
    || (owner === "spouse" && (filingStatus !== "mfj" || !personalInfo.spouse))) {
    throw new Error("Confirm the actual farm, owner, year-end records and supported federal cash-farm facts.");
  }
  if (data.sourceFactsConfirmed !== true) throw new Error("Check the cash-farm facts against the original records after the last edit.");
  if (!data.receipts?.length) throw new Error("Enter each actual dated ordinary USDA receipt.");

  const payments = data.receipts.map((receipt, index) => {
    if (receipt.program !== "ordinary-taxable-usda") throw new Error("Confirm each receipt is an ordinary fully taxable USDA subsidy from the original program record.");
    const payerTin = normalizeTin(receipt.payerTin);
    const statementReference = normalizeReference(receipt.statementReference);
    const matches = statements.filter(form => normalizeTin(form.payerTin) === payerTin
      && normalizeReference(form.accountReference) === statementReference && form.accountHolder === owner);
    const form1099GSourceId = matches[0]?.sourceId;
    if (!payerTin || !statementReference || matches.length !== 1 || !form1099GSourceId) {
      throw new Error("Match each USDA receipt to its unique actual same-owner payer TIN and annual statement reference.");
    }
    if (!receipt.reference?.trim() || !receipt.receivedDate || !isActualDate(receipt.receivedDate)
      || !receipt.receivedDate.startsWith(`${taxYear}-`)) {
      throw new Error("Enter each actual USDA receipt's local record reference and date in the return year.");
    }
    return {
      program: "other" as const, sourceId: `farm-receipt-${index + 1}`, sourceReference: receipt.reference.trim(),
      form1099GSourceId, receivedDate: receipt.receivedDate, accountHolder: owner,
      taxableAmount: actualMoney(receipt.amount, "USDA receipt amount").toFixed(2),
    };
  });
  const amounts = Object.fromEntries(guidedFarmMoneyFields.map(([key, label]) => [key, actualMoney(data[key], label)])) as
    Record<(typeof guidedFarmMoneyFields)[number][0], Decimal>;
  const agricultural = payments.reduce((total, row) => total.plus(row.taxableAmount), new Decimal(0));
  const { raisedProductSales, qualifiedPropertyBasis, seeds, supplies, utilities, fuel, repairs } = amounts;
  const expenses = { seedsAndPlants: seeds, supplies, utilities, gasolineFuelOil: fuel, repairsAndMaintenance: repairs };
  const expenseTotal = Object.values(expenses).reduce((total, amount) => total.plus(amount), new Decimal(0));
  if (!raisedProductSales.plus(agricultural).gt(expenseTotal)) {
    throw new Error("A cash farm with zero profit or a loss needs its separate farm and at-risk records.");
  }

  return ScheduleFInputSchema.parse({
    accountHolder: owner, principalCropOrActivity: data.principalActivity.trim(), accountingMethod: "cash",
    materiallyParticipated: true, qbiMateriallyParticipated: true, salesOfProductsRaised: raisedProductSales.toFixed(),
    agriculturalProgramPayments: agricultural.toFixed(), w2WagesPaid: "0", ubiaQualifiedProperty: qualifiedPropertyBasis.toFixed(),
    expenses: Object.fromEntries(Object.entries(expenses).map(([key, amount]) => [key, amount.toFixed()])),
    agriculturalPaymentSources: { sourceTaxYear: taxYear, sourceFactsConfirmed: true, completeTaxablePaymentsConfirmed: true,
      allGrossPaymentsTaxableConfirmed: true, activeDomesticFarmConfirmed: true, payments },
  });
}
