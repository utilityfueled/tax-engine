import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { syntheticChildElection } from './form-8814-election.js';

/** Explicit synthetic sources, including known zeros; never application defaults. */
export function syntheticChildInvestmentInput(year = 2025) {
  const child = {
    taxableInterest: '4000', taxExemptInterest: '1000', ordinaryDividends: '2000', qualifiedDividends: '0', capitalGainDistributions: '0',
    electionFacts: { ...syntheticChildElection(year), incomeCharacter: {
      sourceReference: 'Synthetic child income source', alaskaPermanentFundDividends: '2000', collectiblesGain: '0', unrecapturedSection1250Gain: '0', section1202Gain: '0',
    } },
    amtSources: { taxYear: year, allStatementsConfirmed: true, statements: [
      { sourceId: 'child-pab', form: '1099-INT', taxExemptInterest: '1000', specifiedPrivateActivityBondInterest: '1000' },
    ], otherwiseAllowableDeduction: '200', deductionSourceReference: 'Synthetic allowed bond deduction', deductionAllowanceAndNoDuplicationConfirmed: true },
  };
  const worksheet = {
    sourceTaxYear: year, sourceReference: 'Synthetic completed investment worksheet', sourceFactsConfirmed: true,
    investmentInterestExpense: '5000', priorYearDisallowed: '0', grossInvestmentIncome: '2200', qualifiedDividendsIncluded: '0',
    netGainFromInvestmentProperty: '0', netCapitalGainFromInvestmentProperty: '0', electedPreferentialIncome: '0', investmentExpenses: '0',
    childIncomeSources: {
      sourceTaxYear: year, sourceReference: 'Synthetic parent and child source partition', sourceFactsConfirmed: true, parentSourcesExcludeAllChildrenConfirmed: true,
      parentGrossInvestmentIncome: '0', parentQualifiedDividends: '0', parentNetInvestmentGain: '0', parentNetLongTermGain: '0', parentNetShortTermGain: '0',
      children: [{ sourceId: 'form8814:0', sourceTaxYear: year, sourceReference: 'Synthetic original child source',
        firstName: child.electionFacts.child.firstName, lastName: child.electionFacts.child.lastName,
        dateOfBirth: child.electionFacts.child.dateOfBirth, ssnLast4: child.electionFacts.child.ssn.slice(-4) }],
    },
  };
  const parsed = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    deductionElection: 'itemized', form8814: [child], form4952: worksheet, form4952Amt: { ...worksheet, grossInvestmentIncome: '3000' },
  });
  const regular = parsed.form4952, alternative = parsed.form4952Amt, electedChild = parsed.form8814?.[0];
  if (!regular?.childIncomeSources || !alternative?.childIncomeSources || !electedChild?.electionFacts?.incomeCharacter) {
    throw new Error('Synthetic complete child investment source fixture was lost during parsing');
  }
  return { ...parsed, form4952: { ...regular, childIncomeSources: regular.childIncomeSources },
    form4952Amt: { ...alternative, childIncomeSources: alternative.childIncomeSources },
    form8814: [{ ...electedChild, electionFacts: { ...electedChild.electionFacts, incomeCharacter: electedChild.electionFacts.incomeCharacter } }],
  };
}
