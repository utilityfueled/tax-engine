/**
 * Final 2026 Form 8824 physical mapping candidate, Created 10/30/26.
 * Spec: spec/federal/form-8824-2026-template.yaml.
 */
import { z } from "zod";
import { calculateForm8824 } from "@/engine/forms/form-8824.js";
import { d, roundDollar } from "@/utils/decimal.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const FORM_8824_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f8824--2026.pdf",
  sourceRevision: "Created 10/30/26",
  posted: "2026-11-03",
  retrievedAt: "2026-11-13T03:54:54Z",
  sha256: "7f9da3429cffd9469b8268665c376051abe0ed09be93445b607cf74229df5542",
  instructions: Object.freeze({
    sourceUrl: "https://www.irs.gov/pub/irs-prior/i8824--2026.pdf",
    posted: "2026-11-10",
    bytes: 218840,
    sha256: "f4f7efe4cf14ce01282032c5f5b9866f7f3f11367dfa73024e4ff21469cf5685",
  }),
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    identifyingNumber: `${page1}f1_2[0]`,
    line1PropertyGivenUp: `${page1}f1_3[0]`,
    line2PropertyReceived: `${page1}f1_4[0]`,
    line3AcquiredDate: `${page1}f1_5[0]`,
    line4TransferredDate: `${page1}f1_6[0]`,
    line5IdentifiedDate: `${page1}f1_7[0]`,
    line6ReceivedDate: `${page1}f1_8[0]`,
    line7Yes: `${page1}c1_1[0]`,
    line7No: `${page1}c1_1[1]`,
    line8RelatedPartyName: `${page1}f1_9[0]`,
    line8Relationship: `${page1}f1_10[0]`,
    line8RelatedPartyIdentifyingNumber: `${page1}f1_11[0]`,
    line8StreetAddress: `${page1}f1_12[0]`,
    line8Apartment: `${page1}f1_13[0]`,
    line8City: `${page1}f1_14[0]`,
    line8State: `${page1}f1_15[0]`,
    line8ZipCode: `${page1}f1_16[0]`,
    line8ForeignCountry: `${page1}f1_17[0]`,
    line8ForeignProvince: `${page1}f1_18[0]`,
    line8ForeignPostalCode: `${page1}f1_19[0]`,
    line9Yes: `${page1}c1_2[0]`,
    line9No: `${page1}c1_2[1]`,
    line10Yes: `${page1}c1_3[0]`,
    line10No: `${page1}c1_3[1]`,
    line11a: `${page1}c1_4[0]`,
    line11b: `${page1}c1_4[1]`,
    line11c: `${page1}c1_4[2]`,
    page2Name: `${page2}f2_1[0]`,
    page2IdentifyingNumber: `${page2}f2_2[0]`,
    line12: `${page2}f2_3[0]`,
    line12aDescriptionFirst: `${page2}f2_4[0]`,
    line12aDescriptionSecond: `${page2}f2_5[0]`,
    line13: `${page2}f2_6[0]`,
    line14: `${page2}f2_7[0]`,
    line15: `${page2}f2_8[0]`,
    line15aDescriptionFirst: `${page2}f2_9[0]`,
    line15aDescriptionSecond: `${page2}f2_10[0]`,
    line16: `${page2}f2_11[0]`,
    line17: `${page2}f2_12[0]`,
    line18: `${page2}f2_13[0]`,
    line19WriteIn: `${page2}f2_14[0]`,
    line19: `${page2}f2_15[0]`,
    line20: `${page2}f2_16[0]`,
    line21: `${page2}f2_17[0]`,
    line22: `${page2}f2_18[0]`,
    line23: `${page2}f2_19[0]`,
    line24: `${page2}f2_20[0]`,
    line25: `${page2}f2_21[0]`,
    line25a: `${page2}f2_22[0]`,
    line25b: `${page2}f2_23[0]`,
    line25c: `${page2}f2_24[0]`,
    line26CertificateLeft: `${page2}f2_25[0]`,
    line26CertificateRight: `${page2}f2_26[0]`,
    line27DescriptionFirst: `${page2}f2_27[0]`,
    line27DescriptionSecond: `${page2}f2_28[0]`,
    line28DescriptionFirst: `${page2}f2_29[0]`,
    line28DescriptionSecond: `${page2}f2_30[0]`,
    line29SoldDate: `${page2}f2_31[0]`,
    line30: `${page2}f2_32[0]`,
    line31: `${page2}f2_33[0]`,
    line32: `${page2}f2_34[0]`,
    line33: `${page2}f2_35[0]`,
    line34: `${page2}f2_36[0]`,
    line35: `${page2}f2_37[0]`,
    line36: `${page2}f2_38[0]`,
    line37: `${page2}f2_39[0]`,
    line38: `${page2}f2_40[0]`,
  }),
});

const description = z.string().trim().min(1).max(100).regex(/^[ -~]+$/u);
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const investmentLandSources = z.strictObject({
  relinquishedDescription: description,
  replacementDescription: description,
  acquiredDate: z.iso.date(),
  transferredDate: z.iso.date(),
  receivedDate: z.iso.date(),
  relinquishedBasis: amount,
  replacementFmv: amount,
  cashReceived: amount,
  cashPaid: amount,
  exchangeExpenses: amount,
  closingAndBasisRecordsConfirmed: z.literal(true),
  domesticInvestmentLandAndUnrelatedPartiesConfirmed: z.literal(true),
  noDebtOtherPropertyOrSpecialTreatmentConfirmed: z.literal(true),
});

function formDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

/** Isolated projection for one simultaneous exchange of ordinary investment land. */
export function projectForm88242026InvestmentLand(sources: unknown): { text: Record<string, string>; checked: string[] } {
  const parsed = investmentLandSources.safeParse(sources);
  if (!parsed.success) throw new Error("The Form 8824 candidate requires complete confirmed investment-land sources");
  const exchange = parsed.data;
  const cashReceived = d(exchange.cashReceived);
  const cashPaid = d(exchange.cashPaid);
  if (!exchange.transferredDate.startsWith("2026-") || exchange.receivedDate !== exchange.transferredDate
    || exchange.acquiredDate >= `2025${exchange.transferredDate.slice(4)}`
    || exchange.relinquishedDescription === exchange.replacementDescription
    || (cashReceived.gt(0) && cashPaid.gt(0)) || d(exchange.replacementFmv).lte(0)) {
    throw new Error("The Form 8824 candidate requires a simultaneous 2026 exchange of distinct long-term investment land");
  }
  const result = calculateForm8824({
    description: exchange.relinquishedDescription,
    recognizedGainCharacter: "capital",
    isRelatedParty: false,
    fmvOtherPropertyGivenUp: "0",
    adjustedBasisOtherPropertyGivenUp: "0",
    fmvOtherPropertyReceived: "0",
    liabilitiesRelinquished: "0",
    liabilitiesAssumed: "0",
    depreciationRecapture: "0",
    cashReceived: exchange.cashReceived,
    cashPaid: exchange.cashPaid,
    exchangeExpenses: exchange.exchangeExpenses,
    adjustedBasisLikeKindPropertyGivenUp: exchange.relinquishedBasis,
    fmvLikeKindPropertyReceived: exchange.replacementFmv,
  });
  const money = {
    line15: roundDollar(result.line15BootReceived),
    line16: roundDollar(result.line16FmvLikeKindPropertyReceived),
    line17: roundDollar(result.line17TotalValueReceived),
    line18: roundDollar(result.line18AdjustedBasisLikeKindPropertyGivenUp),
    line19: roundDollar(result.line19RealizedGainLoss),
    line20: roundDollar(result.line20RecognizedGain),
    line21: roundDollar(result.line21OrdinaryIncome),
    line22: roundDollar(result.line22CapitalGain),
    line23: roundDollar(result.line23TotalRecognizedGain),
    line24: roundDollar(result.line24DeferredGainLoss),
    line25: roundDollar(result.line25BasisLikeKindPropertyReceived),
  };
  const { line15, line16, line17, line18, line19, line20, line23, line24, line25 } = money;
  if (line16.lte(0) || line19.lte(0) || !line15.plus(line16).eq(line17) || !line17.minus(line18).eq(line19)
    || !line20.eq(line15.lte(line19) ? line15 : line19) || !line19.minus(line23).eq(line24)
    || !line18.plus(line23).minus(line15).eq(line25)) {
    throw new Error("The Form 8824 candidate cannot reconcile the exchange in whole dollars");
  }
  const { fields } = FORM_8824_2026_CANDIDATE;
  const text: Record<string, string> = {
    [fields.line1PropertyGivenUp]: exchange.relinquishedDescription,
    [fields.line2PropertyReceived]: exchange.replacementDescription,
    [fields.line3AcquiredDate]: formDate(exchange.acquiredDate),
    [fields.line4TransferredDate]: formDate(exchange.transferredDate),
    [fields.line5IdentifiedDate]: formDate(exchange.receivedDate),
    [fields.line6ReceivedDate]: formDate(exchange.receivedDate),
    ...(cashReceived.gt(0) ? { [fields.line15aDescriptionFirst]: "Cash" } : {}),
  };
  for (const line of Object.keys(money) as (keyof typeof money)[]) {
    text[fields[line]] = money[line].toFixed(0);
  }
  return { text, checked: [fields.line7No] };
}
