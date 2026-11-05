/** Spec: state/oh-2026-return-draft.yaml. Finite current employee originals only. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TaxpayerSchema, W2Schema, StandardDeductionFactsSchema, type TaxYearInput } from '@/models/inputs.js';
import { Ohio2026OrdinarySourcesSchema, Ohio2026OrdinaryStateSchema, Ohio2026PaReciprocalSourcesSchema, Ohio2026VaResidentCreditSourcesSchema } from '@/models/ohio-2026-return-draft.js';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioResidencyFacts } from '@/models/ohio-residency.js';
import { OhioPaymentFactsSchema } from '@/models/ohio-payments.js';
import { FEDERAL_2026_INDEXED } from '@/models/federal-2026-indexed.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import { calculateOhio2026ReciprocalWageSource, readOhio2026ReciprocalWageSource, type Ohio2026ReciprocalWageContext } from './oh-2026-reciprocal-source.js';
import { calculateOhio2026ResidentCreditSource, readOhio2026ResidentCreditSource, type Ohio2026ResidentCreditSourceContext } from './oh-2026-resident-credit-source.js';
import { roundDollar } from '@/utils/decimal.js';

function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
const digest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
const identity = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const tin = (value: string) => value.replace(/\D/g, '');
function fail(message: string): never { throw new Error(`Ohio2026 ordinary actual sources: ${message}`); }
function day(value: string): number {
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) fail('valid actual source date required');
  return n;
}
function cash(value: unknown): Decimal {
  if (typeof value !== 'string' || !/^\d{1,15}(?:\.\d{1,2})?$/.test(value)) fail('complete finite nonnegative exact original cash required');
  return new Decimal(value);
}
interface Projection {
  filingStatus: 'single' | 'married_filing_jointly';
  federalAgi: string; reciprocalWageExclusion?: string; residentCreditIncome?: string; residentCreditTaxPaid?: string; withholding: string; eligibleExemptions: number;
  primaryQualifyingIncome: string; spouseQualifyingIncome?: string;
  residency: OhioResidencyFacts;
}
export interface Ohio2026OrdinaryContext {
  readonly methodId: 'oh-2026-ordinary-employee-draft-v1' | 'oh-2026-pa-reciprocal-employee-draft-v1' | 'oh-2026-va-resident-credit-employee-draft-v1';
  readonly sourceCommitment: string;
}
const contexts = new WeakMap<Ohio2026OrdinaryContext, { currentDigest: string; projection: Projection }>();
export function readOhio2026OrdinarySource(context: Ohio2026OrdinaryContext, input: TaxYearInput, sources: unknown): Projection {
  const stored = contexts.get(context);
  if (!stored || stored.currentDigest !== digest({ input, sources })) fail('current original context is missing stale or forged');
  return structuredClone(stored.projection);
}
/** Derive exact source amounts; no caller tax/credit/payment projections are accepted. */
export function calculateOhio2026OrdinarySource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw);
}
/** Separate admitted method; caller scalars cannot bypass either documentary proof. */
export function calculateOhio2026PaReciprocalEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, calculateOhio2026ReciprocalWageSource(input, raw));
}
/** Both full current original proofs must succeed; no publicly bindable projection. */
export function calculateOhio2026VaResidentCreditEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, undefined, calculateOhio2026ResidentCreditSource(input, raw));
}
function qualifyEmployee(input: TaxYearInput, raw: unknown, reciprocal?: Ohio2026ReciprocalWageContext, residentCredit?: Ohio2026ResidentCreditSourceContext): Ohio2026OrdinaryContext {
  if (reciprocal) readOhio2026ReciprocalWageSource(reciprocal, input, raw);
  const paidResident = residentCredit ? readOhio2026ResidentCreditSource(residentCredit, input, raw) : undefined;
  if (reciprocal && residentCredit) fail('reciprocal and resident credit methods cannot overlap');
  const parsed = reciprocal ? Ohio2026PaReciprocalSourcesSchema.safeParse(raw) : residentCredit ? Ohio2026VaResidentCreditSourcesSchema.safeParse(raw) : Ohio2026OrdinarySourcesSchema.safeParse(raw);
  const resident = OhioResidencyFactsSchema.safeParse(input.ohioResidency);
  const payment = OhioPaymentFactsSchema.safeParse(input.ohioPayments);
  if (!parsed.success || !resident.success || !payment.success) fail('complete confirmed current source packets required');
  const source = parsed.data, facts = resident.data, payments = payment.data;
  const taxpayer = TaxpayerSchema.strict().safeParse(input.taxpayer);
  const standard = StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts);
  if (!taxpayer.success || !standard.success || input.taxpayer.taxYear !== 2026 || facts.taxYear !== 2026 || payments.taxYear !== 2026) fail('actual current2026 taxpayer and source year required');
  const filingStatus = input.taxpayer.filingStatus;
  if (!['single', 'married_filing_jointly'].includes(filingStatus)) fail('other filing statuses need their separate actual method');
  if (!Array.isArray(input.taxpayer.dependents) || input.taxpayer.dependents.length) fail('actual no-dependent and no EITC-child cohort required');
  const holders: Array<'primary' | 'spouse'> = filingStatus === 'married_filing_jointly' ? ['primary', 'spouse'] : ['primary'];
  if (filingStatus === 'single' && input.taxpayer.spouse || filingStatus === 'married_filing_jointly' && !input.taxpayer.spouse) fail('actual filing owner composition differs');
  if (input.taxpayer.spouse && tin(input.taxpayer.primary.ssn) === tin(input.taxpayer.spouse.ssn)) fail('distinct actual joint owners required');
  const sf = standard.data;
  if (sf.primaryCanBeClaimedAsDependent !== false || sf.primaryDeathDate !== null || sf.nonresidentAlien !== false || sf.dualStatusAlien !== false || sf.shortTaxYear !== false
    || filingStatus === 'married_filing_jointly' && (sf.spouseCanBeClaimedAsDependent !== false || sf.spouseDeathDate !== null)) fail('actual completed owner exemption and calendar eligibility required');
  for (const holder of holders) {
    const person = holder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || !/^\d{9}$/.test(tin(person.ssn))) fail('actual current owner identity required');
    day(person.dateOfBirth);
    // Older owners' age-based credits require their separate complete eligibility method.
    if (person.dateOfBirth <= '1962-01-01' || person.dateOfBirth > '2008-12-31') fail('actual ordinary adult under65 cohort required');
  }
  const { ohioResidency: _residency, ohioPayments: _payments, ...originals } = input;
  for (const snapshot of [source.originalFederalSources, facts.originalFederalSources, payments.originalFederalSources]) {
    if (!snapshot || digest(snapshot) !== digest(originals)) fail('current complete original source snapshot is missing or changed');
  }
  // Only these explicit empty historical input collections can accompany this
  // finite wage-only method. Any retained unhandled object rejects even at zero.
  const emptyArrays = new Set(['form1099Int', 'form1099Div', 'form1099B', 'form1099Nec', 'form1099Misc', 'scheduleK1', 'form1098', 'form1095A', 'donations']);
  const allowed = new Set(['taxpayer', 'w2s', 'standardDeductionFacts', 'ohioResidency', 'ohioPayments']);
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || allowed.has(key)) continue;
    if (emptyArrays.has(key) && Array.isArray(value) && value.length === 0) continue;
    fail('retained other originals require their separate actual method even at zero');
  }
  if (!Array.isArray(input.w2s) || !input.w2s.length || input.w2s.length > 20 || source.employmentOriginals.length !== input.w2s.length) fail('complete bounded current W2 and employment inventory required');
  if (facts.allFederalSourcesIncludedConfirmed !== true || facts.noBusinessIncomeConfirmed !== true || facts.businessSources || !reciprocal && facts.reciprocalWageSources || facts.residentCreditSources
    || facts.schoolDistrictStatus !== 'no_ohio_taxing_district_residency') fail('business reciprocal resident-credit or school sources require their separate method');
  if (facts.owners.length !== holders.length || new Set(facts.owners.map(o => o.accountHolder)).size !== holders.length || holders.some(h => !facts.owners.some(o => o.accountHolder === h))) fail('complete actual current residency owners required');
  if (facts.owners.some(owner => owner.periods.some(period => !Ohio2026OrdinaryStateSchema.safeParse(period.domicileState).success))) fail('actual domestic domicile state required');
  const wageTotals = { primary: new Decimal(0), spouse: new Decimal(0) };
  const residentWages = { primary: new Decimal(0), spouse: new Decimal(0) };
  const nonresidentWages = { primary: new Decimal(0), spouse: new Decimal(0) };
  let withholding = new Decimal(0);
  const indexes = new Set<number>(), documentIds = new Set<string>();
  for (const employment of source.employmentOriginals) {
    const index = employment.w2Index, w2 = input.w2s[index];
    if (indexes.has(index) || !w2 || !W2Schema.strict().safeParse(w2).success || w2.taxYear !== 2026 || w2.accountHolder !== employment.accountHolder || !holders.includes(employment.accountHolder)) fail('each current original W2 owner year and index required once');
    indexes.add(index);
    const owner = facts.owners.find(o => o.accountHolder === employment.accountHolder);
    if (!owner || !/^\d{9}$/.test(tin(w2.employer.ein)) || tin(employment.employerTin) !== tin(w2.employer.ein) || identity(employment.employerName) !== identity(w2.employer.name)) fail('actual current employer identity differs');
    const actual = calculateW2StateLocalSources(input, index, w2.stateLocalSources);
    if (actual.localRows.length || !cash(w2.localTaxWithheld).isZero() || !cash(w2.localWages).isZero()
      || actual.stateRows.some(row => row.state !== 'OH' && !(residentCredit && row.state === 'VA') && !row.withheld.isZero())) fail('local school or other-state tax source requires its separate method');
    withholding = withholding.plus(actual.stateRows.filter(row => row.state === 'OH').reduce((sum, row) => sum.plus(row.withheld), new Decimal(0)));
    for (const key of ['socialSecurityTips', 'allocatedTips', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT'] as const) if (!cash(w2[key]).isZero()) fail('actual nonspecial W2 boxes including known zero required');
    for (const key of ['federalWithheld', 'socialSecurityWages', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld'] as const) cash(w2[key]);
    if (w2.militaryService || w2.box12CodeTP !== undefined || w2.box12CodeTT !== undefined || w2.treasuryTippedOccupationCodes !== undefined) fail('special compensation requires its separate source method');
    let wages = new Decimal(0), next = day('2026-01-01');
    for (const row of [...employment.serviceRows].sort((a, b) => a.from.localeCompare(b.from))) {
      const id = identity(row.sourceId), document = identity(row.sourceReference);
      if (documentIds.has(`id:${id}`) || documentIds.has(`ref:${document}`)) fail('duplicate actual payroll originals');
      documentIds.add(`id:${id}`); documentIds.add(`ref:${document}`);
      const from = day(row.from), to = day(row.to), paid = day(row.paymentDate);
      if (from !== next || to < from || row.to > '2026-12-31' || row.paymentDate > '2026-12-31' || paid < to) fail('complete unique current-year service and payment periods required');
      const period = owner.periods.find(p => row.from >= p.from && row.to <= p.to && row.paymentDate >= p.from && row.paymentDate <= p.to);
      if (!period) fail('actual compensation crossing domicile periods needs its separate timing method');
      if (!reciprocal && period.domicileState !== 'OH' && ['IN', 'KY', 'MI', 'PA', 'WV'].includes(period.domicileState)) fail('actual reciprocal compensation requires its separate current method');
      const value = cash(row.wages);
      wages = wages.plus(value);
      if (period.domicileState === 'OH') residentWages[employment.accountHolder] = residentWages[employment.accountHolder].plus(value);
      else if (row.serviceState === 'OH') nonresidentWages[employment.accountHolder] = nonresidentWages[employment.accountHolder].plus(value);
      next = to + 86400000;
    }
    if (next !== day('2027-01-01') || !wages.eq(cash(w2.wages))) fail('complete actual service wages differ from original W2');
    wageTotals[employment.accountHolder] = wageTotals[employment.accountHolder].plus(wages);
  }
  for (const owner of facts.owners) {
    if (!owner.amounts || owner.stateAdditions === undefined || owner.stateDeductions === undefined || owner.stateAdditions.length || owner.stateDeductions.length) fail('complete actual zero state adjustment and category sources required');
    for (const category of ohioNrcCategories) {
      const row = owner.amounts[category];
      if (!cash(row.federalAmount).eq(category === 'wages' ? wageTotals[owner.accountHolder] : 0)
        || !cash(row.residentAmount).eq(category === 'wages' ? residentWages[owner.accountHolder] : 0)
        || !cash(row.nonresidentOhioAmount).eq(category === 'wages' ? nonresidentWages[owner.accountHolder] : 0)) fail('current actual source categories and service allocation differ');
    }
  }
  const federalAgi = roundDollar(wageTotals.primary.plus(wageTotals.spouse));
  const cutoff = filingStatus === 'married_filing_jointly' ? FEDERAL_2026_INDEXED.eitc.completedPhaseOutMFJ[0] : FEDERAL_2026_INDEXED.eitc.completedPhaseOutSingleHoH[0];
  if (!cutoff || federalAgi.lt(cutoff)) fail('actual EITC requires its separate eligible-income method');
  calculateOhioITNRC({ taxYear: 2026, filingStatus, federalAgi, ohioAgi: federalAgi, taxRemainingBeforeResidencyCredits: '0', residencyFacts: facts,
    expectedFederalCategories: Object.fromEntries(ohioNrcCategories.map(c => [c, c === 'wages' ? federalAgi : '0'])) });
  const timing = payments.currentTiming;
  const valuationDate = timing.kind === 'filed' ? timing.filedDate : timing.expectedDate;
  day(valuationDate); day(timing.asOfDate);
  if (timing.asOfDate < '2027-01-01' || timing.asOfDate > '2027-04-15' || valuationDate < '2027-01-01' || valuationDate > '2027-04-15'
    || timing.kind === 'filed' && valuationDate > timing.asOfDate || timing.kind === 'expected' && valuationDate < timing.asOfDate) fail('actual timely current filing chronology required');
  if (payments.paymentRows.length || payments.priorReturn.status !== 'no_return' || payments.priorCreditCarryforward.status !== 'none' || payments.remainingTaxPayment.status !== 'no_remaining_tax'
    || !cash(payments.balanceFacts.useTax).isZero() || !cash(payments.balanceFacts.outgoingCarryforward).isZero() || !cash(payments.balanceFacts.donations).isZero()) fail('actual ordinary withholding-only coverage and zero balance elections required');
  const currentDigest = digest({ input, sources: raw });
  const context: Ohio2026OrdinaryContext = Object.freeze({ methodId: reciprocal ? 'oh-2026-pa-reciprocal-employee-draft-v1' : residentCredit ? 'oh-2026-va-resident-credit-employee-draft-v1' : 'oh-2026-ordinary-employee-draft-v1', sourceCommitment: currentDigest });
  contexts.set(context, { currentDigest, projection: { filingStatus: filingStatus as Projection['filingStatus'], federalAgi: federalAgi.toFixed(), ...(reciprocal ? { reciprocalWageExclusion: federalAgi.toFixed() } : {}), ...(paidResident ? { residentCreditIncome: paidResident.income, residentCreditTaxPaid: paidResident.taxPaid } : {}), withholding: roundDollar(withholding).toFixed(), eligibleExemptions: holders.length,
    primaryQualifyingIncome: wageTotals.primary.toFixed(), ...(filingStatus === 'married_filing_jointly' ? { spouseQualifyingIncome: wageTotals.spouse.toFixed() } : {}), residency: structuredClone(facts) } });
  return context;
}
