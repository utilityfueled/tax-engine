/** Spec: state/oh-2026-resident-capital-gain-draft.yaml. No full federal/filing qualification. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TaxpayerSchema, StandardDeductionFactsSchema, W2Schema, Form1099BSchema, CapitalTransactionSchema, type TaxYearInput } from '@/models/inputs.js';
import { OhioResidencyFactsSchema, ohioNrcCategories } from '@/models/ohio-residency.js';
import { Ohio2026OrdinarySourcesSchema } from '@/models/ohio-2026-return-draft.js';
import { Ohio2026SchoolSourcesSchema } from '@/models/ohio-2026-school-sources.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { calculateOhio2026Baseline } from './oh-2026-baseline.js';
import { calculateOhio2026QualifyingCapitalGainDraft } from './oh-2026-qualifying-capital-gain-draft.js';
import { lookupOhio2026SchoolDistrict } from './oh-2026-school-catalog.js';

const reference = z.string().trim().min(1).max(200);
const yes = z.literal(true);
const snapshot = z.record(z.string(), z.unknown());
const cusip = z.string().regex(/^[A-Z0-9*@#]{8}[0-9]$/u);
const issuerIdentity = z.string().min(1).max(120).refine(value => value === value.trim() && !/\p{C}/u.test(value));
const originalOwner = z.strictObject({ firstName: reference, lastName: reference, ssn: reference });
const carryovers = z.strictObject({ capitalLossCarryforward: z.literal('0'), shortTermCapitalLoss: z.literal('0'), longTermCapitalLoss: z.literal('0') });
// Canonical loader representations, NOT documentary facts. Keep the original
// worksheet schema below strict and require all three capital amounts there.
const emptyHistory = z.array(z.never()).length(0).optional();
const zeroHistory = z.literal('0').optional();
const currentCarryovers = carryovers.extend({
  suspendedPassiveLosses: emptyHistory, suspendedPTPLosses: emptyHistory,
  foreignTaxCreditCarryforward: zeroHistory, foreignTaxCreditCarryforwardByYear: emptyHistory,
  qbiAggregationElections: emptyHistory, charitableCarryforward: zeroHistory, charitableCarryforwardByYear: emptyHistory,
  suspendedBusinessInterest: emptyHistory, generalBusinessCreditCarryforward: zeroHistory,
  priorYearTax: zeroHistory, priorYearAGI: zeroHistory,
}).strict();
const traditionalSchoolSource = z.strictObject({
  taxYear: z.literal(2026), sourceReference: reference, sourceFactsConfirmed: yes,
  roundingElection: z.literal('whole_dollars'), onlySchoolDistrictResidenceConfirmed: yes,
  owner: Ohio2026SchoolSourcesSchema.shape.owner,
  residence: Ohio2026SchoolSourcesSchema.shape.residence,
});
const packet = z.strictObject({
  methodId: z.literal('oh-2026-resident-capital-gain-draft-v1'), taxYear: z.literal(2026), sourceReference: reference,
  sourceFactsConfirmed: yes, calendarYearConfirmed: yes, originalTaxInput: snapshot,
  allIncomeAndAdjustmentOriginalsIncludedConfirmed: yes, noOtherIncomeOrAdjustmentSourcesConfirmed: yes,
  noOtherOhioAdditionsOrDeductionsConfirmed: yes, noOtherOhioCreditOrTaxSourcesConfirmed: yes,
  noOtherStateTaxOnOhioResidentIncomeConfirmed: yes, noQualifyingEitcChildrenConfirmed: yes,
  noTaxingSchoolDistrictResidencyConfirmed: z.boolean(), traditionalSchoolSource: traditionalSchoolSource.optional(),
  employmentOriginal: Ohio2026OrdinarySourcesSchema.shape.employmentOriginals.element,
  saleAgreementOriginal: z.strictObject({ ownerReference: reference, entityReference: reference, saleReference: reference,
    sourceReference: reference, sourceTaxYear: z.literal(2026), sourceFactsConfirmed: yes,
    completeExecutedAgreementAndIssuerReconciliationConfirmed: yes, owner: originalOwner,
    securityIdentifier: cusip, issuerIdentity, dateSold: reference, sharesTransferred: z.string().regex(/^[1-9]\d{0,14}$/u),
    federalReportedProceeds: reference, proceedsReconciliationConfirmed: yes,
  }),
  equityOriginal: z.strictObject({ ownerReference: reference, entityReference: reference, saleReference: reference,
    sourceReference: reference, sourceTaxYear: z.literal(2026),
    owner: originalOwner, securityIdentifier: cusip, issuerIdentity,
    formSourceId: reference, accountReference: reference, transactionIndex: z.literal(0), originalTransaction: snapshot,
    equityType: z.literal('c_corporation_common_stock'), acquisition: z.strictObject({
      sourceReference: reference, date: reference, method: z.literal('secondary_market_cash_purchase'), acquiredAtOriginalIssue: z.literal(false),
      noSection1202FOrHExceptionConfirmed: yes, continuousUnchangedSharesConfirmed: yes, completeAcquisitionAndDispositionHistoryConfirmed: yes,
    }),
  }),
  carryoverOriginal: carryovers.extend({ sourceReference: reference, sourceTaxYear: z.literal(2025), ownerReference: reference, completeCapitalCarryoverWorksheetConfirmed: yes }).strict(),
  qualifyingCapitalGainSources: z.unknown(),
});
// This projection is used only after the complete original A34 method admits
// the UNMODIFIED packet. It binds identities, never substitutes its own amounts.
const a34Binding = z.object({ ownerReference: reference,
  sale: z.object({ ownerReference: reference, entityReference: reference, saleReference: reference, sourceReference: reference, date: reference, capitalGain: reference }),
  recognition: z.object({ entityReference: reference, reportedCapitalGain: reference, includedFederalAgi: reference, otherwiseOhioDeductedOrExcluded: z.literal('0') }),
  entity: z.object({ entityReference: reference }), participation: z.object({ entityReference: reference }),
  ownership: z.object({ entityReference: reference, unitsSold: reference }), payroll: z.array(z.object({ entityReference: reference })),
});
const canonical = (s: string) => s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();
const same = (a: string, b: string) => canonical(a) === canonical(b);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
const digest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
function requireFact(ok: unknown): asserts ok { if (!ok) throw new Error('Current source cohort incomplete'); }
function whole(value: unknown): Decimal {
  requireFact(typeof value === 'string' && /^\d{1,12}$/u.test(value));
  return new Decimal(value);
}
function day(value: string): string {
  requireFact(/^\d{4}-\d{2}-\d{2}$/u.test(value));
  const date = new Date(`${value}T00:00:00Z`);
  requireFact(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value);
  return value;
}
const emptyCollections = new Set(['form1099Int', 'form1099Div', 'form1099DA', 'form1099Nec', 'form1099Misc', 'form1099G', 'form1099OID', 'formW2G', 'form1099K', 'form1099C', 'form1099Q', 'scheduleK1', 'scheduleK1Form1041', 'form1098', 'form1098E', 'form1095A', 'donations', 'rentalProperties', 'savingsBondRedemptions', 'form6252', 'form8814', 'homeSales', 'form8824']);
const inputKeys = new Set(['taxpayer', 'standardDeductionFacts', 'w2s', 'form1099B', 'priorYear', 'ohioResidency']);
const w2Keys = new Set(['employer', 'accountHolder', 'taxYear', 'wages', 'federalWithheld', 'socialSecurityWages', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld', 'state', 'stateWages', 'stateTaxWithheld', 'localWages', 'localTaxWithheld', 'localityName', 'stateLocalSources', 'socialSecurityTips', 'allocatedTips', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT']);
export interface Ohio2026ResidentCapitalGainDraftResult {
  methodId: 'oh-2026-resident-capital-gain-draft-v1'; taxYear: 2026; sourceStatus: 'admitted-draft' | 'incomplete';
  calculationStatus: 'incomplete'; filingQualified: false; exportAllowed: false; fullFederalReturnCalculated: false;
  sourceCommitment: string | null; incompleteReason: string;
  federalAgi: Decimal | null; capitalGain: Decimal | null; qualifyingCapitalGainsAndPayrollDeduction: Decimal | null;
  businessIncomeDeduction: Decimal | null; taxableBusinessIncome: Decimal | null; ohioAgi: Decimal | null;
  modifiedAdjustedGrossIncome: Decimal | null; exemptions: Decimal | null; incomeTax: Decimal | null;
  traditionalSchool?: { districtCode: string; taxBase: 'traditional'; rate: string; roundingElection: 'whole_dollars';
    taxableIncome: Decimal; rawTaxBeforeCredits: Decimal; reportedTaxBeforeCredits: Decimal };
  payments: null; balanceDue: null; outstandingTaxBalance: null; refund: null; underpaymentPenalty: null; latePaymentInterest: null;
  lines: CalculatedLine[];
}

export function calculateOhio2026ResidentCapitalGainDraft(input: TaxYearInput, raw: unknown): Ohio2026ResidentCapitalGainDraftResult {
  const held: Ohio2026ResidentCapitalGainDraftResult = {
    methodId: 'oh-2026-resident-capital-gain-draft-v1', taxYear: 2026, sourceStatus: 'incomplete', calculationStatus: 'incomplete',
    filingQualified: false, exportAllowed: false, fullFederalReturnCalculated: false, sourceCommitment: null,
    incompleteReason: 'Complete current resident equity-sale originals are required; no filing or payment conclusion.',
    federalAgi: null, capitalGain: null, qualifyingCapitalGainsAndPayrollDeduction: null, businessIncomeDeduction: null,
    taxableBusinessIncome: null, ohioAgi: null, modifiedAdjustedGrossIncome: null, exemptions: null, incomeTax: null,
    payments: null, balanceDue: null, outstandingTaxBalance: null, refund: null, underpaymentPenalty: null, latePaymentInterest: null, lines: [],
  };
  try {
    const source = packet.parse(raw), person = TaxpayerSchema.strict().parse(input.taxpayer);
    const standard = StandardDeductionFactsSchema.strict().parse(input.standardDeductionFacts);
    requireFact(person.taxYear === 2026 && person.filingStatus === 'single' && !person.spouse && person.dependents.length === 0);
    requireFact(day(person.primary.dateOfBirth) >= '1962-01-02' && person.primary.dateOfBirth <= '2008-12-31');
    requireFact(standard.primaryCanBeClaimedAsDependent === false && standard.primaryDeathDate === null && standard.nonresidentAlien === false && standard.dualStatusAlien === false && standard.shortTaxYear === false);
    requireFact(digest(input) === digest(source.originalTaxInput));
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || inputKeys.has(key)) continue;
      requireFact(emptyCollections.has(key) && Array.isArray(value) && value.length === 0);
    }
    currentCarryovers.parse(input.priorYear);
    requireFact(input.w2s.length === 1 && input.form1099B.length === 1);
    const w2 = input.w2s[0], form = input.form1099B[0]; requireFact(w2 && form);
    W2Schema.strict().parse(w2); Form1099BSchema.strict().parse(form);
    for (const [key, value] of Object.entries(w2)) requireFact(value === undefined || w2Keys.has(key));
    requireFact(w2.taxYear === 2026 && w2.accountHolder === 'primary');
    const wages = whole(w2.wages); requireFact(wages.gte('50000'));
    const originalWages = calculateW2StateLocalSources(input, 0, w2.stateLocalSources);
    requireFact(originalWages.stateRows.length === 1 && originalWages.stateRows[0]?.state === 'OH' && originalWages.stateRows[0].wages.eq(wages) && originalWages.localRows.length === 0);
    for (const key of ['socialSecurityTips', 'allocatedTips', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT', 'localWages', 'localTaxWithheld'] as const) requireFact(whole(w2[key]).isZero());
    const employment = source.employmentOriginal, service = employment.serviceRows[0];
    requireFact(employment.w2Index === 0 && employment.accountHolder === 'primary' && same(employment.employerName, w2.employer.name) && same(employment.employerTin, w2.employer.ein));
    requireFact(employment.serviceRows.length === 1 && service && service.from === '2026-01-01' && service.to === '2026-12-31' && service.paymentDate === '2026-12-31' && service.serviceState === 'OH' && whole(service.wages).eq(wages));
    requireFact(form.taxYear === 2026 && form.accountHolder === 'primary' && form.transactions.length === 1 && form.withholdingOnlyOpenShortSale === undefined && whole(form.federalWithheld).isZero() && whole(form.stateWithheld).isZero() && form.state === 'OH');
    const transaction = form.transactions[0]; requireFact(transaction);
    CapitalTransactionSchema.strict().parse(transaction);
    requireFact(transaction.holdingPeriod === 'long' && transaction.basisReportedToIRS === true && transaction.sourceDocumentType === '1099-b' && transaction.digitalAsset === false && transaction.washSale === false && whole(transaction.washSaleDisallowed).isZero() && whole(transaction.adjustments).isZero() && transaction.adjustmentCodes === undefined && transaction.qofInclusion === undefined);
    const acquired = day(transaction.dateAcquired), sold = day(transaction.dateSold);
    // Positive ordinary one-lot stock gain only. The current documentary
    // acquisition date (not a supplied holding-period label) must exceed a year.
    requireFact(acquired < sold && sold.startsWith('2026-'));
    const anniversary = new Date(`${acquired}T00:00:00Z`); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    requireFact(sold > anniversary.toISOString().slice(0, 10));
    const gain = whole(transaction.proceeds).minus(whole(transaction.costBasis)); requireFact(gain.gt(0));
    const equity = source.equityOriginal;
    const originalSecurity = cusip.parse(transaction.securityIdentifier), originalIssuer = issuerIdentity.parse(transaction.issuerIdentity);
    const anchoredEntity = JSON.stringify(['CUSIP', originalSecurity, originalIssuer]);
    requireFact(equity.securityIdentifier === originalSecurity && equity.issuerIdentity === originalIssuer && equity.entityReference === anchoredEntity);
    const agreement = source.saleAgreementOriginal;
    requireFact(agreement.securityIdentifier === originalSecurity && agreement.issuerIdentity === originalIssuer && agreement.entityReference === anchoredEntity);
    requireFact(agreement.sourceReference === equity.sourceReference && agreement.saleReference === equity.saleReference && agreement.ownerReference === equity.ownerReference && agreement.dateSold === sold && whole(agreement.federalReportedProceeds).eq(transaction.proceeds));
    requireFact(agreement.owner.firstName === person.primary.firstName && agreement.owner.lastName === person.primary.lastName && agreement.owner.ssn === person.primary.ssn);
    requireFact(digest(equity.originalTransaction) === digest(transaction) && equity.formSourceId === form.sourceId && equity.accountReference === form.accountReference);
    requireFact(same(equity.owner.firstName, person.primary.firstName) && same(equity.owner.lastName, person.primary.lastName) && equity.owner.ssn === person.primary.ssn && /^\d{3}-?\d{2}-?\d{4}$/u.test(person.primary.ssn));
    requireFact(equity.acquisition.date === acquired);
    const a34 = calculateOhio2026QualifyingCapitalGainDraft(source.qualifyingCapitalGainSources);
    requireFact(a34.sourceStatus === 'admitted-draft' && a34.deduction !== null && a34.deduction.isInteger());
    const bound = a34Binding.parse(source.qualifyingCapitalGainSources);
    requireFact([bound.sale, bound.recognition, bound.entity, bound.participation, bound.ownership, ...bound.payroll].every(row => row.entityReference === anchoredEntity));
    requireFact(agreement.sharesTransferred === bound.ownership.unitsSold);
    requireFact(same(equity.ownerReference, bound.ownerReference) && same(source.carryoverOriginal.ownerReference, equity.ownerReference));
    requireFact(same(equity.ownerReference, bound.sale.ownerReference) && same(equity.entityReference, bound.sale.entityReference) && same(equity.saleReference, bound.sale.saleReference) && same(equity.sourceReference, bound.sale.sourceReference) && bound.sale.date === sold);
    requireFact(whole(bound.sale.capitalGain).eq(gain) && whole(bound.recognition.reportedCapitalGain).eq(gain) && whole(bound.recognition.includedFederalAgi).eq(gain));
    const residency = OhioResidencyFactsSchema.parse(input.ohioResidency), owner = residency.owners[0];
    const schoolSource = source.traditionalSchoolSource;
    requireFact(source.noTaxingSchoolDistrictResidencyConfirmed === (schoolSource === undefined));
    const schoolStatus = schoolSource ? 'actual_district_sources_required' : 'no_ohio_taxing_district_residency';
    requireFact(residency.taxYear === 2026 && residency.allFederalSourcesIncludedConfirmed === true && residency.noBusinessIncomeConfirmed === false && residency.schoolDistrictStatus === schoolStatus && !residency.businessSources && !residency.reciprocalWageSources && !residency.residentCreditSources);
    const { ohioResidency: _residency, ...federal } = input;
    requireFact(residency.originalFederalSources && digest(residency.originalFederalSources) === digest(federal));
    requireFact(residency.owners.length === 1 && owner && owner.accountHolder === 'primary' && owner.status === 'full_year_resident' && owner.periods.length === 1 && owner.periods[0]?.from === '2026-01-01' && owner.periods[0].to === '2026-12-31' && owner.periods[0].domicileState === 'OH');
    const district = schoolSource && lookupOhio2026SchoolDistrict(residency.taxYear, schoolSource.residence.districtCode);
    if (schoolSource) {
      const { residence } = schoolSource, { finder } = residence;
      requireFact(digest(schoolSource.owner.originalTaxpayer) === digest(person.primary));
      const address = digest(person.address);
      requireFact(person.address.state === 'OH' && digest(residence.originalAddress) === address && digest(finder.originalAddress) === address);
      requireFact(residence.from === owner.periods[0].from && residence.through === owner.periods[0].to);
      const requestedDate = day(finder.lookupDate);
      requireFact(requestedDate >= residence.from && requestedDate <= residence.through);
      requireFact(district?.taxBase === 'traditional' && finder.districtCode === district.code && finder.districtName === district.name && finder.taxBase === district.taxBase && finder.rate === district.rate);
    }
    requireFact(owner.amounts && owner.stateAdditions?.length === 0 && owner.stateDeductions?.length === 0);
    for (const category of ohioNrcCategories) {
      const row = owner.amounts[category], expected = category === 'wages' ? wages : category === 'capitalGains' ? gain : new Decimal(0);
      requireFact(whole(row.federalAmount).eq(expected) && whole(row.residentAmount).eq(expected) && whole(row.nonresidentOhioAmount).isZero());
    }
    const form8949 = calculateForm8949(input), scheduleD = calculateScheduleD(input, 'single', FEDERAL_2026_CONSTANTS);
    requireFact(form8949.totalShortTermGainLoss.isZero() && form8949.totalLongTermGainLoss.eq(gain) && scheduleD.netCapitalGainLoss.eq(gain) && scheduleD.netShortTerm.isZero() && scheduleD.netLongTerm.eq(gain) && scheduleD.section1202Exclusion.isZero() && scheduleD.carryforwardShortTerm.isZero() && scheduleD.carryforwardLongTerm.isZero());
    const federalAgi = wages.plus(scheduleD.netCapitalGainLoss), deduction = new Decimal(a34.deduction.toFixed());
    const remainingBusiness = gain.minus(deduction), bid = Decimal.min('250000', remainingBusiness);
    const taxableBusinessIncome = remainingBusiness.minus(bid), ohioAgi = federalAgi.minus(deduction).minus(bid);
    const baseline = calculateOhio2026Baseline({ taxYear: 2026, filingStatus: 'single', ohioAdjustedGrossIncome: ohioAgi,
      businessIncomeDeduction: bid, qualifyingCapitalGainsAndPayrollDeduction: deduction, taxableBusinessIncome,
      eligibleExemptions: 1, precedingCredits: '0', primaryQualifyingIncome: wages });
    requireFact(baseline.modifiedAdjustedGrossIncome.eq(federalAgi) && baseline.modifiedAdjustedGrossIncome.minus(baseline.exemptions).gte('30000'));
    const audit = new AuditTrail();
    for (const [line, description, amount, formula] of [
      ['federalAGI', 'Current source federal adjusted gross income', federalAgi, 'Actual W2 box1 plus fresh sole Form8949/ScheduleD gain; no other income or adjustments'],
      ['businessGain', 'Ohio business-classified equity gain', gain, 'RC5747.01(B)(2); completed actual material participation, not inferred from federal capital character'],
      ['A34', 'Qualifying capital gains and payroll deduction', deduction, 'Fresh original-bound RC5747.79 method; before A28'],
      ['A28', 'Business income deduction after A34', bid, 'min(250000, actual business gain-A34)'],
      ['OhioAGI', 'Ohio adjusted gross income', ohioAgi, 'FederalAGI-A34-A28; each once'],
    ] as const) audit.record('OH2026 resident equity draft', line, description, amount, formula);
    let traditionalSchool: Ohio2026ResidentCapitalGainDraftResult['traditionalSchool'];
    if (district?.taxBase === 'traditional' && schoolSource) {
      const taxableIncome = Decimal.max(0, baseline.modifiedAdjustedGrossIncome.minus(baseline.exemptions));
      const rawTaxBeforeCredits = taxableIncome.times(district.rate);
      traditionalSchool = { districtCode: district.code, taxBase: district.taxBase, rate: district.rate,
        roundingElection: schoolSource.roundingElection, taxableIncome, rawTaxBeforeCredits, reportedTaxBeforeCredits: roundDollar(rawTaxBeforeCredits) };
      audit.record('OH2026 traditional school draft', 'school-base', 'Full-year traditional school tax base', taxableIncome,
        'Statutory MAGI including both deduction add-backs, less completed Ohio exemptions; R.C. 5748.01(E)(1)');
      audit.record('OH2026 traditional school draft', 'school-levy', 'Traditional school tax before credits', traditionalSchool.reportedTaxBeforeCredits,
        'Tax base times the verified annual district rate, rounded under the documented whole-dollar election; R.C. 5703.055',
        { 'District rate': new Decimal(district.rate), 'Unrounded levy': rawTaxBeforeCredits });
    }
    return { ...held, sourceStatus: 'admitted-draft', sourceCommitment: digest({ input, raw }),
      incompleteReason: 'Income and baseline tax draft only; complete federal, payment, annual filing and export qualification remain unavailable.',
      federalAgi, capitalGain: gain, qualifyingCapitalGainsAndPayrollDeduction: deduction, businessIncomeDeduction: bid,
      taxableBusinessIncome, ohioAgi, modifiedAdjustedGrossIncome: baseline.modifiedAdjustedGrossIncome,
      exemptions: baseline.exemptions, incomeTax: baseline.taxAfterJointCredit, lines: [...audit.getLines(), ...baseline.lines],
      ...(traditionalSchool ? { traditionalSchool } : {}) };
  } catch { return held; }
}
