/** Supported hypothetical-credit cohort. Spec: foreign-tax-deduction-carryover.yaml. */
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { hasCompleteEmptyForeignNolSources } from './empty-nol-foreign-sources.js';
import { calculateCodNolReduction } from './cod-nol-reductions.js';

/** Validate the original source record before creating a private hypothetical copy. */
export function validateForeignTaxDeductionScope(input: TaxYearInput): void {
  if (!input.foreignTaxElection?.deductionYearCarryover) return;
  const hasDebt = input.form1099C.length > 0 || input.codExclusion !== undefined || input.form982NolSources !== undefined;
  if (hasDebt) {
    if (!hasCompleteEmptyForeignNolSources(input)) throw new Error('Foreign deduction-year COD requires complete empty original NOL histories');
    const exclusion = calculateCodNolReduction(input);
    if (!exclusion.sourceFactsVerified || !exclusion.sourceExcludedAmount.eq(input.form1099C.reduce((total, row) => total.plus(d(row.amountDischarged)), d('0')))) {
      throw new Error('Foreign deduction-year COD requires the actual fully excluded original debt');
    }
  }
  if (input.qofDispositionFacts?.investments?.length) throw new Error('Foreign deduction-year carryover does not cover QOF capital sources');
  const unsupportedArrays: (keyof TaxYearInput)[] = [
    'form1099B', 'form1099DA', 'form1099Nec', 'form1099Misc', 'form1099G',
    'form1099OID', 'formW2G', 'form1099K', 'form1099Q', 'form1099R',
    'form1099SA', 'formSSA1099', 'formRRB1099', 'scheduleK1', 'scheduleK1Form1041',
    'form1095A', 'rentalProperties', 'savingsBondRedemptions', 'form6252', 'form8814',
    'homeSales', 'form8824',
  ];
  const unsupportedObjects: (keyof TaxYearInput)[] = [
    'scheduleC', 'scheduleF', 'form2555', 'form8615', 'scheduleJ', 'form8915F',
    'form6781', 'form4797', 'form4684', 'form461', 'form7206', 'form8962', 'form8936',
    'cryptoIncome', 'dependentCareBenefits', 'form8839',
  ];
  if (unsupportedArrays.some(key => Array.isArray(input[key]) && input[key].length > 0)
    || unsupportedObjects.some(key => input[key] !== undefined)
    || input.form1099Div.some(source => !d(source.qualifiedDividends).isZero()
      || !d(source.totalCapitalGainDistributions).isZero())
    || !d(input.priorYear?.nolCarryforward).isZero()
    || !d(input.priorYear?.excessBusinessLossNOL).isZero()
    || !d(input.priorYear?.shortTermCapitalLoss).isZero()
    || !d(input.priorYear?.longTermCapitalLoss).isZero()
    || input.foreignTaxElection.sources?.some(source => !d(source.taxOnExcludedIncome).isZero())) {
    throw new Error('Foreign carryover ordinary method requires separate capital, excluded-income, loss, business, Marketplace or special-tax source coordination');
  }
}
