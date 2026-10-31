/** Spec: spec/federal/current-minimum-tax-credit-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { readCurrentMinimumTaxCreditSources } from '@/utils/current-minimum-tax-credit-source.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';
import { calculateForm8801, type Form8801Result, type Form8801SourceYearResult } from './form-8801.js';
import type { Form6251Result } from './form-6251.js';

export interface CurrentMinimumTaxCreditResult {
  sourceFactsVerified: true; sourceTaxYear: number; sourceCalculation: Form8801SourceYearResult;
  currentCreditAvailable: Decimal; currentCreditUsed: Decimal; currentFormCarry: Decimal;
  signedCurrentAdjustment: Decimal; followingYearPool: Decimal; lines: CalculatedLine[];
}
export function calculateCurrentMinimumTaxCredit(input: TaxYearInput, context: {
  form6251: Form6251Result; form8801?: Form8801Result; otherAdjustmentComponents: Decimal[];
}): CurrentMinimumTaxCreditResult | undefined {
  const facts = readCurrentMinimumTaxCreditSources(input, input);
  if (!facts) return undefined;
  const { form6251, form8801 } = context;
  if (form8801 && form8801.sourceFactsVerified !== true) throw new Error('Current MTC source requires the actual verified prior sources for the current full8801');
  const line = (number: string, optional = false) => {
    const rows = form6251.lines.filter(row => row.form === 'Form 6251' && row.line === number);
    if (rows.length > 1 || (!optional && rows.length !== 1)) throw new Error(`Current MTC source requires the unique canonical6251 line${number}`);
    return rows[0]?.value ?? d('0');
  };
  if (!context.otherAdjustmentComponents.every(value => value.isFinite() && value.isZero()) || !form6251.otherAdjustments.isZero()) {
    throw new Error('Current MTC source requires the separate original method for every other adjustment component');
  }
  const same = (actual: Decimal, expected: Decimal, label: string) => {
    if (!actual.eq(expected)) throw new Error(`Current MTC source ${label} must reconcile with canonical6251`);
  };
  same(sumSourceMoney(...facts.k1Statements!.map(row => d(row.depreciationAdjustment))), form6251.depreciationAdjustment, 'depreciation originals');
  same(sumSourceMoney(...facts.k1Statements!.map(row => d(row.dispositionAdjustment))), form6251.dispositionAdjustment, 'disposition originals');
  same(sumSourceMoney(...facts.k1Statements!.map(row => d(row.depletionAdjustment))), form6251.depletionAdjustment, 'depletion originals');
  const sourceCalculation = calculateForm8801({
    sourceYear: input.taxpayer.taxYear as 2025 | 2026, sourceFactsConfirmed: true, sourceFactsComplete: true,
    priorYearFilingStatus: input.taxpayer.filingStatus,
    priorYearForm6251Line1And2e: sumSourceMoney(line('1b'), line('2e', true)),
    priorYearExclusionItemAdjustments: sumSourceMoney(...['2a', '2b', '2c', '2d', '2g', '2h'].map(number => line(number, !['2a', '2g'].includes(number)))),
    priorYearMinimumTaxCreditNOLDeduction: d('0'), priorYearMinimumTaxForeignTaxCredit: d('0'),
    priorYearForm6251Line10: line('10'), priorYearAMT: form6251.amt,
    priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
  }, { sourceYearOnly: true });
  const currentCreditAvailable = form8801?.totalAvailableCredit ?? d('0'), currentCreditUsed = form8801?.creditAllowed ?? d('0');
  const currentFormCarry = form8801?.carryforwardToNextYear ?? d('0');
  if (!sumSourceMoney(currentCreditAvailable, currentCreditUsed.negated()).eq(currentFormCarry)) throw new Error('Current MTC source full current8801 available/use/carry must reconcile');
  const signedCurrentAdjustment = sourceCalculation.minTaxCreditFromSourceYear;
  const followingYearPool = Decimal.max(0, sumSourceMoney(currentFormCarry, signedCurrentAdjustment));
  const audit = new AuditTrail();
  audit.record('Current Minimum Tax Credit Sources', 'signed-current', 'Signed current-year minimum tax credit adjustment', signedCurrentAdjustment,
    'Actual canonical6251 AMT less independently calculated exclusion-only minimum tax; no current-year use');
  audit.record('Current Minimum Tax Credit Sources', 'following-pool', 'Minimum tax credit before next-year attribute reduction', followingYearPool,
    'max(0, current full8801line26 plus signed current-source18); no allocation to prior-source vintages',
    { 'Current Form8801 carry': currentFormCarry, 'Signed current adjustment': signedCurrentAdjustment });
  return { sourceFactsVerified: true, sourceTaxYear: input.taxpayer.taxYear, sourceCalculation,
    currentCreditAvailable, currentCreditUsed, currentFormCarry, signedCurrentAdjustment, followingYearPool,
    lines: [...sourceCalculation.lines, ...audit.getLines()] };
}
