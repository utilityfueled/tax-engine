/** Actual current sources for the personal-owner MFS computation.
 * Spec: spec/federal/net-operating-loss-new-marriage.yaml. No tax-base inputs. */
import type { TaxYearInput } from '@/models/inputs.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d, sum } from '@/utils/decimal.js';

const arrays = ['w2s', 'form1099Int', 'form1099Div', 'form1099B', 'form1099DA', 'form1099Nec', 'form1099Misc', 'form1099G', 'form1099OID',
  'formW2G', 'form1099K', 'form1099R', 'form1099SA', 'formSSA1099', 'formRRB1099', 'scheduleK1', 'scheduleK1Form1041',
  'form1098', 'form1098E', 'donations', 'rentalProperties', 'form6252', 'homeSales', 'form8824'] as const;
// A source block assigned intact to its actual owner retains its own detailed
// raw basis, expense and statutory qualification facts. Cross-owner source
// methods are never inferred by assigning a completed joint calculation.
const blocks = ['scheduleC', 'scheduleF', 'form4562', 'form4797', 'form4137', 'form8919', 'form5329', 'form8606', 'form8889',
  'form3903', 'seHealthInsuranceWorksheet', 'form7206', 'form4684', 'form4952', 'form4952Amt', 'amtCapitalGains',
  'studentLoanInterestFacts', 'socialSecurityFacts', 'taxableRefundWorksheet', 'salesTaxDeduction',
  'form6781', 'form8915F', 'form461'] as const;
const ownerMaps = ['form8606ByOwner', 'form8889ByOwner', 'form4137ByOwner'] as const;
const metadata = new Set(['iraDeductionWorksheet', ...ownerMaps, 'taxpayer', 'netOperatingLoss', 'deductionElection', 'standardDeductionFacts', 'scheduleA', 'adjustments', 'priorYear',
  // These claims do not enter the income or6251 income contexts. Actual final
  // joint calculations still retain and validate all of their actual sources.
  'childTaxCredit', 'eic', 'form8880', 'form2210', 'scheduleR', 'scheduleH', 'energyCredits', 'form8936', 'form3800', 'stateReturns',
  'paScheduleGLStatements', 'paScheduleJStatements', 'paPassThroughStatements', 'paResidentReturn', 'paNonresidentReturn']);
const rawExpenseKeys = {
  scheduleA: ['medicalExpenses', 'realEstateTaxes', 'additionalStateLocalIncomeTaxes', 'nonW2IncomeTaxesDeductedElsewhere',
    'personalPropertyTaxes', 'excludedPuertoRicoIncome', 'form4563ExcludedIncome', 'investmentInterestExpense', 'gamblingWinnings', 'gamblingLosses', 'gamblingExpenses'],
  adjustments: ['otherTaxesPaid', 'educatorExpenses', 'primaryEducatorExpenses', 'spouseEducatorExpenses', 'businessExpenseAdjustments', 'hsaDeduction',
    'armedForcesMovingExpenses', 'archerMSADeduction', 'selfEmployedHealthInsurance', 'studentLoanInterest', 'iraDeduction', 'otherAdjustmentsTotal',
    'alimonyPaid', 'earlyWithdrawalPenalty', 'seRetirementContributions'],
  priorYear: ['shortTermCapitalLoss', 'longTermCapitalLoss', 'capitalLossCarryforward'],
} as const;
function present(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.some(present);
  if (typeof value === 'object') return Object.values(value).some(present);
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return !d(value).isZero();
  return true;
}
function fail(message: string): never { throw new Error(`New-marriage NOL current owner sources require ${message}`); }
function ref(value: string | undefined): void { if (!value?.trim() || value !== value.trim()) fail('actual unambiguous source references'); }
function raw(value: string | undefined): ReturnType<typeof d> {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) fail('actual finite Decimal source amounts, including known zero');
  return d(value);
}
export function newMarriageOwnerInputs(input: TaxYearInput): Map<string, TaxYearInput> | undefined {
  const facts = input.netOperatingLoss;
  if (!facts?.newMarriageHistory && !facts?.alternativeTax?.newMarriageHistory) {
    if (facts?.currentOwnerSources !== undefined) fail('the actual new-marriage timeline before attaching current owner sources');
    return undefined;
  }
  const source = facts.currentOwnerSources;
  if (facts.returnMembership !== 'changed_membership' || !facts.newMarriageHistory || !facts.alternativeTax?.newMarriageHistory
    || !facts.filingUnitHistory || !facts.alternativeTax.filingUnitHistory
    || !source || source.sourceFactsConfirmed !== true || source.allIncomeAndDeductionsIncluded !== true
    || typeof source.livedWithSpouseAtAnyTimeDuringYear !== 'boolean' || source.communityPropertyApplies !== false
    || !source.primaryDeductionElection || !source.spouseDeductionElection || !Array.isArray(source.expenseAllocations)) {
    fail('complete independently bound marital histories and actual noncommunity current owner income, expenses and MFS elections');
  }
  ref(source.sourceReference);
  const current = facts.filingUnitHistory?.returns?.find(row => row.sourceId === facts.filingUnitHistory?.currentReturnSourceId);
  if (!current?.primaryPersonId || !current.spousePersonId || !input.taxpayer.spouse) fail('actual current joint owners');
  const maritalSignature = (proof: NonNullable<typeof facts.newMarriageHistory>, timeline: NonNullable<typeof facts.filingUnitHistory>) =>
    JSON.stringify(proof.years?.map(year => ({ year: year.taxYear, married: year.marriedToEachOther,
      pair: [year.firstPersonId, year.secondPersonId].map(id => { const person = timeline.persons?.find(row => row.sourceId === id); return `${person?.name?.trim().replace(/\s+/g, ' ').toLowerCase()}:${person?.taxpayerIdLast4}`; }).sort() })).sort((a, b) => (a.year ?? 0) - (b.year ?? 0)));
  if (maritalSignature(facts.newMarriageHistory, facts.filingUnitHistory) !== maritalSignature(facts.alternativeTax.newMarriageHistory, facts.alternativeTax.filingUnitHistory)) {
    fail('consistent actual marriage facts across independent regular and AMT histories');
  }
  // Verified empty original ledgers have no personal allowance to calculate.
  // Do not impose a foreign-income projection method when no carry exists.
  if (facts.vintages?.length === 0 && facts.alternativeTax.vintages?.length === 0
    && source.expenseAllocations.length === 0 && (source.sourceOwners?.length ?? 0) === 0) return undefined;
  const owners = new Map<string, 'primary' | 'spouse'>();
  const used = new Set<string>();
  for (const row of source.sourceOwners ?? []) {
    ref(row.sourceReference);
    if (!row.field || ![...arrays, ...blocks].includes(row.field as never) || !row.owner) fail('a supported actual source field and owner');
    const isArray = arrays.includes(row.field as never);
    if (isArray !== (row.index !== undefined)) fail('an actual document index for array source ownership');
    const value = (input as unknown as Record<string, unknown>)[row.field];
    if (value === undefined || isArray && (!Array.isArray(value) || value[row.index!] === undefined)) fail('an existing actual source for every ownership record');
    const key = `${row.field}:${row.index ?? 'block'}`;
    if (owners.has(key)) fail('unique source ownership without duplicates');
    owners.set(key, row.owner);
  }
  const expenseRows = new Map<string, NonNullable<typeof source.expenseAllocations>[number]>();
  for (const row of source.expenseAllocations) {
    ref(row.sourceReference);
    if (!row.kind || !row.field || !(rawExpenseKeys[row.kind] as readonly string[]).includes(row.field)) fail('an actual raw expense or capital-carry source field');
    const key = `${row.kind}:${row.field}`;
    if (expenseRows.has(key)) fail('unique raw source splits');
    const total = d((input[row.kind] as Record<string, unknown> | undefined)?.[row.field] as string | undefined);
    const primary = raw(row.primaryAmount), spouse = raw(row.spouseAmount);
    if (row.kind === 'adjustments' && (row.field === 'primaryEducatorExpenses' && !spouse.isZero()
      || row.field === 'spouseEducatorExpenses' && !primary.isZero())) fail('consistent inherent named expense owner');
    if (!sum(primary, spouse).eq(total) || total.gte(0) && (primary.lt(0) || spouse.lt(0))
      || total.lt(0) && (primary.gt(0) || spouse.gt(0))) fail('exact conserving same-character raw expense and capital-carry splits');
    expenseRows.set(key, row);
  }
  for (const kind of ['scheduleA', 'adjustments', 'priorYear'] as const) {
    const group = input[kind] as Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(group ?? {})) {
      if ((rawExpenseKeys[kind] as readonly string[]).includes(key)) {
        if (!d(value as string | undefined).isZero() && !expenseRows.has(`${kind}:${key}`)) fail(`actual ${kind}.${key} owner amounts and reference`);
      } else if (kind === 'adjustments' && ['estimatedTaxPayments', 'extensionPayments', 'priorYearAppliedCredits'].includes(key)) {
        if (Array.isArray(value) && value.some(row => row.type === 'state' && !d(row.amount).isZero())) fail('actual owner allocation of state payment deductions');
      } else if (kind === 'priorYear' && ['nolCarryforward', 'excessBusinessLossNOL'].includes(key)) {
        // Actual NOL vintages, not legacy aggregate carry values, supply these.
      } else if (present(value)) fail(`the separate owner method for ${kind}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (!metadata.has(key) && !arrays.includes(key as never) && !blocks.includes(key as never) && present(value)) fail(`the actual owner projection method for ${key}`);
  }
  const stdFacts = input.standardDeductionFacts;
  if (!stdFacts || ['primaryBlind', 'spouseBlind', 'primaryCanBeClaimedAsDependent', 'spouseCanBeClaimedAsDependent', 'dualStatusAlien', 'nonresidentAlien', 'shortTaxYear'].some(key => typeof (stdFacts as Record<string, unknown>)[key] !== 'boolean')
    || stdFacts.primaryDeathDate === undefined || stdFacts.spouseDeathDate === undefined) fail('actual standard-deduction eligibility, blindness, dependency and death facts for both owners');
  if (stdFacts.dualStatusAlien || stdFacts.nonresidentAlien || stdFacts.shortTaxYear) fail('the separate actual owner alien or short-year deduction method');
  const result = new Map<string, TaxYearInput>();
  for (const owner of ['primary', 'spouse'] as const) {
    const other = owner === 'primary' ? 'spouse' : 'primary';
    const person = owner === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    const otherPerson = owner === 'primary' ? input.taxpayer.spouse : input.taxpayer.primary;
    const election = owner === 'primary' ? source.primaryDeductionElection : source.spouseDeductionElection;
    const otherElection = other === 'primary' ? source.primaryDeductionElection : source.spouseDeductionElection;
    const actual = input.standardDeductionFacts ?? {};
    const base: Record<string, unknown> = { taxpayer: { ...input.taxpayer, filingStatus: 'married_filing_separately', primary: person, spouse: otherPerson,
      livedWithSpouseAtAnyTimeDuringYear: source.livedWithSpouseAtAnyTimeDuringYear, dependents: [] }, deductionElection: election,
      standardDeductionFacts: { ...actual, primaryBlind: actual[owner === 'primary' ? 'primaryBlind' : 'spouseBlind'],
        primaryCanBeClaimedAsDependent: actual[owner === 'primary' ? 'primaryCanBeClaimedAsDependent' : 'spouseCanBeClaimedAsDependent'],
        primaryDeathDate: actual[owner === 'primary' ? 'primaryDeathDate' : 'spouseDeathDate'],
        spouseBlind: actual[other === 'primary' ? 'primaryBlind' : 'spouseBlind'], spouseCanBeClaimedAsDependent: actual[other === 'primary' ? 'primaryCanBeClaimedAsDependent' : 'spouseCanBeClaimedAsDependent'],
        spouseDeathDate: actual[other === 'primary' ? 'primaryDeathDate' : 'spouseDeathDate'], spouseItemizes: otherElection === 'itemized', claimSpouseAdditionalDeduction: false } };
    const remap = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(remap);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (['accountHolder', 'owner'].includes(key) && ['primary', 'spouse'].includes(child as string)) {
          if (child !== owner) fail('separate current method for a source block containing both owners');
          return [key, 'primary'];
        }
        return [key, remap(child)];
      }));
    };
    const actualOwner = (field: string, value: unknown, index?: number): 'primary' | 'spouse' => {
      const key = `${field}:${index ?? 'block'}`, declared = owners.get(key);
      if (declared) used.add(key);
      const tag = value && typeof value === 'object' ? (value as { accountHolder?: 'primary' | 'spouse' }).accountHolder : undefined;
      if (declared && tag && declared !== tag) fail('consistent actual document owner and source attachment');
      if (!declared && !tag) fail(`actual owner for ${field}${index === undefined ? '' : `[${index}]`}; absence cannot default to primary`);
      return declared ?? tag!;
    };
    for (const field of arrays) {
      const rows = (input as unknown as Record<string, unknown[]>)[field] ?? [];
      base[field] = rows.flatMap((row, index) => actualOwner(field, row, index) === owner ? [remap(row)] : []);
    }
    for (const field of blocks) {
      const value = (input as unknown as Record<string, unknown>)[field];
      if (value !== undefined && actualOwner(field, value) === owner) base[field] = remap(value);
    }
    if (input.iraDeductionWorksheet) {
      const worksheet = input.iraDeductionWorksheet as unknown as Record<string, unknown>;
      base.iraDeductionWorksheet = Object.fromEntries(Object.entries(worksheet).map(([key, value]) => {
        if (owner === 'spouse' && key.startsWith('primary')) return [`spouse${key.slice(7)}`, value];
        if (owner === 'spouse' && key.startsWith('spouse')) return [`primary${key.slice(6)}`, value];
        return [key, value];
      }));
      // A hypothetical MFS return claims only this person's contribution.
      // Keep actual other-spouse participation, which still controls219 limits.
      (base.iraDeductionWorksheet as Record<string, unknown>).spouseContributions = '0';
    }
    for (const field of ownerMaps) {
      const selected = input[field]?.[owner];
      if (selected) base[field] = { primary: remap(selected) };
    }
    for (const kind of ['scheduleA', 'adjustments', 'priorYear'] as const) {
      const allocated: Record<string, string> = {};
      for (const row of expenseRows.values()) if (row.kind === kind) allocated[row.field!] = (owner === 'primary' ? row.primaryAmount : row.spouseAmount)!;
      if (kind === 'adjustments') {
        // Scalar educator owner fields are normalized to the projected primary.
        if (owner === 'spouse' && allocated.spouseEducatorExpenses !== undefined) allocated.primaryEducatorExpenses = allocated.spouseEducatorExpenses;
        delete allocated.spouseEducatorExpenses;
      }
      base[kind] = allocated;
    }
    if (election === 'standard' && otherElection === 'itemized') fail('consistent hypothetical MFS itemized elections; the other spouse cannot claim a standard deduction');
    if (actual.primaryCanBeClaimedAsDependent || actual.spouseCanBeClaimedAsDependent) fail('the separate actual owner dependent-earned-income standard deduction worksheet');
    result.set(owner === 'primary' ? current.primaryPersonId : current.spousePersonId, TaxYearInputSchema.parse(base));
  }
  if (used.size !== owners.size) fail('each current source ownership attachment to bind an actual document');
  return result;
}
