/** Actual child income character. Spec: spec/federal/form-8814-income-character.yaml. */
import type { Form8814ChildInput } from '@/models/inputs.js';
import type { YearConstants } from '@/models/constants.js';
import { d, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateForm8814 } from './form-8814.js';

export function calculateForm8814IncomeCharacter(inputs: Form8814ChildInput[], constants: YearConstants) {
  const audit = new AuditTrail();
  const amount = (value: string | undefined) => {
    if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Form8814 requires actual nonnegative income character amounts, including known zero.');
    return d(value);
  };
  const children = inputs.map((input, index) => {
    const facts = input.electionFacts, character = facts?.incomeCharacter;
    if (!facts || facts.taxYear !== constants.taxYear || facts.sourceFactsConfirmed !== true || !character?.sourceReference?.trim()) throw new Error('Form8814 requires actual confirmed income character sources for its election year.');
    const alaska = amount(character.alaskaPermanentFundDividends);
    const collectibles = amount(character.collectiblesGain);
    const section1250 = amount(character.unrecapturedSection1250Gain);
    const section1202 = amount(character.section1202Gain);
    if (alaska.gt(amount(input.ordinaryDividends).minus(amount(input.qualifiedDividends)))) throw new Error('Form8814 Alaska source must be a nonqualified subset of actual line2a.');
    const capital = amount(input.capitalGainDistributions);
    if (sum(collectibles, section1250, section1202).gt(capital)) throw new Error('Form8814 special capital subsets exceed actual line3.');
    if (section1202.gt(0)) throw new Error('Form8814 section1202 requires its actual acquisition and issuer exclusion method.');
    const result = calculateForm8814(input, constants);
    if (!result.applies) throw new Error('Form8814 income character requires income within the election range.');
    const alaskaIncomeToReport = roundDollar(result.line6.times(alaska).div(result.line4));
    const ordinaryInvestmentIncome = zeroFloor(result.otherIncomeToReport.minus(alaskaIncomeToReport));
    const collectiblesGain = capital.isZero() ? d('0') : roundDollar(result.capitalGainsToReport.times(collectibles).div(capital));
    const unrecapturedSection1250Gain = capital.isZero() ? d('0') : roundDollar(result.capitalGainsToReport.times(section1250).div(capital));
    const grossInvestmentIncomeFor4952 = ordinaryInvestmentIncome.plus(result.qualifiedDividendsToReport);
    for (const [line, description, value, formula] of [
      ['alaska', 'Child Alaska income included on parent return', alaskaIncomeToReport, 'round(child line6 * actual Alaska subset / child line4); already in line12'],
      ['ordinary-investment', 'Child ordinary investment income', ordinaryInvestmentIncome, 'Child line12 minus allocated Alaska amount; Form8960line7 and Form4952 source worksheet'],
      ['4952-income', 'Child gross investment income for4952', grossInvestmentIncomeFor4952, 'Ordinary investment income plus child qualified dividends; included once in the completed actual worksheet'],
      ['collectibles', 'Child collectibles gain reported on parent return', collectiblesGain, 'round(child line10 * actual collectibles / child line3)'],
      ['1250', 'Child unrecaptured1250 gain reported on parent return', unrecapturedSection1250Gain, 'round(child line10 * actual unrecaptured1250 / child line3)'],
    ] as const) audit.record('Form8814 income character', `${index + 1}:${line}`, description, value, formula);
    return { alaskaIncomeToReport, ordinaryInvestmentIncome, grossInvestmentIncomeFor4952, collectiblesGain, unrecapturedSection1250Gain,
      capitalGainDistributionsToReport: result.capitalGainsToReport, line12: result.otherIncomeToReport };
  });
  return { children, ordinaryInvestmentIncome: sum(...children.map(child => child.ordinaryInvestmentIncome)),
    grossInvestmentIncomeFor4952: sum(...children.map(child => child.grossInvestmentIncomeFor4952)),
    collectiblesGain: sum(...children.map(child => child.collectiblesGain)),
    unrecapturedSection1250Gain: sum(...children.map(child => child.unrecapturedSection1250Gain)), lines: audit.getLines() };
}
