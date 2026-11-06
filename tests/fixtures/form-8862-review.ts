import { simpleW2Fixture } from './simple-w2.js';
import { known, source } from './form-8862.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
export function form8862ReviewInput(current = source()) {
  const input = structuredClone(simpleW2Fixture);
  input.taxpayer = { ...input.taxpayer, ...current.taxpayer }; input.standardDeductionFacts = current.standardDeductionFacts;
  input.w2s[0] = { ...known(input.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' };
  input.eic = { ...current.eic, primaryIsFullTimeStudent: false, recertificationSources: current.sources };
  return TaxYearInputSchema.parse(input);
}
