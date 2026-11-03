/** Spec: state/oh-sd-100-sources.yaml. Finite actual sources, never payment/rate overrides. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import { OhioResidencyFactsSchema } from '@/models/ohio-residency.js';
import { OhioSchoolDistrictFactsSchema } from '@/models/ohio-school-district.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { AuditTrail } from '@/utils/audit.js';
import { buildOhioPaymentSource } from './oh-payment-source.js';
import { calculateOhioResidentReturn, type OhioResidentReturnInput } from './oh-return.js';
import { calculateOhioSDResidentIncome, type OhioSDResidentIncomeResult } from './oh-sd-100-resident-income.js';
import { calculateOhioSD100, type SchoolDistrictEntry } from './oh-sd-100.js';
import { calculateOhioITSD2210, type EstimatedPaymentEntry } from './oh-it-sd-2210.js';
import { lookupOhioSchoolDistrictMetadata } from './oh-school-district-lookup.js';

function fail(message: string): never { throw new Error(`Ohio actual school district sources: ${message}`); }
function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function digest(value: unknown): string { return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value))))); }
function sourceOriginals(input: TaxYearInput) {
  const { ohioResidency: _r, ohioPayments: _p, ohioSchoolDistrict: _s, ...original } = input;
  return original;
}
function actualDate(value: string): string {
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) fail('a real source calendar date is required');
  return value;
}
function normalized(value: string): string { return value.trim().replace(/\s+/g, ' ').toUpperCase(); }
function actualSsn(value: string): string {
  const result = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(result)) fail('actual owner/account identity is required');
  return result;
}
/** Bound exact addition/multiplication by actual digits/scale/count, not a money cap. */
function exactArithmetic(input: unknown): typeof Decimal {
  let integerDigits = 1, scale = 0, count = 0;
  const visit = (value: unknown) => {
    if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) {
      const [whole = '', fraction = ''] = value.replace(/^-/, '').split('.');
      integerDigits = Math.max(integerDigits, whole.length); scale = Math.max(scale, fraction.length); count += 1;
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(input);
  return Decimal.clone({ precision: integerDigits + scale + String(count + 1).length + 32, rounding: Decimal.ROUND_HALF_UP });
}
export interface OhioSchoolDistrictSourceProjection {
  readonly methodVersion: 'oh-2025-sd100-ordinary-sources-v1';
  readonly sourceDigest: string;
  readonly district: SchoolDistrictEntry;
  readonly residentIncome: OhioSDResidentIncomeResult;
  readonly sdWithholding: Decimal;
  readonly estimatedPayments: Decimal;
  readonly estimatedPaymentSchedule: EstimatedPaymentEntry[];
  readonly priorYearTaxLiability?: Decimal;
  readonly priorYearTimelyFiled: boolean;
  readonly creditCarryforward: Decimal;
  readonly lines: CalculatedLine[];
}

/** Independent replay of all three actual Ohio packets. Reading never updates a snapshot. */
export function buildOhioSchoolDistrictSource(input: TaxYearInput, federal: TaxReturnResult, ohio: OhioResidentReturnInput): OhioSchoolDistrictSourceProjection {
  const parsed = OhioSchoolDistrictFactsSchema.safeParse(input.ohioSchoolDistrict);
  if (!parsed.success) fail(`complete confirmed actual source facts required (${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')})`);
  const facts = parsed.data;
  if (facts.taxYear !== 2025 || input.taxpayer.taxYear !== 2025 || federal.taxYear !== 2025 || ohio.taxYear !== 2025) fail('only the actual2025 school district year method is available');
  if (input.taxpayer.filingStatus !== 'single' || federal.filingStatus !== 'single' || ohio.filingStatus !== 'single' || input.taxpayer.spouse) fail('the first single primary ordinary cohort requires its separate actual owner method');
  const Exact = exactArithmetic(input);
  const money = (value: string, role: string, whole = false): Decimal => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) fail(`actual ${role} amount is unknown or invalid`);
    const result = new Exact(value);
    if (!result.isFinite() || result.isNegative() || whole && !result.isInteger()) fail(`actual ${role} needs the separate cents/printed-rounding method; this first method uses whole dollars`);
    return result;
  };
  const person = input.taxpayer.primary;
  const sourceOwner = facts.owner.originalTaxpayer;
  if (normalized(sourceOwner.firstName) !== normalized(person.firstName) || normalized(sourceOwner.lastName) !== normalized(person.lastName)
      || actualSsn(sourceOwner.ssn) !== actualSsn(person.ssn) || sourceOwner.dateOfBirth !== person.dateOfBirth) fail('current owner identity or birth date differs from actual originals');
  const birth = actualDate(sourceOwner.dateOfBirth);
  if (birth > '2025-12-31' || birth <= '1960-12-31') fail('actual age65/senior or invalid birth date needs its separate cohort');
  const original = sourceOriginals(input);
  if (digest(facts.originalFederalSources) !== digest(original)) fail('current private original snapshot is missing or changed');
  const residency = OhioResidencyFactsSchema.safeParse(input.ohioResidency);
  if (!residency.success || !input.ohioPayments) fail('independent actual Ohio residency and IT1040 payment sources are required');
  const resident = residency.data;
  if (resident.taxYear !== 2025 || resident.schoolDistrictStatus !== 'actual_district_sources_required'
      || resident.allFederalSourcesIncludedConfirmed !== true || resident.noBusinessIncomeConfirmed !== true
      || digest(resident.originalFederalSources) !== digest(original)) fail('current actual Ohio full-residency source confirmation/snapshot differs');
  const owner = resident.owners[0];
  if (resident.owners.length !== 1 || !owner || owner.accountHolder !== 'primary' || owner.status !== 'full_year_resident') fail('actual full-year primary Ohio residency is required for this cohort');
  let ohioCursor = '2025-01-01';
  for (const period of [...owner.periods].sort((a, b) => a.from.localeCompare(b.from))) {
    const from = actualDate(period.from), through = actualDate(period.to);
    if (from !== ohioCursor || through < from || through > '2025-12-31' || period.domicileState !== 'OH') fail('actual full-year Ohio residence calendar is incomplete or contradictory');
    ohioCursor = new Date(Date.parse(`${through}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  if (ohioCursor !== '2026-01-01') fail('actual complete full-year Ohio residency is required');

  // Presence of any other actual original requires its own method, even a zero.
  const otherArrays = ['form1099Int','form1099Div','form1099B','form1099DA','form1099Nec','form1099Misc','form1099G','form1099OID',
    'formW2G','form1099K','form1099R','form1099C','form1099SA','form1099Q','formSSA1099','formRRB1099','scheduleK1','scheduleK1Form1041','rentalProperties',
    'homeSales','form6252','form8814','form8824','savingsBondRedemptions'] as const;
  for (const key of otherArrays) {
    const value = Reflect.get(input, key);
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) fail('the finite ordinaryW2-only source method does not support other income/local originals');
  }
  if (input.form4797 !== undefined || input.form6781 !== undefined) fail('the finite ordinaryW2-only source method does not support other income/local originals');
  if (input.scheduleC || input.scheduleF || input.form4137 || input.form8919 || input.form4137ByOwner || input.form2555 || input.foreignTaxElection) fail('business/SE or special wage originals need their separate source method');
  if (!input.w2s.length || facts.w2Sources.length !== input.w2s.length) fail('complete actual W2 coverage is required');
  let actualWages = new Exact(0), stateWithholding = new Exact(0), schoolWithholding = new Exact(0);
  const coveredW2s = new Set<number>();
  for (const coverage of facts.w2Sources) {
    if (coveredW2s.has(coverage.w2Index)) fail('duplicate actual W2 source coverage');
    coveredW2s.add(coverage.w2Index);
    const w2 = input.w2s[coverage.w2Index];
    if (!w2 || w2.taxYear !== 2025) fail('actual W2 year or indexed original is missing');
    if (w2.accountHolder !== 'primary') fail('actual W2 owner differs');
    if (!w2.stateLocalSources) fail('complete current actual W2 original packet is required');
    if (coverage.box14SchoolDistrictReporting.status !== 'none') fail('actual box14 school reporting is unknown or requires its separate method');
    if (w2.militaryService?.activeDuty || money(w2.allocatedTips ?? '', 'allocated tips').gt(0)) fail('special ordinary wage/tip or military method is unsupported');
    const checked = calculateW2StateLocalSources(input, coverage.w2Index, w2.stateLocalSources);
    actualWages = actualWages.plus(money(w2.wages, 'W2 wages'));
    for (const row of checked.stateRows) {
      if (row.state === 'OH') stateWithholding = stateWithholding.plus(row.withheld.toString());
      else if (row.withheld.gt(0)) fail('other-state wage withholding/credit requires its separate actual income method');
    }
    if (coverage.localRows.length !== checked.localRows.length) fail('every actual printed local row needs complete classification coverage');
    const seenPositions = new Set<number>();
    for (const declared of coverage.localRows) {
      if (seenPositions.has(declared.printedRow)) fail('duplicate actual local row coverage');
      seenPositions.add(declared.printedRow);
      const actual = w2.stateLocalSources.localRows.find(row => row.printedRow === declared.printedRow);
      if (!actual || actual.localityNameStatus !== 'reported' || !actual.localityName.trim()) fail('actual local row/name is unknown or unreported');
      const localName = normalized(actual.localityName);
      if (declared.classification === 'municipal') {
        const municipalCode = localName.match(/^(R\d{3,4})(?:\b|$)/)?.[1];
        if (!municipalCode || !declared.municipalityCode || normalized(declared.municipalityCode) !== municipalCode || declared.districtCode !== undefined) fail('actual municipal local row classification contradicts its original');
      } else if (declared.classification === 'school_district') {
        const codes = localName.match(/\b\d{4}\b/g) ?? [];
        if (declared.districtCode !== '0302' || declared.municipalityCode !== undefined || /^R\d/.test(localName)
            || !(codes.length === 1 && codes[0] === '0302' || /^(?:SD\s+)?HILLSDALE\s+(?:LSD|LOCAL)$/.test(localName))) fail('actual local school district row does not identify the selected district');
        schoolWithholding = schoolWithholding.plus(money(actual.withheld, 'school local withholding', true));
      } else fail('unresolved actual local row classification needs its separate method');
    }
  }
  if ((owner.stateAdditions?.length ?? 0) || (owner.stateDeductions?.length ?? 0)) fail('actual owner state adjustment source rows require their separate method');
  if (owner.amounts) {
    for (const [category, amounts] of Object.entries(owner.amounts)) {
      const expected = category === 'wages' ? actualWages : new Exact(0);
      if (!new Exact(amounts.federalAmount).eq(expected) || !new Exact(amounts.residentAmount).eq(expected)
          || !new Exact(amounts.nonresidentOhioAmount).isZero()) fail('actual Ohio owner income classification contradicts current W2 originals');
    }
  }
  const fresh = calculateFederalTax(input);
  if (digest(redactReviewIdentifiers(fresh)) !== digest(redactReviewIdentifiers(federal))) fail('saved federal result is stale, not the fresh current original calculation');
  const wages = actualWages.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!fresh.totalWages.eq(wages) || !fresh.agi.eq(wages) || !fresh.adjustmentsToIncome.isZero()) fail('actual ordinary compensation and fresh federal income do not reconcile; other income/adjustments need their source method');
  if (!new Exact(ohio.federalAgi).eq(fresh.agi) || ohio.exemptions !== 1 + input.taxpayer.dependents.length || ohio.isSenior === true) fail('actual Ohio input contradicts current original income/age/owner');

  const p = facts.payments, account = p.account, timing = p.currentTiming;
  const asOf = actualDate(timing.asOfDate), valued = actualDate(timing.kind === 'filed' ? timing.filedDate : timing.expectedDate);
  if (timing.kind === 'filed' ? valued > asOf : valued < asOf) fail('actual filed/expected timing contradicts the as-of date');
  if (valued < '2026-01-01' || valued > '2026-04-15') fail('actual late/early endpoint timing needs its separate method');
  if (actualDate(account.asOfDate) !== asOf || account.taxYear !== 2025 || actualSsn(account.accountSsn) !== actualSsn(person.ssn)
      || normalized(account.accountName) !== normalized(`${person.firstName} ${person.lastName}`)) fail('actual SD account owner/year/as-of records contradict current sources');
  const lookup = facts.residence.lookup;
  if (digest(facts.residence.originalAddress) !== digest(input.taxpayer.address) || digest(lookup.originalAddress) !== digest(input.taxpayer.address)
      || normalized(input.taxpayer.address.state) !== 'OH') fail('actual private residence/lookup address differs from current originals');
  if (lookup.taxYear !== 2025 || actualDate(lookup.lookupDate) > asOf || lookup.districtCode !== '0302' || normalized(lookup.districtName) !== 'HILLSDALE LSD') fail('actual year-specific official district lookup does not match the finite verified district');
  const metadata = lookupOhioSchoolDistrictMetadata(2025, '0302');
  if (!metadata || metadata.taxType !== 'earned_income' || !new Exact(metadata.rate).eq('0.0125')) fail('verified official2025 district tax metadata unavailable');
  if (facts.residence.periods.some(period => period.districtCode !== lookup.districtCode)) fail('actual school residence calendar requires a different district method');
  const residentIncome = calculateOhioSDResidentIncome({
    taxYear: 2025, districtCode: '0302', filingStatus: 'single', annualMAGI: wages.toString(),
    residency: [{ owner: 'primary', periods: facts.residence.periods.map(period => ({ from: period.from, through: period.through, districtCode: period.districtCode })) }],
    wages: { owner: 'primary', method: 'specific', residentAmount: wages.toString(), annual: { status: 'known', amount: wages.toString() } },
    selfEmployment: { owner: 'primary', method: 'specific', residentAmount: '0', annual: { status: 'known', amount: '0' } }, magiComponents: [],
  });
  if (residentIncome.residentDays !== 365 || !residentIncome.residencyFactor.eq(1)) fail('the actual365-day single district residency cohort is required');

  const paymentSources = buildOhioPaymentSource(input, input.ohioPayments);
  const itProjection: OhioResidentReturnInput = {
    ...ohio, schoolDistricts: [], residency: resident, ohioWithholding: new Decimal(stateWithholding.toString()),
    estimatedPayments: paymentSources.estimatedPayments, estimatedPaymentSchedule: paymentSources.estimatedPaymentSchedule,
    priorYearTaxLiability: paymentSources.priorYearTaxLiability, priorYearTimelyFiled: paymentSources.priorYearTimelyFiled,
    useTax: paymentSources.useTax, creditCarryforward: paymentSources.creditCarryforward, donations: paymentSources.donations,
    latePaymentInterest: paymentSources.latePaymentInterest, computeUnderpaymentPenalty: true, underpaymentPenalty: undefined,
    paymentDatedSource: paymentSources.datedPayments ? paymentSources : undefined, paymentTaxCoverage: paymentSources.facts.remainingTaxPayment,
    paymentSourceDigest: paymentSources.sourceDigest,
  };
  const it = calculateOhioResidentReturn(itProjection);
  if (!it.itsd2210 || !it.itsd2210.line17_totalPenalty.isZero()) fail('separate IT1040 penalty/combined2210 allocation requires its successor method');
  if (!it.it1040.line3_ohioAgi.eq(wages) || !it.scheduleOfAdjustments.line14_totalAdditions.isZero() || !it.scheduleOfAdjustments.line47_totalDeductions.isZero()) fail('actual OhioMAGI adjustments require their separate ordinary source method');

  const confirmations = new Set<string>(), sourceIds = new Set<string>();
  const confirmationKey = (ssn: string, year: number, confirmation: string) => `${actualSsn(ssn)}:${year}:${confirmation.replace(/\s+/g, '').toUpperCase()}`;
  // One actual cash identity cannot be repurposed from IT1040 to SD100.
  for (const row of paymentSources.facts.paymentRows) confirmations.add(confirmationKey(row.original.accountSsn, row.original.taxYear, row.original.confirmationNumber));
  const remainingIT = paymentSources.facts.remainingTaxPayment;
  if (remainingIT.status === 'actual_payment') confirmations.add(confirmationKey(remainingIT.original.accountSsn, remainingIT.original.taxYear, remainingIT.original.confirmationNumber));
  const schedule: EstimatedPaymentEntry[] = [];
  const endpoints = ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'];
  let actualCash = new Exact(0);
  for (const row of p.paymentRows) {
    const receipt = row.original, date = actualDate(row.date), amount = money(row.amount, 'SD estimated payment', true);
    if (row.taxYear !== 2025 || receipt.taxYear !== 2025 || receipt.date !== row.date || receipt.returnType !== row.returnType
        || receipt.kind !== row.kind || !amount.eq(money(receipt.amount, 'original receipt', true))) fail('actual SD receipt year/type/date/amount contradicts its original');
    if (actualSsn(receipt.accountSsn) !== actualSsn(person.ssn) || normalized(receipt.accountName) !== normalized(`${person.firstName} ${person.lastName}`)) fail('actual payment account owner identity differs');
    if (date > asOf || date < '2025-01-01') fail('actual future payment date is outside the complete as-of account');
    if (!endpoints.includes(date)) fail('actual SD payment timing needs its separate dated method');
    const confirmation = confirmationKey(receipt.accountSsn, receipt.taxYear, receipt.confirmationNumber);
    if (sourceIds.has(normalized(row.sourceId)) || confirmations.has(confirmation)) fail('duplicate actual cash/receipt identity across the separate tax accounts');
    sourceIds.add(normalized(row.sourceId)); confirmations.add(confirmation);
    schedule.push({ date, amount: new Decimal(amount.toString()) }); actualCash = actualCash.plus(amount);
  }
  if (!actualCash.eq(money(account.estimatedPaymentsCredited, 'complete agency account estimated total', true))) fail('actual complete agency account payment totals do not reconcile');
  let priorLiability: Decimal | undefined, timely = false;
  const prior = p.priorReturn;
  if (prior.status === 'filed_return') {
    if (prior.taxYear !== 2024 || prior.districtCode !== '0302' || prior.periodStart !== '2024-01-01' || prior.periodEnd !== '2024-12-31'
        || actualSsn(prior.accountSsn) !== actualSsn(person.ssn) || normalized(prior.accountName) !== normalized(`${person.firstName} ${person.lastName}`)) fail('actual prior twelve-month district return owner/year differs');
    const filed = actualDate(prior.filedDate);
    if (filed < '2025-01-01' || filed > asOf || filed > '2025-04-15') fail('actual prior timely filed original return needs separate treatment');
    if (money(prior.electedCreditCarryforward, 'prior carry election', true).gt(money(prior.line19, 'prior overpayment', true))) fail('actual prior election exceeds the filed overpayment');
    priorLiability = new Decimal(money(prior.line8, 'prior liability', true).toString()); timely = true;
  }
  let priorApplied = new Exact(0);
  const carry = p.priorCreditCarryforward;
  if (carry.status === 'actual_credit') {
    if (prior.status !== 'filed_return' || !timely || actualSsn(carry.accountSsn) !== actualSsn(person.ssn)
        || !money(carry.electedAmount, 'actual prior election', true).eq(prior.electedCreditCarryforward)) fail('actual prior filed election/current account credit does not reconcile');
    priorApplied = money(carry.availableForThisReturn, 'actual available prior credit', true);
    if (priorApplied.gt(carry.electedAmount)) fail('actual available prior credit exceeds the filed election');
    schedule.push({ date: '2025-04-15', amount: new Decimal(priorApplied.toString()) });
  } else if (prior.status === 'filed_return' && !money(prior.electedCreditCarryforward, 'prior carry election', true).isZero()) fail('actual prior elected credit availability is unknown');
  if (!priorApplied.eq(money(account.priorCreditApplied, 'actual agency prior credit applied', true))) fail('actual prior credit application does not reconcile with complete agency account');
  const estimates = actualCash.plus(priorApplied);
  const district: SchoolDistrictEntry = { districtNumber: '0302', taxType: 'earned_income', rate: '0.0125', residencyFactor: new Decimal(1), wages: residentIncome.line29, netSelfEmployment: residentIncome.line30 };
  const expectedTax = new Exact(residentIncome.line33.toString()).times('0.0125').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const sd = calculateOhioSD100({ taxYear: 2025, ohioAgi: it.it1040.line3_ohioAgi, businessIncomeDeduction: it.scheduleOfAdjustments.line15_businessIncomeDeduction,
    exemptionAmount: it.it1040.line4_exemptions, isSenior: false, districts: [district], sdWithholding: new Decimal(schoolWithholding.toString()),
    estimatedPayments: new Decimal(estimates.toString()), creditCarryforward: p.refundDisposition.outgoingCarryforward,
  });
  if (!sd.line8_totalTaxAfterCredits.eq(expectedTax)) fail('existing printed district calculation requires a separately exact arithmetic method');
  const safeCurrent = expectedTax.times('0.90').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const safePrior = timely && priorLiability !== undefined ? new Exact(priorLiability.toString()) : undefined;
  const covered = (required: Decimal) => endpoints.every((endpoint, index) => {
    const fraction = new Exact(index + 1).div(4);
    const estimated = schedule.filter(row => row.date <= endpoint).reduce((sum, row) => sum.plus(row.amount.toString()), new Exact(0));
    return schoolWithholding.times(fraction).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).plus(estimated)
      .gte(new Exact(required.toString()).times(fraction).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
  });
  // Preserve the lawful withholding exemption, otherwise prove actual quarter
  // coverage before the old annual safe-harbor worksheet can return zero.
  if (expectedTax.minus(schoolWithholding).gt(500) && !covered(safeCurrent) && !(safePrior !== undefined && covered(safePrior))) fail('actual timely quarterly installment coverage/combined2210 requires its separate source method');
  const penalty = calculateOhioITSD2210({ taxYear: 2025, formType: 'sd100', currentYearTaxLiability: sd.line8_totalTaxAfterCredits,
    ohioWithholding: new Decimal(schoolWithholding.toString()), estimatedPayments: new Decimal(estimates.toString()), estimatedPaymentSchedule: schedule,
    priorYearTaxLiability: priorLiability, priorYearTimelyFiled: timely,
  });
  if (!penalty.line17_totalPenalty.isZero()) fail('separate SD100 penalty/combined2210 allocation requires its successor method');
  if (!sd.line16_taxDue.isZero()) fail('actual remaining SD tax requires its separate payment/timing source method');
  const outgoing = money(p.refundDisposition.outgoingCarryforward, 'actual outgoing election', true);
  if (outgoing.gt(sd.line19_overpayment)) fail('actual outgoing election exceeds the actual overpayment');
  const exactPaid = schoolWithholding.plus(estimates);
  const exactOverpayment = exactPaid.gt(expectedTax) ? exactPaid.minus(expectedTax) : new Exact(0);
  const refundBeforeThreshold = exactOverpayment.minus(outgoing);
  const exactRefund = refundBeforeThreshold.lte(1) ? new Exact(0) : refundBeforeThreshold;
  if (!sd.line13_totalPayments.eq(exactPaid) || !sd.line15_netPayments.eq(exactPaid)
      || !sd.line19_overpayment.eq(exactOverpayment) || !sd.line21_refund.eq(exactRefund)) fail('existing printed payment arithmetic requires its separately exact source method');
  const sourceDigest = digest({ original, residency: resident, payments: paymentSources.facts, schoolDistrict: facts });
  const audit = new AuditTrail();
  audit.record('OH-SD-100', 'actual-school-source-commitment', 'Actual independently reconciled school-district sources', new Decimal(0),
    'Current private originals; commitment only, never private source references', { 'Original source commitment': sourceDigest, 'State method version': 'oh-2025-sd100-ordinary-sources-v1', 'Tax year': '2025' });
  return { methodVersion: 'oh-2025-sd100-ordinary-sources-v1', sourceDigest, district, residentIncome,
    sdWithholding: new Decimal(schoolWithholding.toString()), estimatedPayments: new Decimal(estimates.toString()),
    estimatedPaymentSchedule: schedule, priorYearTaxLiability: priorLiability, priorYearTimelyFiled: timely,
    creditCarryforward: new Decimal(outgoing.toString()), lines: audit.getLines(),
  };
}
