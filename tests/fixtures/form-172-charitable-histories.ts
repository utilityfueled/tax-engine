import { currentCharitableOriginInput } from './form-172-charitable-origin';
import { priorCharitableNolInput } from './charitable-prior-nol';

/** Fictional actual income, original gifts and independent records; no computed allowance. */
export function currentOriginCharitableHistoriesInput(year=2025) {
  const input=currentCharitableOriginInput(year===2026?'C':'A',year);
  const prior=priorCharitableNolInput(year===2026
    ?{category:'cash_60',medium:'cash',regular:'1000',alternative:'500'}
    :{regular:'5000',alternative:'500'});
  input.donations[0].amount=year===2026?'4000':'1000';
  input.donations[0].costBasis=year===2026?'2000':'1000';
  input.charitableCarryoverSources=prior.charitableCarryoverSources;
  if(!input.netOperatingLoss?.alternativeTax)throw new Error('Missing fictional independent loss history');
  input.netOperatingLoss.alternativeTax.charitableCarryoverHistory=prior.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if(year===2026) {
    const history=input.netOperatingLoss.alternativeTax.charitableCarryoverHistory;
    if(!history?.alternativeCarryoverSources || !input.charitableCarryoverSources)throw new Error('Missing fictional original charity histories');
    history.sourceTaxYear=2025;
    for(const packet of [input.charitableCarryoverSources,history.alternativeCarryoverSources]) {
      packet.sourceTaxYear=2026;
      for(const row of packet.vintages ?? []) {
        row.adjustedThroughTaxYear=2025;
        row.history.push({taxYear:2025,treatedAsPaid:'0',nolReduction:'0',sourceReference:'Synthetic actual no-use year'});
      }
    }
  }
  return input;
}
