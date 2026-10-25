/** Form 1099-OID recipient reporting; spec/federal/form-1099-oid.yaml. */
import Decimal from "decimal.js";
import type { Form1099OID } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

const amountKeys = ["taxableInterest", "taxExemptInterest", "treasuryInterest", "privateActivityBondInterest",
  "deferredMarketDiscount", "earlyWithdrawalPenalty", "federalWithheld", "stateWithheld", "bondPremiumDeduction",
  "bondPremiumCarryforward", "deflationOrdinaryLoss", "deflationCarryforward", "nondeductiblePremiumLoss"] as const;
type Amounts = { [K in typeof amountKeys[number]]: Decimal };
export interface Form1099OIDSourceResult extends Amounts {
  payer: string;
  sourceId: string;
  sourceFactsVerified: boolean;
  stateWithholding: Array<{ state: string; statePayerId: string; stateWithheld: Decimal }>;
}
export interface Form1099OIDResult extends Amounts {
  taxYear: number;
  sourceFactsVerified: boolean;
  sources: Form1099OIDSourceResult[];
  lines: CalculatedLine[];
}
function amounts(): Amounts {
  return Object.fromEntries(amountKeys.map(key => [key, d(0)])) as Amounts;
}
function amount(value: string | Decimal | undefined, name: string, signed = false): Decimal {
  if (value === undefined || value === "") throw new Error(`Form 1099-OID requires actual ${name}.`);
  const number = d(value);
  if (!number.isFinite() || (!signed && number.isNegative())) throw new Error(`Form 1099-OID ${name} must be finite${signed ? "" : " and nonnegative"}.`);
  return number;
}
function legacy(value: string | undefined, name: string): Decimal { return amount(value ?? "0", name); }
function periodDate(value: string, year: number, previous: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    || Number(value.slice(0, 4)) !== year || value <= previous) throw new Error("Form 1099-OID accrual period date must be valid, ordered and in the source year.");
  return value;
}

export function calculateForm1099OID(forms: Form1099OID[], taxYear = 2025): Form1099OIDResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error(`Form 1099-OID does not support tax year ${taxYear}.`);
  const audit = new AuditTrail();
  const seen = new Set<string>();
  const sources: Form1099OIDSourceResult[] = [];
  for (const [index, form] of forms.entries()) {
    const verified = taxYear === 2026 || form.sourceFactsConfirmed !== undefined || form.sourceFormRevision !== undefined;
    const sourceId = verified ? form.sourceId : `legacy-${index + 1}`;
    if (verified && form.sourceFactsComplete !== true) throw new Error("Form 1099-OID requires complete original source facts before defaults.");
    if (!sourceId?.trim() || !form.payer.trim()) throw new Error("Form 1099-OID requires actual payer and source identity.");
    if (seen.has(sourceId)) throw new Error("Form 1099-OID duplicate source identity.");
    seen.add(sourceId);
    const source: Form1099OIDSourceResult = { ...amounts(), payer: form.payer, sourceId, sourceFactsVerified: verified, stateWithholding: [] };
    const record = (line: string, label: string, value: Decimal, formula: string) => audit.record("Form 1099-OID", `${sourceId}:${line}`, label, value, formula);
    if (!verified) {
      // Historical aliases were labeled inconsistently. Preserve their old preview behavior, never promote it to verified facts.
      const oid = zeroFloor(legacy(form.originalIssueDiscount, "legacy OID").minus(legacy(form.acquisitionPremium, "legacy acquisition premium")));
      const interest = zeroFloor(legacy(form.otherPeriodicInterest, "legacy interest").minus(legacy(form.bondPremium, "legacy bond premium")));
      source.taxableInterest = oid.plus(interest);
      source.taxExemptInterest = zeroFloor(legacy(form.taxExemptOID, "legacy tax-exempt OID").minus(legacy(form.taxExemptBondPremium, "legacy tax-exempt premium")));
      source.earlyWithdrawalPenalty = legacy(form.earlyWithdrawalPenalty, "legacy early withdrawal penalty");
      source.federalWithheld = legacy(form.federalWithheld, "legacy federal withholding");
      record("legacy", "Unverified historical interest", source.taxableInterest, "Legacy aliases; actual current box mapping and instrument facts are unresolved");
    } else {
      if (form.sourceFactsConfirmed !== true || form.sourceFormRevision !== "2024-01") throw new Error("Form 1099-OID requires confirmed actual current box mapping.");
      if (form.recipientAmountsConfirmed !== true) throw new Error("Form 1099-OID requires actual recipient amount reconciliation, including holding period and basis adjustments.");
      if (form.taxYear !== taxYear) throw new Error("Form 1099-OID source year does not match the return.");
      if (!form.description?.trim() || !form.obligationType || form.inflationIndexed === undefined) throw new Error("Form 1099-OID requires actual instrument description and classification.");
      if (!legacy(form.taxExemptBondPremium, "legacy tax-exempt premium").isZero()) throw new Error("Form 1099-OID legacy tax-exempt premium requires source reconciliation to actual Box 6 or 10.");
      if (form.oidReportedNetOfAcquisitionPremium === undefined || form.interestReportedNetOfBondPremium === undefined) throw new Error("Form 1099-OID requires actual gross or net reporting facts.");
      const raw = {
        oid: amount(form.originalIssueDiscount, "Box 1"), interest: amount(form.otherPeriodicInterest, "Box 2"),
        market: amount(form.marketDiscount, "Box 5"), acquisition: amount(form.acquisitionPremium, "Box 6"),
        treasury: amount(form.treasuryOID, "Box 8", true), expenses: amount(form.investmentExpenses, "Box 9"),
        premium: amount(form.bondPremium, "Box 10"), exempt: amount(form.taxExemptOID, "Box 11"),
      };
      source.earlyWithdrawalPenalty = amount(form.earlyWithdrawalPenalty, "Box 3");
      source.federalWithheld = amount(form.federalWithheld, "Box 4");
      const category = form.obligationType;
      if ((category !== "taxable" && !raw.oid.isZero()) || (category !== "treasury" && !raw.treasury.isZero()) || (category !== "tax_exempt" && !raw.exempt.isZero())) {
        throw new Error("Form 1099-OID source amounts contradict the actual instrument category; separate obligations cannot be mixed.");
      }
      if (category !== "treasury" && form.inflationIndexed) throw new Error("Form 1099-OID non-Treasury inflation-indexed instruments require a separate recipient worksheet integration.");
      const adj = form.recipientAdjustments;
      if (adj && !adj.sourceReference?.trim()) throw new Error("Form 1099-OID recipient adjustments require their actual worksheet reference.");
      const adjustment = (key: "oid" | "periodicInterest" | "acquisitionPremium" | "bondPremium" | "marketDiscount") => adj ? amount(adj[key], `recipient ${key} adjustment`, true) : d(0);
      const grossOid = (category === "taxable" ? raw.oid : category === "treasury" ? raw.treasury : raw.exempt).plus(adjustment("oid"));
      const coupon = amount(raw.interest.plus(adjustment("periodicInterest")), "reconciled stated interest");
      const acquisition = amount(raw.acquisition.plus(adjustment("acquisitionPremium")), "reconciled acquisition premium");
      const premium = amount(raw.premium.plus(adjustment("bondPremium")), "reconciled bond premium");
      const market = amount(raw.market.plus(adjustment("marketDiscount")), "reconciled market discount");
      if (grossOid.isNegative() && (category !== "treasury" || !form.inflationIndexed)) throw new Error("Form 1099-OID negative OID requires actual inflation-indexed Treasury classification.");
      if (form.oidReportedNetOfAcquisitionPremium && !acquisition.isZero()) throw new Error("Form 1099-OID already-net OID cannot deduct separate acquisition premium again.");
      if (form.interestReportedNetOfBondPremium && !premium.isZero()) throw new Error("Form 1099-OID already-net interest cannot deduct separate bond premium again.");
      if (acquisition.gt(zeroFloor(grossOid))) throw new Error("Form 1099-OID acquisition premium exceeds the matching actual OID.");
      const netOid = grossOid.minus(acquisition);
      if (market.gt(0) && form.marketDiscountElection === undefined) throw new Error("Form 1099-OID requires the actual market discount election.");
      const currentMarketDiscount = form.marketDiscountElection === true ? market : d(0);
      source.deferredMarketDiscount = market.minus(currentMarketDiscount);
      const taxablePremiumClaim = category !== "tax_exempt" && (premium.gt(0) || form.interestReportedNetOfBondPremium || form.bondPremiumWorksheet !== undefined);
      if (taxablePremiumClaim && form.bondPremiumElection === undefined) throw new Error("Form 1099-OID requires the actual bond premium election.");
      if (category !== "tax_exempt" && form.interestReportedNetOfBondPremium && form.bondPremiumElection !== true) throw new Error("Form 1099-OID net interest requires reconciliation to the actual bond premium election.");
      const applyPremium = category === "tax_exempt" || form.bondPremiumElection === true;
      if (applyPremium && taxablePremiumClaim && form.modernBondPremiumRulesApply !== true) throw new Error("Form 1099-OID historical bond premium election rules require their actual separate worksheet.");
      let netCoupon = coupon;
      if (applyPremium) {
        const worksheet = form.bondPremiumWorksheet;
        if (worksheet) {
          if (form.inflationIndexed) throw new Error("Form 1099-OID TIPS premium history requires the linked premium-deflation worksheet; a regular bond worksheet is not interchangeable.");
          if (form.interestReportedNetOfBondPremium) throw new Error("Form 1099-OID already-net interest requires gross-source reconciliation before applying an accrual-period worksheet.");
          if (worksheet.periods.length === 0) throw new Error("Form 1099-OID requires actual accrual-period history.");
          let priorInterest = amount(worksheet.priorInterestInclusions, "prior premium-period interest inclusions");
          let priorDeductions = amount(worksheet.priorPremiumDeductions, "prior premium deductions");
          let carry = amount(worksheet.priorCarryforward, "prior premium carryforward");
          if (priorDeductions.gt(priorInterest)) throw new Error("Form 1099-OID prior premium deductions exceed supported prior interest history.");
          if (category === "tax_exempt" && (!priorDeductions.isZero() || !carry.isZero())) throw new Error("Form 1099-OID tax-exempt premium is nondeductible and cannot use taxable premium carry.");
          let periodInterest = d(0), periodPremium = d(0), previous = "";
          netCoupon = d(0);
          for (const period of worksheet.periods) {
            previous = periodDate(period.endDate, taxYear, previous);
            const interest = amount(period.qualifiedStatedInterest, "period stated interest");
            const amortization = amount(period.amortization, "period premium amortization");
            periodInterest = periodInterest.plus(interest);
            periodPremium = periodPremium.plus(amortization);
            const allocable = amortization.plus(carry);
            const included = zeroFloor(interest.minus(allocable));
            const excess = zeroFloor(allocable.minus(interest));
            const deduction = category === "tax_exempt" ? d(0) : Decimal.min(excess, zeroFloor(priorInterest.minus(priorDeductions)));
            source.bondPremiumDeduction = source.bondPremiumDeduction.plus(deduction);
            source.nondeductiblePremiumLoss = source.nondeductiblePremiumLoss.plus(category === "tax_exempt" ? excess : d(0));
            carry = category === "tax_exempt" ? d(0) : excess.minus(deduction);
            priorInterest = priorInterest.plus(included);
            priorDeductions = priorDeductions.plus(deduction);
            netCoupon = netCoupon.plus(included);
          }
          if (!periodInterest.eq(coupon) || !periodPremium.eq(premium)) throw new Error("Form 1099-OID accrual-period totals must reconcile to actual source interest and premium.");
          if (worksheet.disposedDuringYear && category !== "tax_exempt") {
            source.bondPremiumDeduction = source.bondPremiumDeduction.plus(carry);
            carry = d(0);
          }
          source.bondPremiumCarryforward = carry;
        } else {
          if (premium.gt(coupon) && category !== "tax_exempt") throw new Error("Form 1099-OID excess premium requires actual accrual-period history, including TIPS premium-deflation attribution.");
          netCoupon = zeroFloor(coupon.minus(premium));
          source.nondeductiblePremiumLoss = category === "tax_exempt" ? zeroFloor(premium.minus(coupon)) : d(0);
        }
      } else if (form.bondPremiumWorksheet) {
        throw new Error("Form 1099-OID a premium worksheet cannot be applied without the actual amortization election.");
      }
      let ordinaryInterest = zeroFloor(netOid).plus(netCoupon);
      if (form.inflationIndexed) {
        const facts = form.tipsDeflationFacts;
        if (!facts) throw new Error("Form 1099-OID requires actual TIPS deflation history facts.");
        if (facts.allInstrumentInterestReportedHere !== true) throw new Error("Form 1099-OID TIPS interest on another statement requires explicit same-instrument linkage before deflation can be allocated.");
        const priorInterest = amount(facts.priorInterestInclusions, "prior TIPS interest inclusions");
        const priorLoss = amount(facts.priorOrdinaryLosses, "prior TIPS ordinary losses");
        const carry = amount(facts.priorCarryforward, "prior TIPS deflation carryforward");
        if (priorLoss.gt(priorInterest)) throw new Error("Form 1099-OID prior TIPS losses exceed actual prior interest inclusions.");
        const deflation = zeroFloor(netOid.negated()).plus(carry);
        if (deflation.gt(0) && currentMarketDiscount.gt(0)) throw new Error("Form 1099-OID mixed TIPS market-discount deflation requires an explicit allocation worksheet for source attribution.");
        const offset = Decimal.min(deflation, ordinaryInterest);
        const excess = deflation.minus(offset);
        source.deflationOrdinaryLoss = Decimal.min(excess, priorInterest.minus(priorLoss));
        source.deflationCarryforward = excess.minus(source.deflationOrdinaryLoss);
        ordinaryInterest = ordinaryInterest.minus(offset);
      } else if (form.tipsDeflationFacts) throw new Error("Form 1099-OID deflation facts contradict the actual non-inflation-indexed classification.");
      source.taxableInterest = (category === "tax_exempt" ? d(0) : ordinaryInterest).plus(currentMarketDiscount);
      source.treasuryInterest = category === "treasury" ? ordinaryInterest : d(0);
      source.taxExemptInterest = category === "tax_exempt" ? ordinaryInterest : d(0);
      if (category === "tax_exempt") {
        if (form.specifiedPrivateActivityBond === undefined) throw new Error("Form 1099-OID requires the actual specified private-activity bond classification.");
        source.privateActivityBondInterest = form.specifiedPrivateActivityBond ? source.taxExemptInterest : d(0);
      }
      for (const [line, label, value] of [
        ["1", "Original issue discount", raw.oid], ["2", "Other periodic interest", raw.interest],
        ["3", "Early withdrawal penalty", source.earlyWithdrawalPenalty], ["4", "Federal income tax withheld", source.federalWithheld],
        ["5", "Market discount", raw.market], ["6", "Acquisition premium", raw.acquisition], ["8", "Treasury OID", raw.treasury],
        ["9", "Investment expenses already included in Box 2", raw.expenses], ["10", "Bond premium", raw.premium], ["11", "Tax-exempt OID", raw.exempt],
      ] as const) record(line, label, value, "Actual source box before recipient reconciliation; do not infer a different form's box number");
    }
    for (const row of form.stateWithholding ?? []) {
      if (!/^[A-Z]{2}$/.test(row.state) || typeof row.statePayerId !== "string") throw new Error("Form 1099-OID requires actual state withholding jurisdiction and payer ID facts.");
      const withholding = amount(row.stateWithheld, "Box 14 state withholding");
      source.stateWithholding.push({ state: row.state, statePayerId: row.statePayerId, stateWithheld: withholding });
      source.stateWithheld = source.stateWithheld.plus(withholding);
    }
    if (source.stateWithholding.length > 2 || new Set(source.stateWithholding.map(row => row.state)).size !== source.stateWithholding.length) throw new Error("Form 1099-OID state withholding rows must be distinct and no more than two.");
    if (verified && !form.stateWithholding) throw new Error("Form 1099-OID requires actual state withholding rows or confirmed empty rows.");
    for (const key of amountKeys) record(key, key, source[key], verified ? "Reconciled actual source calculation under the applicable instrument rules" : "Unverified historical preview only");
    sources.push(source);
  }
  const totals = amounts();
  for (const source of sources) for (const key of amountKeys) totals[key] = totals[key].plus(source[key]);
  return { taxYear, ...totals, sourceFactsVerified: sources.every(source => source.sourceFactsVerified), sources, lines: audit.getLines() };
}
