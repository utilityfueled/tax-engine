/**
 * Pennsylvania Schedule E — Net Income (Loss) from Rents, Royalties,
 * Copyrights and Patents
 * Spec: spec/state/pa-schedule-e.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";
import type {
  FilingStatus,
  Form1099Misc,
  RentalProperty,
  ScheduleK1,
} from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { PA_CONSTANTS } from "@/engine/state/pa-40.js";
import { getPARentalOwnershipFraction } from "@/engine/state/pa-rental-ownership.js";

export interface PAScheduleEInput {
  taxYear: number;
  filingStatus?: FilingStatus;
  rentalProperties?: RentalProperty[];
  form1099Misc?: Form1099Misc[];
  scheduleK1?: ScheduleK1[];
}

export interface PAScheduleEPropertyResult {
  description: string;
  accountHolder?: RentalProperty["accountHolder"];
  grossRents: Decimal;
  allowableExpenses: Decimal;
  netIncome: Decimal;
}

export interface PAScheduleEResult {
  propertyGrossRents: Decimal;
  propertyNetIncome: Decimal;
  miscRents: Decimal;
  miscRoyalties: Decimal;
  passThroughNetIncome: Decimal;
  taxpayerNetRentalRoyaltyIncome: Decimal;
  spouseNetRentalRoyaltyIncome: Decimal;
  reportableNetRentalRoyaltyIncome: Decimal;
  totalAllowableExpenses: Decimal;
  netRentalRoyaltyIncome: Decimal;
  properties: PAScheduleEPropertyResult[];
  lines: CalculatedLine[];
}

function calculatePropertyExpenses(property: RentalProperty): Decimal {
  return sum(
    d(property.advertising),
    d(property.autoTravel),
    d(property.cleaning),
    d(property.commissions),
    d(property.insurance),
    d(property.legalProfessional),
    d(property.managementFees),
    d(property.mortgageInterest),
    d(property.otherInterest),
    d(property.repairs),
    d(property.supplies),
    d(property.taxes),
    d(property.utilities),
    d(property.depreciation),
    d(property.otherExpenses),
  );
}

function getScheduleK1RentalRoyaltyAmount(k1: ScheduleK1): Decimal {
  return d(k1.netRentalIncome)
    .plus(d(k1.otherNetRentalIncome))
    .plus(d(k1.royalties));
}

export function calculatePAScheduleE(input: PAScheduleEInput): PAScheduleEResult {
  if (!PA_CONSTANTS[input.taxYear]) {
    throw new Error(`PA Schedule E constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const rentalProperties = input.rentalProperties ?? [];
  const form1099Misc = input.form1099Misc ?? [];
  const scheduleK1 = input.scheduleK1 ?? [];

  const properties = rentalProperties.map((property) => {
    const share = getPARentalOwnershipFraction(property);
    const grossRents = d(property.rents).times(share);
    const allowableExpenses = calculatePropertyExpenses(property).times(share);
    const netIncome = grossRents.minus(allowableExpenses);

    audit.record(
      "PA-Schedule-E",
      "1-detail",
      `Gross rents for ${property.description}`,
      grossRents,
      `Whole-property rents times ownership fraction ${share}`,
    );
    audit.record(
      "PA-Schedule-E",
      "2-detail",
      `Allowable expenses for ${property.description}`,
      allowableExpenses,
      `Whole-property ordinary and necessary expenses times ownership fraction ${share}`,
    );
    audit.record(
      "PA-Schedule-E",
      "3-detail",
      `Net Schedule E income for ${property.description}`,
      netIncome,
      "Gross rents minus allowable expenses",
    );

    return {
      description: property.description,
      accountHolder: property.accountHolder,
      grossRents,
      allowableExpenses,
      netIncome,
    };
  });

  const propertyGrossRents = properties.reduce(
    (acc, property) => acc.plus(property.grossRents),
    new Decimal(0),
  );
  const totalAllowableExpenses = properties.reduce(
    (acc, property) => acc.plus(property.allowableExpenses),
    new Decimal(0),
  );
  const propertyNetIncome = properties.reduce(
    (acc, property) => acc.plus(property.netIncome),
    new Decimal(0),
  );

  const miscRents = form1099Misc.reduce(
    (acc, form) => acc.plus(d(form.rents)),
    new Decimal(0),
  );
  const miscRoyalties = form1099Misc.reduce(
    (acc, form) => acc.plus(d(form.royalties)),
    new Decimal(0),
  );
  const passThroughTaxpayerIncome = scheduleK1.reduce((acc, k1) => (
    k1.accountHolder === "primary"
      ? acc.plus(getScheduleK1RentalRoyaltyAmount(k1))
      : acc
  ), new Decimal(0));
  const passThroughSpouseIncome = scheduleK1.reduce((acc, k1) => (
    k1.accountHolder === "spouse"
      ? acc.plus(getScheduleK1RentalRoyaltyAmount(k1))
      : acc
  ), new Decimal(0));
  const passThroughJointIncome = scheduleK1.reduce((acc, k1) => (
    k1.accountHolder === undefined
      ? acc.plus(getScheduleK1RentalRoyaltyAmount(k1))
      : acc
  ), new Decimal(0));
  const passThroughNetIncome = passThroughTaxpayerIncome
    .plus(passThroughSpouseIncome)
    .plus(passThroughJointIncome);

  audit.record(
    "PA-Schedule-E",
    "1",
    "Gross rents from directly owned property",
    propertyGrossRents,
    "Sum of gross rents for Schedule E rental properties",
  );
  audit.record(
    "PA-Schedule-E",
    "2",
    "Allowable expenses for directly owned property",
    totalAllowableExpenses,
    "Sum of ordinary and necessary Schedule E expenses",
  );
  audit.record(
    "PA-Schedule-E",
    "3",
    "Net income (loss) from directly owned property",
    propertyNetIncome,
    "Line 1 minus Line 2",
  );
  audit.record(
    "PA-Schedule-E",
    "4",
    "Form 1099-MISC rents and royalties",
    miscRents.plus(miscRoyalties),
    "Gross rents and royalties from Forms 1099-MISC",
  );
  audit.record(
    "PA-Schedule-E",
    "5",
    "Pass-through rental and royalty income",
    passThroughNetIncome,
    "Schedule K-1 Box 2, Box 3, and Box 7 amounts",
  );

  const netRentalRoyaltyIncome = propertyNetIncome
    .plus(miscRents)
    .plus(miscRoyalties)
    .plus(passThroughNetIncome);

  let taxpayerNetRentalRoyaltyIncome = netRentalRoyaltyIncome;
  let spouseNetRentalRoyaltyIncome = new Decimal(0);
  let reportableNetRentalRoyaltyIncome = netRentalRoyaltyIncome;

  if (input.filingStatus === "married_filing_jointly") {
    const primaryPropertyIncome = properties.reduce((total, property) => property.accountHolder === "primary" ? total.plus(property.netIncome) : total, new Decimal(0));
    const spousePropertyIncome = properties.reduce((total, property) => property.accountHolder === "spouse" ? total.plus(property.netIncome) : total, new Decimal(0));
    const jointIncomeShare = propertyNetIncome.minus(primaryPropertyIncome).minus(spousePropertyIncome)
      .plus(miscRents)
      .plus(miscRoyalties)
      .plus(passThroughJointIncome)
      .dividedBy(2);

    taxpayerNetRentalRoyaltyIncome = passThroughTaxpayerIncome.plus(primaryPropertyIncome).plus(jointIncomeShare);
    spouseNetRentalRoyaltyIncome = passThroughSpouseIncome.plus(spousePropertyIncome).plus(jointIncomeShare);

    const taxpayerPositive = taxpayerNetRentalRoyaltyIncome.greaterThan(0);
    const spousePositive = spouseNetRentalRoyaltyIncome.greaterThan(0);
    const taxpayerNegative = taxpayerNetRentalRoyaltyIncome.lessThan(0);
    const spouseNegative = spouseNetRentalRoyaltyIncome.lessThan(0);

    reportableNetRentalRoyaltyIncome =
      (taxpayerPositive && spouseNegative)
      || (taxpayerNegative && spousePositive)
        ? (taxpayerPositive ? taxpayerNetRentalRoyaltyIncome : spouseNetRentalRoyaltyIncome)
        : netRentalRoyaltyIncome;

    audit.record(
      "PA-Schedule-E",
      "6-taxpayer",
      "Taxpayer separately computed Schedule E income (loss)",
      taxpayerNetRentalRoyaltyIncome,
      "Actual taxpayer-owned property and pass-through income plus historical unconfirmed joint preview share",
    );
    audit.record(
      "PA-Schedule-E",
      "6-spouse",
      "Spouse separately computed Schedule E income (loss)",
      spouseNetRentalRoyaltyIncome,
      "Actual spouse-owned property and pass-through income plus historical unconfirmed joint preview share",
    );
    audit.record(
      "PA-Schedule-E",
      "6-pa40",
      "Reportable PA-40 Line 6 amount",
      reportableNetRentalRoyaltyIncome,
      "If one spouse has income and the other has a loss, carry only the positive separately computed amount; otherwise carry the combined Schedule E total",
    );
  }
  audit.record(
    "PA-Schedule-E",
    "6",
    "Net PA Schedule E income (loss)",
    netRentalRoyaltyIncome,
    "Line 3 plus Line 4 plus Line 5",
  );

  return {
    propertyGrossRents,
    propertyNetIncome,
    miscRents,
    miscRoyalties,
    passThroughNetIncome,
    taxpayerNetRentalRoyaltyIncome,
    spouseNetRentalRoyaltyIncome,
    reportableNetRentalRoyaltyIncome,
    totalAllowableExpenses,
    netRentalRoyaltyIncome,
    properties,
    lines: audit.getLines(),
  };
}
