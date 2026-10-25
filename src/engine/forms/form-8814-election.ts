/** Actual election qualification before income/AMT transfer; spec/federal/form-8814-election.yaml. */
import type { Form8814ChildInput, Taxpayer } from '@/models/inputs.js';
import type { YearConstants } from '@/models/constants.js';
import type { CalculatedLine } from '@/models/outputs.js';
import Decimal from 'decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

interface ElectionResult {
  eligibleChildCount: number;
  children: { childIndex: number; ageAtYearEnd: number; timelyElectionStatus: 'planned_timely' | 'filed_timely' }[];
  lines: CalculatedLine[];
}
const normalizedName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const identity = (value: string) => value.replace(/-/g, '');
function amount(value: unknown) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Form8814 requires actual nonnegative income and payment amounts, including known zero.');
  return d(value);
}
function ageAtYearEnd(date: string, year: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > `${year}-12-31`) throw new Error('Form8814 requires the child actual valid birth date.');
  return year - parsed.getUTCFullYear() + (date.slice(5) === '01-01' ? 1 : 0);
}

export function calculateForm8814Election(inputs: Form8814ChildInput[], taxpayer: Taxpayer, constants: YearConstants, canonicalParentTaxableIncomeWithoutChild?: Decimal): ElectionResult {
  const year = taxpayer.taxYear;
  if ((year !== 2025 && year !== 2026) || constants.taxYear !== year) throw new Error('Form8814 election source year is unsupported or inconsistent.');
  const audit = new AuditTrail(), seen = new Set<string>(), children: ElectionResult['children'] = [];
  for (const [index, input] of inputs.entries()) {
    const facts = input.electionFacts;
    if (!facts || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim()) throw new Error('Form8814 requires complete actual election sources.');
    if (facts.taxYear !== year) throw new Error('Form8814 election facts must use the actual return year.');
    if (facts.electionRequested !== true || !['planned_timely', 'filed_timely'].includes(facts.timelyElectionStatus)) throw new Error('Form8814 requires an affirmative election and an actual timely filing status or timely filing plan.');
    if (input.incomeSourcesComplete === false) throw new Error('Form8814 actual income sources are incomplete.');
    const taxableInterest = amount(input.taxableInterest), dividends = amount(input.ordinaryDividends), qualified = amount(input.qualifiedDividends), gains = amount(input.capitalGainDistributions);
    amount(input.taxExemptInterest);
    if (qualified.gt(dividends)) throw new Error('Form8814 qualified dividends exceed actual ordinary dividends.');
    const gross = taxableInterest.plus(dividends).plus(gains);
    if (gross.lte(constants.form8814.amountNotTaxed) || gross.gte(constants.form8814.maximumChildIncome)) throw new Error('Form8814 child gross income is outside the strict election limits; use the actual separate child return.');
    for (const key of ['otherGrossIncome', 'estimatedTaxPayments', 'priorYearOverpaymentApplied', 'federalIncomeTaxWithheld'] as const) {
      if (!amount(facts[key]).isZero()) throw new Error('Form8814 child other income, estimated payments, applied overpayment or federal withholding makes the election ineligible.');
    }
    if (facts.childRequiredToFile !== true || facts.childFilesJointReturn !== false) throw new Error('Form8814 requires a child who must file and does not file a joint return.');
    const child = facts.child, ssn = child && identity(child.ssn);
    if (!child || !child.firstName?.trim() || !child.lastName?.trim() || !ssn || !/^\d{9}$/.test(ssn)) throw new Error('Form8814 requires the actual child identity.');
    if (seen.has(ssn)) throw new Error('Duplicate Form8814 child election identity.');
    seen.add(ssn);
    if ([taxpayer.primary.ssn, taxpayer.spouse?.ssn].some(value => value && identity(value) === ssn)) throw new Error('Form8814 child identity cannot equal a parent on the return.');
    const dependent = taxpayer.dependents.find(person => identity(person.ssn) === ssn);
    if (dependent && (normalizedName(dependent.firstName) !== normalizedName(child.firstName) || normalizedName(dependent.lastName) !== normalizedName(child.lastName) || dependent.dateOfBirth !== child.dateOfBirth)) throw new Error('Form8814 child identity or birth date conflicts with the actual dependent.');
    const age = ageAtYearEnd(child.dateOfBirth, year);
    if (age >= 24) throw new Error('Form8814 child must be under age24.');
    if (age >= 19) {
      const student = facts.student;
      if (!student || !student.sourceReference?.trim() || !['school', 'school_on_farm', 'government_on_farm'].includes(student.program)) throw new Error('Form8814 requires the actual eligible full-time student program.');
      if (!Array.isArray(student.fullTimeMonths) || student.fullTimeMonths.some(month => !Number.isInteger(month) || month < 1 || month > 12) || new Set(student.fullTimeMonths).size !== student.fullTimeMonths.length) throw new Error('Form8814 student months must be valid and distinct, without duplicates.');
      if (student.fullTimeMonths.length < 5) throw new Error('Form8814 requires full-time enrollment during parts of at least five student months.');
    }
    const joint = taxpayer.filingStatus === 'married_filing_jointly', separate = taxpayer.filingStatus === 'married_filing_separately';
    if (!['primary', 'spouse'].includes(facts.electingTaxpayer) || (facts.electingTaxpayer === 'spouse' && !joint)) throw new Error('Form8814 spouse election requires the actual joint return.');
    if (joint && !taxpayer.spouse) throw new Error('Form8814 joint election requires the actual spouse.');
    const situation = facts.parentSituation;
    const jointSituation = ['joint_with_other_parent', 'custodial_joint_stepparent', 'surviving_joint_stepparent'].includes(situation);
    const separateSituation = ['married_separate', 'custodial_separate_stepparent', 'surviving_separate_stepparent'].includes(situation);
    const unmarriedSituation = ['custodial_unmarried', 'never_married_together_all_year', 'surviving_unmarried'].includes(situation);
    const consideredUnmarried = situation === 'custodial_considered_unmarried';
    if (consideredUnmarried && (facts.consideredUnmarriedUnder7703Confirmed !== true || (!separate && taxpayer.filingStatus !== 'head_of_household'))) throw new Error('Form8814 requires the actual considered-unmarried determination under7703 for this separate return.');
    if (!consideredUnmarried && (jointSituation ? !joint : separateSituation ? !separate : unmarriedSituation ? joint || separate : true)) throw new Error('Form8814 parent selection conflicts with the actual joint, separate or unmarried filing status.');
    const stepSituation = situation.includes('stepparent');
    if (!['parent', 'stepparent'].includes(facts.relationshipToChild) || (facts.relationshipToChild === 'stepparent' && !stepSituation)) throw new Error('Form8814 requires the actual parent or qualifying remarried stepparent relationship.');
    if (situation.startsWith('custodial') && facts.custodialParentConfirmed !== true) throw new Error('Form8814 requires the actual custodial parent determination.');
    if (separateSituation || situation === 'never_married_together_all_year') {
      const comparison = facts.parentIncomeComparison;
      if (!comparison || comparison.taxYear !== year || !comparison.returnSourceReference?.trim() || !comparison.otherParentSourceReference?.trim() || comparison.excludesElectedChildIncomeConfirmed !== true) throw new Error('Form8814 requires both actual taxable-income comparison worksheets excluding elected child income.');
      const current = amount(comparison.returnTaxableIncomeWithoutChild), other = amount(comparison.otherParentTaxableIncomeWithoutChild);
      if (!Decimal.isDecimal(canonicalParentTaxableIncomeWithoutChild) || !canonicalParentTaxableIncomeWithoutChild.isFinite() || canonicalParentTaxableIncomeWithoutChild.lt(0)) throw new Error('Form8814 requires canonical parent taxable income without elected child income.');
      if (!current.eq(canonicalParentTaxableIncomeWithoutChild)) throw new Error('Form8814 actual parent worksheet must reconcile with canonical parent taxable income without elected child income.');
      if (!current.gt(other)) throw new Error('Form8814 requires the parent with strictly greater taxable income; a tie or lower amount does not establish eligibility.');
      audit.record('Form8814 election', `${index + 1}:parent-comparison`, 'Actual parent income comparison', current.minus(other), 'Actual completed taxable-income worksheets excluding elected child income; positive difference required', { 'Return parent taxable income': current, 'Other parent taxable income': other });
    }
    children.push({ childIndex: index, ageAtYearEnd: age, timelyElectionStatus: facts.timelyElectionStatus as 'planned_timely' | 'filed_timely' });
    audit.record('Form8814 election', `${index + 1}:eligible`, 'Actual child election eligibility', d('1'), 'Age/student, income/payment, parent-selection and election facts validated; planned timely filing is not evidence of an election already filed.');
  }
  return { eligibleChildCount: children.length, children, lines: audit.getLines() };
}
