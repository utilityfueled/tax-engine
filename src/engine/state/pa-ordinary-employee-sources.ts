/** Pure actual-source working-day and direct-UE method. Spec: state/pa-ordinary-employee-sources.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { W2Schema, type TaxYearInput } from '@/models/inputs.js';
import { PAOrdinaryEmployeeSourcesSchema } from '@/models/pa-ordinary-employee-sources.js';
import { calculateW2StateLocalSources } from '../forms/w2-state-local.js';
import type { PAScheduleNRHResult } from './pa-schedule-nrh.js';
import type { ScheduleUEResult } from './pa-schedule-ue.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';

export interface PAActualEmployeeUEResult extends ScheduleUEResult {
  line1: Decimal; line2: Decimal; line3: Decimal; line4: Decimal; line5: Decimal;
  lineH: Decimal; lineI: Decimal; lineJ: Decimal;
}
export interface PAActualEmployeeNRHResult extends PAScheduleNRHResult {
  line9: Decimal; line12: Decimal; line13: Decimal; line16: Decimal; line17: Decimal;
  line18: Decimal; line19: Decimal; line20: Decimal; line21: Decimal; line22: Decimal;
}
export interface PAActualEmployeeResult {
  residentPeriod?: boolean;
  originalIndex: number; calendarDays: number; nonworkingDays: number; workingDays: number; paWorkingDays: number;
  workingDayFraction: Decimal; rawGrossCompensation: Decimal; rawPAServiceCompensation: Decimal;
  rawAllowableExpenses: Decimal; rawPAAllowableExpenses: Decimal;
  employmentPeriods: Array<{ from: string; through: string }>;
  payroll: Array<{ paidOn: string; serviceFrom: string; serviceThrough: string; grossCompensation: Decimal; paServicesCompensation: Decimal; outsidePAServicesCompensation: Decimal }>;
  expenses: Array<{ paidOn: string; allowableAmount: Decimal }>;
  scheduleUE: PAActualEmployeeUEResult; scheduleNRH: PAActualEmployeeNRHResult;
}
export interface PAOrdinaryEmployeeSourcesResult {
  sourceCommitment: string; perEmployer: PAActualEmployeeResult[]; lines: CalculatedLine[];
}
const fail = (message: string): never => { throw new Error(`PA actual employee sources: ${message}`); };
function ref(value: string): void { if (!value.trim()) fail('complete actual source reference is required'); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
const identifier = (value: string) => value.replace(/\D/g, '');
function date(value: string, year?: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (year !== undefined && !value.startsWith(`${year}-`))) return fail('actual date is missing or outside its source year');
  const n = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) return fail('actual date is impossible');
  return n / 86400000;
}
function sourcePrecision(value: unknown): number {
  let integerDigits = 0, fractionalScale = 0, sourceCount = 0;
  function visit(current: unknown): void {
    if (typeof current === 'string' && /^\d+(\.\d+)?$/.test(current)) {
      const [integer, fraction = ''] = current.split('.');
      integerDigits = Math.max(integerDigits, integer?.length ?? 0);
      fractionalScale = Math.max(fractionalScale, fraction.length);
      sourceCount += 1;
    } else if (Array.isArray(current)) {
      for (const item of current) visit(item);
    } else if (current && typeof current === 'object') {
      for (const item of Object.values(current)) visit(item);
    }
  }
  visit(value);
  // Separate extrema can belong to different originals; retain their combined
  // integer/scale span plus aggregate carry and arithmetic guard digits.
  return Math.max(100, integerDigits + fractionalScale + String(Math.max(1, sourceCount)).length + 50);
}
/** The public values use the repository Decimal constructor; extra precision stays local. */
const publicMoney = (value: Decimal) => new Decimal(value.toFixed());

export function calculatePAOrdinaryEmployeeSources(input: TaxYearInput, raw: unknown): PAOrdinaryEmployeeSourcesResult {
  const parsed = PAOrdinaryEmployeeSourcesSchema.safeParse(raw);
  if (!parsed.success) return fail('actual employee packet shape is unknown or unsupported');
  const source = parsed.data, year = input.taxpayer.taxYear;
  if (![2025, 2026].includes(year) || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true) return fail('confirm complete actual employee source year');
  ref(source.sourceReference);
  const asOf = date(source.asOfDate), actualOwner = input.taxpayer.primary, originalOwner = source.owner.originalTaxpayer;
  if (source.owner.accountHolder !== 'primary' || !originalOwner || stable(originalOwner) !== stable({ firstName: actualOwner.firstName, lastName: actualOwner.lastName, ssn: actualOwner.ssn }) || !/^\d{9}$/.test(identifier(originalOwner.ssn))) return fail('current original employee owner identity is unknown or stale');
  if (input.taxpayer.spouse || ['married_filing_jointly', 'married_filing_separately'].includes(input.taxpayer.filingStatus)) return fail('per-spouse employee method requires its separate source successor');
  if (source.employers.length !== input.w2s.length) return fail('every actual W2 original needs exactly one employee source row including known zero');
  const Money = Decimal.clone({ precision: sourcePrecision({ sources: source, originals: input.w2s }), rounding: Decimal.ROUND_HALF_UP });
  const zero = () => new Money(0);
  function money(value: unknown): Decimal {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return fail('actual nonnegative employee source amount is unknown');
    const n = new Money(value); if (!n.isFinite()) return fail('actual source amount is nonfinite'); return n;
  }
  const whole = (n: Decimal) => new Money(n).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const refs = new Set<string>(), indices = new Set<number>(), identities = new Set<string>();
  const audit = new AuditTrail(), perEmployer: PAActualEmployeeResult[] = [];
  for (const row of source.employers) {
    const index = row.originalIndex;
    if (index === null || index < 0 || index >= input.w2s.length || indices.has(index)) return fail('unique complete actual original W2 indices are required');
    indices.add(index); ref(row.sourceReference);
    if (refs.has(row.sourceReference.trim())) return fail('duplicate actual employer source reference'); refs.add(row.sourceReference.trim());
    if (row.sourceTaxYear !== year || row.sourceFactsConfirmed !== true || row.currentUncorrectedNonvoidOriginalConfirmed !== true || row.allOriginalBoxesKnownConfirmed !== true || row.ordinaryCashCompensationOnlyConfirmed !== true) return fail('confirm actual current ordinary employee original status and complete boxes');
    const w2 = input.w2s[index];
    if (!w2 || !W2Schema.strict().safeParse(w2).success || w2.taxYear !== year || w2.accountHolder !== 'primary' || !row.originalW2 || stable(row.originalW2) !== stable(w2)) return fail('current original W2 owner/year/identity is missing or stale');
    if (w2.allocatedTips === undefined) return fail('actual original W2 Box8 amount is unknown; complete-box confirmation cannot supply zero');
    const actualStates = w2.stateLocalSources === undefined ? undefined : calculateW2StateLocalSources(input, index, w2.stateLocalSources);
    for (const key of ['wages', 'federalWithheld', 'socialSecurityWages', 'socialSecurityTips', 'allocatedTips', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld', 'box10DependentCareBenefits', 'stateTaxWithheld', 'localWages', 'localTaxWithheld', 'stateWages', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT', 'box12CodeTP', 'box12CodeTT'] as const) if (w2[key] !== undefined) money(w2[key]);
    const economic = Object.fromEntries(Object.entries(w2).filter(([key]) => !['stateLocalSources', 'state', 'stateWages', 'stateTaxWithheld', 'localWages', 'localTaxWithheld', 'localityName'].includes(key)));
    const identity = stable({ ...economic, employer: { name: normalize(w2.employer.name), ein: identifier(w2.employer.ein) } });
    if (identities.has(identity)) return fail('indistinguishable duplicate economic W2 originals need actual separate proof'); identities.add(identity);
    for (const value of Object.values(row.employer)) ref(value);
    if (normalize(row.employer.name) !== normalize(w2.employer.name) || identifier(row.employer.ein) !== identifier(w2.employer.ein) || !/^\d{9}$/.test(identifier(row.employer.ein))) return fail('actual employer identity does not reconcile original W2');
    if (row.allocationMethod !== 'working_days' || row.workplaceBasis === '' || row.specialInterstateOccupation !== 'none') return fail('unknown workplace, business-volume or special interstate employee method requires its successor');
    for (const key of ['box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeW', 'box12CodeT', 'box10DependentCareBenefits', 'allocatedTips'] as const) if (w2[key] !== undefined && !money(w2[key]).isZero()) return fail('nonordinary wage adjustment requires its actual source method');
    if (w2.militaryService?.activeDuty === true) return fail('military employee allocation requires its actual source method');
    const statement = row.statement;
    for (const text of [statement.documentReference, statement.signerName, statement.signerRole]) ref(text);
    if (statement.documentAvailableConfirmed !== true || statement.signed !== true || statement.fullCalendarAndOutsideDaysVerifiedConfirmed !== true) return fail('actual available signed employer statement and full outside-work verification are required');
    const signedOn = date(statement.signedOn); if (signedOn > asOf) return fail('actual employer signature is later than complete-through source proof');
    const expectedDates: number[] = [], employmentPeriods: PAActualEmployeeResult['employmentPeriods'] = [];
    let last = -Infinity;
    for (const period of row.employmentPeriods) {
      ref(period.sourceReference); const from = date(period.from, year), through = date(period.through, year);
      if (from > through || from <= last || through > asOf || through > signedOn) return fail('actual employment periods overlap, are future or precede full signed verification');
      last = through; employmentPeriods.push({ from: period.from, through: period.through });
      for (let d = from; d <= through; d++) expectedDates.push(d);
    }
    if (!expectedDates.length || row.calendar.length !== expectedDates.length) return fail('complete actual employment calendar is required without gaps or duplicates');
    const dayRefs = new Set<string>(), outsideDates: string[] = []; let nonworkingDays = 0, workingDays = 0, paWorkingDays = 0;
    for (const [position, day] of row.calendar.entries()) {
      ref(day.sourceReference); if (dayRefs.has(day.sourceReference.trim())) return fail('duplicate actual daily source reference'); dayRefs.add(day.sourceReference.trim());
      if (date(day.date, year) !== expectedDates[position]) return fail('actual complete calendar dates are missing, duplicated or out of order');
      if (day.travelClassification === '' || day.kind === '') return fail('actual work and travel classification is unknown');
      if (day.kind === 'nonworking') {
        if (day.nonworkingReason === '' || day.locations.length) return fail('actual nonworking classification contradicts work locations');
        nonworkingDays++; continue;
      }
      if (day.nonworkingReason !== '' || !day.locations.length || ['commute_only', 'transit_only'].includes(day.travelClassification)) return fail('actual compensable work cannot be inferred from commuting or transit');
      let actualWork = false, pa = false, outside = false;
      for (const location of day.locations) {
        if (location.state === '' || location.compensatedWorkConfirmed === null || location.transitOnly === null) return fail('actual physical work jurisdiction and travel facts are unknown');
        if (location.transitOnly) { if (location.compensatedWorkConfirmed) return fail('commuting/transit is not actual compensable work'); continue; }
        if (!location.compensatedWorkConfirmed) continue;
        actualWork = true;
        if (location.state === 'PA') pa = true;
        else {
          outside = true;
          if (location.employerRequiredOutsideWork === null) return fail('actual outside work necessity is unknown');
          if (row.workplaceBasis === 'suitable_PA' && !location.employerRequiredOutsideWork) pa = true;
        }
      }
      if (!actualWork) return fail('actual working date has no compensable physical work');
      workingDays++; if (pa) paWorkingDays++; if (outside) outsideDates.push(day.date);
    }
    if (stable(statement.outsideWorkDates) !== stable(outsideDates)) return fail('signed actual outside-day proof does not reconcile complete original calendar');
    const gross = money(w2.wages);
    if (workingDays === 0 && gross.gt(0)) return fail('positive wages require actual documented working days');
    const fullFraction = workingDays === 0 ? zero() : new Money(paWorkingDays).div(workingDays);
    const printedFraction = fullFraction.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    const allocate = (amount: Decimal) => workingDays === 0 ? zero() : new Money(amount).times(paWorkingDays).div(workingDays);
    function admittedPrintedAllocation(amount: Decimal): Decimal {
      const six = whole(new Money(amount).times(printedFraction)), full = whole(allocate(amount));
      if (!six.eq(full)) return fail('six-place and full-ratio monetary precision disagree; qualified fraction treatment required');
      return six;
    }
    let payrollGross = zero(); const payrollDates: number[] = [], payRefs = new Set<string>();
    const payroll: PAActualEmployeeResult['payroll'] = [];
    for (const pay of row.payroll) {
      ref(pay.sourceReference); if (payRefs.has(pay.sourceReference.trim())) return fail('duplicate original payroll source'); payRefs.add(pay.sourceReference.trim());
      const from = date(pay.serviceFrom, year), through = date(pay.serviceThrough, year), paid = date(pay.paidOn, year);
      if (from > through || paid < through || paid > asOf) return fail('actual payroll service/payment dates require their separate deferred source method');
      for (let d = from; d <= through; d++) payrollDates.push(d);
      const amount = money(pay.grossCompensation), pa = allocate(amount); payrollGross = payrollGross.plus(amount);
      payroll.push({ paidOn: pay.paidOn, serviceFrom: pay.serviceFrom, serviceThrough: pay.serviceThrough, grossCompensation: publicMoney(amount), paServicesCompensation: publicMoney(pa), outsidePAServicesCompensation: publicMoney(amount.minus(pa)) });
    }
    if (stable(payrollDates) !== stable(expectedDates) || !payrollGross.eq(gross)) return fail('actual payroll calendar and gross amount do not reconcile complete employment and original wages');
    const actualPA = actualStates?.stateRows.find(state => state.state === 'PA')?.wages ?? (actualStates === undefined && w2.state === 'PA' ? money(w2.stateWages) : undefined);
    const grossPrinted = whole(gross), allocatedGross = admittedPrintedAllocation(grossPrinted);
    if (actualPA === undefined || !whole(actualPA).eq(allocatedGross)) ref(statement.w2CorrectionExplanation);
    const ue = row.ue; ref(ue.sourceReference);
    if (ue.allExpenseAndReimbursementSourcesReviewedConfirmed !== true || ue.otherExpenseClassesConfirmedNone !== true) return fail('complete actual expense/reimbursement history and other-class none proof are unknown');
    const expenseRefs = new Set<string>(), receipts = new Set<string>(), reimbursements = new Map<string, typeof ue.reimbursements[number]>();
    for (const reimbursement of ue.reimbursements) {
      ref(reimbursement.sourceReference);
      if (reimbursements.has(reimbursement.sourceReference) || !['exact_accounted_not_w2', 'fixed_allowance_not_w2'].includes(reimbursement.method) || reimbursement.includedInW2Confirmed !== false || !reimbursement.expenseReferences.length || new Set(reimbursement.expenseReferences).size !== reimbursement.expenseReferences.length || !money(reimbursement.amount).gt(0) || date(reimbursement.paidOn, year) > asOf) return fail('actual complete reimbursement method is unsupported, duplicate or contradictory');
      reimbursements.set(reimbursement.sourceReference, reimbursement);
    }
    const categories: Record<string, Decimal> = { union_dues: zero(), work_clothing: zero(), small_tools_supplies: zero(), occupational_license: zero() };
    const expenses: PAActualEmployeeResult['expenses'] = [];
    for (const expense of ue.expenses) {
      for (const text of [expense.sourceReference, expense.receiptReference, expense.description]) ref(text);
      if (expenseRefs.has(expense.sourceReference) || receipts.has(expense.receiptReference)) return fail('duplicate actual employee expense or original receipt');
      expenseRefs.add(expense.sourceReference); receipts.add(expense.receiptReference);
      if (!(expense.category in categories)) return fail('unsupported actual UE category requires its separate method');
      for (const key of ['ordinaryCustomaryConfirmed', 'actuallyPaidConfirmed', 'reasonableConfirmed', 'necessaryConfirmed', 'directlyRelatedConfirmed', 'employerRequiredConfirmed', 'notProvidedByEmployerConfirmed'] as const) if (expense[key] !== true) return fail('actual required eligible employee expense conditions are unknown');
      if (expense.category === 'small_tools_supplies' && expense.usefulLifeAtMostOneYearConfirmed !== true) return fail('actual tool useful life needs the depreciation successor');
      if (expense.category === 'work_clothing' && expense.notEverydayClothingConfirmed !== true) return fail('actual required clothing must not be adaptable for everyday use');
      if (['union_dues', 'occupational_license'].includes(expense.category) && expense.requiredLicenseOrUnionMembershipConfirmed !== true) return fail('actual job-required union/license condition is unknown');
      const paid = date(expense.paidOn, year), amount = money(expense.amount);
      if (!expectedDates.includes(paid) || paid > asOf) return fail('actual employee expense date is outside its documented employment');
      let allowable = amount;
      if (expense.reimbursementMethod === 'none') {
        if (expense.reimbursementReferences.length) return fail('no-reimbursement fact contradicts retained original reimbursements');
      } else {
        if (!['exact_accounted_not_w2', 'fixed_allowance_not_w2'].includes(expense.reimbursementMethod) || !expense.reimbursementReferences.length || new Set(expense.reimbursementReferences).size !== expense.reimbursementReferences.length) return fail('actual partial/excess/taxable reimbursement method requires its source successor');
        for (const reference of expense.reimbursementReferences) {
          const record = reimbursements.get(reference);
          if (!record || record.method !== expense.reimbursementMethod || !record.expenseReferences.includes(expense.sourceReference)) return fail('actual receipt/reimbursement source pairing is incomplete');
        }
        allowable = zero();
      }
      categories[expense.category] = categories[expense.category].plus(allowable);
      expenses.push({ paidOn: expense.paidOn, allowableAmount: publicMoney(allowable) });
    }
    for (const reimbursement of reimbursements.values()) {
      let covered = zero();
      for (const reference of reimbursement.expenseReferences) {
        const expense = ue.expenses.find(e => e.sourceReference === reference);
        if (!expense || !expense.reimbursementReferences.includes(reimbursement.sourceReference) || expense.reimbursementMethod !== reimbursement.method) return fail('retained actual reimbursement cannot be dropped or paired with invented expense');
        covered = covered.plus(money(expense.amount));
      }
      if (reimbursement.method === 'exact_accounted_not_w2' && !covered.eq(money(reimbursement.amount))) return fail('actual exact reimbursement must reconcile the exact paired receipt amounts');
    }
    // Aggregate each connected group of actual originals; disjoint receipt
    // costs cannot conceal excess paid against a different receipt group.
    const remainingReimbursements = new Set(reimbursements.keys());
    while (remainingReimbursements.size > 0) {
      const firstReference = remainingReimbursements.values().next().value;
      if (firstReference === undefined) return fail('actual reimbursement group is incomplete');
      const pending = [firstReference], groupedRecords = new Set<string>(), groupedReceipts = new Set<string>();
      let reimbursed = zero(), covered = zero();
      while (pending.length > 0) {
        const reference = pending.pop();
        if (reference === undefined || groupedRecords.has(reference)) continue;
        const record = reimbursements.get(reference);
        if (!record) return fail('actual reimbursement group references a missing original');
        groupedRecords.add(reference); remainingReimbursements.delete(reference);
        reimbursed = reimbursed.plus(money(record.amount));
        for (const expenseReference of record.expenseReferences) {
          if (groupedReceipts.has(expenseReference)) continue;
          const expense = ue.expenses.find(item => item.sourceReference === expenseReference);
          if (!expense) return fail('actual reimbursement group references a missing receipt');
          groupedReceipts.add(expenseReference); covered = covered.plus(money(expense.amount));
          for (const pairedReference of expense.reimbursementReferences) {
            if (!groupedRecords.has(pairedReference)) pending.push(pairedReference);
          }
        }
      }
      if (reimbursed.gt(covered)) return fail('actual aggregate reimbursement exceeds paired receipt cost; taxable excess requires its actual cash/wage inclusion successor');
    }
    const direct = Object.fromEntries(Object.entries(categories).map(([key, amount]) => [key, whole(amount)]));
    const total = Object.values(direct).reduce((sum, n) => sum.plus(n), zero());
    const rawTotal = Object.values(categories).reduce((sum, n) => sum.plus(n), zero());
    const allocatedExpense = admittedPrintedAllocation(total), net = Money.max(0, allocatedGross.minus(allocatedExpense));
    const p = publicMoney, z = () => p(zero());
    const scheduleUE: PAActualEmployeeUEResult = {
      totalMiles: 0, businessMiles: 0, businessUsePercentage: z(), vehicleMethod: 'none', standardMileageDeduction: z(), actualVehicleDeduction: z(), parkingAndTolls: z(), totalVehicleExpenses: z(),
      lodging: z(), mealsBeforeLimitation: z(), mealsAfterLimitation: z(), otherTravel: z(), totalTravelExpenses: z(),
      unionDues: p(direct.union_dues), toolsAndSupplies: p(direct.small_tools_supplies), workClothing: p(direct.work_clothing), education: z(), licenseFees: p(direct.occupational_license), subscriptions: z(), homeOffice: z(), otherExpenses: z(), totalOtherExpenses: p(total),
      totalExpenses: p(total), employerReimbursements: z(), netUnreimbursedExpenses: p(total),
      line1: p(direct.union_dues), line2: p(direct.work_clothing), line3: p(direct.small_tools_supplies), line4: p(direct.occupational_license), line5: p(total), lineH: p(total), lineI: z(), lineJ: p(total), lines: [],
    };
    const correctReported = actualPA !== undefined && whole(actualPA).eq(allocatedGross);
    const correctReportedAmount = correctReported && actualPA !== undefined ? whole(actualPA) : zero();
    const scheduleNRH: PAActualEmployeeNRHResult = {
      workingDays, workingDayFraction: p(printedFraction), businessVolumeFraction: z(), selectedApportionmentFraction: p(printedFraction),
      employerReportedPAGrossCompensation: correctReported ? p(correctReportedAmount) : z(), grossCompensation: correctReported ? z() : p(grossPrinted), apportionedGrossCompensation: correctReported ? z() : p(allocatedGross),
      unreimbursedEmployeeBusinessExpenses: p(total), apportionedEmployeeBusinessExpenses: p(allocatedExpense), employerReimbursementsNotInW2: z(), apportionedExpenseReimbursements: z(), totalPAGrossCompensation: p(allocatedGross), netPATaxableCompensation: p(net), businessApplicableFactorCount: 0,
      line9: correctReported ? z() : p(grossPrinted), line12: correctReported ? z() : p(allocatedGross), line13: p(total), line16: p(allocatedExpense), line17: correctReported ? p(correctReportedAmount) : z(), line18: correctReported ? z() : p(allocatedGross), line19: z(), line20: p(allocatedGross), line21: p(allocatedExpense), line22: p(net), lines: [],
    };
    audit.record('PA-Actual-Employee', `${index + 1}-working-days`, 'Source-derived PA working days', p(new Money(paWorkingDays)), 'Complete signed employer calendar and documented outside necessity');
    audit.record('PA-Actual-Employee', `${index + 1}-gross`, 'Source-derived PA service compensation', p(allocate(gross)), 'Original payroll multiplied by complete PA-working-day ratio');
    audit.record('PA-Actual-Employee', `${index + 1}-ue`, 'Printed apportioned direct employee expenses', p(allocatedExpense), 'Whole-dollar UE categories multiplied by admitted NRH fraction');
    perEmployer.push({ originalIndex: index, calendarDays: expectedDates.length, nonworkingDays, workingDays, paWorkingDays, workingDayFraction: p(printedFraction), rawGrossCompensation: p(gross), rawPAServiceCompensation: p(allocate(gross)), rawAllowableExpenses: p(rawTotal), rawPAAllowableExpenses: p(allocate(rawTotal)), employmentPeriods, payroll, expenses, scheduleUE, scheduleNRH });
  }
  const sourceCommitment = bytesToHex(sha256(new TextEncoder().encode(stable({ method: 'pa-actual-employee-v1', source, currentOriginals: input.w2s }))));
  return { sourceCommitment, perEmployer, lines: audit.getLines() };
}
