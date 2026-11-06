import { currentCharitableOriginInput } from './form-172-charitable-origin.js';
import { cryptoCharitableNolInput, k1CharitableNolInput } from './charitable-original-source-nol.js';
import { priorCharitableNolInput } from './charitable-prior-nol.js';

/** Fictional original facts; no calculated deduction or loss supplied. */
export function originalCharitableOriginInput(kind: 'crypto' | 'partnership' | 's_corporation', year = 2025) {
  const input = currentCharitableOriginInput('C', year);
  const source = kind === 'crypto' ? cryptoCharitableNolInput(year) : k1CharitableNolInput(year, false, kind === 's_corporation');
  input.donations = [];
  if (kind === 'crypto') input.cryptoIncome = source.cryptoIncome;
  else { input.scheduleK1 = source.scheduleK1; input.k1CharitableSources = source.k1CharitableSources; }
  return input;
}

export function priorCharitableOriginInput() {
  const input = currentCharitableOriginInput('C');
  const sources = priorCharitableNolInput({ regular: '50000', alternative: '1000' });
  input.donations = [];
  input.charitableCarryoverSources = sources.charitableCarryoverSources;
  if (!input.netOperatingLoss?.alternativeTax) throw Error('Missing fictional independent history');
  input.netOperatingLoss.alternativeTax.charitableCarryoverHistory = sources.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  return input;
}
