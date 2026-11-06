/** Spec: spec/state/oh-2026-business-draft.yaml. Finite source-bound draft; not a complete return. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TaxpayerSchema, StandardDeductionFactsSchema, ScheduleCInputSchema, BusinessExpensesSchema, type TaxYearInput } from '@/models/inputs.js';
import { ohioNrcCategories } from '@/models/ohio-residency.js';
import { Ohio2026BusinessDraftSourcesSchema } from '@/models/ohio-2026-business-draft.js';
import { FEDERAL_2026_CONSTANTS, FEDERAL_2026_INDEXED } from '@/models/federal-2026-indexed.js';
import type { Ohio2026ReturnDraftResult } from './oh-2026-return-draft.js';
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { calculateScheduleSE } from '@/engine/schedules/schedule-se.js';
import { calculateOhioCanonicalBusinessSource, readOhioCanonicalBusinessSource } from './oh-business-source.js';
import { calculateOhio2026Baseline } from './oh-2026-baseline.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';

export interface Ohio2026BusinessDraftResult extends Omit<Ohio2026ReturnDraftResult, 'ruleVersion' | 'withholding' | 'underpaymentPenalty' | 'latePaymentInterest' | 'amountDue' | 'refund'> {
  ruleVersion: 'oh-2026-canonical-business-draft-v1';
  deductibleHalfSelfEmploymentTax: Decimal;
  residentFederalDeductions: Decimal;
  businessIncomeDeduction: Decimal;
  modifiedAdjustedGrossIncome: Decimal;
  ohioApportionmentRatio: Decimal;
  ohioApportionedBusinessIncome: Decimal;
  ohioBusinessIncomeAfterDeduction: Decimal;
  withholding: null; payments: null; schoolDistrictTax: null;
  underpaymentPenalty: null; latePaymentInterest: null; amountDue: null; refund: null;
}
function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
const digest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
function fail(message: string): never { throw new Error(`Ohio2026 business draft actual sources: ${message}`); }
/** Recompute every original/source stage on each call. No caller context or saved projection is proof. */
export function calculateOhio2026BusinessDraft(input: TaxYearInput, raw: unknown): Ohio2026BusinessDraftResult {
  const parsed = Ohio2026BusinessDraftSourcesSchema.safeParse(raw);
  const taxpayer = TaxpayerSchema.strict().safeParse(input.taxpayer);
  const standard = StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts);
  if (!parsed.success || !taxpayer.success || !standard.success) fail('complete current documentary packet and exemption facts required');
  const source = parsed.data, facts = source.residencyFacts, sf = standard.data;
  if (input.taxpayer.taxYear !== 2026 || input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse
    || !Array.isArray(input.taxpayer.dependents) || input.taxpayer.dependents.length) fail('single primary no-dependent2026 cohort required');
  if (sf.primaryCanBeClaimedAsDependent !== false || sf.primaryDeathDate !== null || sf.primaryBlind !== false
    || sf.nonresidentAlien !== false || sf.dualStatusAlien !== false || sf.shortTaxYear !== false) fail('actual completed single owner exemption eligibility required');
  const person = input.taxpayer.primary, born = Date.parse(`${person.dateOfBirth}T00:00:00Z`);
  if (!/^\d{9}$/.test(person.ssn.replace(/\D/g, '')) || !Number.isFinite(born)
    || new Date(born).toISOString().slice(0, 10) !== person.dateOfBirth
    || person.dateOfBirth <= '1962-01-01' || person.dateOfBirth > '2008-12-31') fail('actual adult under65 identity and birth date required');
  const allowed = new Set(['taxpayer', 'standardDeductionFacts', 'scheduleC', 'ohioResidency']);
  const emptyArrays = new Set(['w2s', 'form1099Int', 'form1099Div', 'form1099B', 'form1099Nec', 'form1099Misc', 'scheduleK1', 'form1098', 'form1095A', 'donations']);
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || allowed.has(key)) continue;
    if (emptyArrays.has(key) && Array.isArray(value) && value.length === 0) continue;
    fail('retained other federal income adjustment credit payment or election needs its separate method');
  }
  const { ohioResidency: _residency, ...originals } = input;
  if (digest(source.originalFederalSources) !== digest(originals)
    || input.ohioResidency !== undefined && digest(input.ohioResidency) !== digest(facts)) fail('full current original snapshot or retained residency changed');
  const c = input.scheduleC;
  if (!c || !ScheduleCInputSchema.strict().safeParse(c).success || c.accountingMethod !== 'cash') fail('current ordinary cash-service C required');
  if (!c.expenses || Object.keys(BusinessExpensesSchema.shape).some(key => {
    const value = (c.expenses as Record<string, unknown>)[key];
    return typeof value !== 'string' || !/^\d{1,15}(?:\.\d{1,2})?$/.test(value) || !new Decimal(value).isZero();
  }) || !BusinessExpensesSchema.strict().safeParse(c.expenses).success) fail('all actual expense classifications must be explicitly known zero for this finite method');
  const cKeys = new Set(['accountHolder', 'businessName', 'businessCode', 'ein', 'accountingMethod', 'grossReceipts', 'returnsAndAllowances', 'costOfGoodsSold', 'otherIncome', 'expenses']);
  if (Object.entries(c).some(([key, value]) => value !== undefined && !cKeys.has(key))) fail('other actual C elections or source methods need separate composition');
  if (facts.owners.some(owner => !Array.isArray(owner.stateAdditions) || owner.stateAdditions.length || !Array.isArray(owner.stateDeductions) || owner.stateDeductions.length)) fail('other actual Ohio adjustments require separate composition');
  const context = calculateOhioCanonicalBusinessSource({ taxInput: input, residencyFacts: facts, draft2026: true });
  const cResult = calculateScheduleC(input, c);
  const se = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS, cResult.netProfit);
  const federalAgi = cResult.netProfit.minus(se.deductibleHalf);
  // Actual no-child facts plus completed2026 indexed AGI cutoff prove no federal EIC;
  // a low/zero profit is not a license to fabricate a completed federal credit.
  const cutoff = FEDERAL_2026_INDEXED.eitc.completedPhaseOutSingleHoH[0];
  if (!cutoff || federalAgi.lt(cutoff)) fail('actual low/zero income EIC requires its separate completed eligibility method');
  const actual = readOhioCanonicalBusinessSource(context, facts, federalAgi), worksheet = actual.worksheet;
  for (const category of ohioNrcCategories) {
    if (category === 'federalAdjustments') continue; // Exactly reconciled to dated half-SE originals by canonical admission.
    const amount = facts.owners[0]?.amounts?.[category];
    if (!amount || [amount.federalAmount, amount.residentAmount, amount.nonresidentOhioAmount].some(value => !new Decimal(value).isZero()))
      fail('current C-only original excludes every other federal and allocated income category, before rounding');
  }
  const baseline = calculateOhio2026Baseline({ taxYear: 2026, filingStatus: 'single',
    ohioAdjustedGrossIncome: actual.ohioAgi, businessIncomeDeduction: worksheet.businessIncomeDeduction,
    qualifyingCapitalGainsAndPayrollDeduction: '0',
    taxableBusinessIncome: worksheet.businessIncomeBeforeDeductionCap.minus(worksheet.businessIncomeDeduction),
    eligibleExemptions: 1, precedingCredits: '0', primaryQualifyingIncome: actual.ohioAgi });
  // This finite no-child/high-AGI cohort also proves no personal exemption credit.
  // Other credit sources and A34/adjustments are affirmative completed source facts.
  if (baseline.modifiedAdjustedGrossIncome.minus(baseline.exemptions).lt('30000')) fail('personal exemption credit needs its separate method');
  const nrc = calculateOhioITNRC({ taxYear: 2026, filingStatus: 'single', federalAgi,
    ohioAgi: actual.ohioAgi, taxRemainingBeforeResidencyCredits: baseline.taxAfterJointCredit,
    residencyFacts: facts, businessSource: context,
    expectedFederalCategories: Object.fromEntries(ohioNrcCategories.map(category => [category, category === 'federalAdjustments' ? actual.deductibleHalf : '0'])) });
  return { taxYear: 2026, ruleVersion: source.methodId, baselineRuleVersion: baseline.ruleVersion,
    calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false,
    sourceCommitment: digest({ input, raw, canonicalCommitment: context.sourceCommitment }),
    federalAgi, ohioAgi: actual.ohioAgi, deductibleHalfSelfEmploymentTax: actual.deductibleHalf,
    residentFederalDeductions: actual.residentFederalDeductions, businessIncomeDeduction: worksheet.businessIncomeDeduction,
    modifiedAdjustedGrossIncome: baseline.modifiedAdjustedGrossIncome,
    ohioApportionmentRatio: worksheet.businesses[0]?.apportionmentRatio ?? fail('actual business factor missing'),
    ohioApportionedBusinessIncome: worksheet.columnC, ohioBusinessIncomeAfterDeduction: worksheet.ohioBusinessAfterDeduction,
    exemptions: baseline.exemptions, taxBeforeCredits: baseline.totalTax,
    personalExemptionCredit: new Decimal(0), jointFilingCredit: baseline.jointFilingCredit, earnedIncomeCredit: new Decimal(0),
    nonresidentRatio: nrc.line19, nonresidentCredit: nrc.line20, incomeTax: baseline.taxAfterJointCredit.minus(nrc.line20),
    withholding: null, payments: null, schoolDistrictTax: null, underpaymentPenalty: null, latePaymentInterest: null, amountDue: null, refund: null,
    limitations: ['Finite ordinary single NR/PY business draft only; not a complete2026 federal or Ohio return.',
      'Payments, school financials, penalties, interest and settlement are unknown; no native or final form qualification.',
      'Low-income EIC, other credits/adjustments, losses, alternative factors and broader business cohorts require separate actual methods.'],
    lines: [...baseline.lines, ...nrc.lines] };
}
