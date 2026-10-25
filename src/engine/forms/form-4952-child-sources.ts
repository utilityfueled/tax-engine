/** Actual child transfer binding. Spec: spec/federal/form-4952-child-sources.yaml. */
import type { Form4952Input, Form8814ChildInput } from '@/models/inputs.js';
import type { YearConstants } from '@/models/constants.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';
import { calculateForm8814 } from './form-8814.js';
import { calculateForm8814IncomeCharacter } from './form-8814-income-character.js';
import { calculateForm8814AmtSources } from './form-8814-amt-sources.js';

export function calculateForm4952ChildSources(
  input: Form4952Input, children: Form8814ChildInput[], constants: YearConstants, context: 'regular' | 'amt' = 'regular',
) {
  const source = input.childIncomeSources;
  if (!source || source.sourceFactsConfirmed !== true || source.parentSourcesExcludeAllChildrenConfirmed !== true || !source.sourceReference?.trim()) {
    throw new Error('Form4952 requires the actual child source partition and excluding-child parent totals');
  }
  if (input.sourceFactsConfirmed !== true || input.sourceTaxYear !== constants.taxYear || source.sourceTaxYear !== constants.taxYear) {
    throw new Error('Form4952 child source and combined worksheet must match the actual confirmed return year');
  }
  if (!Array.isArray(source.children) || source.children.length !== children.length) throw new Error('Form4952 child sources must include every actual election once');
  const amount = (value: unknown, name: string) => {
    if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`Form4952 child source requires actual ${name}, including known zero`);
    return d(value);
  };
  const normalize = (value: string | undefined) => value?.trim().toLocaleLowerCase('en-US');
  const seen = new Set<string>();
  for (const row of source.children) {
    if (!/^form8814:(0|[1-9]\d*)$/.test(row.sourceId) || seen.has(row.sourceId)) throw new Error('Form4952 child source ID is invalid or duplicate');
    seen.add(row.sourceId);
    const child = children[Number(row.sourceId.slice('form8814:'.length))]?.electionFacts?.child;
    if (!child || row.sourceTaxYear !== constants.taxYear || !row.sourceReference?.trim()
      || normalize(row.firstName) !== normalize(child.firstName) || normalize(row.lastName) !== normalize(child.lastName)
      || row.dateOfBirth !== child.dateOfBirth || !/^\d{4}$/.test(row.ssnLast4) || row.ssnLast4 !== child.ssn.replace(/\D/g, '').slice(-4)) {
      throw new Error('Form4952 child source identity or year conflicts with the actual election');
    }
  }
  const character = calculateForm8814IncomeCharacter(children, constants);
  const childDividends = sum(...children.map(child => calculateForm8814(child, constants).qualifiedDividendsToReport));
  const childGains = sum(...character.children.map(child => child.capitalGainDistributionsToReport));
  const childPreference = context === 'amt' ? calculateForm8814AmtSources(children, constants.taxYear).privateActivityBondInterest : d('0');
  const parentDividends = amount(source.parentQualifiedDividends, 'parent qualified dividends');
  if (parentDividends.lt(0)) throw new Error('Form4952 parent qualified dividends must be nonnegative');
  const grossInvestmentIncome = amount(source.parentGrossInvestmentIncome, 'parent gross income').plus(character.grossInvestmentIncomeFor4952).plus(childPreference);
  const qualifiedDividendsIncluded = parentDividends.plus(childDividends);
  const netGainFromInvestmentProperty = amount(source.parentNetInvestmentGain, 'parent net investment gain').plus(childGains);
  const netCapitalGainFromInvestmentProperty = amount(source.parentNetLongTermGain, 'parent net long-term gain').plus(childGains)
    .minus(zeroFloor(amount(source.parentNetShortTermGain, 'parent net short-term gain').negated()));
  const totals = { grossInvestmentIncome, qualifiedDividendsIncluded, netGainFromInvestmentProperty, netCapitalGainFromInvestmentProperty };
  for (const [key, expected] of Object.entries(totals)) {
    if (!amount(input[key as keyof typeof totals], key).eq(expected)) throw new Error(`Form4952 ${key} must reconcile to the actual parent and child sources once`);
  }
  const audit = new AuditTrail(), form = context === 'amt' ? 'Form 4952 AMT child sources' : 'Form 4952 child sources';
  audit.record(form, '4a', 'Source-bound combined investment income', grossInvestmentIncome,
    'Signed actual parent income excluding children + computed child ordinary/qualified income + actual AMT child preference when applicable');
  audit.record(form, '4b', 'Source-bound combined qualified dividends', qualifiedDividendsIncluded, 'Parent qualified dividends + computed child line9 once');
  audit.record(form, '4d', 'Source-bound combined investment gain', netGainFromInvestmentProperty, 'Signed parent investment gain + computed child line10 before floor/rounding');
  audit.record(form, '4e', 'Source-bound combined net capital gain', netCapitalGainFromInvestmentProperty, 'Signed parent long-term gain + child line10 - parent short-term loss; final4952 floor/limit applies');
  return { ...totals, lines: audit.getLines() };
}
