import { guidedPrincipalResidenceState } from './guided-cod-principal-residence';
import { actualGuidedNolSources } from './guided-net-operating-loss';
import { actualCurrentLossOrigin } from './guided-current-loss-origin';
import { completeBusinessSection } from '../guided-interview/complete-facts';

/** Actual fictional activity and independently supplied known-empty histories. */
export function guidedPrincipalResidenceCurrentOriginState() {
  const state=guidedPrincipalResidenceState(),personal=state.sectionData['personal-info'];
  if(!personal)throw Error('Missing original fictional household');
  state.segmentation.incomeTypes=['self-employment'];
  state.segmentation.lifeEvents=[...state.segmentation.lifeEvents,'current-year-loss','net-operating-loss'];
  const prior=structuredClone(actualGuidedNolSources);
  prior.primaryName=`${personal.firstName} ${personal.lastName}`;prior.primaryTaxpayerIdLast4=personal.ssn.replace(/-/g,'').slice(-4);
  prior.vintages=[];if(!prior.alternativeTax)throw Error('Missing independent original AMT history');prior.alternativeTax.vintages=[];
  return {...state,sectionData:{...state.sectionData,
    'income-self-employment':{...structuredClone(completeBusinessSection),
      expenses:{...completeBusinessSection.expenses,otherExpenses:'100000'},
      businessFacts:{...completeBusinessSection.businessFacts,businessName:'Actual active sole proprietorship'}},
    adjustments:{...state.sectionData.adjustments,netOperatingLossSources:prior,
      currentLossOrigin:{...structuredClone(actualCurrentLossOrigin),cancelledDebtIncluded:true}},
  }};
}
