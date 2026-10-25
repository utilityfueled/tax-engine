/**
 * Zod schemas for all tax input documents.
 * Each schema validates the JSON input files in data/input/.
 */

import { z } from "zod";
import { getNYIT201ResidentConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
import { Form982NolSourcesSchema } from "@/models/cod-nol-sources.js";
import { IraBasisSourcesSchema } from "@/models/ira-basis-sources.js";
import { CharitableCarryoverSourcesSchema } from "@/models/charitable-carryover-sources.js";

// Custom Zod type for decimal strings (validated as numbers, stored as strings for Decimal.js)
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "Must be a decimal number");
const optionalDecimal = decimal.optional().default("0");
const optionalDecimalInput = decimal.optional();
const reportedTipOrOvertimeAmount = decimal.pipe(z.string().refine(value => d(value).isFinite() && d(value).gte(0), "Reported amount must be finite and nonnegative"));
const reportedTippedOccupationCodes = z.array(z.string().regex(/^\d{3}$/)).max(2).refine(codes => new Set(codes).size === codes.length, "Duplicate reported occupation code");
const ROTH_CODE_WITHOUT_COMPANIONS = new Set(["Q", "T"]);
const CODE_J_ALLOWED_COMPANIONS = new Set(["8", "P", "S"]);
const CODE_Y_ALLOWED_COMPANIONS = new Set(["4", "7", "K"]);

export const FilingStatusSchema = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
]);

export const DependentSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  ssn: z.string(),
  relationship: z.string(),
  dateOfBirth: z.string(), // YYYY-MM-DD
  monthsLivedWithYou: z.number().int().min(0).max(12),
  qualifiesForCTC: z.boolean(),
  /** Timely employment-valid child SSN, or documented born-and-died exception. */
  ctcSsnEligible: z.boolean().optional(),
  odcTinEligible: z.boolean().optional(),
  qualifiesForODC: z.boolean().optional().default(false),
  qualifiesForEIC: z.boolean().optional().default(false),
});

export const TaxpayerSchema = z.object({
  taxYear: z.number().int(),
  filingStatus: FilingStatusSchema,
  livedWithSpouseAtAnyTimeDuringYear: z.boolean().optional(),
  stateResidency: z.enum(["full-year", "part-year", "nonresident"]).optional(),
  primary: z.object({
    firstName: z.string(),
    lastName: z.string(),
    ssn: z.string(),
    dateOfBirth: z.string(),
    occupation: z.string().optional(),
    usResidencyMonths: z.number().int().min(0).max(12).optional(),
    employmentValidSsnIssuedByDueDate: z.boolean().optional(),
    tinIssuedByDueDate: z.boolean().optional(),
  }),
  spouse: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      ssn: z.string(),
      dateOfBirth: z.string(),
      occupation: z.string().optional(),
      usResidencyMonths: z.number().int().min(0).max(12).optional(),
      employmentValidSsnIssuedByDueDate: z.boolean().optional(),
      tinIssuedByDueDate: z.boolean().optional(),
    })
    .optional(),
  address: z.object({
    street: z.string(),
    apt: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
  dependents: z.array(DependentSchema).default([]),
});

export const W2Schema = z.object({
  taxYear: z.number().int().optional(),
  employer: z.object({
    name: z.string(),
    ein: z.string(),
    address: z.string().optional(),
  }),
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse attribution on shared federal/state flows
  wages: decimal, // Box 1
  federalWithheld: decimal, // Box 2
  box12CodeW: optionalDecimal, // Box 12 code W employer and salary-reduction HSA contributions
  box12CodeD: optionalDecimal, // Box 12 code D elective deferrals under section 401(k)
  box12CodeE: optionalDecimal, // Box 12 code E elective deferrals under section 403(b)
  box12CodeF: optionalDecimal, // Box 12 code F elective deferrals under section 408(k)(6) salary-reduction SEP
  box12CodeG: optionalDecimal, // Box 12 code G elective deferrals and employer contributions to section 457(b)
  box12CodeH: optionalDecimal, // Box 12 code H elective deferrals under section 501(c)(18)(D)
  box12CodeS: optionalDecimal, // Box 12 code S employee salary-reduction contributions under SIMPLE
  box12CodeAA: optionalDecimal, // Box 12 code AA designated Roth contributions under section 401(k)
  box12CodeBB: optionalDecimal, // Box 12 code BB designated Roth contributions under section 403(b)
  box12CodeEE: optionalDecimal, // Box 12 code EE designated Roth contributions under governmental section 457(b)
  box12CodeT: optionalDecimal, // Box 12 code T employer-provided adoption benefits
  box12CodeTP: reportedTipOrOvertimeAmount.optional(), // 2026 Box12TP total reported cash tips; already included in wages.
  box12CodeTT: reportedTipOrOvertimeAmount.optional(), // 2026 Box12TT qualified overtime; already included in wages.
  treasuryTippedOccupationCodes: reportedTippedOccupationCodes.optional(), // 2026 Box14b; 000 is an actual nonqualifying occupation.
  socialSecurityWages: optionalDecimalInput, // Box 3; omitted is not a verified zero
  socialSecurityTips: optionalDecimalInput, // Box 7; omitted is not a verified zero
  allocatedTips: optionalDecimalInput, // Box8; actual source amount, distinct from Box1/7 income.
  socialSecurityWithheld: optionalDecimal, // Box 4
  medicareWages: optionalDecimal, // Box 5
  medicareWithheld: optionalDecimal, // Box 6
  box10DependentCareBenefits: optionalDecimalInput, // Actual Box 10; omission is unknown, not zero.
  stateTaxWithheld: optionalDecimal, // Box 17
  localWages: optionalDecimal, // Box 18
  localTaxWithheld: optionalDecimal, // Box 19
  localityName: z.string().optional(), // Box 20
  stateWages: optionalDecimal, // Box 16
  state: z.string().optional(),
  militaryService: z.object({
    activeDuty: z.boolean(),
    dutyState: z.string().optional(), // Two-letter state/territory/APO code for the duty station
    combatOrHazardousDutyPay: z.boolean().optional().default(false),
  }).optional(),
  locality: z.string().optional(), // Box 20 locality name
});

const PrivateActivityBondFactsSchema = z.object({
  taxYear: z.union([z.literal(2025), z.literal(2026)]),
  sourceId: z.string().trim().min(1),
  recipientAmountsConfirmed: z.literal(true),
  otherwiseAllowableDeduction: decimal,
  deductionSourceReference: z.string().trim().min(1).optional(),
  deductionAllowanceAndNoDuplicationConfirmed: z.literal(true).optional(),
});

export const Form1099IntSchema = z.object({
  payer: z.string(),
  accountReference: z.string().trim().min(1).optional(), // Actual local account identity for source-bound tax elections; omission remains unknown.
  payerTin: z.string().optional(), // Payer TIN shown on the recipient copy; used for IL Schedule IL-WIT Column B auto-attachment
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse on shared state returns
  interestIncome: decimal, // Box 1
  earlyWithdrawalPenalty: optionalDecimal, // Box 2
  usSavingsBondInterest: optionalDecimal, // Box 3
  federalWithheld: optionalDecimal, // Box 4
  foreignTaxPaid: optionalDecimal, // Box 6
  foreignCountry: z.string().optional(), // Box 7
  taxExemptInterest: optionalDecimal, // Box 8
  privateActivityBondInterest: decimal.optional(), // Actual Box 9, included in Box 8; unknown is not zero.
  privateActivityBondFacts: PrivateActivityBondFactsSchema.optional(),
  paDirectObligationInterest: optionalDecimal, // PA-specific allocation of exempt interest attributable to direct PA obligations
  stateWithheld: optionalDecimal, // Box 17 — state income tax withheld
  state: z.string().optional(), // Box 18 — state
});

export const Form1099DivSchema = z.object({
  payer: z.string(),
  accountReference: z.string().trim().min(1).optional(), // Actual local account identity for source-bound tax elections; omission remains unknown.
  payerTin: z.string().optional(), // Payer TIN shown on the recipient copy; used for IL Schedule IL-WIT Column B auto-attachment
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse on shared state returns
  ordinaryDividends: decimal, // Box 1a
  qualifiedDividends: optionalDecimal, // Box 1b
  totalCapitalGainDistributions: optionalDecimal, // Box 2a
  section1250Gain: optionalDecimal, // Box 2b
  section1202Gain: optionalDecimal, // Box 2c
  collectiblesGain: optionalDecimal, // Box 2d
  nondividendDistributions: optionalDecimal, // Box 3
  federalWithheld: optionalDecimal, // Box 4
  section199ADividends: optionalDecimal, // Box 5 — qualified REIT dividends for Section 199A QBI deduction
  foreignTaxPaid: optionalDecimal, // Box 7
  foreignCountry: z.string().optional(),
  exemptInterestDividends: optionalDecimal, // Box 12
  specifiedPrivateActivityBondInterest: decimal.optional(), // Actual Box 13, already included in Box 12 and net of fund expenses.
  privateActivityBondFacts: PrivateActivityBondFactsSchema.optional(),
  paExemptInterestDividendAllocation: optionalDecimal, // PA-specific allocation of Box 12 attributable to PA and U.S. government obligations
  stateWithheld: optionalDecimal, // Box 16 — state income tax withheld
  state: z.string().optional(), // Box 17 — state
});

export const CapitalTransactionSchema = z.object({
  description: z.string(),
  dateAcquired: z.string(), // YYYY-MM-DD or "VARIOUS"
  dateSold: z.string(), // YYYY-MM-DD
  proceeds: decimal,
  costBasis: decimal,
  adjustments: optionalDecimal,
  basisReportedToIRS: z.boolean().default(true),
  holdingPeriod: z.enum(["short", "long"]),
  washSale: z.boolean().default(false),
  washSaleDisallowed: optionalDecimal,
  digitalAsset: z.boolean().default(false), // PA Schedule D digital-asset disclosure support
  sourceDocumentType: z.enum(["1099-b", "1099-da", "not-reported"]).optional(), // Actual reporting source; omission in the original Form1099B collection retains its legacy1099-B meaning.
});

export const Form1099BSchema = z.object({
  broker: z.string(),
  sourceId: z.string().optional(), // Original statement identifier; never a transaction-row identifier.
  taxYear: z.number().int().optional(),
  accountReference: z.string().optional(),
  federalWithheld: decimal.optional(), // Actual Box4; omission remains unknown, not zero.
  withholdingOnlyOpenShortSale: z.object({
    description: z.string().optional(), openedDate: z.string().optional(),
    stillOpenAtYearEndConfirmed: z.boolean().optional(), otherNumberedBoxesBlankConfirmed: z.boolean().optional(),
  }).strict().optional(),
  payerTin: z.string().optional(), // Broker or payer TIN shown on the recipient copy; used for IL Schedule IL-WIT Column B auto-attachment
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse on shared state returns / spouse-separated PA Schedule D reporting
  stateWithheld: optionalDecimal, // Box 16 — state income tax withheld
  state: z.string().optional(), // State code for IL Schedule IL-WIT auto-attachment
  transactions: z.array(CapitalTransactionSchema),
});

// Actual local source facts for the Schedule D line 18/19 worksheets.
const ScheduleDCapitalSourceIdentitySchema = z.object({
  firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), ssnLast4: z.string().regex(/^\d{4}$/),
});
const ScheduleDCapitalSourceRowSchema = z.object({
  sourceId: z.string().trim().min(1), sourceTaxYear: z.number().int(), sourceReference: z.string().trim().min(1),
  accountHolder: z.enum(["primary", "spouse"]), payerName: z.string().trim().min(1),
});
export const ScheduleDSpecialGainSourcesSchema = z.object({
  taxYear: z.number().int(), sourceReference: z.string().trim().min(1),
  sourceFactsConfirmed: z.literal(true), allSourcesIncluded: z.literal(true),
  primary: ScheduleDCapitalSourceIdentitySchema, spouse: ScheduleDCapitalSourceIdentitySchema.optional(),
  priorShortTermCapitalLoss: decimal, priorLongTermCapitalLoss: decimal, section1231Lookback: decimal,
  amtBasisAndCarryoversSameAsRegularConfirmed: z.boolean(),
  form2439Present: z.boolean(), partnershipInterestDispositionPresent: z.boolean(), other1250DispositionPresent: z.boolean(),
  longTermAssets: z.array(ScheduleDCapitalSourceRowSchema.extend({
    description: z.string().trim().min(1), dateAcquired: z.string().min(1), dateSold: z.string().min(1),
    proceeds: decimal, costBasis: decimal, adjustments: decimal, washSale: z.boolean(), washSaleDisallowed: decimal,
    character: z.enum(["ordinary", "collectible", "qsbs"]),
  })),
  reportedGains: z.array(ScheduleDCapitalSourceRowSchema.extend({
    netLongTermCapitalGain: decimal, collectiblesGain: decimal, unrecapturedSection1250Gain: decimal, section1202Gain: decimal,
    section1231Gain: decimal.optional(), isFinalK1: z.boolean().optional(), finalYearLongTermCapitalLoss: decimal.optional(),
  })),
});

// Actual Section1202 source records; amounts are original, before any exclusion.
export const Section1202SourcesSchema = z.object({
  taxYear: z.number().int(), sourceReference: z.string().trim().min(1), sourceFactsConfirmed: z.boolean(),
  allSourcesIncluded: z.boolean(), preExclusionAmountsConfirmed: z.boolean(),
  primary: ScheduleDCapitalSourceIdentitySchema, spouse: ScheduleDCapitalSourceIdentitySchema.optional(),
  issuers: z.array(z.object({
    issuerId: z.string().trim().min(1), issuerName: z.string().trim().min(1), sourceReference: z.string().trim().min(1),
    allPriorUseAndCurrentDispositionsConfirmed: z.boolean(), membershipUnchangedConfirmed: z.boolean(),
    priorEligibleGainUsed: decimal, historySourceReference: z.string().trim().min(1),
    priorReturns: z.array(z.object({
      taxYear: z.number().int(), sourceReference: z.string().trim().min(1), filingStatus: FilingStatusSchema,
      primary: ScheduleDCapitalSourceIdentitySchema, spouse: ScheduleDCapitalSourceIdentitySchema.optional(), eligibleGainUsed: decimal,
    })),
    eligibleGainAllocations: z.array(z.object({ sourceId: z.string().trim().min(1), ordinaryEligibleGain: decimal, empowermentEligibleGain: decimal })).optional(),
  })),
  lots: z.array(z.object({
    lotId: z.string().trim().min(1), sourceId: z.string().trim().min(1), issuerId: z.string().trim().min(1), sourceReference: z.string().trim().min(1),
    accountHolder: z.enum(['primary', 'spouse']), payerName: z.string().trim().min(1), securityDescription: z.string().trim().min(1),
    acquisitionMethod: z.enum(['original_issue', 'gift', 'inheritance', 'partnership_distribution', 'conversion', 'section351_or_368']),
    originalIssueDate: z.string(), effectiveAcquiredDate: z.string(), dateSold: z.string(),
    recognizedGain: decimal, basisIgnoringPostIssueAdditions: decimal, empowermentZoneGainThrough2018: decimal,
    empowermentQualificationAndAttributionConfirmed: z.boolean(),
    proceeds: decimal.optional(), costBasis: decimal.optional(), adjustments: decimal.optional(), washSale: z.boolean().optional(), washSaleDisallowed: decimal.optional(),
    qualification: z.object({
      domesticCCorporationAtIssue: z.boolean(), consideration: z.enum(['money', 'property_not_stock', 'services_not_underwriter', 'stock', 'other']),
      allPredecessorAndControlledGroupAssetsIncluded: z.boolean(), maxGrossAssetsBeforeIssue: decimal, grossAssetsImmediatelyAfterIssue: decimal,
      cCorporationThroughoutHolding: z.boolean(), activeBusinessRequirementSatisfied: z.boolean(), redemptionRestrictionsSatisfied: z.boolean(), offsettingPositionPresent: z.boolean(),
    }),
    passThrough: z.object({
      ownerInterestAcquiredDate: z.string(), heldContinuouslyThroughSale: z.boolean(), unchangedOwnershipProportionConfirmed: z.boolean(),
      ownershipPercentage: decimal, entityRecognizedGain: decimal, entityBasisIgnoringPostIssueAdditions: decimal,
      fundCapitalGainDistributions: decimal, fundSection1202Gain: decimal,
    }).optional(),
  })),
});

// ── Form 1099-DA: Digital Asset Proceeds from Broker Transactions ──
// Original final-form boxes are separate from completed taxpayer basis records.
// Legacy defaults retain historical arithmetic but never establish actual facts.
export const Form1099DATransactionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const required = ["sourceId", "digitalAssetCode", "digitalAssetName", "quantity", "reportedDateAcquired", "reportedCostBasis", "dateAcquired", "dateSold", "proceeds", "costBasis", "basisReportedToIRS", "holdingPeriod", "transactionType", "basisSource", "basisSourceReference", "basisFactsConfirmed", "proceedsType", "sellingExpenses", "marketDiscount", "washSale", "washSaleDisallowed", "adjustments", "qof", "lossNotAllowed", "ordinaryIncome", "onlyCashProceeds", "customerProvidedAcquisitionInformation", "noncoveredSecurity", "optionalReportingMethod", "assetOrigin", "capitalAssetConfirmed", "nftOrCollectible"];
  return { ...raw, sourceFactsComplete: raw.sourceFactsComplete !== false && required.every(field => raw[field] !== undefined) };
}, z.object({
  sourceId: z.string().optional(),
  sourceFactsComplete: z.boolean().optional(),
  digitalAssetCode: z.string().optional(), // Original Box1a DTIF code.
  digitalAssetName: z.string(), // Box1b.
  ticker: z.string().optional(), // Optional statement abbreviation, not a numbered box.
  quantity: decimal.optional(), // Box1c.
  reportedDateAcquired: z.string().nullable().optional(), // Original Box1d; null means actually blank.
  reportedCostBasis: decimal.nullable().optional(), // Original Box1g; null means actually blank.
  dateAcquired: z.string(), // Completed basis record date, independently supported when Box1d is blank.
  dateSold: z.string(), // Box1e.
  proceeds: decimal, // Box1f.
  costBasis: decimal, // Actual completed taxpayer basis; never inferred from a blank Box1g.
  paCostBasis: decimal.optional(), // Separately supported Pennsylvania adjusted basis, including actual zero.
  paBasisSourceReference: z.string().optional(),
  paBasisFactsConfirmed: z.boolean().optional(),
  paTransactionForProfitConfirmed: z.boolean().optional(),
  gainOrLoss: decimal.optional(), // Optional substitute-statement summary, not a numbered1099DA box.
  basisReportedToIRS: z.boolean().default(true), // Original Box2.
  holdingPeriod: z.enum(["short", "long"]), // Derived from acquisition/sale dates
  transactionType: z.enum(["sale", "exchange", "payment", "gift"]).default("sale"),
  basisSource: z.enum(["broker_statement", "taxpayer_records"]).optional(),
  basisSourceReference: z.string().optional(),
  basisFactsConfirmed: z.boolean().optional(),
  proceedsType: z.enum(["gross", "net"]).optional(), // Box3a.
  sellingExpenses: decimal.optional(),
  marketDiscount: decimal.optional(), // Box1h.
  qof: z.boolean().optional(), // Box3b.
  lossNotAllowed: z.boolean().optional(), // Box5.
  ordinaryIncome: z.boolean().optional(), // Box6 ordinary indicator.
  onlyCashProceeds: z.boolean().optional(), // Box7.
  customerProvidedAcquisitionInformation: z.boolean().optional(), // Box8.
  noncoveredSecurity: z.boolean().optional(), // Box9.
  optionalReportingMethod: z.enum(["none", "stablecoins", "specified_nfts"]).optional(), // Box11a.
  assetOrigin: z.enum(["purchase", "mining", "staking", "airdrop", "gift", "inheritance", "other"]).optional(),
  capitalAssetConfirmed: z.boolean().optional(),
  nftOrCollectible: z.boolean().optional(),
  lotId: z.string().optional(), // For specific_id method: identifies which lot to match
  washSale: z.boolean().default(false),
  washSaleDisallowed: optionalDecimal, // Original Box1i.
  adjustments: optionalDecimal,
}));

export const Form1099DASchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const required = ["sourceId", "taxYear", "sourceReference", "sourceFactsConfirmed", "allTransactionsIncluded", "brokerName", "accountHolder", "federalWithheld", "stateTaxReporting", "stateWithheld", "transactions"];
  return { ...raw, sourceFactsComplete: raw.sourceFactsComplete !== false && required.every(field => raw[field] !== undefined) };
}, z.object({
  sourceId: z.string().optional(),
  taxYear: z.number().int().optional(),
  sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  sourceFactsComplete: z.boolean().optional(),
  allTransactionsIncluded: z.boolean().optional(),
  brokerName: z.string(), // Box — broker name
  brokerTin: z.string().optional(), // Broker TIN
  accountReference: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  federalWithheld: decimal.optional(), // Original Box4, once per statement; unknown remains unknown.
  stateTaxReporting: z.enum(["none", "single", "multiple"]).optional(),
  stateWithheld: optionalDecimal,
  state: z.string().optional(),
  transactions: z.array(Form1099DATransactionSchema),
}));

// ── Crypto Cost Basis Method Election ──
// IRS Notice 2014-21, Q&A 7: taxpayers may use FIFO or specific identification
// Rev. Rul. 2019-24: applies to all virtual currency
export const CryptoCostBasisMethodSchema = z.enum([
  "fifo", // First In, First Out (default)
  "lifo", // Last In, First Out
  "hifo", // Highest In, First Out (tax-loss harvesting optimization)
  "specific_id", // Specific Identification (requires matching lot IDs)
]);

// ── Crypto Lot for Cost Basis Tracking ──
export const CryptoLotSchema = z.object({
  asset: z.string(), // Ticker/symbol (e.g., "BTC")
  dateAcquired: z.string(), // YYYY-MM-DD
  quantity: decimal,
  costBasisPerUnit: decimal,
  source: z.enum(["purchase", "mining", "staking", "airdrop", "hard_fork", "gift", "swap", "lp_exit", "yield", "lending", "other"]).default("purchase"),
  lotId: z.string().optional(), // For specific_id matching
});

// ── Crypto Mining Income ──
// IRS Notice 2014-21, Q&A 8: mining income is ordinary income at FMV on date received
// If hobby: Schedule 1 Line 8z. If business: Schedule C gross receipts.
export const CryptoMiningIncomeSchema = z.object({
  asset: z.string(), // Ticker (e.g., "BTC")
  dateReceived: z.string(), // YYYY-MM-DD
  quantity: decimal,
  fairMarketValuePerUnit: decimal, // FMV at time of receipt
  poolFees: optionalDecimal, // Mining pool fees (deductible if business)
  description: z.string().optional(),
});

// ── Crypto Staking Income ──
// IRS Rev. Rul. 2023-14: staking rewards are gross income at FMV when taxpayer
// gains dominion and control. Similar treatment to mining.
export const CryptoStakingIncomeSchema = z.object({
  asset: z.string(),
  dateReceived: z.string(), // YYYY-MM-DD
  quantity: decimal,
  fairMarketValuePerUnit: decimal,
  validatorExpenses: optionalDecimal, // Validator operating costs (deductible if business)
  description: z.string().optional(),
});

// ── Crypto Airdrop and Hard Fork Income ──
// Rev. Rul. 2019-24: airdrop/hard fork tokens are ordinary income at FMV when received
// Hard fork: basis = FMV at time chain splits (if determinable), else $0
export const CryptoAirdropIncomeSchema = z.object({
  asset: z.string(),
  dateReceived: z.string(), // YYYY-MM-DD
  quantity: decimal,
  fairMarketValuePerUnit: decimal, // $0 if indeterminable (hard fork)
  source: z.enum(["airdrop", "hard_fork", "promotional"]),
  description: z.string().optional(),
});

// ── DeFi Token Swap (DEX Trade) ──
// Each token-to-token swap is a taxable disposition of the sold token
// per IRS Notice 2014-21 (virtual currency is property; exchanging one
// property for another is a realization event under IRC §1001).
// Wrapping events (ETH→WETH) and bridge transactions carry over basis.
export const DeFiTokenSwapSchema = z.object({
  protocol: z.string().optional(), // DEX name (e.g., "Uniswap", "SushiSwap")
  fromAsset: z.string(), // Ticker of token disposed (e.g., "ETH")
  fromQuantity: decimal, // Quantity disposed
  toAsset: z.string(), // Ticker of token received (e.g., "USDC")
  toQuantity: decimal, // Quantity received
  fairMarketValueAtSwap: decimal, // Total FMV of received tokens in USD
  dateSwapped: z.string(), // YYYY-MM-DD
  gasFee: optionalDecimal, // Gas fee in USD (capitalized into new lot basis)
  isWrappingEvent: z.boolean().default(false), // ETH→WETH, BTC→WBTC (non-taxable, basis carryover)
  isBridgeTransaction: z.boolean().default(false), // Cross-chain same-asset transfer (non-taxable)
});

// ── DeFi LP (Liquidity Pool) Position ──
// Entering a pool swaps base assets for LP tokens — generally NOT a taxable event
// (treated as depositing assets). Exiting IS a taxable event: gain/loss =
// FMV of assets received − basis of LP tokens.
// IRS has not issued definitive guidance; conservative treatment per Notice 2014-21.
export const DeFiLPPositionSchema = z.object({
  protocol: z.string(), // e.g., "Uniswap V3", "Curve", "Balancer"
  poolAssets: z.tuple([z.string(), z.string()]), // e.g., ["ETH", "USDC"]
  lpTokensReceived: decimal, // LP tokens received on entry
  underlyingAssetsDeposited: z.array(z.object({
    asset: z.string(),
    quantity: decimal,
    costBasisPerUnit: decimal, // Basis of deposited assets (carries to LP token basis)
  })),
  dateEntered: z.string(), // YYYY-MM-DD
  dateExited: z.string().optional(), // YYYY-MM-DD — undefined if still open
  underlyingAssetsReceived: z.array(z.object({
    asset: z.string(),
    quantity: decimal,
    fairMarketValuePerUnit: decimal, // FMV at withdrawal
  })).optional(), // Populated on exit
  gasFeeEntry: optionalDecimal, // Gas on entry (capitalized into LP token basis)
  gasFeeExit: optionalDecimal, // Gas on exit (reduces proceeds)
});

// ── DeFi Yield / Liquidity Mining Rewards ──
// FMV at receipt = ordinary income (Schedule 1 Line 8z or Schedule C if business).
// Basis of received tokens = FMV at receipt for future disposal.
// IRS Notice 2014-21 Q&A 8 (mining analogy); Rev. Rul. 2023-14 (staking analogy).
export const DeFiYieldRewardSchema = z.object({
  protocol: z.string(), // e.g., "Aave", "Compound", "SushiSwap"
  asset: z.string(), // Reward token ticker
  dateReceived: z.string(), // YYYY-MM-DD
  quantity: decimal,
  fairMarketValuePerUnit: decimal, // USD FMV at receipt
  rewardType: z.enum(["liquidity_mining", "yield_farming", "governance_distribution"]),
  description: z.string().optional(),
});

// ── NFT Transaction ──
// NFTs are property per IRS Notice 2014-21. Buy/sell/mint/airdrop each have
// distinct tax treatment. Collectible NFTs face 28% max LTCG rate.
// IRS Notice 2023-27: certain NFTs may be treated as collectibles under IRC §408(m).
export const NFTTransactionSchema = z.object({
  nftName: z.string(),
  collectionName: z.string().optional(),
  tokenId: z.string().optional(),
  transactionType: z.enum(["buy", "sell", "mint", "airdrop", "gift"]),
  proceeds: optionalDecimal, // USD proceeds on sell (0 for buy/airdrop)
  costBasis: optionalDecimal, // Purchase price + gas for buy; FMV at receipt for airdrop
  gasFee: optionalDecimal, // Gas fee (capitalized into basis on buy, reduces proceeds on sell)
  dateAcquired: z.string(), // YYYY-MM-DD
  dateSold: z.string().optional(), // YYYY-MM-DD — for sell transactions
  fairMarketValueAtTransaction: optionalDecimal, // FMV at time of transaction (for airdrop/mint income)
  isCollectible: z.boolean().default(false), // If true, 28% max LTCG rate per IRS Notice 2023-27
  isBusiness: z.boolean().default(false), // Creator selling own NFTs → Schedule C
});

// ── Crypto Lending Income ──
// Interest earned from lending crypto is ordinary income at FMV when received.
// Borrowing is NOT taxable (debt, not income).
// Liquidation of collateral IS a taxable disposition.
// Per IRS Notice 2014-21 and general IRC §61 principles.
export const CryptoLendingIncomeSchema = z.object({
  platform: z.string(), // e.g., "Aave", "Compound", "BlockFi"
  asset: z.string(), // Interest-bearing asset ticker
  interestReceived: decimal, // Quantity of interest tokens received
  fairMarketValuePerUnit: decimal, // USD FMV per unit at receipt
  dateReceived: z.string(), // YYYY-MM-DD
  description: z.string().optional(),
});

// ── Crypto Lending Liquidation ──
// When collateral is liquidated, it's a taxable disposition.
// Gain/loss = FMV at liquidation − basis of collateral.
export const CryptoLiquidationSchema = z.object({
  platform: z.string(),
  collateralAsset: z.string(),
  collateralQuantity: decimal,
  fairMarketValueAtLiquidation: decimal, // Total USD FMV of liquidated collateral
  dateOfLiquidation: z.string(), // YYYY-MM-DD
});

// ── Crypto Donation to Charity ──
// Donating appreciated crypto held >1 year: deduct FMV, no capital gains (IRC §170(e)(1)(A)).
// Donating crypto held ≤1 year: deduct basis only (IRC §170(e)(1)(A)).
// Must be to qualified 501(c)(3) organization.
export const CryptoDonationSchema = z.object({
  asset: z.string(),
  quantity: decimal,
  dateAcquired: z.string(), // YYYY-MM-DD — original acquisition date
  dateDonated: z.string(), // YYYY-MM-DD
  fairMarketValueAtDonation: decimal, // Total FMV at time of donation
  costBasis: decimal, // Original cost basis
  charityName: z.string(),
  charityEIN: z.string().optional(),
  isQualifiedOrganization: z.boolean().optional(), // Actual IRC170 eligibility, never assumed.
  recipientCategory: z.enum(["fifty-percent", "other-qualified"]).optional(),
  capitalAsset: z.boolean().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  fullOwnershipInterestDonated: z.boolean().optional(),
  noGoodsOrServicesReceived: z.boolean().optional(),
  substantiationRequirementsMet: z.boolean().optional(),
  appraisalRequired: z.boolean().optional(), // Actual similar-property aggregation and threshold review.
  qualifiedAppraisalObtained: z.boolean().optional(),
});

// ── Aggregated Crypto Income Input ──
export const CryptoIncomeInputSchema = z.object({
  businessAccountHolder: z.enum(["primary", "spouse"]).optional(),
  miningIncome: z.array(CryptoMiningIncomeSchema).default([]),
  stakingIncome: z.array(CryptoStakingIncomeSchema).default([]),
  airdropIncome: z.array(CryptoAirdropIncomeSchema).default([]),
  isMiningBusiness: z.boolean().default(false), // Controls routing: Schedule C vs Schedule 1 Line 8z
  isStakingBusiness: z.boolean().default(false), // Controls routing: Schedule C vs Schedule 1 Line 8z
  tokenSwaps: z.array(DeFiTokenSwapSchema).default([]), // DeFi token-to-token swaps (DEX trades, wrapping, bridging)
  lpPositions: z.array(DeFiLPPositionSchema).default([]), // DeFi liquidity pool positions
  yieldRewards: z.array(DeFiYieldRewardSchema).default([]), // DeFi yield/liquidity mining rewards
  nftTransactions: z.array(NFTTransactionSchema).default([]), // NFT buy/sell/mint/airdrop
  lendingIncome: z.array(CryptoLendingIncomeSchema).default([]), // Crypto lending interest
  liquidations: z.array(CryptoLiquidationSchema).default([]), // Collateral liquidations
  donations: z.array(CryptoDonationSchema).default([]), // Crypto charitable donations
  cryptoCostBasisMethod: CryptoCostBasisMethodSchema.default("fifo"),
  lots: z.array(CryptoLotSchema).default([]), // Pre-existing lots for lot matching
});

export const Form1099NecSchema = z.object({
  taxYear: z.number().int().optional(),
  payer: z.string(),
  payerTin: z.string().optional(), // Payer's TIN (used for IL Schedule IL-WIT Column B auto-attachment)
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse attribution on shared returns
  nonemployeeCompensation: decimal, // Box 1
  cashTips: reportedTipOrOvertimeAmount.optional(), // 2026 Box1b, included in Box1a compensation.
  qualifiedOvertimeCompensation: reportedTipOrOvertimeAmount.optional(), // 2026 Box1d, included in Box1a compensation.
  treasuryTippedOccupationCodes: reportedTippedOccupationCodes.optional(), // 2026 Box1c.
  federalWithheld: optionalDecimal, // Box 4
  stateWithheld: optionalDecimal, // Box 5
  state: z.string().optional(), // Box 6 (abbreviated state name and payer state identification number)
  stateIncome: decimal.optional(), // Box 7 — state compensation for IL Schedule IL-WIT Column D
});

export const Form1099MiscSchema = z.object({
  taxYear: z.number().int().optional(),
  sourceId: z.string().optional(),
  accountReference: z.string().optional(),
  sourceFormRevision: z.enum(["2025-04", "2026-12"]).optional(),
  payer: z.string(),
  payerTin: z.string().optional(), // Payer's TIN (used for IL Schedule IL-WIT Column B auto-attachment)
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse attribution on shared returns
  rents: optionalDecimal, // Box 1
  royalties: optionalDecimal, // Box 2
  otherIncome: optionalDecimal, // Box 3
  cashTips: reportedTipOrOvertimeAmount.optional(), // 2026 Box13a, included in Box3 other income.
  qualifiedOvertimeCompensation: reportedTipOrOvertimeAmount.optional(), // 2026 Box14, included in Box3 other income.
  treasuryTippedOccupationCodes: reportedTippedOccupationCodes.optional(), // 2026 Box13b.
  federalWithheld: optionalDecimal, // Box 4
  fishingBoatProceeds: optionalDecimal, // Box 5
  medicalPayments: optionalDecimal, // Box 6
  directSales: z.boolean().optional(), // Box 7
  substitutePayments: optionalDecimal, // Box 8
  cropInsurance: optionalDecimal, // Box 9
  grossAttorneyProceeds: optionalDecimal, // Box 10
  fishPurchasedForResale: decimal.optional(), // Box 11
  section409ADeferrals: optionalDecimal, // Box 12
  fatcaFilingRequirement: z.boolean().optional(), // 2025 Box13; separate checkbox on 2026 revision.
  excessGoldenParachute: optionalDecimal, // Legacy import field; not a current 2025/2026 MISC box.
  nonqualifiedDeferredComp: optionalDecimal, // Box 15 on the 2025/2026 revisions.
  stateWithheld: optionalDecimal, // Box 16
  state: z.string().optional(), // Box 17 (abbreviated state name and payer state identification number)
  payerStateId: z.string().optional(), // Original Box 17 payer state identification.
  stateIncome: decimal.optional(), // Box 18 — state income for IL Schedule IL-WIT Column D
});

export const Form1099GSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const required = ["sourceId", "accountReference", "taxYear", "sourceFormRevision", "accountHolder", "programType", "unemploymentCompensation", "federalWithheld", "rtaaPayments", "taxableGrants", "agriculturePayments", "marketGain", "tradeOrBusinessRefund", "currentYearRepaid", "priorYearRepaid", "unrecoveredAfterTaxContributions", "actualReceiptConfirmed", "additionalWorksheetRequired", "sourceFactsConfirmed", "stateTaxReporting"];
  if (raw.taxYear === 2026 || raw.sourceFormRevision === "2026-12") required.push("familyLeaveBenefits");
  if (raw.stateTaxReporting === "single") required.push("state", "stateWithheld");
  const refundPresent = raw.stateOrLocalTaxRefund !== undefined || raw.stateLocalIncomeTaxRefund !== undefined;
  return { ...raw, sourceFactsComplete: raw.sourceFactsComplete !== false && refundPresent && required.every(field => raw[field] !== undefined) };
}, z.object({
  payer: z.string(),
  payerTin: z.string().optional(), // Payer TIN shown on the recipient copy; required for IL Schedule IL-WIT Column B auto-attachment
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse attribution on shared returns
  sourceId: z.string().optional(),
  accountReference: z.string().optional(),
  taxYear: z.number().int().optional(),
  sourceFormRevision: z.enum(["2024-03", "2026-12"]).optional(),
  sourceFactsComplete: z.boolean().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  actualReceiptConfirmed: z.boolean().optional(),
  additionalWorksheetRequired: z.boolean().optional(),
  programType: z.enum(["government-unemployment", "employer-supplemental", "private-or-union", "other-government"]).optional(),
  unemploymentCompensation: decimal, // Box 1
  stateLocalIncomeTaxRefund: optionalDecimal, // Box 2 (IL Schedule IL-WIT path)
  stateOrLocalTaxRefund: optionalDecimal, // Box 2 (OH and generic path)
  refundTaxYear: z.number().optional(), // Box 3: state return year, not necessarily the payment year
  refundExpenseTaxYear: z.number().int().min(1900).optional(), // Actual year the refunded tax was paid/deducted
  federalWithheld: optionalDecimal, // Box 4
  rtaaPayments: optionalDecimalInput, // Box 5
  taxableGrants: optionalDecimalInput, // Box 6
  grantIncomeCategory: z.enum(["nonbusiness", "business", "farm"]).optional(),
  agriculturePayments: optionalDecimalInput, // Box 7
  tradeOrBusinessRefund: z.boolean().optional(), // Box 8
  marketGain: optionalDecimalInput, // Box 9
  familyLeaveBenefits: optionalDecimalInput, // Box 10 from the December 2026 revision
  familyLeaveProgramType: z.enum(["state-pfml-family", "state-pfml-medical", "private-family-leave"]).optional(),
  currentYearRepaid: optionalDecimalInput,
  priorYearRepaid: optionalDecimalInput,
  unemploymentReceivedBeforeRepayment: optionalDecimalInput,
  box1IncludesCurrentYearRepayment: z.boolean().optional(),
  repaymentSourceReference: z.string().optional(),
  /** Actual available nondeductible unemployment contributions; PFML contributions are separate. */
  unrecoveredAfterTaxContributions: optionalDecimalInput,
  contributionProgramId: z.string().optional(),
  contributionHistoryReference: z.string().optional(),
  contributionBalanceReconciled: z.boolean().optional(),
  allProgramPaymentsIncluded: z.boolean().optional(),
  stateTaxReporting: z.enum(["none", "single", "multiple"]).optional(),
  stateWithheld: optionalDecimal, // Box 11 before 2026; Box 12 in the 2026 revision
  state: z.string().optional(),
  statePayerId: z.string().optional(),
}));

/**
 * Form 1099-OID — Original Issue Discount
 *
 * Reports OID accrued on debt instruments such as zero-coupon bonds, CDs
 * issued at a discount, Treasury STRIPS, and TIPS. OID is taxable interest
 * income accrued annually even when no cash is received (phantom income).
 *
 * Ref: IRC §§1272–1273, §171; IRS Pub 1212; Pub 550 Ch. 1.
 */
const Form1099OIDFieldsSchema = z.object({
  payer: z.string(),
  payerTin: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  sourceId: z.string().optional(),
  taxYear: z.number().int().optional(),
  sourceFormRevision: z.literal("2024-01").optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  sourceFactsComplete: z.boolean().optional(),
  /** Actual recipient amounts account for holding period, basis and nominee adjustments. */
  recipientAmountsConfirmed: z.boolean().optional(),
  obligationType: z.enum(["taxable", "treasury", "tax_exempt"]).optional(),
  inflationIndexed: z.boolean().optional(),
  /** Actual specified-private-activity classification, including statutory exceptions. */
  specifiedPrivateActivityBond: z.boolean().optional(),
  originalIssueDiscount: decimal, // Box 1, excludes Box 8 Treasury OID
  otherPeriodicInterest: optionalDecimal, // Box 2, classified by this obligation
  earlyWithdrawalPenalty: optionalDecimal, // Box 3, separate deduction
  federalWithheld: optionalDecimal, // Box 4
  marketDiscount: decimal.optional(), // Box 5, actual current accrual
  acquisitionPremium: optionalDecimal, // Box 6, offsets matching OID category
  description: z.string().optional(), // Box 7, actual CUSIP or description
  treasuryOID: optionalDecimal, // Box 8, separate from Box 1; may be negative for TIPS
  investmentExpenses: decimal.optional(), // Box 9, already included in Box 2, nondeductible
  bondPremium: optionalDecimal, // Box 10, offsets stated interest when allowed
  taxExemptOID: optionalDecimal, // Box 11
  /** Historical mislabeled aggregate. Positive values require actual source reconciliation. */
  taxExemptBondPremium: optionalDecimal,
  stateWithholding: z.array(z.object({
    state: z.string().regex(/^[A-Z]{2}$/), // Box 12
    statePayerId: z.string(), // Box 13; actual blank is retained as blank
    stateWithheld: decimal, // Box 14
  })).max(2).optional(),
  oidReportedNetOfAcquisitionPremium: z.boolean().optional(),
  interestReportedNetOfBondPremium: z.boolean().optional(),
  marketDiscountElection: z.boolean().optional(), // Actual IRC 1278(b) current-inclusion election
  bondPremiumElection: z.boolean().optional(), // Actual IRC 171 election, taxable bonds only
  modernBondPremiumRulesApply: z.boolean().optional(), // Actual applicability; no inferred pre-1988 election history
  /** Signed changes to named source amounts from a completed recipient worksheet, before premium offsets. */
  recipientAdjustments: z.object({
    sourceReference: z.string().min(1), oid: decimal, periodicInterest: decimal,
    acquisitionPremium: decimal, bondPremium: decimal, marketDiscount: decimal,
  }).optional(),
  bondPremiumWorksheet: z.object({
    priorInterestInclusions: decimal, priorPremiumDeductions: decimal, priorCarryforward: decimal,
    disposedDuringYear: z.boolean(),
    periods: z.array(z.object({ endDate: z.string(), qualifiedStatedInterest: decimal, amortization: decimal })),
  }).optional(),
  tipsDeflationFacts: z.object({
    allInstrumentInterestReportedHere: z.boolean(),
    priorInterestInclusions: decimal, priorOrdinaryLosses: decimal, priorCarryforward: decimal,
  }).optional(),
});
export const Form1099OIDSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const fields = ["payer", "sourceId", "taxYear", "sourceFormRevision", "sourceFactsConfirmed", "recipientAmountsConfirmed",
    "obligationType", "inflationIndexed", "description", "originalIssueDiscount", "otherPeriodicInterest", "earlyWithdrawalPenalty",
    "federalWithheld", "marketDiscount", "acquisitionPremium", "treasuryOID", "investmentExpenses", "bondPremium", "taxExemptOID",
    "stateWithholding", "oidReportedNetOfAcquisitionPremium", "interestReportedNetOfBondPremium"];
  return { ...raw, sourceFactsComplete: raw.sourceFactsComplete !== false && fields.every((field) => raw[field] !== undefined) };
}, Form1099OIDFieldsSchema);
export type Form1099OID = z.infer<typeof Form1099OIDSchema>;

export const FormW2GSchema = z.object({
  payer: z.string(),
  payerTin: z.string().optional(), // Payer identification number for IL Schedule IL-WIT Column B auto-attachment
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse attribution on shared returns
  reportableWinnings: decimal, // Box 1
  typeOfWager: z.string().optional(), // Box 3 — e.g., "lottery", "slots", "poker", "horse_racing"
  prizeType: z.enum(["cash", "noncash", "mixed"]).default("cash"),
  federalWithheld: optionalDecimal, // Box 4
  stateWinnings: decimal.optional(), // Box 14 — state winnings for IL Schedule IL-WIT Column D
  stateWithheld: optionalDecimal, // Box 15 — state income tax withheld
  state: z.string().optional(), // Box 16 — state
  winningsCategory: z.enum([
    "other_gambling",
    "new_jersey_lottery",
    "multistate_nj_lottery",
    "out_of_state_lottery",
  ]).default("other_gambling"), // NJ uses the lottery category to exclude certain <=$10,000 prizes
});

export const Form1099KSchema = z.object({
  taxYear: z.number().int().optional(),
  pse: z.string(), // Payment Settlement Entity name (filer)
  statePayerNumber: z.string().optional(), // Box 7 — state payer number for IL Schedule IL-WIT Column B
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse on shared state returns
  grossAmount: decimal, // Box 1a — gross amount of payment card/third-party network transactions
  cashTips: reportedTipOrOvertimeAmount.optional(), // 2026 Box1c, included in Box1a gross amount.
  treasuryTippedOccupationCodes: reportedTippedOccupationCodes.optional(), // 2026 Box1d.
  cardNotPresent: optionalDecimal, // Box 1b — card not present transactions (subset of 1a)
  federalWithheld: optionalDecimal, // Box 4 — federal income tax withheld (backup withholding)
  stateWithheld: optionalDecimal, // Box 8 — state income tax withheld
  state: z.string().optional(), // Box 6 — state
  /** Income type for routing: which schedule this 1099-K income appears on */
  incomeType: z.enum(["business", "farm", "rental", "other"]).default("business"),
});

export const Form1099CSchema = z.object({
  creditor: z.string(),
  amountDischarged: decimal, // Box 2
  interestIncluded: optionalDecimal, // Box 3 — interest portion included in Box 2
  debtDescription: z.string().optional(), // Box 4
  personallyLiable: z.boolean().default(false), // Box 5
  identifiableEventCode: z.string().optional(), // Box 6 (A–H)
  fmvOfProperty: optionalDecimal, // Box 7
});

const EducationDistributionTransferSchema = z.object({
  kind: z.enum(["none", "qtp", "coverdell", "able", "roth", "refund_recontribution"]),
  amount: optionalDecimalInput,
  receivedDate: z.string().optional(),
  sameBeneficiary: z.boolean().optional(),
  eligibleFamilyMember: z.boolean().optional(),
  priorRolloverWithin12Months: z.boolean().optional(),
  destinationBeneficiaryAge: z.number().int().min(0).optional(),
  destinationSpecialNeeds: z.boolean().optional(),
  ableAnnualContributionLimit: optionalDecimalInput,
  otherAbleContributions: optionalDecimalInput,
  destinationAccountEligible: z.boolean().optional(),
  destinationAccountId: z.string().trim().min(1).optional(),
  accountOpenedDate: z.string().optional(),
  contributionsAndEarningsBeforeFiveYears: optionalDecimalInput,
  beneficiaryAgeAtYearEnd: z.number().int().min(0).optional(),
  beneficiaryTaxableCompensation: optionalDecimalInput,
  otherIraContributions: optionalDecimalInput,
  previousRothRollovers: optionalDecimalInput,
  refundSourceId: z.string().trim().min(1).optional(),
  refundDate: z.string().optional(),
  refundedExpenseAmount: optionalDecimalInput,
  coverdellTransferredBasis: optionalDecimalInput,
});
export const Form1099QSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const required = ["sourceId", "accountId", "beneficiaryId", "recipientOwner", "taxYear", "accountType", "grossDistribution", "isTrusteeToTrustee", "isQtpToRoth", "recipientNotBeneficiary", "sourceFactsConfirmed", "transfer"];
  if (raw.distributionCode === "2" || raw.distributionCode === "3") required.push("distributionDate", "returnedContributionId", "returnedContributionTaxYear", "returnedContributionDate", "returnedContributionOriginalAmount", "returnedContributionPrincipal", "returnedContributionNetIncome", "returnedContributionIncomePreviouslyReported", "returnedContributionNetIncomeConfirmed", "returnedContributionBasisReconciled");
  if (raw.distributionCode === "6") {
    required.push("prohibitedTransactionKind", "prohibitedTransactionDate", "prohibitedTransactionSourceReference", "prohibitedTransactionSourceConfirmed", "prohibitedTransactionBasis");
    if (raw.prohibitedTransactionKind === "account_disqualification") required.push("prohibitedTransactionJanuary1Value");
    if (raw.prohibitedTransactionKind === "pledged_portion") required.push("prohibitedTransactionPledgedAmount");
  }
  return { ...raw, sourceFactsComplete: raw.sourceFactsComplete !== false && required.every(field => raw[field] !== undefined) };
}, z.object({
  sourceFactsComplete: z.boolean().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  sourceId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  beneficiaryId: z.string().trim().min(1).optional(),
  recipientOwner: z.enum(["primary", "spouse", "other"]).optional(),
  /** Opaque source person link; required for a recipient outside this return. */
  recipientId: z.string().trim().min(1).optional(),
  taxYear: z.number().int().optional(),
  payerName: z.string().optional(),
  accountType: z.enum(["529", "coverdell_esa"]).default("529"), // Boxes5a/5b versus5c
  /** Actual distribution form; unknown is not an inferred cash payment. */
  distributionMedium: z.enum(["cash", "in_kind_prepaid_tuition"]).optional(),
  grossDistribution: decimal, // Box 1
  earnings: optionalDecimalInput, // Box2: an omitted Coverdell value is not zero
  basis: optionalDecimalInput, // Box3
  isTrusteeToTrustee: z.boolean().default(false), // Box4a
  isQtpToRoth: z.boolean().optional(), // Box4b
  recipientNotBeneficiary: z.boolean().optional(), // Box6
  distributionCode: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
  finalDistribution: z.boolean().optional(),
  distributionDate: z.string().optional(),
  /** Actual source confirmation when an annual statement contains several distributions. */
  allDistributionsAfterJuly42025: z.boolean().optional(),
  transfer: EducationDistributionTransferSchema.optional(),
  /** Actual custodian correction worksheet; omitted facts remain unknown. */
  returnedContributionId: z.string().trim().min(1).optional(),
  returnedContributionTaxYear: z.number().int().optional(),
  returnedContributionDate: z.string().optional(),
  returnedContributionOriginalAmount: optionalDecimalInput,
  returnedContributionPrincipal: optionalDecimalInput,
  returnedContributionNetIncome: optionalDecimalInput,
  returnedContributionIncomePreviouslyReported: optionalDecimalInput,
  returnedContributionNetIncomeConfirmed: z.boolean().optional(),
  returnedContributionBasisReconciled: z.boolean().optional(),
  /** Actual code6 event records; completeness does not enable unsupported tax treatment. */
  prohibitedTransactionKind: z.enum(["account_disqualification", "pledged_portion"]).optional(),
  prohibitedTransactionDate: z.string().optional(),
  prohibitedTransactionSourceReference: z.string().optional(),
  prohibitedTransactionSourceConfirmed: z.boolean().optional(),
  prohibitedTransactionJanuary1Value: optionalDecimalInput,
  prohibitedTransactionBasis: optionalDecimalInput,
  prohibitedTransactionPledgedAmount: optionalDecimalInput,
  /** Actual beneficiary total includes qualifying QTP contributions under530(b)(2)(B). */
  prohibitedTransactionQualifiedEducationExpenses: optionalDecimalInput,
  /** Full-year source review, covering interest, dividends and realized gains/losses after January1. */
  prohibitedTransactionNoPostDisqualificationActivityConfirmed: z.boolean().optional(),
  prohibitedTransactionPostDisqualificationSourceReference: z.string().optional(),
}));

const EducationDistributionExpenseSchema = z.object({
  id: z.string().trim().min(1), beneficiaryId: z.string().trim().min(1),
  category: z.enum(["postsecondary_tuition", "postsecondary_books", "postsecondary_special_needs", "postsecondary_room_board", "postsecondary_computer", "k12_tuition", "k12_curriculum", "k12_books", "k12_online", "k12_tutoring", "k12_testing", "k12_dual_enrollment", "k12_disability_therapy", "coverdell_k12_other", "qtp_contribution", "apprenticeship", "student_loan", "credential_enrollment", "credential_testing", "credential_continuing_education"]),
  paidDate: z.string().optional(),
  amount: optionalDecimalInput, refundedAmount: optionalDecimalInput,
  taxFreeAssistance: optionalDecimalInput, educationCreditAmount: optionalDecimalInput,
  otherTaxBenefitAmount: optionalDecimalInput,
  qualificationConfirmed: z.boolean().optional(),
  halfTimeStudent: z.boolean().optional(), roomBoardAllowance: optionalDecimalInput,
  schoolOwnedHousingCharge: optionalDecimalInput,
  tutorUnrelated: z.boolean().optional(), tutoringOutsideHome: z.boolean().optional(), tutorQualified: z.boolean().optional(),
  studentHasDisability: z.boolean().optional(), providerLicensedOrAccredited: z.boolean().optional(),
  credentialRecognized: z.boolean().optional(), requiredForCredential: z.boolean().optional(),
  destinationAccountId: z.string().trim().min(1).optional(),
  borrowerId: z.string().trim().min(1).optional(), beneficiaryOrSibling: z.boolean().optional(),
  studentLoanInterestAmount: optionalDecimalInput, studentLoanInterestDeducted: optionalDecimalInput,
});
const EducationDistributionSourceFactsSchema = z.object({
  taxYear: z.number().int().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allDistributionsReconciled: z.boolean().optional(),
  exceptionsDistinctFromCreditConfirmed: z.boolean().optional(),
  beneficiaries: z.array(z.object({
    id: z.string().trim().min(1), name: z.string().optional(),
    studentTaxId: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/).optional(),
    outsideK12QualifiedDistributions: optionalDecimalInput,
  })).max(100).optional(),
  expenses: z.array(EducationDistributionExpenseSchema).max(500).optional(),
  allocations: z.array(z.object({
    expenseId: z.string().trim().min(1), sourceId: z.string().trim().min(1),
    /** Actual expense allocation after all reductions, before category caps. */
    amount: optionalDecimalInput,
    /** Distinct portion of this expense taken into account for an education credit. */
    creditAmount: optionalDecimalInput,
    /** Actual interest portion of this loan-payment allocation, before statutory caps. */
    loanInterestAmount: optionalDecimalInput,
  })).max(1000).optional(),
  /** Actual benefits provided by prepaid QTP statements, separate from elected tax allocations. */
  inKindBenefits: z.array(z.object({
    id: z.string().trim().min(1), sourceId: z.string().trim().min(1), expenseId: z.string().trim().min(1),
    amount: optionalDecimalInput, providedDate: z.string().optional(),
    qualificationConfirmed: z.boolean().optional(), sourceReference: z.string().trim().optional(),
  })).max(500).optional(),
  loanBorrowers: z.array(z.object({
    id: z.string().trim().min(1), owner: z.enum(["primary", "spouse", "other"]).optional(),
    priorQualifiedDistributions: optionalDecimalInput,
    otherCurrentQualifiedDistributions: optionalDecimalInput,
  })).max(100).optional(),
  coverdellAccounts: z.array(z.object({
    accountId: z.string().trim().min(1), priorYearBasis: optionalDecimalInput,
    currentYearContributions: optionalDecimalInput, yearEndValue: optionalDecimalInput,
    outstandingRollovers: optionalDecimalInput,
    /** Actual basis received in rollovers, not their gross value. Explicit zero when none. */
    rolloverBasisReceived: optionalDecimalInput,
  })).max(100).optional(),
  penaltyExceptions: z.array(z.object({
    id: z.string().trim().min(1), sourceId: z.string().trim().min(1),
    kind: z.enum(["scholarship", "military_academy", "death", "disability"]),
    qualifyingAmount: optionalDecimalInput, distributionAmount: optionalDecimalInput,
    eligibilityConfirmed: z.boolean().optional(), eventDate: z.string().optional(),
    paidToBeneficiaryOrEstate: z.boolean().optional(),
  })).max(500).optional(),
});

/** Qualified education expense summary for Form 1099-Q distribution taxation */
export const QualifiedEducationExpenseSummarySchema = z.object({
  /** Total qualified education expenses paid during the year for the beneficiary */
  totalQualifiedExpenses: optionalDecimalInput,
  /** Tax-free educational assistance: scholarships, grants, employer assistance, etc. */
  taxFreeEducationalAssistance: optionalDecimalInput,
  /** Amounts used to claim AOTC or LLC on Form 8863 */
  amountsUsedForEducationCredits: optionalDecimalInput,
  /** Penalty exception: scholarship/grant amount that exempts earnings from 10% penalty */
  penaltyExceptionScholarshipAmount: optionalDecimalInput,
  /** Penalty exception: beneficiary died */
  penaltyExceptionDeath: z.boolean().optional(),
  /** Penalty exception: beneficiary became disabled */
  penaltyExceptionDisability: z.boolean().optional(),
  /** Penalty exception: cost of attendance at US military academy */
  penaltyExceptionMilitaryAcademyAmount: optionalDecimalInput,
  sourceFacts: EducationDistributionSourceFactsSchema.optional(),
});

/** COD exclusion under IRC §108 — filed on Form 982 */
export const CodExclusionSchema = z.object({
  /** IRC §108(a)(1)(A): debt discharged in a title 11 bankruptcy case */
  bankruptcy: z.boolean().default(false),
  /** IRC §108(a)(1)(B): insolvency — total liabilities and assets immediately before discharge */
  insolvency: z
    .object({
      totalLiabilities: decimal,
      totalAssets: decimal,
    })
    .optional(),
  /** IRC §108(a)(1)(E): qualified principal residence indebtedness (through 12/31/2025) */
  qualifiedPrincipalResidence: z
    .object({
      dischargedAmount: decimal,
    })
    .optional(),
  /** IRC §108(a)(1)(C): qualified farm indebtedness */
  qualifiedFarmExclusion: optionalDecimal,
  /** IRC §108(a)(1)(D): qualified real property business indebtedness */
  qualifiedRealPropertyBusinessExclusion: optionalDecimal,

  // ── Form 982 Part II — tax attribute reduction inputs ──────────

  /** IRC §108(b)(5) election: reduce basis of depreciable property first,
   *  before other tax attributes. Applies only to bankruptcy/insolvency exclusions. */
  electBasisReductionFirst: z.boolean().default(false),
  /** Aggregate adjusted basis of all property held at the beginning of the tax
   *  year following the discharge year, for the §1017 general basis reduction. */
  aggregateBasisOfProperty: optionalDecimal,
  /** Adjusted basis of depreciable property, for §108(b)(5) election. */
  basisOfDepreciableProperty: optionalDecimal,
  /** Adjusted basis of principal residence, for qualified principal residence
   *  exclusion basis-only reduction under §108(h)(1). */
  basisOfPrincipalResidence: optionalDecimal,
  /** Adjusted basis of depreciable real property, for qualified real property
   *  business exclusion basis-only reduction under §108(c)(1)(A). */
  basisOfDepreciableRealProperty: optionalDecimal,
});

export const Form1099RSchema = z.object({
  taxYear: z.number().int().optional(), // Preserve actual source year; ordinary basis binding requires an exact match.
  trumpAccount: z.boolean().optional(), // Actual2026 Box7c; absence is unknown.
  excessContributionEarnings: decimal.optional(), // Actual2026 Box7d; retain known zero separately from absence.
  payer: z.string(),
  payerTin: z.string().optional(), // Payer TIN shown on the recipient copy; required for IL Schedule IL-WIT Column B auto-attachment
  accountReference: z.string().trim().min(1).optional(), // Actual local account identity; never inferred from payer or statement order.
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse IRA ownership on shared returns
  grossDistribution: decimal, // Box 1
  taxableAmount: decimal.optional(), // Box 2a
  taxableAmountNotDetermined: z.boolean().default(false), // Box 2b checkbox
  eligibleGovernmental457bPlan: z.boolean().default(false), // Validated eligible governmental section 457(b) distribution for Form 5329 defaulting
  eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: optionalDecimal, // Taxable portion attributable to prior qualified-plan transfers that can still stay on Form 5329 Part I
  rothConversionAmount: optionalDecimal, // Validated net amount converted from a traditional/SEP/SIMPLE IRA to a Roth IRA
  rothContributionOrConversionMadeBefore2021: z.boolean().default(false), // Validated code T safe harbor for tax year 2025
  qualifiedRothDistribution: z.boolean().default(false), // Validated qualified Roth distribution support for Roth IRA Box 7 code J/T or designated Roth account Box 7 code B records
  qualifiedJointSurvivorAnnuity: z.boolean().default(false), // PA Schedule SP: beneficiary survivor-annuity benefit reported with Box 7 code 7 instead of code 4
  rothIraRolledOverAmount: optionalDecimal, // Validated Roth IRA amount rolled over to another Roth IRA for Form 8606 Line 19 exclusion support
  returnedContributionByDueDate: z.boolean().default(false), // Current-year IRA contribution returned by due date; Box 2a is taxable earnings only
  excessContributionReturnedWithoutEarnings: z.boolean().default(false), // Traditional IRA excess contribution returned after the due date with no earnings
  qualifiedCharitableDistribution: optionalDecimal, // Excludable QCD amount routed to charity from an IRA
  federalWithheld: optionalDecimal, // Box 4
  stateWithheld: optionalDecimal, // Box 14
  stateTaxWithheld: optionalDecimal, // State withholding carried to NY IT-1099-R / IT-201 line 72
  state: z.string().optional(), // Box 15 / State code or name for state withholding
  stateDistribution: optionalDecimal, // Box 16 — required for IL Schedule IL-WIT Column D auto-attachment
  localTaxWithheld: optionalDecimal, // Engine-modeled school district withholding / Local withholding carried to NYC or Yonkers lines 73/74
  locality: z.string().optional(), // Locality name for local withholding
  employeeContributions: optionalDecimal, // Box 5
  simplifiedMethodCostInPlan: decimal.optional(), // Simplified Method worksheet line 1
  simplifiedMethodPlanIdentifier: z.string().trim().min(1).optional(), // Validated identifier for a specific annuity contract when one payer issues multiple Simplified Method plans
  simplifiedMethodExpectedPayments: z.number().int().positive().optional(), // Simplified Method worksheet line 3
  simplifiedMethodAnnuityStartingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // Simplified Method annuity starting date
  simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: z.number().int().min(0).max(120).optional(), // Simplified Method age used for Table 1
  simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: z.number().int().min(0).max(120).optional(), // Simplified Method combined-age Table 2 input for 1998+ joint-life annuities
  simplifiedMethodPaymentsReceivedThisYear: z.number().int().min(0).optional(), // Simplified Method worksheet line 5
  simplifiedMethodPriorYearRecovered: decimal.optional(), // Simplified Method worksheet line 6
  retiredPublicSafetyOfficerInsurancePremiums: optionalDecimal, // Validated accident, health, or long-term care premiums paid directly from an eligible retirement plan
  distributionCode: z.string().optional(), // Box 7
  distributionDate: z.string().optional(), // Validated actual distribution date used for Form 5329 exception-12 age tests
  separationFromServiceAfterAge55ExceptionApplies: z.boolean().default(false), // Validated Form 5329 exception 01 for a non-IRA qualified-plan code 1 distribution
  qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: z.boolean().default(false), // Validated Form 5329 exception 01 for qualified public safety employees or private-sector firefighters on supported non-IRA code 1 distributions
  qualifiedDomesticRelationsOrderExceptionApplies: z.boolean().default(false), // Validated Form 5329 exception 06 for a non-IRA qualified-plan distribution paid under a QDRO
  terminalIllnessExceptionApplies: z.boolean().default(false), // Validated Form 5329 exception 20 for a non-IRA qualified-plan code 1 distribution made to a terminally ill individual
  iraSepSimple: z.boolean().default(false), // IRA/SEP/SIMPLE checkbox
  disabilityPensionBeforeMinimumRetirementAge: z.boolean().default(false), // Validated Form 1040 Line 1 reroute for code 3 disability pensions
  militaryPensionOrSurvivorBenefit: z.boolean().default(false), // Validated NJ exclusion for U.S. military pensions and survivor benefits
}).superRefine((value, ctx) => {
  const distributionCodes = getNormalizedDistributionCodes(value.distributionCode);
  const hasAnySimplifiedMethodInput =
    value.simplifiedMethodCostInPlan !== undefined
    || value.simplifiedMethodExpectedPayments !== undefined
    || value.simplifiedMethodAnnuityStartingDate !== undefined
    || value.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate !== undefined
    || value.simplifiedMethodSecondaryAnnuitantAgeAtStartingDate !== undefined
    || value.simplifiedMethodPaymentsReceivedThisYear !== undefined
    || value.simplifiedMethodPriorYearRecovered !== undefined;

  if (value.disabilityPensionBeforeMinimumRetirementAge && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R disability pensions taxed as wages must be non-IRA distributions",
      path: ["disabilityPensionBeforeMinimumRetirementAge"],
    });
  }

  if (
    value.disabilityPensionBeforeMinimumRetirementAge
    && (!value.distributionCode || !value.distributionCode.toUpperCase().includes("3"))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R disability pensions taxed as wages should use Box 7 code 3",
      path: ["distributionCode"],
    });
  }

  if (d(value.rothConversionAmount).greaterThan(0) && !value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R Roth conversion amounts are only supported for IRA/SEP/SIMPLE distributions",
      path: ["rothConversionAmount"],
    });
  }

  if (d(value.retiredPublicSafetyOfficerInsurancePremiums).greaterThan(0) && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Retired public safety officer premium support is only available for non-IRA Form 1099-R distributions",
      path: ["retiredPublicSafetyOfficerInsurancePremiums"],
    });
  }

  const hasSeparationFromServiceExceptionMetadata =
    value.separationFromServiceAfterAge55ExceptionApplies
    || value.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies;

  if (hasSeparationFromServiceExceptionMetadata && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R separation-from-service exception support is only available for non-IRA qualified-plan distributions",
      path: value.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
        ? ["qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies"]
        : ["separationFromServiceAfterAge55ExceptionApplies"],
    });
  }

  if (
    hasSeparationFromServiceExceptionMetadata
    && (!value.distributionCode || !value.distributionCode.toUpperCase().includes("1"))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R separation-from-service exception support currently requires Box 7 code 1",
      path: ["distributionCode"],
    });
  }

  if (hasSeparationFromServiceExceptionMetadata && value.eligibleGovernmental457bPlan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R separation-from-service exception support does not apply to eligible governmental section 457(b) distributions",
      path: value.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
        ? ["qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies"]
        : ["separationFromServiceAfterAge55ExceptionApplies"],
    });
  }

  if (value.qualifiedDomesticRelationsOrderExceptionApplies && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R QDRO exception support is only available for non-IRA qualified-plan distributions",
      path: ["qualifiedDomesticRelationsOrderExceptionApplies"],
    });
  }

  if (value.qualifiedDomesticRelationsOrderExceptionApplies && value.eligibleGovernmental457bPlan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R QDRO exception support does not apply to eligible governmental section 457(b) distributions",
      path: ["qualifiedDomesticRelationsOrderExceptionApplies"],
    });
  }

  if (
    value.qualifiedDomesticRelationsOrderExceptionApplies
    && (!value.distributionCode || !value.distributionCode.toUpperCase().includes("1"))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R QDRO exception support currently requires Box 7 code 1",
      path: ["distributionCode"],
    });
  }

  if (value.terminalIllnessExceptionApplies && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R terminal-illness exception support is only available for non-IRA qualified-plan distributions",
      path: ["terminalIllnessExceptionApplies"],
    });
  }

  if (value.terminalIllnessExceptionApplies && value.eligibleGovernmental457bPlan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R terminal-illness exception support does not apply to eligible governmental section 457(b) distributions",
      path: ["terminalIllnessExceptionApplies"],
    });
  }

  if (
    value.terminalIllnessExceptionApplies
    && (!value.distributionCode || !value.distributionCode.toUpperCase().includes("1"))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R terminal-illness exception support currently requires Box 7 code 1",
      path: ["distributionCode"],
    });
  }

  if (value.eligibleGovernmental457bPlan && value.iraSepSimple) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Eligible governmental section 457(b) support is only available for non-IRA Forms 1099-R",
      path: ["eligibleGovernmental457bPlan"],
    });
  }

  if (
    d(value.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount).greaterThan(0)
    && !value.eligibleGovernmental457bPlan
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A transferred qualified-plan taxable amount requires the eligible governmental section 457(b) flag",
      path: ["eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount"],
    });
  }

  if (
    d(value.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount).greaterThan(d(value.grossDistribution))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The governmental 457(b) transferred qualified-plan taxable amount cannot exceed the gross distribution",
      path: ["eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount"],
    });
  }

  if (d(value.rothConversionAmount).greaterThan(d(value.grossDistribution))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R Roth conversion amounts cannot exceed the gross distribution",
      path: ["rothConversionAmount"],
    });
  }

  if (
    d(value.rothIraRolledOverAmount).greaterThan(0)
    && !distributionCodes.includes("J")
    && !distributionCodes.includes("Q")
    && !distributionCodes.includes("T")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Validated Roth IRA rollover support currently requires a Roth IRA Box 7 code J, Q, or T record",
      path: ["rothIraRolledOverAmount"],
    });
  }

  if (d(value.rothIraRolledOverAmount).greaterThan(d(value.grossDistribution))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Validated Roth IRA rollover amounts cannot exceed the gross distribution",
      path: ["rothIraRolledOverAmount"],
    });
  }

  for (const code of distributionCodes) {
    if (ROTH_CODE_WITHOUT_COMPANIONS.has(code) && distributionCodes.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Form 1099-R Box 7 Code ${code} cannot be combined with any other distribution code`,
        path: ["distributionCode"],
      });
    }
  }

  if (distributionCodes.includes("J")) {
    const invalidCompanions = distributionCodes.filter(
      (code) => code !== "J" && !CODE_J_ALLOWED_COMPANIONS.has(code)
    );

    if (invalidCompanions.length > 0 || distributionCodes.length > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Box 7 Code J can only be combined with Code 8, P, or S",
        path: ["distributionCode"],
      });
    }
  }

  if (
    value.qualifiedRothDistribution
    && !distributionCodes.includes("J")
    && !distributionCodes.includes("T")
    && !distributionCodes.includes("B")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Validated qualified Roth distribution support currently requires a Roth IRA Box 7 code J or code T record, or a designated Roth account Box 7 code B record",
      path: ["qualifiedRothDistribution"],
    });
  }

  if (
    value.qualifiedRothDistribution
    && distributionCodes.includes("J")
    && distributionCodes.some((code) => code !== "J")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Validated qualified Roth distribution support for Box 7 code J currently requires a standalone Box 7 code J record",
      path: ["qualifiedRothDistribution"],
    });
  }

  if (
    value.qualifiedJointSurvivorAnnuity
    && !distributionCodes.includes("7")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "PA qualified joint survivor annuity support currently requires a Form 1099-R Box 7 code 7 record",
      path: ["distributionCode"],
    });
  }

  if (distributionCodes.includes("S") && distributionCodes.length > 1 && !distributionCodes.includes("J")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-R Box 7 Code S can only be combined with Code J in the supported parser",
      path: ["distributionCode"],
    });
  }

  if (distributionCodes.includes("Y")) {
    const invalidCompanions = distributionCodes.filter(
      (code) => code !== "Y" && !CODE_Y_ALLOWED_COMPANIONS.has(code)
    );

    if (invalidCompanions.length > 0 || distributionCodes.length !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Box 7 Code Y can only be combined with Code 4, 7, or K",
        path: ["distributionCode"],
      });
    }
  }

  if (hasAnySimplifiedMethodInput) {
    if (value.iraSepSimple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method basis recovery is only supported for non-IRA distributions",
        path: ["simplifiedMethodCostInPlan"],
      });
    }

    if (value.simplifiedMethodCostInPlan === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method cost in the plan is required when any Simplified Method input is present",
        path: ["simplifiedMethodCostInPlan"],
      });
    }

    const simplifiedMethodAnnuityStartingDateTime =
      value.simplifiedMethodAnnuityStartingDate === undefined
        ? undefined
        : new Date(`${value.simplifiedMethodAnnuityStartingDate}T00:00:00Z`).getTime();
    const hasSupportedSimplifiedMethodAnnuityStartingDate =
      simplifiedMethodAnnuityStartingDateTime === undefined
      || simplifiedMethodAnnuityStartingDateTime >= Date.UTC(1986, 6, 2);

    if (
      simplifiedMethodAnnuityStartingDateTime !== undefined
      && !hasSupportedSimplifiedMethodAnnuityStartingDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method is only supported for annuity starting dates on or after July 2, 1986; earlier dates must use the General Rule",
        path: ["simplifiedMethodAnnuityStartingDate"],
      });
    }

    const hasSupportedExpectedPaymentDerivationInputs =
      value.simplifiedMethodAnnuityStartingDate !== undefined
      && value.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate !== undefined
      && hasSupportedSimplifiedMethodAnnuityStartingDate;

    if (value.simplifiedMethodExpectedPayments === undefined && !hasSupportedExpectedPaymentDerivationInputs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method expected payments are required unless the annuity starting date and primary annuitant age at starting date are provided for supported IRS-table derivation",
        path: ["simplifiedMethodExpectedPayments"],
      });
    }

    if (value.simplifiedMethodPaymentsReceivedThisYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method current-year payments received are required when any Simplified Method input is present",
        path: ["simplifiedMethodPaymentsReceivedThisYear"],
      });
    }

    if (value.simplifiedMethodCostInPlan !== undefined && d(value.simplifiedMethodCostInPlan).lessThan(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method cost in the plan cannot be negative",
        path: ["simplifiedMethodCostInPlan"],
      });
    }

    if (
      value.simplifiedMethodPriorYearRecovered !== undefined
      && d(value.simplifiedMethodPriorYearRecovered).lessThan(0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Form 1099-R Simplified Method prior-year recovery cannot be negative",
        path: ["simplifiedMethodPriorYearRecovered"],
      });
    }
  }
});

function getNormalizedDistributionCodes(code?: string): string[] {
  if (!code) {
    return [];
  }

  return [...new Set(code.toUpperCase().replace(/\s+/g, "").split("").filter(Boolean))];
}

export const Form1099SASchema = z.object({
  payer: z.string(),
  grossDistribution: decimal, // Box 1
  earningsOnExcessContributions: optionalDecimalInput, // Box 2; unknown is distinct from actual zero.
  distributionCode: z.enum(["1", "2", "3", "4", "5", "6"]), // Box 3
  fmvOnDateOfDeath: decimal.optional(), // Box 4
  trusteeToTrusteeTransfer: z.boolean().optional(), // Local extraction guardrail: direct HSA/MSA transfers are not reported on Form 1099-SA
  beneficiaryRole: z.enum(["surviving_spouse", "other_beneficiary", "estate"]).optional(),
  deathDistributionTiming: z.enum(["year_of_death", "after_year_of_death"]).optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for taxpayer vs spouse HSA attribution
  accountType: z.enum(["hsa", "archer_msa", "ma_msa"]).default("hsa"), // Box 5 checkbox
}).superRefine((value, ctx) => {
  if (value.trusteeToTrusteeTransfer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Trustee-to-trustee transfers are not reported on Form 1099-SA and do not belong on Form 8889 line 14a",
      path: ["trusteeToTrusteeTransfer"],
    });
  }

  if ((value.distributionCode === "4" || value.distributionCode === "6") && value.fmvOnDateOfDeath === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Box 4 fair market value on date of death is required for Form 1099-SA Box 3 codes 4 and 6",
      path: ["fmvOnDateOfDeath"],
    });
  }

  if (
    value.fmvOnDateOfDeath !== undefined
    && value.distributionCode !== "4"
    && value.distributionCode !== "6"
    && !(
      value.distributionCode === "1"
      && value.beneficiaryRole === "surviving_spouse"
      && value.deathDistributionTiming === "after_year_of_death"
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 1099-SA Box 4 fair market value on date of death is only allowed for Box 3 codes 4 and 6, or for an after-year-of-death surviving spouse code 1 record",
      path: ["fmvOnDateOfDeath"],
    });
  }

  if (value.deathDistributionTiming === "year_of_death" && value.distributionCode !== "4") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Year-of-death HSA beneficiary distributions must use Form 1099-SA Box 3 code 4",
      path: ["distributionCode"],
    });
  }

  if (value.distributionCode === "6" && value.beneficiaryRole === "surviving_spouse") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Surviving spouse HSA beneficiaries should use code 1 after the year of death, not Form 1099-SA Box 3 code 6",
      path: ["beneficiaryRole"],
    });
  }

  if (
    (value.beneficiaryRole === "other_beneficiary" || value.beneficiaryRole === "estate")
    && value.distributionCode !== "4"
    && value.distributionCode !== "6"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Nonspouse beneficiary and estate HSA records must use Form 1099-SA Box 3 death-distribution codes 4 or 6",
      path: ["beneficiaryRole"],
    });
  }

  if (value.beneficiaryRole === "estate" && value.distributionCode === "6") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Estate HSA beneficiary distributions must use Form 1099-SA Box 3 code 4, not code 6",
      path: ["distributionCode"],
    });
  }

  if (
    value.deathDistributionTiming === "after_year_of_death"
    && value.beneficiaryRole === "other_beneficiary"
    && value.distributionCode !== "6"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "After-year-of-death nonspouse HSA beneficiary distributions must use Form 1099-SA Box 3 code 6",
      path: ["distributionCode"],
    });
  }

  if (
    value.deathDistributionTiming === "after_year_of_death"
    && value.beneficiaryRole === "estate"
    && value.distributionCode !== "4"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "After-year-of-death estate HSA beneficiary distributions must use Form 1099-SA Box 3 code 4",
      path: ["distributionCode"],
    });
  }

  if (
    value.deathDistributionTiming === "after_year_of_death"
    && value.beneficiaryRole === "surviving_spouse"
    && value.distributionCode === "4"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "After the year of death, surviving spouse HSA beneficiaries should use the spouse-owned ordinary distribution path instead of Form 1099-SA Box 3 code 4",
      path: ["distributionCode"],
    });
  }

  // Beneficiary relationship is to the decedent, not a primary/spouse position
  // on this return. The surviving beneficiary can be either actual return owner.
});

export const FormSSA1099Schema = z.object({
  recipient: z.string().optional(),
  netBenefits: decimal, // Box 5
  federalWithheld: optionalDecimal, // Box 6
});

export const SocialSecurityFactsSchema = z.object({
  puertoRicoIncomeExclusion: decimal.pipe(z.string().refine(value => d(value).gte(0), "Must be nonnegative")).optional(),
  americanSamoaIncomeExclusion: decimal.pipe(z.string().refine(value => d(value).gte(0), "Must be nonnegative")).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
});

export const FormRRB1099Schema = z.object({
  recipient: z.string().optional(),
  netSocialSecurityEquivalentBenefitPortion: decimal, // Box 5
  federalWithheld: optionalDecimal, // Box 10
});

export const SocialSecurityLumpSumElectionYearSchema = z.object({
  taxYear: z.number().int().min(1994), // Supported slice covers Pub. 915 post-1993 worksheets only
  filingStatus: FilingStatusSchema,
  livedWithSpouseAtAnyTimeDuringYear: z.boolean().optional(),
  benefitsReceivedInEarlierYear: decimal,
  delayedBenefitsReceivedInCurrentYear: decimal,
  adjustedGrossIncome: decimal,
  taxExemptInterest: optionalDecimal,
  exclusionsAdjustments: optionalDecimal,
  taxableBenefitsPreviouslyReported: decimal,
});

export const SocialSecurityLumpSumElectionSchema = z.object({
  currentYearExclusionsAdjustments: optionalDecimal,
  earlierYears: z.array(SocialSecurityLumpSumElectionYearSchema).min(1),
});

export const Form8606Schema = z.object({
  nondeductibleContributions: optionalDecimal, // Line 1
  qualifiedReservistDistributionRepayments: optionalDecimal, // Line 1 addition for qualified reservist distribution repayments
  priorYearBasis: optionalDecimal, // Line 2
  contributionsMadeNextYear: optionalDecimal, // Line 4
  yearEndValue: decimal, // Line 6 before adding outstanding rollovers
  outstandingRollovers: optionalDecimal, // Line 6 addback for outstanding rollovers
  currentYearRepaymentsTreatedAsRollovers: optionalDecimal, // Line 6 reduction for same-year qualifying repayments
  traditionalDistributions: optionalDecimal, // Gross non-conversion distributions before Line 7 exclusions
  qualifiedCharitableDistributions: optionalDecimal, // QCD amount excluded from Line 7
  rolledOverDistributions: optionalDecimal, // Line 7 exclusion for rollover distributions
  returnedContributionsByDueDate: optionalDecimal, // Line 7 exclusion for current-year IRA contributions returned by the due date
  returnedExcessContributions: optionalDecimal, // Line 7 exclusion for returned excess traditional IRA contributions
  qualifiedHsaFundingDistributions: optionalDecimal, // Line 7 exclusion for the one-time HSA funding distribution
  qualifiedDisasterDistributions: optionalDecimal, // Line 15b proportional exclusion
  repaymentEligibleDistributions: optionalDecimal, // Line 15c worksheet line 3a qualifying distributions
  repaymentDistributionExceptionNumber: z.string().regex(/^(19|20|22|23|99)$/).optional(), // Line 15c worksheet downstream Form 5329 exception number trace
  repaymentWithin3YearWindow: optionalDecimal, // Line 15c worksheet line 3d repayments
  priorYearLine15cBasisAdjustment: optionalDecimal, // Prior-year worksheet line 6 added to Line 14
  rothConversions: optionalDecimal, // Line 8
  rothDistributions: optionalDecimal, // Line 19
  qualifiedRothDistributionsExcludedFromLine19: optionalDecimal, // Line 19 exclusion for qualified Roth distributions not entered in Part III
  rothRolledOverDistributions: optionalDecimal, // Line 19 exclusion for Roth IRA distributions rolled over or converted outside Part III
  rothReturnedContributionsByDueDate: optionalDecimal, // Line 19 exclusion for Roth IRA contributions returned by the due date
  rothReturnedExcessContributions: optionalDecimal, // Line 19 exclusion for returned Roth excess contributions
  rothQualifiedHsaFundingDistributions: optionalDecimal, // Line 19 exclusion for one-time Roth IRA qualified HSA funding distributions
  qualifiedFirstTimeHomebuyerExpenses: optionalDecimal, // Line 20
  priorQualifiedFirstTimeHomebuyerDistributions: optionalDecimal, // Line 20 lifetime-limit reduction
  rothContributionBasis: optionalDecimal, // Line 22 worksheet result before prior-year Line 25c adjustment (backward compatible single value)
  rothContributionBasisByYear: z.array(z.object({
    year: z.number().int().min(1998), // Year of regular Roth IRA contribution (Roth IRAs available from 1998)
    contributionAmount: decimal, // Original regular Roth IRA contribution amount for this year
    previouslyWithdrawnTaxFree: optionalDecimal, // Cumulative contribution basis already recovered in prior-year distributions
  })).optional(), // Line 22 per-year chart; when provided, takes precedence over rothContributionBasis
  priorYearLine25cBasisAdjustment: optionalDecimal, // Prior-year Line 25c worksheet line 5 added to Line 22
  rothConversionBasis: optionalDecimal, // Line 24 chart result (single pre-computed value, backward compatible)
  rothConversionBasisByYear: z.array(z.object({
    year: z.number().int().min(1998), // Year of Roth conversion/rollover (Roth IRAs available from 1998)
    conversionAmount: decimal, // Column 2: original Roth conversion or qualified-plan rollover amount
    previouslyRecoveredTaxFree: optionalDecimal, // Column 3: cumulative basis already recovered in prior-year distributions
  })).optional(), // Line 24 per-year chart; when provided, takes precedence over rothConversionBasis
  rothQualifiedDisasterDistributions: optionalDecimal, // Line 25b proportional exclusion
  rothRepaymentEligibleDistributions: optionalDecimal, // Line 25c worksheet qualifying Roth IRA distributions
  rothRepaymentDistributionExceptionNumber: z.string().regex(/^(19|20|22|23|99)$/).optional(), // Line 25c worksheet downstream Form 5329 exception number trace
  rothRepaymentsWithin3YearWindow: optionalDecimal, // Line 25c worksheet repayments
});

export const Form8606ByOwnerSchema = z.object({
  primary: Form8606Schema.optional(),
  spouse: Form8606Schema.optional(),
});

export const Form5329HsaSourceSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  priorYearSourceTaxYear: z.number().int().optional(),
  priorYearExcessContributions: optionalDecimalInput,
  priorYearAdditionalTax: optionalDecimalInput,
  valueDec31: optionalDecimalInput,
  returnedExcessContributionsUnder9100Relief: optionalDecimalInput,
  returnedExcessContributionEarningsUnder9100Relief: optionalDecimalInput,
  reliefRequirementsConfirmed: z.boolean().optional(),
  excessEmployerContributionsAlreadyInWages: optionalDecimalInput,
});
export const Form5329HsaByOwnerSchema = z.object({
  primary: Form5329HsaSourceSchema.optional(),
  spouse: Form5329HsaSourceSchema.optional(),
});

export const Form5329Schema = z.object({
  earlyDistributionsIncludedInIncome: optionalDecimal, // Part I Line 1
  rothConversionRecaptureAmount: optionalDecimal, // Part I Line 1 Roth conversion or qualified-plan rollover recapture amount
  distributionsNotSubjectToAdditionalTax: optionalDecimal, // Part I Line 2
  distributionExceptionNumber: z.string().regex(/^(0[1-9]|1[0-9]|2[0-3]|99)$/).optional(), // Part I Line 2 exception number for tax year 2025
  substantiallyEqualPeriodicPaymentsExceptionAmount: optionalDecimal, // Part I Line 2 exception 02 validated substantially equal periodic payments amount
  deathDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 04 validated death-distribution amount
  qualifiedDomesticRelationsOrderDistributionAmount: optionalDecimal, // Part I Line 2 exception 06 validated QDRO alternate-payee distribution amount
  medicalExpenseExceptionAmount: optionalDecimal, // Part I Line 2 exception 05 validated deductible unreimbursed medical-expense amount above 7.5% of AGI
  unemployedHealthInsurancePremiumExceptionAmount: optionalDecimal, // Part I Line 2 exception 07 validated IRA amount used to pay health insurance premiums while unemployed
  qualifiedHigherEducationExpenseExceptionAmount: optionalDecimal, // Part I Line 2 exception 08 validated IRA amount used for qualified higher education expenses
  qualifiedFirstTimeHomebuyerDistributionAmount: optionalDecimal, // Part I Line 2 exception 09 validated IRA amount used for a first home purchase
  priorQualifiedFirstTimeHomebuyerDistributions: optionalDecimal, // Part I Line 2 exception 09 prior qualified first-time homebuyer distributions used to compute the remaining lifetime cap
  irsLevyDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 10 validated qualified-plan distribution amount paid because of an IRS levy
  qualifiedReservistDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 11 validated qualified reservist distribution amount
  eligibleGovernmental457bDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 13 validated eligible governmental section 457(b) distribution amount not attributable to prior qualified-plan transfers
  pre1986EmployerPlanDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 14 validated certain-employer-plan distribution amount for employees separated before March 1, 1986 and in pay status as of March 1, 1986
  section404kDividendDistributionExceptionAmount: optionalDecimal, // Part I Line 2 exception 15 validated distribution of dividends paid with respect to stock described in section 404(k)
  section72qAnnuityExceptionAmount: optionalDecimal, // Part I Line 2 exception 16 validated distribution from an annuity contract under section 72(q)
  federalPhasedRetirementAnnuityExceptionAmount: optionalDecimal, // Part I Line 2 exception 17 validated distribution from a federal phased retirement annuity
  permissibleEacaWithdrawalExceptionAmount: optionalDecimal, // Part I Line 2 exception 18 validated permissible withdrawal from an eligible automatic contribution arrangement
  qualifiedBirthOrAdoptionExceptionAmount: optionalDecimal, // Part I Line 2 exception 19 validated qualified birth or adoption distribution amount
  terminalIllnessExceptionAmount: optionalDecimal, // Part I Line 2 exception 20 validated terminal-illness distribution amount
  returnedContributionByDueDateTaxableEarningsExceptionAmount: optionalDecimal, // Part I Line 2 exception 21 validated taxable earnings on current-year IRA contributions returned by the due date
  domesticAbuseExceptionAmount: optionalDecimal, // Part I Line 2 exception 22 validated domestic-abuse victim distribution amount
  emergencyPersonalExpenseExceptionAmount: optionalDecimal, // Part I Line 2 exception 23 validated emergency personal expense distribution amount
  supportedMedicalExpenseExceptionAmount: optionalDecimal, // Engine trace: deductible medical expenses from Schedule A Line 4 (exception 05)
  supportedDeathDistributionAmount: optionalDecimal, // Engine trace: taxable attached Form 1099-R Box 7 code 4 death distributions (exception 04)
  supportedTerminalIllnessDistributionAmount: optionalDecimal, // Engine trace: taxable attached non-IRA qualified-plan Form 1099-R Box 7 code 1 terminal-illness distributions (exception 20)
  simpleIRADistributionsWithinFirstTwoYears: optionalDecimal, // Part I Line 4 25% branch
  supportedSeparationFromServiceAfterAge55Amount: optionalDecimal, // Engine trace: non-IRA qualified-plan code 1 distributions eligible for Form 5329 exception 01
  supportedDisabilityDistributionAmount: optionalDecimal, // Engine trace: taxable disability distributions reported with Form 1099-R code 3 (exception 03)
  supportedQualifiedDomesticRelationsOrderDistributionAmount: optionalDecimal, // Engine trace: non-IRA qualified-plan code 1 distributions eligible for Form 5329 exception 06
  supportedIncorrectEarlyDistributionAge59AndHalfAmount: optionalDecimal, // Engine trace: Box 7 codes 1/J/S incorrectly indicating an early distribution after age 59 1/2 (exception 12)
  supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome: optionalDecimal, // Engine trace: Part I Line 1 qualified disaster recovery distributions that stay off Form 5329
  supportedEligibleGovernmental457bDistributionsExcludedFromLine1: optionalDecimal, // Engine trace: eligible governmental section 457(b) distributions kept off Part I except for transferred qualified-plan amounts
  supportedReturnedContributionByDueDateTaxableEarnings: optionalDecimal, // Engine trace: Line 1/2 exception 21 support from attached Form 1099-R
  supportedQualifiedFirstTimeHomebuyerDistribution: optionalDecimal, // Engine trace: Line 1/2 exception 09 support from Form 8606 Line 20
  supportedRepaymentEligibleTraditionalDistributionTaxableShare: optionalDecimal, // Engine trace: remaining taxable share of Form 8606 Line 15c worksheet distributions eligible for Form 5329 exceptions 19, 20, 22, or 23
  supportedRepaymentEligibleTraditionalDistributionExceptionNumber: z.string().regex(/^(19|20|22|23|99)$/).optional(), // Engine trace: supported Form 8606 Line 15c worksheet exception number
  supportedRepaymentEligibleRothDistributionTaxableShare: optionalDecimal, // Engine trace: remaining taxable share of Form 8606 Line 25c worksheet Roth distributions eligible for Form 5329 exceptions 19, 20, 22, or 23
  supportedRepaymentEligibleRothDistributionExceptionNumber: z.string().regex(/^(19|20|22|23|99)$/).optional(), // Engine trace: supported Form 8606 Line 25c worksheet exception number

  // Part II: Additional Tax on Certain Distributions From Education Accounts and ABLE Accounts (Lines 5-8)
  educationAccountDistributionsIncludedInIncome: optionalDecimal, // Part II Line 5 - taxable distributions from Coverdell ESAs, QTPs (529 plans), and ABLE accounts included in income
  educationAccountDistributionsExcepted: optionalDecimal, // Part II Line 6 - distributions excepted from additional tax (death, disability, scholarship, military academy, returned excess)

  // Part III: Additional Tax on Excess Contributions to Traditional IRAs (Lines 9-17)
  traditionalIRAPriorYearExcessContributions: optionalDecimal, // Part III Line 9 - prior-year Form 5329 Line 16
  traditionalIRAContributionRoom: optionalDecimal, // Part III Line 10 - unused contribution room (max allowable minus actual contributions)
  traditionalIRADistributionsIncludedInIncome: optionalDecimal, // Part III Line 11 - 2025 distributions included in income
  traditionalIRAPriorYearExcessReturned: optionalDecimal, // Part III Line 12 - prior-year excess contributions returned in 2025
  traditionalIRACurrentYearExcessContributions: optionalDecimal, // Part III Line 15 - current-year excess contributions
  traditionalIRAValueDec31: optionalDecimal, // Part III Line 17 - value of traditional IRAs on December 31, 2025

  // Part IV: Additional Tax on Excess Contributions to Roth IRAs (Lines 18-25)
  rothIRAPriorYearExcessContributions: optionalDecimal, // Part IV Line 18 - prior-year Form 5329 Line 24
  rothIRAContributionRoom: optionalDecimal, // Part IV Line 19 - unused Roth contribution room
  rothIRADistributions: optionalDecimal, // Part IV Line 20 - 2025 Roth IRA distributions
  rothIRACurrentYearExcessContributions: optionalDecimal, // Part IV Line 23 - current-year Roth excess contributions
  rothIRAValueDec31: optionalDecimal, // Part IV Line 25 - value of Roth IRAs on December 31, 2025

  // Part V: Additional Tax on Excess Contributions to Coverdell ESAs (Lines 26-33)
  coverdellESAPriorYearExcessContributions: optionalDecimal, // Part V Line 26 - prior-year Form 5329 Line 32
  coverdellESAContributionRoom: optionalDecimal, // Part V Line 27 - unused Coverdell ESA contribution room ($2,000/beneficiary minus actual)
  coverdellESADistributions: optionalDecimal, // Part V Line 28 - 2025 Coverdell ESA distributions
  coverdellESACurrentYearExcessContributions: optionalDecimal, // Part V Line 31 - current-year Coverdell ESA excess contributions
  coverdellESAValueDec31: optionalDecimal, // Part V Line 33 - value of all Coverdell ESAs on December 31, 2025

  // Part VI: Additional Tax on Excess Contributions to Archer MSAs (Lines 34-41)
  archerMSAPriorYearExcessContributions: optionalDecimal, // Part VI Line 34 - prior-year Form 5329 Line 40
  archerMSAContributionRoom: optionalDecimal, // Part VI Line 35 - unused Archer MSA contribution room
  archerMSADistributions: optionalDecimal, // Part VI Line 36 - 2025 Archer MSA distributions
  archerMSACurrentYearExcessContributions: optionalDecimal, // Part VI Line 39 - current-year Archer MSA excess contributions
  archerMSAValueDec31: optionalDecimal, // Part VI Line 41 - value of all Archer MSAs on December 31, 2025

  // Part VII: Additional Tax on Excess Contributions to HSAs (Lines 42-49)
  hsaPriorYearExcessContributions: optionalDecimal, // Part VII Line 42 - prior-year Form 5329 Line 48
  hsaContributionRoom: optionalDecimal, // Part VII Line 43 - unused HSA contribution room (Form 8889 Line 12 minus Line 2)
  hsaDistributions: optionalDecimal, // Part VII Line 44 - 2025 taxable HSA distributions (Form 8889 Line 16)
  hsaCurrentYearExcessContributions: optionalDecimal, // Part VII Line 47 - current-year HSA excess contributions
  supportedHsaReturnedExcessContributionsByDueDate: optionalDecimal, // Part VII Line 47 support - timely returned excess contributions from Form 1099-SA code 2
  supportedHsaReturnedExcessContributionsUnder9100Relief: optionalDecimal, // Part VII Line 47 support - excess contributions corrected within the section 301.9100-2 6-month amended-return window
  supportedHsaReturnedExcessContributionEarningsUnder9100Relief: optionalDecimal, // Form 1040 Line 8 support - current-year earnings reported on the amended return for section 301.9100-2 HSA excess corrections
  hsaValueDec31: optionalDecimal, // Part VII Line 49 - fair market value of all HSAs on December 31, 2025

  // Part VIII: Additional Tax on Excess Contributions to ABLE Accounts (Lines 50-53)
  ablePriorYearExcessContributions: optionalDecimal, // Part VIII Line 50 - prior-year Form 5329 Line 53
  ableReductions: optionalDecimal, // Part VIII Line 51 - contribution room plus distributions that reduce excess
  ableCurrentYearExcessContributions: optionalDecimal, // Part VIII Line 52 - current-year ABLE excess contributions
  ableValueDec31: optionalDecimal, // Part VIII Line 53 - value of all ABLE accounts on December 31, 2025

  // Part IX: Additional Tax on Excess Accumulations in Qualified Retirement Plans (Lines 54-57)
  requiredMinimumDistribution: optionalDecimal, // Part IX Line 54 - aggregate RMD for the tax year
  actualDistributionsForRMD: optionalDecimal, // Part IX Line 55 - actual distributions taken to satisfy RMD
  rmdShortfallCorrectedWithinWindow: z.boolean().default(false), // Part IX Line 57 - whether the shortfall was corrected within the IRC 4974(d) correction window (reduces rate from 25% to 10%)
});

export const Form8801Schema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const required = ["priorYearFilingStatus", "priorYearAMT", "priorYearExclusionItemAdjustments", "unusedMinimumTaxCreditCarryforward"];
  return { ...record, sourceFactsComplete: record.sourceFactsComplete !== false && required.every(key => record[key] !== undefined) };
}, z.object({
  sourceFactsComplete: z.boolean().optional(),
  priorYearFilingStatus: FilingStatusSchema,
  priorYearTaxableIncome: decimal.optional(), // Legacy2025 alias only; verified path uses actual6251 sources.
  priorYearExclusionItemAdjustments: optionalDecimal,
  priorYearAMT: optionalDecimal,
  priorYearRegularTax: decimal.optional(), // Legacy2025 alias only; verified path uses actual6251 line10.
  unusedMinimumTaxCreditCarryforward: optionalDecimal,
  priorYearQualifiedDividends: optionalDecimal,
  priorYearNetLTCG: optionalDecimal,
  priorYearUnrecapturedSection1250Gain: optionalDecimal,
  priorYearCollectiblesGain: optionalDecimal,
  // Unknown source facts remain absent. Current-year limitations are calculated by the engine.
  priorYear: z.number().int().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  priorYearForm6251Line1And2e: decimal.optional(),
  priorYearMinimumTaxCreditNOLDeduction: decimal.optional(),
  priorYearMinimumTaxForeignTaxCredit: decimal.optional(),
  priorYearForm6251Line10: decimal.optional(),
  priorYearUnallowedQualifiedElectricVehicleCredit: decimal.optional(),
  priorYearFiledForm2555: z.boolean().optional(),
  priorYearFiledForm1040NR: z.boolean().optional(),
  priorYearNetUSRealPropertyGain: decimal.optional(),
  priorYearCapitalGainsRequired: z.boolean().optional(),
  priorYearForeignEarnedIncome: z.object({
    form2555Lines45And50: decimal,
    disallowedDeductions: decimal,
    capitalGainAdjustmentsConfirmed: z.boolean().optional(),
  }).optional(),
  priorYearCapitalGainsWorksheet: z.object({
    method: z.enum(["qualified_dividends", "schedule_d"]),
    preferentialIncome: decimal,
    ordinaryIncomeForZeroRate: decimal,
    ordinaryIncomeForFifteenRate: decimal,
    section1250Gain: decimal.optional(),
    scheduleDTaxWorksheetLine10: decimal.optional(),
  }).optional(),
}));

export const Form8880Schema = z.object({
  primaryElectiveDeferrals: optionalDecimal, // Line 1 column (a)
  primaryIraContributions: optionalDecimal, // Line 2 column (a) IRA portion
  primaryAbleContributions: optionalDecimal, // Line 2 column (a) ABLE portion
  primaryRecentDistributions: optionalDecimal, // Line 4 column (a)
  primaryIsFullTimeStudent: z.boolean().default(false),
  primaryCanBeClaimedAsDependent: z.boolean().default(false),
  spouseElectiveDeferrals: optionalDecimal, // Line 1 column (b)
  spouseIraContributions: optionalDecimal, // Line 2 column (b) IRA portion
  spouseAbleContributions: optionalDecimal, // Line 2 column (b) ABLE portion
  spouseRecentDistributions: optionalDecimal, // Line 4 column (b)
  spouseIsFullTimeStudent: z.boolean().default(false),
  spouseCanBeClaimedAsDependent: z.boolean().default(false),
  supportedW2PrimaryElectiveDeferrals: optionalDecimal, // Engine trace: supported W-2 Box 12 retirement-contribution defaults for Line 2a
  supportedW2SpouseElectiveDeferrals: optionalDecimal, // Engine trace: supported W-2 Box 12 retirement-contribution defaults for Line 2b
});

export const HsaCoverageSchema = z.enum(["none", "self_only", "family"]);

const defaultHsaCoverageByMonth = Array.from({ length: 12 }, () => "none") as Array<z.infer<typeof HsaCoverageSchema>>;

export const Form8889PriorYearRedeterminedLimitWorksheetSchema = z.object({
  filingStatus: FilingStatusSchema.optional(),
  coverageByMonth: z.array(HsaCoverageSchema).length(12),
  spouseFamilyCoverageMonths: z.array(z.number().int().min(1).max(12)).default([]),
  medicareMonths: z.array(z.number().int().min(1).max(12)).default([]),
  isDependent: z.boolean().default(false),
  archerMSAContributions: optionalDecimal,
  bothSpousesHaveHsas: z.boolean().default(false),
  spouseAllocatedLimit: decimal.optional(),
  selfOnlyContributionLimit: decimal,
  familyContributionLimit: decimal,
  catchUpContribution: optionalDecimal,
});

export const Form8889Schema = z.object({
  useLastMonthRule: z.boolean().optional(), // Actual contribution-limit choice; omitted is unknown
  accountOwner: z.enum(["primary", "spouse"]).default("primary"),
  coverageByMonth: z.array(HsaCoverageSchema).length(12).default(defaultHsaCoverageByMonth),
  spouseFamilyCoverageMonths: z.array(z.number().int().min(1).max(12)).default([]),
  contributionsMade: optionalDecimal, // Line 2
  archerMSAContributions: optionalDecimal, // Line 4
  bothSpousesHaveHsas: z.boolean().default(false), // Line 6 default spouse allocation branch
  spouseAllocatedLimit: decimal.optional(), // Line 6 override
  employerContributions: decimal.optional(), // Line 9; absence lets the engine default from W-2 Box 12 code W support
  supportedW2EmployerContributions: optionalDecimal, // Engine trace: attached W-2 Box 12 code W support for Line 9
  qualifiedFundingDistribution: optionalDecimal, // Line 10
  qualifiedFundingDistributionSource: z.enum(["traditional_ira", "roth_ira"]).optional(), // Engine routing support for Form 8606 defaults
  distributionsReceived: optionalDecimalInput, // Line 14a; absent worksheet amount may use actual 1099-SA Box1 support.
  excludedDistributions: decimal.optional(), // Line 14b; absence lets the engine default from rollovers and returned excess support
  rolloverDistributions: optionalDecimal, // Line 14b rollovers included on Line 14a
  prohibitedTransactionDistributions: optionalDecimal, // Form 1099-SA Box 3 code 5 deemed distributions that cannot be matched with Line 15 medical expenses
  qualifiedMedicalExpenses: optionalDecimal, // Line 15 ordinary medical-expense branch
  decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: optionalDecimal, // Line 15 beneficiary-only post-death branch for supported non-estate HSA death distributions
  distributionsNotSubjectToAdditionalTax: optionalDecimal, // Line 17a/17b exception amount
  distributionsAfterAge65: optionalDecimal, // Line 17a/17b validated taxable distributions made after turning age 65 during the year
  disabilityExceptionTaxableDistributions: optionalDecimalInput, // Actual taxable code 3 amount after its medical/rollover allocations; omission is unknown.
  lastMonthRuleContributions: optionalDecimal, // Part III Line 18 input
  lastMonthRuleRedeterminedLimit: decimal.optional(), // Part III Line 18 manual override; absence lets the engine use the supported worksheet path
  priorYearRedeterminedLimitWorksheet: Form8889PriorYearRedeterminedLimitWorksheetSchema.optional(), // Part III Line 18 supported auto-recompute inputs
  recaptureQualifiedFundingDistribution: optionalDecimal, // Part III Line 19
  testingPeriodFailureDueToDeathOrDisability: z.boolean().default(false), // Part III exception that zeros Lines 18-21
  supported1099SAGrossDistributions: optionalDecimal, // Engine trace: aggregated Form 1099-SA support for Line 14a
  supported1099SAReturnedExcessContributions: optionalDecimal, // Engine trace: aggregated Form 1099-SA code 2 support for Line 14b
  supported1099SAReturnedExcessContributionEarnings: optionalDecimalInput, // Actual included Box2 earnings; principal correction is gross Box1 minus Box2.
  supported1099SADeathDistributionDateOfDeathValue: optionalDecimal, // Engine trace: Box 4 death-distribution support included in Line 14a
  supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue: optionalDecimal, // Engine trace: non-estate-beneficiary Box 4 death-distribution support eligible for the special Line 15 offset, including inferred Form 1099-SA code 6 records
  supported1099SAEstateDeathDistributionDateOfDeathValue: optionalDecimal, // Engine trace: estate-beneficiary Box 4 death-distribution support that cannot offset Form 8889 Line 15 medical expenses
  supported1099SADisabilityExceptionDistributions: optionalDecimal, // Engine trace: Form 1099-SA code 3 disability support for Lines 17a/17b
  supported1099SAAutomaticExceptionDistributions: optionalDecimal, // Engine trace: Form 1099-SA disability and death exception support for Lines 17a/17b
  supported1099SAProhibitedTransactionDistributions: optionalDecimal, // Engine trace: Form 1099-SA code 5 deemed-distribution support
  medicareMonths: z.array(z.number().int().min(1).max(12)).default([]),
  isDependent: z.boolean().default(false),
});

export const Form8889ByOwnerSchema = z.object({
  primary: Form8889Schema.extend({
    accountOwner: z.literal("primary").default("primary"),
  }).optional(),
  spouse: Form8889Schema.extend({
    accountOwner: z.literal("spouse").default("spouse"),
  }).optional(),
});

export const Form6198Schema = z.object({
  /** Activity name for audit trail */
  activityName: z.string().default(""),

  // ── Part I: Current Year Profit (Loss) ──────────────────────
  /** Line 1: Ordinary income (loss) from the activity */
  ordinaryIncome: optionalDecimal,
  /** Line 2: Gain (loss) from sale/disposition of activity assets */
  gainLossFromDispositions: optionalDecimal,
  /** Line 3: Other income and gains from the activity */
  otherIncomeGains: optionalDecimal,
  /** Line 4: Other deductions and losses from the activity */
  otherDeductionsLosses: optionalDecimal,

  // ── Part II: Simplified Computation of Amount At Risk ────────
  /** Line 6: Adjusted basis in the activity at the effective date (first year only; floor at 0) */
  adjustedBasisAtEffectiveDate: optionalDecimal,
  /** Line 7: Increases — additional contributions, recourse borrowing, qualified nonrecourse financing */
  currentYearIncreases: optionalDecimal,
  /** Line 9: Decreases — distributions, nonrecourse financing, protected amounts */
  currentYearDecreases: optionalDecimal,
  /** Line 10a: Amount at risk at close of preceding tax year (0 if first year) */
  priorYearAmountAtRisk: optionalDecimal,
});
export type Form6198Input = z.infer<typeof Form6198Schema>;

export const PAScheduleJStatementSchema = z.object({
  estateOrTrustName: z.string(),
  federalEIN: z.string(),
  sourceDocument: z.enum(["pa_rk_1", "pa_nrk_1", "federal_1041_k1"]).default("pa_rk_1"),
  incomeAmount: decimal,
  nonresidentTaxWithheld: optionalDecimal,
});

export const PAPassThroughStatementSchema = z.object({
  entityName: z.string(),
  entityEIN: z.string(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  sourceDocument: z.enum(["pa_rk_1", "pa_nrk_1"]).default("pa_rk_1"),
  businessIncome: decimal,
  interestIncome: optionalDecimal,
  dividendIncome: optionalDecimal,
  netGainOrLoss: optionalDecimal,
  netRentalIncome: optionalDecimal,
  estateTrustIncome: optionalDecimal,
  gamblingIncome: optionalDecimal,
  nonresidentTaxWithheld: optionalDecimal,
});

export const PAScheduleGLStatementSchema = z.object({
  stateCode: z.string().length(2),
  incomeTaxableByBothStates: decimal,
  taxPaidToOtherState: decimal,
});

const PAScheduleUEVehicleSchema = z.object({
  method: z.enum(["standard", "actual"]),
  totalMiles: z.number().int().min(0),
  businessMiles: z.number().int().min(0),
  actualExpenses: optionalDecimal,
  parkingAndTolls: optionalDecimal,
});

const PAScheduleUETravelSchema = z.object({
  lodging: optionalDecimal,
  meals: optionalDecimal,
  otherTravel: optionalDecimal,
});

const PAScheduleUEOtherExpensesSchema = z.object({
  unionDues: optionalDecimal,
  toolsAndSupplies: optionalDecimal,
  workClothing: optionalDecimal,
  education: optionalDecimal,
  licenseFees: optionalDecimal,
  subscriptions: optionalDecimal,
  homeOffice: optionalDecimal,
  otherExpenses: optionalDecimal,
});

const PAScheduleUESchema = z.object({
  vehicle: PAScheduleUEVehicleSchema.optional(),
  travel: PAScheduleUETravelSchema.optional(),
  otherExpenses: PAScheduleUEOtherExpensesSchema.optional(),
  employerReimbursements: optionalDecimal,
});

const PAPTECreditEntrySchema = z.object({
  entityName: z.string(),
  entityEIN: z.string(),
  allocablePAIncome: decimal,
  pteTaxPaid: decimal,
});

const PAOtherCreditEntrySchema = z.object({
  creditType: z.enum([
    "employment_incentive",
    "neighborhood_assistance",
    "reap",
    "jobs_creation",
    "keystone_zone",
    "eitc",
    "ostc",
    "other",
  ]),
  description: z.string().optional(),
  amount: decimal,
});

const PAScheduleOCSchema = z.object({
  pteCredits: z.array(PAPTECreditEntrySchema).optional(),
  otherCredits: z.array(PAOtherCreditEntrySchema).optional(),
});

const PAScheduleOContributionSchema = z.object({
  beneficiaryName: z.string(),
  beneficiarySSN: z.string(),
  taxpayerContribution: optionalDecimal,
  spouseContribution: optionalDecimal,
});

const PAScheduleOSchema = z.object({
  qualifiedTuitionContributions: z.array(PAScheduleOContributionSchema).optional(),
  ableContributions: z.array(PAScheduleOContributionSchema).optional(),
  medicalSavingsAccountDeduction: decimal.optional(),
  spouseMedicalSavingsAccountDeduction: decimal.optional(),
  healthSavingsAccountDeduction: decimal.optional(),
  spouseHealthSavingsAccountDeduction: decimal.optional(),
  studentLoanInterestDeduction: decimal.optional(),
  spouseStudentLoanInterestDeduction: decimal.optional(),
  taxpayerPATaxableIncome: decimal.optional(),
  spousePATaxableIncome: decimal.optional(),
});

const PANonresidentEITCreditSchema = z.object({
  municipality: z.string(),
  incomeInWorkMunicipality: decimal,
  taxPaidToWorkMunicipality: decimal,
});

const PAScheduleSDSchema = z.object({
  method: z.enum(["EI", "PSD"]),
  schoolDistrictRate: decimal,
  schoolDistrictWithholding: optionalDecimal,
  estimatedPayments: optionalDecimal,
});

const PAScheduleTGamblingEntrySchema = z.object({
  description: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  winnings: decimal,
  wageringCosts: optionalDecimal,
  isLottery: z.boolean().default(false),
  lotteryState: z.string().optional(),
  prizeType: z.enum(["cash", "noncash", "mixed"]).default("cash"),
});

const PAScheduleTSchema = z.object({
  additionalEntries: z.array(PAScheduleTGamblingEntrySchema).optional(),
});

const PAScheduleAAdjustmentSchema = z.object({
  description: z.string(),
  amount: decimal,
});

const PAScheduleASchema = z.object({
  oidSources: z.array(z.object({
    sourceId: z.string().min(1),
    sourceReference: z.string().min(1),
    factsConfirmed: z.boolean(),
    paTaxTreatment: z.enum(["taxable", "pennsylvania", "us_government"]),
    strippedBond: z.boolean(),
    strippedBondExemptInterest: decimal.optional(),
    bondPremiumNettedOnStatement: decimal,
    paBondPremiumAmortization: decimal,
  })).optional(),
  additionAdjustments: z.array(PAScheduleAAdjustmentSchema).optional(),
  paObligationInterest: decimal.optional(),
  reductionAdjustments: z.array(PAScheduleAAdjustmentSchema).optional(),
  forfeitedInterestPenalty: decimal.optional(),
  annuityAndEndowmentDistributions: decimal.optional(),
  charitableGiftAnnuityIncome: decimal.optional(),
  nonEducational529Distributions: decimal.optional(),
  taxableHealthMedicalSavingsDistributions: decimal.optional(),
});

const PAScheduleBSchema = z.object({
  paExemptInterestDividends: decimal.optional(),
  reductionAdjustments: z.array(PAScheduleAAdjustmentSchema).optional(),
  additionAdjustments: z.array(PAScheduleAAdjustmentSchema).optional(),
  repatriationTransitionTaxBase: decimal.optional(),
  repatriationPriorYearPayments: decimal.optional(),
  repatriationCurrentYearPayments: decimal.optional(),
});

const PAScheduleDAdditionalTransactionSchema = CapitalTransactionSchema.extend({
  accountHolder: z.enum(["primary", "spouse"]).optional(),
});

const PAScheduleDLikeKindExchangeSchema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  propertyOwned: z.string(),
  propertyReceived: z.string(),
  recognizedGainOrLoss: decimal.optional(),
  digitalAsset: z.boolean().default(false),
});

const PAScheduleDSchema = z.object({
  additionalTransactions: z.array(PAScheduleDAdditionalTransactionSchema).optional(),
  likeKindExchanges: z.array(PAScheduleDLikeKindExchangeSchema).optional(),
  receivedDigitalAssetAsCompensationOrServices: z.boolean().optional(),
  otherLine3GainOrLoss: decimal.optional(),
  cCorporationDistributionGain: decimal.optional(),
  scheduleD71GainOrLoss: decimal.optional(),
  partnershipDistributionGain: decimal.optional(),
  sCorporationDistributionGain: decimal.optional(),
  insuranceContractGain: decimal.optional(),
});

const PAUseTaxSalesTaxPaidEntrySchema = z.object({
  taxablePurchaseAmount: optionalDecimal,
  salesTaxPaid: optionalDecimal,
});

const PAUseTaxWorksheetSchema = z.object({
  locality: z.enum(["remainder_of_pa", "allegheny_county", "philadelphia"]),
  taxableItemPurchases: optionalDecimal,
  taxableServicePurchases: optionalDecimal,
  electEstimatedTable: z.boolean().optional().default(false),
  salesTaxAlreadyPaid: optionalDecimal,
  salesTaxAlreadyPaidEntries: z.array(PAUseTaxSalesTaxPaidEntrySchema).optional(),
});

const PAScheduleNRHCompensationSchema = z.object({
  method: z.enum(["working_days", "business_volume"]),
  employerReportedPAGrossCompensation: decimal.optional(),
  grossCompensation: decimal.optional(),
  totalDaysForEmployer: z.number().int().min(0).optional(),
  nonworkingDays: z.number().int().min(0).optional(),
  daysWorkedInPennsylvania: z.number().int().min(0).optional(),
  totalBusinessVolume: decimal.optional(),
  pennsylvaniaBusinessVolume: decimal.optional(),
  unreimbursedEmployeeBusinessExpenses: decimal.optional(),
  employerReimbursementsNotInW2: decimal.optional(),
});

const PAScheduleNRHBusinessApportionmentSchema = z.object({
  propertyEverywhere: decimal.optional(),
  propertyPennsylvania: decimal.optional(),
  payrollEverywhere: decimal.optional(),
  payrollPennsylvania: decimal.optional(),
  salesEverywhere: decimal.optional(),
  salesPennsylvania: decimal.optional(),
  totalNetProfits: decimal,
});

const PAScheduleNRHSchema = z.object({
  compensation: PAScheduleNRHCompensationSchema.optional(),
  businessApportionment: PAScheduleNRHBusinessApportionmentSchema.optional(),
});

export const PAResidentReturnSchema = z.object({
  scheduleUE: PAScheduleUESchema.optional(),
  unreimbursedExpenses: optionalDecimal,
  otherDeductions: optionalDecimal,
  creditFromPriorYear: optionalDecimal,
  extensionPayment: optionalDecimal,
  estimatedPayments: optionalDecimal,
  nonresidentTaxWithheld: optionalDecimal,
  nontaxableIncome: optionalDecimal,
  additionalEligibilityIncome: optionalDecimal,
  spouseEligibilityIncome: optionalDecimal,
  estateTrustIncome: optionalDecimal,
  isClaimedAsDependentOnAnotherFederalReturn: z.boolean().optional(),
  spouseIsClaimedAsDependentOnAnotherFederalReturn: z.boolean().optional(),
  claimingHouseholdQualifiesForTaxForgiveness: z.boolean().optional(),
  scheduleSPSeparatedStatusApplies: z.boolean().optional(),
  scheduleT: PAScheduleTSchema.optional(),
  scheduleD: PAScheduleDSchema.optional(),
  scheduleA: PAScheduleASchema.optional(),
  scheduleB: PAScheduleBSchema.optional(),
  scheduleO: PAScheduleOSchema.optional(),
  otherStateCredits: z.array(PAScheduleGLStatementSchema).optional(),
  scheduleOC: PAScheduleOCSchema.optional(),
  otherCredits: optionalDecimal,
  localMunicipality: z.string().optional(),
  localEITRate: decimal.optional(),
  localNonresidentCredits: z.array(PANonresidentEITCreditSchema).optional(),
  scheduleSD: PAScheduleSDSchema.optional(),
  quarterlyEstimatedPayments: z.tuple([decimal, decimal, decimal, decimal]).optional(),
  priorYear100PercentForgiveness: z.boolean().optional(),
  priorYearPATaxableIncome: optionalDecimal,
  priorYearTaxForgivenessCredit: optionalDecimal,
  useTaxWorksheet: PAUseTaxWorksheetSchema.optional(),
  useTax: optionalDecimal,
  lateFilingOrPaymentPenalty: optionalDecimal,
  latePaymentInterest: optionalDecimal,
});

export const PANonresidentReturnSchema = z.object({
  residencyStatus: z.enum(["nonresident", "part_year"]),
  scheduleNRH: PAScheduleNRHSchema.optional(),
  paTaxableCompensation: optionalDecimal,
  unreimbursedExpenses: optionalDecimal,
  paTaxableInterest: optionalDecimal,
  paTaxableDividends: optionalDecimal,
  paTaxableNetBusinessIncome: optionalDecimal,
  paTaxableNetGainOrLoss: optionalDecimal,
  paTaxableNetRentalIncome: optionalDecimal,
  paTaxableEstateTrustIncome: optionalDecimal,
  paTaxableGamblingIncome: optionalDecimal,
  otherDeductions: optionalDecimal,
  creditFromPriorYear: optionalDecimal,
  extensionPayment: optionalDecimal,
  estimatedPayments: optionalDecimal,
  nonresidentTaxWithheld: optionalDecimal,
  refundableCredits: optionalDecimal,
  otherCredits: optionalDecimal,
  otherStateCredits: z.array(PAScheduleGLStatementSchema).optional(),
  nontaxableIncome: optionalDecimal,
  additionalEligibilityIncome: optionalDecimal,
  spouseEligibilityIncome: optionalDecimal,
  isClaimedAsDependentOnAnotherFederalReturn: z.boolean().optional(),
  spouseIsClaimedAsDependentOnAnotherFederalReturn: z.boolean().optional(),
  claimingHouseholdQualifiesForTaxForgiveness: z.boolean().optional(),
  scheduleSPSeparatedStatusApplies: z.boolean().optional(),
  useTaxWorksheet: PAUseTaxWorksheetSchema.optional(),
  useTax: optionalDecimal,
  lateFilingOrPaymentPenalty: optionalDecimal,
  latePaymentInterest: optionalDecimal,
});

export const ScheduleK1Schema = z.object({
  /** Actual federal tax withheld shown on Schedule K-1; not state withholding. */
  federalIncomeTaxWithheld: optionalDecimalInput,
  partnershipName: z.string(),
  partnershipEIN: z.string(),
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA class reporting
  ordinaryIncome: decimal, // Box 1
  njPassThroughBusinessAlternativeIncomeTaxCredit: optionalDecimal, // NJ Schedule NJ-K-1 / PTE-K-1 PTBAIT credit share
  netRentalIncome: optionalDecimal, // Box 2
  otherNetRentalIncome: optionalDecimal, // Box 3
  guaranteedPayments: optionalDecimal, // Box 4
  interestIncome: optionalDecimal, // Box 5
  ordinaryDividends: optionalDecimal, // Box 6a
  qualifiedDividends: optionalDecimal, // Box 6b
  royalties: optionalDecimal, // Box 7
  netShortTermCapitalGain: optionalDecimal, // Box 8
  netLongTermCapitalGain: optionalDecimal, // Box 9a
  unrecapturedSection1250Gain: optionalDecimal, // Box 9b
  collectiblesGain: optionalDecimal, // Box 9c
  section1231Gain: optionalDecimal, // Box 10
  otherIncome: optionalDecimal, // Box 11
  section179Deduction: optionalDecimal, // Box 12
  otherDeductions: optionalDecimal, // Box 13 (aggregate or Code W only when code-level fields are used)
  // Box 13 code-level charitable contributions (flow to Schedule A, NOT Schedule E)
  charitableCash: optionalDecimal, // Box 13 Code A — cash/non-capital-gain property to 50% orgs (60% AGI limit) → Schedule A Line 12
  charitableCapitalGain30: optionalDecimal, // Box 13 Code B — capital gain property to 50% orgs (30% AGI limit) → Schedule A Line 13
  charitableCapitalGain20: optionalDecimal, // Box 13 Code C — capital gain property to non-50% orgs (20% AGI limit) → Schedule A Line 13
  // Box 13 Code D — investment interest expense (→ Form 4952 Line 1)
  investmentInterestExpense: optionalDecimal, // Box 13 Code D — IRC §163(d) investment interest expense from partnership
  // Box 13 Code K — excess business interest expense (tracked for §163(j) carryforward)
  excessBusinessInterest: optionalDecimal, // Box 13 Code K — IRC §163(j) excess business interest expense
  selfEmploymentEarnings: optionalDecimalInput, // Actual Box 14 code A, including applicable guaranteed payments
  selfEmploymentFactsConfirmed: z.boolean().optional(),
  selfEmploymentNetEarningsAfterAdjustments: optionalDecimalInput, // Actual partner worksheet after deductible expenses/loss limits
  selfEmploymentIncomeType: z.enum(["farm", "nonfarm"]).optional(),
  foreignTaxPaid: optionalDecimal, // Box 16 Code O/P — creditable foreign taxes
  /** Gross foreign source income from Box 16 Codes D/E/F.
   *  When provided, this explicit amount is used for Form 1116 limitation
   *  instead of the heuristic that sums all K-1 income fields.
   *  Report the total foreign source taxable income from all categories. */
  foreignSourceIncome: decimal.optional(), // Box 16 Codes D/E/F — gross foreign source income
  /** IRC §904(d) category for foreign tax credit limitation.
   *  Defaults to "general" for K-1 foreign tax. Set to "passive"
   *  when the K-1 foreign income is passive category (e.g., PFIC). */
  foreignTaxCategory: z.enum(["passive", "general"]).default("general"), // IRC §904(d) category
  // Box 17: AMT items
  amtDepreciationAdjustment: optionalDecimal, // Box 17 Code A — post-1986 depreciation adjustment → Form 6251 Line 2l
  amtAdjustedGainOrLoss: optionalDecimal, // Box 17 Code B — adjusted gain or loss → Form 6251 Line 2k
  amtDepletion: optionalDecimal, // Box 17 Code C — depletion (other than oil & gas) → Form 6251 Line 2c
  amtOtherItems: optionalDecimal, // Box 17 Code F — other AMT items → Form 6251 Line 3
  // Box 18: Tax-exempt income and nondeductible expenses
  taxExemptInterest: optionalDecimal, // Box 18 Code A — tax-exempt interest → Form 1040 Line 2a
  otherTaxExemptIncome: optionalDecimal, // Box 18 Code B — other tax-exempt income (basis only)
  nondeductibleExpenses: optionalDecimal, // Box 18 Code C — nondeductible expenses (basis only)
  // Box 19: Distributions
  distributions: optionalDecimal, // Box 19 Code A — cash & marketable securities distributions (basis only)
  // Partnership Box 20 Codes A/B — investment income and expenses (→ Form 4952)
  investmentIncome: optionalDecimal, // Box 20 Code A — investment income from partnership → Form 4952 Line 4a
  investmentExpenses: optionalDecimal, // Box 20 Code B — investment expenses from partnership → Form 4952 Line 4f
  excessTaxableIncome: optionalDecimal, // Partnership Box 20 Code AE or S-corp Box 17 Code AA — current engine only uses the partnership branch for EBIE release
  excessBusinessInterestIncome: optionalDecimal, // Partnership Box 20 Code AF or S-corp Box 17 Code AB — current engine only uses the partnership branch for EBIE release
  qbiMateriallyParticipated: z.boolean().optional(),
  section199AQBI: optionalDecimal, // Box 20 Code Z — qualified business income
  section199AW2Wages: optionalDecimal, // Section 199A statement — W-2 wages allocable to QBI
  section199AUBIA: optionalDecimal, // Section 199A statement — UBIA of qualified property
  section199AIsSST: z.boolean().default(false), // Section 199A statement — specified service trade or business
  section199AQualifiedReitDividends: optionalDecimal, // Section 199A statement — qualified REIT dividends
  section199AQualifiedPTPIncome: optionalDecimal, // Section 199A statement — qualified PTP income
  section199APTPW2Wages: optionalDecimal, // Section 199A statement — W-2 wages allocable to PTP QBI
  section199APTPUBIA: optionalDecimal, // Section 199A statement — UBIA of qualified property for PTP
  section199APTPIsSST: z.boolean().default(false), // Section 199A statement — PTP is specified service trade or business
  // Box 15: Credits — flow to Form 3800 (General Business Credit)
  lowIncomeHousingCredit42j5: optionalDecimal, // Box 15 Code A — §42(j)(5) partnerships
  lowIncomeHousingCreditOther: optionalDecimal, // Box 15 Code B — other low-income housing credit
  qualifiedRehabilitationExpenditures: optionalDecimal, // Box 15 Code C — §47 rehabilitation credit
  otherRentalRealEstateCredits: optionalDecimal, // Box 15 Code D — other rental real estate credits
  otherRentalCredits: optionalDecimal, // Box 15 Code E — other rental credits
  otherCredits: optionalDecimal, // Box 15 Code F — other business credits (work opportunity, research, etc.)
  isPassiveActivity: z.boolean().default(false),
  /** True if the partnership is a publicly traded partnership (PTP) per IRC §7704.
   *  When set, passive losses are subject to IRC §469(k) segregation: they can
   *  only offset income from the same PTP, not other passive income. */
  isPubliclyTradedPartnership: z.boolean().default(false),
  /** When true, the taxpayer fully disposed of their entire PTP interest in a
   *  taxable transaction during the tax year. Per IRC §469(g)(1), all accumulated
   *  suspended PTP losses become deductible as nonpassive losses. Only meaningful
   *  when isPubliclyTradedPartnership is true. */
  ptpFullyDisposedInTaxableTransaction: z.boolean().default(false),
  /** Gain or loss realized on disposition of the PTP interest.
   *  Positive = gain, negative = loss. Treated as passive activity income/loss
   *  from the PTP for netting against accumulated suspended losses per IRC §469(g)(1)(A).
   *  Only used when ptpFullyDisposedInTaxableTransaction is true. */
  ptpDispositionGainOrLoss: optionalDecimal,
  isForeignPartnership: z.boolean().default(false),
  atRiskAmount: decimal.optional(),
  /** Form 6198 inputs — when provided, computes the at-risk amount instead of using the manual atRiskAmount */
  form6198: Form6198Schema.optional(),
  // Basis tracking (IRC §705 partnerships / IRC §1367 S-corps)
  /** Entity type — controls basis computation ordering.
   *  Partnerships use IRC §705; S-corporations use IRC §1367/Form 7203. */
  entityType: z.enum(["partnership", "s_corporation"]).default("partnership"),
  /** Adjusted basis at beginning of tax year (not less than zero).
   *  When provided, enables automatic basis schedule computation. */
  beginningBasis: decimal.optional(),
  /** Prior-year suspended losses from basis limitation (IRC §704(d) / §1366(d)).
   *  These are added to current-year losses for pro-rata allocation. */
  priorSuspendedLosses: z.object({
    ordinary: optionalDecimal,
    rental: optionalDecimal,
    otherRental: optionalDecimal,
    shortTermCapital: optionalDecimal,
    longTermCapital: optionalDecimal,
    section1231: optionalDecimal,
    otherLoss: optionalDecimal,
    section179: optionalDecimal,
    charitable: optionalDecimal,
    otherDeductions: optionalDecimal,
    investmentInterest: optionalDecimal,
    ebie: optionalDecimal,
  }).optional(),
  /** IRC §1367(a)(2)(B) election — S-corps only.
   *  When true, losses reduce basis BEFORE nondeductible expenses. */
  election1367: z.boolean().default(false),
  // S-Corp Debt Basis (Form 7203 Part II) — only applicable for S-corporations
  /** Adjusted basis of direct shareholder loans to S-corp at start of year.
   *  When provided (S-corp only), enables Form 7203 Part II debt basis computation.
   *  Losses exceeding stock basis can further reduce debt basis per IRC §1367(b)(2)(A). */
  beginningDebtBasis: decimal.optional(),
  /** New direct loans from shareholder to S-corp during the year. */
  additionalLoansToScorp: decimal.optional(),
  /** Cumulative prior-year reduction of debt basis from excess losses.
   *  Used for debt basis restoration tracking per IRC §1367(b)(2)(B).
   *  In a net-increase year, income restores debt basis up to this amount. */
  priorDebtBasisReduction: decimal.optional(),
});

/**
 * Schedule K-1 (Form 1041) — Beneficiary's Share of Income, Deductions,
 * Credits, etc. from an Estate or Trust
 *
 * Unlike the partnership/S-corp K-1 (Form 1065/1120S), trust/estate K-1
 * income is generally NOT subject to self-employment tax. Income retains
 * its character and is reported on the beneficiary's return as if received
 * directly.
 *
 * Ref: IRS Schedule K-1 (Form 1041) Instructions; IRC §§652, 662, 691(c), 642(h).
 */
export const ScheduleK1Form1041Schema = z.object({
  /** Actual federal tax withheld shown on Schedule K-1; not state withholding. */
  federalIncomeTaxWithheld: optionalDecimalInput,
  /** Name of the estate or trust */
  estateTrustName: z.string(),
  /** EIN of the estate or trust */
  estateTrustEIN: z.string(),
  /** Whether this is the final K-1 (trust/estate terminating) */
  isFinalK1: z.boolean().default(false),

  // ── Income (Boxes 1–5) ──────────────────────────────────
  /** Box 1: Interest income → Schedule B Part I */
  interestIncome: optionalDecimal,
  /** Box 2a: Ordinary dividends → Schedule B Part II */
  ordinaryDividends: optionalDecimal,
  /** Box 2b(1): Qualified dividends → Form 1040 Line 3a */
  qualifiedDividends: optionalDecimal,
  /** Box 3: Net short-term capital gain → Schedule D Line 5 */
  netShortTermCapitalGain: optionalDecimal,
  /** Box 4a: Net long-term capital gain → Schedule D Line 12 */
  netLongTermCapitalGain: optionalDecimal,
  /** Box 4b: 28% rate gain (collectibles) → QDCG worksheet */
  collectiblesGain: optionalDecimal,
  /** Box 4c: Unrecaptured section 1250 gain → QDCG worksheet */
  unrecapturedSection1250Gain: optionalDecimal,
  /** Box 5: Other portfolio and nonbusiness income → Schedule 1 Line 8z */
  otherPortfolioIncome: optionalDecimal,

  // ── Deductions (Boxes 9–11) ─────────────────────────────
  /** Box 9: Directly apportioned deductions (summary, informational) */
  directlyApportionedDeductions: optionalDecimal,
  /** Box 10: Estate tax deduction (IRC §691(c)) → Schedule A Line 16 */
  estateTaxDeduction: optionalDecimal,

  // Box 11: Final year deductions (only when isFinalK1 = true)
  /** Box 11 Code A: §67(e) excess deductions → Schedule 1 Line 24z (above-the-line) */
  finalYearSection67eDeductions: optionalDecimal,
  /** Box 11 Code B: Non-miscellaneous itemized deductions → Schedule A */
  finalYearNonMiscItemized: optionalDecimal,
  /** Box 11 Code C: Short-term capital loss carryover → Schedule D Line 5 */
  finalYearShortTermCapitalLoss: optionalDecimal,
  /** Box 11 Code D: Long-term capital loss carryover → Schedule D Line 12 */
  finalYearLongTermCapitalLoss: optionalDecimal,
  /** Box 11 Code E: NOL carryover → Schedule 1 Line 8a */
  finalYearNOLCarryover: optionalDecimal,

  // ── AMT (Box 12) ───────────────────────────────────────
  /** Box 12 Code A: AMT adjustment (aggregate) → Form 6251 */
  amtAdjustment: optionalDecimal,

  // ── Other information (Box 14) ──────────────────────────
  /** Box 14 Code A: Tax-exempt interest → Form 1040 Line 2a */
  taxExemptInterest: optionalDecimal,
  /** Box 14 Code B: Foreign taxes paid → Form 1116 or direct credit */
  foreignTaxesPaid: optionalDecimal,

  // ── Section 199A QBI (Box 14 Code I) ──────────────────
  // The fiduciary provides a statement with the beneficiary's allocable
  // share of QBI, W-2 wages, UBIA, SSTB designation, qualified REIT
  // dividends, and qualified PTP income. These mirror the partnership
  // K-1 Box 20 Code Z fields.
  /** Box 14 Code I: Qualified business income from the trust/estate */
  qbiMateriallyParticipated: z.boolean().optional(),
  section199AQBI: optionalDecimal,
  /** Box 14 Code I statement: W-2 wages allocable to QBI */
  section199AW2Wages: optionalDecimal,
  /** Box 14 Code I statement: UBIA of qualified property */
  section199AUBIA: optionalDecimal,
  /** Box 14 Code I statement: whether the trade/business is an SSTB */
  section199AIsSST: z.boolean().default(false),
  /** Box 14 Code I statement: qualified REIT dividends → Form 8995/8995-A */
  section199AQualifiedReitDividends: optionalDecimal,
  /** Box 14 Code I statement: qualified PTP income → Form 8995/8995-A */
  section199AQualifiedPTPIncome: optionalDecimal,
});
export type ScheduleK1Form1041 = z.infer<typeof ScheduleK1Form1041Schema>;

/**
 * Form 1098-E — Student Loan Interest Statement
 *
 * Reports qualified student loan interest received by a lender from a
 * borrower during the calendar year. Borrowers with loans from multiple
 * servicers will have multiple 1098-E forms that must be aggregated.
 *
 * Ref: IRS Form 1098-E Instructions; IRC §221; Pub 970 Chapter 4.
 */
export const Form1098ESchema = z.object({
  sourceId: z.string().optional(),
  taxYear: z.number().int().optional(),
  borrowerId: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  /** Name of the lender or loan servicer */
  lender: z.string(),
  /** Box 1: Student loan interest received by lender */
  studentLoanInterestReceived: decimal,
  /** Actual Box2: Box1 excludes these amounts for a loan made before September1,2004. */
  box2ExcludesOriginationFeesOrCapitalizedInterest: z.boolean().optional(),
  /** @deprecated Incorrect historical label. Preserved as unverified, never an actual Box2 answer. */
  includesOriginationFeesOrCapitalizedInterest: z.boolean().optional(),
});
export type Form1098E = z.infer<typeof Form1098ESchema>;

/** Actual borrower and benefit sources for Schedule1 line21; no favorable defaults. */
export const StudentLoanInterestSourceSchema = z.object({
  sourceId: z.string().optional(), borrowerId: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(), lender: z.string().optional(),
  sourceKind: z.enum(["form1098e", "lender_statement", "payment_records"]).optional(),
  form1098ESourceId: z.string().optional(), loanOriginationDate: z.string().optional(),
  interestPaid: optionalDecimalInput, additionalInterestPaid: optionalDecimalInput,
  additionalInterestSourceReference: z.string().optional(), additionalInterestQualificationConfirmed: z.boolean().optional(),
  paymentsInTaxYearConfirmed: z.boolean().optional(), legallyObligated: z.boolean().optional(),
  solelyQualifiedEducationExpenses: z.boolean().optional(), eligibleInstitutionAtOrigination: z.boolean().optional(),
  enrolledAtLeastHalfTime: z.boolean().optional(), pursuingCredential: z.boolean().optional(),
  studentRelationshipAtOrigination: z.enum(["self", "spouse", "dependent", "other"]).optional(),
  expensesWithinReasonablePeriod: z.boolean().optional(), relatedLender: z.boolean().optional(), employerPlanLoan: z.boolean().optional(),
  employerAssistanceExcluded: optionalDecimalInput, otherTaxFreeAssistance: optionalDecimalInput,
  interestDeductibleElsewhere: optionalDecimalInput, qtpTaxFreeEarningsUsedForInterest: optionalDecimalInput,
  reductionsDistinctConfirmed: z.boolean().optional(), educationExpenseIds: z.array(z.string()).optional(),
});
export const StudentLoanInterestFactsSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceFactsConfirmed: z.boolean().optional(),
  primaryClaimedAsDependent: z.boolean().optional(), spouseClaimedAsDependent: z.boolean().optional(),
  puertoRicoIncomeExclusion: optionalDecimalInput, americanSamoaIncomeExclusion: optionalDecimalInput,
  loans: z.array(StudentLoanInterestSourceSchema).optional(),
});
export type StudentLoanInterestFacts = z.infer<typeof StudentLoanInterestFactsSchema>;

export const Form1098Schema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string,unknown>;
  const complete = source.sourceFactsComplete !== false && ["sourceId","taxYear","mortgageInterestReceived","outstandingMortgagePrincipal","mortgageOriginationDate","refundOfOverpaidInterest","pointsPaid"].every(key => source[key] !== undefined);
  return {...source,sourceFactsComplete:complete};
},z.object({
  sourceId: z.string().optional(),
  taxYear: z.number().int().optional(),
  sourceFactsComplete: z.boolean().optional(),
  lender: z.string(),
  mortgageInterestReceived: decimal, // Box 1
  outstandingMortgagePrincipal: decimal, // Box 2
  mortgageOriginationDate: z.string().optional(),
  refundOfOverpaidInterest: optionalDecimal, // Box 4: prior-year interest recovery
  mortgageInsurancePremiums: optionalDecimal, // Box 5
  mortgageInsuranceQualification: z.object({
    allocationTaxYear: z.number().int(),
    contractIssueDate: z.string(),
    qualifiedProvider: z.boolean(),
    acquisitionDebt: z.boolean(),
    qualifiedResidence: z.boolean(),
    premiumsAllocableToYear: decimal,
  }).optional(),
  pointsPaid: optionalDecimal, // Box 6
  propertyTax: optionalDecimal,
}));

const MortgageBalanceSchema = z.discriminatedUnion("method", [
  z.object({method:z.literal("highest_balance"),amount:decimal,sourceReference:z.string().min(1)}),
  z.object({method:z.literal("lender_average"),amount:decimal,sourceReference:z.string().min(1)}),
  z.object({method:z.literal("first_last"),firstBalance:decimal,lastBalance:decimal,noAdditionalBorrowing:z.boolean(),noPrepaymentOverOneMonth:z.boolean(),levelPaymentsAtLeastSemiannually:z.boolean()}),
  z.object({method:z.literal("monthly"),qualifiedHomeMonths:z.array(z.number().int().min(1).max(12)).min(1),balances:z.array(z.object({month:z.number().int().min(1).max(12),amount:decimal})).min(1)}),
  z.object({method:z.literal("interest_rate"),currentYearInterest:decimal,currentYearInterestPaidInPriorYears:decimal,currentYearInterestPaidInPriorYearsByOthers:decimal,interestRefundedToOthers:decimal,lowestAnnualRate:decimal,securedAllYear:z.boolean(),interestPaidAtLeastMonthly:z.boolean()}),
  z.object({method:z.literal("category_worksheet"),grandfatheredDebt:decimal,acquisitionDebtBefore2017:decimal,acquisitionDebtAfter2017:decimal,excludedDebt:decimal,worksheetReference:z.string().min(1),classificationConfirmed:z.boolean(),paymentsAppliedInRequiredOrderConfirmed:z.boolean()}),
]);
const MortgagePointsSchema = z.discriminatedUnion("method", [
  z.object({method:z.literal("none")}),
  z.object({method:z.literal("current_year"),cashMethod:z.boolean(),establishedPractice:z.boolean(),withinUsualAmount:z.boolean(),notServiceFees:z.boolean(),ownFundsSufficient:z.boolean(),buyBuildOrImproveMainHome:z.enum(["purchase","build","improve"]),percentageOfPrincipal:z.boolean(),onSettlementStatement:z.boolean(),fullDeductionElected:z.boolean(),paidDate:z.string()}),
  z.object({method:z.literal("ratable"),originalPoints:decimal,originalPrincipal:decimal,loanTermMonths:z.number().int().positive(),paymentsInYear:z.number().int().nonnegative(),paymentIntervalMonths:z.number().int().positive(),unamortizedPointsAtStartOfYear:decimal,cashMethod:z.boolean(),comparableLoanTerms:z.boolean(),pointsAreInterest:z.boolean(),paidDate:z.string()}),
  z.object({method:z.literal("completed_amortization"),deductibleAmountBeforeLimit:decimal,unamortizedPointsAvailable:decimal,sourceTaxYear:z.number().int(),worksheetReference:z.string().min(1),serviceFeesExcludedConfirmed:z.boolean(),reportedOnCurrentForm1098:z.boolean()}),
]);
/** Actual Pub936 source records. No omitted source amount or qualification is defaulted. */
export const MortgageInterestWorksheetSchema = z.object({
  sourceTaxYear:z.number().int(),sourceReference:z.string().min(1),sourceFactsConfirmed:z.boolean(),allHomeDebtIncluded:z.boolean(),
  loans:z.array(z.object({
    sourceId:z.string().min(1),form1098SourceId:z.string().min(1).optional(),lenderName:z.string().min(1),lenderAddress:z.string().optional(),lenderTaxId:z.string().optional(),
    accountHolder:z.enum(["primary","spouse","joint"]),homeId:z.string().min(1),homeUse:z.enum(["main","second","other"]),
    qualifiedResidence:z.boolean(),securedDebt:z.boolean(),ownershipInterest:z.boolean(),obligationToRepay:z.boolean(),
    originationDate:z.string(),loanType:z.enum(["original","refinanced_mixed"]),acquisitionUse:z.boolean(),currentYearInterestOnly:z.boolean(),
    interestPaid:decimal,interestPaidByOthers:decimal,interestDeductedElsewhere:decimal,sameYearInterestRefund:decimal,nonqualifiedInterest:decimal,
    pointsPaid:decimal,pointsPaidByOthers:decimal,pointsNotInterest:decimal,points:MortgagePointsSchema,balance:MortgageBalanceSchema,
    bindingContract:z.object({signedDate:z.string(),requiredClosingDate:z.string(),purchaseDate:z.string()}).optional(),
  })),
  priorYearInterestRecoveries:z.array(z.object({sourceId:z.string().min(1),form1098SourceId:z.string().min(1).optional(),originTaxYear:z.number().int(),refundReceived:decimal,taxableRecovery:decimal,alreadyIncludedInOtherIncome:decimal,otherIncomeSource:z.object({form1099MiscIndex:z.number().int().nonnegative()}).optional(),taxBenefitWorksheetReference:z.string().min(1),taxBenefitWorksheetConfirmed:z.boolean()})),
});
export type MortgageInterestWorksheet = z.infer<typeof MortgageInterestWorksheetSchema>;

const nonnegativePremium = decimal.refine(value => !d(value).isNegative(), "Premium amount must be nonnegative");
const uniqueCoverageMonths = (rows: Array<{month:number}>) => new Set(rows.map(row => row.month)).size === rows.length;
export const Form1095ASchema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string,unknown>;
  const rows = record.monthlyPremiums;
  const complete = record.sourceFactsComplete !== false && record.taxYear !== undefined
    && typeof record.marketplace === "string" && record.marketplace.trim().length > 0
    && typeof record.policyNumber === "string" && record.policyNumber.trim().length > 0
    && Array.isArray(rows) && rows.length > 0 && rows.every(row => row && typeof row === "object"
      && ["month","enrolleePremium","slcsp","advancePremiumTaxCredit"].every(key => (row as Record<string,unknown>)[key] !== undefined));
  return {...record,sourceFactsComplete:complete};
}, z.object({
  sourceFactsComplete: z.boolean().optional(),
  taxYear: z.number().int().optional(),
  marketplace: z.string(),
  policyNumber: z.string(),
  monthlyPremiums: z.array(z.object({
    month: z.number().int().min(1).max(12),
    enrolleePremium: nonnegativePremium,
    slcsp: nonnegativePremium,
    advancePremiumTaxCredit: nonnegativePremium.optional().default("0"),
  })).min(1).refine(uniqueCoverageMonths, "Duplicate1095A source months must be reconciled"),
}));

export const Form8962Schema = z.object({
  taxFamilySize: z.number().int().min(1).optional(),
  fplRegion: z.enum(["contiguous","alaska","hawaii"]).optional(),
  // Components may be negative; Form8962 line3 applies the household zero floor.
  taxpayerModifiedAGI: optionalDecimalInput,
  requiredFilingDependentsModifiedAGI: optionalDecimalInput,
  householdFactsConfirmed: z.boolean().optional(),
  canBeClaimedAsDependent: z.boolean().optional(),
  marriedFilingSeparatelyExceptionConfirmed: z.boolean().optional(),
  belowPovertyException: z.enum(["none","marketplace_estimate","lawfully_present_ineligible_medicaid"]).optional(),
  marketplaceEstimatedIncomeWithinEligibilityRange: z.boolean().optional(),
  marketplaceInformationAccurate: z.boolean().optional(),
  coverageFactsConfirmed: z.boolean().optional(),
  allocationRequired: z.boolean().optional(),
  alternativeMarriageCalculationElected: z.boolean().optional(),
  selfEmployedHealthInsuranceCoordinationRequired: z.boolean().optional(),
  qsehraAffected: z.boolean().optional(),
  lawfulPresenceReconciliationRequired: z.boolean().optional(),
  monthlyReconciliation: z.array(z.object({
    month: z.number().int().min(1).max(12),
    enrolleePremium: nonnegativePremium,
    slcsp: nonnegativePremium,
    advancePremiumTaxCredit: nonnegativePremium,
    coverageEligible: z.boolean(),
    incomeBasedSepEnrollment: z.boolean(),
    qsehraAffordable: z.boolean().optional(),
    qsehraMonthlyPermittedBenefit: nonnegativePremium.optional(),
  })).refine(uniqueCoverageMonths,"Duplicate PTC reconciliation months are not allowed").optional(),
});

export const CharitableDonationSchema = z.object({
  organization: z.string(),
  /** Actual charitable qualification under IRC170(c); omission remains unknown in either supported year. */
  qualifiedOrganization: z.boolean().optional(),
  supportingOrganization: z.boolean().optional(),
  donorAdvisedFund: z.boolean().optional(),
  qualifiedAppreciatedStock: z.boolean().optional(),
  type: z.enum(["cash", "appreciated_stock", "property", "other"]),
  amount: decimal, // Fair market value
  costBasis: optionalDecimalInput, // For appreciated property
  dateOfDonation: z.string(),
  isLongTermCapitalGain: z.boolean().optional(),
  isPrivateFoundation: z.boolean().optional(), // Validated 20%-of-AGI branch for LTCG property donated to a private foundation / second-category organization
});

/** Actual filed NOL sources. Unknown history and tax character have no defaults. */
export const NetOperatingLossVintageSchema = z.object({
  sourceId: z.string().optional(), lossTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
  originKind: z.enum(["individual_nol", "excess_business_loss", "estate_termination"]).optional(),
  originalLoss: optionalDecimalInput, openingCarryforward: optionalDecimalInput,
  carrybackTreatment: z.enum(["not_required", "waived", "completed"]).optional(), carrybackSourceReference: z.string().optional(),
  ordinaryHistoricalCarrybackConfirmed: z.boolean().optional(), adjustedThroughTaxYear: z.number().int().optional(),
  historySourceReference: z.string().optional(), allHistoryIncluded: z.boolean().optional(), farmingLossIncluded: z.boolean().optional(),
  history: z.array(z.object({ taxYear: z.number().int().optional(), nolUsed: optionalDecimalInput,
    attributeReduction: optionalDecimalInput, sourceReference: z.string().optional() })).optional(),
  section1411OriginalLoss: optionalDecimalInput,
});
export const NetOperatingLossSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allCarryoversIncluded: z.boolean().optional(), calendarYearTaxpayer: z.boolean().optional(),
  returnMembership: z.enum(["continuous_individual", "same_spouses_joint"]).optional(), membershipUnchangedConfirmed: z.boolean().optional(),
  primaryName: z.string().optional(), primaryTaxpayerIdLast4: z.string().optional(), spouseName: z.string().optional(), spouseTaxpayerIdLast4: z.string().optional(),
  vintages: z.array(NetOperatingLossVintageSchema).optional(),
  alternativeTax: z.object({ sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allCarryoversIncluded: z.boolean().optional(), specialDisasterCarryIncluded: z.boolean().optional(),
    currentYearAdjustmentsCompleteConfirmed: z.boolean().optional(), regularBasisAndLossLimitsSameAsAlternativeConfirmed: z.boolean().optional(),
    /** Independent actual charity histories; absence never establishes either history is empty. */
    charitableCarryoverHistory: z.object({
      sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
      sourceFactsConfirmed: z.boolean().optional(), allCarryoversIncluded: z.boolean().optional(),
      priorRegularCarryovers: z.array(z.object({ taxYear: z.number().int().optional(),
        category: z.enum(["cash_60", "noncash_50", "capital_gain_30", "other_30", "capital_gain_20"]).optional(),
        amount: optionalDecimalInput, sourceReference: z.string().optional() })).optional(),
      priorAlternativeCarryovers: z.array(z.object({ taxYear: z.number().int().optional(),
        category: z.enum(["cash_60", "noncash_50", "capital_gain_30", "other_30", "capital_gain_20"]).optional(),
        amount: optionalDecimalInput, sourceReference: z.string().optional() })).optional(),
    }).optional(),
    vintages: z.array(NetOperatingLossVintageSchema).optional() }).optional(),
});

/** Current origin facts, separate from filed prior loss vintages. No calculated income overrides. */
export const Form172OriginSourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  allCurrentYearSourcesIncluded: z.boolean().optional(), farmingLossIncluded: z.boolean().optional(),
  cancelledDebtIncluded: z.boolean().optional(), estateOrTrustLossIncluded: z.boolean().optional(),
  businessSources: z.array(z.object({
    sourceId: z.string().optional(), accountHolder: z.enum(["primary", "spouse"]).optional(), businessName: z.string().optional(),
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    materiallyParticipated: z.boolean().optional(), allInvestmentAtRisk: z.boolean().optional(), financialTradingBusiness: z.boolean().optional(),
  })).optional(),
  /** Original capital records and actual character; no computed gain or loss override. */
  capitalSources: z.object({
    sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    allCapitalSourcesIncluded: z.boolean().optional(),
    transactions: z.array(z.object({
      sourceId: z.string().optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
      accountHolder: z.enum(["primary", "spouse"]).optional(), statementSourceId: z.string().optional(), payerName: z.string().optional(),
      accountReference: z.string().optional(), nonbusinessInvestmentConfirmed: z.boolean().optional(),
      capitalCharacter: z.enum(["ordinary_investment", "collectible", "section1202"]).optional(),
      transaction: z.object({
        description: z.string().optional(), dateAcquired: z.string().optional(), dateSold: z.string().optional(),
        proceeds: optionalDecimalInput, costBasis: optionalDecimalInput, adjustments: optionalDecimalInput,
        holdingPeriod: z.enum(["short", "long"]).optional(), basisReportedToIRS: z.boolean().optional(),
        washSale: z.boolean().optional(), washSaleDisallowed: optionalDecimalInput, digitalAsset: z.boolean().optional(),
      }).optional(),
    })).optional(),
    distributions: z.array(z.object({
      sourceId: z.string().optional(), sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(),
      accountHolder: z.enum(["primary", "spouse"]).optional(), payerName: z.string().optional(), accountReference: z.string().optional(),
      nonbusinessInvestmentConfirmed: z.boolean().optional(), totalCapitalGainDistributions: optionalDecimalInput,
      section1250Gain: optionalDecimalInput, section1202Gain: optionalDecimalInput, collectiblesGain: optionalDecimalInput,
    })).optional(),
    priorCapitalLosses: z.object({
      sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      allCarryoversIncluded: z.boolean().optional(), sameReturnMembershipConfirmed: z.boolean().optional(),
      nonbusinessInvestmentConfirmed: z.boolean().optional(), shortTermCapitalLoss: optionalDecimalInput, longTermCapitalLoss: optionalDecimalInput,
    }).optional(),
    alternativeTax: z.object({
      sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
      currentBasisAndAdjustmentsSameConfirmed: z.boolean().optional(), priorCapitalLossesSameConfirmed: z.boolean().optional(),
    }).optional(),
  }).optional(),
  alternativeTax: z.object({
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(), currentYearAdjustmentsCompleteConfirmed: z.boolean().optional(),
    regularBasisAndLossLimitsSameAsAlternativeConfirmed: z.boolean().optional(), regularDepreciationSameAsAlternativeConfirmed: z.boolean().optional(),
  }).optional(),
});

export const PriorYearCarryforwardSchema = z.object({
  capitalLossCarryforward: optionalDecimal,
  shortTermCapitalLoss: optionalDecimal,
  longTermCapitalLoss: optionalDecimal,
  suspendedPassiveLosses: z
    .array(
      z.object({
        partnershipName: z.string(),
        amount: decimal,
        /** Actual prior filed QBI loss worksheet; no inferred origin or qualification. */
        qbiLossTracking: z.object({
          sourceTaxYear: z.number().int(),
          sourceReference: z.string(),
          sourceFactsConfirmed: z.boolean().optional(),
          vintages: z.array(z.object({
            taxYear: z.number().int(),
            originalLoss: decimal,
            qualifiedOriginalLoss: decimal,
            remainingLoss: decimal,
            qualifiedRemainingLoss: decimal,
            materiallyParticipatedInCurrentYear: z.boolean().optional(),
          })),
        }).optional(),
      })
    )
    .default([]),
  /** Per-PTP suspended losses under IRC §469(k).
   *  PTP losses can only offset income from the same PTP, not other passive income. */
  suspendedPTPLosses: z
    .array(
      z.object({
        partnershipName: z.string(),
        amount: decimal,
      })
    )
    .default([]),
  foreignTaxCreditCarryforward: optionalDecimal,
  /** Per-year foreign tax credit carryforward for Schedule B FIFO reconciliation.
   *  Each entry maps a prior tax year to the unused credit from that year.
   *  When provided, takes precedence over the aggregate foreignTaxCreditCarryforward. */
  foreignTaxCreditCarryforwardByYear: z.array(z.object({
    taxYear: z.number().int(),
    amount: decimal,
  })).default([]),
  /** Per-category foreign tax credit carryforward for multi-category FTC (IRC §904(d)).
   *  When provided, takes precedence over the single-category carryforward fields.
   *  Each category has its own per-year FIFO reconciliation. */
  foreignTaxCreditCarryforwardByCategory: z.record(
    z.enum(["passive", "general"]),
    z.array(z.object({
      taxYear: z.number().int(),
      amount: decimal,
    }))
  ).optional(),
  /** Actual separately computed AMT foreign-credit records; omission is unknown. */
  amtForeignTaxCreditCarryforwardByCategory: z.partialRecord(
    z.enum(["passive", "general"]),
    z.array(z.object({ taxYear: z.number().int(), amount: decimal }))
  ).optional(),
  qbiLossCarryforward: optionalDecimal,
  /** Actual active portion of the QBI loss carryover; unknown is not zero. */
  activeQbiLossCarryforward: optionalDecimalInput,
  /** Form 8995-A Part IV aggregation elections per Reg. §1.199A-4 */
  qbiAggregationElections: z.array(z.object({
    name: z.string(),
    componentBusinessNames: z.array(z.string()),
  })).default([]),
  charitableCarryforward: optionalDecimal,
  /** Per-year charitable contribution carryforward entries for FIFO reconciliation
   *  with 5-year expiration (IRC §170(d)(1)). Takes precedence over aggregate
   *  charitableCarryforward when provided. Each entry records the originating tax
   *  year and the remaining carryforward amount from that year. */
  charitableCarryforwardByYear: z.array(z.object({
    taxYear: z.number().int(),
    amount: decimal,
    category: z.enum(["cash_60", "noncash_50", "capital_gain_30", "other_30", "capital_gain_20"]).optional(),
  })).default([]),
  /** Per-partnership suspended excess business interest expense carryforward
   *  from prior years under IRC §163(j)(4)(B)(ii). Each entry tracks the
   *  partnership name/EIN and the suspended EBIE amount available for
   *  deduction when the partner receives partnership excess taxable income
   *  (Box 20 Code AE) or excess business interest income (Box 20 Code AF)
   *  from the same partnership. */
  suspendedBusinessInterest: z.array(z.object({
    partnershipName: z.string(),
    partnershipEIN: z.string(),
    amount: decimal,
  })).default([]),
  /** General business credit carryforward from prior years (IRC §39, 20-year limit) */
  generalBusinessCreditCarryforward: optionalDecimal,
  /** NOL carryforward from prior-year excess business losses under IRC §461(l) */
  excessBusinessLossNOL: optionalDecimal,
  /** General NOL carryforward available for deduction under IRC §172.
   *  When provided, takes precedence over excessBusinessLossNOL for the
   *  Schedule 1 Line 8a NOL deduction. When absent, the engine defaults
   *  to the excessBusinessLossNOL amount. For post-2017 NOLs, the
   *  deduction is limited to 80% of taxable income (IRC §172(a)(2)). */
  nolCarryforward: optionalDecimalInput,
  priorYearTax: optionalDecimal,
  priorYearAGI: optionalDecimal,
});

export const StandardDeductionFactsSchema = z.object({
  primaryBlind: z.boolean().optional(),
  spouseBlind: z.boolean().optional(),
  primaryCanBeClaimedAsDependent: z.boolean().optional(),
  spouseCanBeClaimedAsDependent: z.boolean().optional(),
  spouseItemizes: z.boolean().optional(),
  dualStatusAlien: z.boolean().optional(),
  nonresidentAlien: z.boolean().optional(),
  residentJointElection: z.boolean().optional(),
  shortTaxYear: z.boolean().optional(),
  dependentEarnedIncome: optionalDecimalInput,
  primaryDeathDate: z.string().nullable().optional(),
  spouseDeathDate: z.string().nullable().optional(),
  claimSpouseAdditionalDeduction: z.boolean().optional(),
  spouseHasGrossIncome: z.boolean().optional(),
  spouseFilesReturn: z.boolean().optional(),
});

export const DependentCareSchema = z.object({
  sourceFactsConfirmed: z.boolean().optional(),
  receivedBenefits: z.boolean().optional(),
  usesDeemedIncome: z.boolean().optional(),
  providers: z.array(z.object({
    name: z.string().trim().min(1), address: z.string().trim().min(1),
    identifierType: z.enum(["tin", "tax_exempt", "foreign_no_us_tin", "employer_furnished", "withheld"]),
    taxId: z.string().optional(), dueDiligenceStatement: z.string().optional(),
    householdEmployee: z.boolean(), amountPaid: decimal,
  })).max(50).optional(),
  qualifyingPersons: z.array(z.object({
    firstName: z.string().trim().min(1), lastName: z.string().trim().min(1),
    identifierType: z.enum(["tax_id", "died"]), taxId: z.string().optional(),
    over12Disabled: z.boolean(), qualifyingPersonConfirmed: z.boolean(), qualifiedExpenses: decimal,
  })).max(20).optional(),
  /** Actual completed prior-year expense worksheet credit; missing is not zero. */
  priorYearExpenseCredit: optionalDecimalInput,
  /** Earned income after applicable exclusions, SE adjustments and substantiated deemed monthly income. */
  primaryEarnedIncome: optionalDecimalInput,
  spouseEarnedIncome: optionalDecimalInput,
  /** Section 129 amount already determined excludable using Form 2441 Part III; unknown is not zero. */
  excludedDependentCareBenefits: optionalDecimalInput,
  eligibilityConfirmed: z.boolean().optional(),
  expenses: decimal,
  qualifyingIndividuals: z.number().int().min(1).default(1),
});

/** Actual Form 2441 Part III sources. Omission is unknown, including empty arrays and zero amounts. */
export const DependentCareBenefitsSchema = z.object({
  sourceFactsConfirmed: z.boolean().optional(),
  exclusionEligibilityConfirmed: z.boolean().optional(),
  /** Part I records for a benefits-only return without manufacturing a Part II credit claim. */
  providers: DependentCareSchema.shape.providers,
  usesDeemedIncome: z.boolean().optional(),
  employeeBenefits: z.array(z.object({
    sourceId: z.string().trim().min(1).optional(),
    owner: z.enum(["primary", "spouse"]).optional(),
    benefitsReported: optionalDecimalInput,
    alreadyIncludedInWages: optionalDecimalInput,
    priorYearCarryoverUsed: optionalDecimalInput,
    forfeited: optionalDecimalInput,
    carriedForward: optionalDecimalInput,
  })).max(100).optional(),
  selfEmployedBenefits: z.array(z.object({
    sourceId: z.string().trim().min(1).optional(),
    owner: z.enum(["primary", "spouse"]).optional(),
    schedule: z.enum(["schedule-c", "schedule-e", "schedule-f"]).optional(),
    /** Actual received benefits; amounts not received are not manufactured as line 14 forfeitures. */
    benefitsReceived: optionalDecimalInput,
    priorYearCarryoverUsed: optionalDecimalInput,
    /** Actual amount already included in this activity's reported deductible expenses, including known zero. */
    alreadyDeducted: optionalDecimalInput,
  })).max(100).optional(),
  deductionAllocations: z.array(z.object({
    sourceId: z.string().trim().min(1).optional(),
    owner: z.enum(["primary", "spouse"]).optional(),
    schedule: z.enum(["schedule-c", "schedule-e", "schedule-f"]).optional(),
    /** Actual whole-dollar allocation of calculated line 24 to this activity. */
    amount: optionalDecimalInput,
  })).max(100).optional(),
  planExclusionLimit: optionalDecimalInput,
  qualifiedExpensesIncurred: optionalDecimalInput,
  /** Signed completed Part III worksheets, excluding line 12 benefits; not combined household earnings. */
  primaryEarnedIncome: optionalDecimalInput,
  spouseEarnedIncome: optionalDecimalInput,
  earnedIncomeWorksheetConfirmed: z.boolean().optional(),
  spouseLivedApartLast6Months: z.boolean().optional(),
  paidOverHalfHomeCost: z.boolean().optional(),
  qualifyingPersonMainHomeOverHalfYear: z.boolean().optional(),
  spouseDiedDuringYear: z.boolean().optional(),
  useDeceasedSpouseEarnedIncome: z.boolean().optional(),
  qualifyingIndividuals: z.number().int().min(0).optional(),
  /** Actual line 30 paid expenses after excluding line 28 benefits and expenses claimed elsewhere. */
  qualifiedExpensesPaidForCredit: optionalDecimalInput,
  creditExpenseCoordinationConfirmed: z.boolean().optional(),
});

const EducationInstitutionSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  ein: z.string().regex(/^\d{2}-?\d{7}$/).optional(),
  receivedCurrentYear1098T: z.boolean(),
  receivedPriorYear1098TWithBox7: z.boolean(),
});
const EducationStudentFacts = {
  name: z.string(),
  studentTaxId: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/).optional(),
  studentRole: z.enum(["primary", "spouse", "dependent"]).optional(),
  qualifiedExpenses: decimal,
  studentSsnEligible: z.boolean().optional(),
  studentTinEligible: z.boolean().optional(),
  institutionEligible: z.boolean().optional(),
  expensesEligibilityConfirmed: z.boolean().optional(),
  form1098TRequirementMet: z.boolean().optional(),
  institutions: z.array(EducationInstitutionSchema).optional(),
};
export const EducationExpensesSchema = z.object({
  primarySsnEligible: z.boolean().optional(),
  spouseSsnEligible: z.boolean().optional(),
  primaryTinEligible: z.boolean().optional(),
  claimedAsDependent: z.boolean().optional(),
  canBeClaimedAsDependent: z.boolean().optional(),
  nonresidentAlien: z.boolean().optional(),
  residentJointElection: z.boolean().optional(),
  aocBanInEffect: z.boolean().optional(),
  form8862Required: z.boolean().optional(),
  form8862Completed: z.boolean().optional(),
  possessionIncomeExclusion: optionalDecimalInput,
  aocStudents: z.array(z.object({
    ...EducationStudentFacts,
    institutionEin: z.string().regex(/^\d{2}-?\d{7}$/).optional(),
    priorYearsClaimed: z.number().int().min(0).optional(),
    completedFirstFourYearsBeforeYear: z.boolean().optional(),
    enrolledAtLeastHalfTime: z.boolean().optional(),
    pursuingDegreeOrCredential: z.boolean().optional(),
    felonyDrugConviction: z.boolean().optional(),
  })).default([]),
  llcStudents: z.array(z.object({
    ...EducationStudentFacts,
    courseEligibilityConfirmed: z.boolean().optional(),
  })).optional(),
  llcExpenses: optionalDecimal,
  refundableAocEligible: z.boolean().optional(),
  refundableAocFacts: z.object({
    fullTimeStudent: z.boolean(),
    earnedIncome: decimal,
    totalSupport: decimal,
    parentAlive: z.boolean(),
  }).optional(),
});

export const BusinessExpensesSchema = z.object({
  advertising: optionalDecimal,
  amortization: optionalDecimal,
  badDebts: optionalDecimal,
  bankCharges: optionalDecimal,
  carAndTruck: optionalDecimal,
  commissionsAndFees: optionalDecimal,
  contractLabor: optionalDecimal,
  depletion: optionalDecimal,
  depreciation: optionalDecimal,
  duesAndPublications: optionalDecimal,
  employeeBenefitPrograms: optionalDecimal,
  businessInterest: optionalDecimal,
  freight: optionalDecimal,
  idcsAmortization: optionalDecimal,
  idcsCurrentExpensing: optionalDecimal,
  section179Expense: optionalDecimal,
  insurance: optionalDecimal,
  laundryAndCleaning: optionalDecimal,
  legalAndProfessional: optionalDecimal,
  managementFees: optionalDecimal,
  officeExpense: optionalDecimal,
  pensionAndProfitSharing: optionalDecimal,
  postage: optionalDecimal,
  rentOnBusinessProperty: optionalDecimal,
  repairsAndMaintenance: optionalDecimal,
  startupCostsDirectExpense: optionalDecimal,
  supplies: optionalDecimal,
  taxes: optionalDecimal,
  telephone: optionalDecimal,
  travel: optionalDecimal,
  meals: optionalDecimal,
  utilities: optionalDecimal,
  wages: optionalDecimal,
  otherExpenses: optionalDecimal,
});

const form4137SourceAmount = decimal.refine(value => d(value).gte(0), "Actual tip amount must be nonnegative");
/** Actual annual columns already reconciled to the IRS reporting-year rules. */
export const Form4137SourceFactsSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().trim().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  allEmployersIncluded: z.boolean().optional(),
  reportingYearTreatmentConfirmed: z.boolean().optional(),
  railroadRetirementCompensation: form4137SourceAmount.optional(),
  noncashTipsNotIncludedInWages: form4137SourceAmount.optional(),
  employers: z.array(z.object({
    sourceId: z.string().trim().min(1).optional(),
    employerName: z.string().trim().min(1).optional(),
    employerEin: z.string().optional(),
    w2SourceIds: z.array(z.string().trim().min(1)).optional(),
    cashAndChargeTipsReceived: form4137SourceAmount.optional(),
    tipsReportedToEmployer: form4137SourceAmount.optional(),
    allocatedTips: form4137SourceAmount.optional(),
    adequateRecordsSupportUnreportedTips: z.boolean().optional(),
    railroadRetirementCovered: z.boolean().optional(),
    medicareOnlyGovernmentUnreportedTips: form4137SourceAmount.optional(),
    medicareOnlyGovernmentQualificationConfirmed: z.boolean().optional(),
    reportedTipsNotIncludedInBox7: form4137SourceAmount.optional(),
    box7TipsExcludedFromReportedTotal: form4137SourceAmount.optional(),
    reportedTipReconciliationReference: z.string().trim().min(1).optional(),
    smallTipMonths: z.array(z.object({
      month: z.number().int().min(1).max(12).optional(),
      totalCashAndChargeTips: form4137SourceAmount.optional(),
      tipsReportedToEmployer: form4137SourceAmount.optional(),
    })).optional(),
  })).optional(),
});
export const Form4137Schema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  unreportedTipIncome: decimal.optional(),
  socialSecurityWagesAndTipsAlreadyReported: decimal.optional(),
  medicareOnlyGovernmentEmployeeTips: decimal.optional(),
  sourceFacts: Form4137SourceFactsSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.sourceFacts === undefined && value.unreportedTipIncome === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unreportedTipIncome"], message: "Form4137 requires actual source facts or a legacy summary" });
  }
  if (value.sourceFacts === undefined && d(value.medicareOnlyGovernmentEmployeeTips).greaterThan(d(value.unreportedTipIncome))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 4137 Medicare-only government-employee tips cannot exceed unreported tip income",
      path: ["medicareOnlyGovernmentEmployeeTips"],
    });
  }
});

export const Form8919Schema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  wagesNotReportedOnW2: decimal,
  socialSecurityWagesAndTipsAlreadyReported: decimal.optional(),
  rrtaCompensationSubjectToSocialSecurityTax: decimal.optional(),
});

/** A depreciable asset for per-asset MACRS depreciation computation. */
export const DepreciableAssetSchema = z.object({
  /** Descriptive name (e.g., "Office computer", "Rental building") */
  description: z.string().optional(),
  /** Depreciable cost basis after any section 179 election */
  costBasis: decimal,
  /** Date placed in service (YYYY-MM or YYYY-MM-DD) */
  placedInServiceDate: z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/,
    "Must be YYYY-MM or YYYY-MM-DD",
  ),
  /** MACRS recovery period in years */
  recoveryPeriod: z.enum(["3", "5", "7", "10", "15", "20", "25", "27.5", "39"]),
  /** Depreciation method (defaults: 200DB for 3–20yr GDS, SL for 27.5/39yr) */
  method: z.enum(["200DB", "150DB", "SL"]).optional(),
  /** Convention (defaults: halfYear for personal property, midMonth for real property) */
  convention: z.enum(["halfYear", "midQuarter", "midMonth"]).optional(),
  /** If true, asset was disposed of during the current tax year */
  disposedDuringYear: z.boolean().optional(),
  /** If true, this is listed property subject to Part V rules (IRC §280F(d)(4)) */
  isListedProperty: z.boolean().optional(),
  /** Business-use percentage (0–100). Required for listed property. Determines
   *  MACRS vs ADS and limits depreciation to this proportion of computed amount. */
  businessUsePercentage: z.number().min(0).max(100).optional(),
  /** If true, this is a passenger automobile subject to IRC §280F annual caps */
  isPassengerAutomobile: z.boolean().optional(),
  /** If true, first-year bonus depreciation is claimed (uses higher §280F year-1 cap) */
  firstYearBonusEligible: z.boolean().optional(),
  /** If true, business use dropped from >50% to ≤50% in the current year, triggering
   *  IRC §280F(b)(2) recapture of excess MACRS depreciation over ADS straight-line
   *  from prior years. Only meaningful for listed property. */
  section280FRecaptureTriggered: z.boolean().optional(),
  /** Cumulative MACRS depreciation actually claimed in all prior years while business
   *  use was >50%. Required when section280FRecaptureTriggered is true. */
  cumulativePriorMacrsDeductions: optionalDecimal,
  /** Cumulative ADS straight-line depreciation that would have been allowed in all
   *  prior years. Required when section280FRecaptureTriggered is true. */
  cumulativePriorAdsDeductions: optionalDecimal,
});

/** An amortizable asset for per-asset Part VI amortization computation. */
export const AmortizableAssetSchema = z.object({
  /** Descriptive name (e.g., "Goodwill from acquisition", "Startup costs") */
  description: z.string().optional(),
  /** Total amortizable amount (for §195/§709, this is the amount AFTER any immediate deduction) */
  amortizableAmount: decimal,
  /** Date amortization begins (YYYY-MM or YYYY-MM-DD). For §174, the engine
   *  overrides this to the mid-year (July 1) of the year specified. */
  dateAmortizationBegins: z.string().regex(
    /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/,
    "Must be YYYY-MM or YYYY-MM-DD",
  ),
  /** IRC code section governing the amortization period and convention */
  codeSection: z.enum(["197", "195", "174domestic", "174foreign", "709", "169", "171", "other"]),
  /** Amortization period in months. Required for §171 and "other"; optional
   *  override for sections with statutory defaults (§197=180, §195=180, etc.) */
  amortizationPeriodMonths: z.number().positive().optional(),
});

export const Form4562Schema = z.object({
  /** Tax year for computing per-asset depreciation (defaults to 2025) */
  taxYear: z.number().optional(),
  /** Per-asset detail — when provided, the engine computes Lines 17, 19, 20 from assets */
  assets: z.array(DepreciableAssetSchema).optional(),
  /** Per-asset amortization — when provided, the engine computes Lines 42, 43 from amortizable assets */
  amortizableAssets: z.array(AmortizableAssetSchema).optional(),
  section179MaximumDeduction: optionalDecimal,
  section179TotalCost: optionalDecimal,
  section179ThresholdCost: optionalDecimal,
  section179ElectedCost: optionalDecimal,
  section179CarryoverFromPriorYear: optionalDecimal,
  section179BusinessIncomeLimit: optionalDecimal,
  section179ExpenseDeduction: optionalDecimal,
  section179CarryoverToNextYear: optionalDecimal,
  specialDepreciationAllowance: optionalDecimal,
  section168f1Depreciation: optionalDecimal,
  otherDepreciation: optionalDecimal,
  /** Validated summary total for pre-current-year MACRS assets (used when assets array is not provided) */
  macrsPre2025AssetsDepreciation: optionalDecimal,
  /** Validated summary total for current-year GDS MACRS (used when assets array is not provided) */
  macrsCurrentYearGdsDepreciation: optionalDecimal,
  /** Validated summary total for current-year ADS MACRS (used when assets array is not provided) */
  macrsCurrentYearAdsDepreciation: optionalDecimal,
  listedPropertyDepreciation: optionalDecimal,
  currentYearAmortization: optionalDecimal,
  priorYearAmortization: optionalDecimal,
});

export const Form4797PropertySaleSchema = z.object({
  /** Description of property (e.g. "Office equipment", "Rental building") */
  description: z.string(),
  /** Date acquired (YYYY-MM-DD or "various") */
  dateAcquired: z.string().optional(),
  /** Date sold (YYYY-MM-DD) */
  dateSold: z.string().optional(),
  /** Original cost or other basis, plus capital improvements and expense of sale */
  costOrBasis: decimal,
  /** Total depreciation (or depletion) allowed or allowable */
  depreciationAllowed: optionalDecimal,
  /** Gross selling price */
  grossSalesPrice: decimal,
  /** Property type for recapture classification */
  propertyType: z.enum(["section1245", "section1250"]),
  /**
   * For section 1250 property: straight-line depreciation that would have been
   * allowed. Used to compute excess depreciation over straight-line. If not
   * provided, defaults to depreciationAllowed (the common post-1986 MACRS case
   * where all depreciation was straight-line, yielding $0 section 1250
   * ordinary recapture).
   */
  straightLineDepreciation: decimal.optional(),
  /**
   * Whether held more than one year. Defaults to true. When false, the entire
   * gain or loss is ordinary (Part II) with no section 1231 treatment.
   */
  heldMoreThanOneYear: z.boolean().default(true),
});

export const Form4797Schema = z.object({
  netSection1231GainOrLoss: decimal.optional(),
  nonrecapturedNetSection1231Losses: optionalDecimal,
  /** Per-property sales for Part II/III depreciation recapture computation */
  propertySales: z.array(Form4797PropertySaleSchema).default([]),
});

export const Form8829ExpenseBucketSchema = z.object({
  casualtyLosses: optionalDecimal,
  deductibleMortgageInterest: optionalDecimal,
  realEstateTaxes: optionalDecimal,
  excessMortgageInterest: optionalDecimal,
  excessRealEstateTaxes: optionalDecimal,
  insurance: optionalDecimal,
  rent: optionalDecimal,
  repairsAndMaintenance: optionalDecimal,
  utilities: optionalDecimal,
  otherExpenses: optionalDecimal,
});

export const Form8829Schema = z.object({
  areaUsedForBusiness: z.number().positive(),
  totalAreaOfHome: z.number().positive(),
  daycareHoursUsed: z.number().nonnegative().optional(),
  daycareHoursAvailable: z.number().positive().optional(),
  grossIncomeLimit: decimal.optional(),
  directExpenses: Form8829ExpenseBucketSchema.optional(),
  indirectExpenses: Form8829ExpenseBucketSchema.optional(),
  priorYearOperatingExpensesCarryover: optionalDecimal,
  excessCasualtyLosses: optionalDecimal,
  priorYearExcessCasualtyLossesCarryover: optionalDecimal,
  priorYearDepreciationCarryover: optionalDecimal,
  adjustedBasisOrFairMarketValue: decimal.optional(),
  landValue: optionalDecimal,
  depreciationPercentage: decimal.optional(),
}).superRefine((value, ctx) => {
  if (
    (value.daycareHoursUsed !== undefined || value.daycareHoursAvailable !== undefined)
    && (value.daycareHoursUsed === undefined || value.daycareHoursAvailable === undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 8829 daycare calculations require both daycareHoursUsed and daycareHoursAvailable",
      path: ["daycareHoursUsed"],
    });
  }

  if (
    value.daycareHoursUsed !== undefined
    && value.daycareHoursAvailable !== undefined
    && value.daycareHoursUsed > value.daycareHoursAvailable
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Form 8829 daycareHoursUsed cannot exceed daycareHoursAvailable",
      path: ["daycareHoursUsed"],
    });
  }
});

export const ScheduleCInputSchema = z.object({
  qbiMateriallyParticipated: z.boolean().optional(),
  principalBusinessActivity: z.string().optional(),
  allInvestmentAtRisk: z.boolean().optional(),
  otherExpenseDescription: z.string().optional(),
  businessName: z.string().optional(),
  businessCode: z.string().optional(),
  ein: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA Class 4 reporting
  accountingMethod: z.enum(["cash", "accrual"]).optional(),
  grossReceipts: decimal.optional(),
  returnsAndAllowances: optionalDecimal,
  costOfGoodsSold: optionalDecimal,
  otherIncome: optionalDecimal,
  expenses: BusinessExpensesSchema.optional(),
  homeOffice: z.object({
    method: z.enum(["simplified", "actual"]),
    squareFeet: z.number().int().optional(),
    actualAmount: decimal.optional(),
    form8829: Form8829Schema.optional(),
  }).optional(),
  /** W-2 wages paid to employees of this Schedule C business (for Form 8995-A W-2/UBIA limitation) */
  w2WagesPaid: optionalDecimal,
  /** UBIA of qualified property held by this Schedule C business (for Form 8995-A) */
  ubiaQualifiedProperty: optionalDecimal,
  /** Whether this Schedule C business is a specified service trade or business under IRC §199A(d)(2) */
  isSST: z.boolean().default(false),
});

export const FarmExpensesSchema = z.object({
  breedingFees: optionalDecimal,          // Line 13
  carAndTruck: optionalDecimal,           // Line 10
  chemicals: optionalDecimal,             // Line 11
  conservation: optionalDecimal,          // Line 12 (capped at 25% gross income)
  customHire: optionalDecimal,            // Line 13
  depreciation: optionalDecimal,          // Line 14
  section179Expense: optionalDecimal,     // PA Schedule F Line 16b
  employeeBenefits: optionalDecimal,      // Line 15
  feed: optionalDecimal,                  // Line 16
  fertilizersAndLime: optionalDecimal,    // Line 17
  freightAndTrucking: optionalDecimal,    // Line 18
  gasolineFuelOil: optionalDecimal,       // Line 19
  insurance: optionalDecimal,             // Line 20
  jobsCredit: optionalDecimal,            // Line 23b
  landClearing: optionalDecimal,          // Line 24
  mortgageInterest: optionalDecimal,      // Line 21a
  otherInterest: optionalDecimal,         // Line 21b
  laborHired: optionalDecimal,            // Line 22
  pensionAndProfitSharing: optionalDecimal, // Line 23
  rentLeaseVehicles: optionalDecimal,     // Line 24a
  rentLeaseOther: optionalDecimal,        // Line 24b
  repairsAndMaintenance: optionalDecimal, // Line 25
  seedsAndPlants: optionalDecimal,        // Line 26
  storageAndWarehousing: optionalDecimal, // Line 27
  supplies: optionalDecimal,              // Line 28
  taxes: optionalDecimal,                 // Line 29
  utilities: optionalDecimal,             // Line 30
  veterinaryBreedingMedicine: optionalDecimal, // Line 31
  otherExpenses: optionalDecimal,         // Line 32f
});

export const ScheduleFInputSchema = z.object({
  qbiMateriallyParticipated: z.boolean().optional(),
  principalCropOrActivity: z.string().optional(),
  activityCode: z.string().optional(),    // NAICS code from Part IV
  ein: z.string().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA Class 4 reporting
  accountingMethod: z.enum(["cash", "accrual"]).default("cash"),
  materiallyParticipated: z.boolean().default(true),
  // Part I: Farm Income — Cash Method
  salesOfPurchasedLivestock: optionalDecimal,        // Line 1a
  costOfPurchasedLivestock: optionalDecimal,         // Line 1b
  salesOfProductsRaised: optionalDecimal,            // Line 2
  cooperativeDistributions: optionalDecimal,         // Line 3b (taxable amount)
  cooperativeNonIncomeItems: optionalDecimal,        // PA Schedule F Line 5b
  agriculturalProgramPayments: optionalDecimal,      // Line 4b / Section III Line 41a
  agriculturalProgramMaterialsServices: optionalDecimal, // PA Schedule F Line 7b / Section III Line 41b
  cccLoansElected: optionalDecimal,                  // Line 5a / Section III Line 42
  cccLoansForfeited: optionalDecimal,                // Line 5c (taxable amount) / Section III Line 42
  cropInsuranceProceeds: optionalDecimal,            // Line 6b (taxable amount)
  priorYearDeferredCropInsurance: optionalDecimal,   // Line 6d
  customHireIncome: optionalDecimal,                 // Line 7 / Section III Line 43
  otherFarmIncome: optionalDecimal,                  // Line 8 / Section III Line 44
  // Section III: Farm Income — Accrual Method
  accrualSalesDuringYear: optionalDecimal,           // Line 40
  accrualBeginningInventory: optionalDecimal,        // Line 46
  accrualPurchasesDuringYear: optionalDecimal,       // Line 47
  accrualEndingInventory: optionalDecimal,           // Line 49
  // Part II: Farm Expenses
  expenses: FarmExpensesSchema.optional(),
  // Conservation carryforward from prior years
  conservationCarryforward: optionalDecimal,
  /** W-2 wages paid to farm employees (for Form 8995-A W-2/UBIA limitation) */
  w2WagesPaid: optionalDecimal,
  /** UBIA of qualified property held by this farm (for Form 8995-A) */
  ubiaQualifiedProperty: optionalDecimal,
});

export const RentalPropertySchema = z.object({
  description: z.string(), // e.g. "123 Main St, Unit A"
  accountHolder: z.enum(["primary", "spouse", "joint"]).optional(),
  allInvestmentAtRisk: z.boolean().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  paClassification: z.object({
    sourceReference: z.string().min(1),
    factsConfirmed: z.boolean(),
    offeredToPublic: z.boolean(),
    forProfit: z.boolean(),
    regularAndContinuous: z.boolean(),
    averageCustomerUseDays: decimal,
    availableDuringBusinessHours: z.boolean(),
    significantServices: z.boolean(),
    significantOperatingExpenses: z.boolean(),
    incidentalToRealEstateSales: z.boolean(),
    relatedPartyRental: z.boolean(),
    dealerPropertyHeldForSale: z.boolean(),
  }).optional(),
  /** Actual PA amounts after rental/personal allocation, before ownership allocation.
   * Federal expense and depreciation amounts are not a substitute. No zero defaults. */
  paIncomeExpenses: z.object({
    taxYear: z.number().int(),
    sourceReference: z.string().trim().min(1),
    factsConfirmed: z.boolean(),
    amountsBeforeOwnershipAllocation: z.boolean(),
    expensesAreRentalUseOnly: z.boolean(),
    paRulesApplied: z.boolean(),
    grossRents: decimal,
    advertising: decimal,
    autoTravel: decimal,
    cleaning: decimal,
    commissions: decimal,
    insurance: decimal,
    legalProfessional: decimal,
    managementFees: decimal,
    mortgageInterest: decimal,
    otherInterest: decimal,
    repairs: decimal,
    supplies: decimal,
    taxes: decimal,
    utilities: decimal,
    depreciation: decimal,
    otherExpenses: decimal,
    depreciationSourceReference: z.string().optional(),
    allocationSourceReference: z.string().optional(),
    otherExpenseDescription: z.string().optional(),
  }).optional(),
  otherExpenseDescription: z.string().optional(),
  propertyType: z.enum(["single_family", "multi_family", "vacation", "commercial", "land", "other"]).default("single_family"),
  personalUseDays: z.number().int().min(0).default(0),
  rentalDays: z.number().int().min(0).default(365),
  ownershipPercentage: decimal.optional(), // default "100"
  isActiveParticipant: z.boolean().default(true),
  rents: decimal,
  advertising: optionalDecimal,
  autoTravel: optionalDecimal,
  cleaning: optionalDecimal,
  commissions: optionalDecimal,
  insurance: optionalDecimal,
  legalProfessional: optionalDecimal,
  managementFees: optionalDecimal,
  mortgageInterest: optionalDecimal,
  otherInterest: optionalDecimal,
  repairs: optionalDecimal,
  supplies: optionalDecimal,
  taxes: optionalDecimal,
  utilities: optionalDecimal,
  depreciation: optionalDecimal,
  form4562: Form4562Schema.optional(),
  otherExpenses: optionalDecimal,
  // Section 199A QBI — rental activity qualifies as trade/business (Rev. Proc. 2019-38 safe harbor or case law)
  qualifiesForQBI: z.boolean().default(false),
  qbiMateriallyParticipated: z.boolean().optional(),
  qbiW2Wages: optionalDecimal, // W-2 wages paid by the rental activity (for Form 8995-A detailed calculation)
  qbiUBIA: optionalDecimal, // UBIA of qualified property (for Form 8995-A detailed calculation)
  qbiIsSST: z.boolean().default(false), // Whether the rental activity is a specified service trade or business
});

export const IraDeductionWorksheetSchema = z.object({
  /** Actual eligible compensation after each owner's SE-tax/retirement deductions,
   * before the joint lower-earner allocation. Unknowns have no defaults. */
  sourceFactsConfirmed: z.boolean().optional(),
  primaryCompensation: optionalDecimalInput,
  spouseCompensation: optionalDecimalInput,
  primaryRothContributions: optionalDecimalInput,
  spouseRothContributions: optionalDecimalInput,
  primarySection501c18Contributions: optionalDecimalInput,
  spouseSection501c18Contributions: optionalDecimalInput,
  /** Traditional IRA contributions for the primary taxpayer */
  primaryContributions: decimal,
  /** Whether the primary taxpayer is an active participant in an employer retirement plan (W-2 Box 13 Retirement Plan checked) */
  primaryIsActiveParticipant: z.boolean(),
  /** Whether the primary taxpayer is age 50 or older by the end of the tax year */
  primaryAge50OrOlder: z.boolean().optional(),
  /** Traditional IRA contributions for the spouse (MFJ only) */
  spouseContributions: optionalDecimalInput,
  /** Whether the spouse is an active participant in an employer retirement plan */
  spouseIsActiveParticipant: z.boolean().optional(),
  /** Whether the spouse is age 50 or older by the end of the tax year */
  spouseAge50OrOlder: z.boolean().optional(),
});

export const EicConfigSchema = z.object({
  /** Whether the MFS filer qualifies for the separated-spouse EIC exception
   *  (lived apart from spouse for the last 6 months of the year + qualifying child) */
  mfsEligible: z.boolean().default(false),
  /** Override investment income (otherwise computed by the engine from interest, dividends, capital gains, rental) */
  investmentIncomeOverride: optionalDecimal,
  /** Whether the primary filer is a full-time student (disqualifies childless EIC) */
  primaryIsFullTimeStudent: z.boolean().default(false),
});

/** Form 2210 regular-method facts. Unknown values intentionally have no defaults. */
const Form2210DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const instant = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}, "Must be an actual calendar date");
const Form2210PaymentSchema = z.object({ date: Form2210DateSchema, amount: decimal });
export const Form2210Schema = z.object({
  calendarYearTaxpayer: z.boolean().optional(),
  residentReturn: z.boolean().optional(),
  farmerOrFisher: z.boolean().optional(),
  disasterReliefClaimed: z.boolean().optional(),
  waiverRequested: z.boolean().optional(),
  calculationMethod: z.enum(["regular", "annualized"]).optional(),
  withholdingMethod: z.enum(["equal-installments", "actual-dates"]).optional(),
  withholdingPayments: z.array(Form2210PaymentSchema).optional(),
  priorYearTaxStatus: z.enum(["return-filed", "no-return", "no-tax-liability"]).optional(),
  priorYearFullYear: z.boolean().optional(),
  priorYearResidentAllYear: z.boolean().optional(),
  priorYearJointReturn: z.boolean().optional(),
  // Actual instructions line 8 computation, including filing-status allocation.
  priorYearTaxForForm2210: decimal.optional(),
  priorYearAgiForForm2210: decimal.optional(),
  priorYearTaxComputationConfirmed: z.boolean().optional(),
  // Effective applied-credit dates must come from actual payment/return history.
  priorYearCreditPayments: z.array(Form2210PaymentSchema).optional(),
  returnPayments: z.array(Form2210PaymentSchema).optional(),
  returnFiledDate: Form2210DateSchema.optional(),
  returnPaidInFullDate: Form2210DateSchema.optional(),
});

/** Actual completed attribution of allowed taxpayer deductions under Reg.1.199A-3(b)(1)(vi). */
export const QBIDeductionAllocationsSchema = z.object({
  sourceFactsConfirmed: z.boolean(),
  rows: z.array(z.object({
    sourceId: z.string().regex(/^(scheduleC|scheduleF|cryptoBusiness|scheduleK1:\d+|nonQbi)$/),
    accountHolder: z.enum(["primary", "spouse"]),
    deductibleSelfEmploymentTax: decimal,
    selfEmployedHealthInsurance: decimal,
    selfEmployedRetirementPlans: decimal,
  })),
});

/** Schedule 1 line 11 actual sources; omitted qualification is not a negative answer. */
export const EducatorExpenseSourceSchema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  taxYear: z.number().int().optional(),
  schoolYear: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  schools: z.array(z.object({
    name: z.string(),
    role: z.enum(["teacher", "instructor", "counselor", "principal", "aide", "interscholastic_sports_administrator", "coach", "other"]).optional(),
    /** Required for2026; historical2025 omission retains only the original K12 contract. */
    level: z.enum(["k12", "early_childhood", "other"]).optional(),
    earlyChildhoodNonresidentChildrenUnder6: z.number().int().nonnegative().optional(),
    operatedAtPublicExpense: z.boolean().optional(), receivesFeePaymentOrGrant: z.boolean().optional(),
    schoolEligible: z.boolean().optional(),
    hoursWorked: optionalDecimalInput,
  })).optional(),
  expenses: z.array(z.object({
    sourceId: z.string(), datePaid: z.string(), description: z.string(),
    category: z.enum(["classroom", "professional_development", "protective_supplies", "other"]).optional(),
    amount: optionalDecimalInput,
    ordinaryAndNecessary: z.boolean().optional(), qualifyingUse: z.boolean().optional(),
    /** Actual broader section67 instructional activity; qualifying classroom use already suffices. */
    instructionalActivity: z.boolean().optional(),
    itemizedReimbursements: optionalDecimalInput, itemizedTaxFreeFunding: optionalDecimalInput,
    healthOrPhysicalEducation: z.boolean().optional(), athleticSupplies: z.boolean().optional(),
    deductedElsewhere: z.boolean().optional(),
  })).optional(),
  reimbursementsNotInWages: optionalDecimalInput,
  excludedSavingsBondInterest: optionalDecimalInput,
  nontaxableQualifiedTuitionProgramAmount: optionalDecimalInput,
  nontaxableCoverdellEarnings: optionalDecimalInput,
});

export const AdjustmentsSchema = z.object({
  estimatedTaxPayments: z
    .array(
      z.object({
        date: z.string(),
        amount: decimal,
        type: z.enum(["federal", "state"]),
        state: z.string().optional(),
      })
    )
    .default([]),
  extensionPayments: z
    .array(
      z.object({
        date: z.string(),
        amount: decimal,
        type: z.enum(["federal", "state"]),
        state: z.string().optional(),
      })
    )
    .default([]),
  priorYearAppliedCredits: z
    .array(
      z.object({
        sourceTaxYear: z.number().int(),
        amount: decimal,
        type: z.enum(["federal", "state"]),
        state: z.string().optional(),
      })
    )
    .default([]),
  otherTaxesPaid: optionalDecimal,
  educatorExpenses: optionalDecimal,
  primaryEducatorExpenses: optionalDecimal,
  spouseEducatorExpenses: optionalDecimal,
  educatorExpenseSources: z.array(EducatorExpenseSourceSchema).optional(),
  businessExpenseAdjustments: optionalDecimal,
  hsaDeduction: optionalDecimal,
  armedForcesMovingExpenses: optionalDecimal,
  archerMSADeduction: optionalDecimal,
  selfEmployedHealthInsurance: optionalDecimal,
  studentLoanInterest: optionalDecimal,
  iraDeduction: optionalDecimal,
  otherAdjustmentsTotal: optionalDecimal,
  alimonyPaid: optionalDecimal,
  alimonyRecipientSSN: z.string().optional(),
  earlyWithdrawalPenalty: optionalDecimal,
  /** Self-employed retirement plan contributions (SEP, SIMPLE, qualified plans) — Schedule 1 Line 16 */
  seRetirementContributions: optionalDecimal,
});

export const ScheduleAInputSchema = z.object({
  medicalExpenses: optionalDecimal,
  /** Qualified payments not already counted on a Form 1098. */
  realEstateTaxes: optionalDecimal,
  /** Qualified income tax payments not already counted in withholding or estimates. */
  additionalStateLocalIncomeTaxes: optionalDecimal,
  /** Actual modeled non-W2 withholding already deducted on C/E/F; unknown is not zero. */
  nonW2IncomeTaxesDeductedElsewhere: optionalDecimalInput,
  personalPropertyTaxes: optionalDecimal,
  /** SALT MAGI worksheet line 3a. Not deducted from AGI by this adapter. */
  excludedPuertoRicoIncome: optionalDecimal,
  /** SALT MAGI worksheet line 3d; Form 4563 itself remains a separate scenario. */
  form4563ExcludedIncome: optionalDecimal,
  investmentInterestExpense: optionalDecimal,
  gamblingWinnings: optionalDecimal,
  gamblingLosses: optionalDecimal,
  gamblingExpenses: optionalDecimal,
});

/**
 * Sales Tax Deduction election — Schedule A Line 5a alternative
 *
 * Per IRC §164(b)(5)(I), taxpayers who itemize may elect to deduct state
 * and local general sales taxes instead of state/local income taxes.
 * Ref: Schedule A Instructions; IRS Optional State Sales Tax Table.
 */
export const SalesTaxDeductionSchema = z.object({
  /** Two-letter state code (e.g. "TX", "FL") for IRS table lookup */
  state: z.string().length(2),
  /** Average local sales tax rate as a decimal (e.g. 0.02 for 2%).
   *  Capped at the state rate per IRS instructions. */
  localSalesTaxRate: z.string().regex(/^-?\d+(\.\d+)?$/).default("0"),
  /** Method: "table" uses IRS Optional Sales Tax Table; "actual" uses
   *  taxpayer's total from receipts. */
  method: z.enum(["table", "actual"]).default("table"),
  /** For "actual" method: total general sales tax paid from receipts
   *  (excluding specific large purchases listed below). */
  actualGeneralSalesTax: optionalDecimal,
  /** Actual sales tax paid on specific large purchases at the general rate
   *  (motor vehicles, boats, aircraft, homes, home building materials). */
  specificPurchaseSalesTax: z.array(z.object({
    description: z.string(),
    salesTaxPaid: decimal,
  })).default([]),
  /** When true, the engine auto-compares income taxes vs sales taxes and
   *  uses whichever is larger for Line 5a. When false, the sales tax
   *  election is unconditional. */
  autoCompare: z.boolean().default(true),
});
export type SalesTaxDeduction = z.infer<typeof SalesTaxDeductionSchema>;

/** Actual Form461 classification after basis, at-risk and passive limitations. */
export const Form461SourceSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().trim().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  atRiskAndPassiveLimitationsApplied: z.boolean().optional(),
  scheduleESupplementalIncome: optionalDecimalInput,
  passiveLossModifiedAgi: optionalDecimalInput, // Actual completed Form8582 line6 worksheet when passive sources interact.
  tradeOrBusinessCapitalGainNetIncome: optionalDecimalInput,
  noncapitalNonbusinessIncome: optionalDecimalInput,
  noncapitalNonbusinessLoss: optionalDecimalInput,
  noncapitalBusinessNet: optionalDecimalInput,
  otherBusinessIncome: optionalDecimalInput,
  otherBusinessDeductions: optionalDecimalInput,
});

export const Form4952InputSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const amounts = ["investmentInterestExpense", "priorYearDisallowed", "grossInvestmentIncome", "qualifiedDividendsIncluded", "netGainFromInvestmentProperty", "netCapitalGainFromInvestmentProperty", "electedPreferentialIncome", "investmentExpenses"];
  return { ...record, sourceFactsComplete: record.sourceFactsComplete !== false && amounts.every(key => record[key] !== undefined) };
}, z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().trim().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  /** Computed from raw source presence before historical defaults are applied. */
  sourceFactsComplete: z.boolean().optional(),
  priorYearSourceTaxYear: z.number().int().optional(),
  /** Line 1: Investment interest expense paid or accrued during the tax year (margin interest, etc.) */
  investmentInterestExpense: decimal,
  /** Line 2: Disallowed investment interest expense from prior year Form 4952 */
  priorYearDisallowed: optionalDecimal,
  /** Line 4a: Gross income from property held for investment (interest, ordinary dividends, annuities, royalties) */
  grossInvestmentIncome: optionalDecimal,
  /** Line 4b: Qualified dividends included on Line 4a */
  qualifiedDividendsIncluded: optionalDecimal,
  /** Line 4d: Total net investment-property gain. Legacy unconfirmed records used only nonpreferential gain. */
  netGainFromInvestmentProperty: optionalDecimal,
  /** Actual net long-term investment gain less net short-term loss, before the line 4e cap. */
  netCapitalGainFromInvestmentProperty: optionalDecimalInput,
  /** Line 4g: Actual election of qualified dividends and/or net capital gain as investment income. */
  electedPreferentialIncome: optionalDecimal,
  /** Optional actual "Elec." allocation; omission follows the IRS capital-gain-first rule. */
  electedNetCapitalGain: optionalDecimalInput,
  /** Line 5: Expenses actually deductible on the return, not miscellaneous investment fees. */
  investmentExpenses: optionalDecimal,
  investmentExpensesDeductibleConfirmed: z.boolean().optional(),
  /** Separate actual parent totals exclude every child elected on Form 8814. */
  childIncomeSources: z.object({
    sourceTaxYear: z.number().int(), sourceReference: z.string().trim().min(1), sourceFactsConfirmed: z.boolean(),
    parentSourcesExcludeAllChildrenConfirmed: z.boolean(),
    parentGrossInvestmentIncome: decimal, parentQualifiedDividends: decimal,
    parentNetInvestmentGain: decimal, parentNetLongTermGain: decimal, parentNetShortTermGain: decimal,
    children: z.array(z.object({
      sourceId: z.string().trim().min(1), sourceTaxYear: z.number().int(), sourceReference: z.string().trim().min(1),
      firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), dateOfBirth: z.string().min(1), ssnLast4: z.string().regex(/^\d{4}$/),
    })),
  }).optional(),
}));
export type Form4952Input = z.infer<typeof Form4952InputSchema>;

/** Actual completed AMT gain/basis worksheets; omitted source answers stay unknown. */
export const AMTCapitalGainsSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().trim().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  qualifiedDividends: optionalDecimalInput,
  netCapitalGain: optionalDecimalInput,
  section1250Gain: optionalDecimalInput,
  collectiblesGain: optionalDecimalInput,
});

export const SavingsBondRedemptionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const required = ["sourceId", "proceeds", "bondType", "issueDate", "redemptionDate", "ownerDateOfBirth", "registeredOwner", "ownershipConfirmed", "faceValue", "priorYearInterestReported"];
  return { ...record, sourceFactsComplete: record.sourceFactsComplete !== false && required.every(key => record[key] !== undefined) };
}, z.object({
  /** Recomputed from original fields; a supplied true marker is not evidence. */
  sourceFactsComplete: z.boolean().optional(),
  /** Total redemption proceeds (principal + interest) */
  proceeds: decimal,
  /** Historical aggregate aliases do not establish current-year eligibility. */
  interest: optionalDecimalInput,
  qualifiedExpenses: optionalDecimalInput,
  sourceId: z.string().trim().min(1).optional(),
  bondType: z.enum(["paper_ee", "electronic_ee", "series_i", "other"]).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  redemptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ownerDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  registeredOwner: z.enum(["taxpayer", "spouse", "taxpayer_and_spouse", "other"]).optional(),
  /** Actual registered person used for the age-at-issue test; required for joint registration. */
  ageTestOwner: z.enum(["taxpayer", "spouse"]).optional(),
  ownershipConfirmed: z.boolean().optional(),
  faceValue: optionalDecimalInput,
  priorYearInterestReported: optionalDecimalInput,
  /** Actual income ownership; not a proposed allocation of a final exclusion. */
  incomeOwnership: z.object({
    taxpayerPurchaseFunds: optionalDecimalInput,
    spousePurchaseFunds: optionalDecimalInput,
    taxpayerPriorYearInterestReported: optionalDecimalInput,
    spousePriorYearInterestReported: optionalDecimalInput,
    communityProperty: z.boolean().optional(),
    communityPropertyThroughoutAccrualConfirmed: z.boolean().optional(),
    ownershipUnchangedSinceIssueConfirmed: z.boolean().optional(),
    sourceFactsConfirmed: z.boolean().optional(),
    sourceReference: z.string().trim().optional(),
  }).optional(),
}));

/** Form 8815 expenses are coordinated once per return, not once per bond. */
export const Form8815Schema = z.object({
  sourceFactsConfirmed: z.boolean().optional(),
  currentStatementReconciliationConfirmed: z.boolean().optional(),
  priorYearInterestIncludedInCurrentStatements: optionalDecimalInput,
  educationExpenses: z.array(z.object({
    sourceId: z.string().trim().min(1),
    beneficiaryName: z.string().trim().min(1),
    /** Actual identity link to the taxpayer, spouse, or claimed dependent; never inferred from name. */
    beneficiaryTaxId: z.string().trim().min(1).optional(),
    relationship: z.enum(["taxpayer", "spouse", "dependent", "other"]),
    dependentClaimed: z.boolean().optional(),
    institutionName: z.string().trim().min(1),
    institutionAddress: z.string().trim().min(1),
    expenseType: z.enum(["tuition_and_required_fees", "coverdell_contribution", "qtp_contribution"]),
    paidTaxYear: z.number().int(),
    amountPaid: decimal,
    qualificationConfirmed: z.boolean(),
    coordinationConfirmed: z.boolean(),
    directInstitutionBenefits: decimal,
    educationCreditExpenses: decimal,
    taxFreeDistributionExpenses: decimal,
    beneficiaryBenefits: decimal,
  })).optional(),
  /** Actual official Line 9 Worksheet addbacks; omitted means unknown. */
  americanSamoaIncomeExclusion: optionalDecimalInput,
  puertoRicoIncomeExclusion: optionalDecimalInput,
  /** Signed MAGI change from the actual pre-exclusion royalty interest deduction. */
  royaltyInterestAdjustment: optionalDecimalInput,
});

const EnergyPropertySourceSchema = z.object({
  sourceId: z.string().trim().min(1).optional(),
  homeId: z.string().trim().min(1).optional(),
  /** Actual net qualified costs paid by every occupant, including this return. */
  totalCostPaidByAllOccupants: optionalDecimalInput,
  associationCostShare: z.boolean().optional(),
  associationAllocation: z.object({
    totalQualifiedCost: decimal, numerator: decimal, denominator: decimal,
    sourceReference: z.string().trim().min(1),
  }).optional(),
});
export const EnergyCreditsSchema = z.object({
  sourceFactsConfirmed: z.boolean().optional(),
  separateSpousalMainHomes: z.boolean().optional(),
  homes: z.array(z.object({
    id: z.string().trim().min(1), owner: z.enum(["primary", "spouse", "joint"]).optional(),
    address: z.object({ street: z.string(), unit: z.string().optional(), city: z.string(), state: z.string(), zip: z.string() }),
    locatedInUnitedStates: z.boolean().optional(), usedAsResidence: z.boolean().optional(),
    mainHomeFor: z.enum(["primary", "spouse", "both", "neither"]).optional(),
    mainHomeStartDate: z.string().optional(), mainHomeEndDate: z.string().optional(),
    ownedByTaxpayer: z.boolean().optional(), jointOccupancyWithOtherReturn: z.boolean().optional(),
    allOccupantCostsComplete: z.boolean().optional(),
  })).optional(),
  /** Itemized records preserve actual category, timing and qualification. */
  qualifiedImprovements: z.array(EnergyPropertySourceSchema.extend({
    category: z.enum(["insulation", "exterior_door", "windows_skylights", "central_ac", "gas_water_heater", "furnace_boiler", "electrical_panel", "heat_pump", "heat_pump_water_heater", "biomass", "home_energy_audit"]),
    qualifiedCost: decimal,
    installationCompletedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    qualificationConfirmed: z.boolean(),
    manufacturerQualifiedId: z.string().optional(),
    originalUseByTaxpayer: z.boolean().optional(), expectedFiveYearUse: z.boolean().optional(),
    newConstruction: z.boolean().optional(), auditReportCertified: z.boolean().optional(),
    enabledPropertyIds: z.array(z.string().trim().min(1)).optional(),
    panelLoadAmps: optionalDecimalInput, panelCodeComplianceConfirmed: z.boolean().optional(),
    consecutiveYearElection: z.boolean().optional(), priorYearCreditClaimed: z.boolean().optional(),
  })).optional(),
  cleanEnergyProperties: z.array(EnergyPropertySourceSchema.extend({
    category: z.enum(["solar_electric", "solar_water", "fuel_cell", "small_wind", "geothermal", "battery"]),
    qualifiedCost: decimal,
    installationCompletedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    qualificationConfirmed: z.boolean(),
    fuelCellKilowattCapacity: optionalDecimalInput,
    batteryKilowattHours: optionalDecimalInput,
  })).optional(),
  residenceEligibilityConfirmed: z.boolean().optional(),
  priorYearCarryforward: optionalDecimalInput,
  carryforwardSourceTaxYear: z.number().int().optional(),
  carryforwardConfirmed: z.boolean().optional(),
  /** Part I: Residential Clean Energy Credit (30% of qualified costs) */
  solarElectricCost: optionalDecimal, // Line 1
  solarWaterHeatingCost: optionalDecimal, // Line 2
  fuelCellCost: optionalDecimal, // Line 3
  smallWindCost: optionalDecimal, // Line 4
  geoThermalHeatPumpCost: optionalDecimal, // Line 5
  batteryStorageCost: optionalDecimal, // Line 6
  /** Part II: Energy Efficient Home Improvement Credit */
  insulationCost: optionalDecimal, // Exterior insulation, windows, doors
  energyPropertyCost: optionalDecimal, // Heat pumps, AC, water heaters
  homeEnergyAuditCost: optionalDecimal, // Line 13a
});

// Record whether original source facts existed before legacy schema defaults.
// Recompute this marker; an imported `sourceFactsComplete: true` is never evidence.
const sourceFactPresence = (required: string[]) => (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {...record, sourceFactsComplete: record.sourceFactsComplete !== false && required.every(key => record[key] !== undefined)};
};
const VehicleSourceFactFields = {
  sourceFactsComplete: z.boolean(),
  owner: z.enum(["primary", "spouse"]).optional(),
  vin: z.string().optional(),
  datePlacedInService: z.string().optional(),
  bindingContractDate: z.string().optional(),
  paymentDate: z.string().optional(),
  bindingContractConfirmed: z.boolean().optional(),
  sellerReportReceived: z.boolean().optional(),
  sellerReportCreditAmount: optionalDecimalInput,
  eligibilityConfirmed: z.boolean().optional(),
  creditTransferredAmount: optionalDecimalInput,
  resoldWithin30Days: z.boolean().optional(),
  returnedToSellerWithin30Days: z.boolean().optional(),
  sellerReportUpdatedForReturn: z.boolean().optional(),
  priorYearMagi: optionalDecimalInput,
  priorYearFilingStatus: FilingStatusSchema.optional(),
  priorYearMagiConfirmed: z.boolean().optional(),
};

export const NewCleanVehicleSchema = z.preprocess(sourceFactPresence(["msrp", "vehicleType", "personalUsePercentage", "creditTransferredToDealer"]), z.object({
  ...VehicleSourceFactFields,
  powertrain: z.enum(["battery", "fuel_cell"]).optional(),
  /** Date acquired (YYYY-MM-DD) */
  dateAcquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  /** Does the vehicle meet the critical minerals requirement? */
  criticalMineralsRequirementMet: z.boolean(),
  /** Does the vehicle meet the battery components requirement? */
  batteryComponentsRequirementMet: z.boolean(),
  /** Manufacturer's suggested retail price */
  msrp: optionalDecimal,
  /** Vehicle type determines MSRP limit: $80K for SUV/van/pickup, $55K for other */
  vehicleType: z.enum(["suv_van_pickup", "other"]).default("other"),
  /** Personal use percentage (0-100); default 100 */
  personalUsePercentage: optionalDecimal.default("100"),
  /** Was the credit transferred to the dealer at point of sale? */
  creditTransferredToDealer: z.boolean().default(false),
}));

export const PreviouslyOwnedCleanVehicleSchema = z.preprocess(sourceFactPresence(["salePrice", "personalUsePercentage", "creditTransferredToDealer"]), z.object({
  ...VehicleSourceFactFields,
  /** Date acquired (YYYY-MM-DD) */
  dateAcquired: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  /** Sale price of the vehicle (must be ≤ $25,000 to qualify) */
  salePrice: optionalDecimal,
  /** Personal use percentage (0-100); default 100 */
  personalUsePercentage: optionalDecimal.default("100"),
  /** Was the credit transferred to the dealer at point of sale? */
  creditTransferredToDealer: z.boolean().default(false),
}));

export const Form8936Schema = z.object({
  newCleanVehicles: z.array(NewCleanVehicleSchema).default([]),
  previouslyOwnedCleanVehicles: z.array(PreviouslyOwnedCleanVehicleSchema).default([]),
  /** Prior-year AGI for the lesser-of-two-years MAGI check */
  priorYearAgi: optionalDecimalInput,
  priorYearFilingStatus: FilingStatusSchema.optional(),
  agiAdjustmentsConfirmed: z.boolean().optional(),
  priorYearAgiAdjustmentsConfirmed: z.boolean().optional(),
  possessionIncomeExclusion: optionalDecimalInput,
  priorYearPossessionIncomeExclusion: optionalDecimalInput,
  /** Foreign earned income exclusion (Form 2555 Line 45) — current year */
  foreignEarnedIncomeExclusion: optionalDecimal,
  /** Foreign housing deduction (Form 2555 Line 50) — current year */
  foreignHousingDeduction: optionalDecimal,
  /** Foreign earned income exclusion — prior year */
  priorYearForeignEarnedIncomeExclusion: optionalDecimal,
  /** Foreign housing deduction — prior year */
  priorYearForeignHousingDeduction: optionalDecimal,
});

/**
 * Form 4684 — Casualties and Thefts, Section A (Personal Use Property)
 *
 * Post-TCJA (IRC §165(h)(5)): personal casualty/theft losses are only
 * deductible if attributable to a federally declared disaster.
 * The $100 per-event floor (IRC §165(h)(1)) and 10% AGI threshold
 * (IRC §165(h)(2)(A)) apply to personal-use property losses.
 */
export const Form4684PropertySchema = z.object({
  description: z.string().default(""),
  /** Line 2: Cost or adjusted basis */
  costOrBasis: optionalDecimal,
  /** Line 3: Insurance or other reimbursement */
  insuranceReimbursement: optionalDecimal,
  /** Line 5: Fair market value before casualty/theft */
  fairMarketValueBefore: optionalDecimal,
  /** Line 6: Fair market value after casualty/theft */
  fairMarketValueAfter: optionalDecimal,
});

export const Form4684EventSchema = z.object({
  /** Description of the casualty or theft event */
  description: z.string().default(""),
  /** FEMA disaster declaration number (required post-TCJA for personal losses) */
  femaDeclarationNumber: z
    .string()
    .trim()
    .min(1, "Form 4684 personal casualty events require a FEMA declaration number in the supported 2025 slice"),
  /** Properties affected by this event */
  properties: z.array(Form4684PropertySchema).default([]),
});

export const Form4684Schema = z.object({
  events: z.array(Form4684EventSchema).default([]),
});

/**
 * Schedule R — Credit for the Elderly or the Disabled (IRC §22)
 *
 * Eligibility: age 65+ OR under 65 and retired on permanent and total disability.
 * MFS filers must have lived apart from spouse for the entire tax year.
 */
export const ScheduleRInputSchema = z.object({
  /** Primary taxpayer qualifies: age 65+ OR retired on permanent/total disability */
  primaryQualifies: z.boolean(),
  /** If primary is under 65 and disabled, their taxable disability income */
  primaryDisabilityIncome: optionalDecimal,
  /** Whether the primary taxpayer is 65 or older */
  primaryAge65OrOlder: z.boolean(),
  /** Spouse qualifies: age 65+ OR retired on permanent/total disability (MFJ only) */
  spouseQualifies: z.boolean().optional(),
  /** If spouse is under 65 and disabled, their taxable disability income */
  spouseDisabilityIncome: optionalDecimal,
  /** Whether the spouse is 65 or older */
  spouseAge65OrOlder: z.boolean().optional(),
  /** Nontaxable pensions, annuities, or disability income not included in Form 1040 income */
  nontaxablePensionsAnnuities: optionalDecimal,
});

export const HouseholdEmployeeSchema = z.object({
  /** Employee name (for audit trail) */
  name: z.string().optional(),
  /** Total cash wages paid to this employee during the year */
  cashWages: decimal,
  /** Whether this employee is the taxpayer's spouse */
  isSpouse: z.boolean().optional(),
  /** Whether this employee is the taxpayer's child under age 21 */
  isChildUnder21: z.boolean().optional(),
  /** Whether this employee is the taxpayer's parent */
  isParent: z.boolean().optional(),
  /** Both qualifying-child care and marital/spouse-incapacity conditions under Pub. 926 are actually met. */
  parentCareExceptionApplies: z.boolean().optional(),
  /** Whether this employee is under age 18 and household work is not their principal occupation */
  isUnder18NonPrincipal: z.boolean().optional(),
  /** Federal income tax voluntarily withheld for this employee */
  federalIncomeTaxWithheld: optionalDecimal,
});

export const ScheduleHSchema = z.object({
  employees: z.array(HouseholdEmployeeSchema).min(1),
  /** Actual $1,000 quarterly test in the current or preceding tax year; never inferred from an annual total. */
  futaApplies: z.boolean().optional(),
  /** Whether all state unemployment taxes were paid timely and in a single state
   *  with no credit reduction. When true, uses Section A simplified FUTA (0.6%).
   *  When false, uses Section B with gross rate minus allowable credit. */
  futaSectionA: z.boolean().optional(),
  /** Total state unemployment contributions actually paid (Section B only) */
  stateUnemploymentContributions: optionalDecimal,
  /** Actual Schedule H line 17 state/rate periods; null means no assigned experience rate, not unknown. */
  futaStatePeriods: z.array(z.object({
    state: z.string().regex(/^[A-Z]{2}$/),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taxableWages: decimal,
    experienceRate: decimal.nullable(),
    contributionsPaidTimely: decimal,
  })).optional(),
  stateUnemploymentContributionsPaidLate: optionalDecimalInput,
  /** FUTA credit reduction amount for credit reduction states (CA, USVI for 2025) */
  futaCreditReduction: optionalDecimalInput,
});

export const Form8615Schema = z.object({
  /** Line 1: Child's total unearned income (interest, dividends, capital gains, rents, royalties, etc.) */
  childUnearnedIncome: decimal,
  /** Whether the child itemizes deductions (uses $1,350 threshold instead of $2,700) */
  childItemizesDeductions: z.boolean().default(false),
  /** Child's qualified dividends (for QDCG allocation between Lines 5 and 6) */
  childQualifiedDividends: optionalDecimal,
  /** Child's net long-term capital gain (for QDCG allocation between Lines 5 and 6) */
  childNetLTCG: optionalDecimal,
  /** Line 7: Parent's taxable income (from parent's Form 1040 Line 15) */
  parentTaxableIncome: decimal,
  /** Parent's filing status */
  parentFilingStatus: FilingStatusSchema,
  /** Parent's qualified dividends (for QDCG computation on Lines 11/12) */
  parentQualifiedDividends: optionalDecimal,
  /** Parent's net long-term capital gain (for QDCG computation on Lines 11/12) */
  parentNetLTCG: optionalDecimal,
  /** Parent's unrecaptured section 1250 gain */
  parentSection1250Gain: optionalDecimal,
  /** Parent's collectibles (28% rate) gain */
  parentCollectiblesGain: optionalDecimal,
  /** Line 8: Total net unearned income (Line 5) of all OTHER children of the same parent who file Form 8615 */
  otherChildrenNetUnearnedIncome: optionalDecimal,
});
export type Form8615Input = z.infer<typeof Form8615Schema>;

/**
 * Form 8839 — Qualified Adoption Expenses (IRC §23, §137)
 *
 * Per-child inputs for the adoption credit (Part II) and employer-provided
 * adoption benefit exclusion (Part III). MFS filers are ineligible.
 */
export const Form8839ChildSchema = z.preprocess(sourceFactPresence(["isSpecialNeeds", "isForeignAdoption", "employerBenefits", "priorYearCreditsClaimed", "priorYearExclusionsClaimed"]), z.object({
  sourceFactsComplete: z.boolean().optional(),
  childFirstName: z.string().min(1).optional(),
  childLastName: z.string().min(1).optional(),
  childBirthYear: z.number().int().min(1900).optional(),
  childIdentifyingNumber: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/).optional(),
  childPermanentlyDisabled: z.boolean().optional(),
  adoptionFinalizedYear: z.number().int().nullable().optional(),
  expensesByYear: z.array(z.object({year: z.number().int(), amount: decimal})).optional(),
  employerPlanQualified: z.boolean().optional(),
  priorYearForeignBenefits: optionalDecimalInput,
  /** Child's name (for audit trail) */
  childName: z.string().default(""),
  /** Whether the child has special needs as defined by IRC §23(d)(3) */
  isSpecialNeeds: z.boolean().default(false),
  /** Whether this is a foreign adoption (IRC §23(d)(1)(C)) */
  isForeignAdoption: z.boolean().default(false),
  /** Whether the adoption became final in or before the current tax year */
  adoptionBecameFinal: z.boolean().default(false),
  /** Qualified adoption expenses paid by taxpayer (not employer) for this child */
  qualifiedExpenses: optionalDecimal,
  /** Employer-provided adoption benefits for this child (W-2 Box 12 code T) */
  employerBenefits: optionalDecimal,
  /** Total adoption credits claimed for this child in prior tax years */
  priorYearCreditsClaimed: optionalDecimal,
  /** Total employer benefit exclusions claimed for this child in prior tax years */
  priorYearExclusionsClaimed: optionalDecimal,
}));

export const Form8839Schema = z.object({
  eligibilityConfirmed: z.boolean().optional(),
  possessionIncomeExclusion: optionalDecimalInput,
  exclusionMagi: optionalDecimalInput,
  carryforwards: z.array(z.object({originTaxYear: z.number().int(), amount: decimal})).optional(),
  carryforwardReconciled2025: z.boolean().optional(),
  children: z.array(Form8839ChildSchema).min(1),
  /** Foreign earned income exclusion amount (Form 2555) for MAGI computation */
  foreignEarnedIncomeExclusion: optionalDecimal,
  /** Foreign housing exclusion amount (Form 2555) for MAGI computation */
  foreignHousingExclusion: optionalDecimal,
});
export type Form8839Child = z.infer<typeof Form8839ChildSchema>;
export type Form8839Input = z.infer<typeof Form8839Schema>;

/**
 * Form 3800 — General Business Credit
 *
 * Aggregates business credits from various sources (K-1 Box 15, direct credit forms)
 * and computes the allowable credit limited by net income tax and tentative minimum tax.
 * IRC §38, §38(c), §39.
 */
export const Form3800Schema = z.object({
  /** Current-year general business credits from sources other than K-1 Box 15
   *  (e.g., directly computed from Forms 5884, 6765, 8586, 8826, 8941, etc.).
   *  K-1 Box 15 credits are automatically aggregated from scheduleK1 entries. */
  currentYearCredits: optionalDecimal,
  /** Passive activity credits allowed after Form 8582-CR limitation */
  passiveActivityCredits: optionalDecimal,
  /** Carryforward of unused general business credit from prior years (IRC §39) */
  carryforward: optionalDecimal,
});
export type Form3800Input = z.infer<typeof Form3800Schema>;

/**
 * Form 3903 — Moving Expenses (Armed Forces only, 2018–2025)
 *
 * IRC §217(k): Only active-duty Armed Forces members moving pursuant
 * to a military order for permanent change of station may deduct
 * moving expenses during the TCJA suspension period.
 *
 * Each entry represents one move during the tax year.
 */
export const Form3903MoveSchema = z.object({
  /** Transportation and storage of household goods and personal effects */
  transportationAndStorage: optionalDecimal,
  /** Travel and lodging from old home to new home (meals NOT deductible post-2017) */
  travelAndLodging: optionalDecimal,
  /** Employer/government reimbursements excluded from W-2 income (e.g., W-2 Box 12 Code P, DLA) */
  reimbursementsExcludedFromIncome: optionalDecimal,
});
export const Form3903Schema = z.object({
  /** Must be true — only active-duty military moves are deductible 2018–2025 */
  military: z.literal(true),
  /** One or more moves during the tax year */
  moves: z.array(Form3903MoveSchema).min(1),
});
export type Form3903Move = z.infer<typeof Form3903MoveSchema>;
export type Form3903Input = z.infer<typeof Form3903Schema>;

/**
 * Long-term care insurance coverage for one person.
 * Used in the SE Health Insurance Deduction Worksheet to apply
 * the IRC §213(d)(10) age-based premium limits.
 */
export const LongTermCareCoverageSchema = z.object({
  /** Actual premiums paid for this person during the tax year */
  premiumsPaid: decimal,
  /** Attained age at end of tax year (determines the IRC §213(d)(10) limit) */
  attainedAge: z.number().int().min(0).max(120),
});
export type LongTermCareCoverage = z.infer<typeof LongTermCareCoverageSchema>;

/**
 * Self-Employed Health Insurance Deduction Worksheet (Pub 535)
 * IRC §162(l) — Above-the-line deduction for health insurance premiums
 * paid by self-employed individuals.
 */
export const SEHealthInsuranceWorksheetSchema = z.object({
  /** Health, dental, and vision insurance premiums paid during the tax year */
  medicalDentalPremiums: decimal,
  /** Long-term care insurance coverages — one entry per covered person */
  longTermCareCoverages: z.array(LongTermCareCoverageSchema).default([]),
  /** Medicare Part B premiums paid */
  medicarePartBPremiums: optionalDecimal,
  /** Medicare Part D premiums paid */
  medicarePartDPremiums: optionalDecimal,
  /** Medigap / Medicare supplement insurance premiums paid */
  medigapPremiums: optionalDecimal,
  /**
   * Number of months (1-12) the taxpayer was eligible for the SE health
   * insurance deduction. A month is eligible if the taxpayer was NOT eligible
   * for a subsidized employer health plan (from either their own employer or
   * their spouse's employer) during that month.
   */
  eligibleMonths: z.number().int().min(0).max(12),
  /** Net profit from the business (Schedule C Line 31 or Schedule F Line 34).
   *  When omitted, the federal orchestrator fills it from the computed Schedule C + Schedule F net profit. */
  netProfit: optionalDecimal,
  /** Deductible portion of SE tax attributable to this business (from Schedule SE).
   *  When omitted, the federal orchestrator fills it from the computed Schedule SE deductible half. */
  deductibleSETax: optionalDecimal,
  /** SE retirement plan contributions attributable to this business.
   *  When omitted, defaults to adjustments.seRetirementContributions. */
  seRetirementContributions: optionalDecimal,
});
export type SEHealthInsuranceWorksheetInput = z.infer<typeof SEHealthInsuranceWorksheetSchema>;

/** Actual Form7206 sources. Omission preserves unknown; the calculator requires
 * source completeness before using a plan or canonical business income limit. */
export const Form7206Schema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  allPlansIncluded: z.boolean().optional(),
  /** Actual attribution of positive already-allowed retirement and Form2555line45 amounts. */
  incomeDeductions: z.object({
    sourceReference: z.string().optional(),
    sourceFactsConfirmed: z.boolean().optional(),
    allocations: z.array(z.object({
      businessSourceId: z.string().optional(),
      accountHolder: z.enum(["primary", "spouse"]).optional(),
      retirementDeduction: optionalDecimalInput,
      foreignExclusion: optionalDecimalInput,
    })).optional(),
    otherForeignExclusion: optionalDecimalInput,
  }).optional(),
  persons: z.array(z.object({
    personId: z.string().optional(),
    name: z.string().optional(),
    householdRole: z.enum(["primary", "spouse", "other"]).optional(),
    /** Actual attained age from the covered person's year-end source worksheet. */
    attainedAgeAtYearEnd: z.number().int().min(0).max(120).optional(),
  })).optional(),
  plans: z.array(z.object({
    planId: z.string().optional(),
    policyReference: z.string().optional(),
    accountHolder: z.enum(["primary", "spouse"]).optional(),
    businessSourceId: z.string().optional(),
    businessKind: z.enum(["self_employed", "partnership", "s_corporation"]).optional(),
    kind: z.enum(["medical", "qualified_ltc"]).optional(),
    policyHolder: z.enum(["individual", "business"]).optional(),
    establishedUnderBusiness: z.boolean().optional(),
    insuranceQualificationConfirmed: z.boolean().optional(),
    /** Actual guaranteed-payment or Box1 inclusion, not an assumed wage source. */
    premiumsIncludedInOwnerIncome: z.boolean().optional(),
    moreThanTwoPercentShareholder: z.boolean().optional(),
    marketplaceCoverage: z.boolean().optional(),
    premiumTaxCreditInvolved: z.boolean().optional(),
    marketplacePolicySourceIds: z.array(z.string()).optional(),
    allCoveredPersonsInCoverageFamilyConfirmed: z.boolean().optional(),
    clergySpecialRules: z.boolean().optional(),
    coveredPersons: z.array(z.object({
      personId: z.string().optional(),
      relationshipToOwner: z.enum(["self", "spouse", "dependent", "child_under_27", "other"]).optional(),
      dependencyEligibilityConfirmed: z.boolean().optional(),
    })).optional(),
    months: z.array(z.object({
      month: z.number().int().min(1).max(12).optional(),
      /** The applicable medical or LTC employer plan, including any part month. */
      employerSubsidizedPlanEligible: z.boolean().optional(),
      /** Actual completed PTC offer worksheet; an offer differs from enrollment. */
      employerOfferPtcException: z.enum(["unaffordable", "does_not_provide_minimum_value"]).optional(),
      employerCoverageEnrolled: z.boolean().optional(),
      employerOfferSourceReference: z.string().optional(),
    })).optional(),
    payments: z.array(z.object({
      sourceId: z.string().optional(),
      datePaid: z.string().optional(),
      coverageTaxYear: z.number().int().optional(),
      coverageMonth: z.number().int().min(1).max(12).optional(),
      grossPremium: optionalDecimalInput,
      ownerOrBusinessPaid: optionalDecimalInput,
      otherPersonPaid: optionalDecimalInput,
      /** Actual government advance payment, separate from taxpayer paid premiums. */
      advancePremiumTaxCredit: optionalDecimalInput,
      personAmounts: z.array(z.object({
        personId: z.string().optional(),
        /** Reimbursements belong to the business share, never both shares. */
        payer: z.enum(["owner_after_tax", "business_paid_or_reimbursed"]).optional(),
        amountPaid: optionalDecimalInput,
        advancePremiumTaxCredit: optionalDecimalInput,
        excludedPublicSafetyOfficerAmount: optionalDecimalInput,
        publicSafetyOfficerAccountHolder: z.enum(["primary", "spouse"]).optional(),
        otherTaxFreeFunding: optionalDecimalInput,
      })).optional(),
    })).optional(),
  })).optional(),
  /** Actual allocation only when the same person's LTC cap spans businesses. */
  longTermCareAllocations: z.array(z.object({
    personId: z.string().optional(),
    accountHolder: z.enum(["primary", "spouse"]).optional(),
    businessSourceId: z.string().optional(),
    allowedPremium: optionalDecimalInput,
  })).optional(),
});
export type Form7206Input = z.infer<typeof Form7206Schema>;

/**
 * Taxable Refund Worksheet — Schedule 1, Line 1
 *
 * Determines how much of a prior-year state/local income tax refund is
 * taxable under the IRC §111 tax benefit rule, taking into account the
 * $10,000 SALT cap (IRC §164(b)(6)) interaction.
 *
 * Ref: IRS Schedule 1 Instructions, Worksheet 1; IRC §111; Pub 525.
 */
export const TaxableRefundWorksheetSchema = z.object({
  /** Year of the tax deduction being recovered, not the year the refund arrived. */
  priorTaxYear: z.number().int().min(2018).max(2026),
  /** Actual historical SALT MAGI, including exclusions; required from 2025. */
  priorYearSaltMagi: optionalDecimalInput,
  /** Whether the taxpayer itemized deductions on the prior-year return */
  priorYearItemized: z.boolean(),
  /** Actual prior Schedule A tax election; omission preserves historical unknown. */
  priorYearStateLocalTaxElection: z.enum(["income", "sales"]).optional(),
  /** Prior-year Schedule A Line 17 total itemized deductions */
  priorYearItemizedTotal: optionalDecimal,
  /** Actual standard deduction available in the recovery worksheet, including any mandatory-itemization restriction. */
  priorYearStandardDeduction: decimal,
  /** Total state/local income taxes actually paid in the prior year (before SALT cap) */
  priorYearStateLocalTaxesPaid: optionalDecimalInput,
  /** Historical state/local real and personal property taxes; preserve unknown. */
  priorYearPropertyTaxesPaid: optionalDecimalInput,
  /** Alternative prior-year general sales tax deduction that could have been
   *  claimed instead of state/local income taxes. When provided, Pub. 525 caps
   *  the taxable refund at the excess of the chosen income-tax deduction over
   *  this alternative sales-tax deduction. */
  priorYearAlternativeGeneralSalesTaxDeduction: optionalDecimal,
  /** Prior-year filing status (for SALT cap: $10K general, $5K MFS) */
  priorYearFilingStatus: FilingStatusSchema,
}).superRefine((value, ctx) => {
  if (value.priorTaxYear >= 2025 && value.priorYearSaltMagi === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priorYearSaltMagi"], message: "Historical SALT MAGI is required for tax years 2025 and 2026" });
  }
  if (value.priorYearItemized) {
    for (const field of ["priorYearStateLocalTaxesPaid", "priorYearPropertyTaxesPaid"] as const) {
      if (value[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Actual historical SALT amounts are required, including explicit zero when applicable" });
    }
  }
  for (const field of ["priorYearItemizedTotal", "priorYearStandardDeduction", "priorYearStateLocalTaxesPaid", "priorYearPropertyTaxesPaid", "priorYearAlternativeGeneralSalesTaxDeduction"] as const) {
    if (value[field] !== undefined && d(value[field]).isNegative()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Historical deduction and tax payment amounts cannot be negative" });
  }
});
export type TaxableRefundWorksheetInput = z.infer<typeof TaxableRefundWorksheetSchema>;

/**
 * Schedule J — Income Averaging for Farmers and Fishermen (IRC §1301)
 *
 * Base year data for each of the three prior years. The caller is responsible
 * for chaining adjusted base year incomes if Schedule J was used in prior years.
 */
const ScheduleJBaseYearSchema = z.object({
  /** Taxable income for the base year (adjusted for prior Schedule J use). Can be negative. */
  taxableIncome: decimal,
  /** Filing status used on the base year return */
  filingStatus: z.enum([
    "single", "married_filing_jointly", "married_filing_separately",
    "head_of_household", "qualifying_surviving_spouse",
  ]),
  /** Original tax from the base year return (Form 1040 Line 16, adjusted for prior Schedule J) */
  originalTax: decimal,
  /** Whether the base year had qualified dividends or net capital gains */
  hadQualifiedDividendsOrCapitalGains: z.boolean().optional(),
  /** Qualified dividends from the base year (for QDCG recomputation) */
  qualifiedDividends: optionalDecimal,
  /** Net long-term capital gain from the base year (for QDCG recomputation) */
  netLongTermCapitalGain: optionalDecimal,
});

export const ScheduleJSchema = z.object({
  /** Elected farm income — capped at taxable income. IRC §1301(b)(1) */
  electedFarmIncome: decimal,
  /** Net capital gain portion of elected farm income (Line 2b) */
  netCapitalGainFromFarming: optionalDecimal,
  /** Unrecaptured §1250 gain portion of elected farm income (Line 2c) */
  unrecapturedSection1250GainFromFarming: optionalDecimal,
  /** Base year 1 — 3 years prior (2022 for a 2025 return) */
  baseYear1: ScheduleJBaseYearSchema,
  /** Base year 2 — 2 years prior (2023 for a 2025 return) */
  baseYear2: ScheduleJBaseYearSchema,
  /** Base year 3 — 1 year prior (2024 for a 2025 return) */
  baseYear3: ScheduleJBaseYearSchema,
});
export type ScheduleJInput = z.infer<typeof ScheduleJSchema>;

/**
 * IRC §121 — Exclusion of Gain from Sale of Principal Residence
 *
 * Inputs for computing the home sale exclusion. Each entry represents one
 * home sale during the tax year.
 */
export const HomeSaleSchema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA Schedule D reporting
  /** Sale price (gross proceeds) */
  salePrice: decimal,
  /** Selling expenses (commissions, transfer taxes, fees, etc.) */
  sellingExpenses: optionalDecimal,
  /** Original purchase price (cost basis before adjustments) */
  purchasePrice: decimal,
  /** Cost of capital improvements added to basis */
  improvements: optionalDecimal,
  /** Depreciation allowed or allowable after May 6, 1997 (home office, rental use) */
  depreciationAfterMay1997: optionalDecimal,
  /** Casualty loss deductions previously claimed that reduced basis */
  casualtyLossDeductions: optionalDecimal,
  /** Other basis adjustments (negative reduces basis, positive increases it) */
  otherBasisAdjustments: optionalDecimal,
  /** Days the taxpayer owned the home during the lookback period (5-year default, up to 15 with military suspension) */
  daysOwned: z.number().int().min(0).max(5475),
  /** Days the taxpayer used the home as principal residence during the lookback period (excludes licensed care facility days) */
  daysUsedAsResidence: z.number().int().min(0).max(5475),
  /** Whether the taxpayer (or either spouse for MFJ) used the exclusion for another sale in the prior 2 years */
  usedExclusionInPrior2Years: z.boolean().default(false),
  /** Whether the sale qualifies for a reduced exclusion under IRC §121(c) —
   *  due to change in employment, health, or unforeseen circumstances */
  qualifiesForReducedExclusion: z.boolean().default(false),
  /** For MFJ: whether both spouses meet the use test (2+ years as principal residence) */
  bothSpousesMeetUseTest: z.boolean().default(false),
  /** For MFJ: whether at least one spouse meets the ownership test (2+ years of ownership) */
  atLeastOneSpouseMeetsOwnershipTest: z.boolean().default(false),
  /** IRC §121(d)(7): taxpayer became physically or mentally incapable of self-care during the lookback period */
  incapableOfSelfCare: z.boolean().default(false),
  /** IRC §121(d)(7): days spent in a State-licensed care facility while still owning the property during the lookback period.
   *  These days count as use of the home when incapableOfSelfCare is true. */
  daysInLicensedCareFacilityWhileOwning: z.number().int().min(0).default(0),
  /** IRC §121(d)(9): days of qualified official extended duty for military, Foreign Service, or intelligence community members.
   *  Suspends the 5-year lookback period by this many days (max 3650 = 10 years), extending it to up to 15 years.
   *  The 730-day ownership/use requirements still apply within the extended window. */
  qualifiedExtendedDutyDays: z.number().int().min(0).max(3650).default(0),
}).superRefine((value, ctx) => {
  if (value.daysInLicensedCareFacilityWhileOwning > 0 && !value.incapableOfSelfCare) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IRC §121(d)(7): daysInLicensedCareFacilityWhileOwning requires incapableOfSelfCare to be true",
      path: ["daysInLicensedCareFacilityWhileOwning"],
    });
  }
});
export type HomeSaleInput = z.infer<typeof HomeSaleSchema>;

/**
 * Form 6781 — Gains and Losses From Section 1256 Contracts and Straddles
 * IRC §1256 mark-to-market treatment with 60/40 long-term/short-term split.
 */
export const Form6781Schema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA Schedule D reporting
  /** Line 1-2: Net gains from section 1256 contracts (positive value) */
  section1256Gains: optionalDecimal,
  /** Line 1-2: Net losses from section 1256 contracts (positive value representing losses) */
  section1256Losses: optionalDecimal,
  /** Line 4: Adjustments for mixed straddle elections, hedging transactions, etc. */
  adjustments: optionalDecimal,
  /** Box D: Elect to carry back net section 1256 contract losses up to 3 prior years (individuals only) */
  carrybackElection: z.boolean().default(false),
  /** Line 6: Amount of net loss elected to carry back (positive number, capped at net loss) */
  carrybackAmount: optionalDecimal,
  /** Part II Section A Line 11a: Short-term recognized straddle losses (positive value representing losses) */
  shortTermStraddleLosses: optionalDecimal,
  /** Part II Section A Line 11b: Long-term recognized straddle losses (positive value representing losses) */
  longTermStraddleLosses: optionalDecimal,
  /** Part II Section B Line 13a: Short-term straddle gains */
  shortTermStraddleGains: optionalDecimal,
  /** Part II Section B Line 13b: Long-term straddle gains */
  longTermStraddleGains: optionalDecimal,
});
export type Form6781Input = z.infer<typeof Form6781Schema>;

/**
 * Form 6252 — Installment Sale Income
 * IRC §453 installment method for sales where at least one payment is
 * received after the tax year of the disposition.
 */
export const Form6252PropertyType = z.enum(["timeshare_residential_lot", "personal_use", "farm", "other"]);
export const Form6252GainCharacter = z.enum(["short_term_capital", "long_term_capital", "section_1231"]);

export const Form6252Schema = z.object({
  accountHolder: z.enum(["primary", "spouse"]).optional(), // Local owner tag for spouse-separated PA Schedule D reporting
  /** Description of property sold */
  description: z.string().default(""),
  /** Property type code per Form 6252 Line 1 */
  propertyType: Form6252PropertyType.default("other"),
  /** Character of gain for routing to Schedule D or Form 4797 */
  gainCharacter: Form6252GainCharacter.default("long_term_capital"),
  /** Whether this is the year the property was sold */
  isYearOfSale: z.boolean(),

  // Part I: Gross Profit and Contract Price
  /** Line 5: Selling price including mortgages and other debts */
  sellingPrice: decimal,
  /** Line 6: Mortgages, debts, and other liabilities buyer assumed */
  assumedLiabilities: optionalDecimal,
  /** Line 8: Cost or other basis of property sold */
  costBasis: decimal,
  /** Line 9: Depreciation allowed or allowable */
  depreciation: optionalDecimal,
  /** Line 11: Commissions and other expenses of sale */
  sellingExpenses: optionalDecimal,
  /** Line 12: Income recapture from Form 4797 Part III (§1245/§1250) — full recognition in year of sale */
  depreciationRecapture: optionalDecimal,
  /** Line 15: Section 121 main home exclusion amount */
  section121Exclusion: optionalDecimal,

  // Part II: Installment Sale Income
  /** Line 21: Payments received during the current tax year (excluding interest) */
  paymentsReceived: optionalDecimal,
  /** Line 23: Cumulative payments received in all prior years */
  priorYearPayments: optionalDecimal,
  /** Remaining §§1252/1254/1255 recapture to be recognized from future installments */
  remainingOrdinaryRecapture: optionalDecimal,

  // Part III: Related Party (optional)
  /** Whether property was sold to a related party per IRC §453(e)/§453(f)(1) */
  relatedParty: z.object({
    /** Related party's second disposition selling price (Line 30) */
    secondDispositionPrice: decimal,
    /** Whether an exception under Line 29a-e applies */
    exceptionApplies: z.boolean().default(false),
  }).optional(),
});
export type Form6252Input = z.infer<typeof Form6252Schema>;

/** Actual ordinary Form1116 source worksheets for deduction-year deemed absorption. */
const ForeignTaxDeductionCarryoverSchema = z.object({
  sourceTaxYear: z.number().int().optional(), sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
  method: z.enum(["ordinary_passive"]).optional(),
  filingHistory: z.enum(["continuous_individual", "continuous_joint_same_spouse"]).optional(), filingHistoryConfirmed: z.boolean().optional(),
  noCarrybackOrRedeterminationAdjustmentsConfirmed: z.boolean().optional(), noForeignOrDomesticLossAccountsConfirmed: z.boolean().optional(),
  noOtherForeignIncomeConfirmed: z.boolean().optional(), allCurrentTaxesCreditEligibleConfirmed: z.boolean().optional(), passiveCategoryConfirmed: z.boolean().optional(),
  adjustedThroughTaxYear: z.number().int().optional(),
  incomeSources: z.array(z.object({
    sourceId: z.string().optional(), payerName: z.string().optional(), payerTin: z.string().optional(), accountReference: z.string().optional(),
    owner: z.enum(["primary", "spouse"]).optional(), foreignCountry: z.string().optional(),
    reportedIncome: decimal.optional(), foreignIncome: decimal.optional(), sourceReference: z.string().optional(),
  }).strict()).optional(),
  carryovers: z.array(z.object({ originTaxYear: z.number().int().optional(), category: z.enum(["passive", "general"]).optional(), amount: decimal.optional(), sourceReference: z.string().optional() }).strict()).optional(),
  itemizedAllocation: z.object({
    sourceReference: z.string().optional(), sourceFactsConfirmed: z.boolean().optional(),
    incomeOrSalesTaxes: decimal.optional(), homeRealPropertyTaxes: decimal.optional(), personalPropertyTaxes: decimal.optional(),
    allRealPropertyTaxesForPersonalResidenceConfirmed: z.boolean().optional(), noTreatyCharitableDeductionConfirmed: z.boolean().optional(),
    mortgageInterestMethod: z.enum(["gross_income", "us_source_small_foreign_income"]).optional(),
    /** Actual ordinary-method history and complete, nonoverlapping jurisdiction attribution. */
    stateAllocation: z.object({
      method: z.enum(["ordinary_presumption", "existing_safe_harbor_or_other"]).optional(),
      sourceFactsConfirmed: z.boolean().optional(), sourceReference: z.string().optional(),
      methodHistoryConfirmed: z.boolean().optional(), allStateSourcesIncludedConfirmed: z.boolean().optional(),
      nonoverlappingIncomeConfirmed: z.boolean().optional(),
      noTaxStateIncome: z.array(z.object({
        stateCode: z.string().optional(), usTaxableIncome: decimal.optional(), sourceReference: z.string().optional(),
      }).strict()).optional(),
    }).strict().optional(),
    stateIncomeTaxes: z.array(z.object({
      stateCode: z.string().optional(), deductibleAmount: decimal.optional(), stateTaxableIncome: decimal.optional(),
      foreignIncomeSpecificallyExempt: z.boolean().optional(), sourceReference: z.string().optional(),
      /** Actual nonoverlapping country attribution, including known-zero countries. */
      countryIncomeConfirmed: z.boolean().optional(),
      countryIncome: z.array(z.object({ foreignCountry: z.string().optional(), stateTaxableIncome: decimal.optional(), sourceReference: z.string().optional() }).strict()).optional(),
    }).strict()).optional(),
  }).strict().optional(),
}).strict();

/** Actual paid-tax credit sources shared by ordinary1116 and the904(j)election. */
const ForeignTaxCreditSourceSchema = z.object({
  electionConfirmed: z.boolean().optional(), filingContext: z.enum(["original_return", "amended_return"]).optional(),
  sourceFactsConfirmed: z.boolean().optional(), sourceReference: z.string().optional(),
  allForeignGrossIncomePassiveConfirmed: z.boolean().optional(),
  allForeignIncomeOnQualifiedPayeeStatementsConfirmed: z.boolean().optional(),
  noRequiredTaxReductionsConfirmed: z.boolean().optional(),
  taxpayers: z.array(z.object({ owner: z.enum(["primary", "spouse"]).optional(),
    status: z.enum(["us_citizen", "full_year_resident_alien", "other"]).optional(), sourceReference: z.string().optional(),
  }).strict()).optional(),
  carryoverHistoryConfirmed: z.boolean().optional(), adjustedThroughTaxYear: z.number().int().optional(),
  filingHistory: z.enum(["continuous_individual", "continuous_joint_same_spouse", "changed"]).optional(),
  carryovers: z.array(z.object({ originTaxYear: z.number().int().optional(), category: z.enum(["passive", "general"]).optional(),
    amount: decimal.optional(), sourceReference: z.string().optional(),
  }).strict()).optional(),
  amtCarryovers: z.array(z.object({ originTaxYear: z.number().int().optional(), category: z.enum(["passive", "general"]).optional(),
    amount: decimal.optional(), sourceReference: z.string().optional(),
  }).strict()).optional(),
}).strict();
const ForeignTaxPriorCapacitySchema = z.object({
  taxYear: z.number().int().optional(), election: z.enum(["form1116_credit", "direct_credit_election", "deduction"]).optional(),
  sourceFactsConfirmed: z.boolean().optional(), sourceReference: z.string().optional(), allPriorUseIncludedConfirmed: z.boolean().optional(),
  limitation: decimal.optional(), currentTaxes: decimal.optional(), priorCarryoversUsed: decimal.optional(),
}).strict();
const ForeignTaxOrdinaryCreditSchema = ForeignTaxCreditSourceSchema.extend({
  sourceTaxYear: z.number().int().optional(), method: z.enum(["ordinary_passive"]).optional(),
  allForeignIncomeSourcesIncludedConfirmed: z.boolean().optional(), noForeignOrDomesticLossAccountsConfirmed: z.boolean().optional(),
  noCfcOrQbuIncomeConfirmed: z.boolean().optional(),
  incomeSources: z.array(z.object({
    sourceId: z.string().optional(), payerName: z.string().optional(), payerTin: z.string().optional(), accountReference: z.string().optional(),
    owner: z.enum(["primary", "spouse"]).optional(), foreignCountry: z.string().optional(),
    reportedIncome: decimal.optional(), foreignIncome: decimal.optional(), sourceReference: z.string().optional(),
    passiveGroup: z.enum(["withholding_15_or_more", "withholding_under_15", "no_foreign_tax", "other_foreign_tax"]).optional(),
  }).strict()).optional(),
  itemizedAllocation: ForeignTaxDeductionCarryoverSchema.shape.itemizedAllocation,
  amt: z.object({
    sourceFactsConfirmed: z.boolean().optional(), sourceReference: z.string().optional(), foreignAmountsSameAsRegularConfirmed: z.boolean().optional(),
    firstPost1997CreditClaimTaxYear: z.number().int().optional(), simplifiedElectionMadeInFirstClaimYear: z.boolean().optional(), noRevocationConfirmed: z.boolean().optional(),
  }).strict().optional(),
  regularCarryback: ForeignTaxPriorCapacitySchema.optional(), amtCarryback: ForeignTaxPriorCapacitySchema.optional(),
}).strict();

/** Actual annual foreign income-tax choice and paid-tax deduction records. */
export const ForeignTaxElectionSchema = z.object({
  taxYear: z.number().int().optional(),
  election: z.enum(["credit", "deduction"]).optional(),
  accountingMethod: z.enum(["paid", "accrued"]).optional(),
  priorAccruedCreditElection: z.boolean().optional(),
  sourceReference: z.string().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  allQualifiedForeignTaxesIncludedConfirmed: z.boolean().optional(),
  noUnusedCreditCarryoversConfirmed: z.boolean().optional(),
  deductionYearCarryover: ForeignTaxDeductionCarryoverSchema.optional(),
  /** Actual section904(j) election; no source eligibility or history defaults. */
  creditWithoutForm1116: ForeignTaxCreditSourceSchema.optional(),
  creditWithForm1116: ForeignTaxOrdinaryCreditSchema.optional(),
  noRedeterminationsConfirmed: z.boolean().optional(),
  sources: z.array(z.object({
    sourceId: z.string().optional(), // Actual form1099Int:index or form1099Div:index.
    payerName: z.string().optional(), payerTin: z.string().optional(), accountReference: z.string().optional(),
    owner: z.enum(["primary", "spouse"]).optional(),
    foreignCountry: z.string().optional(), jurisdictionType: z.enum(["foreign_country", "us_territory"]).optional(),
    reportedTaxAmount: decimal.optional(),
    qualifiedIncomeTaxConfirmed: z.boolean().optional(),
    creditEligibility: z.object({
      passiveIncomeConfirmed: z.boolean().optional(), legalTaxLiabilityConfirmed: z.boolean().optional(),
      noRefundOrSubsidyConfirmed: z.boolean().optional(), holdingPeriodRequirementMetConfirmed: z.boolean().optional(),
      noRelatedPaymentsConfirmed: z.boolean().optional(), noDisallowedCountryOrBoycottConfirmed: z.boolean().optional(),
    }).strict().optional(),
    taxOnExcludedIncome: decimal.optional(),
    taxDeductedElsewhere: decimal.optional(),
    payments: z.array(z.object({ date: z.string(), amountUsd: decimal }).strict()).optional(),
    investmentAllocableAmount: decimal.optional(),
    allocationMethodDescription: z.string().optional(),
    sourceReference: z.string().optional(),
  }).strict()).optional(),
}).strict();

/** Actual completed NIIT worksheet components that cannot be inferred from income totals. */
export const Form8960SourcesSchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  feieAllocableDeductions: decimal.optional(),
  annuities: z.array(z.object({
    sourceId: z.string().min(1).optional(), // Exact form1099R:index binding.
    payerName: z.string().trim().min(1).optional(), payerTin: z.string().trim().min(1).optional(),
    accountReference: z.string().trim().min(1).optional(),
    owner: z.enum(["primary", "spouse"]).optional(),
    classification: z.enum(["nonqualified_annuity", "excluded_retirement_plan"]).optional(),
    excludedPlanSection: z.enum(["401", "403a", "403b", "408", "408A", "457b"]).optional(),
    grossDistribution: decimal.optional(),
    taxableAmount: decimal.optional(),
    sourceReference: z.string().min(1).optional(),
  }).strict()).optional(),
  ordinaryTaxAllocation: z.object({
    allocationMethodDescription: z.string().min(1).optional(),
    noDuplicateDeductionConfirmed: z.boolean().optional(),
    incomeOrSalesTaxes: z.object({ sourceAmount: decimal.optional(), regularDeductibleAmount: decimal.optional(), investmentAllocableAmount: decimal.optional() }).strict().optional(),
    realPropertyTaxes: z.object({ sourceAmount: decimal.optional(), regularDeductibleAmount: decimal.optional(), investmentAllocableAmount: decimal.optional() }).strict().optional(),
    personalPropertyTaxes: z.object({ sourceAmount: decimal.optional(), regularDeductibleAmount: decimal.optional(), investmentAllocableAmount: decimal.optional() }).strict().optional(),
  }).strict().optional(),
  dispositions: z.object({
    regularCapitalGainOrLoss: decimal,
    regularOrdinaryGainOrLoss: decimal,
    excludedGainOrLossAdjustment: decimal,
    passthroughAdjustment: decimal,
  }).optional(),
  itemizedAllocation: z.object({
    investmentInterest: decimal,
    ordinaryLoss: decimal,
    investmentIncomeTaxes: decimal.optional(),
  }).optional(),
});

export const Form2555Schema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const required = ["foreignEarnedIncome", "qualifyingDays", "totalDaysInYear", "qualifiedHousingExpenses", "isSelfEmployed"];
  return { ...record, sourceFactsComplete: record.sourceFactsComplete !== false && required.every(key => record[key] !== undefined) };
}, z.object({
  taxYear: z.number().int().optional(),
  accountHolder: z.enum(["primary", "spouse"]).optional(),
  /** Actual one-taxpayer mapping to income already reported, or separate foreign wages. */
  sourceMapping: z.object({
    sourceReference: z.string(), sourceFactsConfirmed: z.boolean(), allSourcesIncluded: z.boolean(), oneOwnerOnlyConfirmed: z.boolean(),
    rows: z.array(z.object({
      sourceId: z.string(), sourceTaxYear: z.number().int(), accountHolder: z.enum(["primary", "spouse"]),
      sourceReference: z.string(), payerName: z.string(), payerEin: z.string().optional(),
      foreignEarnedIncome: decimal, priorYearIncomeReceived: decimal,
      notIncludedInW2Confirmed: z.boolean().optional(),
      businessGrossReceipts: decimal.optional(), businessReturnsAndAllowances: decimal.optional(),
      businessCostOfGoodsSold: decimal.optional(), businessOtherIncome: decimal.optional(),
    })),
  }).optional(),
  sourceFactsComplete: z.boolean().optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  /** Confirmed tax home and residence/presence eligibility, including permitted services. */
  eligibilityConfirmed: z.boolean().optional(),
  /** Actual election validity, including any prior revocation and required IRS consent. */
  electionsValidConfirmed: z.boolean().optional(),
  claimForeignEarnedIncomeExclusion: z.boolean().optional(),
  claimHousingExclusionOrDeduction: z.boolean().optional(),
  foreignEarnedIncome: decimal,
  qualifyingDays: z.number().int().min(0).max(366),
  totalDaysInYear: z.number().int().min(365).max(366).default(365),
  qualifiedHousingExpenses: optionalDecimal,
  housingExpensesQualificationConfirmed: z.boolean().optional(),
  /** Legacy field is accepted for migration only; arbitrary overrides cannot calculate. */
  housingExpenseLocationLimit: decimal.optional(),
  housingLocationPeriods: z.array(z.object({
    locationId: z.string().min(1), // Exact catalog ID, or "default" for an unlisted location.
    days: z.number().int().min(1).max(365),
    noticeTaxYear: z.number().int().optional(), // Explicit2025 election of higher2026 limits.
    priorYearLocationId: z.string().min(1).optional(), // Actual earlier notice location when labels changed.
  })).optional(),
  /** Legacy reimbursement field never substitutes for actual employer-provided income. */
  employerProvidedHousingAmount: optionalDecimal,
  employerProvidedForeignEarnedIncome: decimal.optional(),
  isSelfEmployed: z.boolean().default(false),
  deductionsAllocableToExcludedIncome: decimal.optional(),
  foreignEarnedIncomeTaxWorksheetDisallowedDeductions: decimal.optional(),
  priorYearHousingDeductionCarryover: decimal.optional(),
  priorYearHousingCarryoverTaxYear: z.number().int().optional(),
  priorYearHousingCarryoverConfirmed: z.boolean().optional(),
  priorYearIncomeExclusion: decimal.optional(),
  priorYearIncomeExclusionTaxYear: z.number().int().optional(),
  priorYearIncomeStatementConfirmed: z.boolean().optional(),
  priorYearIncomeAlreadyReportedConfirmed: z.boolean().optional(),
  priorYearIncomeReceived: decimal.optional(),
  priorYearUnusedExclusion: decimal.optional(),
  partIV: z.object({
    wages: decimal, businessPersonalServices: decimal, partnershipPersonalServices: decimal,
    noncashLodging: decimal, noncashMeals: decimal, noncashCar: decimal, noncashOther: decimal,
    allowanceCostOfLiving: decimal, allowanceFamily: decimal, allowanceEducation: decimal,
    allowanceHomeLeave: decimal, allowanceQuarters: decimal, allowanceOther: decimal,
    otherEarnedIncome: decimal, section119MealsAndLodging: decimal,
  }).optional(),
  incomeSourceMappingConfirmed: z.boolean().optional(),
  /** Eligible foreign receipts already present in their actual return income sources;
   * business/partnership amounts are eligible gross personal-service receipts, not net profit. */
  incomeSources: z.object({
    foreignEmploymentIncomeIncludedOnW2: decimal,
    foreignEmploymentIncomeNotOnW2: decimal,
    foreignBusinessIncomeAlreadyReported: decimal,
    foreignPartnershipIncomeAlreadyReported: decimal,
    otherForeignIncomeAlreadyReported: decimal,
  }).optional(),
}));
export type Form2555Input = z.infer<typeof Form2555Schema>;

const Form8814ElectionFactsSchema = z.object({
  taxYear: z.number().int(), sourceReference: z.string().trim().min(1), sourceFactsConfirmed: z.boolean(),
  /** Actual subsets of the child totals; Alaska is already included in line2a. */
  incomeCharacter: z.object({
    sourceReference: z.string().optional(),
    alaskaPermanentFundDividends: optionalDecimalInput,
    collectiblesGain: optionalDecimalInput,
    unrecapturedSection1250Gain: optionalDecimalInput,
    section1202Gain: optionalDecimalInput,
  }).optional(),
  child: z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), ssn: z.string(), dateOfBirth: z.string() }),
  electionRequested: z.boolean(), timelyElectionStatus: z.enum(["planned_timely", "filed_timely", "late"]),
  childRequiredToFile: z.boolean(), childFilesJointReturn: z.boolean(),
  otherGrossIncome: decimal, estimatedTaxPayments: decimal, priorYearOverpaymentApplied: decimal, federalIncomeTaxWithheld: decimal,
  student: z.object({
    program: z.enum(["school", "school_on_farm", "government_on_farm", "online_only", "correspondence", "on_the_job"]),
    fullTimeMonths: z.array(z.number().int().min(1).max(12)), sourceReference: z.string().trim().min(1),
  }).optional(),
  electingTaxpayer: z.enum(["primary", "spouse"]), relationshipToChild: z.enum(["parent", "stepparent"]),
  parentSituation: z.enum(["joint_with_other_parent", "married_separate", "custodial_unmarried", "custodial_considered_unmarried", "custodial_joint_stepparent", "custodial_separate_stepparent", "never_married_together_all_year", "surviving_unmarried", "surviving_joint_stepparent", "surviving_separate_stepparent"]),
  custodialParentConfirmed: z.boolean().optional(),
  consideredUnmarriedUnder7703Confirmed: z.boolean().optional(),
  parentIncomeComparison: z.object({
    taxYear: z.number().int(), returnTaxableIncomeWithoutChild: decimal, otherParentTaxableIncomeWithoutChild: decimal,
    returnSourceReference: z.string().trim().min(1), otherParentSourceReference: z.string().trim().min(1), excludesElectedChildIncomeConfirmed: z.boolean(),
  }).optional(),
});
export const Form8814ChildSchema = z.preprocess(value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  return { ...raw, incomeSourcesComplete: raw.incomeSourcesComplete !== false && ["taxableInterest", "taxExemptInterest", "ordinaryDividends", "qualifiedDividends", "capitalGainDistributions"].every(field => raw[field] !== undefined) };
}, z.object({
  incomeSourcesComplete: z.boolean().optional(),
  electionFacts: Form8814ElectionFactsSchema.optional(),
  /** Line 1a: Child's taxable interest (Forms 1099-INT, 1099-OID) */
  taxableInterest: optionalDecimal,
  /** Line 1b: Child's tax-exempt interest (informational, not in Line 4 total) */
  taxExemptInterest: decimal,
  /** Line 2a: Child's ordinary dividends (Forms 1099-DIV Box 1a) */
  ordinaryDividends: optionalDecimal,
  /** Line 2b: Child's qualified dividends (subset of 2a, for proportional allocation) */
  qualifiedDividends: optionalDecimal,
  /** Line 3: Child's capital gain distributions (Forms 1099-DIV Box 2a) */
  capitalGainDistributions: optionalDecimal,
  /** Complete actual exempt-interest statements for the child's AMT preference. */
  amtSources: z.object({
    taxYear: z.union([z.literal(2025), z.literal(2026)]),
    allStatementsConfirmed: z.literal(true),
    statements: z.array(z.object({
      sourceId: z.string().trim().min(1),
      form: z.enum(["1099-INT", "1099-DIV"]),
      taxExemptInterest: decimal,
      /** Actual INT box9 or DIV box13; never inferred from exempt interest. */
      specifiedPrivateActivityBondInterest: decimal,
    })),
    otherwiseAllowableDeduction: decimal,
    deductionSourceReference: z.string().trim().min(1).optional(),
    deductionAllowanceAndNoDuplicationConfirmed: z.literal(true).optional(),
  }).optional(),
}));
export type Form8814ChildInput = z.infer<typeof Form8814ChildSchema>;

/**
 * Form 8915-F — Qualified Disaster Retirement Plan Distributions and Repayments
 * IRC §72(t)(2)(J) as made permanent by Secure 2.0 Act §331.
 */

/** A single per-disaster current-year qualified distribution record */
export const QualifiedDisasterDistributionSchema = z.object({
  /** FEMA disaster declaration number or descriptive name */
  disasterName: z.string(),
  /** Date the qualified disaster began (YYYY-MM-DD) */
  disasterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Gross amount of qualified disaster distributions from all retirement plans for this disaster */
  grossDistribution: decimal,
  /** Portion of grossDistribution from IRA/SEP/SIMPLE plans */
  iraDistribution: optionalDecimal,
  /** Election to include entire distribution in year received (no 3-year spread).
   *  If false or omitted, the default 3-year spread applies. */
  electFullInclusion: z.boolean().default(false),
  /** Repayments made in the current tax year for this disaster's distributions */
  currentYearRepayments: optionalDecimal,
});
export type QualifiedDisasterDistribution = z.infer<typeof QualifiedDisasterDistributionSchema>;

/** A prior-year deferred disaster distribution record for 3-year spread tracking */
export const PriorYearDisasterDeferralSchema = z.object({
  /** FEMA disaster declaration number or descriptive name (must match original) */
  disasterName: z.string(),
  /** Year the distribution was originally made */
  distributionYear: z.number().int(),
  /** Which spread year this is: 2 (second year) or 3 (third/final year) */
  spreadYear: z.number().int().min(2).max(3),
  /** The original annual 1/3 amount computed in the distribution year */
  annualSpreadAmount: decimal,
  /** Remaining deferred balance before this year's inclusion (for year 3, may differ from annualSpreadAmount due to rounding) */
  remainingDeferredBalance: decimal,
  /** Portion of the original distribution that was from IRA/SEP/SIMPLE plans (for IRA vs pension proration) */
  iraFraction: optionalDecimal,
  /** Repayments made in the current tax year allocated to this prior-year deferral */
  currentYearRepayments: optionalDecimal,
});
export type PriorYearDisasterDeferral = z.infer<typeof PriorYearDisasterDeferralSchema>;

export const Form8915FSchema = z.object({
  /** Current-year qualified disaster distributions */
  currentYearDistributions: z.array(QualifiedDisasterDistributionSchema).default([]),
  /** Prior-year deferred amounts being included this year under the 3-year spread */
  priorYearDeferrals: z.array(PriorYearDisasterDeferralSchema).default([]),
});
export type Form8915FInput = z.infer<typeof Form8915FSchema>;

/**
 * Form 8824 — Like-Kind Exchanges (§1031)
 *
 * Reports like-kind exchanges of real property held for productive use in
 * a trade or business or for investment. Post-TCJA (2018+), §1031 applies
 * only to real property — personal property exchanges no longer qualify.
 *
 * Part III computation: Lines 12–25.
 *
 * Ref: IRS Form 8824 Instructions (2025); IRC §1031; Pub 544.
 */
export const Form8824Schema = z.object({
  /** Description of relinquished property */
  description: z.string().default("Like-kind real property exchange"),
  /**
   * Character of the recognized Line 23 gain/loss for federal routing.
   * `section1231` routes through Form 4797 Part I; `capital` routes to
   * Schedule D as long-term capital gain/loss.
   */
  recognizedGainCharacter: z.enum(["section1231", "capital"]).default("section1231"),
  /** FMV of other (non-like-kind) property given up (Line 12) */
  fmvOtherPropertyGivenUp: optionalDecimal,
  /** Adjusted basis of other property given up (Line 13) */
  adjustedBasisOtherPropertyGivenUp: optionalDecimal,
  /** Cash received in the exchange */
  cashReceived: optionalDecimal,
  /** FMV of non-like-kind property received */
  fmvOtherPropertyReceived: optionalDecimal,
  /** Liabilities relinquished (mortgage on property given up) */
  liabilitiesRelinquished: optionalDecimal,
  /** Liabilities assumed (mortgage on property received) */
  liabilitiesAssumed: optionalDecimal,
  /** Qualified exchange expenses (QI fees, title, recording) */
  exchangeExpenses: optionalDecimal,
  /** FMV of like-kind property received (Line 16) */
  fmvLikeKindPropertyReceived: decimal,
  /** Adjusted basis of like-kind property given up (Line 18) */
  adjustedBasisLikeKindPropertyGivenUp: decimal,
  /** §1250 depreciation recapture amount from Form 4797 Part III */
  depreciationRecapture: optionalDecimal,
  /** Whether this is a related party exchange (IRC §1031(f)) */
  isRelatedParty: z.boolean().default(false),
});
export type Form8824Input = z.infer<typeof Form8824Schema>;
const IllinoisScheduleMRecaptureOutOfStateDetailSchema = z.object({
  priorDeductionsClaimed: decimal,
  priorYearRecaptures: decimal,
  transferAmount: decimal,
});

const IllinoisScheduleMRecaptureNonqualifiedDetailSchema = z.object({
  priorDeductionsClaimed: decimal,
  priorYearRecaptures: decimal,
  withdrawalAmount: decimal,
});

export const IllinoisScheduleMInputSchema = z.object({
  taxYear: z.number().int(),
  filingStatus: FilingStatusSchema,
  recapture529OutOfStateDetail: IllinoisScheduleMRecaptureOutOfStateDetailSchema.optional(),
  recapture529NonqualifiedDetail: IllinoisScheduleMRecaptureNonqualifiedDetailSchema.optional(),
  childTaxExemptInterest: optionalDecimal,
  distributiveShareAdditions: optionalDecimal,
  lloydsLoss: optionalDecimal,
  nonIL529Earnings: optionalDecimal,
  ilDepreciationAddition: optionalDecimal,
  recapture529OutOfState: optionalDecimal,
  recapture529Nonqualified: optionalDecimal,
  studentAssistanceCreditRecapture: optionalDecimal,
  otherAdditions: optionalDecimal,
  il529Contributions: optionalDecimal,
  distributiveShareSubtractions: optionalDecimal,
  restorationClaimOfRight: optionalDecimal,
  jobTrainingContributions: optionalDecimal,
  federalCreditRelatedExpenses: optionalDecimal,
  medicalDebtRelief: optionalDecimal,
  ilDepreciationSubtraction: optionalDecimal,
  ableContributions: optionalDecimal,
  militaryPay: optionalDecimal,
  usGovernmentInterest: optionalDecimal,
  august1969ValuationLimitation: optionalDecimal,
  riverEdgeRedevelopmentZoneDividendSubtraction: optionalDecimal,
  recoveryOfItemsDeducted: optionalDecimal,
  ridesharing: optionalDecimal,
  lifeInsurancePayment: optionalDecimal,
  lloydsIncome: optionalDecimal,
  funeralTrustIncome: optionalDecimal,
  healthCareProviderLoanRepayment: optionalDecimal,
  naziPersecutionReparations: optionalDecimal,
  ilBondInterest: optionalDecimal,
  nonUSGovernmentBondInterest: optionalDecimal,
  childUSGovernmentInterest: optionalDecimal,
  railroadIncome: optionalDecimal,
  unjustImprisonmentCompensation: optionalDecimal,
  plan529DistributionsForCredits: optionalDecimal,
  cannabisDisallowedDeductions: optionalDecimal,
  fertilityFraudAward: optionalDecimal,
});

const IllinoisK12EducationExpenseWorksheetStudentSchema = z.object({
  studentName: z.string().trim().min(1),
  studentSSN: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  schoolName: z.string().trim().min(1),
  schoolCity: z.string().trim().min(1),
  schoolType: z.enum(["public", "non_public", "home_school"]),
  tuitionBookLabFees: decimal,
});

const IllinoisK12EducationExpenseWorksheetInputSchema = z.object({
  taxYear: z.number().int(),
  students: z.array(IllinoisK12EducationExpenseWorksheetStudentSchema).default([]),
});

const IllinoisPropertyTaxPropertySchema = z.object({
  county: z.string().trim().min(1),
  propertyNumber: z.string().trim().min(1),
});

export const IllinoisScheduleICRInputSchema = z.object({
  taxYear: z.number().int(),
  residencyType: z.enum(["resident", "part_year", "nonresident"]).optional(),
  propertyTaxPaid: optionalDecimal,
  propertyTaxProperties: z.array(IllinoisPropertyTaxPropertySchema).max(3).default([]),
  propertyTaxBusinessDeduction: optionalDecimal,
  propertyTaxCreditClaimedOnOtherReturns: optionalDecimal,
  k12EducationExpenses: optionalDecimal,
  k12EducationExpenseWorksheet: IllinoisK12EducationExpenseWorksheetInputSchema.optional(),
  educationCreditClaimedOnOtherReturns: optionalDecimal,
  volunteerEmergencyWorkerCount: z.number().int().min(0).max(2).default(0),
  volunteerEmergencyWorkerCertificateNumbers: z.array(z.string().trim().min(1)).max(2).default([]),
}).superRefine((value, ctx) => {
  if (
    value.residencyType !== "nonresident"
    && d(value.propertyTaxPaid).greaterThan(0)
    && value.propertyTaxProperties.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["propertyTaxProperties"],
      message: "Illinois Schedule ICR property tax claims require at least one county and property number",
    });
  }

  if (value.volunteerEmergencyWorkerCertificateNumbers.length !== value.volunteerEmergencyWorkerCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["volunteerEmergencyWorkerCertificateNumbers"],
      message: "Volunteer Emergency Worker certificate count must match volunteerEmergencyWorkerCount",
    });
  }
});

const IllinoisScheduleCRTaxEntrySchema = z.object({
  jurisdiction: z.string(),
  taxPaid: decimal,
  incomeType: z.enum(["wages", "other"]),
  taxingAuthority: z.enum(["state", "local"]).optional(),
  dualResident: z.boolean().optional(),
});

export const IllinoisScheduleCRInputSchema = z.object({
  taxYear: z.number().int(),
  totalBaseIncome: decimal,
  nonIllinoisBaseIncome: decimal,
  taxPaidToOtherStates: optionalDecimal,
  taxEntries: z.array(IllinoisScheduleCRTaxEntrySchema).optional(),
});

const IllinoisDependentSchema = z.object({
  relationship: z.string(),
  isUnder12: z.boolean(),
  monthsInHome: z.number().int().min(0).max(12),
});

const IllinoisExpandedEITCWorksheetInputSchema = z.object({
  taxYear: z.number().int(),
  filingStatus: FilingStatusSchema,
  qualifyingChildCount: z.number().int().min(0),
  form1040Line1z: optionalDecimal,
  excludedMedicaidWaiverPayments: optionalDecimal,
  electedNontaxableCombatPay: optionalDecimal,
  scheduleSELine3: optionalDecimal,
  scheduleSELine4bAnd5a: optionalDecimal,
  scheduleSELine13: optionalDecimal,
  part3NetFarmProfitOrLoss: optionalDecimal,
  part3NetBusinessProfitOrLoss: optionalDecimal,
  statutoryEmployeeIncome: optionalDecimal,
  agi: decimal,
  investmentIncome: optionalDecimal,
  filedForm2555: z.boolean().default(false),
  taxpayerOrSpouseUsResidentHalfYear: z.boolean().default(true),
  mainHomeInUSMoreThanHalfYear: z.boolean().optional(),
  canBeClaimedAsDependent: z.boolean().optional(),
  canBeQualifyingChildOfAnother: z.boolean().default(false),
  separatedSpouseEitcEligible: z.boolean().default(false),
  hasComplexInvestmentIncome: z.boolean().optional(),
  primaryAge: z.number().int().min(0),
  spouseAge: z.number().int().min(0).optional(),
});

export const IllinoisScheduleEEICInputSchema = z.object({
  taxYear: z.number().int(),
  dependents: z.array(IllinoisDependentSchema).default([]),
  qualifyingChildren: z.array(IllinoisDependentSchema).optional(),
  federalEIC: decimal,
  expandedEITCWorksheetCredit: decimal.optional(),
  expandedEITCWorksheet: IllinoisExpandedEITCWorksheetInputSchema.optional(),
  allocationDecimal: decimal.optional(),
});

export const IllinoisScheduleGInputSchema = z.object({
  taxYear: z.number().int(),
  wildlifePreservationFund: optionalDecimal,
  alzheimersFund: optionalDecimal,
  assistanceToHomelessFund: optionalDecimal,
  diabetesResearchFund: optionalDecimal,
  hungerReliefFund: optionalDecimal,
  ronaldMcDonaldHouseCharitiesFund: optionalDecimal,
});

const IllinoisSchedule1299CCreditSchema = z.object({
  yearsLeftToCarry: z.number().int().min(0).max(10),
  carryforwardPeriodYears: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(5),
    z.literal(10),
  ]),
  creditCode: z.enum([
    "0160",
    "1000",
    "1030",
    "1050",
    "1060",
    "2000",
    "2010",
    "2020",
    "2030",
    "2040",
    "2050",
    "2060",
    "2070",
    "2090",
    "2100",
    "2110",
    "2120",
    "2130",
    "2140",
    "2150",
    "2160",
    "2170",
    "2180",
    "2190",
    "2200",
    "2210",
    "2220",
    "2230",
    "2240",
    "2250",
    "2260",
    "2270",
    "2280",
    "2290",
    "2300",
    "2310",
    "2320",
    "2330",
    "2340",
    "5100",
    "5110",
    "5140",
    "5160",
    "6100",
    "6110",
    "6120",
    "6130",
    "6140",
    "6150",
    "6160",
    "6170",
    "6190",
    "6200",
    "6210",
    "6220",
    "6230",
    "6240",
    "6250",
    "6260",
    "6270",
    "6280",
    "6290",
    "6300",
    "6310",
    "6320",
    "6330",
    "6340",
    "6350",
    "6360",
    "6370",
    "6380",
    "6390",
    "6400",
    "6410",
    "6420",
    "6430",
    "6440",
  ]),
  creditYearEnding: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  identifyingNumber: z.string().trim().min(1).optional(),
  creditEarnedOrCarried: decimal,
  distributiveShareOrTransfer: optionalDecimal,
});

export const IllinoisSchedule1299CAttachmentSchema = z.object({
  taxYear: z.number().int(),
  credits: z.array(IllinoisSchedule1299CCreditSchema).max(21),
});

const IllinoisDualColumnAmountSchema = z.object({
  columnA: optionalDecimal,
  columnB: optionalDecimal,
});

const IllinoisScheduleNRIncomeLinesSchema = z.object({
  wages: IllinoisDualColumnAmountSchema,
  interest: IllinoisDualColumnAmountSchema,
  dividends: IllinoisDualColumnAmountSchema,
  taxableRefunds: IllinoisDualColumnAmountSchema,
  alimony: IllinoisDualColumnAmountSchema,
  businessIncome: IllinoisDualColumnAmountSchema,
  capitalGains: IllinoisDualColumnAmountSchema,
  otherGains: IllinoisDualColumnAmountSchema,
  iraDistributions: IllinoisDualColumnAmountSchema,
  pensions: IllinoisDualColumnAmountSchema,
  rentalAndPartnership: IllinoisDualColumnAmountSchema,
  farmIncome: IllinoisDualColumnAmountSchema,
  unemployment: IllinoisDualColumnAmountSchema,
  socialSecurity: IllinoisDualColumnAmountSchema,
  otherIncome: IllinoisDualColumnAmountSchema,
});

const IllinoisScheduleNRAdjustmentLinesSchema = z.object({
  educatorExpenses: IllinoisDualColumnAmountSchema,
  certainBusinessExpenses: IllinoisDualColumnAmountSchema,
  hsaDeduction: IllinoisDualColumnAmountSchema,
  movingExpenses: IllinoisDualColumnAmountSchema,
  seTaxDeduction: IllinoisDualColumnAmountSchema,
  sepSimpleDeduction: IllinoisDualColumnAmountSchema,
  seHealthInsurance: IllinoisDualColumnAmountSchema,
  earlyWithdrawalPenalty: IllinoisDualColumnAmountSchema,
  alimonyPaid: IllinoisDualColumnAmountSchema,
  iraDeduction: IllinoisDualColumnAmountSchema,
  studentLoanInterest: IllinoisDualColumnAmountSchema,
  archerMSA: IllinoisDualColumnAmountSchema,
  otherAdjustments: IllinoisDualColumnAmountSchema,
});

const IllinoisScheduleNRAdditionsSubtractionsSchema = z.object({
  taxExemptInterest: IllinoisDualColumnAmountSchema,
  otherAdditions: IllinoisDualColumnAmountSchema,
  retirementSubtraction: IllinoisDualColumnAmountSchema,
  ilRefundSubtraction: IllinoisDualColumnAmountSchema,
  otherSubtractions: IllinoisDualColumnAmountSchema,
});

export const IllinoisScheduleNRInputSchema = z.object({
  taxYear: z.number().int(),
  residencyType: z.enum(["nonresident", "part_year"]),
  income: IllinoisScheduleNRIncomeLinesSchema,
  adjustments: IllinoisScheduleNRAdjustmentLinesSchema,
  additionsSubtractions: IllinoisScheduleNRAdditionsSubtractionsSchema,
});

const IllinoisScheduleILWITRecordSchema = z.object({
  taxpayer: z.enum(["primary", "spouse"]),
  formType: z.enum([
    "W-2",
    "W-2G",
    "1099-R",
    "1099-G",
    "1099-MISC",
    "1099-OID",
    "1099-K",
    "1099-DIV",
    "1099-INT",
    "1099-B",
    "1042-S",
    "1099-NEC",
    "1099-DA",
  ]),
  payerId: z.string(),
  federalAmount: optionalDecimal,
  illinoisAmount: optionalDecimal,
  illinoisWithheld: decimal,
});

export const IllinoisUseTaxWorksheetInputSchema = z.object({
  taxYear: z.number().int(),
  filingStatus: FilingStatusSchema,
  federalAGI: decimal,
  generalMerchandisePurchases: optionalDecimal,
  qualifyingFoodDrugMedicalPurchases: optionalDecimal,
  salesTaxPaidToOtherStates: optionalDecimal,
});

export const IllinoisDirectDepositInputSchema = z.object({
  routingNumber: z.string().trim().min(1),
  accountType: z.enum(["checking", "savings"]),
  accountNumber: z.string().trim().min(1),
});

export const IllinoisHealthInsuranceCheckboxSchema = z.object({
  selfUninsured: z.boolean(),
  spouseUninsured: z.boolean(),
  dependentsUninsured: z.boolean(),
});

const IllinoisIL2210AnnualizedPeriodSchema = z.object({
  baseIncome: decimal,
  exemptions: decimal,
  surcharges: decimal,
  credits: decimal,
  ilChildTaxCredit: optionalDecimal,
});

export const IllinoisStateReturnInputSchema = z.object({
  claimedAsDependent: z.boolean(),
  spouseClaimedAsDependent: z.boolean().optional(),
  age65OrOlderCount: z.number().int().min(0).max(2),
  blindCount: z.number().int().min(0).max(2),
  dependentCount: z.number().int().min(0).default(0),
  hasChildUnder12: z.boolean(),
  ilRefundSubtraction: optionalDecimal,
  additionalRetirementIncome: optionalDecimal,
  k1RetirementPaymentsSubtraction: optionalDecimal,
  illinoisExemptTaxExemptInterest: optionalDecimal,
  investmentCreditRecapture: optionalDecimal,
  schedule1299CCredit: optionalDecimal,
  schedule1299C: IllinoisSchedule1299CAttachmentSchema.optional(),
  scheduleM: IllinoisScheduleMInputSchema.optional(),
  scheduleICR: IllinoisScheduleICRInputSchema.optional(),
  scheduleG: IllinoisScheduleGInputSchema.optional(),
  scheduleCR: IllinoisScheduleCRInputSchema.optional(),
  scheduleEEIC: IllinoisScheduleEEICInputSchema.optional(),
  scheduleNR: IllinoisScheduleNRInputSchema.optional(),
  useTaxWorksheet: IllinoisUseTaxWorksheetInputSchema.optional(),
  householdEmploymentTax: optionalDecimal,
  useTax: optionalDecimal,
  compassionateUseSurcharge: optionalDecimal,
  ilWithholding: optionalDecimal,
  scheduleILWIT: z.object({
    records: z.array(IllinoisScheduleILWITRecordSchema).default([]),
  }).optional(),
  estimatedPayments: optionalDecimal,
  passThroughWithholding: optionalDecimal,
  passThroughEntityTaxCredit: optionalDecimal,
  voluntaryCharitableDonations: optionalDecimal,
  refundAmountRequested: decimal.optional(),
  refundMethod: z.enum(["direct_deposit", "paper_check"]).optional(),
  directDeposit: IllinoisDirectDepositInputSchema.optional(),
  creditForwardAmount: decimal.optional(),
  firstYearIllinoisReturn: z.boolean().optional(),
  healthInsuranceCheckbox: IllinoisHealthInsuranceCheckboxSchema.optional(),
  il2210: z.object({
    priorYearTax: decimal,
    priorYearReturnFiled: z.boolean(),
    qualifiesAsFarmer: z.boolean().optional(),
    is65OrOlderAndPermanentlyInNursingHome: z.boolean().optional(),
    notRequiredToFilePriorYearReturn: z.boolean().optional(),
    estimatedPaymentsByQuarter: z.tuple([decimal, decimal, decimal, decimal]),
    annualizedInstallmentMethod: z.object({
      periods: z.tuple([
        IllinoisIL2210AnnualizedPeriodSchema,
        IllinoisIL2210AnnualizedPeriodSchema,
        IllinoisIL2210AnnualizedPeriodSchema,
        IllinoisIL2210AnnualizedPeriodSchema,
      ]),
    }).optional(),
  }).optional(),
});
export type IllinoisStateReturnInput = z.infer<typeof IllinoisStateReturnInputSchema>;

const NYCollegeTuitionStudentSchema = z.object({
  tuitionPaid: decimal,
});

const NYPensionExclusionDetailSchema = z.object({
  nonGovernmentPensionIncome: decimal,
  isAge59AndHalf: z.boolean(),
});

const NYIT196InputSchema = z.object({
  medicalDeduction: optionalDecimalInput,
  taxesDeduction: optionalDecimalInput,
  interestDeduction: optionalDecimalInput,
  charitableDeduction: optionalDecimalInput,
  casualtyTheftLosses: optionalDecimalInput,
  miscDeductions: optionalDecimalInput,
  otherDeductions: optionalDecimalInput,
  investmentInterest: optionalDecimalInput,
  qualifiedContributions: optionalDecimalInput,
  gamblingLosses: optionalDecimalInput,
  casualtyLossesIncomeProducing: optionalDecimalInput,
  federalDisasterLosses: optionalDecimalInput,
  stateLocalIncomeTaxSubtraction: optionalDecimalInput,
  otherSubtractionAdjustments: optionalDecimalInput,
  additionAdjustments: optionalDecimalInput,
  collegeTuitionItemizedDeduction: optionalDecimalInput,
});

const NYIT112ROtherJurisdictionSchema = z.object({
  stateCode: z.string().trim().regex(/^[A-Za-z]{2}$/, "Must be a two-letter state code"),
  sourcedIncome: decimal,
  taxPaidByTaxpayer: decimal,
  ptetPaidByEntity: optionalDecimalInput,
});

const NYIT214RenterInputSchema = z.object({
  totalRentPaid: decimal,
  rentIncludesCharges: z.enum([
    "heat_gas_electricity_furnishings_board",
    "heat_gas_electricity_furnishings",
    "heat_gas_electricity",
    "heat_or_heat_and_gas",
    "none",
  ]),
  monthsRentPaid: z.number().int().min(1).max(12),
});

const NYIT214HomeownerInputSchema = z.object({
  realPropertyTaxesPaid: decimal,
  specialAssessments: optionalDecimalInput,
});

const NYIT217InputSchema = z.object({
  meetsQualifiedPropertyRequirement: z.boolean(),
  meetsEligibleFarmerIncomeTest: z.boolean(),
  directQualifiedAgriculturalAcreage: optionalDecimalInput,
  passthroughQualifiedAgriculturalAcreage: optionalDecimalInput,
  fiduciaryQualifiedAgriculturalAcreage: optionalDecimalInput,
  qualifiedConservationAcreage: optionalDecimalInput,
  hasRelatedPersonsOwnership: z.boolean().optional(),
  relatedPersonsGroupCount: z.number().int().min(2).optional(),
  allocatedBaseAcreage: optionalDecimalInput,
  directEligibleSchoolTaxes: optionalDecimalInput,
  passthroughEligibleSchoolTaxes: optionalDecimalInput,
  fiduciaryEligibleSchoolTaxes: optionalDecimalInput,
  newYorkCcorporationEntireNetIncomeShare: optionalDecimalInput,
  passThroughCcorporationEntireNetIncomeShare: optionalDecimalInput,
  principalPaidOnFarmIndebtedness: optionalDecimalInput,
}).superRefine((value, ctx) => {
  if (
    value.hasRelatedPersonsOwnership === true
    && value.relatedPersonsGroupCount === undefined
    && value.allocatedBaseAcreage === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-217 related-person ownership requires either relatedPersonsGroupCount or allocatedBaseAcreage",
      path: ["relatedPersonsGroupCount"],
    });
  }
});

const NYIT119PropertySchema = z.object({
  underpaymentAmount: decimal,
});

const NYIT201ATTRefundableCreditEntrySchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  amount: decimal,
});

const NYIT201ATTNonrefundableCreditEntrySchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  amount: decimal,
});

const NYIT227ContributionEntrySchema = z.object({
  lineNumber: z.number().int().min(1).max(36),
  amount: decimal,
});

export const NYIT201FullReturnInputSchema = z.object({
  federalAgi: decimal,
  filingStatus: FilingStatusSchema,
  taxYear: z.literal(2025),
  canBeClaimedAsDependent: z.boolean().optional(),
  numberOfDependents: z.number().int().min(0).optional(),

  outOfStateMuniBondInterest: optionalDecimalInput,
  publicEmployee414hContributions: optionalDecimalInput,
  nycFlexibleSpendingContributions: optionalDecimalInput,
  nonQualified529Distributions: optionalDecimalInput,
  otherAdditions: optionalDecimalInput,
  it225: z.object({
    federalBonusDepreciation: optionalDecimalInput,
    nyDepreciationAllowedForBonusAssets: optionalDecimalInput,
    federalQbiDeduction: optionalDecimalInput,
    otherIT225Additions: optionalDecimalInput,
    nyDepreciationForBonusAssets: optionalDecimalInput,
    ny529Contributions: optionalDecimalInput,
    spouseNy529Contributions: optionalDecimalInput,
    ltcPremiumsPaid: optionalDecimalInput,
    ltcPremiumsDeductedFederally: optionalDecimalInput,
    otherIT225Subtractions: optionalDecimalInput,
  }).optional(),

  stateLocalTaxRefunds: optionalDecimalInput,
  governmentPensionIncome: optionalDecimalInput,
  taxableSocialSecurityBenefits: optionalDecimalInput,
  usGovernmentBondInterest: optionalDecimalInput,
  pensionExclusion: NYPensionExclusionDetailSchema.optional(),
  spousePensionExclusion: NYPensionExclusionDetailSchema.optional(),
  collegeTuitionStudents: z.array(NYCollegeTuitionStudentSchema).optional(),
  collegeTuitionPreference: z.enum(["credit", "deduction"]).optional(),
  otherSubtractions: optionalDecimalInput,

  nyItemizedDeduction: optionalDecimalInput,
  spouseUsesItemizedDeduction: z.boolean().optional(),
  it196: NYIT196InputSchema.optional(),

  residentCredit: optionalDecimalInput,
  it112r: z.object({
    otherTaxesBeforeCredits: optionalDecimalInput,
    jurisdictions: z.array(NYIT112ROtherJurisdictionSchema).min(1),
    otherCreditsBeforeResident: optionalDecimalInput,
  }).optional(),
  otherNYStateCredits: optionalDecimalInput,
  it201attNonrefundableCredits: z.object({
    accumulationDistributionCredit: optionalDecimalInput,
    otherNoncarryoverCredits: optionalDecimalInput,
    otherNoncarryoverCreditEntries: z.array(NYIT201ATTNonrefundableCreditEntrySchema).max(2).optional(),
    longTermCareInsuranceCredit: optionalDecimalInput,
    investmentCredit: optionalDecimalInput,
    solarEnergySystemEquipmentCredit: optionalDecimalInput,
    otherCarryoverCredits: optionalDecimalInput,
    otherCarryoverCreditEntries: z.array(NYIT201ATTNonrefundableCreditEntrySchema).max(14).optional(),
    nycResidentUbtCredit: optionalDecimalInput,
    nycAccumulationDistributionCredit: optionalDecimalInput,
    partYearNYCChildAndDependentCareCredit: optionalDecimalInput,
  }).optional(),
  it249: z.object({
    premiumsPaid: optionalDecimalInput,
    partnershipCreditShare: optionalDecimalInput,
    sCorporationCreditShare: optionalDecimalInput,
    fiduciaryCreditShare: optionalDecimalInput,
    priorYearCarryover: optionalDecimalInput,
    otherTaxesBeforeCredits: optionalDecimalInput,
  }).optional(),

  otherStateTaxes: optionalDecimalInput,
  salesUseTax: optionalDecimalInput,
  salesUseTaxChart: z.object({
    monthsOfPermanentPlaceOfAbode: z.number().int().min(0).max(12).optional(),
  }).optional(),
  mctmt: z.object({
    zone1Earnings: optionalDecimalInput,
    zone2Earnings: optionalDecimalInput,
    spouseZone1Earnings: optionalDecimalInput,
    spouseZone2Earnings: optionalDecimalInput,
  }).optional(),

  isNYCResident: z.boolean().optional(),
  isPartYearNYCResident: z.boolean().optional(),
  nycCharitableGiftsTrustContributionAddback: optionalDecimalInput,
  nycHouseholdCreditFederalAgiOverride: optionalDecimalInput,
  nycHouseholdCreditHouseholdMembers: z.number().int().min(1).optional(),
  partYearNYCTax: optionalDecimalInput,
  partYearNYCTaxableIncome: optionalDecimalInput,
  partYearNYCSchoolCreditMonths: z.number().int().min(1).max(12).optional(),
  otherNYCTaxes: optionalDecimalInput,
  otherNYCCredits: optionalDecimalInput,
  taxableIraDistributionsForSchoolCredit: optionalDecimalInput,
  nycEarnedIncomeCredit: optionalDecimalInput,
  it215: z.object({
    federalEic: optionalDecimalInput,
    jointFederalReturnForMfsAllocation: z.boolean().optional(),
    line17AllocatedNYSEic: optionalDecimalInput,
    worksheetCLine4AllocatedNYCEic: optionalDecimalInput,
  }).optional(),
  nycIncomeTaxEliminationCredit: optionalDecimalInput,
  it270: z.object({
    investmentIncome: decimal,
    claimsPassThroughEntityTaxCredit: z.boolean().optional(),
  }).optional(),

  yonkersResidencyStatus: z.enum(["full_year", "nonresident", "part_year", "none"]).optional(),
  yonkersWages: optionalDecimalInput,
  yonkersResidentIncomePercentage: optionalDecimalInput,
  daysOfYonkersResidency: z.number().int().min(0).max(366).optional(),
  daysInTaxYear: z.number().int().min(1).max(366).optional(),

  qualifyingChildrenUnder4: z.number().int().min(0).optional(),
  qualifyingChildrenAge4To16: z.number().int().min(0).optional(),
  qualifyingChildren: z.number().int().min(0).optional(),
  federalChildTaxCredit: optionalDecimalInput,

  it216: z.object({
    qualifiedExpenses: decimal,
    numberOfQualifyingPersons: z.number().int().min(1),
    taxpayerEarnedIncome: decimal,
    spouseEarnedIncome: optionalDecimalInput,
    qualifiedExpensesForChildrenUnder4: optionalDecimalInput,
  }).optional(),
  childDependentCareCredit: optionalDecimalInput,

  federalEic: optionalDecimalInput,
  isNoncustodialParentEic: z.boolean().optional(),
  it209: z.object({
    ageAtYearEnd: z.number().int().min(0).max(120),
    hasQualifyingNoncustodialChild: z.boolean(),
    supportOrderInEffectHalfYear: z.boolean(),
    paidRequiredChildSupport: z.boolean(),
    hasValidSocialSecurityNumber: z.boolean(),
    mfsMeetsConsideredUnmarriedRequirement: z.boolean().optional(),
    filesFederalForm2555: z.boolean().optional(),
    investmentIncome: decimal,
    wagesSalariesTips: decimal,
    earnedIncomeAdjustment: optionalDecimalInput,
    businessIncomeOrLoss: optionalDecimalInput,
    claimedFederalEic: z.boolean().optional(),
    accumulationDistributionCredit: optionalDecimalInput,
  }).optional(),

  realPropertyTaxCredit: optionalDecimalInput,
  it214: z.object({
    hasPersonAge65OrOlder: z.boolean(),
    realPropertyMarketValue: optionalDecimalInput,
    residenceExemptFromTaxes: z.boolean().optional(),
    renter: NYIT214RenterInputSchema.optional(),
    homeowner: NYIT214HomeownerInputSchema.optional(),
  }).superRefine((value, ctx) => {
    if (value.renter === undefined && value.homeowner === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IT-214 input requires renter or homeowner details",
        path: ["renter"],
      });
    }

    if (value.homeowner !== undefined && value.realPropertyMarketValue === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IT-214 homeowner input requires realPropertyMarketValue",
        path: ["realPropertyMarketValue"],
      });
    }
  }).optional(),
  it217: NYIT217InputSchema.optional(),

  starCredit: optionalDecimalInput,
  nycYonkersRefundableCredits: optionalDecimalInput,
  otherRefundableCredits: optionalDecimalInput,
  it119: z.object({
    receivedUnderpaymentNotice: z.boolean(),
    properties: z.array(NYIT119PropertySchema).min(1).max(2),
  }).optional(),
  it201attRefundableCredits: z.object({
    farmersSchoolTaxCredit: optionalDecimalInput,
    otherRefundableCredits: optionalDecimalInput,
    otherRefundableCreditEntries: z.array(NYIT201ATTRefundableCreditEntrySchema).max(12).optional(),
    nysClaimOfRightCredit: optionalDecimalInput,
    nycClaimOfRightCredit: optionalDecimalInput,
    yonkersClaimOfRightCredit: optionalDecimalInput,
    mctmtClaimOfRightCredit: optionalDecimalInput,
  }).optional(),
  it227: z.object({
    contributions: z.array(NYIT227ContributionEntrySchema).min(1),
  }).optional(),
  voluntaryContributions: optionalDecimalInput,

  w2s: z.array(W2Schema).optional(),
  form1099R: z.array(Form1099RSchema).optional(),
  form1099G: z.array(Form1099GSchema).optional(),
  formW2G: z.array(FormW2GSchema).optional(),
  nyStateTaxWithheld: optionalDecimalInput,
  nycTaxWithheld: optionalDecimalInput,
  yonkersTaxWithheld: optionalDecimalInput,
  estimatedTaxPayments: optionalDecimalInput,
  priorYearOverpaymentApplied: optionalDecimalInput,
  extensionPayment: optionalDecimalInput,
  appliedToNextYearEstimatedTax: optionalDecimalInput,
  nys529AccountDeposit: optionalDecimalInput,
  estimatedTaxPenalty: optionalDecimalInput,
  otherPenaltiesAndInterest: optionalDecimalInput,
}).superRefine((value, ctx) => {
  if (value.isNYCResident === true && value.isPartYearNYCResident === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NY IT-201 full return cannot mark both full-year and part-year NYC residency",
      path: ["isPartYearNYCResident"],
    });
  }

  if (value.isNYCResident === true && (value.yonkersResidencyStatus ?? "none") !== "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 full return does not support combining full-year NYC resident tax with Yonkers local tax inputs; use IT-360.1 for city residency changes",
      path: ["yonkersResidencyStatus"],
    });
  }

  if (value.isPartYearNYCResident === true && value.partYearNYCTax === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NY IT-201 part-year NYC resident input requires partYearNYCTax from Form IT-360.1",
      path: ["partYearNYCTax"],
    });
  }

  if (value.isPartYearNYCResident === true && value.partYearNYCTaxableIncome === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 part-year NYC resident input requires partYearNYCTaxableIncome from Form IT-360.1 line 47 for line 69a",
      path: ["partYearNYCTaxableIncome"],
    });
  }

  if (value.isPartYearNYCResident === true && value.partYearNYCSchoolCreditMonths === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 part-year NYC resident input requires partYearNYCSchoolCreditMonths for the line 69 school-credit proration table",
      path: ["partYearNYCSchoolCreditMonths"],
    });
  }

  if (
    value.yonkersResidencyStatus === "part_year" &&
    value.yonkersResidentIncomePercentage === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 part-year Yonkers input requires yonkersResidentIncomePercentage from Form IT-360.1 line 73",
      path: ["yonkersResidentIncomePercentage"],
    });
  }

  if (
    value.yonkersResidentIncomePercentage !== undefined &&
    d(value.yonkersResidentIncomePercentage).lessThan(0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NY IT-201 part-year Yonkers input requires a non-negative income percentage",
      path: ["yonkersResidentIncomePercentage"],
    });
  }

  if (value.daysOfYonkersResidency !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields",
      path: ["daysOfYonkersResidency"],
    });
  }

  if (value.daysInTaxYear !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields",
      path: ["daysInTaxYear"],
    });
  }

  if (value.spousePensionExclusion !== undefined && value.filingStatus !== "married_filing_jointly") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse pension exclusion input is only supported for married_filing_jointly returns",
      path: ["spousePensionExclusion"],
    });
  }

  if (
    value.filingStatus === "married_filing_separately"
    && value.nyItemizedDeduction !== undefined
    && d(value.nyItemizedDeduction).greaterThan(
      getNYIT201ResidentConstants(value.taxYear).standardDeduction.married_filing_separately
    )
    && value.spouseUsesItemizedDeduction !== true
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 married filing separately returns may use an itemized deduction only if both spouses elect to itemize on their New York returns",
      path: ["spouseUsesItemizedDeduction"],
    });
  }

  if (
    value.it225?.spouseNy529Contributions !== undefined &&
    value.filingStatus !== "married_filing_jointly"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse NY 529 contribution input is only supported for married_filing_jointly returns",
      path: ["it225", "spouseNy529Contributions"],
    });
  }

  if (
    (value.mctmt?.spouseZone1Earnings !== undefined || value.mctmt?.spouseZone2Earnings !== undefined) &&
    value.filingStatus !== "married_filing_jointly"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse MCTMT earnings input is only supported for married_filing_jointly returns",
      path: ["mctmt", value.mctmt?.spouseZone1Earnings !== undefined ? "spouseZone1Earnings" : "spouseZone2Earnings"],
    });
  }

  if (value.it215?.jointFederalReturnForMfsAllocation === true) {
    if (value.filingStatus !== "married_filing_separately") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IT-215 joint federal NY-MFS allocation is only supported for married_filing_separately returns",
        path: ["it215", "jointFederalReturnForMfsAllocation"],
      });
    }

    if (value.it215.line17AllocatedNYSEic === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IT-215 joint federal NY-MFS input requires the claimed IT-215 line 17 allocation",
        path: ["it215", "line17AllocatedNYSEic"],
      });
    }

    if (
      value.isNYCResident === true
      && value.it215.worksheetCLine4AllocatedNYCEic === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IT-215 joint federal NY-MFS NYC input requires the claimed Worksheet C line 4 allocation",
        path: ["it215", "worksheetCLine4AllocatedNYCEic"],
      });
    }
  }

  if (value.it209?.claimedFederalEic === true && value.federalEic === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IT-209 claimedFederalEic requires top-level federalEic",
      path: ["federalEic"],
    });
  }

  if (value.it119?.receivedUnderpaymentNotice === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NY IT-119 may only be claimed when the taxpayer received an underpayment notice",
      path: ["it119", "receivedUnderpaymentNotice"],
    });
  }

  if (
    value.it119 !== undefined
    && value.it201attRefundableCredits?.otherRefundableCreditEntries?.some(
      (entry) => entry.code.trim() === "119"
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Do not include IT-201-ATT line 12 code 119 manually when structured IT-119 input is provided",
      path: ["it201attRefundableCredits", "otherRefundableCreditEntries"],
    });
  }

  if (value.starCredit !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 2025 resident returns do not accept legacy standalone STAR credit passthroughs; use IT-119 for STAR reconciliation",
      path: ["starCredit"],
    });
  }

  if (value.nycYonkersRefundableCredits !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "NY IT-201 2025 resident returns do not accept legacy standalone NYC/Yonkers refundable-credit passthroughs; use the supported 2025 line 64 and line 71 inputs instead",
      path: ["nycYonkersRefundableCredits"],
    });
  }
});
export type NYIT201FullReturnInputDocument = z.infer<typeof NYIT201FullReturnInputSchema>;

/** Schedule 1-A qualification facts. Absence is unknown, never assumed eligible. */
const schedule1AMoney = decimal.refine((value) => d(value).isFinite() && d(value).gte(0), "Amount must be finite and nonnegative");
const schedule1AOwner = z.enum(["primary", "spouse"]);
const schedule1ADate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const schedule1ATipFacts = {
  owner: schedule1AOwner,
  occupationCode: z.string().regex(/^\d{3}$/),
  eligibleOccupation: z.boolean(),
  voluntaryCashTips: z.boolean(),
  lawfulActivity: z.boolean(),
  meetsSstbRuleOrTransition: z.boolean(),
};
export const Schedule1ASchema = z.object({
  sourceTaxYear: z.number().int().optional(),
  sourceReference: z.string().trim().min(1).optional(),
  sourceFactsConfirmed: z.boolean().optional(),
  allSourcesIncluded: z.boolean().optional(),
  primarySsnEligible: z.boolean(),
  spouseSsnEligible: z.boolean().optional(),
  excludedPuertoRicoIncome: schedule1AMoney,
  form4563Exclusion: schedule1AMoney,
  employeeTips: z.array(z.object({
    ...schedule1ATipFacts,
    employer: z.string().trim().min(1),
    w2SourceIds: z.array(z.string().trim().min(1)).optional(),
    form4137EmployerSourceId: z.string().trim().min(1).optional(),
    reportingMethod: z.enum(["w2", "employer_statement", "form4070", "form4137"]).optional(),
    reportingSourceReference: z.string().trim().min(1).optional(),
    reportedEmployerTips: schedule1AMoney.optional(),
    qualifiedW2Tips: schedule1AMoney,
    qualifiedForm4137Tips: schedule1AMoney,
  })),
  businessTips: z.array(z.object({
    ...schedule1ATipFacts,
    businessName: z.string().trim().min(1),
    businessSourceId: z.string().trim().min(1).optional(),
    reportedTipSources: z.array(z.object({ sourceId: z.string().trim().min(1), qualifiedTips: schedule1AMoney })).optional(),
    qualifiedReportedTips: schedule1AMoney,
    netProfit: decimal.optional(),
    otherAllocableDeductions: schedule1AMoney.optional(),
  })),
  overtime: z.array(z.object({
    owner: schedule1AOwner,
    qualifiedPremium: schedule1AMoney,
    reportedCompensation: schedule1AMoney,
    compensationExcludedFromWages: schedule1AMoney.optional(),
    requiredByFlsa: z.boolean(),
    compensationSourceId: z.string().trim().min(1).optional(),
    reportingSourceReference: z.string().trim().min(1).optional(),
  }).refine((value) => d(value.qualifiedPremium).lte(value.reportedCompensation), "Premium exceeds reported compensation")),
  vehicleLoans: z.array(z.object({
    owner: schedule1AOwner.optional(),
    lenderName: z.string().trim().min(1).optional(),
    loanAccountReference: z.string().trim().min(1).optional(),
    sourceTaxYear: z.number().int().optional(),
    sourceReference: z.string().trim().min(1).optional(),
    borrowerQualificationConfirmed: z.boolean().optional(),
    vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must contain 17 valid characters"),
    acquiredDate: schedule1ADate,
    loanOriginationDate: schedule1ADate,
    interestPaid: schedule1AMoney,
    businessInterestDeducted: schedule1AMoney,
    nonqualifyingInterest: schedule1AMoney,
    firstLien: z.boolean(),
    originalUse: z.boolean(),
    finalAssemblyUnitedStates: z.boolean(),
    personalUse: z.boolean(),
    vehicleType: z.enum(["car", "minivan", "van", "sport_utility_vehicle", "pickup_truck", "motorcycle"]),
    grossVehicleWeightRating: z.number().int().positive(),
    relatedParty: z.boolean(),
    lease: z.boolean(),
    fleet: z.boolean(),
    salvageOrScrap: z.boolean(),
    refinanced: z.boolean(),
  }).refine((value) => d(value.businessInterestDeducted).plus(value.nonqualifyingInterest).lte(value.interestPaid), "Excluded interest exceeds interest paid")),
  seniorOwners: z.array(schedule1AOwner),
}).superRefine((facts, ctx) => {
  for (const [name, entries] of [
    ["employeeTips", facts.employeeTips.map((entry) => `${entry.owner}:${entry.employer.toLowerCase()}`)],
    ["businessTips", facts.businessTips.map((entry) => `${entry.owner}:${entry.businessName.toLowerCase()}`)],
    ["vehicleLoans", facts.vehicleLoans.map((entry) => entry.vin)],
    ["seniorOwners", facts.seniorOwners],
  ] as const) {
    if (new Set(entries).size !== entries.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `Duplicate ${name} entry` });
  }
});
export type Schedule1AInput = z.infer<typeof Schedule1ASchema>;

/** Complete input for a tax year */
export const TaxYearInputSchema = z.object({
  taxpayer: TaxpayerSchema,
  qofDispositionFacts: z.object({
    sourceTaxYear: z.number().int().optional(),
    sourceReference: z.string().optional(),
    sourceFactsConfirmed: z.boolean().optional(),
    allInvestmentsReviewed: z.boolean().optional(),
    disposedOfQofInvestment: z.boolean().optional(),
  }).optional(),
  childTaxCredit: z.object({
    bonaFidePuertoRicoResident: z.boolean().optional(),
    puertoRicoExcludedIncome: decimal.refine(value => d(value).gte(0), "Must be nonnegative").optional(),
    form4563ExcludedIncome: decimal.refine(value => d(value).gte(0), "Must be nonnegative").optional(),
    possessionIncomeExclusion: decimal.refine(value => d(value).gte(0), "Must be nonnegative").optional(),
    nonTaxableCombatPayElection: decimal.refine(value => d(value).gte(0), "Must be nonnegative").optional(),
  }).optional(),
  w2s: z.array(W2Schema).default([]),
  form1099Int: z.array(Form1099IntSchema).default([]),
  form1099Div: z.array(Form1099DivSchema).default([]),
  form1099B: z.array(Form1099BSchema).default([]),
  form1099DA: z.array(Form1099DASchema).default([]),
  form1099Nec: z.array(Form1099NecSchema).default([]),
  form1099Misc: z.array(Form1099MiscSchema).default([]),
  form1099G: z.array(Form1099GSchema).default([]),
  form1099OID: z.array(Form1099OIDSchema).default([]),
  formW2G: z.array(FormW2GSchema).default([]),
  form1099K: z.array(Form1099KSchema).default([]),
  form1099C: z.array(Form1099CSchema).default([]),
  codExclusion: CodExclusionSchema.optional(),
  form982NolSources: Form982NolSourcesSchema.optional(),
  form1099Q: z.array(Form1099QSchema).default([]),
  qualifiedEducationExpenses: QualifiedEducationExpenseSummarySchema.optional(),
  form1099R: z.array(Form1099RSchema).optional(),
  form1099SA: z.array(Form1099SASchema).optional(),
  formSSA1099: z.array(FormSSA1099Schema).optional(),
  formRRB1099: z.array(FormRRB1099Schema).optional(),
  form4137: Form4137Schema.optional(),
  form4137ByOwner: z.object({ primary: Form4137Schema.optional(), spouse: Form4137Schema.optional() }).optional(),
  form8919: Form8919Schema.optional(),
  socialSecurityLumpSumElection: SocialSecurityLumpSumElectionSchema.optional(),
  socialSecurityFacts: SocialSecurityFactsSchema.optional(),
  form4562: Form4562Schema.optional(),
  form4797: Form4797Schema.optional(),
  form8801: Form8801Schema.optional(),
  form8880: Form8880Schema.optional(),
  form5329: Form5329Schema.optional(),
  form5329HsaByOwner: Form5329HsaByOwnerSchema.optional(),
  form8606: Form8606Schema.optional(),
  form8606ByOwner: Form8606ByOwnerSchema.optional(),
  iraBasisSources: IraBasisSourcesSchema.optional(),
  form8889: Form8889Schema.optional(),
  form8889ByOwner: Form8889ByOwnerSchema.optional(),
  paScheduleGLStatements: z.array(PAScheduleGLStatementSchema).optional(),
  paScheduleJStatements: z.array(PAScheduleJStatementSchema).optional(),
  paPassThroughStatements: z.array(PAPassThroughStatementSchema).optional(),
  paResidentReturn: PAResidentReturnSchema.optional(),
  paNonresidentReturn: PANonresidentReturnSchema.optional(),
  scheduleK1: z.array(ScheduleK1Schema).default([]),
  scheduleK1Form1041: z.array(ScheduleK1Form1041Schema).default([]),
  form1098: z.array(Form1098Schema).default([]),
  mortgageInterestWorksheet: MortgageInterestWorksheetSchema.optional(),
  form1098E: z.array(Form1098ESchema).default([]),
  studentLoanInterestFacts: StudentLoanInterestFactsSchema.optional(),
  form1095A: z.array(Form1095ASchema).default([]),
  form8962: Form8962Schema.optional(),
  donations: z.array(CharitableDonationSchema).default([]),
  rentalProperties: z.array(RentalPropertySchema).default([]),
  scheduleC: ScheduleCInputSchema.optional(),
  scheduleF: ScheduleFInputSchema.optional(),
  qbiDeductionAllocations: QBIDeductionAllocationsSchema.optional(),
  dependentCare: DependentCareSchema.optional(),
  dependentCareBenefits: DependentCareBenefitsSchema.optional(),
  standardDeductionFacts: StandardDeductionFactsSchema.optional(),
  deductionElection: z.enum(["automatic", "standard", "itemized"]).optional(),
  educationExpenses: EducationExpensesSchema.optional(),
  priorYear: PriorYearCarryforwardSchema.optional(),
  netOperatingLoss: NetOperatingLossSourcesSchema.optional(),
  charitableCarryoverSources: CharitableCarryoverSourcesSchema.optional(),
  form172: Form172OriginSourcesSchema.optional(),
  adjustments: AdjustmentsSchema.optional(),
  form2210: Form2210Schema.optional(),
  scheduleA: ScheduleAInputSchema.optional(),
  schedule1A: Schedule1ASchema.optional(),
  salesTaxDeduction: SalesTaxDeductionSchema.optional(),
  energyCredits: EnergyCreditsSchema.optional(),
  form8936: Form8936Schema.optional(),
  savingsBondRedemptions: z.array(SavingsBondRedemptionSchema).default([]),
  form8815: Form8815Schema.optional(),
  iraDeductionWorksheet: IraDeductionWorksheetSchema.optional(),
  eic: EicConfigSchema.optional(),
  scheduleR: ScheduleRInputSchema.optional(),
  scheduleH: ScheduleHSchema.optional(),
  form2555: Form2555Schema.optional(),
  foreignTaxElection: ForeignTaxElectionSchema.optional(),
  form8960Sources: Form8960SourcesSchema.optional(),
  form4684: Form4684Schema.optional(),
  form461: Form461SourceSchema.optional(),
  form4952: Form4952InputSchema.optional(),
  form4952Amt: Form4952InputSchema.optional(),
  amtCapitalGains: AMTCapitalGainsSchema.optional(),
  form6252: z.array(Form6252Schema).default([]),
  form6781: Form6781Schema.optional(),
  form8615: Form8615Schema.optional(),
  form8814: z.array(Form8814ChildSchema).default([]),
  scheduleDSpecialGainSources: ScheduleDSpecialGainSourcesSchema.optional(),
  section1202Sources: Section1202SourcesSchema.optional(),
  form8839: Form8839Schema.optional(),
  form3800: Form3800Schema.optional(),
  form3903: Form3903Schema.optional(),
  seHealthInsuranceWorksheet: SEHealthInsuranceWorksheetSchema.optional(),
  form7206: Form7206Schema.optional(),
  scheduleJ: ScheduleJSchema.optional(),
  homeSales: z.array(HomeSaleSchema).default([]),
  form8915F: Form8915FSchema.optional(),
  taxableRefundWorksheet: TaxableRefundWorksheetSchema.optional(),
  form8824: z.array(Form8824Schema).default([]),
  cryptoIncome: CryptoIncomeInputSchema.optional(),
  stateReturns: z.object({
    illinois: IllinoisStateReturnInputSchema.optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.form4137 !== undefined && value.form4137ByOwner !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["form4137ByOwner"], message: "Use either form4137 or form4137ByOwner, not both" });
  }
  if (value.form4137ByOwner?.spouse && (!value.taxpayer.spouse || value.taxpayer.filingStatus !== "married_filing_jointly")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["form4137ByOwner", "spouse"], message: "A separate spouse Form4137 requires an actual spouse and joint return" });
  }
  for (const owner of ["primary", "spouse"] as const) {
    if (value.form4137ByOwner?.[owner] && value.form4137ByOwner[owner].accountHolder !== owner) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["form4137ByOwner", owner], message: "Form4137 record owner must match its actual household owner" });
    }
  }
  if (value.form8606 !== undefined && value.form8606ByOwner !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use either form8606 or form8606ByOwner, not both",
      path: ["form8606ByOwner"],
    });
  }

  if (value.form8606ByOwner?.spouse !== undefined && value.taxpayer.spouse === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse-owned Form 8606 input requires spouse taxpayer information",
      path: ["form8606ByOwner", "spouse"],
    });
  }

  if (value.form8889 !== undefined && value.form8889ByOwner !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use either form8889 or form8889ByOwner, not both",
      path: ["form8889ByOwner"],
    });
  }

  if (value.form8889ByOwner?.spouse !== undefined && value.taxpayer.spouse === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse-owned Form 8889 input requires spouse taxpayer information",
      path: ["form8889ByOwner", "spouse"],
    });
  }

  if (value.socialSecurityLumpSumElection !== undefined) {
    const currentYearSocialSecurityBenefits = [
      ...(value.formSSA1099 ?? []).map((form) => d(form.netBenefits)),
      ...(value.formRRB1099 ?? []).map((form) => d(form.netSocialSecurityEquivalentBenefitPortion)),
    ].reduce((acc, amount) => acc.plus(amount), d(0));
    const delayedBenefitsTotal = value.socialSecurityLumpSumElection.earlierYears.reduce(
      (acc, earlierYear) => acc.plus(d(earlierYear.delayedBenefitsReceivedInCurrentYear)),
      d(0)
    );
    const seenYears = new Set<number>();
    for (const [index, earlierYear] of value.socialSecurityLumpSumElection.earlierYears.entries()) {
      if (earlierYear.taxYear >= value.taxpayer.taxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each lump-sum election earlier year must be before the current tax year",
          path: ["socialSecurityLumpSumElection", "earlierYears", index, "taxYear"],
        });
      }
      if (seenYears.has(earlierYear.taxYear)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each lump-sum election earlier year may appear only once",
          path: ["socialSecurityLumpSumElection", "earlierYears", index, "taxYear"],
        });
      }
      seenYears.add(earlierYear.taxYear);
    }

    if (delayedBenefitsTotal.greaterThan(currentYearSocialSecurityBenefits)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Combined delayed earlier-year benefits cannot exceed the current-year SSA-1099 and RRB-1099 benefits",
        path: ["socialSecurityLumpSumElection", "earlierYears"],
      });
    }
  }

  const illinoisReturn = value.stateReturns?.illinois;
  const isMFJ = value.taxpayer.filingStatus === "married_filing_jointly";
  if (illinoisReturn) {
    if (!isMFJ && illinoisReturn.age65OrOlderCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois age65OrOlderCount cannot exceed 1 unless filing jointly",
        path: ["stateReturns", "illinois", "age65OrOlderCount"],
      });
    }

    if (!isMFJ && illinoisReturn.blindCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois blindCount cannot exceed 1 unless filing jointly",
        path: ["stateReturns", "illinois", "blindCount"],
      });
    }

    if (!isMFJ && (illinoisReturn.scheduleICR?.volunteerEmergencyWorkerCount ?? 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois volunteerEmergencyWorkerCount cannot exceed 1 unless filing jointly",
        path: ["stateReturns", "illinois", "scheduleICR", "volunteerEmergencyWorkerCount"],
      });
    }

    if (illinoisReturn.directDeposit !== undefined && illinoisReturn.refundMethod !== "direct_deposit") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois directDeposit details require refundMethod direct_deposit",
        path: ["stateReturns", "illinois", "directDeposit"],
      });
    }

    if (illinoisReturn.firstYearIllinoisReturn && illinoisReturn.refundMethod === "direct_deposit") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois first-year filers cannot elect direct deposit",
        path: ["stateReturns", "illinois", "refundMethod"],
      });
    }

    if (illinoisReturn.healthInsuranceCheckbox?.spouseUninsured && !isMFJ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Illinois healthInsuranceCheckbox spouse selection requires married filing jointly",
        path: ["stateReturns", "illinois", "healthInsuranceCheckbox", "spouseUninsured"],
      });
    }

    if (
      illinoisReturn.refundAmountRequested !== undefined
      && d(illinoisReturn.refundAmountRequested).lessThanOrEqualTo(0)
    ) {
      if (illinoisReturn.refundMethod !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Illinois refundMethod requires a positive refundAmountRequested when Line 38 is provided",
          path: ["stateReturns", "illinois", "refundMethod"],
        });
      }

      if (illinoisReturn.directDeposit !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Illinois directDeposit details require a positive refundAmountRequested when Line 38 is provided",
          path: ["stateReturns", "illinois", "directDeposit"],
        });
      }
    }
  }
});

export type TaxYearInput = z.infer<typeof TaxYearInputSchema>;
export type Taxpayer = z.infer<typeof TaxpayerSchema>;
export type FilingStatus = z.infer<typeof FilingStatusSchema>;
export type W2 = z.infer<typeof W2Schema>;
export type Form1099Int = z.infer<typeof Form1099IntSchema>;
export type Form1099Div = z.infer<typeof Form1099DivSchema>;
export type Form1099B = z.infer<typeof Form1099BSchema>;
export type CapitalTransaction = z.infer<typeof CapitalTransactionSchema>;
export type Form1099DA = z.infer<typeof Form1099DASchema>;
export type Form1099DATransaction = z.infer<typeof Form1099DATransactionSchema>;
export type CryptoMiningIncome = z.infer<typeof CryptoMiningIncomeSchema>;
export type CryptoStakingIncome = z.infer<typeof CryptoStakingIncomeSchema>;
export type CryptoAirdropIncome = z.infer<typeof CryptoAirdropIncomeSchema>;
export type CryptoIncomeInput = z.infer<typeof CryptoIncomeInputSchema>;
export type CryptoCostBasisMethod = z.infer<typeof CryptoCostBasisMethodSchema>;
export type CryptoLot = z.infer<typeof CryptoLotSchema>;
export type DeFiTokenSwap = z.infer<typeof DeFiTokenSwapSchema>;
export type DeFiLPPosition = z.infer<typeof DeFiLPPositionSchema>;
export type DeFiYieldReward = z.infer<typeof DeFiYieldRewardSchema>;
export type NFTTransaction = z.infer<typeof NFTTransactionSchema>;
export type CryptoLendingIncome = z.infer<typeof CryptoLendingIncomeSchema>;
export type CryptoLiquidation = z.infer<typeof CryptoLiquidationSchema>;
export type CryptoDonation = z.infer<typeof CryptoDonationSchema>;
export type Form1099Nec = z.infer<typeof Form1099NecSchema>;
export type Form1099Misc = z.infer<typeof Form1099MiscSchema>;
export type Form1099G = z.infer<typeof Form1099GSchema>;
export type FormW2G = z.infer<typeof FormW2GSchema>;
export type Form1099K = z.infer<typeof Form1099KSchema>;
export type Form1099C = z.infer<typeof Form1099CSchema>;
export type Form1099Q = z.infer<typeof Form1099QSchema>;
export type QualifiedEducationExpenseSummary = z.infer<typeof QualifiedEducationExpenseSummarySchema>;
export type CodExclusion = z.infer<typeof CodExclusionSchema>;
export type Form1099R = z.infer<typeof Form1099RSchema>;
export type Form1099SA = z.infer<typeof Form1099SASchema>;
export type FormSSA1099 = z.infer<typeof FormSSA1099Schema>;
export type FormRRB1099 = z.infer<typeof FormRRB1099Schema>;
export type Form4137Input = z.infer<typeof Form4137Schema>;
export type Form4137SourceFacts = z.infer<typeof Form4137SourceFactsSchema>;
export type Form8919Input = z.infer<typeof Form8919Schema>;
export type SocialSecurityLumpSumElection = z.infer<typeof SocialSecurityLumpSumElectionSchema>;
export type SocialSecurityLumpSumElectionYear = z.infer<typeof SocialSecurityLumpSumElectionYearSchema>;
export type DepreciableAsset = z.infer<typeof DepreciableAssetSchema>;
export type AmortizableAsset = z.infer<typeof AmortizableAssetSchema>;
export type Form4562Input = z.infer<typeof Form4562Schema>;
export type Form4797PropertySale = z.infer<typeof Form4797PropertySaleSchema>;
export type Form4797Input = z.infer<typeof Form4797Schema>;
export type Form8801Input = z.infer<typeof Form8801Schema>;
export type Form8880Input = z.infer<typeof Form8880Schema>;
export type Form5329Input = z.infer<typeof Form5329Schema>;
export type Form8606Input = z.infer<typeof Form8606Schema>;
export type Form8606ByOwnerInput = z.infer<typeof Form8606ByOwnerSchema>;
export type HsaCoverage = z.infer<typeof HsaCoverageSchema>;
export type Form8889PriorYearRedeterminedLimitWorksheet = z.infer<
  typeof Form8889PriorYearRedeterminedLimitWorksheetSchema
>;
export type Form8889Input = z.infer<typeof Form8889Schema>;
export type Form8889ByOwnerInput = z.infer<typeof Form8889ByOwnerSchema>;
export type Form8829ExpenseBucket = z.infer<typeof Form8829ExpenseBucketSchema>;
export type Form8829Input = z.infer<typeof Form8829Schema>;
export type PAScheduleGLStatement = z.infer<typeof PAScheduleGLStatementSchema>;
export type PAScheduleJStatement = z.infer<typeof PAScheduleJStatementSchema>;
export type PAPassThroughStatement = z.infer<typeof PAPassThroughStatementSchema>;
export type PAScheduleA = z.infer<typeof PAScheduleASchema>;
export type PAScheduleO = z.infer<typeof PAScheduleOSchema>;
export type PAResidentReturn = z.infer<typeof PAResidentReturnSchema>;
export type PANonresidentReturn = z.infer<typeof PANonresidentReturnSchema>;
export type ScheduleK1 = z.infer<typeof ScheduleK1Schema>;
export type Form1098 = z.infer<typeof Form1098Schema>;
export type Form1095A = z.infer<typeof Form1095ASchema>;
export type CharitableDonation = z.infer<typeof CharitableDonationSchema>;
export type PriorYearCarryforward = z.infer<typeof PriorYearCarryforwardSchema>;
export type Adjustments = z.infer<typeof AdjustmentsSchema>;
export type RentalProperty = z.infer<typeof RentalPropertySchema>;
export type DependentCare = z.infer<typeof DependentCareSchema>;
export type DependentCareBenefits = z.infer<typeof DependentCareBenefitsSchema>;
export type EducationExpenses = z.infer<typeof EducationExpensesSchema>;
export type EnergyCredits = z.infer<typeof EnergyCreditsSchema>;
export type SavingsBondRedemption = z.infer<typeof SavingsBondRedemptionSchema>;
export type ScheduleRInput = z.infer<typeof ScheduleRInputSchema>;
export type Form4684Property = z.infer<typeof Form4684PropertySchema>;
export type Form4684Event = z.infer<typeof Form4684EventSchema>;
export type Form4684Input = z.infer<typeof Form4684Schema>;
