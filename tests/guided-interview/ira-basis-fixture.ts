import { ordinaryIraBasisFixture } from '../fixtures/ira-basis';
import { completePersonalInfo, completeRetirementSource, completeW2Entry, startCompleteInterview } from './complete-facts';
import type { GuidedIraBasisData } from '@/lib/guided-ira-basis';

/** Explicit synthetic records, independent of the application collector defaults. */
export function guidedIraBasisFixture() {
  const source = ordinaryIraBasisFixture();
  const basis: GuidedIraBasisData = {
    ...source.iraBasisSources, sourceTaxYear: '2025',
    owners: source.iraBasisSources.owners.map(owner => ({ ...owner,
      basisHistory: { ...owner.basisHistory, sourceTaxYear: '2024' },
      accounts: owner.accounts.map(account => ({ ...account, sourceTaxYear: '2025' })),
    })),
    distributions: source.iraBasisSources.distributions.map(row => ({ ...row, sourceTaxYear: '2025', taxableAmount: '' })),
  };
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages', 'retirement'], lifeEvents: [], stateCode: null });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo), ...source.taxpayer.primary,
    spouse: { ...completePersonalInfo.spouse!, ...source.taxpayer.spouse } };
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '85000', federalWithheld: '10000',
    socialSecurityWages: '85000', socialSecurityWithheld: '5270', medicareWages: '85000', medicareWithheld: '1232.50' }] };
  state.sectionData['income-retirement'] = { basisSources: basis, entries: source.form1099R.map(form => ({ ...completeRetirementSource,
    payer: form.payer, payerTin: form.payerTin, accountReference: form.accountReference, accountHolder: form.accountHolder,
    grossDistribution: form.grossDistribution, taxableAmount: '', isIraSepSimple: true, taxableAmountNotDetermined: true,
    taxableAmountConfirmed: null, iraBasisConfirmedZero: false, additionalWorksheetRequired: true, otherRetirementWorksheetRequired: false,
  })) };
  return state;
}
