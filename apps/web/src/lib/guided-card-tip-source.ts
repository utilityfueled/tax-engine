import { Form1099KSchema, type Form1099K } from "@/models/inputs";
import { isQualifiedTippedOccupationCode } from "@/utils/tipped-occupation-code.js";
import { isStartedNec } from "./guided-compensation-reporting";
import { parseGuidedCurrency } from "./guided-currency";
import type { FilingStatus, SelfEmploymentSectionData } from "./guided-interview-flow";
import { amountError } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

export interface GuidedCardTipSource {
  sourceTaxYear: string;
  owner: "" | "primary" | "spouse";
  pse: string;
  statementReference: string;
  grossAmount: string;
  cardNotPresent: string;
  cashTips: string;
  occupationCode: string;
  federalWithheld: string;
  noStateReportingConfirmed: boolean | null;
  sourceFactsConfirmed: boolean | null;
  confirmedFilingStatus: FilingStatus | null;
}

export const emptyGuidedCardTipSource: GuidedCardTipSource = {
  sourceTaxYear: "", owner: "", pse: "", statementReference: "", grossAmount: "", cardNotPresent: "", cashTips: "",
  occupationCode: "", federalWithheld: "", noStateReportingConfirmed: null, sourceFactsConfirmed: null, confirmedFilingStatus: null,
};

export function clearCardTipStatementConfirmation(source: GuidedCardTipSource): GuidedCardTipSource {
  return { ...source, sourceFactsConfirmed: null, confirmedFilingStatus: null };
}

export function cardTipStatementFactsChanged(previous?: GuidedCardTipSource, next?: GuidedCardTipSource): boolean {
  const document = (source?: GuidedCardTipSource) => source ? { ...source, confirmedFilingStatus: undefined } : undefined;
  return guidedSourceValuesChanged(document(previous), document(next));
}

export const cardTipStatementId = "form1099K:0";

export function exactCardTipMoney(value: string | undefined, label: string) {
  const error = amountError(value, label);
  if (error) throw new Error(error);
  const amount = parseGuidedCurrency(value);
  if (amount.decimalPlaces() > 2) throw new Error(`Enter exact dollars and cents for ${label}.`);
  return amount;
}

export function buildGuidedCardTipSource(data: SelfEmploymentSectionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Form1099K | undefined {
  const source = data?.cardTipSource;
  if (!source) return undefined;
  if (taxYear !== 2026 || source.sourceTaxYear.trim() !== "2026") throw new Error("Enter an actual 2026 Form 1099-K to use this business tip worksheet.");
  if ((source.owner !== "primary" && source.owner !== "spouse") || (source.owner === "spouse" && filingStatus !== "mfj")
    || source.owner !== data.businessFacts?.accountHolder) throw new Error("The actual Form 1099-K recipient must match the Schedule C owner.");
  if (source.sourceFactsConfirmed !== true || !filingStatus || source.confirmedFilingStatus !== filingStatus) {
    throw new Error("Verify the actual Form 1099-K statement and recipient for this return's filing status.");
  }
  if (!source.pse.trim() || !source.statementReference.trim()) throw new Error("Enter the payment settlement entity and original Form 1099-K statement reference.");
  const occupationCode = source.occupationCode.trim();
  if (occupationCode !== "000" && !isQualifiedTippedOccupationCode(occupationCode)) throw new Error("Enter the one actual Treasury tipped occupation code in Form 1099-K Box 1d.");
  if (source.noStateReportingConfirmed !== true) throw new Error("Confirm that the actual Form 1099-K reports no state amounts. State reporting needs its own review.");
  if (data.necEntries.some(isStartedNec) || data.businessFacts?.professionalWagering) throw new Error("This Form 1099-K path requires one ordinary business and no separate compensation statement.");
  const gross = exactCardTipMoney(source.grossAmount, "Form 1099-K Box 1a gross");
  const cardNotPresent = exactCardTipMoney(source.cardNotPresent, "Form 1099-K Box 1b card-not-present transactions");
  const cashTips = exactCardTipMoney(source.cashTips, "Form 1099-K Box 1c cash tips");
  const withholding = exactCardTipMoney(source.federalWithheld, "Form 1099-K Box 4 federal withholding");
  const ledger = exactCardTipMoney(data.manualGrossReceipts, "actual Schedule C gross receipts from the ledger");
  if (gross.isZero() || !gross.eq(ledger)) throw new Error("The positive Form 1099-K gross must match the actual Schedule C ledger receipts exactly.");
  if (cardNotPresent.gt(gross) || cashTips.gt(gross) || withholding.gt(gross)) throw new Error("Form 1099-K Boxes 1b, 1c and 4 cannot exceed the actual gross reported on the statement.");
  return Form1099KSchema.parse({ taxYear, accountHolder: source.owner, pse: source.pse.trim(), grossAmount: gross.toFixed(),
    cardNotPresent: cardNotPresent.toFixed(), cashTips: cashTips.toFixed(), treasuryTippedOccupationCodes: [occupationCode],
    federalWithheld: withholding.toFixed(), stateWithheld: "0", incomeType: "business", cardTipStatementEvidence: {
      statementReference: source.statementReference.trim(), cardNotPresent: cardNotPresent.toFixed(), federalWithheld: withholding.toFixed(), noStateReportingConfirmed: true,
    } });
}
