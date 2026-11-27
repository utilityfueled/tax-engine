/** Private §38 and §39 workpaper for the narrow direct 2026 §45W lane. */
import type Decimal from "decimal.js";
import { z } from "zod";
import { calculateForm3800 } from "@/engine/forms/form-3800.js";
import { calculateCommercialCleanVehicleCredit2026 } from "@/engine/forms/form-8936-commercial-clean-vehicle-2026.js";
import { CommercialCleanVehicle2026SourceSchema } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";

const FORM = "Form 3800";
const reference = z.string().refine(value => value.trim().length > 0);
const originalMoney = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
// The statutory percentage in a confirmed prior limitation can produce fractions of a cent.
const derivedMoney = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/u);
const currentTaxWorkpaper = { taxYear: z.literal(2026), reference };

const workpaperSchema = z.strictObject({
  taxYear: z.literal(2026),
  owner: z.literal("primary"),
  filingStatus: z.literal("single"),
  taxableIndividualCalendarYearConfirmed: z.literal(true),
  materiallyParticipatingSoleProprietorConfirmed: z.literal(true),
  noOtherCurrentPassiveOrCarryCreditsConfirmed: z.literal(true),
  requiredBasisAdjustmentsReflectedInTaxAndCreditsConfirmed: z.literal(true),
  currentWorkpapersForSamePrimaryTaxpayerConfirmed: z.literal(true),
  vehicles: z.array(CommercialCleanVehicle2026SourceSchema).min(1).readonly(),
  otherVehicleClaimVinsConfirmed: z.literal(true),
  otherClaimVins: z.array(z.string().refine(vin => /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim()))).readonly(),
  regularTaxWorkpaper: z.strictObject({
    ...currentTaxWorkpaper,
    amount: originalMoney,
    applicableSchedule2AndExclusionsReconciledConfirmed: z.literal(true),
  }),
  alternativeMinimumTaxWorkpaper: z.strictObject({
    ...currentTaxWorkpaper,
    amt: originalMoney,
    tentativeMinimumTax: originalMoney,
    actualForm6251AmountsConfirmed: z.literal(true),
  }),
  nonrefundableCreditsWorkpaper: z.strictObject({
    ...currentTaxWorkpaper,
    childTaxCredit: originalMoney,
    otherNonrefundableCredits: originalMoney,
    allowableSection38ReductionsReconciledConfirmed: z.literal(true),
  }),
  priorYear: z.strictObject({
    taxYear: z.literal(2025),
    filingStatus: z.literal("single"),
    samePrimaryTaxpayerAndCalendarYearConfirmed: z.literal(true),
    filedReturnReference: reference,
    section38LimitationReference: reference,
    priorityCreditOrderingReference: reference,
    section39CapacityVerifiedConfirmed: z.literal(true),
    onlyOrdinarySection38PriorityCreditsConfirmed: z.literal(true),
    excludesProposedCarrybackConfirmed: z.literal(true),
    section38Limitation: derivedMoney,
    section38CarryforwardAndCurrentCredits: derivedMoney,
    // No source tax year falls between successive calendar years 2025 and 2026.
    earlierSourceYearCarrybacks: derivedMoney.refine(value => d(value).isZero()),
  }).optional(),
});

type WorkpaperInput = z.input<typeof workpaperSchema>;

interface WorkpaperResult {
  tentativeSection45WCredit: Decimal;
  currentYearSection38Limitation: Decimal;
  allowableCredit2026: Decimal;
  unusedCredit2026: Decimal;
  priorYearSection39Capacity?: Decimal;
  carrybackTo2025: Decimal;
  potentialCarryforwardTo2027: Decimal;
  lines: CalculatedLine[];
}

export function calculateCommercialCleanVehicleForm3800Workpaper2026(input: WorkpaperInput): WorkpaperResult {
  const parsed = workpaperSchema.safeParse(input);
  if (!parsed.success) throw new Error("The §45W workpapers require complete original facts within the supported 2026 direct-credit calculation.");

  const {
    taxYear, vehicles, otherClaimVins, filingStatus, priorYear,
    regularTaxWorkpaper, alternativeMinimumTaxWorkpaper, nonrefundableCreditsWorkpaper,
  } = parsed.data;
  const regularTax = d(regularTaxWorkpaper.amount);
  const amt = d(alternativeMinimumTaxWorkpaper.amt);
  const tentativeMinimumTax = d(alternativeMinimumTaxWorkpaper.tentativeMinimumTax);
  const childTaxCredit = d(nonrefundableCreditsWorkpaper.childTaxCredit);
  const otherNonrefundableCredits = d(nonrefundableCreditsWorkpaper.otherNonrefundableCredits);
  if (amt.gt(tentativeMinimumTax) || childTaxCredit.plus(otherNonrefundableCredits).gt(regularTax.plus(amt))) {
    throw new Error("The §45W workpapers contain inconsistent original tax or allowable credit amounts.");
  }

  const { tentativeCredit, lines: vehicleLines } = calculateCommercialCleanVehicleCredit2026({ taxYear, vehicles, otherClaimVins });
  const zero = d(0);
  const current = calculateForm3800({
    filingStatus, scheduleK1s: [], currentYearCredits: tentativeCredit, passiveActivityCredits: zero, carryforward: zero,
    regularTax, amt, tentativeMinimumTax, childTaxCredit, otherNonrefundableCredits,
  });
  const unusedCredit2026 = tentativeCredit.minus(current.allowableCredit);
  if (unusedCredit2026.gt(zero) && !priorYear) {
    throw new Error("Unused §45W credit requires confirmed 2025 §39 capacity workpapers before calculating a carryforward.");
  }

  const priorYearSection39Capacity = priorYear
    ? zeroFloor(d(priorYear.section38Limitation).minus(priorYear.section38CarryforwardAndCurrentCredits))
    : undefined;
  const carrybackTo2025 = priorYearSection39Capacity !== undefined ? min(unusedCredit2026, priorYearSection39Capacity) : zero;
  const potentialCarryforwardTo2027 = unusedCredit2026.minus(carrybackTo2025);
  const audit = new AuditTrail();
  audit.merge(vehicleLines);
  audit.record(FORM, "current-year-limitation", "Ordinary 2026 general business credit limitation", current.creditLimitation,
    "Net income tax less the greater of tentative minimum tax or the 25% excess threshold, floored at zero", {
      "Actual net income tax": current.netIncomeTax,
      "Actual tentative minimum tax": tentativeMinimumTax,
      "25% of net regular tax above threshold": current.twentyFivePercentExcess,
    });
  audit.record(FORM, "current-year-allowable", "2026 commercial clean vehicle credit allowed", current.allowableCredit,
    "Smaller of the tentative §45W credit or the ordinary §38(c)(1) limitation");
  if (priorYearSection39Capacity !== undefined) {
    audit.record(FORM, "carryback-to-2025", "2025 commercial clean vehicle carryback", carrybackTo2025,
      "Smaller of unused 2026 credit and actual 2025 §39 capacity", { "2025 capacity": priorYearSection39Capacity });
  }
  audit.record(FORM, "potential-carryforward-to-2027", "Commercial clean vehicle credit potentially carried forward", potentialCarryforwardTo2027,
    "Unused 2026 credit after applying the 2025 carryback");

  return {
    tentativeSection45WCredit: tentativeCredit,
    currentYearSection38Limitation: current.creditLimitation,
    allowableCredit2026: current.allowableCredit,
    unusedCredit2026,
    priorYearSection39Capacity,
    carrybackTo2025,
    potentialCarryforwardTo2027,
    lines: audit.getLines(),
  };
}
