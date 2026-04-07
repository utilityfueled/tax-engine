/**
 * Pennsylvania Schedule D — Sale, Exchange, or Disposition of Property
 * Spec: spec/state/pa-schedule-d.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import type {
  FilingStatus,
  Form1099B,
  Form6252Input,
  Form6781Input,
  HomeSaleInput,
  PAPassThroughStatement,
  ScheduleK1,
} from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { TAX_CONSTANTS } from "@/models/constants.js";
import { calculateForm6252, aggregateForm6252Results } from "@/engine/forms/form-6252.js";
import { calculateHomeSales } from "@/engine/forms/home-sale-exclusion.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

type ScheduleDOwner = "primary" | "spouse";
type Decimalish = Decimal | string | number;

interface OwnerBuckets {
  primary: Decimal;
  spouse: Decimal;
  joint: Decimal;
}

function createOwnerBuckets(): OwnerBuckets {
  return {
    primary: new Decimal(0),
    spouse: new Decimal(0),
    joint: new Decimal(0),
  };
}

export interface PAScheduleDAdditionalTransaction {
  accountHolder?: ScheduleDOwner;
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: Decimalish;
  costBasis: Decimalish;
  adjustments?: Decimalish;
  basisReportedToIRS?: boolean;
  holdingPeriod: "short" | "long";
  washSale?: boolean;
  washSaleDisallowed?: Decimalish;
  digitalAsset?: boolean;
}

export interface PAScheduleDLikeKindExchangeInput {
  accountHolder?: ScheduleDOwner;
  propertyOwned: string;
  propertyReceived: string;
  recognizedGainOrLoss?: Decimalish;
  digitalAsset?: boolean;
}

export interface PAScheduleDInput {
  taxYear: number;
  filingStatus?: FilingStatus;
  form1099B?: readonly Form1099B[];
  scheduleK1?: readonly ScheduleK1[];
  paPassThroughStatements?: readonly PAPassThroughStatement[];
  homeSales?: readonly HomeSaleInput[];
  form6252?: readonly Form6252Input[];
  form6781?: Form6781Input;
  additionalTransactions?: readonly PAScheduleDAdditionalTransaction[];
  likeKindExchanges?: readonly PAScheduleDLikeKindExchangeInput[];
  receivedDigitalAssetAsCompensationOrServices?: boolean;
  otherLine3GainOrLoss?: Decimalish;
  cCorporationDistributionGain?: Decimalish;
  scheduleD71GainOrLoss?: Decimalish;
  partnershipDistributionGain?: Decimalish;
  sCorporationDistributionGain?: Decimalish;
  insuranceContractGain?: Decimalish;
}

export interface PAScheduleDLikeKindExchangeResult {
  accountHolder?: ScheduleDOwner;
  propertyOwned: string;
  propertyReceived: string;
  recognizedGainOrLoss: Decimal;
  digitalAsset: boolean;
}

export interface PAScheduleDResult {
  digitalAssetQuestionYes: boolean;
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  taxpayerLine12: Decimal;
  spouseLine12: Decimal;
  reportableNetGainOrLoss: Decimal;
  likeKindExchanges: PAScheduleDLikeKindExchangeResult[];
  lines: CalculatedLine[];
}

function getStatementEntityKey(entityName: string | undefined, entityEIN: string | undefined): string {
  return `${(entityEIN ?? "").trim().toUpperCase()}::${(entityName ?? "").trim().toUpperCase()}`;
}

function addOwnedAmount(
  buckets: OwnerBuckets,
  amount: Decimal,
  owner: ScheduleDOwner | undefined,
  filingStatus?: FilingStatus,
): void {
  if (filingStatus === "married_filing_jointly") {
    if (owner === "primary") {
      buckets.primary = buckets.primary.plus(amount);
      return;
    }

    if (owner === "spouse") {
      buckets.spouse = buckets.spouse.plus(amount);
      return;
    }

    buckets.joint = buckets.joint.plus(amount);
    return;
  }

  buckets.primary = buckets.primary.plus(amount);
}

function getTransactionGainLoss(transaction: Pick<
  PAScheduleDAdditionalTransaction,
  "proceeds" | "costBasis" | "adjustments" | "washSale" | "washSaleDisallowed"
>): Decimal {
  const gainLoss = d(transaction.proceeds)
    .minus(d(transaction.costBasis))
    .minus(d(transaction.adjustments));
  const washSaleAdjustment = transaction.washSale
    ? d(transaction.washSaleDisallowed)
    : new Decimal(0);
  return gainLoss.plus(washSaleAdjustment);
}

function getForm1099BGainLoss(form1099B: Form1099B): Decimal {
  return form1099B.transactions.reduce(
    (total, transaction) => total.plus(getTransactionGainLoss(transaction)),
    new Decimal(0),
  );
}

function getScheduleK1GainLoss(scheduleK1: ScheduleK1): Decimal {
  return d(scheduleK1.netShortTermCapitalGain)
    .plus(d(scheduleK1.netLongTermCapitalGain))
    .plus(d(scheduleK1.section1231Gain));
}

function roundOwnerBuckets(buckets: OwnerBuckets): OwnerBuckets {
  return {
    primary: roundDollar(buckets.primary),
    spouse: roundDollar(buckets.spouse),
    joint: roundDollar(buckets.joint),
  };
}

function getLine1Buckets(input: PAScheduleDInput): OwnerBuckets {
  const buckets = createOwnerBuckets();

  for (const form1099B of input.form1099B ?? []) {
    addOwnedAmount(
      buckets,
      getForm1099BGainLoss(form1099B),
      form1099B.accountHolder,
      input.filingStatus,
    );
  }

  if (input.form6781) {
    const section1256Amount = d(input.form6781.section1256Gains)
      .minus(d(input.form6781.section1256Losses))
      .plus(d(input.form6781.adjustments));
    addOwnedAmount(
      buckets,
      section1256Amount,
      input.form6781.accountHolder,
      input.filingStatus,
    );
  }

  for (const transaction of input.additionalTransactions ?? []) {
    addOwnedAmount(
      buckets,
      getTransactionGainLoss(transaction),
      transaction.accountHolder,
      input.filingStatus,
    );
  }

  return roundOwnerBuckets(buckets);
}

function getLine2Buckets(
  input: PAScheduleDInput,
): { buckets: OwnerBuckets; exchanges: PAScheduleDLikeKindExchangeResult[] } {
  const buckets = createOwnerBuckets();
  const exchanges: PAScheduleDLikeKindExchangeResult[] = [];

  for (const exchange of input.likeKindExchanges ?? []) {
    const recognizedGainOrLoss = roundDollar(d(exchange.recognizedGainOrLoss));
    exchanges.push({
      accountHolder: exchange.accountHolder,
      propertyOwned: exchange.propertyOwned,
      propertyReceived: exchange.propertyReceived,
      recognizedGainOrLoss,
      digitalAsset: exchange.digitalAsset === true,
    });
    addOwnedAmount(
      buckets,
      recognizedGainOrLoss,
      exchange.accountHolder,
      input.filingStatus,
    );
  }

  return { buckets: roundOwnerBuckets(buckets), exchanges };
}

function getLine4Buckets(input: PAScheduleDInput): OwnerBuckets {
  const buckets = createOwnerBuckets();

  for (const installmentSale of input.form6252 ?? []) {
    const aggregate = aggregateForm6252Results([calculateForm6252(installmentSale)]);
    const gainLoss = sum(
      aggregate.shortTermCapitalGain,
      aggregate.longTermCapitalGain,
      aggregate.section1231Gain,
      aggregate.totalOrdinaryIncome,
    );
    addOwnedAmount(
      buckets,
      gainLoss,
      installmentSale.accountHolder,
      input.filingStatus,
    );
  }

  return roundOwnerBuckets(buckets);
}

function getLine7Buckets(input: PAScheduleDInput): OwnerBuckets {
  const buckets = createOwnerBuckets();
  const paStatementEntityKeys = new Set(
    (input.paPassThroughStatements ?? []).map((statement) => (
      getStatementEntityKey(statement.entityName, statement.entityEIN)
    )),
  );

  for (const statement of input.paPassThroughStatements ?? []) {
    addOwnedAmount(
      buckets,
      d(statement.netGainOrLoss),
      statement.accountHolder,
      input.filingStatus,
    );
  }

  for (const scheduleK1 of input.scheduleK1 ?? []) {
    if (paStatementEntityKeys.has(getStatementEntityKey(scheduleK1.partnershipName, scheduleK1.partnershipEIN))) {
      continue;
    }

    addOwnedAmount(
      buckets,
      getScheduleK1GainLoss(scheduleK1),
      scheduleK1.accountHolder,
      input.filingStatus,
    );
  }

  return roundOwnerBuckets(buckets);
}

function getLine8Buckets(input: PAScheduleDInput): OwnerBuckets {
  const buckets = createOwnerBuckets();
  const yearConstants = TAX_CONSTANTS[input.taxYear];

  if (!yearConstants) {
    throw new Error(`PA Schedule D constants not available for tax year ${input.taxYear}`);
  }

  for (const homeSale of input.homeSales ?? []) {
    const result = calculateHomeSales(
      [homeSale],
      input.filingStatus ?? "single",
      yearConstants.homeSaleExclusion,
    );
    addOwnedAmount(
      buckets,
      result.totalTaxableGain,
      homeSale.accountHolder,
      input.filingStatus,
    );
  }

  return roundOwnerBuckets(buckets);
}

function getSupplementalBuckets(
  input: PAScheduleDInput,
  amount: Decimalish | undefined,
  options: {
    positiveOnly?: boolean;
  } = {},
): OwnerBuckets {
  const buckets = createOwnerBuckets();
  const normalizedAmount = options.positiveOnly
    ? Decimal.max(new Decimal(0), roundDollar(d(amount)))
    : roundDollar(d(amount));
  addOwnedAmount(buckets, normalizedAmount, undefined, input.filingStatus);
  return roundOwnerBuckets(buckets);
}

function getSeparateScheduleTotals(
  filingStatus: FilingStatus | undefined,
  ...lineBuckets: OwnerBuckets[]
): { taxpayerLine12: Decimal; spouseLine12: Decimal } {
  const totals = lineBuckets.reduce((acc, line) => ({
    primary: acc.primary.plus(line.primary),
    spouse: acc.spouse.plus(line.spouse),
    joint: acc.joint.plus(line.joint),
  }), createOwnerBuckets());

  if (filingStatus !== "married_filing_jointly") {
    return {
      taxpayerLine12: totals.primary.plus(totals.joint),
      spouseLine12: new Decimal(0),
    };
  }

  const jointHalf = totals.joint.dividedBy(2);
  return {
    taxpayerLine12: totals.primary.plus(jointHalf),
    spouseLine12: totals.spouse.plus(jointHalf),
  };
}

export function calculatePAScheduleD(input: PAScheduleDInput): PAScheduleDResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule D constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const line1Buckets = getLine1Buckets(input);
  const { buckets: line2Buckets, exchanges: likeKindExchanges } = getLine2Buckets(input);
  const line3OtherBuckets = getSupplementalBuckets(input, input.otherLine3GainOrLoss);
  const line3Buckets = roundOwnerBuckets({
    primary: line1Buckets.primary.plus(line2Buckets.primary).plus(line3OtherBuckets.primary),
    spouse: line1Buckets.spouse.plus(line2Buckets.spouse).plus(line3OtherBuckets.spouse),
    joint: line1Buckets.joint.plus(line2Buckets.joint).plus(line3OtherBuckets.joint),
  });
  const line4Buckets = getLine4Buckets(input);
  const line5Buckets = getSupplementalBuckets(input, input.cCorporationDistributionGain, { positiveOnly: true });
  const line6Buckets = getSupplementalBuckets(input, input.scheduleD71GainOrLoss);
  const line7Buckets = getLine7Buckets(input);
  const line8Buckets = getLine8Buckets(input);
  const line9Buckets = getSupplementalBuckets(input, input.partnershipDistributionGain, { positiveOnly: true });
  const line10Buckets = getSupplementalBuckets(input, input.sCorporationDistributionGain, { positiveOnly: true });
  const line11Buckets = getSupplementalBuckets(input, input.insuranceContractGain, { positiveOnly: true });

  const digitalAssetQuestionYes = input.receivedDigitalAssetAsCompensationOrServices === true
    || (input.form1099B ?? []).some((form1099B) => form1099B.transactions.some((transaction) => transaction.digitalAsset))
    || (input.additionalTransactions ?? []).some((transaction) => transaction.digitalAsset)
    || likeKindExchanges.some((exchange) => exchange.digitalAsset);

  const line1 = sum(line1Buckets.primary, line1Buckets.spouse, line1Buckets.joint);
  const line2 = sum(line2Buckets.primary, line2Buckets.spouse, line2Buckets.joint);
  const line3 = sum(line3Buckets.primary, line3Buckets.spouse, line3Buckets.joint);
  const line4 = sum(line4Buckets.primary, line4Buckets.spouse, line4Buckets.joint);
  const line5 = sum(line5Buckets.primary, line5Buckets.spouse, line5Buckets.joint);
  const line6 = sum(line6Buckets.primary, line6Buckets.spouse, line6Buckets.joint);
  const line7 = sum(line7Buckets.primary, line7Buckets.spouse, line7Buckets.joint);
  const line8 = sum(line8Buckets.primary, line8Buckets.spouse, line8Buckets.joint);
  const line9 = sum(line9Buckets.primary, line9Buckets.spouse, line9Buckets.joint);
  const line10 = sum(line10Buckets.primary, line10Buckets.spouse, line10Buckets.joint);
  const line11 = sum(line11Buckets.primary, line11Buckets.spouse, line11Buckets.joint);

  const separateTotals = getSeparateScheduleTotals(
    input.filingStatus,
    line3Buckets,
    line4Buckets,
    line5Buckets,
    line6Buckets,
    line7Buckets,
    line8Buckets,
    line9Buckets,
    line10Buckets,
    line11Buckets,
  );
  const taxpayerLine12 = roundDollar(separateTotals.taxpayerLine12);
  const spouseLine12 = roundDollar(separateTotals.spouseLine12);
  const line12 = taxpayerLine12.plus(spouseLine12);

  const reportableNetGainOrLoss = input.filingStatus === "married_filing_jointly"
    && (
      (taxpayerLine12.greaterThan(0) && spouseLine12.lessThan(0))
      || (taxpayerLine12.lessThan(0) && spouseLine12.greaterThan(0))
    )
    ? (taxpayerLine12.greaterThan(0) ? taxpayerLine12 : spouseLine12)
    : line12;

  audit.record("PA-Schedule-D", "digital-assets", "Digital asset question", digitalAssetQuestionYes ? new Decimal(1) : new Decimal(0), "Check Yes when the taxpayer received or disposed of a digital asset during the tax year");
  audit.record("PA-Schedule-D", "1", "General property dispositions", line1, "Supported Form 1099-B transactions, supplemental direct transactions, plus supported Form 6781 Section 1256 activity");
  audit.record("PA-Schedule-D", "2", "Recognized like-kind exchange gain or loss", line2, "Only recognized gain or loss from disclosed like-kind exchanges affects the taxable total");
  audit.record("PA-Schedule-D", "3", "Net gain or loss from Lines 1 and 2", line3, "Line 1 + Line 2 + any supplemental signed Line 3 amount");
  audit.record("PA-Schedule-D", "4", "Installment-sale gain", line4, "Supported Form 6252 gain components classified to Class 5");
  audit.record("PA-Schedule-D", "5", "Taxable C-corporation distribution gain", line5, "Basis-triggered C-corporation distribution gain supplied for PA Schedule D Line 5");
  audit.record("PA-Schedule-D", "6", "REV-1742 Schedule D-71 gain or loss", line6, "Supplemental PA Schedule D-71 amount");
  audit.record("PA-Schedule-D", "7", "Pass-through entity gain or loss", line7, "PA statement net gains/losses plus federal Schedule K-1 fallback for entities without PA statements");
  audit.record("PA-Schedule-D", "8", "Taxable principal residence gain", line8, "Supported taxable principal-residence gains after the Section 121 exclusion computation; losses stay at zero");
  audit.record("PA-Schedule-D", "9", "Partnership distribution gain over basis", line9, "Supplemental partnership outside-basis distribution gain");
  audit.record("PA-Schedule-D", "10", "PA S corporation distribution gain over basis", line10, "Supplemental PA S corporation stock-basis distribution gain");
  audit.record("PA-Schedule-D", "11", "Taxable insurance-contract exchange gain", line11, "Supplemental insurance-contract gain not excluded under IRC Section 1035");
  audit.record("PA-Schedule-D", "12-taxpayer", "Taxpayer separately computed Schedule D total", taxpayerLine12, "Taxpayer-owned amounts plus one-half of joint supported Schedule D amounts");
  audit.record("PA-Schedule-D", "12-spouse", "Spouse separately computed Schedule D total", spouseLine12, "Spouse-owned amounts plus one-half of joint supported Schedule D amounts");
  audit.record("PA-Schedule-D", "12", "Total PA taxable gain or loss", line12, "Add Lines 3 through 11 after the supported owner allocation");
  audit.record("PA-Schedule-D", "12-pa40", "PA-40 Line 5 reportable amount", reportableNetGainOrLoss, "If one spouse has a gain and the other has a loss, carry only the positive spouse amount; otherwise carry the combined Schedule D total");

  return {
    digitalAssetQuestionYes,
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    taxpayerLine12,
    spouseLine12,
    reportableNetGainOrLoss,
    likeKindExchanges,
    lines: audit.getLines(),
  };
}
