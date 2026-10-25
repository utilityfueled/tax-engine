import type { InvestmentInterestSourceData } from '../../apps/web/src/lib/guided-investment-interest';
import { actualGuidedChild } from './guided-child-election';

export const investmentInterestChild = { ...actualGuidedChild,
  taxableInterest: '4000', taxExemptInterest: '1000', ordinaryDividends: '2000',
  alaskaDividendPresent: true, alaskaPermanentFundDividends: '2000', incomeCharacterSourceReference: 'Actual Alaska record',
  amtStatements: [{ sourceId: 'child-pab', form: '1099-INT' as const, taxExemptInterest: '1000', specifiedPrivateActivityBondInterest: '1000' }],
  otherwiseAllowableDeduction: '200', deductionSourceReference: 'Actual allowed bond deduction', deductionAllowanceAndNoDuplicationConfirmed: true,
};
const regular = {
  sourceTaxYear: '2025', sourceReference: 'Actual completed investment worksheet', sourceFactsConfirmed: true,
  investmentInterestExpense: '5000', priorYearDisallowed: '0', grossInvestmentIncome: '2200', qualifiedDividendsIncluded: '0',
  netGainFromInvestmentProperty: '0', netCapitalGainFromInvestmentProperty: '0', electedPreferentialIncome: '0', investmentExpenses: '0',
  childIncomeSources: {
    sourceTaxYear: '2025', sourceReference: 'Actual parent and child partition', sourceFactsConfirmed: true, parentSourcesExcludeAllChildrenConfirmed: true,
    parentGrossInvestmentIncome: '0', parentQualifiedDividends: '0', parentNetInvestmentGain: '0', parentNetLongTermGain: '0', parentNetShortTermGain: '0',
    children: [{ sourceId: 'form8814:0', sourceTaxYear: '2025', sourceReference: 'Actual child source', firstName: 'Casey', lastName: 'Example', dateOfBirth: '2012-05-10', ssnLast4: '6701' }],
  },
};
export const actualInvestmentInterestSources: InvestmentInterestSourceData = {
  regular: structuredClone(regular), amt: { ...structuredClone(regular), grossInvestmentIncome: '3000' },
};
